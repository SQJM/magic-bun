import { describe, expect, it, jest } from 'bun:test';
import { isEmptyObject, is } from '../../script/util/is.ts';

describe('isEmptyObject', () => {
	it('should return true for empty object', () => {
		expect(isEmptyObject({})).toBe(true);
	});

	it('should return false for non-empty object', () => {
		expect(isEmptyObject({ a: 1 })).toBe(false);
	});

	it('should return true for object created with Object.create(null)', () => {
		expect(isEmptyObject(Object.create(null))).toBe(true);
	});

	it('should return false for object with nested properties', () => {
		expect(isEmptyObject({ nested: { a: 1 } })).toBe(false);
	});
});

describe('is', () => {
	it('should call succeed callback when bool is true', () => {
		let called = false;
		is(
			() => ({ bool: true, result: 'success' }),
			(result) => { called = true; expect(result).toBe('success'); }
		);
		expect(called).toBe(true);
	});

	it('should call fail callback when bool is false', () => {
		let called = false;
		is(
			() => ({ bool: false, result: 'error' }),
			undefined,
			(result) => { called = true; expect(result).toBe('error'); }
		);
		expect(called).toBe(true);
	});

	it('should throw when target is not a function', () => {
		expect(() => is(null as any)).toThrow('Error: target must be a function');
	});

	it('should handle undefined callbacks gracefully', () => {
		expect(() => {
			is(() => ({ bool: true, result: 42 }));
		}).not.toThrow();
	});

	it('should handle undefined fail callback gracefully', () => {
		expect(() => {
			is(() => ({ bool: false, result: 'noop' }));
		}).not.toThrow();
	});
});
