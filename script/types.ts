export interface BuildConfig {
	config: {
		name: string;
		src: string;
		main: string;
	};
	build: {
		out: string;
		model: string;
		module?: boolean;
		'module-src'?: string;
		'module-out'?: string;
		incremental?: boolean;
		'dry-run'?: boolean;
		'front-run'?: string[];
		'back-run'?: string[];
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
		output?: {
			'source-map'?: boolean;
			'chunk-size'?: number;
		};
		hmr?: {
			enabled?: boolean;
			'reconnect-ms'?: number;
			'poll-ms'?: number;
		};
		import?: {
			module?: string[];
		};
	};
	dev?: {
		server?: {
			port: number;
			host: string;
			reload?: boolean;
		};
	};
}
