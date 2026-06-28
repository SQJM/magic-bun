import path from 'node:path';
import { Config } from '../config.ts';
import { Logging } from './logging.ts';
import { logger, LogLevel } from './log-level.ts';
import { colors } from './cli-colors.ts';

const _inner = new Logging('Magic', path.dirname(path.dirname(import.meta.dir)) + '/Magic.log', {
	maxSize: Config.log.out.maxSize
});

// Wrap printf to respect log level and add colored console output
export const printf = {
	get isUse(): boolean {
		return _inner.isUse;
	},
	remove(): void {
		_inner.remove();
	},
	clear(): void {
		_inner.clear();
	},
	log(...args: unknown[]): void {
		_inner.log(...args);
	},
	error(...args: unknown[]): void {
		_inner.error(...args);
	},
	warning(...args: unknown[]): void {
		_inner.warning(...args);
	},
	info(...args: unknown[]): void {
		_inner.info(...args);
	},
	outFile: {
		log(...args: unknown[]): void {
			_inner.outFile.log(...args);
		},
		error(...args: unknown[]): void {
			_inner.outFile.error(...args);
		},
		warning(...args: unknown[]): void {
			_inner.outFile.warning(...args);
		},
		info(...args: unknown[]): void {
			_inner.outFile.info(...args);
		},
		debug(...args: unknown[]): void {
			_inner.outFile.log(...args);
		},
	},
	outConsole: {
		log: (...args: unknown[]) => {
			if (logger.level <= LogLevel.INFO) console.log(colors.gray('[DBG]'), ...args);
		},
		error: (...args: unknown[]) => {
			if (logger.level <= LogLevel.ERROR) console.error(colors.red('[ERR]'), ...args);
		},
		warning: (...args: unknown[]) => {
			if (logger.level <= LogLevel.WARN) console.warn(colors.yellow('[WRN]'), ...args);
		},
		info: (...args: unknown[]) => {
			if (logger.level <= LogLevel.INFO) console.info(colors.cyan('[INF]'), ...args);
		},
		ok: (...args: unknown[]) => {
			if (logger.level <= LogLevel.INFO) console.log(colors.green('[OK]'), ...args);
		},
	},
};

export const print = (...data: string[]) => {
	process.stdout.write(`\r${data.join(' ')}`);
};
