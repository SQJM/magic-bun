import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { app } from '../app.ts';
import { printf } from './util/printf.ts';
import { start } from './compiler/start.ts';
import type { BuildConfig } from './types.ts';
import { MAGIC_RELOAD_PATH } from './run-project.ts';
import { closeCache } from './util/build-cache.ts';
import { runScripts, resolveScripts } from './util/run-scripts.ts';

/** 触发浏览器刷新的 GET 请求超时(毫秒). dev server 不在线时,需要快速失败以免拖慢 build */
const RELOAD_REQUEST_TIMEOUT_MS = 200;

/**
 * 通知 dev server 刷新浏览器.
 * 如果 dev server 未启动,静默忽略(在生产环境或 CI 中可能没有 dev server).
 */
function notifyDevServerReload(server: { host: string; port: number }): void {
	// IPv6 地址必须用 [] 包裹,否则 URL 非法 (如 host = "::" → "http://[::]:8088/...")
	const hostForUrl = server.host.includes(':') && !server.host.startsWith('[') ? `[${server.host}]` : server.host;
	const url = `http://${hostForUrl}:${server.port}${MAGIC_RELOAD_PATH}`;
	const req = http.get(url, { timeout: RELOAD_REQUEST_TIMEOUT_MS }, (res) => {
		// 读取并丢弃响应体,以释放连接
		res.resume();
		if (res.statusCode === 200) {
			printf.outFile.info(`已通知 dev server 刷新浏览器 [url:${url}]`);
		} else {
			printf.outFile.warning(`dev server 返回非预期状态码: ${res.statusCode} [url:${url}]`);
		}
	});
	req.on('timeout', () => {
		req.destroy();
	});
	req.on('error', () => {
		// dev server 未启动/网络错误/超时,静默忽略
	});
}

export async function BuildProject(opts?: { dryRun?: boolean }): Promise<void> {
	const configPath = path.join(app.project.dir, 'build.toml');
	if (!fs.existsSync(configPath)) {
		printf.log(`构建失败: build.toml 配置文件不存在`);
		printf.outFile.error(`请确保在项目根目录创建了 build.toml 配置文件`);
		printf.outFile.error(`当前查找路径: ${configPath}`);
		throw new Error(`build.toml 配置文件不存在 [path:${configPath}]`);
	}

	if (opts?.dryRun) printf.outFile.info(`[DRY RUN] 构建开始 (干运行模式,不写入文件)`);
	else printf.outFile.info(`构建开始`);

	const root = (await import(configPath)) as { default?: BuildConfig };
	const cfg = root.default ?? (root as unknown as BuildConfig);
	const projectDir = path.normalize(app.project.dir);

	// 构建前执行 front-run 脚本 (dry-run 时仅解析,跳过执行)
	const frontRun = cfg.build?.['front-run'];
	if (Array.isArray(frontRun) && frontRun.length > 0) {
		if (opts?.dryRun) {
			const resolved = resolveScripts(frontRun, projectDir);
			printf.outFile.info(`[DRY RUN] 跳过 front-run,共 ${resolved.length} 个脚本: ${resolved.join(', ')}`);
		} else {
			await runScripts(frontRun, projectDir, 'front');
		}
	}

	await start(cfg, configPath);

	// 构建完成: 通知 dev server 刷新浏览器(如果启动中)
	if (!opts?.dryRun) {
		const server = cfg.dev?.server;
		if (server?.host && server?.port) {
			notifyDevServerReload({ host: server.host, port: server.port });
		}
	}

	// 构建后执行 back-run 脚本 (dry-run 时仅解析,跳过执行)
	const backRun = cfg.build?.['back-run'];
	if (Array.isArray(backRun) && backRun.length > 0) {
		if (opts?.dryRun) {
			const resolved = resolveScripts(backRun, projectDir);
			printf.outFile.info(`[DRY RUN] 跳过 back-run,共 ${resolved.length} 个脚本: ${resolved.join(', ')}`);
		} else {
			await runScripts(backRun, projectDir, 'back');
		}
	}

	// 关闭 SQLite 缓存连接 + 合并 WAL,避免 cache.db-wal 残留
	// 导致后续 magic run/build 出现 "database is locked"
	try { closeCache(); } catch { /* ignore */ }
}
