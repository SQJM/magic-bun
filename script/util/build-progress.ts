// 构建进度条反馈
// 使用已有的 progress.ts 工具
import { ProgressBar, shouldShowProgress } from './progress.ts';

export class BuildProgress {
	private bar: ProgressBar | null = null;

	constructor(total: number) {
		if (shouldShowProgress()) {
			this.bar = new ProgressBar(total, '编译中');
		}
	}

	update(current: number, _message?: string): void {
		if (this.bar) {
			this.bar.update(current);
		}
	}

	done(): void {
		if (this.bar) {
			this.bar.finish();
		}
	}
}
