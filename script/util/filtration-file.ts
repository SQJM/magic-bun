import fs from 'node:fs/promises';
import path from 'node:path';
import { printf } from './printf.ts';

interface ExcludeConfig {
	dir: string[];
	file: string[];
}

export interface FileInfo {
	/** relative path, forward slashes */
	path: string;
	size: number;
	mtime: number; // milliseconds
}

/**
 * Scan files in rootDir, returning paths with size & mtime.
 *
 * On Windows, delegates to a native Rust binary (usn-scan.exe) for
 * up to 10x faster directory traversal (parallel walk + metadata in
 * a single pass). Falls back to a pure-TS recursive walker on other
 * platforms.
 */
export async function filtrationFile(rootDir: string, exclude: ExcludeConfig): Promise<FileInfo[]> {
	if (process.platform === 'win32') {
		return scanWithRust(rootDir, exclude);
	}
	return walkWithStat(rootDir, exclude);
}

// ── Windows: native Rust binary ──────────────────────────────────────

async function scanWithRust(rootDir: string, exclude: ExcludeConfig): Promise<FileInfo[]> {
	// Resolve path relative to this source file
	const binary = path.resolve(
		import.meta.dir!,
		'../../bin/usn-scan/target/release/usn-scan.exe'
	);

	const args: string[] = [rootDir];
	if (exclude.dir.length > 0) {
		args.push('--exclude-dir', exclude.dir.join(','));
	}
	if (exclude.file.length > 0) {
		args.push('--exclude-file', exclude.file.join(','));
	}

	const proc = Bun.spawnSync([binary, ...args]);
	if (!proc.success) {
		const stderr = proc.stderr.toString();
		printf.outFile.error(`usn-scan 失败: ${stderr}`);
		// Fallback to pure-TS walker
		return walkWithStat(rootDir, exclude);
	}

	const result = JSON.parse(proc.stdout.toString());
	return result.files as FileInfo[];
}

// ── Fallback: pure-TS recursive walker ─────────────────────────────

async function walkWithStat(rootDir: string, exclude: ExcludeConfig): Promise<FileInfo[]> {
	const excludeDirSet = new Set(exclude.dir.map((d) => d.replace(/\\/g, '/')));
	const excludeFileSet = new Set(exclude.file);

	const results: FileInfo[] = [];

	async function walk(currentDir: string, relPath: string): Promise<void> {
		const entries = await fs.readdir(currentDir, { withFileTypes: true });
		const tasks: Promise<void>[] = [];

		for (const entry of entries) {
			const name = entry.name;
			const rel = relPath ? `${relPath}/${name}` : name;

			if (entry.isDirectory()) {
				if (excludeDirSet.has(rel) || excludeDirSet.has(name)) continue;
				tasks.push(walk(path.join(currentDir, name), rel));
			} else if (entry.isFile()) {
				if (excludeFileSet.has(rel) || excludeFileSet.has(name)) continue;
				const st = await fs.stat(path.join(currentDir, name));
				results.push({ path: rel, size: st.size, mtime: st.mtimeMs });
			}
		}

		await Promise.all(tasks);
	}

	await walk(rootDir, '');
	return results;
}
