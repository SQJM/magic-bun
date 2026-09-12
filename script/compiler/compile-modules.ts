import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { app } from '../../app.ts';
import { printf } from '../util/printf.ts';
import { fileUtil } from '../util/file-util.ts';
import { copyDir } from '../util/copy-dir.ts';
import { project } from './global.ts';
import { mData } from './step/5_compile.ts';
import { generateModuleJS } from './step/6_generate.ts';
import type { SourceFile, MDataOutput } from '../types.ts';
import { log } from 'node:console';

interface ModuleReference {
	tag: string;
	src: string;
	load: string;
	noModule: boolean;
	content?: string;
}

function escapeHtmlText(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface ModuleImportItem {
	tag: string;
	file: string;
	load: string;
	content?: string;
}

function parseModuleImportFileContent(filePath: string): ModuleImportItem[] {
	if (!fs.existsSync(filePath)) return [];
	const content = fs.readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');
	const result: ModuleImportItem[] = [];
	let currentSection: string | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;

		if (trimmed === 'js') { currentSection = 'js'; continue; }
		if (trimmed === 'css') { currentSection = 'css'; continue; }
		if (trimmed === 'link') { currentSection = 'link'; continue; }
		if (trimmed === 'file') { currentSection = 'file'; continue; }

		if (trimmed.startsWith('-') && currentSection) {
			let item = trimmed.substring(1).trim();
			let load = 'begin';
			const loadMatch = item.match(/^\[load:(\w+)\]\s*(.+)/);
			if (loadMatch) {
				load = loadMatch[1];
				item = loadMatch[2].trim();
			}
			if (currentSection === 'file') {
				const absPath = path.resolve(path.dirname(filePath), item);
				const fileContent = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : '';
				result.push({ tag: currentSection, file: item, load, content: fileContent });
			} else {
				result.push({ tag: currentSection, file: item, load });
			}
		}
	}
	return result;
}

function parseModuleAppXml(appXmlPath: string, moduleBaseDir: string): ModuleReference[] {
	if (!fs.existsSync(appXmlPath)) return [];

	const content = fs.readFileSync(appXmlPath, 'utf-8');
	if (content.trim().length === 0) return [];

	const dom = parse(content);
	const importEl = dom.querySelector('app>import');
	if (!importEl) return [];

	return parseModuleImportChildren(importEl, moduleBaseDir, '');
}

function parseModuleImportChildren(
	parentEl: { childNodes: unknown[] },
	baseDir: string,
	dirPrefix: string
): ModuleReference[] {
	const refs: ModuleReference[] = [];

	parentEl.childNodes.forEach((node) => {
		if ((node as { nodeType: number }).nodeType === 3) return;

		const el = node as {
			rawTagName: string;
			hasAttribute(name: string): boolean;
			getAttribute(name: string): string;
			attrs: Record<string, string>;
			childNodes: unknown[];
		};

		const tagName = el.rawTagName.toLowerCase();
		const noModule = el.hasAttribute('no-module');
		const load = el.getAttribute('load') || 'begin';

		if (tagName === 'group') {
			const groupDir = el.getAttribute('dir') || '';
			const fullDir = dirPrefix ? path.posix.join(dirPrefix, groupDir) : groupDir;
			refs.push(...parseModuleImportChildren(el, baseDir, fullDir));
			return;
		}

		if (tagName === 'module-import') {
			const src = el.getAttribute('src') || '';
			if (!src) return;
			const fullSrc = dirPrefix ? path.posix.join(dirPrefix, src) : src;
			const moduleDir = path.resolve(baseDir, fullSrc);
			const moduleImportFile = path.join(moduleDir, '.module-import');
			if (fs.existsSync(moduleImportFile)) {
				const parsed = parseModuleImportFileContent(moduleImportFile);
				parsed.forEach((item) => {
					const itemLoad = item.load || load;
					const itemSrc = path.join(moduleDir, item.file);
					const mref: ModuleReference = {
						tag: item.tag,
						src: itemSrc,
						load: itemLoad,
						noModule,
						content: item.content
					};
					if (item.tag !== 'file' || fs.existsSync(itemSrc)) {
						refs.push(mref);
					}
				});
			}
			return;
		}

		if (tagName === 'file') {
			const filePath = el.getAttribute('path') || '';
			if (!filePath) return;
			const fullPath = dirPrefix ? path.posix.join(dirPrefix, filePath) : filePath;
			const absPath = path.resolve(baseDir, fullPath);
			let fileContent = '';
			if (fs.existsSync(absPath)) {
				fileContent = fs.readFileSync(absPath, 'utf-8');
			}
			refs.push({ tag: 'file', src: absPath, load, noModule, content: fileContent });
			return;
		}

		if (tagName === 'js') {
			const src = el.getAttribute('src') || '';
			if (!src) return;
			const fullSrc = dirPrefix ? path.posix.join(dirPrefix, src) : src;
			refs.push({ tag: 'js', src: path.join(baseDir, fullSrc), load, noModule });
		} else if (tagName === 'css') {
			const src = el.getAttribute('src') || '';
			if (!src) return;
			const fullSrc = dirPrefix ? path.posix.join(dirPrefix, src) : src;
			refs.push({ tag: 'css', src: path.join(baseDir, fullSrc), load, noModule });
		} else if (tagName === 'link') {
			const href = el.getAttribute('href') || '';
			if (!href) return;
			const fullHref = dirPrefix ? path.posix.join(dirPrefix, href) : href;
			refs.push({ tag: 'link', src: path.join(baseDir, fullHref), load, noModule });
		}
	});

	return refs;
}

function collectMFiles(srcDir: string): string[] {
	const result: string[] = [];
	if (!fs.existsSync(srcDir)) return result;

	function walk(dir: string): void {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		entries.forEach((entry) => {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== 'magic') walk(full);
			} else if (entry.name.endsWith('.m')) {
				result.push(full);
			}
		});
	}
	walk(srcDir);
	return result;
}

class ModuleSource {
	#absolutePath: string;
	#relativePath: string;
	ext = 'm';

	constructor(abs: string, rel: string) {
		this.#absolutePath = abs;
		this.#relativePath = rel;
	}

	absolute(): string { return this.#absolutePath; }
	relative(): string { return this.#relativePath; }
	get changed(): boolean { return true; }
	get contentHash(): string {
		return Bun.hash(fs.readFileSync(this.#absolutePath, 'utf-8')).toString(16);
	}
}

function handleModuleAppXmlRefs(_modName: string, modDir: string, modSrcDir: string): void {
	const appXmlPath = path.join(modDir, modSrcDir, 'app.xml');
	const refs = parseModuleAppXml(appXmlPath, modDir);

	const mainBuildOut = path.join(app.project.dir, project.build_config.build.out);

	refs.forEach((ref) => {
		if (ref.noModule) return;

		if (ref.tag === 'file') {
			project.index_dom.add(ref.load, {
				tag: 'script',
				attrs: [],
				content: ref.content || ''
			} as never);
			return;
		}

		if (!fs.existsSync(ref.src)) return;

		const buildRelPath = path.relative(app.project.dir, ref.src).replace(/\\/g, '/');
		const destPath = path.join(mainBuildOut, buildRelPath);

		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		fs.copyFileSync(ref.src, destPath);

		const relForHtml = buildRelPath.startsWith('.') ? buildRelPath : './' + buildRelPath;
		if (ref.tag === 'js') {
			project.index_dom.add(ref.load, {
				tag: 'script',
				attrs: [{ src: relForHtml }]
			});
		} else if (ref.tag === 'css') {
			project.index_dom.add(ref.load, {
				tag: 'link',
				one: true,
				attrs: [{ href: relForHtml }, { rel: 'stylesheet' }]
			});
		} else if (ref.tag === 'link') {
			project.index_dom.add(ref.load, {
				tag: 'link',
				one: true,
				attrs: [{ href: relForHtml }]
			});
		}
	});
}

function handleModuleDeps(modConfig: Record<string, unknown>, modName: string): void {
	const buildSection = (modConfig as Record<string, Record<string, unknown>>).build;
	const importSection = buildSection?.['import'] as Record<string, string[] | undefined> | undefined;
	const imports = importSection?.module;
	if (!imports || imports.length === 0) return;

	const magicModuleDir = path.join(app.project.dir, 'magic_module');
	fs.mkdirSync(magicModuleDir, { recursive: true });

	imports.forEach((depPath: string) => {
		const depDir = path.join(magicModuleDir, depPath);
		if (fs.existsSync(depDir)) return;

		printf.outFile.info(`模块 "${modName}" 依赖 "${depPath}" 未安装,尝试自动下载...`);

		const parts = depPath.split('/');
		if (parts.length === 2) {
			const [user, repo] = parts;
			const buildTomlUrl = `https://raw.githubusercontent.com/${user}/${repo}/main/build.toml`;
			fetch(buildTomlUrl, { method: 'HEAD' })
				.then((res) => {
					if (res.status !== 200) {
						printf.outFile.info(`模块 "${depPath}" 在 GitHub 上未找到,请手动安装`);
						return;
					}
					printf.outFile.info(`发现模块 "${depPath}",请执行: magic add @${user}/${repo}`);
				})
				.catch(() => {
					printf.outFile.info(`无法连接 GitHub,请手动安装模块 "${depPath}"`);
				});
		}
	});
}

function writeModuleFile(outDir: string, relPath: string, content: string): void {
	const filePath = path.join(outDir, relPath);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
}

function processOneModule(modName: string, moduleSrcDir: string, moduleOutDir: string): void {
	const modDir = path.join(moduleSrcDir, modName);
	const modBuildToml = path.join(modDir, 'build.toml');

	if (!fs.existsSync(modBuildToml)) {
		printf.outFile.info(`跳过 "${modName}": 缺少 build.toml`);
		return;
	}

	printf.outFile.info(`编译模块: ${modName}`);

	const tomlContent = fs.readFileSync(modBuildToml, 'utf-8');
	let modConfig: Record<string, unknown>;
	try {
		modConfig = Bun.TOML.parse(tomlContent) as Record<string, unknown>;
	} catch {
		printf.outFile.error(`模块 "${modName}" 的 build.toml 格式错误,跳过`);
		return;
	}

	const configSection = (modConfig as Record<string, Record<string, string>>).config;
	const modSrcKey = configSection?.src || 'app';
	const modSrcPath = path.join(modDir, modSrcKey);

	if (!fs.existsSync(modSrcPath)) {
		printf.outFile.info(`模块 "${modName}": 源码目录不存在,跳过`);
		return;
	}

	const modOutPath = path.join(moduleOutDir, modName);
	const modOutMagic = path.join(modOutPath, 'magic');
	fs.mkdirSync(modOutMagic, { recursive: true });

	const savedSrcDir = project.srcDir;
	const savedOutDir = project.outDir;
	const savedOutDirMagic = project.outDirMagic;
	project.srcDir = path.normalize(modSrcPath + '/');
	project.outDir = path.normalize(modOutPath + '/');
	project.outDirMagic = path.normalize(modOutMagic + '/');

	const mFiles = collectMFiles(modSrcPath);
	const compiledData: unknown[] = [];

	mFiles.forEach((mFile) => {
		try {
			const source = new ModuleSource(mFile, path.relative(modSrcPath, mFile));
			const data = new mData(source as unknown as SourceFile);
			data.init();
			compiledData.push(data);
		} catch (e) {
			printf.outFile.error(`模块 "${modName}" 编译失败: ${e}`);
		}
	});

	const outputFiles: string[] = [];

	compiledData.forEach((d) => {
		const md = (d as { data: MDataOutput }).data;
		const jsCode = generateModuleJS(md);

		const jsName = md.name + '.js';
		writeModuleFile(modOutPath, 'magic/' + jsName, jsCode);
		outputFiles.push('magic/' + jsName);

		if (md.css && md.css.trim()) {
			const cssName = md.name + '.css';
			writeModuleFile(modOutPath, 'magic/' + cssName, md.css);
			outputFiles.push('magic/' + cssName);
		}
	});

	fs.writeFileSync(
		path.join(modOutPath, 'module.info.json'),
		JSON.stringify({ dir: modName, files: outputFiles }, null, '\t')
	);

	handleModuleAppXmlRefs(modName, modDir, modSrcKey);
	handleModuleDeps(modConfig, modName);

	project.srcDir = savedSrcDir;
	project.outDir = savedOutDir;
	project.outDirMagic = savedOutDirMagic;

	printf.outFile.info(`模块 "${modName}" 编译完成: ${outputFiles.length} 个文件`);
}

export function generateModuleTestPage(): void {
	const outDir = project.outDir;

	const magicDir = path.join(outDir, 'magic');
	if (!fs.existsSync(magicDir)) {
		fs.mkdirSync(magicDir, { recursive: true });
	}

	const runtimeJsPath = path.join(magicDir, 'runtime.js');
	if (!fs.existsSync(runtimeJsPath)) {
		fs.writeFileSync(
			runtimeJsPath,
			`window["magic_version"] = "${app.version}";\n${app.templateDir.runtime.get('runtime.js')}`
		);
	}
	const runtimeCssPath = path.join(magicDir, 'runtime.css');
	if (!fs.existsSync(runtimeCssPath)) {
		fs.writeFileSync(runtimeCssPath, app.templateDir.runtime.get('runtime.css'));
	}

	let headContent = '';

	if (fs.existsSync(path.join(outDir, 'default-theme-var.css'))) {
		headContent = '<link href="./default-theme-var.css" rel="stylesheet"/>\n';
	}

	const moduleInfoPath = path.join(outDir, 'module.info.json');
	if (fs.existsSync(moduleInfoPath)) {
		const moduleInfo = JSON.parse(fs.readFileSync(moduleInfoPath, 'utf-8'));
		(moduleInfo.files || []).forEach((file: string) => {
			if (file === 'default-theme-var.css') return;
			const ext = fileUtil.getExtensionName(file);
			if (ext === 'js') {
				headContent += `<script src="./${file}"></script>\n`;
			} else if (ext === 'css') {
				headContent += `<link href="./${file}" rel="stylesheet"/>\n`;
			}
		});
	}

	const appXmlPath = path.join(app.project.dir, project.build_config.config.src, 'app.xml');
	const refs = parseModuleAppXml(appXmlPath, app.project.dir);

	const frontResources: string[] = [];
	const beginResources: string[] = [];
	const endResources: string[] = [];

	refs.forEach((ref) => {
		let htmlStr = '';
		if (ref.tag === 'js' || ref.tag === 'css' || ref.tag === 'link') {
			if (!fs.existsSync(ref.src)) return;

			const relPath = path.relative(app.project.dir, ref.src).replace(/\\/g, '/');
			const destPath = path.join(outDir, relPath);
			fs.mkdirSync(path.dirname(destPath), { recursive: true });
			fs.copyFileSync(ref.src, destPath);

			const relForHtml = relPath.startsWith('.') ? relPath : './' + relPath;
			if (ref.tag === 'js') {
				htmlStr = `<script src="${relForHtml}"></script>`;
			} else if (ref.tag === 'css') {
				htmlStr = `<link href="${relForHtml}" rel="stylesheet"/>`;
			} else if (ref.tag === 'link') {
				htmlStr = `<link href="${relForHtml}"/>`;
			}
		} else if (ref.tag === 'file') {
			htmlStr = `<script>${ref.content || ''}</script>`;
		}

		if (htmlStr) {
			if (ref.load === 'front') frontResources.push(htmlStr);
			else if (ref.load === 'end') endResources.push(htmlStr);
			else beginResources.push(htmlStr);
		}
	});

	const escapedTitle = escapeHtmlText(project.build_config.config.name || 'Module Test');
	const html = `<!DOCTYPE html>
<html lang="zh">

<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=0" />
<title>${escapedTitle}</title>
<link href="./magic/runtime.css" rel="stylesheet"/>
<script src="./magic/runtime.js"></script>
${frontResources.join('\n')}
${beginResources.join('\n')}
${headContent}
</head>

<body>
<m-cache-element></m-cache-element>
<div id="app"></div>
${endResources.join('\n')}
<script>
magic.init("${project.build_config.config.main}");
</script>
</body>

</html>`;

	fs.writeFileSync(path.join(outDir, 'index.html'), html);
	printf.outFile.info(`模块测试页面已生成 [path:${path.join(outDir, 'index.html')}]`);
}

export async function handleModules(): Promise<void> {
	const moduleSrc = project.build_config.build['module-src'];
	const moduleOut = project.build_config.build['module-out'];

	if (!moduleSrc || !moduleOut) return;

	const moduleSrcDir = path.join(app.project.dir, moduleSrc);
	if (!fs.existsSync(moduleSrcDir)) return;

	const moduleOutDir = path.join(app.project.dir, moduleOut);
	fs.mkdirSync(moduleOutDir, { recursive: true });

	printf.outFile.info(`处理模块: ${moduleSrc}`);

	const moduleDirs = fs.readdirSync(moduleSrcDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	if (moduleDirs.length === 0) {
		printf.outFile.info(`模块目录为空`);
		return;
	}

	const origSrcDir = project.srcDir;
	const origOutDir = project.outDir;
	const origOutDirMagic = project.outDirMagic;

	const results = await Promise.allSettled(
		moduleDirs.map(async (modName) => {
			try {
				processOneModule(modName, moduleSrcDir, moduleOutDir);
			} finally {
				project.srcDir = origSrcDir;
				project.outDir = origOutDir;
				project.outDirMagic = origOutDirMagic;
			}
		})
	);

	results.forEach((r, i) => {
		if (r.status === 'rejected') {
			printf.outFile.error(`模块 "${moduleDirs[i]}" 编译异常: ${r.reason}`);
		}
	});

	const mainBuildOut = path.join(app.project.dir, project.build_config.build.out);
	copyDir(moduleOutDir, mainBuildOut);

	printf.outFile.info(`模块处理完成: ${moduleDirs.length} 个模块`);
}
