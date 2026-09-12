import { existsSync, readFileSync } from 'node:fs';

export interface ConfigLintResult {
	file: string;
	errors: { key: string; message: string }[];
	warnings: { key: string; message: string; suggestion?: string }[];
}

export function lintConfig(filePath: string): ConfigLintResult {
	const result: ConfigLintResult = {
		file: filePath,
		errors: [],
		warnings: [],
	};

	if (!existsSync(filePath)) {
		result.errors.push({ key: 'file', message: `配置文件不存在 [path:${filePath}]` });
		return result;
	}

	const content = readFileSync(filePath, 'utf-8');
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(content);
	} catch {
		result.errors.push({ key: 'syntax', message: '配置文件格式错误,无法解析' });
		return result;
	}

	if (!parsed.build) {
		result.errors.push({ key: 'build', message: '缺少 [build] 节' });
		return result;
	}

	if (parsed.build.out && typeof parsed.build.out !== 'string') {
		result.errors.push({ key: 'build.out', message: 'build.out 应为字符串' });
	}

	return result;
}

export { lintConfig as lint };
