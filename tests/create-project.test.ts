import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { app } from '../app.ts';
import { createProject } from '../script/create-project.ts';

describe('createProject', () => {
	let tempDir: string;
	const originalDir = app.project.dir;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-create-')) + path.sep;
		app.project.dir = tempDir;
	});

	afterEach(() => {
		app.project.dir = originalDir;
		if (fs.existsSync(tempDir)) {
			fs.rmdirSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should create project with build.toml', () => {
		createProject('test-web');
		const tomlPath = path.join(tempDir, 'test-web', 'build.toml');
		expect(fs.existsSync(tomlPath)).toBe(true);
		const content = fs.readFileSync(tomlPath, 'utf-8');
		expect(content).toContain('test-web');
	});

	it('should create app.xml and index.m', () => {
		createProject('test-web');
		const projectDir = path.join(tempDir, 'test-web');
		expect(fs.existsSync(path.join(projectDir, 'app', 'app.xml'))).toBe(true);
		expect(fs.existsSync(path.join(projectDir, 'app', 'index.m'))).toBe(true);
	});

	it('should throw on invalid project name with special chars', () => {
		expect(() => createProject('test<name>')).toThrow('非法字符');
	});

	it('should throw on empty project name', () => {
		expect(() => createProject('')).toThrow('非法字符');
	});

	it('should throw on project name starting with dot', () => {
		expect(() => createProject('.hidden')).toThrow('非法字符');
	});
});
