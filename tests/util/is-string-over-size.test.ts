import { describe, expect, it } from 'bun:test';
import { isStringOverSize } from '../../script/util/is-string-over-size.ts';

describe('isStringOverSize', () => {
	it('should return false when string is under max size', () => {
		expect(isStringOverSize('hello', 100)).toBe(false);
	});

	it('should return true when string exceeds max size', () => {
		expect(isStringOverSize('hello world', 5)).toBe(true);
	});

	it('should measure byte length, not character count', () => {
		expect(isStringOverSize('你好', 10)).toBe(false);
		expect(isStringOverSize('你好世界', 5)).toBe(true);
	});

	it('should handle empty string', () => {
		expect(isStringOverSize('', 0)).toBe(false);
	});

	it('should handle large max size', () => {
		expect(isStringOverSize('test', 1024 * 1024)).toBe(false);
	});
});
