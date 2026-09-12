import { describe, expect, it } from 'bun:test';
import { generateModuleJS } from '../../script/compiler/step/6_generate.ts';
import type { MDataOutput } from '../../script/types.ts';
import { app } from '../../app.ts';

function createBaseData(overrides: Partial<MDataOutput> = {}): MDataOutput {
	return {
		name: 'test-comp',
		cssScope: {},
		once_interface_args: {},
		originalFile: 'test.m',
		contentHash: 'abc123',
		keyframesCss: '',
		keyframesNames: [],
		template: { var: {}, sh: [], fragment: false },
		templateArgs: {},
		before: '',
		global: '',
		event: { code: '', list: [] },
		component_event: { code: '', list: [] },
		component_interface: '',
		interface: { code: '', list: [] },
		listen: { code: '', list: [] },
		script: '',
		css: '',
		slots: [],
		'expose-event': {},
		'use-element-id-list': [],
		once_interface: [],
		...overrides,
	} as MDataOutput;
}

describe('compiler integration - complex components', () => {
	it('should compile a full component with event + listen + interface', () => {
		const data = createBaseData({
			name: 'full-comp',
			template: {
				var: {
					btn: { type: 'element', tagName: 'button', event: { click: ['onBtnClick', {}] } },
					title: { type: 'element', tagName: 'h1' }
				},
				sh: ['append(this.__magic_element_root, btn);', 'append(this.__magic_element_root, title);'],
				fragment: false
			},
			'use-element-id-list': ['btn', 'title'],
			event: { code: 'onBtnClick = () => { this.__magic_interface.greet("world"); }', list: ['onBtnClick'] },
			listen: { code: 'onChildSubmit = (data) => console.log(data)', list: ['onChildSubmit'] },
			interface: { code: 'this.__magic_interface = { greet: (name) => "Hello " + name }', list: ['greet'] },
			component_event: { code: 'created = () => {}; destroy = () => {}', list: ['created', 'destroy'] },
		});

		const result = generateModuleJS(data);
		expect(result).toContain('"full-comp"');
		expect(result).toContain('eve(btn,"click",this,"onBtnClick"');
		expect(result).toContain('onChildSubmit = (data) => console.log(data)');
		expect(result).toContain('magic.initComponentInterface(this)');
		expect(result).toContain('created');
		expect(result).toContain('destroy');
		expect(result).toContain('greet');
	});

	it('should handle component with all script types', () => {
		const data = createBaseData({
			name: 'all-scripts',
			template: {
				var: { div1: { type: 'element', tagName: 'div' } },
				sh: ['append(this.__magic_element_root, div1);'],
				fragment: false
			},
			'use-element-id-list': ['div1'],
			before: 'const beforeInit = 1;',
			global: 'const globalVar = 2;',
			script: 'const defaultScript = 3;',
			event: { code: 'onClick = () => {}', list: ['onClick'] },
		});

		const result = generateModuleJS(data);
		expect(result).toContain('const beforeInit = 1');
		expect(result).toContain('const globalVar = 2');
		expect(result).toContain('const defaultScript = 3');
	});

	it('should generate fragment mode with proper return structure', () => {
		const data = createBaseData({
			name: 'frag-mode',
			template: { var: {}, sh: [], fragment: true },
		});

		const result = generateModuleJS(data);
		expect(result).toContain('__fragment : true');
		expect(result).toContain('fragment : this.__magic_element_root');
		expect(result).toContain('childNodes');
	});

	it('should handle expose-event with event keys', () => {
		const data = createBaseData({
			name: 'evt-comp',
			template: {
				var: { btn: { type: 'element', tagName: 'button' } },
				sh: ['append(this.__magic_element_root, btn);'],
				fragment: false
			},
			'use-element-id-list': ['btn'],
			'expose-event': { click: ['data'], change: ['value'] },
		});

		const result = generateModuleJS(data);
		expect(result).toContain('emit_event');
		expect(result).toContain('exposeEvent');
		expect(result).toContain('click: true');
		expect(result).toContain('change: true');
	});

	it('should handle import template vars', () => {
		const data = createBaseData({
			name: 'import-comp',
			template: {
				var: {
					child: { type: 'import', import: 'child-comp', args: {}, keyword: {} }
				},
				sh: ['append(this.__magic_element_root, child);'],
				fragment: false
			},
			'use-element-id-list': ['child'],
		});

		const result = generateModuleJS(data);
		expect(result).toContain('i(`child-comp`');
	});

	it('should handle import with listen keyword', () => {
		const data = createBaseData({
			name: 'listen-import',
			template: {
				var: {
					child: { type: 'import', import: 'child-comp', args: {}, keyword: { listen: { submit: 'onChildSubmit' } } }
				},
				sh: ['append(this.__magic_element_root, child);'],
				fragment: false
			},
			'use-element-id-list': ['child'],
		});

		const result = generateModuleJS(data);
		expect(result).toContain('i(`child-comp`');
		expect(result).toContain('onChildSubmit');
	});

	it('should include templateArgs in output', () => {
		const data = createBaseData({
			name: 'targs-comp',
			templateArgs: { title: 'hello' },
		});

		const result = generateModuleJS(data);
		expect(result).toContain('templateArgs');
		expect(result).toContain('"title"');
	});

	it('should generate a valid module factory for simple component', () => {
		const data = createBaseData({
			name: 'anim-comp',
			template: {
				var: { div1: { type: 'element', tagName: 'div' } },
				sh: ['append(this.__magic_element_root, div1);'],
				fragment: false
			},
			'use-element-id-list': ['div1'],
		});

		const result = generateModuleJS(data);
		expect(result).toContain('window["__MAGIC__"]["M"]["anim-comp"]');
		expect(result).toContain('magic.call(this)');
	});
});

describe('runtime.js validation', () => {
	it('should be a non-trivial JavaScript file', () => {
		const runtimeSrc = app.templateDir.runtime.get('runtime.js');
		expect(runtimeSrc.length).toBeGreaterThan(1000);

		const runtimePath = app.templateDir.runtime.path + 'runtime.js';
		const file = Bun.file(runtimePath);
		expect(file.size).toBeGreaterThan(0);
	});

	it('should contain router module with addRoute and navigation', () => {
		const runtimeSrc = app.templateDir.runtime.get('runtime.js');
		expect(runtimeSrc).toContain('const router = ');
		expect(runtimeSrc).toContain('addRoute');
		expect(runtimeSrc).toContain('navigate');
		expect(runtimeSrc).toContain('push');
	});

	it('should contain path-to-regex matching logic', () => {
		const runtimeSrc = app.templateDir.runtime.get('runtime.js');
		expect(runtimeSrc).toContain('pathToRegex');
		expect(runtimeSrc).toContain('matchRoute');
		expect(runtimeSrc).toContain('([^/]+)');
		expect(runtimeSrc).toContain('paramNames');
	});

	it('should contain route guard hooks', () => {
		const runtimeSrc = app.templateDir.runtime.get('runtime.js');
		expect(runtimeSrc).toContain('beforeEach');
		expect(runtimeSrc).toContain('afterEach');
		expect(runtimeSrc).toContain('executeGuards');
	});

	it('should support hash mode routing', () => {
		const runtimeSrc = app.templateDir.runtime.get('runtime.js');
		expect(runtimeSrc).toContain("mode === 'hash'");
		expect(runtimeSrc).toContain('hashchange');
	});

	it('should support history mode routing', () => {
		const runtimeSrc = app.templateDir.runtime.get('runtime.js');
		expect(runtimeSrc).toContain('popstate');
		expect(runtimeSrc).toContain('history.pushState');
		expect(runtimeSrc).toContain('history.replaceState');
	});

	it('should parse query parameters in routes', () => {
		const runtimeSrc = app.templateDir.runtime.get('runtime.js');
		expect(runtimeSrc).toContain('parseQuery');
		expect(runtimeSrc).toContain('decodeURIComponent');
	});

	it('should dispose previous component on route change', () => {
		const runtimeSrc = app.templateDir.runtime.get('runtime.js');
		expect(runtimeSrc).toContain('dispose');
		expect(runtimeSrc).toContain('__magic_component_interface');
	});

	it('should export router in magic public API', () => {
		const runtimeSrc = app.templateDir.runtime.get('runtime.js');
		expect(runtimeSrc).toContain('router');
	});
});
