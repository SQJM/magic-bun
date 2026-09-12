import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import {
	loadCache,
	saveCache,
	getCachePath,
	closeCache
} from '../../script/util/build-cache.ts';
import { CacheStore } from '../../script/util/cache-store.ts';

describe('build-cache', () => {
	let tempDir: string;
	let dbFile: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-cache-test-'));
		dbFile = path.join(tempDir, '.magic', 'build-cache', 'cache.db');
		closeCache();
	});

	afterEach(async () => {
		closeCache();
		await new Promise((r) => setTimeout(r, 50));
		if (fs.existsSync(tempDir)) {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
			} catch {
				// ignore
			}
		}
	});

	describe('getCachePath', () => {
		it('should return file path inside .magic/build-cache/', () => {
			const result = getCachePath('/project');
			expect(result).toBe(path.join('/project', '.magic', 'build-cache', 'cache.db'));
			expect(result).not.toContain('outDir');
		});
	});

	describe('saveCache / loadCache', () => {
		it('should save and load cache correctly', () => {
			saveCache(
				dbFile,
				{
					'index.js': { hash: 'abc123', outputs: ['index.js', 'index.css'] }
				},
				{ model: 'debug', configHash: 'cfg1' }
			);

			const cache = loadCache(dbFile);
			expect(cache).not.toBeNull();
			expect(cache!.files['index.js'].hash).toBe('abc123');
			expect(cache!.files['index.js'].outputs).toEqual(['index.js', 'index.css']);
		});

		it('should save multiple entries and load them', () => {
			saveCache(
				dbFile,
				{
					'a.js': { hash: 'h1', outputs: ['a.js'] },
					'b.css': { hash: 'h2', outputs: ['b.css'] }
				},
				{ model: 'debug', configHash: 'cfg1' }
			);

			const cache = loadCache(dbFile);
			expect(cache).not.toBeNull();
			expect(Object.keys(cache!.files).length).toBe(2);
			expect(cache!.files['a.js'].hash).toBe('h1');
			expect(cache!.files['b.css'].hash).toBe('h2');
		});

		it('should persist keyframes via CAS blob', () => {
			saveCache(
				dbFile,
				{
					'comp.m': {
						hash: 'hcomp',
						outputs: ['comp.js', 'comp.css'],
						keyframes: '@keyframes logo { 0% { opacity: 0; } 100% { opacity: 1; } }'
					}
				},
				{ model: 'debug', configHash: 'cfg1' }
			);

			const cache = loadCache(dbFile);
			expect(cache!.files['comp.m'].keyframes).toContain('@keyframes logo');
		});
	});

	describe('loadCache', () => {
		it('should return null for non-existent db', () => {
			expect(loadCache('/nonexistent/path/cache.db')).toBeNull();
		});
	});
});

describe('CacheStore', () => {
	let tempDir: string;
	let dbFile: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-store-test-'));
		dbFile = path.join(tempDir, '.magic', 'build-cache', 'cache.db');
	});

	afterEach(async () => {
		await new Promise((r) => setTimeout(r, 50));
		if (fs.existsSync(tempDir)) {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
			} catch {
				// ignore
			}
		}
	});

	it('should open DB and apply WAL', () => {
		const store = CacheStore.open(dbFile);
		const mode = store.db.query<{ journal_mode: string }, []>(`PRAGMA journal_mode`).get();
		expect(mode?.journal_mode).toBe('wal');
		store.close();
	});

	it('should track compile/unchanged counters in a build', () => {
		const store = CacheStore.open(dbFile);
		store.beginBuild('debug', 'cfg1');
		store.incrementCompiled();
		store.incrementCompiled();
		store.incrementUnchanged();
		const stats = store.getStats();
		expect(stats.compiled).toBe(2);
		expect(stats.unchanged).toBe(1);
		store.endBuild(true);
		const last = store.getLastBuilds(1)[0];
		expect(last.filesCompiled).toBe(2);
		expect(last.filesUnchanged).toBe(1);
		expect(last.success).toBe(true);
		store.close();
	});

	it('should detect config change', () => {
		const store = CacheStore.open(dbFile);
		store.beginBuild('debug', 'cfgA');
		store.endBuild(true);
		expect(store.isConfigChanged('cfgA')).toBe(false);
		expect(store.isConfigChanged('cfgB')).toBe(true);
		store.close();
	});

	it('should support CAS blob put/get', () => {
		const store = CacheStore.open(dbFile);
		store.beginBuild('debug', 'cfg1');
		const data = '@keyframes test { 0% {} 100% {} }';
		const hash = store.putBlob(data);
		const got = store.getBlob(hash);
		expect(got).toBe(data);
		store.endBuild(true);
		store.close();
	});

	it('should track dependencies and find affected files', () => {
		const store = CacheStore.open(dbFile);
		store.setDeps('a.m', ['b.m']);
		store.setDeps('c.m', ['b.m']);
		const affected = store.getAffectedFiles(['b.m']);
		expect(affected.sort()).toEqual(['a.m', 'c.m']);
		store.close();
	});

	it('should cascade transitive dependents', () => {
		const store = CacheStore.open(dbFile);
		store.setDeps('b.m', ['a.m']);
		store.setDeps('c.m', ['b.m']);
		store.setDeps('d.m', ['c.m']);
		const affected = store.getAffectedFiles(['a.m']);
		expect(affected.sort()).toEqual(['b.m', 'c.m', 'd.m']);
		store.close();
	});

	it('should report cache health', () => {
		const store = CacheStore.open(dbFile);
		const s1 = store.stats();
		expect(s1.files).toBe(0);
		expect(s1.blobs).toBe(0);
		expect(s1.dbSizeBytes).toBeGreaterThan(0);
		store.close();
	});
});
