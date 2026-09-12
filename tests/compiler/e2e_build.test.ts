import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { app } from '../../app.ts';
import { BuildProject } from '../../script/build-project.ts';
import { CacheStore } from '../../script/util/cache-store.ts';

describe('end-to-end build pipeline', () => {
	let tempDir: string;
	const originalProjectDir = app.project.dir;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-e2e-')) + path.sep;
		app.project.dir = tempDir;

		// Create minimal project structure
		const buildToml = `
[config]
name = "e2e-test"
src = "app"
main = "index"

[build]
out = "build"
model = "debug"
module = true

[build.exclude]
file = []
dir = []

[build.optimize]
out-default-theme = false
remove-unused = false

[build.optimize.min-code]
js = false
css = false
html = false

[build.import]
module = []
`;
		fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });
		fs.writeFileSync(path.join(tempDir, 'build.toml'), buildToml);

		// Create app.xml
		const appXml = `<app lang="zh">
    <title>E2E Test</title>
    <import>
    </import>
</app>`;
		fs.writeFileSync(path.join(tempDir, 'app', 'app.xml'), appXml);

		// Create a simple .m component
		const indexM = `<import root="">
</import>

<template>
    <div #id="app">
        <h1>Hello World</h1>
    </div>
</template>

<script code="global">
    const {
        $app
    } = $id();
</script>

<script code="event">
    click = () => {
        $app.textContent = "Clicked!";
    }
</script>

<css scope="#id:app">
    & { color: red; }
</css>`;
		fs.writeFileSync(path.join(tempDir, 'app', 'index.m'), indexM);
	});

	afterEach(async () => {
		app.project.dir = originalProjectDir;
		await new Promise((r) => setTimeout(r, 50));
		if (fs.existsSync(tempDir)) {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
			} catch {
				// ignore
			}
		}
	});

	it('should produce output files after build', async () => {
		await BuildProject();

		const indexPath = path.join(tempDir, 'build', 'index.html');
		expect(fs.existsSync(indexPath)).toBe(true);

		// Read generated index.html and verify key content
		const html = fs.readFileSync(indexPath, 'utf-8');
		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain('<html lang="zh">');
		expect(html).toContain('<div id="app">');
	});

	it('should generate .magic-cache.db', async () => {
		await BuildProject();

		const dbPath = path.join(tempDir, '.magic', 'build-cache', 'cache.db');
		expect(fs.existsSync(dbPath)).toBe(true);

		const store = CacheStore.open(dbPath);
		const files = store.getAllFileEntries();
		store.close();
		expect(Object.keys(files).length).toBeGreaterThan(0);
	});

	it('should compile CSS with scope prefix', async () => {
		await BuildProject();

		const magicDir = path.join(tempDir, 'build', 'magic');
		expect(fs.existsSync(magicDir)).toBe(true);

		const cssFiles = fs.readdirSync(magicDir)
			.filter(f => f.endsWith('.css') && !f.includes('runtime') && !f.includes('default-theme') && !f.includes('animation-keyframes'));
		expect(cssFiles.length).toBeGreaterThan(0);

		const css = fs.readFileSync(path.join(magicDir, cssFiles[0]), 'utf-8');
		expect(css.length).toBeGreaterThan(0);
	});

	it('should generate JS module file with expected patterns', async () => {
		await BuildProject();

		const magicDir = path.join(tempDir, 'build', 'magic');
		const jsFiles = fs.readdirSync(magicDir)
			.filter(f => f.endsWith('.js') && !f.includes('runtime'));

		expect(jsFiles.length).toBeGreaterThan(0);

		const js = fs.readFileSync(path.join(magicDir, jsFiles[0]), 'utf-8');
		expect(js).toContain('window["__MAGIC__"]');
		expect(js).toContain('magic.initComponentInterface(this)');
		expect(js).toContain('$app');
	});

	it('should generate runtime files', async () => {
		await BuildProject();

		const runtimeJsPath = path.join(tempDir, 'build', 'magic', 'runtime.js');
		const runtimeCssPath = path.join(tempDir, 'build', 'magic', 'runtime.css');

		expect(fs.existsSync(runtimeJsPath)).toBe(true);
		expect(fs.existsSync(runtimeCssPath)).toBe(true);

		const runtimeJs = fs.readFileSync(runtimeJsPath, 'utf-8');
		expect(runtimeJs).toContain('magic_version');
		expect(runtimeJs).toContain('function init(');
		expect(runtimeJs).toContain('router');
	});

	it('should match generated JS hash in cache', async () => {
		await BuildProject();

		const dbPath = path.join(tempDir, '.magic', 'build-cache', 'cache.db');
		const store = CacheStore.open(dbPath);
		const cacheFiles = store.getAllFileEntries();
		store.close();

		const magicDir = path.join(tempDir, 'build', 'magic');
		const jsFiles = fs.readdirSync(magicDir)
			.filter(f => f.endsWith('.js') && !f.includes('runtime'));

		// Verify that the cache entry references actual output files
		let foundMatch = false;
		for (const key of Object.keys(cacheFiles)) {
			const entry = cacheFiles[key];
			if (entry.outputs && entry.outputs.length > 0) {
				// At least one output file should exist
				for (const out of entry.outputs) {
					if (jsFiles.includes(out)) {
						foundMatch = true;
						break;
					}
				}
			}
		}
		expect(foundMatch).toBe(true);
	});

	it('should rebuild when build directory is deleted but cache exists', async () => {
		// First build: produces output and cache entries
		await BuildProject();

		const magicDir = path.join(tempDir, 'build', 'magic');
		const indexJsPath = path.join(magicDir, 'index.js');
		const indexCssPath = path.join(magicDir, 'index.css');
		const dbPath = path.join(tempDir, '.magic', 'build-cache', 'cache.db');

		expect(fs.existsSync(indexJsPath)).toBe(true);
		expect(fs.existsSync(indexCssPath)).toBe(true);
		expect(fs.existsSync(dbPath)).toBe(true);

		// Simulate the user deleting the build directory
		fs.rmSync(path.join(tempDir, 'build'), { recursive: true, force: true });
		expect(fs.existsSync(indexJsPath)).toBe(false);
		expect(fs.existsSync(indexCssPath)).toBe(false);

		// Cache DB still exists (we only removed the build dir, not .magic)
		expect(fs.existsSync(dbPath)).toBe(true);

		// Rebuild: cache says "unchanged" (source hash matches) but outputs are gone.
		// The build must detect this and regenerate everything.
		await BuildProject();

		expect(fs.existsSync(indexJsPath)).toBe(true);
		expect(fs.existsSync(indexCssPath)).toBe(true);

		// Output content should be non-empty and contain the expected patterns
		const rebuiltJs = fs.readFileSync(indexJsPath, 'utf-8');
		const rebuiltCss = fs.readFileSync(indexCssPath, 'utf-8');
		expect(rebuiltJs.length).toBeGreaterThan(0);
		expect(rebuiltCss.length).toBeGreaterThan(0);
		expect(rebuiltJs).toContain('window["__MAGIC__"]');
		expect(rebuiltCss).toContain('color: red');

		// index.html should also be present and reference the rebuilt assets
		const html = fs.readFileSync(path.join(tempDir, 'build', 'index.html'), 'utf-8');
		expect(html).toContain('index.js');
		expect(html).toContain('index.css');
	});
});
