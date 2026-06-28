import generate from '@babel/generator';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { parse } from 'node-html-parser';
import node_path from 'node:path';
import postcss from 'postcss';
import { printf } from '../../util/printf.ts';
import { is } from '../../util/is.ts';
import { task } from '../../util/task.ts';
import { traversal } from '../../util/traversal.ts';
import { generateComponentName } from '../../util/generate-component-name.ts';
import { project } from '../global.ts';
import { idGenerate } from '../id-generate.ts';
import { macroReplace } from '../macro-replace.ts';
import { _6 } from './6_generate.ts';
import { filterUsedComponents } from '../tree-shaker.ts';
import { existsSync, readFileSync } from 'node:fs';
import { getStore, getCachePath } from '../../util/build-cache.ts';
import { postcssShorthandExpand, postcssKeyframesRename } from '../css-shorthand-plugin.ts';
import { getErrorAggregator } from '../../util/error-aggregator.ts';
import { BUILD_TIMER } from '../start.ts';
import { getProfiler } from '../../util/build-profiler.ts';
import type { SourceFile, MDataOutput } from '../../types.ts';

// 加载 default-theme 允许的 CSS 属性集合
let _defaultThemeProperties: Set<string> | null = null;
function getDefaultThemeProperties(): Set<string> {
	if (_defaultThemeProperties) return _defaultThemeProperties;
	try {
		const jsonPath = node_path.resolve(import.meta.dirname, './default-theme-keyword.json');
		const raw = readFileSync(jsonPath, 'utf-8');
		const data = JSON.parse(raw);
		_defaultThemeProperties = new Set<string>();
		for (const cat of data.categories || []) {
			for (const p of cat.properties || []) {
				if (p.property) _defaultThemeProperties.add(p.property);
			}
		}
	} catch {
		_defaultThemeProperties = new Set<string>();
	}
	return _defaultThemeProperties;
}

function convertArrowFunctionToNormal(name: string | null, arrowFuncCode: string): string {
	try {
		const ast = parser.parse(arrowFuncCode, { sourceType: 'script' });
		traverse(ast, {
			ArrowFunctionExpression(path) {
				const node = path.node;
				const params = node.params;
				let body;
				if (t.isBlockStatement(node.body)) {
					body = node.body;
				} else {
					body = t.blockStatement([t.returnStatement(node.body)]);
				}
				let funcId = null;
				if (name && typeof name === 'string' && name.trim()) {
					funcId = t.identifier(name.trim());
				}
				path.replaceWith(t.functionExpression(funcId, params, body, false, false));
			}
		});
		const output = generate(ast, {
			concise: false,
			quotes: 'double',
			retainLines: true
		});
		let code = output.code.trim().replace(/;$/, '');
		code = code.replace(/^\s*\(/, '').replace(/\)\s*$/, '');
		return code;
	} catch (error: unknown) {
		throw new Error('转换失败:' + (error instanceof Error ? error.message : String(error)), { cause: error });
	}
}

export function pretreatmentMagicMacro(
	code: unknown,
	spmm: {
		createUiData?: boolean;
		uiDataName?: string;
		elementIDList?: Set<string>;
	} = {},
	sourceDir?: string,
	componentPath?: string,
	includedDeps?: Set<string>
): { code: string; options: Record<string, unknown> } {
	let ast: unknown;
	try {
		ast = parser.parse(code as string, {
			sourceType: 'module',
			plugins: ['asyncGenerators'],
			locations: true
		});
	} catch (e: unknown) {
		const err = e as {
			code?: string;
			reasonCode?: string;
			loc?: { line: number; column: number };
		};
		const line = err.loc?.line ?? 0;
		const col = err.loc?.column ?? 0;
		const lines = (code as string).split('\n');
		const lineContent = line > 0 && line <= lines.length ? lines[line - 1] : '';
		throw new Error(`脚本代码解析失败: ${err.code} (${err.reasonCode}) \n${line}:${col}|${lineContent}`, { cause: e });
	}
	traverse(ast, {
		// Apply macro replacement to all string literals in scripts
		StringLiteral(path) {
			if (path.node.value.includes('[$')) {
				path.node.value = macroReplace(path.node.value, componentPath);
			}
		},
		CallExpression(path) {
			if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'magic_define_include') {
				const filePath = path.node.arguments.at(0)!;
				if (filePath.type === 'StringLiteral') {
					let fp = macroReplace(filePath.value, componentPath);
					if (sourceDir && (fp.startsWith('./') || fp.startsWith('../'))) {
						fp = node_path.resolve(sourceDir, fp);
					}
					fp = node_path.normalize(fp);
					if (includedDeps && project.srcDir) {
						const relDep = node_path.relative(project.srcDir, fp).replace(/\\/g, '/');
						if (relDep && !relDep.startsWith('..') && !node_path.isAbsolute(relDep)) {
							includedDeps.add(relDep);
						}
					}
					if (!existsSync(fp)) throw new Error(`magic_define_include 引用的文件不存在 [path:${filePath.value}] [resolved:${fp}] [sourceDir:${sourceDir}]`);
					const data = readFileSync(fp, 'utf-8');
					path.replaceWith(parser.parseExpression(data));
					return;
				} else if (filePath.type === 'Identifier') {
					throw new Error(`magic_define_include 第一个参数不允许使用动态变量 [变量名: ${filePath.name}]`);
				} else {
					throw new Error(`magic_define_include 第一个参数类型应该为 string ,实际是 ${filePath.type}`);
				}
			}
			if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'magic_define_ui_data') {
				const parent = path.parent;
				if (t.isVariableDeclarator(parent) && parent.id) {
					if (t.isIdentifier(parent.id)) {
						spmm.uiDataName = parent.id.name;
					} else if (t.isObjectPattern(parent.id) || t.isArrayPattern(parent.id)) {
						throw new Error('magic_define_ui_data 不能使用解构赋值');
					}
				} else {
					throw new Error('magic_define_ui_data 必须用作变量声明');
				}
				if (spmm.createUiData) {
					throw new Error(`不能创建多个 magic_define_ui_data`);
				} else {
					spmm.createUiData = true;
				}
				const data = path.node.arguments.at(0)!;
				if (t.isObjectExpression(data)) {
					path.node.callee = t.identifier('magic.createUiData');
					path.node.arguments.push(t.identifier('_args'));
				} else {
					throw new Error(`magic_define_ui_data 第一个参数类型应该为 object, 实际是 ${data.type}`);
				}
			}
			if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'magic_dynamic_value_bind') {
				if (!spmm.createUiData) {
					throw new Error(`你必须创建 magic_define_ui_data 才能使用动态值绑定`);
				}
				path.node.callee = t.identifier('magic.DynamicValueBind');
				path.node.arguments.push(t.identifier(spmm.uiDataName!));
			}
		},
		VariableDeclaration(path) {
			const declarations = path.node.declarations;
			if (declarations.length === 1) {
				const declaration = declarations[0];
				if (t.isObjectPattern(declaration.id)) {
					const init = declaration.init;
					if (t.isCallExpression(init) && t.isIdentifier(init.callee) && init.callee.name === '$id') {
						declaration.id.properties.forEach((prop) => {
							spmm.elementIDList!.add(prop.key.name);
						});
						path.remove();
					}
				}
			}
		}
	});
	const { code: newCode } = generate(ast, {}, code as string);
	return { code: newCode, options: {} };
}

function extractFunctions(code: string): Record<string, string> {
	const ast = parser.parse(code, {
		sourceType: 'module',
		plugins: ['asyncGenerators']
	});
	const functions: Record<string, string> = {};
	traverse(ast, {
		AssignmentExpression(path) {
			if (
				path.node.left.type === 'Identifier' &&
				(path.node.right.type === 'ArrowFunctionExpression' || path.node.right.type === 'FunctionExpression')
			) {
				functions[path.node.left.name] = generate(path.node.right).code;
			}
		}
	});
	return functions;
}

function extractArrowFunctionNames(code: string): string[] {
	const ast = parser.parse(code, {
		sourceType: 'module',
		plugins: ['asyncGenerators']
	});
	const functionNames: string[] = [];
	traverse(ast, {
		AssignmentExpression(path) {
			if (path.node.left.type === 'Identifier' && path.node.right.type === 'ArrowFunctionExpression') {
				functionNames.push(path.node.left.name);
			}
		}
	});
	return functionNames;
}

function pretreatmentMagicEvent(code: string, variableName: string = '__magic_event'): string {
	const functions = extractFunctions(code);
	return `this.${variableName} = {${Object.keys(functions)
		.map((key) => `${key}: ${functions[key]}`)
		.join(', ')}}`;
}

function pretreatmentMagicListen(code: string): string {
	const functions = extractFunctions(code);
	return `${Object.keys(functions)
		.map((key) => convertArrowFunctionToNormal(`__magic_listen_${key}`, functions[key]))
		.join('\n')}`;
}

function pretreatmentMagicInterface(code: string): string {
	const functions = extractFunctions(code);
	return `this.__magic_interface = {${Object.keys(functions)
		.map((key) => `${key}: ${functions[key]}`)
		.join(', ')}}`;
}

function getMagicDefineScript(code: string): string[] {
	return extractArrowFunctionNames(code);
}

let CSS_VAR = ':root { \n';
let CSS_VAR_COUNT = 0;

const mSource = (() => {
	let s: string[] = [];
	return {
		has(p: unknown): boolean {
			return typeof p === 'string' && s.includes(p);
		},
		init(arr: SourceFile[]): void {
			arr.forEach((item) => s.push(item.relative().slice(0, -2).replace(/\\/g, '/')));
		},
		reset(): void {
			s = [];
		}
	};
})();

const COMPONENT_SLOT_REQUIRED = new Map<string, Set<string>>();

export function resetCompileState(): void {
	CSS_VAR = ':root { \n';
	CSS_VAR_COUNT = 0;
	mSource.reset();
	COMPONENT_SLOT_REQUIRED.clear();
}

function trimString(str: string | unknown, t: string, rawAttrs: string): string {
	const s = String(str ?? '');
	let result: string;
	if (rawAttrs && rawAttrs.length > 0) result = s.slice(t.length + rawAttrs.length + 3);
	else result = s.slice(t.length + 2);
	result = result.slice(0, -(t.length + 3) || result.length);
	return result;
}

function mergeTemplateChildren(
	childTemplate: {
		childNodes: unknown[];
		querySelectorAll: (s: string) => unknown[];
		appendChild: (c: unknown) => void;
		nodeType?: number;
	},
	parentTemplate: {
		childNodes: unknown[];
		querySelectorAll: (s: string) => unknown[];
		appendChild: (c: unknown) => void;
		nodeType?: number;
	}
): void {
	const parentNodes: unknown[] = [];
	parentTemplate.childNodes.forEach((n: unknown) => {
		if ((n as { nodeType: number }).nodeType !== 3) parentNodes.push(n);
	});
	const childNodes: unknown[] = [];
	childTemplate.childNodes.forEach((n: unknown) => {
		if ((n as { nodeType: number }).nodeType !== 3) childNodes.push(n);
	});
	const it = (child: unknown, parent: unknown, _i: unknown) => {
		if (!parent || (child as { rawTagName: string }).rawTagName !== (parent as { rawTagName: string }).rawTagName)
			return;
		const pc = child as {
			attrs: Record<string, string>;
			hasAttribute(s: string): boolean;
			getAttribute(s: string): string;
			setAttribute(s: string, v: string): void;
			childNodes: unknown[];
			appendChild(c: unknown): void;
			rawTagName: string;
			nodeType: number;
		};
		const pp = parent as {
			attrs: Record<string, string>;
			hasAttribute(s: string): boolean;
			getAttribute(s: string): string;
			setAttribute(s: string, v: string): void;
			childNodes: unknown[];
			rawTagName: string;
			nodeType: number;
		};
		const parentAttrs = { ...pp.attrs };
		delete parentAttrs['id'];
		delete parentAttrs['class'];
		for (const pk in parentAttrs) {
			if (pk.startsWith('#') && !pc.hasAttribute(pk)) pc.setAttribute(pk, parentAttrs[pk]);
		}
		if (pp.hasAttribute('id') && !pc.hasAttribute('id')) pc.setAttribute('id', pp.getAttribute('id'));
		if (pp.hasAttribute('class')) {
			const parentClass = pp.getAttribute('class');
			if (pc.hasAttribute('class')) {
				pc.setAttribute('class', parentClass + ' ' + pc.getAttribute('class'));
			} else {
				pc.setAttribute('class', parentClass);
			}
		}
		for (const attr in pp.attrs) {
			if (attr === 'class' || attr === 'id') continue;
			if (!pc.hasAttribute(attr)) pc.setAttribute(attr, pp.attrs[attr]);
		}
		const parentTextNodes = pp.childNodes.filter(
			(n: unknown) => (n as { nodeType: number }).nodeType === 3 && ((n as { text: string }).text || '').trim()
		);
		const childHasText = pc.childNodes.some(
			(n: unknown) => (n as { nodeType: number }).nodeType === 3 && ((n as { text: string }).text || '').trim()
		);
		if (parentTextNodes.length > 0 && !childHasText) {
			pc.childNodes.unshift(...parentTextNodes);
		}
		const parentElements = pp.childNodes.filter((n: unknown) => (n as { nodeType: number }).nodeType === 1);
		const childElements = pc.childNodes.filter((n: unknown) => (n as { nodeType: number }).nodeType === 1);
		const maxLen = Math.max(parentElements.length, childElements.length);
		for (let j = 0; j < maxLen; j++) {
			if (j >= childElements.length && j < parentElements.length) {
				pc.appendChild((parentElements[j] as { cloneNode(b: boolean): unknown }).cloneNode(true));
			} else if (j < parentElements.length && j < childElements.length) {
				if (
					(childElements[j] as { rawTagName: string }).rawTagName ===
					(parentElements[j] as { rawTagName: string }).rawTagName
				) {
					it(childElements[j], parentElements[j], j);
				}
			}
		}
	};
	for (let i = 0; i < childNodes.length; i++) {
		const parentMatch = parentNodes.find(
			(p: unknown) =>
				!(p as { _mergeUsed?: boolean })._mergeUsed &&
				(p as { rawTagName: string }).rawTagName === (childNodes[i] as { rawTagName: string }).rawTagName
		);
		if (parentMatch) {
			(parentMatch as { _mergeUsed: boolean })._mergeUsed = true;
			it(childNodes[i], parentMatch, i);
		}
	}
}

function mergeScriptCode(parentCode: string, childCode: string): string {
	const nullVars: string[] = [];
	for (const line of childCode.split('\n')) {
		const match = line.trim().match(/^(\w+)\s*=\s*null\s*;?$/);
		if (match) nullVars.push(match[1]);
	}
	const filtered: string[] = [];
	for (const line of parentCode.split('\n')) {
		const match = line.trim().match(/^(\w+)\s*=/);
		if (match && nullVars.includes(match[1])) continue;
		filtered.push(line);
	}
	const filteredParent = filtered.join('\n');
	if (filteredParent.trim() === '') return childCode;
	return filteredParent + '\n' + childCode;
}

export class mData {
	#source: SourceFile;
	#dateObject: Record<string, unknown>;
	#name: string = '';
	#cssScope: Record<string, string> = {};
	#originalFile: string = '';
	#once_interface_args: Record<string, unknown> = {};
	#includedDeps: Set<string> = new Set();

	constructor(s: SourceFile) {
		this.#source = s;
		this.#dateObject = {
			import: { '~global': {} },
			extend: { '~global': {} },
			template: { var: {}, sh: [], fragment: true },
			script: '',
			before: '',
			global: '',
			event: '',
			component_event: '',
			component_interface: '',
			interface: '',
			listen: '',
			once_interface: [],
			css: '',
			keyframesNames: [],
			'expose-event': {},
			'use-element-id-list': [],
			slots: {}
		};
	}

	get data(): MDataOutput {
		return {
			...this.#dateObject,
			name: this.#name,
			cssScope: this.#cssScope,
			once_interface_args: this.#once_interface_args,
			originalFile: this.#originalFile.replaceAll('\\', '/'),
			contentHash: this.#source.contentHash
		} as unknown as MDataOutput;
	}

	get #d() {
		return this.#dateObject as Record<string, unknown> & {
			template: Record<string, unknown> & {
				var: Record<string, unknown>;
				sh: string[];
				fragment: boolean;
			};
			before: string;
			global: string;
			script: string;
			event: string;
			listen: string;
			component_event: string;
			component_interface: string;
			interface: string;
			css: string;
			keyframesNames: string[];
			once_interface: string[];
			'expose-event': Record<string, unknown>;
			'use-element-id-list': string[];
			slots: string[];
			slotContentMap?: Record<string, Record<string, unknown[]>>;
			slotAppendMap?: Record<string, Record<string, { sh: string[]; varDecl: string; vars: string[]; creations: string }>>;
		};
	}

	init(): this {
		const absPath = this.#source.absolute();
		const fileContent = readFileSync(absPath, 'utf-8');
		const dom = parse(`<root>${fileContent}</root>`);
		this.#originalFile = node_path.normalize(absPath).substring(project.srcDir.length);
		this.#name = generateComponentName(
			this.#originalFile,
			project.build_config.build.module === true,
			project.build_config.config.name
		);
		const FILE_NAME = this.#name;
		printf.outFile.info(`处理 ${absPath}`);

		function isModuleTag(tag: string): () => { bool: boolean; result: string } {
			return () =>
				tag.substring(0, 7) === 'module:'
					? { bool: true, result: tag.substring(7) }
					: { bool: false, result: tag };
		}

		task(() => {
			printf.outFile.info(`预处理 import:${absPath}`);
			dom.querySelectorAll('root>import').forEach((e) => {
				const namespace = e.getAttribute('namespace') || '~global';
				const root = e.getAttribute('root') || '';
				if (!Object.hasOwn((this.#dateObject['import'] as Record<string, unknown>), namespace))
					(this.#dateObject['import'] as Record<string, Record<string, unknown>>)[namespace] = {};
				const module = (this.#dateObject['import'] as Record<string, Record<string, unknown>>)[namespace];
				e.childNodes.forEach((node) => {
					if (node.nodeType === 3) return;
					is(
						isModuleTag(node.rawTagName),
						(tag) => {
							const s = tag + '/';
							node.childNodes.forEach((_node) => {
								if (_node.nodeType === 3) return;
								const newTag = _node.rawTagName;
								is(isModuleTag(newTag), () => {
									throw new Error(`模块内不能再嵌套模块 [${node.rawTagName} > ${newTag}] [file:${FILE_NAME}]`);
								});
								const src = _node.hasAttribute('src') ? _node.getAttribute('src') + '/' : '';
								module[newTag] = `${root}/${s}${src}${newTag}`.replace(/\/+/g, '/');
							});
						},
						(tag) => {
							const src = node.hasAttribute('src') ? node.getAttribute('src') + '/' : '';
							module[tag] = `${root}/${src}${tag}`.replace(/\/+/g, '/');
						}
					);
				});
			});
			traversal.object(this.#dateObject.import, (o) => {
				traversal.object(o, (v) => {
					if (!mSource.has(v)) printf.outFile.log(`外部导入 ${v}`);
				});
			});
		}, `预处理 [import:${absPath}]`);

		task(() => {
			printf.outFile.info(`预处理 extend:${absPath}`);
			dom.querySelectorAll('root>extend').forEach((e) => {
				const namespace = e.getAttribute('namespace') || '~global';
				const root = e.getAttribute('root') || '';
				if (!Object.hasOwn((this.#dateObject['extend'] as Record<string, unknown>), namespace))
					(this.#dateObject['extend'] as Record<string, Record<string, unknown>>)[namespace] = {};
				const module = (this.#dateObject['extend'] as Record<string, Record<string, unknown>>)[namespace];
				e.childNodes.forEach((node) => {
					if (node.nodeType === 3) return;
					is(
						isModuleTag(node.rawTagName),
						(tag) => {
							const s = tag + '/';
							node.childNodes.forEach((_node) => {
								if (_node.nodeType === 3) return;
								const newTag = _node.rawTagName;
								is(isModuleTag(newTag), () => {
									throw new Error(`模块内不能再嵌套模块 [${node.rawTagName} > ${newTag}] [file:${FILE_NAME}]`);
								});
								const src = _node.hasAttribute('src') ? _node.getAttribute('src') + '/' : '';
								module[newTag] = `${root}/${s}${src}${newTag}`;
							});
						},
						(tag) => {
							const src = node.hasAttribute('src') ? node.getAttribute('src') + '/' : '';
							module[tag] = `${root}/${src}${tag}`;
						}
					);
				});
			});
			traversal.object(this.#dateObject.extend, (o) => {
				traversal.object(o, (v) => {
					if (!mSource.has(v)) printf.outFile.log(`外部导入 ${v}`);
				});
			});
		}, `预处理 [extend:${absPath}]`);

		task(() => {
			printf.outFile.info(`预处理 template:${absPath}`);
			const domTemplate = dom.querySelector('root>template');
			if (!domTemplate) throw new Error(`组件缺少 <template> 元素 [file:${FILE_NAME}]`);
			traversal.object(this.#dateObject.extend, (namespace, _i, _k) => {
				traversal.object(namespace, (src) => {
					const parentPath = node_path.join(project.srcDir, (src as string) + '.m');
					if (!existsSync(parentPath)) throw new Error(`继承的组件文件不存在 [path:${parentPath}]`);
					const parentContent = readFileSync(parentPath, 'utf-8');
					const parentDom = parse(`<root>${parentContent}</root>`);
					const parentTemplate = parentDom.querySelector('root>template');
					if (parentTemplate)
						mergeTemplateChildren(
							domTemplate as unknown as {
								childNodes: unknown[];
								querySelectorAll: (s: string) => unknown[];
								appendChild: (c: unknown) => void;
								nodeType?: number;
							},
							parentTemplate as unknown as {
								childNodes: unknown[];
								querySelectorAll: (s: string) => unknown[];
								appendChild: (c: unknown) => void;
								nodeType?: number;
							}
						);
					parentDom.querySelectorAll('root > script').forEach((pe) => {
						const codeType = pe.getAttribute('code');
						if (codeType === 'event' || codeType === 'listen' || codeType === 'interface') {
							const parentCode = trimString(pe.outerHTML, 'script', pe.rawAttrs);
							const existing = dom.querySelector(`root > script[code="${codeType}"]`);
							if (existing) {
								const childCode = trimString(existing.outerHTML, 'script', existing.rawAttrs);
								const merged = mergeScriptCode(parentCode, childCode);
								existing.innerHTML = merged;
							} else {
								const scriptStr = `<script code="${codeType}">${parentCode}</script>`;
								const scriptEl = parse(scriptStr).querySelector('script');
								if (scriptEl) dom.querySelector('root')!.appendChild(scriptEl);
							}
						}
					});
					parentDom.querySelectorAll('root > css').forEach((pc) => {
						const parentScope = pc.hasAttribute('scope') ? pc.getAttribute('scope') : '&';
						const parentHasDefaultTheme = pc.hasAttribute('default-theme');
						const parentCode = trimString(pc.outerHTML, 'css', pc.rawAttrs);
						let matched = false;
						dom.querySelectorAll('root > css').forEach((cc) => {
							const childScope = cc.hasAttribute('scope') ? cc.getAttribute('scope') : '&';
							if (
								parentScope === childScope &&
								parentHasDefaultTheme === cc.hasAttribute('default-theme')
							) {
								cc.innerHTML = parentCode + '\n' + cc.innerHTML;
								matched = true;
							}
						});
						if (!matched) {
							const cssStr = pc.hasAttribute('default-theme')
								? `<css scope="${parentScope}" default-theme>${parentCode}</css>`
								: `<css scope="${parentScope}">${parentCode}</css>`;
							const parentCssEl = parse(cssStr).querySelector('css');
							(parentCssEl as Record<string, boolean>).__merged = true;
							if (parentCssEl) dom.querySelector('root')!.appendChild(parentCssEl);
						}
					});
				});
			});
		}, `合并 [extend:${absPath}]`);

		task(() => {
			// 预扫描 #cssScope,填充 #id -> m-scope-xxx 映射.
			// 来源有两个:
			//   1. <css scope="#id:xxx"> 块 (CSS 规则锚点)
			//   2. 模板里 #id=".xxx" 标记 (自动生成,无须 <css> 块)
			// extend 合并后,父级 <css> 块已合并进 dom,这里能正确识别.
			dom.querySelectorAll('root > css').forEach((e) => {
				let scope = e.hasAttribute('scope') ? e.getAttribute('scope') : '&';
				if (!scope || scope.trim() === '') return;
				if (scope.length > 5 && scope.substring(0, 4) === '#id:') {
					const idKey = scope.substring(4);
					if (idKey && !Object.hasOwn(this.#cssScope, idKey)) {
						this.#cssScope[idKey] = 'm-scope-' + idGenerate(6);
					}
				}
			});
			const seenIds = new Set<string>();
			const collectIds = (root: unknown): void => {
				const n = root as { nodeType: number; attrs: Record<string, string>; childNodes: unknown[] };
				if (!n || n.nodeType !== 1) return;
				const idAttr = n.attrs?.['#id'];
				if (typeof idAttr === 'string' && idAttr.startsWith('.')) {
					const firstToken = idAttr.substring(1).split(/\s+/, 1)[0];
					if (firstToken && !seenIds.has(firstToken)) {
						seenIds.add(firstToken);
						if (!Object.hasOwn(this.#cssScope, firstToken)) {
							this.#cssScope[firstToken] = 'm-scope-' + idGenerate(6);
						}
					}
				}
				if (Array.isArray(n.childNodes)) {
					for (const c of n.childNodes) collectIds(c);
				}
			};
			collectIds(dom.querySelector('root>template'));
		}, `预处理 [css-scope:${absPath}]`);

		task(() => {
			printf.outFile.info(`预处理 $template:${absPath}`);
			const $template = dom.querySelector('root>template')!;
			traversal.object(this.#dateObject.import, (namespace, _i, k) => {
				const namespaceTag = k === '~global' ? '' : (k as string) + '\\:';
				traversal.object(namespace, (src, _i, tag) => {
					$template.querySelectorAll(`${namespaceTag}${tag}`).forEach((node) => {
						(node as unknown as { setAttribute(n: string, v: unknown): void }).setAttribute('#import', src);
					});
				});
			});

			const slotContentMap: Record<string, Record<string, unknown[]>> = {};
			const slotAppendMap: Record<string, Record<string, { sh: string[]; varDecl: string; vars: string[]; creations: string }>> = {};
			const allImportSrcs: string[] = [];
			$template.querySelectorAll('[\\#import]').forEach((importEl) => {
				const importSrc = importEl.attrs['#import'];
				allImportSrcs.push(importSrc);
				const slotChildren: unknown[] = [];
				const normalChildren: unknown[] = [];
				importEl.childNodes.forEach((c: unknown) => {
					const cn = c as { nodeType: number; attrs: Record<string, string> };
					if (cn.nodeType === 1 && cn.attrs && cn.attrs['#slot']) {
						delete cn.attrs['#slot'];
						slotChildren.push(c);
					} else {
						normalChildren.push(c);
					}
				});
				if (slotChildren.length > 0) {
					(importEl as unknown as { childNodes: unknown[] }).childNodes = normalChildren;
					if (!slotContentMap[importSrc]) slotContentMap[importSrc] = {};
					slotChildren.forEach((sc: unknown) => {
						const scn = sc as { attrs: Record<string, string>; rawTagName: string };
						const sn = scn.attrs['#slot'] || 'default';
						if (!slotContentMap[importSrc][sn]) slotContentMap[importSrc][sn] = [];
						slotContentMap[importSrc][sn].push(sc);
					});
				}
			});

			(this.#dateObject as Record<string, unknown>)['slotContentMap'] = slotContentMap;

			const seenImports: Record<string, boolean> = {};
			for (let j = 0; j < allImportSrcs.length; j++) {
				const importSrc = allImportSrcs[j];
				if (seenImports[importSrc]) continue;
				seenImports[importSrc] = true;
				const compName = importSrc.replace(/[^a-zA-Z]/g, '_').toLowerCase();
				if (COMPONENT_SLOT_REQUIRED.has(compName)) {
					const requiredSlots = COMPONENT_SLOT_REQUIRED.get(compName)!;
					const providedSlots = slotContentMap[importSrc] ? Object.keys(slotContentMap[importSrc]) : [];
					requiredSlots.forEach(function (rs) {
						if (providedSlots.indexOf(rs) === -1) {
							throw new Error(`\u7EC4\u4EF6 "${importSrc}" \u8981\u6C42\u63D2\u69FD "${rs}" \u5FC5\u987B\u63D0\u4F9B\u5185\u5BB9 [file:${FILE_NAME}]`);
						}
					});
				}
			}

			let count = 0;
			const seenTemplateIds = new Map<string, string>();
			const it = (rootElement: unknown, parentNode: unknown) => {
				let segment = `append(${parentNode}`;
				(rootElement as { childNodes: unknown[] }).childNodes.forEach((element: unknown) => {
					// eslint-disable-next-line no-useless-assignment
					let varName = '';
					const el = element as {
						nodeType: number;
						attrs: Record<string, string>;
						text: string;
						tagName: string;
						childNodes: unknown[];
					};
					if (el.nodeType === 1) {
						const attribs: Record<string, unknown> = {
							attribs: {},
							event: {},
							args: {},
							keyword: {}
						};
						traversal.object(el.attrs, (v, _i, k) => {
							const c = (k as string).at(0)!;
							const n = (k as string).substring(1);
							if (c === '#') {
								if (n === 'import') attribs['import'] = v;
								else if (n.includes(':')) {
									const [kn, vn] = n.split(':');
									if (!Object.hasOwn((attribs.keyword as Record<string, unknown>), kn))
										(attribs.keyword as Record<string, Record<string, unknown>>)[kn] = {};
									(attribs.keyword as Record<string, Record<string, unknown>>)[kn][vn] = v;
								} else if (n === 'id') {
									// 校验 #id 值去重
									const idVal = typeof v === 'string' ? v : '';
									if (idVal && !idVal.startsWith('.')) {
										if (seenTemplateIds.has(idVal)) {
											const first = seenTemplateIds.get(idVal)!;
											throw new Error(`组件中存在重复的 #id="${idVal}",首次出现在 <${first}> [file:${FILE_NAME}]`);
										}
										seenTemplateIds.set(idVal, el.tagName.toLowerCase());
									}
									if (typeof v === 'string' && v.startsWith('.')) {
										// #id=".foo bar" 简写: 把 .foo bar 合并进 class,不产生 id 属性
										// 如 <span #id=".time" class="latin">  →  <span class="time latin">
										const afterDot = v.substring(1);
										const firstToken = afterDot.split(/\s+/, 1)[0];
										(attribs.keyword as Record<string, unknown>)[n] = firstToken;
										// 合并 class (按源码属性顺序,后续属性可能再追加)
										const existing = (attribs.attribs as Record<string, unknown>)['class'] as string | undefined;
										(attribs.attribs as Record<string, unknown>)['class'] = existing ? `${afterDot} ${existing}` : afterDot;
									} else (attribs.keyword as Record<string, unknown>)[n] = v;
								} else (attribs.keyword as Record<string, unknown>)[n] = v;
							} else if (c === '@') {
								const sv = v as string;
								const ind = sv.indexOf(':');
								(attribs.event as Record<string, unknown>)[n] =
									ind !== -1 ? [sv.substring(0, ind), sv.substring(ind + 1)] : [v, '{}'];
							} else if (c === ':') {
								(attribs.args as Record<string, unknown>)[n] = v;
							} else {
								// class 属性合并: 处理 #id 简写先设置过 class 的场景
								// 如 <span #id=".time" class="latin">  →  <span class="time latin">
								if (k === 'class' && (attribs.attribs as Record<string, unknown>)['class']) {
									(attribs.attribs as Record<string, unknown>)['class'] =
										`${(attribs.attribs as Record<string, unknown>)['class']} ${v}`;
								} else {
									(attribs.attribs as Record<string, unknown>)[k as string] = v;
								}
							}
						});
						// scope class 处理: 仅当元素自身带 #id (或 id 属性) 且 id 在 #cssScope 中时,才把 scope class 合并进 class
						// #id 只标记一个元素,scope class 不向后代继承 (CSS 通过后代选择器 .m-scope-xxx .descendant 匹配子元素)
						const keywordIdVal = (attribs.keyword as Record<string, unknown>)['id'] as string | undefined;
						const attrIdVal = (attribs.attribs as Record<string, unknown>)['id'] as string | undefined;
						const idToCheck = keywordIdVal || attrIdVal;
						if (idToCheck && Object.hasOwn(this.#cssScope, idToCheck)) {
							const scopeClass = this.#cssScope[idToCheck];
							const existing = (attribs.attribs as Record<string, unknown>)['class'] as string | undefined;
							if (!existing || !existing.split(/\s+/).includes(scopeClass)) {
								(attribs.attribs as Record<string, unknown>)['class'] = existing ? `${scopeClass} ${existing}` : scopeClass;
							}
						}
						if (el.tagName.toLowerCase() === 'slot') {
							const slotAttrs = attribs.attribs as Record<string, string>;
							const slotName = slotAttrs.name || 'default';
							if (!/^[a-zA-Z0-9_-]+$/.test(slotName)) {
								throw new Error(`组件 "${this.#name}" 中 <slot> 的 name 属性值不合法: "${slotName}",只允许字母,数字,下划线和连字符`);
							}
							varName = `slots_${slotName}`;
							this.#d.template.var[varName] = {
								type: 'slot',
								slotName: slotName
							};
							if (slotAttrs.must !== undefined) {
								const compName = this.#name;
								if (!COMPONENT_SLOT_REQUIRED.has(compName)) COMPONENT_SLOT_REQUIRED.set(compName, new Set());
								COMPONENT_SLOT_REQUIRED.get(compName)!.add(slotName);
							}
							segment += `,${varName}`;
							return;
						}
						varName = attribs['import'] ? `i_${count++}` : `e_${count++}`;
						this.#d.template.var[varName] = {
							type: attribs['import'] ? 'import' : 'element',
							tagName: el.tagName.toLowerCase(),
							...attribs
						};
						if (el.childNodes.length > 0) it(element, varName);
					} else if (el.nodeType === 3) {
						if (el.text.trim() === '') return;
						varName = `t_${count++}`;
						this.#d.template.var[varName] = {
							type: 'text',
							content: el.text
						};
					} else {
						return;
					}
					segment += `,${varName}`;
				});
				const temp = segment.substring(33).split(',');
				if (temp.length === 1) this.#d.template.fragment = false;
				this.#d.template.sh.push(segment + ');');
			};
			it($template, 'this.__magic_element_root');

			for (const compName in slotContentMap) {
				slotAppendMap[compName] = {};
				for (const slotName in slotContentMap[compName]) {
					const scStartCount = count;
					const shStartIdx = this.#d.template.sh.length;
					const scEls = slotContentMap[compName][slotName];
					scEls.forEach(function (scEl) {
						it(scEl, '__magic_slot_root');
					});
					const slotVars: string[] = [];
					const keys = Object.keys(this.#d.template.var);
					for (let vi = 0; vi < keys.length; vi++) {
						const vk = keys[vi];
						if (vk.toString().startsWith('e_' + scStartCount) ||
							vk.toString().startsWith('i_' + scStartCount) ||
							vk.toString().startsWith('t_' + scStartCount)) {
							slotVars.push(vk);
						}
						if (vk.toString().startsWith('e_' + (count - 1)) ||
							vk.toString().startsWith('i_' + (count - 1)) ||
							vk.toString().startsWith('t_' + (count - 1))) {
							slotVars.push(vk);
							break;
						}
					}
					const slotSh = this.#d.template.sh.splice(shStartIdx, this.#d.template.sh.length - shStartIdx);
					const tv2 = this.#d.template.var as Record<string, unknown>;
					slotVars.forEach(function (v) { delete tv2[v]; });

					const slotVarDecl = slotVars.length > 0 ? 'var ' + slotVars.join(',') : '';
					let slotCreateStmts = '';
					const tv3 = tv2;
					slotVars.forEach(function (v) {
						if (!tv3[v]) return;
						const si = tv3[v] as { type: string; tagName?: string; import?: string; content?: string };
						if (si.type === 'element') slotCreateStmts += v + ' = e(`' + si.tagName + '`);\n';
						else if (si.type === 'text') slotCreateStmts += v + ' = t(`' + (si.content || '').replace(/`/g, '\\`') + '`);\n';
						else if (si.type === 'import') slotCreateStmts += v + ' = i(`' + si.import + '`);\n';
					});
					const replRoot = '__magic_slot_root_' + compName + '_' + slotName;
					slotAppendMap[compName][slotName] = {
						sh: slotSh,
						varDecl: slotVarDecl,
						vars: slotVars,
						creations: slotCreateStmts.replace(/__magic_slot_root/g, replRoot)
					};
				}
			}

			const templateArgs = {
				inline: ($template as { hasAttribute(n: string): boolean }).hasAttribute('inline')
			};
			(this.#dateObject as Record<string, unknown>)['templateArgs'] = templateArgs;
			(this.#dateObject as Record<string, unknown>)['slotContentMap'] = slotContentMap;
			(this.#dateObject as Record<string, unknown>)['slotAppendMap'] = slotAppendMap;
		}, `预处理 [template:${absPath}]`);

		const _rs_before: {
			outerHTML: string;
			rawAttrs: string;
			innerHTML?: string;
			hasAttribute(name: string): boolean;
			getAttribute(name: string): string;
			childNodes: unknown[];
			appendChild(c: unknown): void;
		}[] = [],
			_rs_global: {
				outerHTML: string;
				rawAttrs: string;
				innerHTML?: string;
				hasAttribute(name: string): boolean;
				getAttribute(name: string): string;
			}[] = [],
			_rs_script: {
				outerHTML: string;
				rawAttrs: string;
				innerHTML?: string;
			}[] = [],
			_rs_event: { outerHTML: string; rawAttrs: string; innerHTML?: string }[] = [],
			_rs_listen: {
				outerHTML: string;
				rawAttrs: string;
				innerHTML?: string;
			}[] = [],
			_rs_interface: {
				outerHTML: string;
				rawAttrs: string;
				innerHTML?: string;
				hasAttribute(name: string): boolean;
				getAttribute(name: string): string;
			}[] = [],
			_rs_component_event: {
				outerHTML: string;
				rawAttrs: string;
				innerHTML?: string;
			}[] = [],
			_rs_component_interface: {
				outerHTML: string;
				rawAttrs: string;
				innerHTML?: string;
			}[] = [];

		dom.querySelectorAll(`root > script`).forEach((e) => {
			const code = e.attributes['code'];
			if (code === 'before') _rs_before.push(e);
			else if (code === 'event') _rs_event.push(e);
			else if (code === 'component-event') _rs_component_event.push(e);
			else if (code === 'component-interface') _rs_component_interface.push(e);
			else if (code === 'global') _rs_global.push(e);
			else if (code === 'interface') _rs_interface.push(e);
			else if (code === 'listen') _rs_listen.push(e);
			else _rs_script.push(e);
		});

		task(() => {
			dom.querySelectorAll(`root > expose-event`).forEach((e) => {
				e.childNodes.forEach((child) => {
					if (child.nodeType !== 1) return;
					const nodeName = (child as unknown as { rawTagName: string }).rawTagName.toLowerCase();
					(this.#dateObject['expose-event'] as Record<string, unknown>)[nodeName] = Object.keys(
						child.attributes
					).map((attrName) => attrName.replace(/^:/, ''));
				});
			});
			this.#dateObject['expose-event'] = JSON.stringify(this.#dateObject['expose-event']);
		}, `预处理 [expose-event:${absPath}]`);

		const scopePretreatmentMagicMacro = {
			createUiData: false as boolean,
			uiDataName: '' as string,
			elementIDList: new Set<string>()
		};
		const sourceDir = node_path.dirname(absPath);

		task(() => {
			_rs_before.forEach((e) => {
				this.#d.before += `${trimString(e.outerHTML, 'script', e.rawAttrs)}`;
			});
			const { code: beforeCode } = pretreatmentMagicMacro(this.#d.before, scopePretreatmentMagicMacro, sourceDir, this.#originalFile);
			this.#d.before = beforeCode;
		}, `预处理 [before:${absPath}]`);

		task(() => {
			_rs_global.forEach((e) => {
				this.#d.global += `${trimString(e.outerHTML, 'script', e.rawAttrs)}`;
			});
			const { code: globalCode } = pretreatmentMagicMacro(this.#d.global, scopePretreatmentMagicMacro, sourceDir, this.#originalFile);
			this.#d.global = globalCode;
		}, `预处理 [global:${absPath}]`);

		task(() => {
			_rs_script.forEach((e) => {
				this.#d.script += `${trimString(e.outerHTML, 'script', e.rawAttrs)}`;
			});
			const { code: scriptCode } = pretreatmentMagicMacro(this.#d.script, scopePretreatmentMagicMacro, sourceDir, this.#originalFile);
			this.#d.script = scriptCode;
		}, `预处理 [script:${absPath}]`);

		this.#d['use-element-id-list'] = [...scopePretreatmentMagicMacro.elementIDList];

		task(() => {
			_rs_event.forEach((e) => {
				this.#d.event += `${trimString(e.outerHTML, 'script', e.rawAttrs)}`;
			});
			const { code: eventCode } = pretreatmentMagicMacro(this.#d.event, scopePretreatmentMagicMacro, sourceDir, this.#originalFile, this.#includedDeps);
			const oo = eventCode;
			this.#dateObject['event'] = {
				code: pretreatmentMagicEvent(oo),
				list: getMagicDefineScript(oo)
			};
		}, `预处理 [event:${absPath}]`);

		task(() => {
			_rs_component_event.forEach((e) => {
				this.#d.component_event += `${trimString(e.outerHTML, 'script', e.rawAttrs)}`;
			});
			const { code: ceCode } = pretreatmentMagicMacro(this.#d.component_event, scopePretreatmentMagicMacro, sourceDir, this.#originalFile);
			const oo = ceCode;
			this.#dateObject['component_event'] = {
				code: pretreatmentMagicEvent(oo, '__magic_component_event'),
				list: getMagicDefineScript(oo)
			};
		}, `预处理 [component-event:${absPath}]`);

		task(() => {
			_rs_component_interface.forEach((e) => {
				this.#d.component_interface += `${trimString(e.outerHTML, 'script', e.rawAttrs)}`;
			});
			const { code: ciCode } = pretreatmentMagicMacro(this.#d.component_interface, scopePretreatmentMagicMacro, sourceDir, this.#originalFile);
			this.#d.component_interface = ciCode;
		}, `预处理 [component-interface:${absPath}]`);

		task(() => {
			_rs_listen.forEach((e) => {
				this.#d.listen += `${trimString(e.outerHTML, 'script', e.rawAttrs)}`;
			});
			const { code: listenCode } = pretreatmentMagicMacro(this.#d.listen, scopePretreatmentMagicMacro, sourceDir, this.#originalFile);
			const oo = listenCode;
			this.#dateObject['listen'] = {
				code: pretreatmentMagicListen(oo),
				list: getMagicDefineScript(oo)
			};
		}, `预处理 [listen:${absPath}]`);

		task(() => {
			_rs_interface.forEach((e) => {
				const code = trimString(e.outerHTML, 'script', e.rawAttrs);
				this.#d.interface += code;
				if (e.hasAttribute('once')) {
					const li = getMagicDefineScript(code);
					this.#d.once_interface.push(...li);
				}
			});
			const { code: interfaceCode } = pretreatmentMagicMacro(this.#d.interface, scopePretreatmentMagicMacro, sourceDir, this.#originalFile, this.#includedDeps);
			const oo = interfaceCode;
			this.#dateObject['interface'] = {
				code: pretreatmentMagicInterface(oo),
				list: getMagicDefineScript(oo)
			};
		}, `预处理 [interface:${absPath}]`);

		task(() => {
			printf.outFile.info(`预处理 css:${absPath}`);
			const cssDefaultThemeTransitionVar = () => {
				return {
					postcssPlugin: 'css-default-theme-transition-var' as string,
					OnceExit(root: unknown) {
						(root as { walkAtRules(fn: (r: unknown) => void): void }).walkAtRules((rule: unknown) => {
							const n = (rule as { name: string }).name;
							if (n === 'keyframes' || n === 'media') (rule as unknown as { remove(): void }).remove();
						});
					},
					Declaration(decl: unknown) {
						const d = decl as { prop: string; value: string; parent: { selector: string } };
						if (d.prop.startsWith('--') || d.value.startsWith('var(')) return;
						const nt = d.parent.selector
							.replace(/[&>.="*[\]]/g, '')
							.replace(/\s+/g, ' ')
							.replace(/[^a-zA-Z0-9]/g, '-');
						const varName = `--${FILE_NAME}-${nt}-${d.prop.replace(/-/g, '-')}-${CSS_VAR_COUNT++}`;
						CSS_VAR += `${varName}: ${d.value}; \n`;
						d.value = `var(${varName})`;
					}
				} as unknown as Record<string, unknown>;
			};
			(cssDefaultThemeTransitionVar() as Record<string, boolean>).postcss = true;

			dom.querySelectorAll(`root > css`).forEach((e) => {
				const code = trimString(e.outerHTML, 'css', e.rawAttrs);

				// 校验 CSS 属性是否符合 default-theme 规则(跳过 keyframes 块和 extend 合并块)
				if (!e.hasAttribute('keyframes') && !(e as Record<string, boolean>).__merged) {
					const isDefaultTheme = e.hasAttribute('default-theme');
					const allowedProps = getDefaultThemeProperties();
					if (allowedProps.size > 0) {
						try {
							// 计算 <css> 标签在 .m 文件中的行号偏移
							const wrapped = `<root>${fileContent}</root>`;
							const outerHTML = e.outerHTML;
							const outerPos = wrapped.indexOf(outerHTML);
							const cssTagLine = outerPos !== -1
								? wrapped.substring(0, outerPos).split('\n').length
								: 0;
							const cssRoot = (postcss as unknown as { parse(css: string): { walkRules(fn: (r: unknown) => void): void } }).parse(code);
							// 去重:同一文件的同一行同一属性只报一次
							const reported = new Set<string>();
							cssRoot.walkRules((rule: unknown) => {
								(rule as { walkDecls(fn: (d: unknown) => void): void }).walkDecls((decl: unknown) => {
									const d = decl as { prop: string; source: { start: { line: number } } };
									const prop = d.prop;
									const fileLine = cssTagLine + d.source.start.line - 1;
									if (isDefaultTheme) {
										if (!allowedProps.has(prop)) {
											const key = `${fileLine}:${prop}`;
											if (!reported.has(key)) {
												reported.add(key);
												getErrorAggregator().addError(
													this.#source.relative(),
													`<css default-theme> 中不允许包含属性 "${prop}",请移至普通 <css> 块`,
													fileLine
												);
											}
										}
									} else {
										if (allowedProps.has(prop)) {
											const key = `${fileLine}:${prop}`;
											if (!reported.has(key)) {
												reported.add(key);
												getErrorAggregator().addError(
													this.#source.relative(),
													`普通 <css> 中不允许包含 default-theme 属性 "${prop}",请移至 <css default-theme> 块`,
													fileLine
												);
											}
										}
									}
								});
							});
						} catch { /* parse error handled by PostCSS later */ }
					}
				}

				if (e.hasAttribute('keyframes')) {
					const prefix = FILE_NAME + '-';
					const root = (postcss as unknown as { parse(css: string): { walkAtRules(name: string, fn: (r: { params: string; toString(): string }) => void): void } }).parse(code);
					root.walkAtRules('keyframes', (atRule) => {
						const oldName = atRule.params;
						atRule.params = prefix + oldName;
						this.#d.keyframesNames.push(oldName);
					});
					this.#d.css += root.toString() + '\n';
					return;
				}

				// ---- regular <css scope> branch ----
				let scope = e.hasAttribute('scope') ? e.getAttribute('scope') : '&';
				if (scope.trim() === '') return;
				if (scope.length > 5 && scope.substring(0, 4) === '#id:') {
					scope = scope.substring(4);
					if (Object.hasOwn(this.#cssScope, scope)) scope = `.${this.#cssScope[scope]}`;
					else {
						const id = 'm-scope-' + idGenerate(6);
						this.#cssScope[scope] = id;
						scope = `.${id}`;
					}
				}

				// Build PostCSS plugin chain
				const plugins: object[] = [postcssShorthandExpand as unknown as object];
				if (this.#d.keyframesNames.length > 0) {
					plugins.push(postcssKeyframesRename(this.#d.keyframesNames, FILE_NAME) as unknown as object);
				}
				if (e.hasAttribute('default-theme') && project.build_config.build.optimize['out-default-theme']) {
					plugins.push(cssDefaultThemeTransitionVar() as unknown as object);
				}
				const result = postcss(plugins).process(code, {}) as { css: string };
				const cssStr = (result as unknown as { css: string }).css;
				this.#d.css += `${scope} { ${cssStr} }\n`;
			});
		}, `预处理 [css:${absPath}]`);
		return this;
	}

	/**
	 * 将 magic_define_include 收集到的依赖文件路径写入缓存.
	 * 下次构建时,2_scan 通过 getAffectedFiles 找到因依赖变更而需重编的 .m 文件.
	 */
	saveDeps(): void {
		const rel = this.#originalFile.replace(/\\/g, '/').replace(/^\.\//, '');
		const cachePath = getCachePath(project.dir);
		const store = getStore(cachePath);
		store.setDeps(rel, Array.from(this.#includedDeps));
	}
}

export function _5(m: SourceFile[]): Promise<void> {
	const profiler = getProfiler();
	const errorAggregator = getErrorAggregator();

	profiler.start('compile:total');
	profiler.start('compile:dependency-propagation');

	const promises: Promise<mData>[] = [];
	mSource.init(m);

	const fileMap = new Map<string, SourceFile>();
	m.forEach((s) => {
		fileMap.set(s.relative().slice(0, -2).replace(/\\/g, '/'), s);
	});

	let propagateChanged = true;
	while (propagateChanged) {
		propagateChanged = false;
		m.forEach((s) => {
			if (!s.changed) return;
			try {
				const content = readFileSync(s.absolute(), 'utf-8');
				const dom = parse(`<root>${content}</root>`);
				dom.querySelectorAll('root>extend').forEach((e) => {
					const root = e.getAttribute('root') || '';
					e.childNodes.forEach((node) => {
						if (node.nodeType === 3) return;
						const tag = node.rawTagName;
						const depPath = `${root}/${tag}`;
						const dep = fileMap.get(depPath);
						if (dep && !dep.changed) {
							dep.changed = true;
							propagateChanged = true;
						}
					});
				});
			} catch (err: unknown) {
				errorAggregator.addError(s.relative(), (err as Error).message);
			}
		});
	}

	profiler.end('compile:dependency-propagation');

	const isRelease = project.build_config.build.model === 'release';

	if (isRelease && m.some((s) => s.changed)) {
		m.forEach((s) => {
			s.changed = true;
		});
	}

	const changedM = m.filter((s) => s.changed);
	const unchangedM = m.filter((s) => !s.changed);

	if (unchangedM.length > 0) {
		printf.outFile.info(`增量编译:跳过 ${unchangedM.length} 个未变更组件,编译 ${changedM.length} 个`);
	}

	changedM.forEach((s) => printf.outFile.info(`编译组件: ${s.relative()}`));

	const toCompile = project.build_config.build.optimize['remove-unused']
		? filterUsedComponents(changedM, project.build_config.config.main)
		: changedM;

	profiler.start('compile:individual');
	toCompile.forEach((s) => {
		promises.push(
			new Promise((resolve) => {
				try {
					const data = new mData(s);
					data.init();
					data.saveDeps();
					resolve(data);
				} catch (err: unknown) {
					errorAggregator.addError(s.relative(), (err as Error).message);
					resolve(null as unknown as mData);
				}
			})
		);
	});
	return Promise.all(promises).then((ms) => {
		profiler.end('compile:individual');
		const validMs = ms.filter((d) => d !== null);

		if (errorAggregator.hasErrors()) {
			const count = errorAggregator.errors.length;
			errorAggregator.flush();
			throw new Error(`编译失败: ${count} 个错误`);
		}

		CSS_VAR += '}';
		profiler.end('compile:total');
		profiler.start('compile:generate');
		BUILD_TIMER.lap('编译组件');
		const result = _6(validMs, CSS_VAR, unchangedM);
		if (result) {
			result.then(() => profiler.end('compile:generate'));
		} else {
			profiler.end('compile:generate');
		}
		return result;
	});
}
