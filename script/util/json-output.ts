interface JsonOptions {
	json?: boolean;
	pretty?: boolean;
}

export function jsonOutput(data: unknown, options: JsonOptions = {}) {
	if (!options.json) {
		if (options.pretty) console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
		return;
	}
	console.log(JSON.stringify(data, null, 2));
}

export function jsonError(code: string, message: string, details: Record<string, unknown> = {}, options: JsonOptions = {}) {
	const obj = { ok: false, code, message, ...details };
	if (options.json) {
		console.error(JSON.stringify(obj, null, 2));
	} else {
		console.error(`[${code}] ${message}`);
		for (const [k, v] of Object.entries(details)) {
			if (k === 'stack' || k === 'cause') continue;
			console.error(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
		}
	}
}

export function jsonOk(data: Record<string, unknown> = {}, options: JsonOptions = {}) {
	const obj = { ok: true, ...data };
	if (options.json) {
		console.log(JSON.stringify(obj, null, 2));
	} else if (options.pretty) {
		console.log(JSON.stringify(obj, null, 2));
	}
	return obj;
}

export function parseFlags(argv: string[], schema: Record<string, string>): Record<string, unknown> {
	const out: Record<string, unknown> = { _: [] as string[] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const eq = a.indexOf('=');
			if (eq > 0) {
				out[a.slice(2, eq)] = a.slice(eq + 1);
			} else {
				const key = a.slice(2);
				if (schema[key] === 'boolean' || i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
					out[key] = true;
				} else {
					out[key] = argv[++i];
				}
			}
		} else {
			(out._ as string[]).push(a);
		}
	}
	return out;
}
