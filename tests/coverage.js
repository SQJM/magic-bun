// 简单的覆盖率脚本
// 运行: bun tests/coverage.js
// 输出: coverage/ 目录 (JSON 格式)

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const COVERAGE_DIR = path.resolve(process.cwd(), 'coverage');
const TESTS_GLOB = [
	'tests/compiler/*.test.ts',
	'tests/util/*.test.ts',
	'tests/package/*.test.ts',
	'tests/*.test.ts',
	'tests/bench/*.test.ts'
].join(' ');

function runCoverage() {
	console.log('[coverage] 开始收集测试覆盖率...');

	// 创建输出目录
	if (!fs.existsSync(COVERAGE_DIR)) {
		fs.mkdirSync(COVERAGE_DIR, { recursive: true });
	}

	try {
		const startTime = Date.now();

		// 分别运行每组测试并收集结果
		const result = execSync(
			`bun test ${TESTS_GLOB} 2>&1`,
			{ encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
		);

		const duration = Date.now() - startTime;

		// 解析测试结果
		const passMatch = result.match(/(\d+)\s+pass/);
		const failMatch = result.match(/(\d+)\s+fail/);
		const totalMatch = result.match(/(\d+)\s+tests/);

		const coverageData = {
			timestamp: new Date().toISOString(),
			durationMs: duration,
			summary: {
				pass: passMatch ? parseInt(passMatch[1], 10) : 0,
				fail: failMatch ? parseInt(failMatch[1], 10) : 0,
				total: totalMatch ? parseInt(totalMatch[1], 10) : 0
			},
			output: result
		};

		const jsonPath = path.join(COVERAGE_DIR, 'coverage.json');
		fs.writeFileSync(jsonPath, JSON.stringify(coverageData, null, 2));

		console.log(`[coverage] 测试完成: ${coverageData.summary.pass} pass, ${coverageData.summary.fail} fail`);
		console.log(`[coverage] 耗时: ${(duration / 1000).toFixed(2)}s`);
		console.log(`[coverage] 报告: ${jsonPath}`);
	} catch (e) {
		console.error('[coverage] 测试运行失败:', e.message);
		// 即使失败也保存部分结果
		const errorData = {
			timestamp: new Date().toISOString(),
			error: e.message,
			stderr: e.stderr?.toString() || '',
			stdout: e.stdout?.toString() || ''
		};
		fs.writeFileSync(
			path.join(COVERAGE_DIR, 'coverage-error.json'),
			JSON.stringify(errorData, null, 2)
		);
		process.exit(1);
	}
}

runCoverage();
