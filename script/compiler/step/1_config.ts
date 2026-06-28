import { parse } from 'node-html-parser';
import path from 'node:path';
import { app } from '../../../app.ts';
import { printf } from '../../util/printf.ts';
import { ProjectBuildConfig, ProjectBuildConfigContrast } from '../../util/config-validate.ts';
import { macroReplace } from '../macro-replace.ts';
import { _2 } from './2_scan.ts';
import { existsSync, readFileSync } from 'node:fs';
import { getCachePath } from '../../util/build-cache.ts';
import { project } from '../global.ts';
import { BUILD_TIMER } from '../start.ts';
import type { BuildConfig, ParsedElement } from '../../types.ts';

function parseModuleImportFile(filePath: string) {
	if (!existsSync(filePath)) {
		throw new Error(`模块的 .module-import 声明文件不存在 [path:${filePath}]`);
	}
	const content = readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');
	const result: {
		js: { file: string; load: string }[];
		css: { file: string; load: string }[];
		link: { file: string; load: string }[];
		file: { file: string; load: string }[];
	} = {
		js: [],
		css: [],
		link: [],
		file: []
	};

	let currentSection: keyof typeof result | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;

		if (trimmed === 'js') {
			currentSection = 'js';
		} else if (trimmed === 'css') {
			currentSection = 'css';
		} else if (trimmed === 'link') {
			currentSection = 'link';
		} else if (trimmed === 'file') {
			currentSection = 'file';
		} else if (trimmed.startsWith('-') && currentSection) {
			let item = trimmed.substring(1).trim();
			let load = 'begin';

			const loadMatch = item.match(/^\[load:(\w+)\]\s*(.+)/);
			if (loadMatch) {
				load = loadMatch[1];
				item = loadMatch[2].trim();
			}

			result[currentSection].push({ file: item, load: load });
		}
	}

	return result;
}

export function examine_BuildConfig(root: BuildConfig): BuildConfig | void {
	printf.outFile.info(`检查项目配置文件`);

	const build_config = root['default'] ?? root;
	const isModule = build_config.build.module === true;

	const result = ProjectBuildConfigContrast(
		ProjectBuildConfig.base,
		build_config as unknown as Record<string, unknown>
	);
	if (result) {
		if (!isModule) {
			const entryPath = path.join(app.project.dir, build_config.config.src, build_config.config.main + '.m');
			if (!existsSync(entryPath))
				throw new Error(`缺少入口文件! [path:${entryPath}]
请在 ${build_config.config.src} 目录下创建 ${build_config.config.main}.m 作为入口组件`);
		}
		return build_config;
	}
}

function examine_AppConfig_parserImport($import: ParsedElement | undefined, srcDir: string) {
	if (!$import) return [];
	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	!$import.hasAttribute('dir') && $import.setAttribute('dir', '.');
	const list: { o: { element: string; load?: string } }[] = [];

	function initDefault(tagName: string, element: ParsedElement) {
		if (tagName === 'js') {
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			!element.hasAttribute('src') && element.setAttribute('src', '');
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			!element.hasAttribute('load') && element.setAttribute('load', 'begin');
		} else if (tagName === 'css') {
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			!element.hasAttribute('src') && element.setAttribute('src', '');
		} else if (tagName === 'link') {
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			!element.hasAttribute('href') && element.setAttribute('href', '');
		} else if (tagName === 'group') {
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			!element.hasAttribute('dir') && element.setAttribute('dir', '');
		} else if (tagName === 'file') {
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			!element.hasAttribute('path') && element.setAttribute('path', '');
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			!element.hasAttribute('load') && element.setAttribute('load', 'begin');
		}
	}

	function generateTag(dir: string, tagName: string, attribs: Record<string, string>): string {
		let attrsString = '';
		for (const attr in attribs) {
			if (attr === 'src' || attr === 'href' || attr === 'load' || attr === 'no-module') continue;
			attrsString += `${attr}="${path.normalize(attribs[attr])}" `.replaceAll('\n', '');
		}
		dir = dir.replace(/\\/g, '/');

		if (tagName === 'js') {
			return `<script src="${dir}/${attribs['src']}" type="text/javascript" ${attrsString}></script>`;
		} else if (tagName === 'css') {
			return `<link rel="stylesheet" type="text/css" href="${dir}/${attribs['src']}" ${attrsString}/>`;
		} else if (tagName === 'link') {
			return `<link href="${dir}/${attribs['href']}" ${attrsString}/>`;
		}
		return '';
	}

	function itGroup(group: ParsedElement, parentDir?: string): void {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		!group.hasAttribute('dir') && group.setAttribute('dir', '');
		const ownDir = group.getAttribute('dir');
		let dir = parentDir
			? path.posix.join(parentDir, ownDir)
			: ownDir;
		if (!/^(\.{1,2}(\/|$)|\/)/.test(dir)) {
			dir = './' + dir;
		}
		const attrs = group.attrs;
		delete attrs?.['dir'];
		group.childNodes.forEach((element) => {
			if (element.nodeType === 3) return;
			const tagName = element.rawTagName.toLowerCase();
			if (tagName === 'group') return itGroup(element, dir);

			if (tagName === 'module-import') {
				const src = element.getAttribute('src');
				if (!src) throw new Error(`app.xml 中 module-import 缺少 src 属性`);
				const moduleDir = path.normalize(path.join(srcDir, dir, src)).replace(/\\/g, '/');
				const moduleImportFile = moduleDir + '/.module-import';
				const parsed = parseModuleImportFile(moduleImportFile);
				const moduleRelativeDir = './' + moduleDir.substring(srcDir.replace(/\\/g, '/').length + 1);

				parsed.js.forEach((item) => {
					list.push({
						o: {
							element: generateTag(moduleRelativeDir, 'js', { src: item.file }),
							load: item.load
						}
					});
				});

				parsed.css.forEach((item) => {
					list.push({
						o: {
							element: generateTag(moduleRelativeDir, 'css', {
								src: item.file
							}),
							load: item.load
						}
					});
				});

				parsed.link.forEach((item) => {
					list.push({
						o: {
							element: generateTag(moduleRelativeDir, 'link', {
								href: item.file
							}),
							load: item.load
						}
					});
				});

				parsed.file.forEach((item) => {
					const filePath = path.normalize(moduleDir + '/' + item.file);
					if (!existsSync(filePath)) throw new Error(`.module-import 中声明的 file 文件不存在 [path:${filePath}]`);
					const content = readFileSync(filePath, 'utf-8');
					list.push({
						o: {
							element: content,
							load: item.load
						}
					});
				});
				return;
			}

			if (tagName === 'js' || tagName === 'css' || tagName === 'link' || tagName === 'file') {
				initDefault(tagName, element);
			} else return;

			if (tagName === 'js' || tagName === 'css' || tagName === 'link') {
				for (const attr in attrs) {
					if (!element.hasAttribute(attr)) element.setAttribute(attr, attrs[attr]);
				}
			}

			const load = element.getAttribute('load');
			element.removeAttribute('load');

			if (tagName === 'file') {
				const content = (() => {
					const ep = element.getAttribute('path');
					if (ep.length > 1) {
						if (!existsSync(ep)) throw new Error(`app.xml 中 file 标签引用的文件不存在 [path:${ep}]`);
						return readFileSync(ep, 'utf-8');
					}
					return '';
				})();
				list.push({
					o: {
						element: content,
						load: load
					}
				});
			} else {
				list.push({
					o: {
						element: generateTag(dir, tagName, element.attrs),
						load: load
					}
				});
			}
		});
	}

	itGroup($import);

	return list;
}

function examine_AppConfig(build_config: Pick<BuildConfig, 'config'>) {
	const fp = path.normalize(path.join(app.project.dir, build_config.config.src, 'app.xml'));
	printf.outFile.info(`预处理 app.xml 配置文件 [path:${fp}]`);

	if (!existsSync(fp)) {
		throw new Error(`源码目录下找不到 app.xml 配置文件 [path:${fp}]
请确保在 ${build_config.config.src} 目录下创建了 app.xml`);
	}
	const content = readFileSync(fp, 'utf-8');
	if (content.length === 0) {
		throw new Error(`app.xml 配置文件内容为空 [path:${fp}]`);
	}

	const $root = parse(content);
	if ($root.childNodes.length === 0) throw new Error('app.xml 是空的');
	const $app = $root.querySelector('app') as ParsedElement | null;
	if (!$app) throw new Error('app.xml 缺少 <app> 根元素');

	return {
		title: $app.querySelector('title')
			? ($app.querySelector('title') as unknown as { text: string }).text.trim()
			: 'magic',
		lang: $app.attrs.lang || 'zh',
		icon: $app.attrs.icon || false,
		initScript: $app.querySelector('init-script')
			? ($app.querySelector('init-script') as unknown as { text: string }).text.trim()
			: null,
		import: examine_AppConfig_parserImport(
			$app.querySelector('import') as ParsedElement | undefined,
			path.join(app.project.dir, build_config.config.src)
		)
	};
}

export async function _1(root: BuildConfig): Promise<void> {
	const config = examine_BuildConfig(root);
	if (config) {
		printf.outFile.info(`Build 配置 :`, JSON.stringify(config));

		config.build.out = config.build.out + (config.build.model === 'release' ? '-release' : '-debug');

		const projectDir = path.normalize(app.project.dir);
		project.dir = projectDir;

		const isDryRun = config.build['dry-run'] === true;
		if (isDryRun) {
			printf.outFile.warning(`Dry-run 模式已启用: 仅检验不生成文件`);
		}
		project['_dryRun'] = isDryRun;

		const useSourceMap = config.build.output?.['source-map'] === true;
		if (useSourceMap) {
			printf.outFile.info(`Source Map 生成已启用`);
		}
		project['_sourceMap'] = useSourceMap;

		const useIncremental = config.build.incremental !== false;
		const cachePath = useIncremental ? getCachePath(projectDir) : undefined;
		if (config.build.module) {
			await _2(config, undefined, cachePath);
		} else {
			await _2(
				config,
				macroReplace(examine_AppConfig(config)) as {
					title: string;
					lang: string;
					icon: string | false;
					initScript: string | null;
					import: { o: { element: string; load?: string } }[];
				},
				cachePath
			);
		}
	}
	BUILD_TIMER.lap('配置处理');
}
