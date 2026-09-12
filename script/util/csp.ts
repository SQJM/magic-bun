// CSP (Content Security Policy) 生成
// 根据编译输出生成合适的 CSP 头
// 支持 nonce 模式或 hash 模式

export interface CSPOptions {
	/** CSP 模式: 'nonce' 使用随机 nonce, 'hash' 使用脚本哈希, 'strict-dynamic' 启用严格动态 */
	mode?: 'nonce' | 'hash' | 'strict-dynamic';
	/** 默认源 */
	'default-src'?: string[];
	/** 脚本源 */
	'script-src'?: string[];
	/** 样式源 */
	'style-src'?: string[];
	/** 图片源 */
	'img-src'?: string[];
	/** 字体源 */
	'font-src'?: string[];
	/** 连接源 */
	'connect-src'?: string[];
	/** 媒体源 */
	'media-src'?: string[];
	/** 框架源 */
	'frame-src'?: string[];
	/** 对象源 */
	'object-src'?: string;
	/** 基础 URI */
	'base-uri'?: string;
	/** 表单动作 */
	'form-action'?: string;
	/** report-uri 端点 */
	'report-uri'?: string;
	/** report-to 端点 */
	'report-to'?: string;
	/** upgrade-insecure-requests */
	'upgrade-insecure-requests'?: boolean;
	/** block-all-mixed-content */
	'block-all-mixed-content'?: boolean;
}

const DEFAULT_CSP: CSPOptions = {
	'default-src': ["'self'"],
	'script-src': ["'self'"],
	'style-src': ["'self'", "'unsafe-inline'"],
	'img-src': ["'self'", 'data:', 'blob:'],
	'font-src': ["'self'"],
	'connect-src': ["'self'", 'ws:', 'wss:'],
	'base-uri': "'self'",
	'form-action': "'self'",
	'upgrade-insecure-requests': false
};

/**
 * 生成随机 nonce 值 (128 位 base64)
 */
export function generateNonce(): string {
	const buf = new Uint8Array(16);
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
		crypto.getRandomValues(buf);
	} else {
		// 回退到数学随机(不推荐用于生产环境)
		for (let i = 0; i < buf.length; i++) {
			buf[i] = Math.floor(Math.random() * 256);
		}
	}
	return btoa(String.fromCharCode(...buf));
}

/**
 * 根据选项生成 CSP 策略字符串
 * @param options - CSP 配置选项
 * @returns CSP 策略字符串
 *
 */
export function generateCSP(options: CSPOptions = {}): string {
	const merged: CSPOptions = { ...DEFAULT_CSP, ...options };

	const directives: string[] = [];

	if (merged.mode === 'strict-dynamic') {
		// strict-dynamic 模式: 信任所有由合法脚本动态创建的脚本
		merged['script-src'] = [
			...(merged['script-src'] || ["'self'"]),
			"'strict-dynamic'"
		];
	}

	const orderedKeys: (keyof CSPOptions)[] = [
		'default-src', 'script-src', 'style-src', 'img-src',
		'font-src', 'connect-src', 'media-src', 'frame-src',
		'object-src', 'base-uri', 'form-action'
	];

	for (const key of orderedKeys) {
		const value = merged[key];
		if (value !== undefined && value !== null) {
			if (typeof value === 'string') {
				directives.push(`${key} ${value}`);
			} else if (Array.isArray(value) && value.length > 0) {
				directives.push(`${key} ${value.join(' ')}`);
			}
		}
	}

	if (merged['upgrade-insecure-requests']) {
		directives.push('upgrade-insecure-requests');
	}

	if (merged['block-all-mixed-content']) {
		directives.push('block-all-mixed-content');
	}

	if (merged['report-uri']) {
		directives.push(`report-uri ${merged['report-uri']}`);
	}

	if (merged['report-to']) {
		directives.push(`report-to ${merged['report-to']}`);
	}

	return directives.join('; ');
}

/**
 * 生成 CSP meta 标签 HTML
 * @param csp - CSP 策略字符串
 * @returns <meta> 标签 HTML
 *
 */
export function generateCSPMetaTag(csp: string): string {
	return `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
}
