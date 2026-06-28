import { describe, expect, it } from 'bun:test';
import { Config } from '../../script/config.ts';

describe('Config', () => {
	it('should have log configuration', () => {
		expect(Config.log).toBeDefined();
		expect(Config.log.out.maxSize).toBe(2 * 1024 * 1024);
		expect(Config.log.build.maxSize).toBe(2 * 1024 * 1024);
	});

	it('should have build configuration', () => {
		expect(Config.build).toBeDefined();
		expect(Config.build.MScriptBlockSize).toBe(1 * 1024 * 1024);
		expect(Config.build.CSSBlockSize).toBe(1 * 1024 * 1024);
	});

	it('should have init configuration', () => {
		expect(Config.init).toBeDefined();
	});
});
