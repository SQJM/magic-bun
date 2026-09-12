// 构建性能分析
import { printf } from './printf.ts';

export class BuildProfiler {
	private marks: Map<string, number> = new Map();
	private durations: Map<string, number> = new Map();

	start(label: string): void {
		this.marks.set(label, performance.now());
	}

	end(label: string): number {
		const start = this.marks.get(label);
		if (start === undefined) return 0;
		const elapsed = performance.now() - start;
		this.durations.set(label, elapsed);
		this.marks.delete(label);
		return elapsed;
	}

	report(): string {
		if (this.durations.size === 0) return '';
		const lines: string[] = ['\n  构建性能报告:'];
		let total = 0;
		for (const [label, ms] of this.durations) {
			const s = (ms / 1000).toFixed(3);
			lines.push(`    ${label}: ${s}s`);
			total += ms;
		}
		const totalS = (total / 1000).toFixed(3);
		lines.push(`    ── 总计: ${totalS}s ──`);
		return lines.join('\n');
	}

	printReport(): void {
		const r = this.report();
		if (r) printf.outFile.info(r);
	}

	reset(): void {
		this.marks.clear();
		this.durations.clear();
	}
}

let _profiler: BuildProfiler | null = null;

export function getProfiler(): BuildProfiler {
	if (!_profiler) {
		_profiler = new BuildProfiler();
	}
	return _profiler;
}

export function resetProfiler(): void {
	_profiler = null;
}
