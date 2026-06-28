/**
 * 依赖图(DAG)相关工具.
 * 封装在 CacheStore 之上,提供更语义化的 API.
 */

import type { CacheStore } from './cache-store.ts';

/**
 * 解析 .m 文件的 <import> 和 <extend> 引用,提取出依赖文件路径.
 * 这些路径应当已规范化为正斜杠.
 */
export function extractDepsFromMFile(content: string, currentRelPath: string): string[] {
	const deps = new Set<string>();
	// 简化:从 <import root="..."> 和 <extend root="..."> 中提取 root
	const importRootMatch = /<import\s+root="([^"]+)"/.exec(content);
	if (importRootMatch) {
		deps.add(importRootMatch[1].replace(/\\/g, '/'));
	}
	const extendRootMatch = /<extend\s+root="([^"]+)"/.exec(content);
	if (extendRootMatch) {
		deps.add(extendRootMatch[1].replace(/\\/g, '/'));
	}
	// TODO: 未来可解析具体引入的组件路径
	void currentRelPath;
	return Array.from(deps);
}

/**
 * 给定一组"原始变更"文件,结合 DAG 计算出真正需要重编的完整文件集合.
 * (包括传递依赖 -- A 依赖 B,B 改了 A 也要重编)
 */
export function computeDirtySet(store: CacheStore, changed: string[]): string[] {
	const downstream = store.getAffectedFiles(changed);
	return Array.from(new Set([...changed, ...downstream]));
}
