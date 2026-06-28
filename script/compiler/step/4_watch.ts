// Watch 模式简化版 - 文件变化后等待3秒执行全量构建
import { watch } from 'node:fs';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { printf } from '../../util/printf.ts';
import { BuildProject } from '../../build-project.ts';

export function watchMode(): void {
	const srcDir = path.join(process.cwd(), 'src');

	if (!existsSync(srcDir)) {
		printf.error(`Watch 模式: src 目录不存在 [${srcDir}]`);
		return;
	}

	printf.outFile.info(`Watch 模式已启动,监听目录: ${srcDir}`);

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let building = false;
	let closed = false;

	function triggerBuild(): void {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			if (closed || building) return;
			building = true;
			printf.outFile.info('检测到文件变化,全量构建...');
			BuildProject().finally(() => {
				building = false;
			}).catch((err: unknown) => {
				printf.outFile.error(`构建失败 - ${(err as Error).message}`);
			});
		}, 3000);
	}

	function startWatcher(dir: string): void {
		if (!existsSync(dir)) return;

		try {
			watch(dir, { recursive: true, persistent: true }, (_eventType, filename) => {
				if (closed || !filename) return;
				if (filename.endsWith('.m') || filename.endsWith('.html') || filename.endsWith('.ts')) {
					triggerBuild();
				}
			});
			printf.outFile.info(`文件监听已启动 (原生) [dir:${dir}]`);
		} catch (err: unknown) {
			printf.outFile.warning(`Watch: 无法监听目录 ${dir}, 请在修改文件后手动执行构建 [${(err as Error).message}]`);
		}
	}

	startWatcher(srcDir);

	// Keep process alive
	process.stdin.resume();
}
