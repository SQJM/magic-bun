import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { macroReplace } from '../compiler/macro-replace.ts';
import { printf } from './printf.ts';

const TRANSPILE_CACHE = new Map<string, string>();
const transpiler = new Bun.Transpiler({ loader: 'ts' });

/**
 * 编译单文件为可执行 JS.
 * - .ts / .tsx / .cts / .mts: 用 Bun Transpiler 转成 JS
 * - .js / .mjs / .cjs: 原样使用
 * - 其它后缀: 尝试按 JS 执行,失败再按 TS 转译
 */
function compileToJs(filePath: string, raw: string): string {
	const ext = path.extname(filePath).toLowerCase();
	const needTranspile = ext === '.ts' || ext === '.tsx' || ext === '.cts' || ext === '.mts';
	if (!needTranspile) return raw;
	const cached = TRANSPILE_CACHE.get(filePath);
	if (cached !== undefined) return cached;
	const js = transpiler.transformSync(raw);
	TRANSPILE_CACHE.set(filePath, js);
	return js;
}

function resolveScriptPath(scriptPath: string, projectDir: string): string {
	return path.isAbsolute(scriptPath) ? path.normalize(scriptPath) : path.resolve(projectDir, scriptPath);
}

/**
 * 顺序执行 front-run / back-run 列表里的脚本.
 * 每个脚本: 读取 → 宏替换 → 编译 (.ts 用 Bun Transpiler) → 在子作用域里执行.
 * 脚本里可以 `await`,可以访问 `console` 和 `magic` 命名空间.
 *
 * 任意一个脚本抛错会中断后续脚本执行并向上抛出 (fail-fast).
 *
 * @param scripts 脚本路径列表(相对路径基于 projectDir,绝对路径直接使用)
 * @param projectDir 项目根目录
 * @param phase 'front' | 'back',仅用于日志和错误信息
 */
export async function runScripts(scripts: string[], projectDir: string, phase: 'front' | 'back'): Promise<void> {
	if (!Array.isArray(scripts) || scripts.length === 0) return;
	printf.outFile.info(`${phase}-run: 共 ${scripts.length} 个脚本待执行`);
	for (let i = 0; i < scripts.length; i++) {
		const scriptPath = scripts[i];
		if (typeof scriptPath !== 'string' || scriptPath.trim() === '') {
			throw new Error(`${phase}-run 第 ${i + 1} 项不是有效字符串 [value:${String(scriptPath)}]`);
		}
		const absPath = resolveScriptPath(scriptPath, projectDir);
		if (!existsSync(absPath)) {
			throw new Error(`${phase}-run 脚本文件不存在 [index:${i + 1}] [path:${absPath}]`);
		}
		const raw = readFileSync(absPath, 'utf-8');
		const code = macroReplace(raw, absPath);
		const js = compileToJs(absPath, code);
		printf.outFile.info(`${phase}-run [${i + 1}/${scripts.length}]: ${absPath}`);
		try {
			// AsyncFunction 支持脚本里写 top-level await
			const fn = new AsyncFunction('console', 'magic', `"use strict";\n${js}`);
			await fn(console, (globalThis as { magic?: unknown }).magic);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			const stack = err instanceof Error && err.stack ? `\n${err.stack}` : '';
			throw new Error(`${phase}-run 脚本执行失败 [index:${i + 1}] [path:${absPath}] [error:${msg}]${stack}`);
		}
	}
	printf.outFile.info(`${phase}-run: 全部 ${scripts.length} 个脚本执行完成`);
}

/**
 * 仅解析 front-run / back-run 数组,不执行.
 * 用于 dry-run 模式或外部模块在构建前查看将要执行哪些脚本.
 */
export function resolveScripts(scripts: string[], projectDir: string): string[] {
	if (!Array.isArray(scripts)) return [];
	return scripts.map((s) => resolveScriptPath(String(s), projectDir));
}
