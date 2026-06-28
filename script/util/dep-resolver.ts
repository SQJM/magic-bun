import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { maxSatisfying } from './semver-range.ts';
import { readLock } from './lock-manager.ts';

interface DepEntry {
	version?: string;
	integrity?: string;
	dependencies?: Record<string, string>;
	source?: string;
}

export function readBuildToml(projectDir: string) {
	const p = join(projectDir, 'build.toml');
	if (!existsSync(p)) return null;
	const txt = readFileSync(p, 'utf-8');
	try {
		const parsed = JSON.parse(txt);
		return parsed;
	} catch { return null; }
}

export function resolveDependency(name: string, version: string, lockFile?: string): string | null {
	if (!lockFile || !existsSync(lockFile)) return null;
	const lock = readLock(lockFile);
	if (!lock?.packages) return null;

	const entry = lock.packages[name] as DepEntry | undefined;
	if (!entry) return null;

	const candidates: string[] = [];
	for (const key of Object.keys(lock.packages)) {
		if (key === name || key.startsWith(name + '@')) {
			const e = lock.packages[key] as DepEntry;
			if (e && e.version) candidates.push(e.version);
		}
	}

	if (candidates.length === 0) return null;
	return maxSatisfying(candidates, version);
}

export function resolveDependencyTree(name: string, version: string, lockFile?: string): Record<string, string> | null {
	if (!lockFile || !existsSync(lockFile)) return null;
	const lock = readLock(lockFile);
	if (!lock?.packages) return null;

	const tree: Record<string, DepEntry> = {};
	const visited = new Set<string>();

	function walk(n: string, v: string) {
		const key = n + '@' + v;
		if (visited.has(key)) return;
		visited.add(key);

		const entry = lock.packages[n] as DepEntry | undefined;
		if (!entry) return;
		tree[n] = entry;

		if (entry.dependencies) {
			for (const [dep, depVer] of Object.entries(entry.dependencies)) {
				walk(dep, depVer);
			}
		}
	}

	walk(name, version);

	const result: Record<string, string> = {};
	for (const [depName, info] of Object.entries(tree)) {
		result[depName] = info.version || 'latest';
	}
	return result;
}

export function checkCircularDependencies(lockFile: string): string[] | null {
	if (!existsSync(lockFile)) return null;
	const lock = readLock(lockFile);
	if (!lock?.packages) return null;

	const circular: string[] = [];
	const visiting = new Set<string>();
	const visited = new Set<string>();

	function walk(name: string, path: string[]): void {
		if (visiting.has(name)) {
			const idx = path.indexOf(name);
			if (idx >= 0) {
				circular.push(path.slice(idx).concat(name).join(' → '));
			}
			return;
		}
		if (visited.has(name)) return;

		visiting.add(name);
		const entry = lock.packages[name] as DepEntry | undefined;
		if (entry?.dependencies) {
			for (const dep of Object.keys(entry.dependencies)) {
				walk(dep, [...path, name]);
			}
		}
		visiting.delete(name);
		visited.add(name);
	}

	for (const name of Object.keys(lock.packages)) {
		walk(name, []);
	}

	return circular.length > 0 ? circular : null;
}
