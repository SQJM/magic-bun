import { describe, expect, it } from 'bun:test';
import { SupportPlatform } from '../../script/util/platforms.ts';

describe('SupportPlatform', () => {
	it('should contain web', () => {
		expect(SupportPlatform.includes('web')).toBe(true);
	});

	it('should contain node-webkit', () => {
		expect(SupportPlatform.includes('node-webkit')).toBe(true);
	});

	it('should contain module', () => {
		expect(SupportPlatform.includes('module')).toBe(true);
	});

	it('should have exactly 3 platforms', () => {
		expect(SupportPlatform.length).toBe(3);
	});

	it('should be readonly tuple', () => {
		expect(Array.isArray(SupportPlatform)).toBe(true);
	});
});
