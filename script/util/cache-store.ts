import { Database } from 'bun:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SCHEMA_VERSION = 1;
const COMPRESS_THRESHOLD = 1024;
const GC_BLOB_UNUSED_BUILDS = 5;

export interface FileCacheEntry {
	hash: string;
	mtime: number;
	size: number;
	outputs: string[];
	blobHashes: string[];
}

export interface BuildCacheData {
	configHash: string;
	model: string;
	files: Record<string, FileCacheEntry>;
	deps: Record<string, string[]>;
	blobs: Record<string, { data: string; size: number; compressed: boolean; refCount: number }>;
}

export interface BuildStats {
	id: number;
	startedAt: number;
	finishedAt: number | null;
	durationMs: number | null;
	model: string;
	filesCompiled: number;
	filesUnchanged: number;
	cacheHits: number;
	cacheMisses: number;
	success: boolean;
	errorMessage: string | null;
}

export interface BuildSummary {
	compiled: number;
	unchanged: number;
	hitRate: number;
	durationMs: number;
}

function compress(str: string): Uint8Array {
	const buf = Buffer.alloc(Buffer.byteLength(str, 'utf-8'));
	buf.write(str, 'utf-8');
	return buf as unknown as Uint8Array;
}

function decompress(value: Buffer | Uint8Array | string): string {
	if (typeof value === 'string') return value;
	if (Buffer.isBuffer(value)) return value.toString('utf-8');
	return Buffer.from(value).toString('utf-8');
}

function hashContent(content: string): string {
	return new Bun.CryptoHasher('sha256').update(content).digest('hex').slice(0, 16);
}

function configHash(obj: unknown): string {
	return new Bun.CryptoHasher('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

export class CacheStore {
	readonly db: Database;
	readonly path: string;
	#currentBuildId: number | null = null;
	#stats = { hits: 0, misses: 0, compiled: 0, unchanged: 0 };

	private q<R = unknown>(sql: string) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return this.db.query<R, any[]>(sql);
	}

	private constructor(db: Database, path: string) {
		this.db = db;
		this.path = path;
	}

	static open(dbPath: string): CacheStore {
		mkdirSync(dirname(dbPath), { recursive: true });
		const db = new Database(dbPath, { create: true });
		db.exec('PRAGMA journal_mode = WAL');
		db.exec('PRAGMA synchronous = NORMAL');
		db.exec('PRAGMA temp_store = MEMORY');
		db.exec('PRAGMA cache_size = -32000');
		db.exec('PRAGMA mmap_size = 268435456');
		db.exec('PRAGMA foreign_keys = ON');
		// 当缓存 DB 被另一个进程持有锁时(并发 magic run/build 或上一次进程未干净关闭),
		// SQLite 会自动等待最多 5 秒再重试,避免直接抛出 "database is locked"
		db.exec('PRAGMA busy_timeout = 5000');

		const store = new CacheStore(db, dbPath);
		store.migrate();
		return store;
	}

	static openReadOnly(dbPath: string): CacheStore {
		const db = new Database(dbPath, { readonly: true });
		return new CacheStore(db, dbPath);
	}

	close(): void {
		if (this.#currentBuildId !== null) {
			this.endBuild(false, 'connection closed');
		}
		// 主动将 WAL 内容合并回主库并截断 WAL 文件,避免下次启动时残留
		// cache.db-wal / cache.db-shm 导致锁未释放的假象
		try {
			this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
		} catch {
			// checkpoint 失败不阻塞关闭 (例如只读连接)
		}
		this.db.close();
	}

	private migrate(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
		`);

		const versionRow = this.q<{ value: string }>('SELECT value FROM meta WHERE key = ?')
			.get('schema_version') as { value: string } | null;
		const currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;

		if (currentVersion < SCHEMA_VERSION) {
			this.db.transaction(() => {
				this.db.exec(`
					CREATE TABLE IF NOT EXISTS files (
						path TEXT PRIMARY KEY,
						content_hash TEXT NOT NULL,
						mtime INTEGER NOT NULL,
						size INTEGER NOT NULL,
						outputs TEXT NOT NULL,
						last_seen_build INTEGER NOT NULL DEFAULT 0,
						build_id INTEGER
					);
					CREATE INDEX IF NOT EXISTS idx_files_hash ON files(content_hash);
					CREATE INDEX IF NOT EXISTS idx_files_build ON files(build_id);
					CREATE INDEX IF NOT EXISTS idx_files_seen ON files(last_seen_build);

					CREATE TABLE IF NOT EXISTS blobs (
						hash TEXT PRIMARY KEY,
						data BLOB NOT NULL,
						size INTEGER NOT NULL,
						compressed INTEGER NOT NULL DEFAULT 0,
						ref_count INTEGER NOT NULL DEFAULT 0,
						last_used_build INTEGER NOT NULL DEFAULT 0,
						created_at INTEGER NOT NULL
					);
					CREATE INDEX IF NOT EXISTS idx_blobs_used ON blobs(last_used_build);

					CREATE TABLE IF NOT EXISTS file_blobs (
						file_path TEXT NOT NULL,
						blob_hash TEXT NOT NULL,
						kind TEXT NOT NULL DEFAULT 'keyframes',
						PRIMARY KEY (file_path, blob_hash, kind),
						FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE,
						FOREIGN KEY (blob_hash) REFERENCES blobs(hash) ON DELETE CASCADE
					);
					CREATE INDEX IF NOT EXISTS idx_fb_blob ON file_blobs(blob_hash);

					CREATE TABLE IF NOT EXISTS deps (
						file_path TEXT NOT NULL,
						dep_path TEXT NOT NULL,
						PRIMARY KEY (file_path, dep_path),
						FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
					);
					CREATE INDEX IF NOT EXISTS idx_deps_dep ON deps(dep_path);

					CREATE TABLE IF NOT EXISTS builds (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						started_at INTEGER NOT NULL,
						finished_at INTEGER,
						duration_ms INTEGER,
						model TEXT NOT NULL,
						config_hash TEXT NOT NULL,
						files_compiled INTEGER NOT NULL DEFAULT 0,
						files_unchanged INTEGER NOT NULL DEFAULT 0,
						cache_hits INTEGER NOT NULL DEFAULT 0,
						cache_misses INTEGER NOT NULL DEFAULT 0,
						success INTEGER NOT NULL DEFAULT 0,
						error_message TEXT
					);
					CREATE INDEX IF NOT EXISTS idx_builds_started ON builds(started_at DESC);
					CREATE INDEX IF NOT EXISTS idx_builds_config ON builds(config_hash);

					CREATE TABLE IF NOT EXISTS file_build_seen (
						file_path TEXT NOT NULL,
						build_id INTEGER NOT NULL,
						PRIMARY KEY (file_path, build_id)
					);
					CREATE INDEX IF NOT EXISTS idx_fbs_build ON file_build_seen(build_id);
				`);
				this.q<unknown>(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`)
					.run('schema_version', String(SCHEMA_VERSION));
			})();
		}
	}

	beginBuild(model: string, configHash: string): number {
		const row = this.q<{ id: number }>(
			`INSERT INTO builds (started_at, model, config_hash) VALUES (?, ?, ?) RETURNING id`
		)
			.get(Date.now(), model, configHash) as { id: number };
		this.#currentBuildId = row.id;
		this.#stats = { hits: 0, misses: 0, compiled: 0, unchanged: 0 };
		return row.id;
	}

	isConfigChanged(currentConfigHash: string): boolean {
		const lastRow = this.q<{ config_hash: string }>(`SELECT config_hash FROM builds WHERE success = 1 ORDER BY id DESC LIMIT 1`)
			.get() as { config_hash: string } | null;
		if (!lastRow) return false;
		return lastRow.config_hash !== currentConfigHash;
	}

	clearOnConfigChange(): void {
		this.db.transaction(() => {
			this.db.exec(`DELETE FROM file_blobs`);
			this.db.exec(`DELETE FROM files`);
			this.db.exec(`DELETE FROM deps`);
		})();
	}

	endBuild(success: boolean, errorMessage: string | null = null): void {
		if (this.#currentBuildId === null) return;
		const id = this.#currentBuildId;
		const finishedAt = Date.now();
		this.q<unknown>(
			`UPDATE builds SET finished_at = ?, duration_ms = ?, files_compiled = ?, files_unchanged = ?, cache_hits = ?, cache_misses = ?, success = ?, error_message = ? WHERE id = ?`
		)
			.run(
				finishedAt,
				null,
				this.#stats.compiled,
				this.#stats.unchanged,
				this.#stats.hits,
				this.#stats.misses,
				success ? 1 : 0,
				errorMessage,
				id
			);
		this.#currentBuildId = null;
	}

	getStats(): { hits: number; misses: number; compiled: number; unchanged: number } {
		return { ...this.#stats };
	}

	getFileEntry(relPath: string): FileCacheEntry | null {
		const row = this.q<{ content_hash: string; mtime: number; size: number; outputs: string }>(
			`SELECT content_hash, mtime, size, outputs FROM files WHERE path = ?`
		)
			.get(relPath) as { content_hash: string; mtime: number; size: number; outputs: string } | null;
		if (!row) {
			this.#stats.misses++;
			return null;
		}
		const blobRows = this.q<{ blob_hash: string; kind: string }>(`SELECT blob_hash, kind FROM file_blobs WHERE file_path = ?`)
			.all(relPath) as { blob_hash: string; kind: string }[];
		this.#stats.hits++;
		return {
			hash: row.content_hash,
			mtime: row.mtime,
			size: row.size,
			outputs: JSON.parse(row.outputs) as string[],
			blobHashes: blobRows.map((b) => b.blob_hash)
		};
	}

	upsertFileEntry(
		relPath: string,
		entry: FileCacheEntry,
		blobKinds: Record<string, string> = {}
	): void {
		const buildId = this.#currentBuildId ?? 0;
		this.db.transaction(() => {
			this.q<unknown>(
				`INSERT INTO files (path, content_hash, mtime, size, outputs, last_seen_build, build_id) VALUES (?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT(path) DO UPDATE SET content_hash = excluded.content_hash, mtime = excluded.mtime, size = excluded.size, outputs = excluded.outputs, last_seen_build = excluded.last_seen_build, build_id = excluded.build_id`
			)
				.run(relPath, entry.hash, entry.mtime, entry.size, JSON.stringify(entry.outputs), buildId, buildId);
			this.q<unknown>(`INSERT OR IGNORE INTO file_build_seen (file_path, build_id) VALUES (?, ?)`)
				.run(relPath, buildId);

			this.q<unknown>(`DELETE FROM file_blobs WHERE file_path = ?`)
				.run(relPath);
			for (const blobHash of entry.blobHashes) {
				const kind = blobKinds[blobHash] || 'keyframes';
				this.q<unknown>(
					`INSERT OR REPLACE INTO file_blobs (file_path, blob_hash, kind) VALUES (?, ?, ?)`
				)
					.run(relPath, blobHash, kind);
				this.q<unknown>(`UPDATE blobs SET ref_count = ref_count + 1, last_used_build = ? WHERE hash = ?`)
					.run(buildId, blobHash);
			}
		})();
	}

	/**
	 * 批量写入文件缓存条目,所有操作在单个 SQLite 事务中完成,
	 * 避免大量逐条事务的开销.
	 */
	batchUpsertFileEntries(
		entries: Array<{
			relPath: string;
			entry: FileCacheEntry;
			blobKinds: Record<string, string>;
		}>
	): void {
		const buildId = this.#currentBuildId ?? 0;
		this.db.transaction(() => {
			const fileStmt = this.q<unknown>(
				`INSERT INTO files (path, content_hash, mtime, size, outputs, last_seen_build, build_id) VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(path) DO UPDATE SET content_hash = excluded.content_hash, mtime = excluded.mtime, size = excluded.size, outputs = excluded.outputs, last_seen_build = excluded.last_seen_build, build_id = excluded.build_id`
			);
			const seenStmt = this.q<unknown>(
				`INSERT OR IGNORE INTO file_build_seen (file_path, build_id) VALUES (?, ?)`
			);
			const delBlobStmt = this.q<unknown>(
				`DELETE FROM file_blobs WHERE file_path = ?`
			);
			const insBlobStmt = this.q<unknown>(
				`INSERT OR REPLACE INTO file_blobs (file_path, blob_hash, kind) VALUES (?, ?, ?)`
			);
			const updBlobStmt = this.q<unknown>(
				`UPDATE blobs SET ref_count = ref_count + 1, last_used_build = ? WHERE hash = ?`
			);

			for (const { relPath, entry, blobKinds } of entries) {
				fileStmt.run(relPath, entry.hash, entry.mtime, entry.size, JSON.stringify(entry.outputs), buildId, buildId);
				seenStmt.run(relPath, buildId);
				delBlobStmt.run(relPath);
				for (const blobHash of entry.blobHashes) {
					const kind = blobKinds[blobHash] || 'keyframes';
					insBlobStmt.run(relPath, blobHash, kind);
					updBlobStmt.run(buildId, blobHash);
				}
			}
		})();
	}

	removeFileEntry(relPath: string): void {
		this.db.transaction(() => {
			this.q<unknown>(`DELETE FROM file_blobs WHERE file_path = ?`).run(relPath);
			this.q<unknown>(`DELETE FROM files WHERE path = ?`).run(relPath);
			this.q<unknown>(`DELETE FROM deps WHERE file_path = ?`).run(relPath);
		})();
	}

	getAllFileEntries(): Record<string, FileCacheEntry> {
		const rows = this.q<{ path: string; content_hash: string; mtime: number; size: number; outputs: string }>(
			`SELECT path, content_hash, mtime, size, outputs FROM files`
		)
			.all() as { path: string; content_hash: string; mtime: number; size: number; outputs: string }[];
		const out: Record<string, FileCacheEntry> = {};
		for (const r of rows) {
			const blobRows = this.q<{ blob_hash: string }>(`SELECT blob_hash FROM file_blobs WHERE file_path = ?`)
				.all(r.path) as { blob_hash: string }[];
			out[r.path] = {
				hash: r.content_hash,
				mtime: r.mtime,
				size: r.size,
				outputs: JSON.parse(r.outputs) as string[],
				blobHashes: blobRows.map((b) => b.blob_hash)
			};
		}
		return out;
	}

	putBlob(content: string): string {
		const hash = hashContent(content);
		const buf = compress(content);
		const buildId = this.#currentBuildId ?? 0;
		const size = buf.length;
		const compressed = size > COMPRESS_THRESHOLD ? 1 : 0;
		this.q<unknown>(
			`INSERT OR IGNORE INTO blobs (hash, data, size, compressed, ref_count, last_used_build, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)`
		)
			.run(hash, buf, size, compressed, buildId, Date.now());
		return hash;
	}

	getBlob(hash: string): string | null {
		const row = this.q<{ data: Buffer; compressed: number }>(`SELECT data, compressed FROM blobs WHERE hash = ?`)
			.get(hash) as { data: Buffer; compressed: number } | null;
		if (!row) return null;
		return decompress(row.data);
	}

	getBlobsForFiles(relPaths: string[]): Record<string, string> {
		if (relPaths.length === 0) return {};
		const placeholders = relPaths.map(() => '?').join(',');
		const rows = this.q<{ blob_hash: string; data: Buffer; compressed: number }>(
			`SELECT DISTINCT fb.blob_hash, b.data, b.compressed
				 FROM file_blobs fb
				 JOIN blobs b ON b.hash = fb.blob_hash
				 WHERE fb.file_path IN (${placeholders})`
		)
			.all(...relPaths) as { blob_hash: string; data: Buffer; compressed: number }[];
		const out: Record<string, string> = {};
		for (const r of rows) {
			out[r.blob_hash] = decompress(r.data);
		}
		return out;
	}

	setDeps(relPath: string, deps: string[]): void {
		this.db.transaction(() => {
			this.q<unknown>(
				`INSERT OR IGNORE INTO files (path, content_hash, mtime, size, outputs) VALUES (?, '', 0, 0, '[]')`
			)
				.run(relPath);
			this.q<unknown>(`DELETE FROM deps WHERE file_path = ?`).run(relPath);
			const stmt = this.q<unknown>(
				`INSERT OR IGNORE INTO deps (file_path, dep_path) VALUES (?, ?)`
			);
			for (const dep of deps) {
				stmt.run(relPath, dep);
			}
		})();
	}

	getDirectDeps(relPath: string): string[] {
		const rows = this.q<{ dep_path: string }>(`SELECT dep_path FROM deps WHERE file_path = ?`)
			.all(relPath) as { dep_path: string }[];
		return rows.map((r) => r.dep_path);
	}

	getDependents(relPath: string): string[] {
		const rows = this.q<{ file_path: string }>(`SELECT file_path FROM deps WHERE dep_path = ?`)
			.all(relPath) as { file_path: string }[];
		return rows.map((r) => r.file_path);
	}

	getAffectedFiles(changedFiles: string[]): string[] {
		if (changedFiles.length === 0) return [];
		const affected = new Set<string>();
		const queue = [...changedFiles];
		while (queue.length > 0) {
			const cur = queue.shift()!;
			if (affected.has(cur)) continue;
			affected.add(cur);
			const dependents = this.getDependents(cur);
			for (const d of dependents) {
				if (!affected.has(d)) queue.push(d);
			}
		}
		return Array.from(affected).filter((f) => !changedFiles.includes(f));
	}

	getLastBuilds(limit: number = 20): BuildStats[] {
		const rows = this.q<{
			id: number;
			started_at: number;
			finished_at: number | null;
			duration_ms: number | null;
			model: string;
			files_compiled: number;
			files_unchanged: number;
			cache_hits: number;
			cache_misses: number;
			success: number;
			error_message: string | null;
		}>(
			`SELECT id, started_at, finished_at, duration_ms, model, files_compiled, files_unchanged, cache_hits, cache_misses, success, error_message
			 FROM builds ORDER BY id DESC LIMIT ?`
		)
			.all(limit) as {
			id: number;
			started_at: number;
			finished_at: number | null;
			duration_ms: number | null;
			model: string;
			files_compiled: number;
			files_unchanged: number;
			cache_hits: number;
			cache_misses: number;
			success: number;
			error_message: string | null;
		}[];
		return rows.map((r) => ({
			id: r.id,
			startedAt: r.started_at,
			finishedAt: r.finished_at,
			durationMs: r.duration_ms,
			model: r.model,
			filesCompiled: r.files_compiled,
			filesUnchanged: r.files_unchanged,
			cacheHits: r.cache_hits,
			cacheMisses: r.cache_misses,
			success: r.success === 1,
			errorMessage: r.error_message
		}));
	}

	getCurrentBuildSummary(): BuildSummary {
		const total = this.#stats.hits + this.#stats.misses;
		return {
			compiled: this.#stats.compiled,
			unchanged: this.#stats.unchanged,
			hitRate: total === 0 ? 0 : this.#stats.hits / total,
			durationMs: 0
		};
	}

	gc(): { removedBlobs: number; removedFiles: number } {
		const lastBuildId = this.#currentBuildId;
		const stmt = this.q<{ c: number }>(
			`SELECT COUNT(*) AS c FROM blobs WHERE ref_count = 0 AND last_used_build < ?`
		);
		const orphans = stmt.get(lastBuildId) as { c: number } | null;
		const removedBlobs = orphans?.c ?? 0;
		this.q<unknown>(`DELETE FROM blobs WHERE ref_count = 0 AND last_used_build < ?`)
			.run(lastBuildId);

		const oldBuilds = this.q<{ id: number }>(`SELECT id FROM builds ORDER BY id DESC LIMIT ?, 1`)
			.get(GC_BLOB_UNUSED_BUILDS) as { id: number } | null;
		let removedFiles = 0;
		if (oldBuilds) {
			const r = this.q<{ c: number }>(`SELECT COUNT(*) AS c FROM files WHERE last_seen_build < ?`)
				.get(oldBuilds.id) as { c: number } | null;
			removedFiles = r?.c ?? 0;
			this.q<unknown>(
				`DELETE FROM file_blobs WHERE file_path IN (SELECT path FROM files WHERE last_seen_build < ?)`
			)
				.run(oldBuilds.id);
			this.q<unknown>(
				`DELETE FROM deps WHERE file_path IN (SELECT path FROM files WHERE last_seen_build < ?)`
			)
				.run(oldBuilds.id);
			this.q<unknown>(`DELETE FROM files WHERE last_seen_build < ?`).run(oldBuilds.id);
		}

		return { removedBlobs, removedFiles };
	}

	stats(): {
		files: number;
		blobs: number;
		blobsSizeBytes: number;
		deps: number;
		builds: number;
		dbSizeBytes: number;
		} {
		const files = this.q<{ c: number }>(`SELECT COUNT(*) AS c FROM files`).get() as
			| { c: number }
			| null;
		const blobs = this.q<{ c: number; s: number }>(`SELECT COUNT(*) AS c, COALESCE(SUM(size), 0) AS s FROM blobs`)
			.get() as { c: number; s: number } | null;
		const deps = this.q<{ c: number }>(`SELECT COUNT(*) AS c FROM deps`).get() as
			| { c: number }
			| null;
		const builds = this.q<{ c: number }>(`SELECT COUNT(*) AS c FROM builds`).get() as
			| { c: number }
			| null;
		let dbSize = 0;
		try {
			dbSize = statSync(this.path).size;
		} catch {
			// ignore
		}
		return {
			files: files?.c ?? 0,
			blobs: blobs?.c ?? 0,
			blobsSizeBytes: blobs?.s ?? 0,
			deps: deps?.c ?? 0,
			builds: builds?.c ?? 0,
			dbSizeBytes: dbSize
		};
	}

	incrementCompiled(): void {
		this.#stats.compiled++;
	}
	incrementUnchanged(): void {
		this.#stats.unchanged++;
	}
}

let _globalStore: CacheStore | null = null;

export function getGlobalCache(dbPath: string): CacheStore {
	if (_globalStore && _globalStore.path === dbPath) return _globalStore;
	if (_globalStore) _globalStore.close();
	_globalStore = CacheStore.open(dbPath);
	return _globalStore;
}

export function closeGlobalCache(): void {
	if (_globalStore) {
		_globalStore.close();
		_globalStore = null;
	}
}

export { configHash, hashContent };

export function getCachePath(projectDir: string): string {
	return join(projectDir, '.magic', 'build-cache', 'cache.db');
}
