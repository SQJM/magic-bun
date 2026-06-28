import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';
import { printf } from './util/printf.ts';

interface CheckItem {
	name: string;
	path: string;
	exists: boolean;
	canFix: boolean;
	type: 'file' | 'dir';
	description: string;
}

function getProjectDir(): string {
	return app.project.dir;
}

function parseBuildToml(): { config: Record<string, string>; build: Record<string, unknown> } | null {
	const tomlPath = path.join(getProjectDir(), 'build.toml');
	if (!fs.existsSync(tomlPath)) return null;
	try {
		const content = fs.readFileSync(tomlPath, 'utf-8');
		return Bun.TOML.parse(content) as { config: Record<string, string>; build: Record<string, unknown> };
	} catch {
		return null;
	}
}

function generateMagicModuleJson(): string {
	const projectDir = getProjectDir();
	const lockPath = path.join(projectDir, 'magic-lock.json');
	const tomlConfig = parseBuildToml();

	const deps: Record<string, string> = {};

	if (fs.existsSync(lockPath)) {
		try {
			const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
			if (lock.modules) {
				for (const key in lock.modules) {
					deps[key] = lock.modules[key].version || '*';
				}
			}
		} catch { /* ignore */ }
	}

	const imports = tomlConfig?.build?.['import'] as Record<string, unknown> | undefined;
	const moduleList = imports?.module as string[] | undefined;

	if (moduleList && Array.isArray(moduleList)) {
		moduleList.forEach((m: string) => {
			if (!deps[m]) deps[m] = '*';
		});
	}

	return JSON.stringify({ modules: deps }, null, '\t') + '\n';
}

function ensureMagicModuleJson(): boolean {
	const projectDir = getProjectDir();
	const manifestPath = path.join(projectDir, 'magic-module.json');

	if (fs.existsSync(manifestPath)) return false;

	fs.writeFileSync(manifestPath, generateMagicModuleJson());
	printf.outFile.info(`已创建 magic-module.json`);
	return true;
}

function ensureLockFile(): boolean {
	const projectDir = getProjectDir();
	const lockPath = path.join(projectDir, 'magic-lock.json');

	if (fs.existsSync(lockPath)) return false;

	fs.writeFileSync(lockPath, JSON.stringify({ modules: {} }, null, '\t') + '\n');
	printf.outFile.info(`已创建 magic-lock.json`);
	return true;
}

function ensureDir(dirPath: string): boolean {
	if (fs.existsSync(dirPath)) return false;
	fs.mkdirSync(dirPath, { recursive: true });
	printf.outFile.info(`已创建目录: ${path.relative(getProjectDir(), dirPath)}`);
	return true;
}

export function completeProject(options?: { fix?: boolean }): void {
	const projectDir = getProjectDir();
	const tomlConfig = parseBuildToml();
	const autoFix = options?.fix !== false;

	if (!tomlConfig) {
		printf.outFile.error(`当前目录不是 Magic 项目 (缺少 build.toml)`);
		printf.outFile.error(`请确保在项目根目录执行此命令`);
		throw new Error(`build.toml 配置文件不存在 [path:${path.join(projectDir, 'build.toml')}]`);
	}

	const srcDir = tomlConfig.config?.src || 'app';
	const mainFile = tomlConfig.config?.main || 'index';
	const isModule = tomlConfig.build?.module === true;

	printf.outFile.info(`项目检查: ${tomlConfig.config?.name || projectDir}`);
	printf.outFile.info(`类型: ${isModule ? '模块项目' : '应用项目'}`);
	printf.outFile.info(`源码目录: ${srcDir}`);
	if (autoFix) printf.outFile.info(`自动修复: 已启用`);

	const checks: CheckItem[] = [];

	checks.push({
		name: 'build.toml',
		path: path.join(projectDir, 'build.toml'),
		exists: true,
		canFix: false,
		type: 'file',
		description: '项目配置文件'
	});

	checks.push({
		name: 'magic-lock.json',
		path: path.join(projectDir, 'magic-lock.json'),
		exists: fs.existsSync(path.join(projectDir, 'magic-lock.json')),
		canFix: true,
		type: 'file',
		description: '模块锁定文件 (记录已安装模块)'
	});

	checks.push({
		name: 'magic-module.json',
		path: path.join(projectDir, 'magic-module.json'),
		exists: fs.existsSync(path.join(projectDir, 'magic-module.json')),
		canFix: true,
		type: 'file',
		description: '模块依赖清单 (声明项目模块依赖)'
	});

	if (!isModule) {
		const appXmlPath = path.join(projectDir, srcDir, 'app.xml');
		const entryMPath = path.join(projectDir, srcDir, mainFile + '.m');

		checks.push({
			name: 'app.xml',
			path: appXmlPath,
			exists: fs.existsSync(appXmlPath),
			canFix: true,
			type: 'file',
			description: '应用入口声明文件'
		});

		checks.push({
			name: `${mainFile}.m`,
			path: entryMPath,
			exists: fs.existsSync(entryMPath),
			canFix: true,
			type: 'file',
			description: '应用入口组件'
		});
	}

	checks.push({
		name: 'magic_module/',
		path: path.join(projectDir, 'magic_module'),
		exists: fs.existsSync(path.join(projectDir, 'magic_module')),
		canFix: true,
		type: 'dir',
		description: '本地模块安装目录'
	});

	checks.push({
		name: srcDir,
		path: path.join(projectDir, srcDir),
		exists: fs.existsSync(path.join(projectDir, srcDir)),
		canFix: true,
		type: 'dir',
		description: '源码目录'
	});

	let missing = 0;
	let fixed = 0;
	let ok = 0;

	checks.forEach((check) => {
		if (check.exists) {
			printf.outFile.info(`  [ok]     ${check.name}`);
			ok++;
		} else {
			missing++;
			if (check.canFix && autoFix) {
				let didFix = false;
				try {
					if (check.name === 'magic-lock.json') {
						didFix = ensureLockFile();
					} else if (check.name === 'magic-module.json') {
						didFix = ensureMagicModuleJson();
					} else if (check.name === 'app.xml') {
						didFix = ensureAppXml(srcDir, tomlConfig);
					} else if (check.name === `${mainFile}.m`) {
						didFix = ensureEntryM(srcDir, mainFile);
					} else if (check.type === 'dir') {
						didFix = ensureDir(check.path);
					}
				} catch (e) {
					printf.outFile.error(`  [fail]   ${check.name} - 修复失败: ${e}`);
				}
				if (didFix) {
					fixed++;
					printf.outFile.info(`  [fixed]  ${check.name} - ${check.description}`);
					return;
				}
			}
			printf.outFile.error(`  [miss]   ${check.name} - ${check.description}${check.canFix ? ' (可通过 magic complete 自动修复)' : ''}`);
		}
	});

	if (fs.existsSync(path.join(projectDir, 'magic-lock.json'))) {
		try {
			const lock = JSON.parse(fs.readFileSync(path.join(projectDir, 'magic-lock.json'), 'utf-8'));
			const moduleCount = Object.keys(lock.modules || {}).length;
			if (moduleCount > 0) {
				printf.outFile.info(`  已安装 ${moduleCount} 个本地模块`);
				for (const key in lock.modules) {
					const modDir = path.join(projectDir, 'magic_module', key);
					const modOk = fs.existsSync(modDir);
					if (!modOk) {
						missing++;
						printf.outFile.error(`  [miss]   magic_module/${key} - 模块目录缺失 (锁文件中有记录但目录不存在)`);
					}
				}
			}
		} catch { /* ignore */ }
	}

	printf.outFile.info(`\n检查完成: ${ok} 个正常, ${missing} 个缺失, ${fixed} 个已修复`);
	if (missing > 0 && !autoFix) {
		printf.outFile.info(`提示: 使用 magic complete --fix 自动修复缺失文件`);
	}
}

function ensureAppXml(srcDir: string, tomlConfig: { config: Record<string, string> }): boolean {
	const projectDir = getProjectDir();
	const appXmlPath = path.join(projectDir, srcDir, 'app.xml');
	if (fs.existsSync(appXmlPath)) return false;

	const name = tomlConfig.config?.name || 'magic';
	const content = `<app lang="zh">
    <title>${name}</title>
    <import>
    </import>
</app>
`;
	fs.mkdirSync(path.dirname(appXmlPath), { recursive: true });
	fs.writeFileSync(appXmlPath, content);
	printf.outFile.info(`已创建 app.xml`);
	return true;
}

function ensureEntryM(srcDir: string, mainFile: string): boolean {
	const projectDir = getProjectDir();
	const entryPath = path.join(projectDir, srcDir, mainFile + '.m');
	if (fs.existsSync(entryPath)) return false;

	const content = `<import root="">
</import>

<template>
    <div #id="view">
        <h1>Hello Magic!</h1>
    </div>
</template>

<script code="global">
    const { $view } = $id();
</script>

<script code="event">
</script>

<script code="component-event">
    created = () => {}
    destroy = () => {}
    visibleChange = (visible) => {}
</script>

<css scope="#id:view">
    & { padding: 16px; }
</css>
`;
	fs.mkdirSync(path.dirname(entryPath), { recursive: true });
	fs.writeFileSync(entryPath, content);
	printf.outFile.info(`已创建 ${mainFile}.m`);
	return true;
}
