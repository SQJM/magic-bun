import { describe, expect, it } from 'bun:test';
import { traversal } from '../../script/util/traversal.ts';

describe('traversal.each (traverseObject)', () => {
	it('should yield all entries in object', () => {
		const obj = { a: 1, b: 'hello', c: true };
		const entries: unknown[] = [];
		for (const entry of traversal.each(obj)) {
			entries.push(entry);
		}
		expect(entries.length).toBe(3);
		expect(entries[0].key).toBe('a');
		expect(entries[0].value).toBe(1);
		expect(entries[0].index).toBe(0);
		expect(entries[1].key).toBe('b');
		expect(entries[1].value).toBe('hello');
		expect(entries[1].index).toBe(1);
		expect(entries[2].key).toBe('c');
		expect(entries[2].value).toBe(true);
		expect(entries[2].index).toBe(2);
	});

	it('should handle empty object', () => {
		const entries: unknown[] = [];
		for (const entry of traversal.each({})) {
			entries.push(entry);
		}
		expect(entries.length).toBe(0);
	});
});

describe('traversal.object (objectLegacy)', () => {
	it('should iterate and callback each entry', () => {
		const collected: [unknown, number, string][] = [];
		traversal.object(
			{ x: 10, y: 20 },
			(value, index, key) => { collected.push([value, index, key]); }
		);
		expect(collected.length).toBe(2);
	});

	it('should return entry when callback returns "return"', () => {
		const result = traversal.object(
			{ a: 1, b: 2, c: 3 },
			(_value, index) => { if (index === 1) return 'return'; }
		);
		expect(result).toBeDefined();
		expect(result!.key).toBe('b');
		expect(result!.value).toBe(2);
	});

	it('should stop iteration when callback returns "break"', () => {
		let count = 0;
		traversal.object(
			{ a: 1, b: 2, c: 3, d: 4 },
			(_value, _index, _key) => { count++; return 'break'; }
		);
		expect(count).toBe(1);
	});

	it('should call emCallback for empty object', () => {
		let called = false;
		const result = traversal.object({}, undefined, () => { called = true; });
		expect(called).toBe(true);
		expect(result).toBeUndefined();
	});

	it('should call emCallback for non-object', () => {
		let called = false;
		const result = traversal.object(123, undefined, () => { called = true; });
		expect(called).toBe(true);
		expect(result).toBeUndefined();
	});

	it('should call emCallback for null', () => {
		let called = false;
		const result = traversal.object(null, undefined, () => { called = true; });
		expect(called).toBe(true);
		expect(result).toBeUndefined();
	});
});
