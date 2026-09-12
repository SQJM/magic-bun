import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { fileUtil } from '../../script/util/file-util.ts';

describe('fileUtil', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-fileutil-'));
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmdirSync(tempDir, { recursive: true, force: true });
		}
	});

	describe('createFileWithDirectories', () => {
		it('should create file and parent directories', () => {
			const filePath = path.join(tempDir, 'deep', 'nested', 'file.txt');
			fileUtil.createFileWithDirectories(filePath, 'content');
			expect(fs.existsSync(filePath)).toBe(true);
			expect(fs.readFileSync(filePath, 'utf-8')).toBe('content');
		});

		it('should not overwrite existing file', () => {
			const filePath = path.join(tempDir, 'existing.txt');
			fs.writeFileSync(filePath, 'original');
			fileUtil.createFileWithDirectories(filePath, 'new content');
			expect(fs.readFileSync(filePath, 'utf-8')).toBe('original');
		});
	});

	describe('copyFileWithDirectories', () => {
		it('should copy file and create parent directories', () => {
			const srcPath = path.join(tempDir, 'source.txt');
			fs.writeFileSync(srcPath, 'source data');

			const destPath = path.join(tempDir, 'deep', 'dest', 'copied.txt');
			fileUtil.copyFileWithDirectories(srcPath, destPath);

			expect(fs.existsSync(destPath)).toBe(true);
			expect(fs.readFileSync(destPath, 'utf-8')).toBe('source data');
		});
	});

	describe('getExtensionName', () => {
		it('should return extension for file with extension', () => {
			expect(fileUtil.getExtensionName('/path/to/file.txt')).toBe('txt');
			expect(fileUtil.getExtensionName('file.min.js')).toBe('js');
			expect(fileUtil.getExtensionName('hello.m')).toBe('m');
		});

		it('should return basename for file without extension', () => {
			expect(fileUtil.getExtensionName('/path/to/file')).toBe('file');
			expect(fileUtil.getExtensionName('noext')).toBe('noext');
		});

		it('should handle dot at last position', () => {
			const result = fileUtil.getExtensionName('trailing.');
			expect(result).toBe('trailing.');
		});

		it('should handle file with multiple segments', () => {
			expect(fileUtil.getExtensionName('src/app/index.m')).toBe('m');
		});
	});

	describe('readFileLine', () => {
		it('should read first line of a file', async () => {
			const filePath = path.join(tempDir, 'lines.txt');
			fs.writeFileSync(filePath, 'first line\nsecond line\nthird line');

			const line = await fileUtil.readFileLine(filePath);
			expect(line).toBe('first line');
		});

		it('should read single line file', async () => {
			const filePath = path.join(tempDir, 'single.txt');
			fs.writeFileSync(filePath, 'only line');

			const line = await fileUtil.readFileLine(filePath);
			expect(line).toBe('only line');
		});

		it('should reject for non-existent file', async () => {
			expect(fileUtil.readFileLine('/nonexistent/file.txt')).rejects.toThrow();
		});
	});
});
