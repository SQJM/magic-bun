import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { getDirAllFile } from '../../script/util/get-dir-all-file.ts';

describe('getDirAllFile', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-getdirall-'));
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmdirSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should list all files recursively', () => {
		fs.writeFileSync(path.join(tempDir, 'root.txt'), '');
		fs.mkdirSync(path.join(tempDir, 'sub'));
		fs.writeFileSync(path.join(tempDir, 'sub', 'nested.txt'), '');

		const files = getDirAllFile(tempDir);
		expect(files.length).toBe(2);
	});

	it('should return empty array for empty directory', () => {
		const files = getDirAllFile(tempDir);
		expect(files.length).toBe(0);
	});

	it('should return full paths', () => {
		fs.writeFileSync(path.join(tempDir, 'file.js'), '');
		const files = getDirAllFile(tempDir);
		expect(files.every((f) => path.isAbsolute(f))).toBe(true);
	});

	it('should throw for non-existent directory', () => {
		expect(() => getDirAllFile('/nonexistent/path/12345')).toThrow();
	});
});
