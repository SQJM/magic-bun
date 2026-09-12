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

describe('generateModuleJS', () => {
	it('should generate a valid module factory function', () => {
		const data = createBaseData({ name: 'my-comp' });
		const result = generateModuleJS(data);
		expect(result).toContain('window["__MAGIC__"]["M"]["my-comp"]');
		expect(result).toContain('function');
		expect(result).toContain('magic.call(this)');
	});

	it('should include before script in generated output', () => {
		const data = createBaseData({
			name: 'with-before',
			before: 'const init = "before-value";'
		});
		const result = generateModuleJS(data);
		expect(result).toContain('const init = "before-value"');
	});

	it('should include global script in generated output', () => {
		const data = createBaseData({
			name: 'with-global',
			global: 'const globalVal = 42;'
		});
		const result = generateModuleJS(data);
		expect(result).toContain('const globalVal = 42');
	});

	it('should handle fragment mode templates', () => {
		const data = createBaseData({
			name: 'frag-comp',
			template: { var: {}, sh: [], fragment: true }
		});
		const result = generateModuleJS(data);
		expect(result).toContain('__fragment : true');
	});

	it('should include initComponentInterface call', () => {
		const data = createBaseData();
		const result = generateModuleJS(data);
		expect(result).toContain('magic.initComponentInterface(this)');
	});

	it('should include original file path', () => {
		const data = createBaseData({ originalFile: 'app/index.m' });
		const result = generateModuleJS(data);
		expect(result).toContain('_file:"app/index.m"');
	});

	it('should handle expose-event JSON', () => {
		const data = createBaseData({
			name: 'event-comp',
			'expose-event': '{"click":["data"]}'
		});
		const result = generateModuleJS(data);
		expect(result).toContain('emit_event');
		expect(result).toContain('exposeEvent');
	});

	it('should handle interface script', () => {
		const data = createBaseData({
			name: 'iface-comp',
			interface: { code: 'this.__magic_interface = { greet: () => "hello" }', list: ['greet'] }
		});
		const result = generateModuleJS(data);
		expect(result).toContain('greet');
	});
});
