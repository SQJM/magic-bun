import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { app } from '../app.ts';
import { completeProject } from '../script/complete-project.ts';
import { printf } from '../script/util/printf.ts';

describe('completeProject', () => {
	let tempDir: string;
	const originalDir = app.project.dir;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-complete-')) + path.sep;
		app.project.dir = tempDir;
	});

	afterEach(() => {
		app.project.dir = originalDir;
		if (fs.existsSync(tempDir)) {
			fs.rmdirSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should throw when build.toml is missing', () => {
		expect(() => completeProject({ fix: false })).toThrow('build.toml');
	});

	it('should detect missing magic-lock.json', () => {
		fs.writeFileSync(path.join(tempDir, 'build.toml'), `
[config]
name = "test-project"
src = "app"
main = "index"

[build]
module = false
`);

		const lockPath = path.join(tempDir, 'magic-lock.json');
		expect(fs.existsSync(lockPath)).toBe(false);

		completeProject({ fix: true });

		expect(fs.existsSync(lockPath)).toBe(true);
		const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
		expect(lock.modules).toBeDefined();
	});

	it('should detect missing magic-module.json', () => {
		fs.writeFileSync(path.join(tempDir, 'build.toml'), `
[config]
name = "test-project"
src = "app"
main = "index"

[build]
module = false
`);

		const manifestPath = path.join(tempDir, 'magic-module.json');
		expect(fs.existsSync(manifestPath)).toBe(false);

		completeProject({ fix: true });

		expect(fs.existsSync(manifestPath)).toBe(true);
	});

	it('should detect missing app.xml for non-module project', () => {
		fs.writeFileSync(path.join(tempDir, 'build.toml'), `
[config]
name = "test-project"
src = "app"
main = "index"

[build]
module = false
`);

		fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });

		const appXmlPath = path.join(tempDir, 'app', 'app.xml');
		expect(fs.existsSync(appXmlPath)).toBe(false);

		completeProject({ fix: true });

		expect(fs.existsSync(appXmlPath)).toBe(true);
	});

	it('should detect missing entry .m file for non-module project', () => {
		fs.writeFileSync(path.join(tempDir, 'build.toml'), `
[config]
name = "test-project"
src = "app"
main = "index"

[build]
module = false
`);

		fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });

		const entryPath = path.join(tempDir, 'app', 'index.m');
		expect(fs.existsSync(entryPath)).toBe(false);

		completeProject({ fix: true });

		expect(fs.existsSync(entryPath)).toBe(true);
	});

	it('should detect missing source directory', () => {
		fs.writeFileSync(path.join(tempDir, 'build.toml'), `
[config]
name = "test-project"
src = "app"
main = "index"

[build]
module = false
`);

		const srcDir = path.join(tempDir, 'app');
		expect(fs.existsSync(srcDir)).toBe(false);

		completeProject({ fix: true });

		expect(fs.existsSync(srcDir)).toBe(true);
	});

	it('should skip app.xml and entry checks for module project', () => {
		fs.writeFileSync(path.join(tempDir, 'build.toml'), `
[config]
name = "test-module"
src = "app"
main = "index"

[build]
module = true
`);

		completeProject({ fix: true });

		expect(fs.existsSync(path.join(tempDir, 'app', 'app.xml'))).toBe(false);
	});

	it('should not auto-fix when fix option is false', () => {
		fs.writeFileSync(path.join(tempDir, 'build.toml'), `
[config]
name = "test-project"
src = "app"
main = "index"

[build]
module = false
`);

		fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });

		completeProject({ fix: false });

		expect(fs.existsSync(path.join(tempDir, 'magic-lock.json'))).toBe(false);
	});
});
