import { IndexDom } from './index-dom.ts';
import type { BuildConfig, AppConfigParsed, SourceFile } from '../types.ts';

export interface ProjectState {
	build_config: BuildConfig;
	app_config: AppConfigParsed;
	source_file: Record<string, SourceFile[]> & { '*it': () => SourceFile[] };
	index_dom: IndexDom;
	dir: string;
	outDir: string;
	outDirMagic: string;
	srcDir: string;
	_dryRun?: boolean;
	_sourceMap?: boolean;
	_nonComponentHashes?: Record<string, string>;
}

export function createDefaultProject(): ProjectState {
	return {
		build_config: {
			config: { name: '', src: '', main: '' },
			build: {
			out: '',
			model: '',
			module: false,
			'module-src': '',
			'module-out': '',
			exclude: { dir: [], file: [] },
			optimize: {
				'min-code': { js: false, css: false, html: false },
				'out-default-theme': false,
				'remove-unused': false
			},
			import: {}
		}
	} as BuildConfig,
	dev: {},
	app_config: {
			title: '',
			lang: '',
			icon: false,
			initScript: null,
			import: []
		},
		source_file: {
			'*it': () => [] as SourceFile[]
		} as ProjectState['source_file'],
		index_dom: new IndexDom(),
		dir: '',
		outDir: '',
		outDirMagic: '',
		srcDir: '',
	};
}

let _project: ProjectState = createDefaultProject();

/**
 * Proxy-based project accessor.
 *
 * All existing code using `project.xxx` transparently delegates to the current
 * project instance. Use {@link withProject} to inject an isolated instance for
 * testing.
 */
export const project: ProjectState = new Proxy({} as ProjectState, {
	get(_target, prop) {
		return Reflect.get(_project, prop);
	},
	set(_target, prop, value) {
		return Reflect.set(_project, prop, value);
	},
	has(_target, prop) {
		return Reflect.has(_project, prop);
	},
	ownKeys(_target) {
		return Reflect.ownKeys(_project);
	},
	getOwnPropertyDescriptor(_target, prop) {
		return Reflect.getOwnPropertyDescriptor(_project, prop);
	}
}) as ProjectState;

export function resetProject(): void {
	const defaults = createDefaultProject();
	Object.keys(defaults).forEach((k) => {
		delete (_project as unknown as Record<string, unknown>)[k];
	});
	Object.assign(_project, defaults);
}

/**
 * Run a function with a temporary project instance.
 * All code accessing `project` during the callback will use the provided instance.
 */
export function withProject<T>(temp: ProjectState, fn: () => T): T {
	const prev = _project;
	_project = temp;
	try {
		return fn();
	} finally {
		_project = prev;
	}
}

/**
 * Returns the current underlying project instance (for diagnostics/testing).
 */
export function getRawProject(): ProjectState {
	return _project;
}
