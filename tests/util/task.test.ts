import { describe, expect, it } from 'bun:test';
import { task } from '../../script/util/task.ts';

describe('task', () => {
	it('should execute the provided function', () => {
		let called = false;
		task(() => { called = true; });
		expect(called).toBe(true);
	});

	it('should execute with optional name parameter', () => {
		let called = false;
		task(() => { called = true; }, 'test-task');
		expect(called).toBe(true);
	});

	it('should execute with boolean name parameter', () => {
		let called = false;
		task(() => { called = true; }, true);
		expect(called).toBe(true);
	});
});
