import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { app } from '../../app.ts';
import { BuildProject } from '../../script/build-project.ts';

describe('release-mode chunk splitting', () => {
	let tempDir: string;
	const originalProjectDir = app.project.dir;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-chunk-')) + path.sep;
		app.project.dir = tempDir;
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

	function writeProject(tomlBody: string, componentBody: string): void {
		fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });
		fs.writeFileSync(path.join(tempDir, 'build.toml'), tomlBody);
		fs.writeFileSync(
			path.join(tempDir, 'app', 'app.xml'),
			`<app lang="zh">
    <title>T</title>
    <import>
    </import>
</app>`
		);
		fs.writeFileSync(path.join(tempDir, 'app', 'index.m'), componentBody);
	}

	const component = `<import root="">
</import>

<template>
    <div #id="app"><h1>Hello</h1></div>
</template>

<script code="global">
    const { $app } = $id();
</script>

<css scope="#id:app">
    & { color: red; }
</css>`;

	const baseToml = `
[config]
name = "chunk-test"
src = "app"
main = "index"

[build]
out = "build"
model = "release"
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

	it('writes a single m.js when chunk-size=0 (no chunking)', async () => {
		writeProject(
			baseToml + `[build.output]\nchunk-size = 0\n`,
			component
		);
		await BuildProject();

		const magicDir = path.join(tempDir, 'build', 'magic');
		const chunkFiles = fs.readdirSync(magicDir).filter(f => /^m(-\d+)?\.js$/.test(f));
		expect(chunkFiles).toEqual(['m.js']);

		const html = fs.readFileSync(path.join(tempDir, 'build', 'index.html'), 'utf-8');
		const scriptMatches = html.match(/script[^>]*src="\.\/magic\/m[^"]*\.js"/g) || [];
		expect(scriptMatches.length).toBe(1);
	});

	it('splits into multiple m-*.js files when chunk-size is small', async () => {
		writeProject(
			baseToml + `[build.output]\nchunk-size = 1\n`,
			component
		);
		await BuildProject();

		const magicDir = path.join(tempDir, 'build', 'magic');
		const chunkFiles = fs.readdirSync(magicDir)
			.filter(f => /^m(-\d+)?\.js$/.test(f))
			.sort((a, b) => {
				const ai = a === 'm.js' ? 0 : parseInt(a.slice(2), 10);
				const bi = b === 'm.js' ? 0 : parseInt(b.slice(2), 10);
				return ai - bi;
			});

		expect(chunkFiles.length).toBeGreaterThan(1);
		expect(chunkFiles[0]).toBe('m.js');
		expect(chunkFiles[1]).toBe('m-1.js');

		const html = fs.readFileSync(path.join(tempDir, 'build', 'index.html'), 'utf-8');
		const scriptMatches = html.match(/script[^>]*src="\.\/magic\/m[^"]*\.js"/g) || [];
		expect(scriptMatches.length).toBe(chunkFiles.length);
	});

	it('falls back to MScriptBlockSize (1MB) when chunk-size is undefined', async () => {
		writeProject(baseToml, component);
		await BuildProject();

		const magicDir = path.join(tempDir, 'build', 'magic');
		const chunkFiles = fs.readdirSync(magicDir).filter(f => /^m(-\d+)?\.js$/.test(f));
		expect(chunkFiles).toEqual(['m.js']);
	});
});
