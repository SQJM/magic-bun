/**
 * 日志级别系统
 * 5 个级别: DEBUG < INFO < WARN < ERROR < SILENT
 * 通过 --verbose (DEBUG) / --quiet (WARN) / --silent (ERROR) 控制
 */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	SILENT = 4,
}

export const logger = {
	level: LogLevel.INFO,

	debug(...args: unknown[]): void {
		if (this.level <= LogLevel.DEBUG) {
			console.debug(...args);
		}
	},

	info(...args: unknown[]): void {
		if (this.level <= LogLevel.INFO) {
			console.info(...args);
		}
	},

	warn(...args: unknown[]): void {
		if (this.level <= LogLevel.WARN) {
			console.warn(...args);
		}
	},

	error(...args: unknown[]): void {
		if (this.level <= LogLevel.ERROR) {
			console.error(...args);
		}
	},

	setLevel(level: LogLevel): void {
		this.level = level;
	},
};
