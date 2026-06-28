import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { pretreatmentMagicMacro } from '../../script/compiler/step/5_compile.ts';

describe('pretreatmentMagicMacro', () => {
	it('should return code unchanged when no macros present', () => {
		const { code } = pretreatmentMagicMacro('const x = 1;');
		expect(code).toContain('const x = 1');
	});

	it('should throw when magic_define_include argument is dynamic variable', () => {
		expect(() =>
			pretreatmentMagicMacro('const x = magic_define_include(myVar);')
		).toThrow('magic_define_include 第一个参数不允许使用动态变量');
	});

	it('should throw when magic_define_include argument is not a string', () => {
		expect(() =>
			pretreatmentMagicMacro('const x = magic_define_include(123);')
		).toThrow('magic_define_include 第一个参数类型应该为 string');
	});

	it('should throw when magic_define_include file does not exist', () => {
		expect(() =>
			pretreatmentMagicMacro('const x = magic_define_include("./nonexistent.json");')
		).toThrow('magic_define_include 引用的文件不存在');
	});
});

describe('pretreatmentMagicMacro - path resolution', () => {
	let tempDir: string;
	let sourceDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-test-')) + path.sep;
		sourceDir = path.join(tempDir, 'components');
		fs.mkdirSync(sourceDir, { recursive: true });
		fs.writeFileSync(path.join(sourceDir, 'data.json'), '{"key":"value"}');
		fs.writeFileSync(path.join(tempDir, 'root.json'), '"fromRoot"');
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmdirSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should resolve ./ relative to sourceDir', () => {
		const { code } = pretreatmentMagicMacro(
			'const x = magic_define_include("./data.json");',
			{},
			sourceDir
		);
		expect(code).toContain('"key"');
		expect(code).toContain('"value"');
	});

	it('should resolve ../ relative to sourceDir', () => {
		const { code } = pretreatmentMagicMacro(
			'const x = magic_define_include("../root.json");',
			{},
			sourceDir
		);
		expect(code).toContain('"fromRoot"');
	});
});
