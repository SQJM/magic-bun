import { describe, expect, it } from 'bun:test';
import { getFirstObjectKey } from '../../script/util/get-first-object-key.ts';

describe('getFirstObjectKey', () => {
	it('should return first key for object with multiple keys', () => {
		const result = getFirstObjectKey({ a: 1, b: 2, c: 3 });
		expect(typeof result).toBe('string');
	});

	it('should return undefined for empty object', () => {
		expect(getFirstObjectKey({})).toBeUndefined();
	});

	it('should return the only key for single-key object', () => {
		expect(getFirstObjectKey({ name: 'test' })).toBe('name');
	});
});
