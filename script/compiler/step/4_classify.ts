import { printf } from '../../util/printf.ts';
import { project } from '../global.ts';
import { _5 } from './5_compile.ts';
import { cpSync, existsSync, statSync } from 'node:fs';
import type { SourceFile } from '../../types.ts';
import { BUILD_TIMER } from '../start.ts';

export function _4(): Promise<void> | void {
	printf.outFile.info(`操作源文件`);

	const m: SourceFile[] = [];
	let nonCompiledCount = 0;

	const nonComponentHashes: Record<string, string> = {};

	project.source_file['*it']().forEach((s) => {
		if (s.ext === 'm') {
			m.push(s);
		} else {
			// 使用正斜杠键以匹配 cache 存储格式(originalFile 和 fast-glob 均使用正斜杠)
			nonComponentHashes[s.relative().replace(/\\/g, '/')] = s.contentHash || '';
			if (s.changed) {
				const dest = s.build();
				if (existsSync(dest)) {
					const srcStat = statSync(s.absolute());
					const dstStat = statSync(dest);
					if (srcStat.mtimeMs === dstStat.mtimeMs && srcStat.size === dstStat.size) {
						return;
					}
				}
				if (!project._dryRun) {
					// debug 模式不复制非组件文件(由 dev server 从源目录 serve)
					const isDebug = (project.build_config as { build: { model: string } }).build.model === 'debug';
					if (!isDebug) {
						cpSync(s.absolute(), dest, { recursive: true });
					}
				}
				printf.outFile.info(`复制非组件文件: ${s.relative()}`);
				nonCompiledCount++;
			}
		}
	});

	project._nonComponentHashes = nonComponentHashes;

	if (nonCompiledCount > 0) {
		printf.outFile.info(`复制 ${nonCompiledCount} 个非组件文件`);
	} else {
		printf.outFile.info(`当前没有复制非组件文件`);
	}

	BUILD_TIMER.lap('复制非组件文件');
	return _5(m);
}
