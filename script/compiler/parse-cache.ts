import { parse, type HTMLElement } from 'node-html-parser';
import type { SourceFile } from '../types.ts';

interface CachedEntry {
	dom: ReturnType<typeof parse>;
	deps: string[];
	hash: string;
}

const cache = new Map<string, CachedEntry>();

export function getCachedParse(file: SourceFile): ReturnType<typeof parse> | null {
	const key = file.absolute();
	const hash = file.contentHash;
	const entry = cache.get(key);
	if (entry && entry.hash === hash) {
		return entry.dom;
	}
	return null;
}

export function setCachedParse(file: SourceFile, dom: ReturnType<typeof parse>, deps: string[]): void {
	cache.set(file.absolute(), { dom, deps, hash: file.contentHash! });
}

export function getCachedDeps(file: SourceFile): string[] | null {
	const key = file.absolute();
	const hash = file.contentHash;
	const entry = cache.get(key);
	if (entry && entry.hash === hash) {
		return entry.deps;
	}
	return null;
}

export function extractDeps(dom: ReturnType<typeof parse>): string[] {
	const deps: string[] = [];
	dom.querySelectorAll('root>import, root>extend').forEach((e) => {
		const root = e.getAttribute('root') || '';
		e.childNodes.forEach((node) => {
			if (node.nodeType === 3) return;
			const tag = (node as HTMLElement).rawTagName;
			if (tag.startsWith('module:')) {
				const moduleTag = tag.substring(7);
				node.childNodes.forEach((n) => {
					if (n.nodeType === 3) return;
					deps.push(`${root}/${moduleTag}/${(n as HTMLElement).rawTagName}`);
				});
			} else {
				deps.push(`${root}/${tag}`);
			}
		});
	});
	return deps;
}

export function clearParseCache(): void {
	cache.clear();
}
