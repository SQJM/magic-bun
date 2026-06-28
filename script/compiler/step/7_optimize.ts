import htmlMinifier from 'html-minifier-terser';
import { transform as lightningcssTransform } from 'lightningcss';
import { minifySync } from '@swc/core';
import path from 'node:path';
import { printf } from '../../util/printf.ts';
import { fileUtil } from '../../util/file-util.ts';
import { getDirAllFile } from '../../util/get-dir-all-file.ts';
import { project } from '../global.ts';
import { generateModuleTestPage } from '../compile-modules.ts';
import { writeFileSync } from 'node:fs';
import { saveCache, getCachePath } from '../../util/build-cache.ts';
import { BUILD_TIMER } from '../start.ts';
import { pluginManager } from '../plugin.ts';

function processCssString(cssString: string, minify: boolean): string {
	const result = lightningcssTransform({
		filename: 'input.css',
		code: new TextEncoder().encode(cssString),
		minify,
		targets: {
			chrome: 140 << 16,
			firefox: 140 << 16,
			safari: 15 << 16
		}
	});
	return new TextDecoder('utf-8').decode(result.code);
}

function writeOutputFiles(paths: string[]): void {
	if (project.build_config.build.module) {
		const moduleData: Record<string, unknown> = {
			...project.build_config.config,
			dir: project.build_config.build.out,
			model: project.build_config.build.model,
			files: ['default-theme-var.css', ...paths]
		};
		moduleData.src = undefined;
		if (!project._dryRun) {
			writeFileSync(path.join(project.outDir, 'module.info.json'), JSON.stringify(moduleData, null, 2));
			generateModuleTestPage();
		}
	} else {
		if (!project._dryRun) {
			writeFileSync(path.join(project.outDir, 'index.html'), project.index_dom.generate());
		}
	}
}

const minifyOptions = {
	collapseWhitespace: true,
	removeEmptyAttributes: false,
	collapseBooleanAttributes: false,
	removeAttributeQuotes: true,
	minifyCSS: false,
	minifyJS: false,
	removeStyleLinkTypeAttributes: false,
	removeScriptTypeAttributes: false
} as const;

async function minifyHTML(html: string): Promise<string> {
	return await htmlMinifier.minify(html, minifyOptions);
}

async function minifyJS(code: string): Promise<string> {
	const optimize = project.build_config.build.optimize['min-code'];
	if (!optimize.js) return code;
	const result = minifySync(code, {
		compress: true,
		mangle: true,
		module: false,
		format: { beautify: false }
	});
	return result.code;
}

async function minifyCSS(css: string): Promise<string> {
	const optimize = project.build_config.build.optimize['min-code'];
	if (!optimize.css) return css;
	return processCssString(css, true);
}

async function processFile(file: string): Promise<void> {
	const ext = fileUtil.getExtensionName(file);

	switch (ext) {
	case 'html':
		if (!project.build_config.build.optimize['min-code'].html) return;
		break;
	case 'js':
		if (!project.build_config.build.optimize['min-code'].js) return;
		break;
	case 'css':
		if (!project.build_config.build.optimize['min-code'].css) return;
		break;
	default:
		return;
	}

	let data = await Bun.file(file).text();

	switch (ext) {
	case 'html':
		if (project.build_config.build.optimize['min-code'].html) {
			data = await minifyHTML(data);
		}
		break;
	case 'js':
		try {
			data = await minifyJS(data);
		} catch (e) {
			printf.error(e);
			printf.outFile.error(`JS 压缩失败: ${file}`);
		}
		break;
	case 'css':
		try {
			data = await minifyCSS(data);
		} catch (e) {
			printf.error('CSS 处理失败:', e);
		}
		break;
	}

	if (!project._dryRun) {
		await Bun.write(file, data);
	}
}

async function optimizeAllFiles(): Promise<void> {
	const files = getDirAllFile(project.outDir);
	await Promise.all(files.map((file) => processFile(file)));
}

export function _end(paths: string[], newCacheEntries?: Record<string, { hash: string; outputs: string[] }>): Promise<void> {
	writeOutputFiles(paths);
	BUILD_TIMER.lap('优化输出');
	if (newCacheEntries && !project._dryRun) {
		saveCache(getCachePath(project.dir), newCacheEntries);
	}
	pluginManager.notify('onBuildEnd', paths, newCacheEntries || {});

	// debug 模式且所有 minify 关闭时跳过 optimizeAllFiles(目录遍历开销)
	const opt = project.build_config.build.optimize['min-code'];
	if (opt.js || opt.css || opt.html) {
		optimizeAllFiles();
	}

	// /==UPDATE== 通知无需阻塞构建
	const c = project.build_config.dev?.server;
	if (c?.port && c?.host) {
		fetch(`http://${c.host}:${c.port}/==UPDATE==`).catch(() => {});
	}

	return Promise.resolve();
}
