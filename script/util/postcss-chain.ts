// PostCSS 插件链管理
// 从 build.toml 读取 [postcss] 段,按顺序应用插件

type PostCSSPlugin = (css: string) => string;

export interface PostCSSPluginEntry {
	name: string;
	options?: Record<string, unknown>;
}

export interface PostCSSConfig {
	plugins?: PostCSSPluginEntry[];
}

const builtinPlugins: Record<string, (opts?: Record<string, unknown>) => PostCSSPlugin> = {};

export function registerPostCSSPlugin(
	name: string,
	factory: (opts?: Record<string, unknown>) => PostCSSPlugin
): void {
	builtinPlugins[name] = factory;
}

export function createPostCSSChain(config: PostCSSConfig): PostCSSPlugin[] {
	const plugins: PostCSSPlugin[] = [];

	if (!config.plugins || config.plugins.length === 0) {
		return plugins;
	}

	for (const entry of config.plugins) {
		const factory = builtinPlugins[entry.name];
		if (factory) {
			plugins.push(factory(entry.options));
		}
	}

	return plugins;
}
