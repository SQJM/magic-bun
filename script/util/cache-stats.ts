/**
 * 构建统计打印与导出.
 */

import { printf } from './printf.ts';
import type { CacheStore, BuildStats, BuildSummary } from './cache-store.ts';

export function printBuildSummary(summary: BuildSummary, model: string): void {
	const hitPct = (summary.hitRate * 100).toFixed(1);
	printf.log(
		`\n构建统计 [${model}]: 编译 ${summary.compiled} | 跳过 ${summary.unchanged} | 命中率 ${hitPct}% | 耗时 ${summary.durationMs}ms`
	);
}

export function printLastBuilds(store: CacheStore, n: number = 5): void {
	const builds = store.getLastBuilds(n);
	if (builds.length === 0) {
		printf.log('无构建历史');
		return;
	}
	printf.log(`\n最近 ${builds.length} 次构建:`);
	printf.log('  ID    | Model    | Compiled | Cached | HitRate | Duration | Status');
	printf.log('  ------|----------|----------|--------|---------|----------|--------');
	for (const b of builds) {
		const total = b.cacheHits + b.cacheMisses;
		const hit = total === 0 ? '0%' : ((b.cacheHits / total) * 100).toFixed(0) + '%';
		const dur = b.durationMs === null ? '-' : `${b.durationMs}ms`;
		const status = b.success ? 'OK' : 'FAIL';
		printf.log(
			`  ${pad(b.id, 5)} | ${pad(b.model, 8)} | ${pad(b.filesCompiled, 8)} | ${pad(b.filesUnchanged, 6)} | ${pad(hit, 7)} | ${pad(dur, 8)} | ${status}`
		);
	}
}

export function printCacheHealth(store: CacheStore): void {
	const s = store.stats();
	printf.log(`\n缓存健康度:`);
	printf.log(`  文件条目:  ${s.files}`);
	printf.log(`  CAS blob:  ${s.blobs} (${(s.blobsSizeBytes / 1024).toFixed(2)} KB)`);
	printf.log(`  依赖关系:  ${s.deps}`);
	printf.log(`  构建历史:  ${s.builds}`);
	printf.log(`  DB 大小:   ${(s.dbSizeBytes / 1024).toFixed(2)} KB`);
}

function pad(s: string | number, n: number): string {
	const str = String(s);
	return str.length >= n ? str : str + ' '.repeat(n - str.length);
}

export type { BuildStats, BuildSummary };
