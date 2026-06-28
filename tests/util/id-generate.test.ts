import { describe, expect, it } from 'bun:test';
import { idGenerate } from '../../script/compiler/id-generate.ts';

describe('idGenerate', () => {
	it('should return a string', () => {
		const result = idGenerate();
		expect(typeof result).toBe('string');
	});

	it('should return non-empty string', () => {
		expect(idGenerate().length).toBeGreaterThan(0);
	});

	it('should generate different values on multiple calls', () => {
		const a = idGenerate();
		const b = idGenerate();
		expect(a).not.toBe(b);
	});

	it('should accept custom length parameter', () => {
		const result = idGenerate(10);
		expect(typeof result).toBe('string');
	});

	it('should contain only alphanumeric chars', () => {
		const result = idGenerate();
		expect(/^[a-z0-9]+$/i.test(result)).toBe(true);
	});
});
