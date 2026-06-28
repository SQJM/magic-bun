import * as fs from 'node:fs';
import * as path from 'node:path';

function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, '');
}

interface LoggingOption {
	maxSize: number;
}

export class Logging {
	#IS_USE: boolean = false;
	oldCount: number;
	logPath: string;
	oldData: string | null;
	name: string;
	option: LoggingOption;

	constructor(name: string, logPath: string, option: LoggingOption) {
		this.oldCount = 1;
		this.logPath = path.normalize(logPath);
		this.oldData = null;
		this.name = name;
		this.option = { maxSize: 2 * 1024 };
		if (option.maxSize) this.option.maxSize = option.maxSize;

		try {
			if (fs.existsSync(this.logPath)) {
				const stats = fs.statSync(this.logPath);
				if (stats.size > this.option.maxSize) {
					fs.writeFileSync(this.logPath, this.fileHead(name));
				}
			} else {
				fs.writeFileSync(this.logPath, this.fileHead(name));
			}
		} catch (e) {
			console.error('Error initializing log file:', e);
		}
	}

	get isUse(): boolean {
		return this.#IS_USE;
	}

	get outFile() {
		return {
			log: (...args: unknown[]) => {
				this.write(this.body('LOG', args), args.join(' '));
			},
			error: (...args: unknown[]) => {
				this.write(this.body('ERROR', args), args.join(' '));
			},
			warning: (...args: unknown[]) => {
				this.write(this.body('WARNING', args), args.join(' '));
			},
			info: (...args: unknown[]) => {
				this.write(this.body('INFO', args), args.join(' '));
			}
		};
	}

	get outConsole() {
		return {
			log: console.log,
			error: console.error,
			warning: console.warn,
			info: console.info
		};
	}

	fileHead(name: string): string {
		return `Logging - 1.0.0 [${name}]\n`;
	}

	getDate(): string {
		const date = new Date();
		return date.toISOString().replace('T', ' ').substring(0, 19);
	}

	head(level: string): string {
		return `[${this.getDate()}] [${level.toUpperCase()}] > `;
	}

	body(level: string, data: unknown[]): string | false {
		let str = '';

		const toString = (item: unknown) => {
			try {
				if (typeof item === 'string') str += `${stripAnsi(item)} `;
				else if (typeof item === 'object') str += JSON.stringify(item) + ' ';
				else str += `${String(item)} `;
			} catch {
				str += `${String(item)} `;
			}
		};

		data.forEach(toString);

		if (str.trim() === '') return false;
		return this.head(level) + str.trim();
	}

	write(data: string | false, _data: string): void {
		if (data === false) return;
		if (this.oldData === _data) {
			this.oldCount++;
			return;
		}
		if (this.oldCount !== 1) {
			fs.appendFileSync(this.logPath, `${this.oldCount}...^\n`);
		}
		this.oldCount = 1;
		this.oldData = _data;
		fs.appendFileSync(this.logPath, data + '\n');
		this.#IS_USE = true;
	}

	log(...args: unknown[]): void {
		console.log(...args);
		this.write(this.body('LOG', args), args.join(' '));
	}

	error(...args: unknown[]): void {
		console.error(...args);
		this.write(this.body('ERROR', args), args.join(' '));
	}

	warning(...args: unknown[]): void {
		console.warn(...args);
		this.write(this.body('WARNING', args), args.join(' '));
	}

	info(...args: unknown[]): void {
		console.info(...args);
		this.write(this.body('INFO', args), args.join(' '));
	}

	remove(): void {
		try {
			fs.unlinkSync(this.logPath);
		} catch (e) {
			console.error('Error removing log file:', e);
		}
	}

	clear(): void {
		try {
			fs.writeFileSync(this.logPath, this.fileHead(this.name));
		} catch (e) {
			console.error('Error clearing log file:', e);
		}
	}
}
