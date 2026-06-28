/**
 * Magic 编译器插件接口.
 *
 * 在 `build.toml` 中配置后,构建启动时自动加载:
 * ```toml
 * [build.plugins]
 * my-plugin = "./scripts/my-plugin.ts"
 * ```
 *
 * 每个插件只需实现需要的钩子,未实现的钩子会被忽略.
 */
export interface MagicPlugin {
	/** 插件名称(用于日志标识). */
	name: string;

	/** 插件加载时调用一次. */
	onLoad?(): void;

	/**
	 * 构建开始前调用.
	 * @param config - 解析后的构建配置
	 */
	onBuildStart?(config: BuildConfig): void;

	/**
	 * 构建完成后调用.
	 * @param outputPaths - 编译输出的所有文件路径
	 * @param cacheEntries - 缓存条目
	 */
	onBuildEnd?(outputPaths: string[], cacheEntries: Record<string, unknown>): void;

	/**
	 * 编译单个 .m 文件前调用.
	 * @param filePath - .m 文件路径
	 * @param source - 文件源码
	 * @returns 返回修改后的源码,或 undefined 跳过此钩子
	 */
	beforeCompile?(filePath: string, source: string): string | void;

	/**
	 * 编译单个 .m 文件后调用.
	 * @param filePath - .m 文件路径
	 * @param data - 编译输出的 MDataOutput 对象
	 * @returns 返回修改后的数据,或 undefined 跳过
	 */
	afterCompile?(filePath: string, data: MDataOutput): MDataOutput | void;

	/**
	 * 生成组件 JS 代码后调用.
	 * @param componentName - 组件名
	 * @param js - 生成的 JS 代码
	 * @returns 返回修改后的 JS,或 undefined 跳过
	 */
	afterGenerateJS?(componentName: string, js: string): string | void;

	/**
	 * 处理组件 CSS 后调用.
	 * @param componentName - 组件名
	 * @param css - 处理后的 CSS
	 * @returns 返回修改后的 CSS,或 undefined 跳过
	 */
	afterProcessCSS?(componentName: string, css: string): string | void;

	/**
	 * 生成 index.html 后调用.
	 * @param html - 生成的 HTML 字符串
	 * @returns 返回修改后的 HTML,或 undefined 跳过
	 */
	afterGenerateHTML?(html: string): string | void;

	/** 插件卸载 / 构建结束时调用. */
	onUnload?(): void;
}

/**
 * 构建配置.从 build.toml 解析得到.
 */
export interface BuildConfig {
	config: {
		name: string;
		src: string;
		main: string;
		version?: string;
		description?: string;
		author?: string;
		license?: string;
	};
	build: {
		out: string;
		model: string;
		module?: boolean;
		'module-src'?: string;
		'module-out'?: string;
		incremental?: boolean;
		platform: {
			target: string;
			config: BuildPlatformConfig;
		};
		exclude: {
			dir: string[];
			file: string[];
		};
		optimize: {
			'min-code': {
				js: boolean;
				css: boolean;
				html: boolean;
			};
			'out-default-theme': boolean;
			'remove-unused': boolean;
		};
		import?: {
			module?: string[];
		};
		plugins?: Record<string, string>;
	};
}

export interface BuildPlatformConfig {
	server?: {
		host: string;
		port: number;
	};
	browser?: boolean;
	app?: string;
}

/**
 * .m 文件编译产物的数据结构.
 */
export interface MDataOutput {
	name: string;
	cssScope: Record<string, string>;
	once_interface_args: Record<string, unknown>;
	originalFile: string;
	contentHash: string | null;
	keyframesCss: string;
	keyframesNames: string[];
	template: MDataTemplate;
	templateArgs: Record<string, string | boolean>;
	before: string;
	global: string;
	event: MDataSection;
	component_event: MDataSection;
	component_interface: string;
	interface: MDataSection;
	listen: MDataSection;
	script: string;
	once_interface: string[];
	css: string;
	'expose-event': Record<string, unknown>;
	'use-element-id-list': string[];
	slots: string[];
}

export interface MDataTemplate {
	var: Record<string, TemplateVar>;
	sh: string[];
	fragment: boolean;
}

export interface MDataSection {
	code: string;
	list?: string[];
}

export interface TemplateVar {
	type: string;
	tagName?: string;
	import?: string;
	args?: Record<string, unknown>;
	content?: string;
	attribs?: Record<string, string>;
	event?: Record<string, [string, unknown]>;
	keyword?: Record<string, string>;
	slotName?: string;
}