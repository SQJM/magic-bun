import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export function sha256(buffer: string | Uint8Array): string {
	return createHash('sha256').update(buffer as string).digest('hex');
}

export async function sha256File(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		const stream = createReadStream(filePath);
		stream.on('error', reject);
		stream.on('data', (chunk: string) => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

export function shortHash(hex: string, len = 7): string {
	if (typeof hex !== 'string' || hex.length < len) return hex || '';
	return hex.slice(0, len);
}

export function verifyIntegrity(actual: string, expected: string): { ok: boolean; reason?: string } {
	if (!expected) return { ok: true, reason: 'no-expected' };
	if (!actual) return { ok: false, reason: 'no-actual' };
	if (typeof actual !== 'string' || typeof expected !== 'string') {
		return { ok: false, reason: 'type-mismatch' };
	}
	let expectedHash = expected;
	if (expected.startsWith('sha256-')) {
		const parsed = parseIntegrityField(expected);
		if (!parsed) return { ok: false, reason: 'bad-format' };
		expectedHash = parsed;
	}
	if (actual.length !== expectedHash.length) {
		return { ok: false, reason: 'length-mismatch' };
	}
	let diff = 0;
	for (let i = 0; i < actual.length; i++) {
		diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
	}
	return diff === 0 ? { ok: true } : { ok: false, reason: 'mismatch' };
}

export function integrityField(sha256Hex: string): string {
	return 'sha256-' + sha256Hex;
}

export function parseIntegrityField(field: string): string | null {
	if (typeof field !== 'string') return null;
	const m = field.match(/^sha256-([a-fA-F0-9]{1,128})$/);
	return m ? m[1].toLowerCase() : null;
}
