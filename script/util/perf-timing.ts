/**
 * 性能计时工具
 * 记录各步骤耗时,构建结束时输出汇总
 */

export class PerfTimer {
	private startTime: number;
	private laps: { name: string; ms: number }[] = [];

	constructor() {
		this.startTime = performance.now();
	}

	lap(name: string): number {
		const now = performance.now();
		const prev = this.laps.length > 0
			? this.laps.reduce((sum, l) => sum + l.ms, 0)
			: 0;
		const ms = now - this.startTime - prev;
		this.laps.push({ name, ms: Math.round(ms * 100) / 100 });
		return Math.round(ms * 100) / 100;
	}

	total(): number {
		const now = performance.now();
		return Math.round((now - this.startTime) * 100) / 100;
	}

	report(): string {
		const totalMs = this.total();
		const lines: string[] = [];
		lines.push(`\n  构建耗时报告`);
		lines.push(`  ${'─'.repeat(40)}`);

		for (const lap of this.laps) {
			const pct = totalMs > 0 ? ((lap.ms / totalMs) * 100).toFixed(1) : '0.0';
			const msStr = `${lap.ms}`.padStart(8);
			lines.push(`  ${msStr}ms (${pct}%)  ${lap.name}`);
		}

		lines.push(`  ${'─'.repeat(40)}`);
		const totalStr = `${totalMs}`.padStart(8);
		lines.push(`  ${totalStr}ms  总计`);
		lines.push('');

		return lines.join('\n');
	}
}
