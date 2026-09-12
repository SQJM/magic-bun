import path from 'node:path';
import { Config } from '../../config.ts';
import { copyDir } from '../../util/copy-dir.ts';
import { fileUtil } from '../../util/file-util.ts';
import { isStringOverSize } from '../../util/is-string-over-size.ts';
import { traversal } from '../../util/traversal.ts';
import { project } from '../global.ts';
import { _end } from './7_optimize';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadCache, getCachePath } from '../../util/build-cache.ts';
import { getDirAllFile } from '../../util/get-dir-all-file.ts';
import { generateCSP, generateCSPMetaTag, type CSPOptions } from '../../util/csp.ts';
import { writeSourceMapFile } from '../../util/sourcemap.ts';
import { BUILD_TIMER } from '../start.ts';
import type { SourceFile, MDataOutput, TemplateVar } from '../../types.ts';

interface MDataInstance {
	data: MDataOutput;
}

function isEmptyObject(obj: object): boolean {
	return Object.keys(obj).length === 0;
}

/**
 * 解析 `:root { ... }` 内的 CSS 自定义属性为 Map
 */
function parseRootVars(css: string): Map<string, string> {
	const map = new Map<string, string>();
	const m = css.match(/:root\s*\{([\s\S]*?)\}/);
	if (!m) return map;
	const decls = m[1].split(';');
	for (const raw of decls) {
		const decl = raw.trim();
		if (!decl.startsWith('--')) continue;
		const eq = decl.indexOf(':');
		if (eq <= 0) continue;
		map.set(decl.substring(0, eq).trim(), decl.substring(eq + 1).trim());
	}
	return map;
}

/**
 * 合并两个 :root { } 块中的 CSS 变量:newCSS 中的同名变量会覆盖 oldCSS 中的值
 * 保留所有未在 newCSS 中出现的旧变量(典型场景:增量构建时未变化组件的变量)
 */
function mergeThemeVars(oldCSS: string, newCSS: string): string {
	const merged = parseRootVars(oldCSS);
	const newVars = parseRootVars(newCSS);
	for (const [k, v] of newVars) {
		merged.set(k, v);
	}
	let out = ':root { \n';
	for (const [k, v] of merged) {
		out += `${k}: ${v}; \n`;
	}
	out += '}';
	return out;
}

function scriptAttrs(src: string): Array<{ type: string } | { src: string }> {
	return [{ type: 'text/javascript' }, { src }];
}

function escapeTemplateContent(content: string): string {
	return content.replaceAll('\\', '\\\\').replace(/\$\{([^}]+)\}/g, '\\${$1}');
}

function generateListenBinding(dataName: string, elementName: string, keywordListen: Record<string, string>): string {
	let listen = ',{ ';
	traversal.object(keywordListen, (_v: unknown, _i: number, _k: string) => {
		if (_v === '') throw new Error(`组件 "${dataName}" 中元素 [${elementName}] 使用了关键字 listen [${_k}] 但没有绑定事件`);
		listen += `"${_k}": __magic_listen_${String(_v)},`;
	});
	listen += ' }';
	return listen;
}

function generateTemplateDeclaration(data: MDataOutput) {
	const vars: string[] = [];
	const creations: string[] = [];
	const attrInits: string[] = [];
	const eventInits: string[] = [];
	const kwIdInits: string[] = [];
	const kwNameInits: string[] = [];
	const importNames: string[] = [];
	const slotNames: { varName: string; slotName: string }[] = [];

	traversal.object(data.template.var, (v: unknown, _i: number, k: string) => {
		const tvar = v as TemplateVar;
		vars.push(k);
		if (tvar.type === 'slot') {
			creations.push(`${k} = new DocumentFragment()`);
			slotNames.push({ varName: k, slotName: tvar.slotName || 'default' });
		} else if (tvar.type === 'element') {
			creations.push(`${k} = e(\`${tvar.tagName}\`)`);
		} else if (tvar.type === 'import') {
			if (tvar.keyword?.['listen']) {
				const listen = generateListenBinding(
					data.name,
					k,
					tvar.keyword['listen'] as unknown as Record<string, string>
				);
				creations.push(`${k} = i(\`${tvar.import}\`,${JSON.stringify(tvar.args)}${listen})`);
			} else {
				creations.push(`${k} = i(\`${tvar.import}\`,${JSON.stringify(tvar.args)})`);
			}
		} else if (tvar.type === 'text') {
			creations.push(`${k} = t(\`${escapeTemplateContent(tvar.content ?? '')}\`)`);
		}

		if (tvar.type !== 'text' && tvar.type !== 'slot') {
			if (tvar.attribs && !isEmptyObject(tvar.attribs)) {
				attrInits.push(`att(${k},${JSON.stringify(tvar.attribs)});`);
			}

			traversal.object(tvar.event ?? {}, (ev: unknown, _j: number, en: string) => {
				const evArr = ev as [string, unknown];
				const evn = evArr[0];
				if (!data.event.list?.includes(evn)) {
					if (evn === '') throw new Error(`组件 "${data.name}" 中元素 [${k}] 绑定了一个空事件`);
					throw new Error(`组件 "${data.name}" 中元素 [${k}] 绑定了事件 "${evn}", 但在 <script code="event"> 中没有实现该事件`);
				}
				eventInits.push(`eve(${k},"${en}",this,"${evn}",${JSON.stringify(evArr[1])});`);
			});

			if (tvar.keyword && 'id' in tvar.keyword) {
				let r = '';
				if (!isEmptyObject(data.cssScope)) {
					traversal.object(data.cssScope, (_v: unknown, _j: number, scopeKey: string) => {
						if (scopeKey === tvar.keyword?.['id']) r = `,"${String(_v)}"`;
					});
				}
				kwIdInits.push(`this._$id.s("${tvar.keyword['id']}",${k}${r});`);
			}
			if (tvar.keyword && 'name' in tvar.keyword) {
				kwNameInits.push(`${k}._$name = "${tvar.keyword['name']}";`);
			}

			if (tvar.type === 'import') importNames.push(k);
		}
		creations.push('');
	});

	let varDecl = '',
		importInitStmt = '';
	if (vars.length > 0) {
		varDecl = 'let ' + vars.join(',');
		importInitStmt = importNames.length > 0 ? `magic.created(${importNames.join(',')});` : '';
	}

	const createStmts = creations.join(';\n');

	let slotContainerExpose = '';
	if (slotNames.length > 0) {
		slotContainerExpose = 'this.__magic_slot_containers__ = { ' +
			slotNames.map(function (s) { return '"' + s.slotName + '": ' + s.varName; }).join(', ') + ' };';
	}

	return {
		varDecl,
		createStmts,
		attrInits,
		eventInits,
		kwIdInits,
		kwNameInits,
		importInitStmt,
		slotContainerExpose
	};
}

export function generateModuleJS(data: MDataOutput): string {
	try {
		const t = generateTemplateDeclaration(data);

		const sh = data.template.sh.map((s: string) => `${s}\n`).join('');
		const useElemDecl =
			data['use-element-id-list'].length > 0 ? `var ${data['use-element-id-list'].join(',')};` : '';

		const exposeEventStr =
			data['expose-event'] instanceof Object ? JSON.stringify(data['expose-event']) : data['expose-event'];
		const exposeEventKeys = exposeEventStr
			? Object.keys(JSON.parse(exposeEventStr))
				.map((k) => k + ': true')
				.join(',')
			: '';

		return `window["__MAGIC__"]["M"]["${data.name}"] = function ( __args__ , __listen__) {
    const call = magic.call(this);
    this._$id = magic.mapIdElement();
    const $id = magic.$id(this._$id);
    const _args = {_file:"${data.originalFile}",_id: magic.idGenerate(),...magic.parserArgs(__args__)};
    const _listen = magic.parserListen(__listen__);
    const emit_event = magic.emit.event(_listen, {${exposeEventKeys}});

    ${useElemDecl}

    this.__magic_element_root = document.createDocumentFragment();

    ${data.before || ''}

    this.__magic_template = ( () => {
        const { element: e, text: t, attribute: att,event: eve , append } = magic.dom, i = magic.importM;
        ${t.varDecl};

        return {
            render : () => {
                ${t.createStmts}${t.kwNameInits.join('\n')}\n${t.attrInits.join('\n')}\n${t.kwIdInits.join('\n')}\n({${data['use-element-id-list'].join(',')}} = $id());\n${sh}\n${t.importInitStmt}\n${t.slotContainerExpose}
                ${(() => {
				let slotCode = '';
				const sap = (data as unknown as Record<string, unknown>)['slotAppendMap'] as Record<string, Record<string, { sh: string[]; varDecl: string; vars: string[]; creations: string }>>;
				if (!sap) return '';
				traversal.object(data.template.var, (_v: unknown, _i: number, _k: string) => {
					const tv = _v as TemplateVar;
					if (tv.type === 'import' && tv.import) {
						const compSrc = tv.import as string;
						if (sap[compSrc]) {
							slotCode += `if(${_k}.__magic_slot_containers__){\n`;
							Object.keys(sap[compSrc]).forEach(function (slotName) {
								const sd = sap[compSrc][slotName];
								slotCode += `if(${_k}.__magic_slot_containers__["${slotName}"]){\n`;
								slotCode += `var __sf_${slotName.replace(/[^a-zA-Z0-9]/g, '_')} = document.createDocumentFragment();\n`;
								slotCode += sd.creations;
								const slotSh = sd.sh.map(function (s: string) { return s.replace(/__magic_slot_root/g, '__sf_' + slotName.replace(/[^a-zA-Z0-9]/g, '_')); }).join('\n') + '\n';
								slotCode += slotSh;
								slotCode += `${_k}.__magic_slot_containers__["${slotName}"].appendChild(__sf_${slotName.replace(/[^a-zA-Z0-9]/g, '_')});\n`;
								slotCode += '}\n';
							});
							slotCode += '}\n';
						}
					}
				});
				return slotCode;
			})()}
            },
            bind_event : ()=>{ ${t.eventInits.join('')} },
            export_element : () => {
            return magic.BindScope(${t.varDecl.length > 1 ? `[ ${t.varDecl.substring(4)} ]` : '[]'},this,_args._id);
            }
        };
    } )();

    this.__magic_template.render();

    ${data.global || ''}

    ${data.listen.code || ''}

    ${data.event.code || ''}

    ${data.component_event.code || ''}

    this.__magic_template.bind_event();

    magic.initComponentInterface(this);

    ${data.interface.code || ''}
    ${data.script}
    ${(() => {
				let r = '';
				data.once_interface.forEach((t: string) => {
					r += `call.interface.${t}();\n`;
				});
				return r;
			})()}
    ${data.template.fragment
				? `return {
__file : "${data.originalFile}",
__fragment : true,
mid : _args._id,
fragment : this.__magic_element_root,
interface : this.__magic_interface,
__magic_component_event : this.__magic_component_event,
templateArgs : ${JSON.stringify(data.templateArgs)},
exposeEvent : ${data['expose-event'] instanceof Object ? JSON.stringify(data['expose-event']) : data['expose-event']},
childNodes : [...this.__magic_template.export_element()]
};`
				: `const __root__element__ = this.__magic_template.export_element().at(0);
__root__element__.__file = "${data.originalFile}",
__root__element__.mid = _args._id,
__root__element__.fragment = this.__magic_element_root,
__root__element__.interface = this.__magic_interface,
__root__element__.__magic_component_event = this.__magic_component_event,
__root__element__.templateArgs = ${JSON.stringify(data.templateArgs)},
__root__element__.exposeEvent = ${data['expose-event']};
return __root__element__;`
			}
}`;
	} catch (e) {
		throw new Error(`${e}\n[path:${data.originalFile}]`, { cause: e });
	}
}

function handleModuleImports(): void {
	const modules = project.build_config.build.import?.module;
	if (!modules) return;
	modules.forEach((p) => {
		const tp = path.normalize(p);
		if (!existsSync(tp)) throw new Error(`build.toml 中配置的 import.module 目标模块不存在 [path:${tp}]`);
		copyDir(tp, project.outDir + path.basename(p));

		const md = JSON.parse(readFileSync(tp + '/module.info.json', 'utf-8'));
		md.files.forEach((file: string) => {
			const fp = md.dir + '/' + file;
			const ext = fileUtil.getExtensionName(fp);
			if (ext === 'js') {
				project.index_dom.add('begin', {
					tag: 'script',
					attrs: [{ src: `./${fp}` }]
				});
			} else if (ext === 'css') {
				project.index_dom.add('begin', {
					tag: 'link',
					one: true,
					attrs: [{ href: `./${fp}` }, { rel: 'stylesheet' }]
				});
			}
		});
	});
}

function buildNewCacheEntries(
	mDatas: MDataInstance[],
	newCacheEntries: Record<string, { hash: string; outputs: string[] }>
): void {
	mDatas.forEach((md) => {
		newCacheEntries[md.data.originalFile] = {
			hash: md.data.contentHash,
			outputs: [`${md.data.name}.js`, `${md.data.name}.css`],
		};
	});
}

function buildDebug(
	mDatas: MDataInstance[],
	paths: string[],
	newCacheEntries: Record<string, { hash: string; outputs: string[] }>
): Promise<void> {
	mDatas.forEach((md) => {
		const jsPath = project.outDirMagic + `${md.data.name}.js`;
		const cssPath = project.outDirMagic + `${md.data.name}.css`;
		let jsContent = generateModuleJS(md.data);

		if (project._sourceMap) {
			jsContent = writeSourceMapFile(jsContent, '', md.data.name + '.js');
		}

		if (!project._dryRun) {
			writeFileSync(jsPath, jsContent);
			writeFileSync(cssPath, md.data.css);
		}

		project.index_dom.add('begin', {
			tag: 'script',
			attrs: [{ src: `./magic/${md.data.name}.js` }]
		});
		project.index_dom.add('begin', {
			tag: 'link',
			one: true,
			attrs: [{ href: `./magic/${md.data.name}.css` }, { rel: 'stylesheet' }]
		});
		paths.push(`${md.data.name}.js`);
		paths.push(`${md.data.name}.css`);
	});
	return _end(paths, newCacheEntries);
}

function resolveJsChunkBytes(): number {
	const cfg = project.build_config.build.output?.['chunk-size'];
	if (cfg === undefined) return Config.build.MScriptBlockSize;
	if (cfg === 0) return Number.MAX_SAFE_INTEGER;
	return cfg * 1024;
}

function buildRelease(
	mDatas: MDataInstance[],
	paths: string[],
	newCacheEntries: Record<string, { hash: string; outputs: string[] }>
): Promise<void> {
	const blocks = { mScript: [] as string[], css: [] as string[] };
	const jsChunkBytes = resolveJsChunkBytes();
	let curScript = '',
		curCSS = '';

	mDatas.forEach((md) => {
		curScript += generateModuleJS(md.data) + '\n';
		if (isStringOverSize(curScript, jsChunkBytes)) {
			blocks.mScript.push(curScript);
			curScript = '';
		}
		curCSS += md.data.css + '\n';
		if (isStringOverSize(curCSS, Config.build.CSSBlockSize)) {
			blocks.css.push(curCSS);
			curCSS = '';
		}
	});

	blocks.css.push(curCSS);
	let ci = 0,
		cs = '';
	blocks.css.forEach((block) => {
		project.index_dom.add('begin', {
			tag: 'link',
			one: true,
			attrs: [{ href: `./magic/m${cs}.css` }, { rel: 'stylesheet' }]
		});
		paths.push(`m${cs}.css`);
		if (!project._dryRun) {
			writeFileSync(project.outDirMagic + `m${cs}.css`, block);
		}
		ci += 1;
		cs = '-' + ci;
	});

	blocks.mScript.push(curScript);
	let ji = 0,
		jjs = '';
	blocks.mScript.forEach((block) => {
		let outputBlock = block;
		if (project._sourceMap) {
			outputBlock = writeSourceMapFile(block, '', `m${jjs}.js`);
		}
		project.index_dom.add('begin', {
			tag: 'script',
			attrs: scriptAttrs(`./magic/m${jjs}.js`)
		});
		paths.push(`m${jjs}.js`);
		if (!project._dryRun) {
			writeFileSync(project.outDirMagic + `m${jjs}.js`, outputBlock);
		}
		ji += 1;
		jjs = '-' + ji;
	});

	return _end(paths, newCacheEntries);
}

function injectCSPMeta(): void {
	const buildConfig = (project.build_config as unknown as Record<string, unknown>).build as Record<string, unknown> | undefined;
	const cspConfig = buildConfig?.csp as Record<string, unknown> | undefined;
	if (!cspConfig || !(cspConfig.enabled as boolean)) return;

	const options: CSPOptions = {};
	if (cspConfig['default-src']) options['default-src'] = cspConfig['default-src'] as string[];
	if (cspConfig['script-src']) options['script-src'] = cspConfig['script-src'] as string[];
	if (cspConfig['style-src']) options['style-src'] = cspConfig['style-src'] as string[];
	if (cspConfig['img-src']) options['img-src'] = cspConfig['img-src'] as string[];
	if (cspConfig['font-src']) options['font-src'] = cspConfig['font-src'] as string[];
	if (cspConfig['connect-src']) options['connect-src'] = cspConfig['connect-src'] as string[];
	if (cspConfig['mode']) options.mode = cspConfig.mode as CSPOptions['mode'];
	if (cspConfig['upgrade-insecure-requests']) options['upgrade-insecure-requests'] = true;

	const csp = generateCSP(options);
	const metaTag = generateCSPMetaTag(csp);

	project.index_dom.add('front', {
		tag: 'meta',
		attrs: [{ 'http-equiv': 'Content-Security-Policy' }, { content: csp }]
	});

	// Also add as an element string directly if the simplifier doesn't handle it
	project.index_dom.headFrontString += `\n${metaTag}\n`;
}

export function _6(mDatas: MDataInstance[], CSS_VAR: string, unchangedM?: SourceFile[]): Promise<void> {
	if (!project.build_config.build.module) {
		handleModuleImports();
	}

	// CSP injection
	injectCSPMeta();

	const paths: string[] = [];
	const newCacheEntries: Record<string, { hash: string; outputs: string[] }> = {};
	// 将非组件文件 hash 合并到缓存条目中,使后续构建可跳过未变化的文件
	if (project._nonComponentHashes) {
		for (const [rel, hash] of Object.entries(project._nonComponentHashes)) {
			if (!newCacheEntries[rel]) {
				newCacheEntries[rel] = { hash, outputs: [] };
			}
		}
		delete project._nonComponentHashes;
	}
	// default-theme-var.css 是所有 <css default-theme> 块的 CSS 变量聚合文件.
	// 增量构建时,未变化的 default-theme 块会被跳过(它们的 CSS 变量不会进入 CSS_VAR),
	// 如果直接覆盖会丢失这些变量. 因此:
	//   - 有未变化组件  → 读取旧 default-theme-var.css,与新 CSS_VAR 合并(新值优先)
	//   - 无未变化组件  → 直接写入新 CSS_VAR
	//   - 无任何变化    → 不写入(保留旧文件)
	if (!project._dryRun) {
		const themeVarPath = `${project.outDirMagic}/default-theme-var.css`;
		const hasUnchanged = unchangedM && unchangedM.length > 0;
		if (mDatas.length > 0) {
			let finalCSS = CSS_VAR;
			if (hasUnchanged && existsSync(themeVarPath)) {
				const oldCSS = readFileSync(themeVarPath, 'utf-8');
				finalCSS = mergeThemeVars(oldCSS, CSS_VAR);
			}
			if (finalCSS.includes('--')) {
				writeFileSync(themeVarPath, finalCSS);
			}
		}
		// mDatas.length === 0: 没有任何组件被重新编译,旧文件已是最新,跳过写入
	}

	if (project.build_config.build.model === 'debug') {
		const cache = loadCache(getCachePath(project.dir));
		if (unchangedM && cache) {
			unchangedM.forEach((s) => {
				const rel = s.relative().replace(/\\/g, '/');
				const entry = cache.files[rel];
				if (entry) {
					entry.outputs.forEach((o) => {
						paths.push(o);
						const ext = o.endsWith('.js') ? 'script' : 'link';
						if (ext === 'script') {
							project.index_dom.add('begin', {
								tag: 'script',
								attrs: [{ src: `./magic/${o}` }]
							});
						} else {
							project.index_dom.add('begin', {
								tag: 'link',
								one: true,
								attrs: [{ href: `./magic/${o}` }, { rel: 'stylesheet' }]
							});
						}
					});
					newCacheEntries[rel] = {
						hash: entry.hash,
						outputs: [...entry.outputs]
					};
				}
			});
		}
		if (mDatas.length > 0) {
			buildNewCacheEntries(mDatas, newCacheEntries);
			return buildDebug(mDatas, paths, newCacheEntries);
		} else {
			return _end(paths, newCacheEntries);
		}
	} else if (project.build_config.build.model === 'release') {
		if (mDatas.length > 0) {
			buildNewCacheEntries(mDatas, newCacheEntries);
			return buildRelease(mDatas, paths, newCacheEntries);
		} else {
			const cache = loadCache(getCachePath(project.dir));
			// When no files changed in release mode, add existing bundle references
			// to index.html (m.css, m-1.css, m.js, m-1.js, etc.)
			if (cache) {
				const existingFiles = getDirAllFile(project.outDirMagic);
				existingFiles.forEach((f) => {
					const base = path.basename(f);
					if (/^m(-\d+)?\.(js|css)$/.test(base)) {
						paths.push(base);
						const ext = base.endsWith('.js') ? 'script' : 'link';
						if (ext === 'script') {
							project.index_dom.add('begin', {
								tag: 'script',
								attrs: scriptAttrs(`./magic/${base}`)
							});
						} else {
							project.index_dom.add('begin', {
								tag: 'link',
								one: true,
								attrs: [{ href: `./magic/${base}` }, { rel: 'stylesheet' }]
							});
						}
					}
				});
				BUILD_TIMER.lap('生成输出');
				return _end(paths, cache.files);
			} else {
				BUILD_TIMER.lap('生成输出');
				return _end(paths, newCacheEntries);
			}
		}
	}
	return Promise.resolve();
}
