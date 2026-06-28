import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { app } from '../app.ts';
import { printf } from './util/printf.ts';

const GLOBAL_MODULE_DIR = path.join(os.homedir(), '.magic', 'magic-module');
const GLOBAL_LOCK_FILE = 'global-lock.json';

export interface ModuleInfo {
	name: string;
	version: string;
	versions: string[];
	source: string;
	installed: string;
	updated: string;
	repo: string;
	user: string;
}

export interface GlobalLock {
	modules: Record<string, ModuleInfo>;
}

function ensureGlobalDir(): string {
	if (!fs.existsSync(GLOBAL_MODULE_DIR)) {
		fs.mkdirSync(GLOBAL_MODULE_DIR, { recursive: true });
	}
	return GLOBAL_MODULE_DIR;
}

export function getGlobalLockPath(): string {
	return path.join(GLOBAL_MODULE_DIR, GLOBAL_LOCK_FILE);
}

function loadGlobalLock(): GlobalLock {
	const lockPath = getGlobalLockPath();
	if (fs.existsSync(lockPath)) {
		try {
			return JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
		} catch {
			printf.outFile.error(`global-lock.json 损坏,将重新创建`);
		}
	}
	return { modules: {} };
}

function saveGlobalLock(lock: GlobalLock): void {
	ensureGlobalDir();
	const lockPath = getGlobalLockPath();
	fs.writeFileSync(lockPath, JSON.stringify(lock, null, '\t'));
}

export function parseModuleSource(source: string): {
	user: string;
	repo: string;
	version: string | null;
} | null {
	const clean = source.startsWith('@') ? source.substring(1) : source;
	const parts = clean.split(':');
	const namePart = parts[0];
	const versionPart = parts.length > 1 ? parts[1] : null;
	const nameSegments = namePart.split('/');
	if (nameSegments.length !== 2 || !nameSegments[0] || !nameSegments[1]) return null;
	return { user: nameSegments[0], repo: nameSegments[1], version: versionPart || null };
}

function parseSemVer(v: string): { major: number; minor: number; patch: number } {
	const cleaned = v.replace(/^v/, '');
	const parts = cleaned.split('.');
	return {
		major: parseInt(parts[0], 10) || 0,
		minor: parseInt(parts[1], 10) || 0,
		patch: parseInt(parts[2], 10) || 0
	};
}

function compareSemVer(a: string, b: string): number {
	const av = parseSemVer(a);
	const bv = parseSemVer(b);
	if (av.major !== bv.major) return av.major - bv.major;
	if (av.minor !== bv.minor) return av.minor - bv.minor;
	return av.patch - bv.patch;
}

async function fetchLatestVersion(user: string, repo: string): Promise<string | null> {
	for (const branch of ['main', 'master']) {
		const url = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/build.toml`;
		try {
			const response = await fetch(url);
			if (response.status !== 200) continue;
			const tomlText = await response.text();
			const toml = Bun.TOML.parse(tomlText) as Record<string, unknown>;
			const cfg = (toml as Record<string, Record<string, string>>).config;
			if (cfg?.version) return cfg.version;
		} catch { /* try next branch */ }
	}
	return null;
}

export async function getModuleInfo(repo: string, user: string): Promise<ModuleInfo | null> {
	const lock = loadGlobalLock();
	return lock.modules[`${user}/${repo}`] || null;
}

function getModuleInfoPath(user: string, repo: string): string {
	return path.join(GLOBAL_MODULE_DIR, `${user}_${repo}.info.json`);
}

export function loadModuleInfoFile(user: string, repo: string): ModuleInfo | null {
	const infoPath = getModuleInfoPath(user, repo);
	if (!fs.existsSync(infoPath)) return null;
	try {
		return JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
	} catch {
		return null;
	}
}

function saveModuleInfoFile(info: ModuleInfo): void {
	ensureGlobalDir();
	const infoPath = getModuleInfoPath(info.user, info.repo);
	fs.writeFileSync(infoPath, JSON.stringify(info, null, '\t'));
}

export async function registerGlobalModule(
	user: string,
	repo: string,
	version: string,
	source: string,
	moduleDir: string
): Promise<void> {
	const lock = loadGlobalLock();
	const key = `${user}/${repo}`;
	const now = new Date().toISOString();

	const existing = lock.modules[key];
	if (existing) {
		if (!existing.versions.includes(version)) {
			existing.versions.push(version);
			existing.versions.sort((a, b) => compareSemVer(b, a));
		}
		existing.updated = now;
		existing.source = source;
	} else {
		lock.modules[key] = {
			name: repo,
			version,
			versions: [version],
			source,
			installed: now,
			updated: now,
			repo,
			user
		};
	}

	saveGlobalLock(lock);

	const info = lock.modules[key];
	saveModuleInfoFile(info);

	const moduleDestDir = path.join(GLOBAL_MODULE_DIR, repo);
	if (moduleDir && fs.existsSync(moduleDir) && !fs.existsSync(moduleDestDir)) {
		fs.cpSync(moduleDir, moduleDestDir, { recursive: true });
	}
}

export async function removeGlobalModule(user: string, repo: string): Promise<void> {
	const lock = loadGlobalLock();
	const key = `${user}/${repo}`;
	if (!lock.modules[key]) {
		throw new Error(`全局模块 "${key}" 未安装`);
	}

	delete lock.modules[key];
	saveGlobalLock(lock);

	const infoPath = getModuleInfoPath(user, repo);
	if (fs.existsSync(infoPath)) fs.unlinkSync(infoPath);

	const moduleDir = path.join(GLOBAL_MODULE_DIR, repo);
	if (fs.existsSync(moduleDir)) fs.rmSync(moduleDir, { recursive: true, force: true });

	printf.outFile.info(`全局模块 "${key}" 已移除`);
}

export async function updateGlobalModule(user: string, repo: string): Promise<void> {
	const lock = loadGlobalLock();
	const key = `${user}/${repo}`;
	const existing = lock.modules[key];
	if (!existing) throw new Error(`全局模块 "${key}" 未安装`);

	const latestVersion = await fetchLatestVersion(user, repo);
	if (!latestVersion) throw new Error(`无法获取模块 "${key}" 的最新版本信息`);

	const cmp = compareSemVer(latestVersion, existing.version);
	if (cmp <= 0) {
		printf.outFile.info(`模块 "${key}" 已是最新版本 (v${existing.version})`);
		return;
	}

	if (!existing.versions.includes(latestVersion)) {
		existing.versions.push(latestVersion);
		existing.versions.sort((a, b) => compareSemVer(b, a));
	}
	existing.version = latestVersion;
	existing.updated = new Date().toISOString();

	saveGlobalLock(lock);
	saveModuleInfoFile(existing);

	printf.outFile.info(`模块 "${key}" 更新成功: v${existing.versions[existing.versions.length - 1]} → v${latestVersion}`);
}

export async function listModules(options: { global?: boolean; local?: boolean }): Promise<void> {
	const global = options.global !== false;
	const local = options.local !== false;

	if (global) {
		const lock = loadGlobalLock();
		const keys = Object.keys(lock.modules);
		if (keys.length === 0) {
			printf.outFile.info(`[全局] 没有已安装的模块`);
		} else {
			printf.outFile.info(`[全局模块] ${GLOBAL_MODULE_DIR}`);
			keys.forEach((key) => {
				const m = lock.modules[key];
				const versionsStr = m.versions.join(', ');
				printf.outFile.info(`    ${key}  v${m.version}  [${versionsStr}]  ${m.source}`);
			});
		}
	}

	if (local) {
		const localLockPath = path.join(app.project.dir, 'magic-lock.json');
		if (fs.existsSync(localLockPath)) {
			try {
				const localLock = JSON.parse(fs.readFileSync(localLockPath, 'utf-8'));
				const localKeys = Object.keys(localLock.modules || {});
				if (localKeys.length === 0) {
					printf.outFile.info(`[本地] 没有已安装的模块`);
				} else {
					printf.outFile.info(`[本地模块] ${app.project.dir}`);
					localKeys.forEach((key: string) => {
						const m = localLock.modules[key];
						printf.outFile.info(`    ${key}  v${m.version}  ${m.source}`);
					});
				}
			} catch {
				printf.outFile.info(`[本地] magic-lock.json 格式错误`);
			}
		} else {
			printf.outFile.info(`[本地] 没有已安装的模块`);
		}
	}
}

export async function viewModule(user: string, repo: string): Promise<void> {
	const lock = loadGlobalLock();
	const key = `${user}/${repo}`;
	const globalInfo = lock.modules[key];

	const infoFile = loadModuleInfoFile(user, repo);

	if (!globalInfo && !infoFile) {
		printf.outFile.info(`模块 "${key}" 未在全局安装`);
		return;
	}

	const info = (infoFile || globalInfo) as ModuleInfo;

	printf.outFile.info(`
模块: ${key}
版本: v${info.version}
全部版本: ${info.versions.map((v) => 'v' + v).join(', ')}
来源: ${info.source}
安装时间: ${info.installed}
更新时间: ${info.updated}
全局路径: ${path.join(GLOBAL_MODULE_DIR, repo)}
`);
}

export async function outdatedModules(): Promise<void> {
	const lock = loadGlobalLock();
	const keys = Object.keys(lock.modules);
	if (keys.length === 0) {
		printf.outFile.info(`没有已安装的模块`);
		return;
	}

	let hasOutdated = false;

	for (const key of keys) {
		const m = lock.modules[key];
		const latest = await fetchLatestVersion(m.user, m.repo);
		if (latest && compareSemVer(latest, m.version) > 0) {
			hasOutdated = true;
			printf.outFile.info(`[过期] ${key}: v${m.version} → v${latest}`);
		}
	}

	if (!hasOutdated) {
		printf.outFile.info(`所有模块均为最新版本`);
	}
}

export function removeLocalModule(moduleName: string): void {
	const moduleDir = path.join(app.project.dir, 'magic_module', moduleName);
	const lockPath = path.join(app.project.dir, 'magic-lock.json');

	if (!fs.existsSync(moduleDir)) {
		throw new Error(`本地模块 "${moduleName}" 不存在`);
	}

	fs.rmSync(moduleDir, { recursive: true, force: true });

	if (fs.existsSync(lockPath)) {
		try {
			const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
			if (lock.modules?.[moduleName]) {
				delete lock.modules[moduleName];
				fs.writeFileSync(lockPath, JSON.stringify(lock, null, '\t'));
			}
		} catch {
			printf.outFile.error(`magic-lock.json 损坏,已跳过更新`);
		}
	}

	printf.outFile.info(`本地模块 "${moduleName}" 已移除`);
}
