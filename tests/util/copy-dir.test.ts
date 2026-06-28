import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { copyDir } from '../../script/util/copy-dir.ts';

describe('copyDir', () => {
	let srcDir: string;
	let destDir: string;

	beforeEach(() => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-copydir-'));
		srcDir = path.join(tmp, 'src');
		destDir = path.join(tmp, 'dest');
		fs.mkdirSync(srcDir);
	});

	afterEach(() => {
		const root = path.dirname(srcDir);
		if (fs.existsSync(root)) {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it('should copy files from src to dest', () => {
		fs.writeFileSync(path.join(srcDir, 'test.txt'), 'hello');
		copyDir(srcDir, destDir);
		expect(fs.existsSync(path.join(destDir, 'test.txt'))).toBe(true);
		expect(fs.readFileSync(path.join(destDir, 'test.txt'), 'utf-8')).toBe('hello');
	});

	it('should copy nested directories recursively', () => {
		fs.mkdirSync(path.join(srcDir, 'sub'));
		fs.writeFileSync(path.join(srcDir, 'sub', 'nested.txt'), 'world');
		fs.writeFileSync(path.join(srcDir, 'root.txt'), 'root');

		copyDir(srcDir, destDir);

		expect(fs.existsSync(path.join(destDir, 'root.txt'))).toBe(true);
		expect(fs.existsSync(path.join(destDir, 'sub', 'nested.txt'))).toBe(true);
		expect(fs.readFileSync(path.join(destDir, 'sub', 'nested.txt'), 'utf-8')).toBe('world');
	});

	it('should handle empty source directory', () => {
		expect(() => copyDir(srcDir, destDir)).not.toThrow();
		expect(fs.existsSync(destDir)).toBe(true);
	});

	it('should create destination directory if it does not exist', () => {
		fs.writeFileSync(path.join(srcDir, 'file.js'), 'content');
		expect(fs.existsSync(destDir)).toBe(false);
		copyDir(srcDir, destDir);
		expect(fs.existsSync(destDir)).toBe(true);
		expect(fs.existsSync(path.join(destDir, 'file.js'))).toBe(true);
	});
});
