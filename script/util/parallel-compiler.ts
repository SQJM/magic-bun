// 并行编译调度器
// 将源文件按依赖拓扑排序后分批并行编译
import type { SourceFile } from '../types.ts';
import { parallelMap } from './concurrency.ts';

export async function compileParallel(
	sources: SourceFile[],
	compileFn: (s: SourceFile) => Promise<void>,
	concurrency?: number
): Promise<void> {
	if (sources.length === 0) return;

	const effectiveConcurrency = concurrency ?? Math.max(1, Math.min(4, sources.length));

	await parallelMap(sources, compileFn, effectiveConcurrency);
}
