import type { MDataOutput, BuildConfig } from '../types.ts';

/**
 * A Magic compiler plugin. Implement any hook you need.
 *
 * Plugins are loaded from `build.toml` under `[build.plugins]`:
 * ```toml
 * [build.plugins]
 * my-plugin = "./scripts/my-plugin.ts"
 * ```
 */
/* eslint-disable no-unused-vars */
export interface MagicPlugin {
	/** Plugin name (used for logging). */
	name: string;

	/** Called once when the plugin is loaded. */
	onLoad?(): void;

	/** Called before any compilation begins. Receives the resolved build config. */
	onBuildStart?(config: BuildConfig): void;

	/** Called after all compilation completes. Receives output paths. */
	onBuildEnd?(outputPaths: string[], cacheEntries: Record<string, unknown>): void;

	/** Called before a single .m component is compiled. Return modified source or undefined to skip. */
	beforeCompile?(filePath: string, source: string): string | void;

	/** Called after a single .m component is compiled. Return modified MDataOutput or undefined. */
	afterCompile?(filePath: string, data: MDataOutput): MDataOutput | void;

	/** Called after the JS output is generated for a component. Return modified JS or undefined. */
	afterGenerateJS?(componentName: string, js: string): string | void;

	/** Called after CSS is processed for a component. Return modified CSS or undefined. */
	afterProcessCSS?(componentName: string, css: string): string | void;

	/** Called when index.html is being generated. Return modified HTML or undefined. */
	afterGenerateHTML?(html: string): string | void;

	/** Called when the plugin is unloaded / build finishes. */
	onUnload?(): void;
}
/* eslint-enable no-unused-vars */

/**
 * Plugin manager -- loads, stores, and dispatches hooks.
 */
class PluginManager {
	private plugins: MagicPlugin[] = [];

	register(plugin: MagicPlugin): void {
		this.plugins.push(plugin);
	}

	get all(): readonly MagicPlugin[] {
		return this.plugins;
	}

	clear(): void {
		this.plugins = [];
	}

	/** Dispatch a named hook to all plugins. The first non-undefined return wins (for transform hooks). */
	async dispatch<T>(hook: keyof MagicPlugin, ...args: unknown[]): Promise<T | undefined> {
		for (const plugin of this.plugins) {
			const fn = plugin[hook] as ((..._a: unknown[]) => T) | undefined;
			if (!fn) continue;
			try {
				const result = await fn.apply(plugin, args);
				if (result !== undefined) return result;
			} catch (e) {
				console.error(`[MagicPlugin:${plugin.name}] Error in hook '${hook}':`, e);
			}
		}
		return undefined;
	}

	/** Dispatch to all plugins (for notification hooks, no return aggregation). */
	async notify(hook: keyof MagicPlugin, ...args: unknown[]): Promise<void> {
		for (const plugin of this.plugins) {
			const fn = plugin[hook] as ((..._a: unknown[]) => void) | undefined;
			if (!fn) continue;
			try {
				await fn.apply(plugin, args);
			} catch (e) {
				console.error(`[MagicPlugin:${plugin.name}] Error in hook '${hook}':`, e);
			}
		}
	}

	/** Load plugins from build.toml config. */
	async loadFromConfig(buildConfig: BuildConfig): Promise<void> {
		const config = buildConfig.build as Record<string, unknown>;
		const pluginDefs = config['plugins'] as Record<string, string> | undefined;
		if (!pluginDefs) return;

		for (const [name, modulePath] of Object.entries(pluginDefs)) {
			try {
				const mod = await import(modulePath);
				const plugin = (mod.default ?? mod) as MagicPlugin;
				plugin.name = plugin.name || name;
				this.register(plugin);
				if (plugin.onLoad) plugin.onLoad();
			} catch (e) {
				console.error(`[MagicPlugin] Failed to load plugin '${name}' from '${modulePath}':`, e);
			}
		}
	}
}

export const pluginManager = new PluginManager();
