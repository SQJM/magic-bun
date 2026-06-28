import { existsSync, statSync } from 'node:fs';
import {
	getGlobalCache,
	getCachePath as storeGetCachePath,
	closeGlobalCache,
	CacheStore,
	FileCacheEntry
} from './cache-store.ts';

interface CacheEntry {
	hash: string;
	outputs: string[];
	keyframes?: string;
}

interface Cache {
	files: Record<string, CacheEntry>;
}

const KEYFRAMES_CACHE: Map<string, Map<string, string>> = new Map();

export function getCachePath(projectDir: string): string {
	return storeGetCachePath(projectDir);
}

export function loadCache(cachePath: string): Cache | null {
	if (!existsSync(cachePath)) return null;

	const store = getGlobalCache(cachePath);
	const files = store.getAllFileEntries();
	if (Object.keys(files).length === 0) return null;

	const out: Cache = { files: {} };
	const rels = Object.keys(files);
	const blobMap = store.getBlobsForFiles(rels);

	for (const [rel, entry] of Object.entries(files)) {
		const item: CacheEntry = {
			hash: entry.hash,
			outputs: [...entry.outputs]
		};
		if (entry.blobHashes.length > 0) {
			const kfs: string[] = [];
			for (const h of entry.blobHashes) {
				const cached = KEYFRAMES_CACHE.get(cachePath)?.get(h);
				if (cached !== undefined) {
					kfs.push(cached);
				} else {
					const content = blobMap[h];
					if (content !== undefined) {
						kfs.push(content);
						if (!KEYFRAMES_CACHE.has(cachePath)) KEYFRAMES_CACHE.set(cachePath, new Map());
						KEYFRAMES_CACHE.get(cachePath)!.set(h, content);
					}
				}
			}
			if (kfs.length > 0) {
				item.keyframes = kfs.join('');
			}
		}
		out.files[rel] = item;
	}

	return out;
}

export function saveCache(
	cachePath: string,
	files: Record<string, CacheEntry>,
	options?: { model?: string; configHash?: string }
): void {
	const store = getGlobalCache(cachePath);

	const model = options?.model ?? 'unknown';
	const cfgHash = options?.configHash ?? 'unknown';
	store.beginBuild(model, cfgHash);

	if (options?.configHash && store.isConfigChanged(options.configHash)) {
		store.clearOnConfigChange();
	}

	const now = Date.now();
	const batch: {
		relPath: string;
		entry: FileCacheEntry;
		blobKinds: Record<string, string>;
	}[] = [];
	for (const [rel, entry] of Object.entries(files)) {
		const blobHashes: string[] = [];
		const blobKinds: Record<string, string> = {};
		if (entry.keyframes) {
			const h = store.putBlob(entry.keyframes);
			blobHashes.push(h);
			blobKinds[h] = 'keyframes';
		}
		batch.push({
			relPath: rel,
			entry: {
				hash: entry.hash,
				mtime: now,
				size: entry.keyframes ? entry.keyframes.length : 0,
				outputs: entry.outputs,
				blobHashes
			},
			blobKinds
		});
	}
	store.batchUpsertFileEntries(batch);

	store.endBuild(true);
}

export function beginBuild(cachePath: string, model: string, configHash: string): number {
	return getGlobalCache(cachePath).beginBuild(model, configHash);
}

export function endBuild(cachePath: string, success: boolean, errorMessage: string | null = null): void {
	getGlobalCache(cachePath).endBuild(success, errorMessage);
}

export function getStore(cachePath: string): CacheStore {
	return getGlobalCache(cachePath);
}

export function recordCompiled(cachePath: string): void {
	getGlobalCache(cachePath).incrementCompiled();
}

export function recordUnchanged(cachePath: string): void {
	getGlobalCache(cachePath).incrementUnchanged();
}

export function closeCache(): void {
	closeGlobalCache();
}

export function describeCache(cachePath: string): {
	exists: boolean;
	sizeBytes: number;
	dbPath: string;
} {
	const exists = existsSync(cachePath);
	let size = 0;
	if (exists) {
		try {
			size = statSync(cachePath).size;
		} catch {
			// ignore
		}
	}
	return { exists, sizeBytes: size, dbPath: cachePath };
}
