import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { app } from '../app.ts';
import { printf } from './util/printf.ts';
import { ProjectBuildConfig, ProjectBuildConfigContrast } from './util/config-validate.ts';
import { parseModuleSource, registerGlobalModule, loadModuleInfoFile } from './module-manager.ts';

const MODULE_DIR = 'magic_module';
const LOCK_FILE = 'magic-lock.json';

interface ModuleLockEntry {
	name: string;
	version: string;
	source: string;
	installed: string;
}

interface ModuleLock {
	modules: Record<string, ModuleLockEntry>;
}

function loadLockFile(): ModuleLock {
	const lockPath = path.join(app.project.dir, LOCK_FILE);
	if (fs.existsSync(lockPath)) {
		try {
			return JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
		} catch {
			printf.outFile.error(`${LOCK_FILE} 损坏,将重新创建`);
		}
	}
	return { modules: {} };
}

function saveLockFile(lock: ModuleLock): void {
	const lockPath = path.join(app.project.dir, LOCK_FILE);
	fs.writeFileSync(lockPath, JSON.stringify(lock, null, '\t'));
}

function updateLockFile(moduleName: string, version: string, source: string): void {
	const lock = loadLockFile();
	lock.modules[moduleName] = {
		name: moduleName,
		version,
		source,
		installed: new Date().toISOString()
	};
	saveLockFile(lock);
}

function ensureModuleDir(): string {
	const dir = path.join(app.project.dir, MODULE_DIR);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	return dir;
}

function createTempDir(): string {
	const prefix = 'magic_module_';
	const tmp = path.join(os.tmpdir(), prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
	fs.mkdirSync(tmp, { recursive: true });
	return tmp;
}

function removeDir(dir: string): void {
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function extractZip(zipPath: string, destDir: string): void {
	fs.mkdirSync(destDir, { recursive: true });

	if (os.platform() === 'win32') {
		execSync(
			`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
			{ stdio: 'pipe' }
		);
	} else {
		execSync(`unzip -o "${zipPath}" -d "${destDir}"`, {
			stdio: 'pipe'
		});
	}
}

function flattenNestedDir(dir: string): void {
	const entries = fs.readdirSync(dir);
	if (entries.length !== 1) return;

	const single = path.join(dir, entries[0]);
	if (!fs.statSync(single).isDirectory()) return;

	const tmpDir = dir + '_tmp';
	fs.renameSync(single, tmpDir);
	fs.rmdirSync(dir);
	fs.renameSync(tmpDir, dir);
}

function validateModuleToml(moduleDir: string): { name: string; version: string } {
	const tomlPath = path.join(moduleDir, 'build.toml');
	if (!fs.existsSync(tomlPath)) {
		throw new Error(`模块缺少 build.toml 配置文件`);
	}

	const tomlContent = fs.readFileSync(tomlPath, 'utf-8');

	if (tomlContent.length > 10240) {
		throw new Error(`build.toml 文件过大,可能存在异常`);
	}

	let parsedToml: Record<string, unknown>;
	try {
		parsedToml = Bun.TOML.parse(tomlContent) as Record<string, unknown>;
	} catch (e) {
		throw new Error(`build.toml 格式错误: ${e}`, { cause: e });
	}

	if (!parsedToml || typeof parsedToml !== 'object') {
		throw new Error(`build.toml 内容为空或格式不正确`);
	}

	const isModule = (parsedToml as Record<string, Record<string, unknown>>).build?.module === true;
	if (!isModule) {
		throw new Error(`build.toml 中 module 不为 true,不是有效的 Magic 模块`);
	}

	try {
		ProjectBuildConfigContrast(
			ProjectBuildConfig.base,
			parsedToml
		);
	} catch (e) {
		throw new Error(`build.toml 内容校验失败: ${e}`, { cause: e });
	}

	const config = (parsedToml as Record<string, Record<string, string>>).config;
	if (!config) {
		throw new Error(`build.toml 缺少 [config] 配置段`);
	}

	const name = config.name || '';
	const version = config.version || '';
	if (!name) {
		throw new Error(`build.toml 中 config.name 为空`);
	}

	return { name, version };
}

async function downloadToTemp(zipUrl: string, tempDir: string): Promise<string> {
	const response = await fetch(zipUrl);
	if (response.status !== 200) {
		throw new Error(`下载失败: HTTP ${response.status}`);
	}

	const zipBuffer = new Uint8Array(await response.arrayBuffer());
	if (zipBuffer.length === 0) {
		throw new Error(`下载的文件为空`);
	}
	if (zipBuffer.length > 50 * 1024 * 1024) {
		throw new Error(`模块文件过大 (超过 50MB),可能存在异常`);
	}

	const tmpZip = path.join(tempDir, 'module.zip');
	fs.writeFileSync(tmpZip, zipBuffer);
	return tmpZip;
}

async function addFromGitHub(user: string, repo: string, globalMode: boolean, targetVersion?: string | null): Promise<void> {
	printf.outFile.info(`从 GitHub 下载模块: ${user}/${repo}`);

	let branch = 'main';
	const buildTomlUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/build.toml`;
	let response = await fetch(buildTomlUrl, { method: 'HEAD' });

	if (response.status !== 200) {
		branch = 'master';
		const fallbackUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/build.toml`;
		response = await fetch(fallbackUrl, { method: 'HEAD' });
		if (response.status !== 200) {
			throw new Error(`仓库 ${user}/${repo} 不是 Magic 模块(缺少 build.toml,已尝试 main 和 master 分支)`);
		}
	}

	const tomlContent = await (await fetch(buildTomlUrl)).text();

	let parsedToml: Record<string, unknown>;
	try {
		parsedToml = Bun.TOML.parse(tomlContent) as Record<string, unknown>;
	} catch (e) {
		throw new Error(`仓库 ${user}/${repo} 的 build.toml 格式错误: ${e}`, { cause: e });
	}

	const isModule = (parsedToml as Record<string, Record<string, unknown>>).build?.module === true;
	if (!isModule) {
		throw new Error(`仓库 ${user}/${repo} 的 build.toml 中 module 不为 true,不是 Magic 模块`);
	}

	const moduleDir = globalMode ? undefined : ensureModuleDir();
	const destDir = globalMode ? undefined : path.join(moduleDir!, repo);

	if (!globalMode && destDir && fs.existsSync(destDir)) {
		throw new Error(`模块 "${repo}" 已存在于 magic_module 目录中`);
	}

	const zipUrl = `https://github.com/${user}/${repo}/archive/refs/heads/${branch}.zip`;
	const tempDir = createTempDir();

	try {
		printf.outFile.info(`下载中: ${zipUrl}`);
		const tmpZip = await downloadToTemp(zipUrl, tempDir);
		const extractDir = path.join(tempDir, 'extracted');
		extractZip(tmpZip, extractDir);
		flattenNestedDir(extractDir);

		const { name, version } = validateModuleToml(extractDir);

		if (targetVersion && targetVersion !== version) {
			printf.outFile.info(`指定版本 v${targetVersion},模块实际版本 v${version}`);
		}

		if (globalMode) {
			await registerGlobalModule(user, repo, version || targetVersion || '0.0.0', `github:${user}/${repo}@${branch}`, extractDir);
			printf.outFile.info(`模块 "${repo}" (v${version}) 全局安装成功`);
		} else {
			const expectedDirName = path.basename(destDir!);
			if (name !== expectedDirName) {
				printf.outFile.info(`模块名称 "${name}" 与目录名 "${expectedDirName}" 不一致,使用模块名称`);
			}

			fs.renameSync(extractDir, destDir!);

			updateLockFile(repo, version, `github:${user}/${repo}@${branch}`);
			printf.outFile.info(`模块 "${repo}" (v${version}) 安装成功 [path:${destDir}]`);
		}
	} finally {
		removeDir(tempDir);
	}
}

function addFromLocalZip(zipPath: string): void {
	printf.outFile.info(`从本地文件添加模块: ${zipPath}`);

	const resolved = path.resolve(zipPath);
	if (!fs.existsSync(resolved)) {
		throw new Error(`文件不存在: ${resolved}`);
	}

	const ext = path.extname(resolved).toLowerCase();
	if (ext !== '.zip') {
		throw new Error(`仅支持 .zip 格式的本地模块文件`);
	}

	const stat = fs.statSync(resolved);
	if (stat.size > 50 * 1024 * 1024) {
		throw new Error(`模块文件过大 (超过 50MB)`);
	}

	const moduleName = path.basename(resolved, '.zip');
	if (!moduleName || moduleName.includes('$')) {
		throw new Error(`模块名称不合法: ${moduleName}`);
	}

	const moduleDir = ensureModuleDir();
	const destDir = path.join(moduleDir, moduleName);

	if (fs.existsSync(destDir)) {
		throw new Error(`模块 "${moduleName}" 已存在于 magic_module 目录中`);
	}

	const tempDir = createTempDir();

	try {
		const extractDir = path.join(tempDir, 'extracted');
		extractZip(resolved, extractDir);
		flattenNestedDir(extractDir);

		const { name, version } = validateModuleToml(extractDir);

		if (name !== moduleName) {
			printf.outFile.info(`模块名称 "${name}" 与文件名 "${moduleName}" 不一致,使用模块名称`);
		}

		fs.renameSync(extractDir, destDir);

		updateLockFile(moduleName, version, `file:${resolved}`);
		printf.outFile.info(`模块 "${moduleName}" (v${version}) 安装成功 [path:${destDir}]`);
	} finally {
		removeDir(tempDir);
	}
}

export async function addModule(source: string, options?: { global?: boolean }): Promise<void> {
	const globalMode = options?.global === true;

	if (!source || source.trim() === '') {
		throw new Error(`请指定模块来源
用法: magic add <模块来源> [选项]
  magic add ./module.zip                从本地 zip 文件安装
  magic add @username/repo              从 GitHub 仓库安装
  magic add @username/repo:1.0.0        安装指定版本
  magic add -g @username/repo          全局安装模块`);
	}

	if (source.startsWith('@')) {
		const parsed = parseModuleSource(source);
		if (!parsed) {
			throw new Error(`GitHub 模块格式错误,请使用: @用户名/仓库名 或 @用户名/仓库名:版本号
例如: magic add @love-sqjm/magic-ui
例如: magic add @love-sqjm/magic-ui:1.0.0`);
		}

		if (parsed.version) {
			const existing = loadModuleInfoFile(parsed.user, parsed.repo);
			if (existing && existing.versions.includes(parsed.version)) {
				throw new Error(`模块 "${parsed.user}/${parsed.repo}" 版本 v${parsed.version} 已在全局环境中安装`);
			}
		}

		await addFromGitHub(parsed.user, parsed.repo, globalMode, parsed.version);
	} else {
		if (globalMode) {
			throw new Error(`全局安装仅支持 GitHub 模块 (@username/repo 格式)`);
		}
		addFromLocalZip(source);
	}
}
