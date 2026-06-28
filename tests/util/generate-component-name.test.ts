import { describe, expect, it } from 'bun:test';
import { generateComponentName } from '../../script/util/generate-component-name.ts';

describe('generateComponentName', () => {
	it('should strip .m extension', () => {
		expect(generateComponentName('app/index.m', false)).toBe('app_index');
	});

	it('should handle paths without .m extension', () => {
		expect(generateComponentName('app/index', false)).toBe('app_index');
	});

	it('should prefix module name when isModule is true', () => {
		expect(generateComponentName('/index.m', true, 'my_module')).toBe('my_module_index');
	});

	it('should replace special chars with underscore', () => {
		expect(generateComponentName('my-component.m', false)).toBe('my_component');
		expect(generateComponentName('header@base.m', false)).toBe('header_base');
	});

	it('should convert to lowercase', () => {
		expect(generateComponentName('Header.m', false)).toBe('header');
	});

	it('should strip leading digits', () => {
		expect(generateComponentName('123component.m', false)).toBe('component');
	});

	it('should throw on all-numeric filename', () => {
		expect(() => generateComponentName('123.m', false)).toThrow();
	});

	it('should handle empty module name prefix', () => {
		expect(generateComponentName('foo.m', true, '')).toBe('foo');
	});
});
