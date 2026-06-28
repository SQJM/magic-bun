import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import {
	parseModuleSource,
	getGlobalLockPath,
	getModuleInfo,
	loadModuleInfoFile
} from '../script/module-manager.ts';
import type { ModuleInfo } from '../script/module-manager.ts';

describe('parseModuleSource', () => {
	it('should parse user/repo', () => {
		const result = parseModuleSource('@love-sqjm/magic-ui');
		expect(result).not.toBeNull();
		expect(result!.user).toBe('love-sqjm');
		expect(result!.repo).toBe('magic-ui');
		expect(result!.version).toBeNull();
	});

	it('should parse user/repo with version', () => {
		const result = parseModuleSource('@love-sqjm/magic-ui:1.2.3');
		expect(result).not.toBeNull();
		expect(result!.user).toBe('love-sqjm');
		expect(result!.repo).toBe('magic-ui');
		expect(result!.version).toBe('1.2.3');
	});

	it('should parse with version containing "v" prefix', () => {
		const result = parseModuleSource('@user/repo:v2.0.0');
		expect(result).not.toBeNull();
		expect(result!.version).toBe('v2.0.0');
	});

	it('should return null for invalid format (no slash)', () => {
		expect(parseModuleSource('@justname')).toBeNull();
	});

	it('should return null for empty user', () => {
		expect(parseModuleSource('@/repo')).toBeNull();
	});

	it('should return null for empty repo', () => {
		expect(parseModuleSource('@user/')).toBeNull();
	});

	it('should return null for empty string', () => {
		expect(parseModuleSource('')).toBeNull();
	});

	it('should parse without @ prefix', () => {
		const result = parseModuleSource('user/repo');
		expect(result).not.toBeNull();
		expect(result!.user).toBe('user');
		expect(result!.repo).toBe('repo');
	});

	it('should handle version with extra colons gracefully', () => {
		const result = parseModuleSource('@user/repo:1.0.0:extra');
		expect(result).not.toBeNull();
		expect(result!.version).toBe('1.0.0');
	});

	it('should handle triple-slash input as malformed', () => {
		expect(parseModuleSource('@a/b/c')).toBeNull();
	});
});

describe('getGlobalLockPath', () => {
	it('should return path under home .magic directory', () => {
		const result = getGlobalLockPath();
		expect(result).toContain('.magic');
		expect(result).toContain('global-lock.json');
	});

	it('should be an absolute path', () => {
		expect(path.isAbsolute(getGlobalLockPath())).toBe(true);
	});
});

describe('getModuleInfo', () => {
	it('should return null for non-existent module', async () => {
		const result = await getModuleInfo('nonexistent_repo_xyz_123', 'nonexistent_user_xyz_123');
		expect(result).toBeNull();
	});
});

describe('loadModuleInfoFile', () => {
	it('should return null for non-existent info file', () => {
		const result = loadModuleInfoFile('no_such_user', 'no_such_repo');
		expect(result).toBeNull();
	});
});
