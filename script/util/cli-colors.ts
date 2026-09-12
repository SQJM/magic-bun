/**
 * 终端颜色 + 自动检测
 * 封装 ANSI escape codes
 * 自动检测 NO_COLOR 环境变量 + --no-color flag + TTY
 */

let _colorEnabled: boolean | null = null;
let _forceDisabled = false;

function detectColor(): boolean {
	// NO_COLOR 环境变量 (遵循 https://no-color.org/)
	if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
		return false;
	}
	// --no-color flag 强制禁用
	if (_forceDisabled) {
		return false;
	}
	// TTY 检测
	if (process.stdout && process.stdout.isTTY) {
		return true;
	}
	// 检查 FORCE_COLOR 环境变量
	if (process.env.FORCE_COLOR) {
		return true;
	}
	return false;
}

export function supportsColor(): boolean {
	if (_colorEnabled === null) {
		_colorEnabled = detectColor();
	}
	return _colorEnabled;
}

export function disableColor(): void {
	_forceDisabled = true;
	_colorEnabled = false;
}

export function enableColor(): void {
	_forceDisabled = false;
	_colorEnabled = true;
}

export function colorize(text: string, code: string): string {
	if (!supportsColor()) return text;
	return `\x1b[${code}m${text}\x1b[0m`;
}

export const colors = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',

	red: (s: string) => colorize(s, '31'),
	green: (s: string) => colorize(s, '32'),
	yellow: (s: string) => colorize(s, '33'),
	blue: (s: string) => colorize(s, '34'),
	magenta: (s: string) => colorize(s, '35'),
	cyan: (s: string) => colorize(s, '36'),
	white: (s: string) => colorize(s, '37'),
	gray: (s: string) => colorize(s, '90'),
};
