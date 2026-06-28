/**
 * Trace ID 生成
 * 每次构建生成唯一 trace-id,贯穿所有日志输出
 * 格式: magic-{timestamp}-{random}
 */

let _currentTraceId = '';

export function generateTraceId(): string {
	const ts = Date.now().toString(36);
	const rnd = Math.random().toString(36).slice(2, 10);
	_currentTraceId = `magic-${ts}-${rnd}`;
	return _currentTraceId;
}

export function setTraceId(id: string): void {
	_currentTraceId = id;
}

export function getTraceId(): string {
	return _currentTraceId;
}
