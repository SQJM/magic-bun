export class ProgressBar {
	total: number;
	current: number;
	label: string;
	start: number;
	lastDraw: number;
	stream: typeof process.stderr;

	constructor(total: number, label = '') {
		this.total = total;
		this.current = 0;
		this.label = label;
		this.start = Date.now();
		this.lastDraw = 0;
		this.stream = process.stderr;
	}
	update(n: number) {
		this.current = Math.min(n, this.total);
		const now = Date.now();
		if (now - this.lastDraw > 50 || this.current === this.total) {
			this.draw();
			this.lastDraw = now;
		}
	}
	tick() { this.update(this.current + 1); }
	draw() {
		if (!this.stream.isTTY) return;
		const w = 30;
		const pct = this.total === 0 ? 1 : this.current / this.total;
		const filled = Math.round(pct * w);
		const bar = '█'.repeat(filled) + '░'.repeat(w - filled);
		const pctStr = (pct * 100).toFixed(0).padStart(3);
		const elapsed = ((Date.now() - this.start) / 1000).toFixed(1);
		this.stream.write(`\r  [${bar}] ${pctStr}%  ${this.label}  ${elapsed}s`);
		if (this.current === this.total) this.stream.write('\n');
	}
	finish() { this.update(this.total); }
}

export class MultiProgress {
	bars: Map<string | number, ProgressBar>;
	stream: typeof process.stderr;

	constructor() {
		this.bars = new Map();
		this.stream = process.stderr;
	}
	add(id: string | number, total: number, label: string) {
		const bar = new ProgressBar(total, label);
		this.bars.set(id, bar);
		return bar;
	}
	get(id: string | number) { return this.bars.get(id); }
}

export function shouldShowProgress() {
	return process.stderr.isTTY && !process.env.MAGIC_NO_PROGRESS;
}

let multi: MultiProgress | null = null;
export function getMulti() {
	if (!multi) multi = new MultiProgress();
	return multi;
}
