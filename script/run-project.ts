import mime from 'mime-types';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import path from 'node:path';
import { app } from '../app.ts';
import { printf } from './util/printf.ts';
import { macroReplace } from './compiler/macro-replace.ts';
import { examine_BuildConfig } from './compiler/step/1_config.ts';
import type { BuildConfig } from './types.ts';
import { BuildProject } from './build-project.ts';
import { closeCache } from './util/build-cache.ts';
import WebSocket, { WebSocketServer } from 'ws';

/**
 * `magic build` 完成后会向这个端点发送 GET 请求以触发浏览器刷新.
 * 固定路径,不与用户项目文件冲突.
 */
export const MAGIC_RELOAD_PATH = '/__magic/reload';

interface RunConfig extends BuildConfig { }

function openBrowser(urlToOpen: string): void {
	try {
		new URL(urlToOpen);
	} catch {
		printf.outFile.error(`invalid URL: ${urlToOpen}`);
		return;
	}

	const platform = os.platform();
	if (platform === 'win32') {
		exec(`start "" "${urlToOpen}"`, (err) => {
			if (err) printf.error(`启动浏览器失败: ${err.message}`);
		});
	} else if (platform === 'darwin') {
		exec(`open "${urlToOpen}"`, (err) => {
			if (err) printf.error(`启动浏览器失败: ${err.message}`);
		});
	} else {
		exec(`xdg-open "${urlToOpen}"`, (err) => {
			if (err) printf.error(`启动浏览器失败: ${err.message}`);
		});
	}
}

/**
 * Wrap an IPv6 address in brackets for URL formatting.
 * IPv4 addresses and hostnames are returned unchanged.
 */
function formatHostForUrl(host: string): string {
	if (host.includes(':') && !host.startsWith('[')) {
		return `[${host}]`;
	}
	return host;
}

function startDevServer(config: RunConfig): void {
	const serverCfg = config.dev?.server;
	if (!serverCfg) {
		// 没有 server 配置,直接打开 index.html
		const buildDir = path.join(app.project.dir, config.build.out);
		openBrowser(path.join(buildDir, config.config.main + '.html'));
		return;
	}

	const hostname = serverCfg.host;
	const port = serverCfg.port;

	// 提示: 环回地址只允许本机访问,外部设备无法连接
	if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1') {
		printf.outConsole.info(`提示: host = "${hostname}" 仅本机可访问,外部设备无法连接`);
		printf.outConsole.info(`      如需局域网/公网访问,改为 "::" (双栈) 或 "0.0.0.0" (仅 IPv4)`);
	}

	const rootDir: string = path.join(app.project.dir, config.build.out);
	// debug 模式: 静态文件从源目录 serve, 编译产物从 build 目录 serve
	const srcDir: string = path.join(app.project.dir, config.config.src);

	const fallbackMimeMap: Record<string, string> = {
		'.js': 'application/javascript',
		'.mjs': 'application/javascript',
		'.cjs': 'application/javascript',
		'.css': 'text/css',
		'.html': 'text/html',
		'.png': 'image/png',
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.gif': 'image/gif',
		'.svg': 'image/svg+xml',
		'.webp': 'image/webp',
		'.ico': 'image/x-icon',
		'.woff': 'font/woff',
		'.woff2': 'font/woff2',
		'.ttf': 'font/ttf',
		'.json': 'application/json',
		'.map': 'application/json',
		'.wasm': 'application/wasm',
		'.mp4': 'video/mp4',
		'.webm': 'video/webm',
		'.mp3': 'audio/mpeg',
		'.wav': 'audio/wav',
	};

	const connectedClients = new Set<WebSocket>();
	const MAX_CLIENTS = 100;

	/** 通知所有浏览器刷新页面 */
	function notifyReload(): void {
		const msg = 'reload';
		connectedClients.forEach((ws) => {
			if (ws.readyState === WebSocket.OPEN) {
				try { ws.send(msg); } catch { /* ignore */ }
			}
		});
	}

	const server = http.createServer((req, res) => {
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.setHeader('X-Frame-Options', 'SAMEORIGIN');
		res.setHeader('X-XSS-Protection', '1; mode=block');
		res.setHeader('Referrer-Policy', 'no-referrer');

		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.statusCode = 405;
			res.setHeader('Content-Type', 'text/plain');
			res.end('405 Method Not Allowed');
			return;
		}

		const rawPath = (req.url || '').split('?')[0] || '/';
		let targetPath: string;
		try {
			targetPath = decodeURIComponent(rawPath);
		} catch {
			res.statusCode = 400;
			res.setHeader('Content-Type', 'text/plain');
			res.end('400 Bad Request: invalid percent-encoding');
			return;
		}

		// `magic build` 完成后会 GET 这个端点触发浏览器刷新
		if (targetPath === MAGIC_RELOAD_PATH) {
			if (serverCfg?.reload === false) {
				res.statusCode = 403;
				res.setHeader('Content-Type', 'text/plain');
				res.end('reload disabled');
				return;
			}
			notifyReload();
			res.statusCode = 200;
			res.setHeader('Content-Type', 'text/plain');
			res.end('reload notified');
			return;
		}

		if (targetPath.length > 2000) {
			res.statusCode = 414;
			res.setHeader('Content-Type', 'text/plain');
			res.end('414 URI Too Long');
			return;
		}

		let target = path.resolve(rootDir, `.${targetPath}`);
		const normalizedRoot = path.resolve(rootDir) + path.sep;
		if (!target.startsWith(normalizedRoot) && target !== path.resolve(rootDir)) {
			res.statusCode = 403;
			res.setHeader('Content-Type', 'text/plain');
			res.end('403 Forbidden');
			return;
		}

		if (targetPath.includes('\0')) {
			res.statusCode = 400;
			res.setHeader('Content-Type', 'text/plain');
			res.end('400 Bad Request');
			return;
		}

		// 根据模式确定查找目录: debug = build-dir + srcDir + 项目根目录, release = 仅 build-dir
		const searchRoots: string[] = config.build.model === 'debug'
			? [rootDir, srcDir, app.project.dir]
			: [rootDir];

		/** 尝试从一个根目录服务文件,成功返回 true */
		function tryServe(root: string, pathname: string): boolean {
			const resolved = path.resolve(root, `.${pathname}`);
			const normalized = path.resolve(root) + path.sep;
			if (!resolved.startsWith(normalized) && resolved !== path.resolve(root)) {
				return false;
			}
			if (!fs.existsSync(resolved)) {
				return false;
			}

			let finalTarget = resolved;
			const stat = fs.statSync(resolved);
			if (stat.isDirectory()) {
				finalTarget = path.join(resolved, 'index.html');
				if (!fs.existsSync(finalTarget)) return false;
			}

			const ext = path.extname(finalTarget).toLowerCase();
			const contentType = fallbackMimeMap[ext] || mime.lookup(ext) || 'application/octet-stream';
			res.setHeader('Content-Type', contentType);
			res.setHeader('Connection', 'close');
			res.setHeader('Cache-Control', 'no-store, must-revalidate');
			res.statusCode = 200;

			fs.readFile(finalTarget, (err, data) => {
				if (err) {
					res.statusCode = 500;
					res.end(`500 Server Error: ${err.message}`);
					printf.error(`文件读取失败: ${finalTarget} - ${err.message}`);
					return;
				}
				// 注入 reload.js 到 index.html
				if (path.basename(finalTarget) === 'index.html') {
					const reloadScript = fs.readFileSync(
						path.join(app.runDir, 'template', 'reload.js'),
						'utf-8'
					);
					data = Buffer.concat([
						new Uint8Array(data),
						new Uint8Array(Buffer.from('<script>' + reloadScript + '</script>')),
					]);
				}
				res.end(data);
			});
			return true;
		}

		// 按序查找,找到即响应
		const triedPaths: string[] = [];
		for (const root of searchRoots) {
			const resolved = path.resolve(root, `.${targetPath}`);
			triedPaths.push(resolved);
			if (tryServe(root, targetPath)) return;
		}

		// 所有查找目录都失败,汇总输出一次调试信息
		printf.outFile.log(`资源文件未找到: ${targetPath}`);
		for (const p of triedPaths) {
			const exists = fs.existsSync(p);
			printf.outFile.log(`  ${exists ? 'DIR' : '--'}: ${p}`);
		}
		res.statusCode = 404;
		res.setHeader('Content-Type', 'text/plain');
		res.end('file not exist ' + targetPath);
	});

	// 极简 WebSocket 服务器,仅用于发送刷新信号
	const wss = new WebSocketServer({ server });
	wss.on('connection', (ws: WebSocket) => {
		if (connectedClients.size >= MAX_CLIENTS) {
			ws.close(1013, 'max clients reached');
			return;
		}
		connectedClients.add(ws);
		ws.on('close', () => { connectedClients.delete(ws); });
		ws.on('error', () => { connectedClients.delete(ws); });
	});

	server.on('error', (err: NodeJS.ErrnoException) => {
		if (err.code === 'EADDRINUSE') {
			printf.outFile.error(`端口 ${port} 已被占用 (${hostname})`);
		} else if (err.code === 'EACCES') {
			printf.outFile.error(`端口 ${port} 无权访问 (${hostname})`);
		} else {
			printf.outFile.error(`HTTP 服务器错误: ${err.message}`);
		}
		process.exit(1);
	});

	server.listen({ port, host: hostname, ipv6Only: false }, () => {
		const urlHost = formatHostForUrl(hostname);
		printf.outConsole.ok(`HTTP 服务器已启动: http://${urlHost}:${port}/index.html`);
		printf.outConsole.info(`提示: 修改源码后执行 \`magic build\` 构建,浏览器将自动刷新`);

		const shutdown = () => {
			connectedClients.forEach((ws) => { try { ws.close(); } catch { /* ignore */ } });
			connectedClients.clear();
			wss.close();
			server.close();
			// 关闭 SQLite 缓存连接 + 合并 WAL,避免 cache.db-wal 残留
			// 导致下次启动时 "database is locked"
			try { closeCache(); } catch { /* ignore */ }
			process.exit(0);
		};

		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);

		openBrowser(`http://${urlHost}:${port}/index.html`);
	});
}

export function RunProject(): Promise<void> {
	printf.outFile.info(`运行项目`);

	const file = path.normalize(path.join(app.project.dir, 'build.toml'));
	if (!fs.existsSync(file)) {
		printf.outFile.error(`运行失败: build.toml 配置文件不存在`);
		printf.outFile.error(`请确保在项目根目录创建了 build.toml 配置文件`);
		printf.outFile.error(`当前查找路径: ${file}`);
		throw new Error(`build.toml 配置文件不存在 [path:${file}]`);
	}
	return import(file).then((root: { default?: BuildConfig }) => {
		printf.outFile.info(`预处理 Build 配置文件 [path:${file}]`);
		const config = examine_BuildConfig(
			macroReplace(root.default ?? (root as unknown as BuildConfig)) as BuildConfig
		) as RunConfig;
		config.build.out = config.build.out + (config.build.model === 'release' ? '-release' : '-debug');

		return BuildProject().then(() => {
			printf.outFile.info(`构建完成, 启动开发服务器`);
			startDevServer(config);
		});
	}).catch((e) => {
		printf.outFile.error(`运行失败: ${(e as Error).message}`);
		process.exit(1);
	});
};
