import { parse } from 'node-html-parser';
import { readFileSync } from 'node:fs';
import { printf } from '../util/printf.ts';
import { getCachedDeps, extractDeps, setCachedParse } from './parse-cache.ts';
import type { SourceFile } from '../types.ts';

const depGraph = new Map<string, string[]>();

function buildDepGraphEntry(file: SourceFile): string[] {
	const cached = getCachedDeps(file);
	const rel = file.relative().slice(0, -2).replace(/\\/g, '/');

	if (cached) {
		depGraph.set(rel, cached);
		return cached;
	}

	const content = readFileSync(file.absolute(), 'utf-8');
	const dom = parse(`<root>${content}</root>`);
	const deps = extractDeps(dom);
	setCachedParse(file, dom, deps);
	depGraph.set(rel, deps);
	return deps;
}

export function filterUsedComponents(mComponents: SourceFile[], entryName: string): SourceFile[] {
	const files = new Map<string, SourceFile>();

	mComponents.forEach((s) => {
		const rel = s.relative().slice(0, -2).replace(/\\/g, '/');
		files.set(rel, s);
		if (!depGraph.has(rel)) {
			buildDepGraphEntry(s);
		}
	});

	const changedFiles = mComponents.filter((s) => s.changed);
	changedFiles.forEach((s) => {
		buildDepGraphEntry(s);
	});

	const used = new Set<string>();

	function collectDeps(relPath: string): void {
		if (used.has(relPath)) return;
		if (!files.has(relPath)) return;
		used.add(relPath);

		const deps = depGraph.get(relPath);
		if (!deps) return;

		deps.forEach((dep) => {
			collectDeps(dep);
		});
	}

	collectDeps(entryName);

	const filtered = mComponents.filter((s) => {
		const rel = s.relative().slice(0, -2).replace(/\\/g, '/');
		return used.has(rel);
	});

	const removed = mComponents.length - filtered.length;
	if (removed > 0) {
		printf.outFile.info(`去除未使用组件: ${removed} 个`);
	}

	return filtered;
}
