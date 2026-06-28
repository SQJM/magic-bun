import { describe, expect, it } from 'bun:test';
import { generateModuleJS } from '../../script/compiler/step/6_generate.ts';
import type { MDataOutput } from '../../script/types.ts';

function createBaseData(overrides: Partial<MDataOutput> = {}): MDataOutput {
	return {
		name: 'test-comp',
		cssScope: {},
		once_interface_args: {},
		originalFile: 'test.m',
		contentHash: 'abc123',
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
		slots: {},
		'expose-event': '{}',
		'use-element-id-list': [],
		once_interface: [],
		import: { '~global': {} },
		extend: { '~global': {} },
		keyframesCss: '',
		...overrides
	};
}

describe('generateModuleJS - template vars', () => {
	it('should generate element creation from template var', () => {
		const data = createBaseData({
			name: 'elem-comp',
			template: {
				var: {
					div1: { type: 'element', tagName: 'div' }
				},
				sh: ['append(this.__magic_element_root, div1);'],
				fragment: false
			},
			'use-element-id-list': ['div1']
		});
		const result = generateModuleJS(data);
		expect(result).toContain('let div1');
		expect(result).toContain("e(`div`)");
	});

	it('should generate text node from template var', () => {
		const data = createBaseData({
			name: 'text-comp',
			template: {
				var: {
					t1: { type: 'text', content: 'Hello World' }
				},
				sh: [],
				fragment: false
			},
			'use-element-id-list': ['t1']
		});
		const result = generateModuleJS(data);
		expect(result).toContain('let t1');
		expect(result).toContain('t(`Hello World`)');
	});

	it('should generate fragment node from slot template var', () => {
		const data = createBaseData({
			name: 'slot-comp',
			template: {
				var: {
					slot1: { type: 'slot', slotName: 'default' }
				},
				sh: [],
				fragment: false
			},
			'use-element-id-list': ['slot1'],
			slots: {}
		});
		const result = generateModuleJS(data);
		expect(result).toContain('let slot1');
		expect(result).toContain('new DocumentFragment');
	});

	it('should generate attributes from template var', () => {
		const data = createBaseData({
			name: 'attr-comp',
			template: {
				var: {
					btn: { type: 'element', tagName: 'button', attribs: { class: 'btn-primary', id: 'myBtn' } }
				},
				sh: [],
				fragment: false
			},
			'use-element-id-list': ['btn']
		});
		const result = generateModuleJS(data);
		expect(result).toContain('att(btn');
		expect(result).toContain('"class":"btn-primary"');
		expect(result).toContain('"id":"myBtn"');
	});
});

describe('generateModuleJS - event and listen', () => {
	it('should generate event bindings', () => {
		const data = createBaseData({
			name: 'event-comp',
			template: {
				var: {
					btn: {
						type: 'element',
						tagName: 'button',
						event: {
							click: ['onClick', {}]
						}
					}
				},
				sh: [],
				fragment: false
			},
			event: { code: '', list: ['onClick'] },
			'use-element-id-list': ['btn']
		});
		const result = generateModuleJS(data);
		expect(result).toContain('eve(btn,"click",this,"onClick"');
	});

	it('should generate this.__magic_event binding', () => {
		const data = createBaseData({
			name: 'evt-comp',
			template: { var: {}, sh: [], fragment: false },
			event: {
				code: 'this.__magic_event = { onClick: () => {} }',
				list: ['onClick']
			},
			'use-element-id-list': []
		});
		const result = generateModuleJS(data);
		expect(result).toContain('__magic_event');
	});

	it('should generate listen bindings for imported components', () => {
		const data = createBaseData({
			name: 'listen-comp',
			template: {
				var: {
					child: {
						type: 'import',
						import: 'button-comp',
						args: { label: 'OK' },
						keyword: { listen: { click: 'onChildClick' } }
					}
				},
				sh: [],
				fragment: false
			},
			listen: { code: '', list: ['onChildClick'] },
			'use-element-id-list': ['child']
		});
		const result = generateModuleJS(data);
		expect(result).toContain('i(`button-comp`');
		expect(result).toContain('"label":"OK"');
		expect(result).toContain('__magic_listen_onChildClick');
	});
});

describe('generateModuleJS - lifecycle and interface', () => {
	it('should generate component_event lifecycle', () => {
		const data = createBaseData({
			name: 'lifecycle-comp',
			template: { var: {}, sh: [], fragment: false },
			component_event: {
				code: 'this.__magic_component_event = { created: () => {}, destroy: () => {} }',
				list: ['created', 'destroy']
			},
			'use-element-id-list': []
		});
		const result = generateModuleJS(data);
		expect(result).toContain('__magic_component_event');
	});

	it('should include interface script', () => {
		const data = createBaseData({
			name: 'iface-comp',
			template: { var: {}, sh: [], fragment: false },
			interface: {
				code: 'this.__magic_interface = { greet: (name) => "Hello " + name }',
				list: ['greet']
			},
			'use-element-id-list': []
		});
		const result = generateModuleJS(data);
		expect(result).toContain('magic.initComponentInterface(this)');
		expect(result).toContain('greet');
	});
});
