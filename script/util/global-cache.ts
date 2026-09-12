import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getCacheDir } from './magic-config.ts';

interface CacheOptions {
	proxy?: string;
	registry?: string;
}

interface CacheMeta {
	sha256?: string;
	size?: number;
	integrity?: string;
}

interface CacheEntry {
	key: string;
	data: Uint8Array;
	meta: CacheMeta;
}

function ensureCache() {
	const dir = getCacheDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

function cacheKey(url: string, options: CacheOptions = {}): string {
	const parts = [url, options.proxy || '', options.registry || ''];
	return createHash('sha256').update(parts.join('|')).digest('hex');
}

function cachePath(url: string, options?: CacheOptions): string {
	const dir = ensureCache();
	const key = cacheKey(url, options);
	return join(dir, key);
}

export function cacheGet(url: string, options: CacheOptions = {}): CacheEntry | null {
	const path = cachePath(url, options);
	if (!existsSync(path)) return null;
	const raw = readFileSync(path);
	const metaPath = path + '.meta';
	let meta: CacheMeta = {};
	if (existsSync(metaPath)) {
		try { meta = JSON.parse(readFileSync(metaPath, 'utf-8')); } catch { /* ignore */ }
	}
	const key = cacheKey(url, options);
	return { key, data: new Uint8Array(raw), meta };
}

export function cachePut(url: string, data: Uint8Array, meta: CacheMeta, options: CacheOptions = {}): void {
	const path = cachePath(url, options);
	writeFileSync(path, data);
	writeFileSync(path + '.meta', JSON.stringify(meta));
}

export function cacheVerify(url: string, expected: string | null, options: CacheOptions = {}): { ok: boolean; hit?: CacheEntry; reason?: string } {
	const hit = cacheGet(url, options);
	if (!hit) return { ok: false, reason: 'miss' };
	if (expected && hit.meta.sha256 !== expected) return { ok: false, reason: 'mismatch', hit };
	return { ok: true, hit };
}

export function cacheHas(url: string, options: CacheOptions = {}): boolean {
	return existsSync(cachePath(url, options));
}

export function clearCache(url?: string, options?: CacheOptions): number {
	const dir = ensureCache();
	if (url) {
		const path = cachePath(url, options);
		let count = 0;
		if (existsSync(path)) { unlinkSync(path); count++; }
		if (existsSync(path + '.meta')) { unlinkSync(path + '.meta'); count++; }
		return count;
	}

	const files = readdirSync(dir);
	let count = 0;
	for (const f of files) {
		try { unlinkSync(join(dir, f)); count++; } catch { /* ignore */ }
	}
	return count;
}

export function cacheStats(): { entries: number; size: number } {
	const dir = ensureCache();
	const files = readdirSync(dir).filter((f) => !f.endsWith('.meta'));
	let size = 0;
	for (const f of files) {
		try { size += statSync(join(dir, f)).size; } catch { /* ignore */ }
	}
	return { entries: files.length, size };
}
