import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';
import { printf } from './util/printf.ts';
import { formatMagicFile } from './format-magic-file.ts';
import { ErrorAggregator } from './util/error-aggregator.ts';
import type { BuildConfig } from './types.ts';

/**
 * Recursively scan for .m files in a directory.
 */
function scanMFiles(rootDir: string): string[] {
	const results: string[] = [];

	function walk(dir: string): void {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
			} else if (entry.isFile() && entry.name.endsWith('.m')) {
				results.push(fullPath);
			}
		}
	}

	walk(rootDir);
	return results;
}

export async function FormatAllProject(): Promise<void> {
	const configPath = path.join(app.project.dir, 'build.toml');
	if (!fs.existsSync(configPath)) {
		printf.outConsole.error(`build.toml 配置文件不存在 [path:${configPath}]`);
		throw new Error(`build.toml 配置文件不存在`);
	}

	const root = (await import(configPath)) as { default?: BuildConfig };
	const cfg = root.default ?? (root as unknown as BuildConfig);

	const srcDir = path.join(app.project.dir, cfg.config.src);
	if (!fs.existsSync(srcDir)) {
		printf.outConsole.error(`源目录不存在 [path:${srcDir}]`);
		throw new Error(`源目录不存在`);
	}

	const mFiles = scanMFiles(srcDir);
	if (mFiles.length === 0) {
		printf.outConsole.info(`未找到 .m 文件`);
		return;
	}

	const aggregator = new ErrorAggregator();
	let successCount = 0;
	let failCount = 0;
	let changedCount = 0;

	for (const filePath of mFiles) {
		const relativePath = path.relative(app.project.dir, filePath);
		try {
			printf.outFile.info(`格式化: ${relativePath}`);
			const changed = await formatMagicFile(filePath, false);
			if (changed) {
				changedCount++;
			}
			successCount++;
		} catch (e) {
			failCount++;
			aggregator.addError(relativePath, String(e));
		}
	}

	// Report aggregated errors
	if (aggregator.hasErrors()) {
		aggregator.flush();
	}

	printf.outConsole.ok(`格式化完成: ${changedCount} 个文件已修改, ${successCount} 个成功, ${failCount} 个失败`);
}
