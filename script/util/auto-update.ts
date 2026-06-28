// 自动更新检查
// 对比本地版本和 npm 最新版本
// 在 magic 命令启动时异步检查(不阻塞)
// 有更新时打印提示

export interface UpdateInfo {
	latest: string;
	current: string;
	isOutdated: boolean;
	changelog?: string;
}

interface NpmRegistryInfo {
	'name': string;
	'dist-tags': {
		latest: string;
	};
}

let updatePromise: Promise<UpdateInfo | null> | null = null;

/**
 * 对比本地版本和 npm registry 最新版本
 * @param currentVersion - 当前本地版本号
 * @returns UpdateInfo 或 null(检查失败时)
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateInfo | null> {
	if (!currentVersion) return null;

	try {
		const response = await fetch('https://registry.npmjs.org/@love-sqjm/magic/latest', {
			signal: AbortSignal.timeout(10000),
			headers: { 'Accept': 'application/json' }
		});

		if (!response.ok) return null;

		const data = (await response.json()) as NpmRegistryInfo;
		const latestVersion = data['dist-tags']?.latest;
		if (!latestVersion) return null;

		const isOutdated = compareVersions(currentVersion, latestVersion) < 0;

		return {
			latest: latestVersion,
			current: currentVersion,
			isOutdated
		};
	} catch {
		// 网络错误或超时,静默失败
		return null;
	}
}

/**
 * 异步启动更新检查(不阻塞)
 * 有更新时打印提示到 stderr
 * @param currentVersion - 当前版本号
 */
export function startUpdateCheck(currentVersion: string): void {
	if (updatePromise) return; // 防止重复调用

	updatePromise = checkForUpdates(currentVersion);

	updatePromise.then((info) => {
		if (info && info.isOutdated) {
			console.warn(
				'\n\u001b[33m⚠ Magic 有新版本可用!\u001b[0m\n' +
				`   当前版本: ${info.current}\n` +
				`   最新版本: ${info.latest}\n` +
				`   升级命令: bun install -g @love-sqjm/magic\n`
			);
		}
	}).catch(() => {
		// 静默忽略任何错误
	});
}

/**
 * 简单的语义化版本比较
 * 返回 1 表示 a > b, -1 表示 a < b, 0 表示相等
 */
function compareVersions(a: string, b: string): number {
	const parse = (v: string): number[] => {
		return v.split('.').map((s) => {
			const n = parseInt(s, 10);
			return isNaN(n) ? 0 : n;
		});
	};

	const pa = parse(a);
	const pb = parse(b);

	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const na = pa[i] || 0;
		const nb = pb[i] || 0;
		if (na > nb) return 1;
		if (na < nb) return -1;
	}

	return 0;
}
