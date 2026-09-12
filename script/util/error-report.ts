/**
 * 错误上报(Sentry 风格集成)
 * 通过环境变量 MAGIC_SENTRY_DSN 配置
 * 非侵入式:构建失败时自动上报
 * 默认不启用(无 DSN 时跳过)
 */

let _dsn = '';
const pendingReports: Array<{ error: Error; context?: Record<string, unknown> }> = [];

function getDSN(): string {
	return _dsn || process.env.MAGIC_SENTRY_DSN || '';
}

export function setSentryDSN(dsn: string): void {
	_dsn = dsn;
}

export function reportError(error: Error, context?: Record<string, unknown>): void {
	const dsn = getDSN();
	if (!dsn) return;

	const payload: Record<string, unknown> = {
		exception: {
			values: [
				{
					type: error.name || 'Error',
					value: error.message,
					stacktrace: error.stack
						? {
								frames: error.stack
									.split('\n')
									.slice(1)
									.map((line) => ({ filename: line.trim() })),
						  }
						: undefined,
				},
			],
		},
	};

	if (context) {
		payload.contexts = { runtime: context };
	}

	// Queue for async sending
	pendingReports.push({ error, context });

	// Fire-and-forget async send
	sendToSentry(dsn, payload);
}

async function sendToSentry(dsn: string, payload: Record<string, unknown>): Promise<void> {
	try {
		// Parse DSN (simple format: https://key@host/project-id)
		const dsnMatch = dsn.match(/^https?:\/\/([^@]+)@([^\/]+)\/(.+)$/);
		if (!dsnMatch) return;

		const [, key, host, projectId] = dsnMatch;
		const url = `https://${host}/api/${projectId}/store/`;
		const auth = `Sentry sentry_version=7, sentry_key=${key}`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Sentry-Auth': auth,
			},
			body: JSON.stringify(payload),
		});

		// Quietly consume response
		if (!response.ok) {
			// Failed silently - this is best-effort reporting
		}
	} catch {
		// Failed silently
	}
}
