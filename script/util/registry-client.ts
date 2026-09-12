import { loadConfig } from './magic-config.ts';
import { cachePut, cacheVerify } from './global-cache.ts';
import { parseIntegrityField, sha256 } from './integrity.ts';
import { ProgressBar } from './progress.ts';

export function getProgress() {
	return new ProgressBar(100, '下载中');
}

export function getOptions(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const cfg = loadConfig();
	return {
		registry: cfg.registry ?? null,
		proxy: cfg.proxy ?? null,
		timeout: cfg.timeout ?? null,
		retry: cfg.retry ?? null,
		offline: false,
		json: false,
		onProgress: null,
		...overrides,
	};
}

function buildHeaders(): Record<string, string> {
	return {
		'User-Agent': 'magic-cli/' + (process.env.MAGIC_VERSION || '1.0.0'),
		'Accept': '*/*',
		'Accept-Encoding': 'gzip, deflate'
	};
}

interface FetchError extends Error {
	status?: number;
	code?: string;
}

function isRetryable(err: FetchError): boolean {
	if (!err) return false;
	const code = err.code || '';
	if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE'].includes(code)) return true;
	if (err.status === undefined) return true;
	return err.status >= 500 && err.status < 600;
}

async function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

async function fetchOnce(url: string, options: Record<string, unknown>): Promise<Response> {
	const controller = new AbortController();
	const t = setTimeout(() => controller.abort(), (options.timeout as number) || 10000);
	try {
		const fetchOpts: RequestInit & { proxy?: string } = {
			method: 'GET',
			headers: buildHeaders(),
			signal: controller.signal,
			redirect: 'follow',
		};
		if (options.proxy) {
			const u = new URL(options.proxy as string);
			fetchOpts.proxy = u.toString();
		}
		const res = await fetch(url, fetchOpts);
		if (!res.ok) {
			const err: FetchError = new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
			err.status = res.status;
			throw err;
		}
		return res;
	} finally {
		clearTimeout(t);
	}
}

async function fetchWithRetry(url: string, options: Record<string, unknown>): Promise<Response> {
	if (options.offline) {
		throw new Error(`离线模式: 无法下载 ${url}`);
	}
	let lastErr: FetchError | undefined;
	const retry = (options.retry as number) || 3;
	for (let attempt = 0; attempt < retry; attempt++) {
		try {
			return await fetchOnce(url, options);
		} catch (e: unknown) {
			lastErr = e as FetchError;
			if (!isRetryable(lastErr)) throw e;
			if (attempt + 1 < retry) {
				const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
				await sleep(delay);
			}
		}
	}
	throw lastErr;
}

export async function download(url: string, options: Record<string, unknown> = {}): Promise<{ data: Uint8Array; sha256: string; fromCache: boolean; key?: string }> {
	const opts = getOptions(options);
	const integrity = (options.integrity as string) || null;

	if (options.useCache !== false) {
		const verify = cacheVerify(url, integrity, { registry: opts.registry as string, proxy: opts.proxy as string });
		if (verify.ok && verify.hit) {
			return { data: verify.hit.data, sha256: verify.hit.meta.sha256 || '', fromCache: true, key: verify.hit.key };
		}
		if (opts.offline) {
			throw new Error(`离线模式: 缓存中无 ${url}`);
		}
	}

	const res = await fetchWithRetry(url, opts);

	const chunks: Uint8Array[] = [];
	let received = 0;
	const reader = (res.body as ReadableStream<Uint8Array>).getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.length;
	}

	const data = new Uint8Array(received);
	let pos = 0;
	for (const c of chunks) { data.set(c, pos); pos += c.length; }
	const hash = sha256(data);

	if (integrity) {
		const expected = parseIntegrityField(integrity);
		if (expected && expected !== hash) {
			throw new Error(`完整性校验失败: 期望 ${expected} 实际 ${hash}`);
		}
	}

	if (options.useCache !== false) {
		cachePut(url, data, { sha256: hash, size: received, integrity }, { registry: opts.registry as string, proxy: opts.proxy as string });
	}

	return { data, sha256: hash, fromCache: false };
}

export async function downloadJson(url: string, options: Record<string, unknown> = {}): Promise<unknown> {
	const r = await download(url, options);
	return JSON.parse(new TextDecoder('utf-8').decode(r.data));
}

export function resolveRegistryUrl(moduleName: string, version: string): string {
	const cfg = loadConfig();
	const base = ((cfg?.registry as string) || 'https://registry.magic.io').replace(/\/$/, '');
	return `${base}/${moduleName}/archive/refs/tags/v${version}.zip`;
}

export function resolveSourceUrl(moduleName: string, branch: string): string {
	const cfg = loadConfig();
	const base = ((cfg?.registry as string) || 'https://registry.magic.io').replace(/\/$/, '');
	return `${base}/${moduleName}/archive/refs/heads/${branch}.zip`;
}
