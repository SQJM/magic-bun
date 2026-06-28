export class Semaphore {
	n: number;
	active: number;
	queue: (() => void)[];

	constructor(n: number) {
		this.n = n;
		this.active = 0;
		this.queue = [];
	}
	async acquire() {
		if (this.active < this.n) {
			this.active++;
			return;
		}
		await new Promise<void>((resolve) => this.queue.push(resolve));
		this.active++;
	}
	release() {
		this.active--;
		const next = this.queue.shift();
		if (next) next();
	}
	async run<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire();
		try { return await fn(); }
		finally { this.release(); }
	}
}

export async function parallel<T>(tasks: (() => Promise<T>)[], concurrency = 4): Promise<T[]> {
	const sem = new Semaphore(concurrency);
	return Promise.all(tasks.map((t) => sem.run(t)));
}

export async function parallelMap<T, R>(items: T[], fn: (item: T, idx: number) => Promise<R>, concurrency = 4): Promise<R[]> {
	const sem = new Semaphore(concurrency);
	return Promise.all(items.map((item, idx) => sem.run(() => fn(item, idx))));
}
