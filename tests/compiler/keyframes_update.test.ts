import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { app } from '../../app.ts';
import { BuildProject } from '../../script/build-project.ts';

describe('keyframes in component CSS', () => {
	let tempDir: string;
	const originalProjectDir = app.project.dir;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-kf-')) + path.sep;
		app.project.dir = tempDir;

		const buildToml = `
[config]
name = "kf-test"
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

		const appXml = `<app lang="zh">
    <title>KF Test</title>
    <import>
    </import>
</app>`;
		fs.writeFileSync(path.join(tempDir, 'app', 'app.xml'), appXml);
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

	function writeComponent(cssBody: string): void {
		const m = `<import root="">
</import>

<template>
    <div #id="app"><h1>Hi</h1></div>
</template>

<script code="global">
    const { $app } = $id();
</script>

<css scope="#id:app" keyframes>
${cssBody}
</css>`;
		fs.writeFileSync(path.join(tempDir, 'app', 'index.m'), m);
	}

	const kfName = 'index-spin';  // FILE_NAME = index, prefix = index-, renamed keyframe = index-spin

	it('should inline keyframes into component CSS with prefixed names', async () => {
		writeComponent(`@keyframes spin { 0% { opacity: 0; } 100% { opacity: 1; } }`);
		await BuildProject();

		const cssPath = path.join(tempDir, 'build', 'magic', 'index.css');
		expect(fs.existsSync(cssPath)).toBe(true);
		const css = fs.readFileSync(cssPath, 'utf-8');
		expect(css).toContain('@keyframes ' + kfName);
	});

	it('should regenerate component CSS with updated keyframes on content change', async () => {
		writeComponent(`@keyframes spin { 0% { opacity: 0; } 100% { opacity: 1; } }`);
		await BuildProject();

		const cssPath = path.join(tempDir, 'build', 'magic', 'index.css');
		const v1 = fs.readFileSync(cssPath, 'utf-8');
		const v1Count = (v1.match(new RegExp('@keyframes\\s+' + kfName + '\\b', 'g')) || []).length;
		expect(v1Count).toBe(1);

		// Build 2: modified keyframes
		writeComponent(`@keyframes spin { 0% { opacity: 0; } 100% { transform: scale(0.5); } }`);
		await BuildProject();

		const v2 = fs.readFileSync(cssPath, 'utf-8');
		const v2Count = (v2.match(new RegExp('@keyframes\\s+' + kfName + '\\b', 'g')) || []).length;
		expect(v2Count).toBe(1);
		expect(v2).toContain('transform: scale(0.5)');
	});

	it('should include multiple keyframes in component CSS', async () => {
		writeComponent(
			`@keyframes spin { 0% { opacity: 0; } 100% { opacity: 1; } }\n@keyframes pulse { 0% { transform: scale(1); } 100% { transform: scale(1.1); } }`
		);
		await BuildProject();

		const cssPath = path.join(tempDir, 'build', 'magic', 'index.css');
		const css = fs.readFileSync(cssPath, 'utf-8');
		expect(css).toContain('@keyframes index-spin');
		expect(css).toContain('@keyframes index-pulse');
	});

	it('should not contain animation-keyframes.css global file', async () => {
		writeComponent(`@keyframes spin { 0% { opacity: 0; } 100% { opacity: 1; } }`);
		await BuildProject();

		const kfPath = path.join(tempDir, 'build', 'magic', 'animation-keyframes.css');
		expect(fs.existsSync(kfPath)).toBe(false);

		const html = fs.readFileSync(path.join(tempDir, 'build', 'index.html'), 'utf-8');
		expect(html).not.toContain('animation-keyframes.css');
	});

	it('should handle component with no keyframes normally', async () => {
		writeComponent(`body { color: red; }`);
		await BuildProject();

		const kfPath = path.join(tempDir, 'build', 'magic', 'animation-keyframes.css');
		expect(fs.existsSync(kfPath)).toBe(false);

		const cssPath = path.join(tempDir, 'build', 'magic', 'index.css');
		expect(fs.existsSync(cssPath)).toBe(true);
	});
});
