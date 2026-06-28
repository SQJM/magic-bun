// 错误聚合器 - 不终止编译,收集所有错误后一次性报告
import { printf } from './printf.ts';

export interface CompileError {
	file: string;
	message: string;
	line?: number;
	col?: number;
}

export type CompileWarning = CompileError;

export class ErrorAggregator {
	errors: CompileError[] = [];
	warnings: CompileWarning[] = [];

	addError(file: string, message: string, line?: number, col?: number): void {
		this.errors.push({ file, message, line, col });
	}

	addWarning(file: string, message: string): void {
		this.warnings.push({ file, message });
	}

	hasErrors(): boolean {
		return this.errors.length > 0;
	}

	hasWarnings(): boolean {
		return this.warnings.length > 0;
	}

	report(): string {
		const lines: string[] = [];
		if (this.warnings.length > 0) {
			lines.push(`\n  Warnings (${this.warnings.length}):`);
			for (const w of this.warnings) {
				lines.push(`    [WARN] ${w.file}: ${w.message}`);
			}
		}
		if (this.errors.length > 0) {
			lines.push(`\n  Errors (${this.errors.length}):`);
			for (const e of this.errors) {
				let loc = '';
				if (e.line !== undefined) {
					loc = `:${e.line}`;
					if (e.col !== undefined) loc += `:${e.col}`;
				}
				lines.push(`    [ERROR] ${e.file}${loc}: ${e.message}`);
			}
		}
		return lines.join('\n');
	}

	flush(): void {
		const PAD = 3;

		// 按文件分组（保留插入顺序）
		function groupByFile<T extends CompileError>(items: T[]): Map<string, T[]> {
			const map = new Map<string, T[]>();
			for (const item of items) {
				const list = map.get(item.file) ?? [];
				list.push(item);
				map.set(item.file, list);
			}
			return map;
		}

		const warnGroups = groupByFile(this.warnings);
		const errGroups = groupByFile(this.errors);

		// ── 输出警告（按文件分组） ──
		for (const [file, warns] of warnGroups) {
			printf.outConsole.warning(`── ${file} ──`);
			for (const w of warns) {
				const line = w.line !== undefined ? String(w.line).padStart(PAD) : ' '.repeat(PAD);
				printf.outConsole.warning(`  ${line}  ${w.message}`);
			}
			printf.outConsole.warning(`  → ${warns.length} 个警告`);
			printf.outConsole.warning('');
		}

		// ── 输出错误（按文件分组） ──
		for (const [file, errs] of errGroups) {
			printf.outConsole.error(`── ${file} ──`);
			for (const e of errs) {
				const line = e.line !== undefined ? String(e.line).padStart(PAD) : ' '.repeat(PAD);
				let loc = '';
				if (e.col !== undefined) loc = `:${e.col}`;
				printf.outConsole.error(`  ${line}${loc}  ${e.message}`);
			}
			printf.outConsole.error(`  → ${errs.length} 个错误`);
			printf.outConsole.error('');
		}

		// ── 汇总 ──
		const allFiles = new Set<string>();
		for (const w of this.warnings) allFiles.add(w.file);
		for (const e of this.errors) allFiles.add(e.file);
		if (this.hasErrors()) {
			printf.outConsole.error(`编译失败: ${this.errors.length} 个错误, ${this.warnings.length} 个警告, 涉及 ${allFiles.size} 个文件`);
		} else if (this.hasWarnings()) {
			printf.outConsole.warning(`编译完成, ${this.warnings.length} 个警告, 涉及 ${allFiles.size} 个文件`);
		}

		// ── 写入日志文件（保留逐条详情） ──
		for (const w of this.warnings) {
			printf.outFile.warning(`${w.file}: ${w.message}`);
		}
		for (const e of this.errors) {
			let loc = '';
			if (e.line !== undefined) {
				loc = `:${e.line}`;
				if (e.col !== undefined) loc += `:${e.col}`;
			}
			printf.outFile.error(`${e.file}${loc}: ${e.message}`);
		}

		this.errors = [];
		this.warnings = [];
	}
}

let _aggregator: ErrorAggregator | null = null;

export function getErrorAggregator(): ErrorAggregator {
	if (!_aggregator) {
		_aggregator = new ErrorAggregator();
	}
	return _aggregator;
}

export function resetErrorAggregator(): void {
	_aggregator = null;
}
