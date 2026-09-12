import path from 'node:path';
import { existsSync } from 'node:fs';

import { app } from '../../../app.ts';
import { printf } from '../../util/printf.ts';
import { fileUtil } from '../../util/file-util.ts';
import { filtrationFile } from '../../util/filtration-file.ts';
import { project } from '../global.ts';
import { _3 } from './3_initdir.ts';
import { getStore, loadCache } from '../../util/build-cache.ts';
import { handleModules } from '../compile-modules.ts';
import { getProfiler } from '../../util/build-profiler.ts';
import { BUILD_TIMER } from '../start.ts';
import type { BuildConfig, AppConfigParsed, SourceFile } from '../../types.ts';

export class Source {
	#relativePath: string;
	#absolutePath: string;
	#buildPath: string;
	#contentHash: string | null;
	#changed: boolean = true;
	ext: string;

	constructor(file: string, ext: string, contentHash: string | null = null) {
		this.ext = ext;
		this.#relativePath = path.normalize(file);
		this.#absolutePath = path.normalize(path.join(app.project.dir, project.build_config.config.src, file));
		this.#buildPath = path.normalize(path.join(app.project.dir, project.build_config.build.out, file));
		this.#contentHash = contentHash;
	}

	build(): string {
		return this.#buildPath;
	}

	relative(): string {
		return this.#relativePath;
	}

	absolute(): string {
		return this.#absolutePath;
	}

	get contentHash(): string | null {
		return this.#contentHash;
	}

	get changed(): boolean {
		return this.#changed;
	}

	set changed(v: boolean) {
		this.#changed = v;
	}
}

export async function _2(build_config: BuildConfig, app_config?: AppConfigParsed, cachePath?: string): Promise<void> {
	const profiler = getProfiler();
	profiler.start('scan:process');

	printf.outFile.info(`处理源文件`);
	const rootDir = path.join(app.project.dir, build_config.config.src);

	project['build_config'] = build_config;
	project['app_config'] = app_config;
	project['outDir'] = path.normalize(path.join(app.project.dir, build_config.build.out, '/'));
	project['outDirMagic'] = path.normalize(path.join(project['outDir'], 'magic')) + '/';
	project['srcDir'] = path.normalize(path.join(app.project.dir, build_config.config.src, '/'));

	build_config.build.exclude.file.push('app.xml');
	build_config.build.exclude.dir.push('magic');

	if (build_config.build['module-out']) build_config.build.exclude.dir.push(build_config.build['module-out']);
	if (build_config.build['module-src']) build_config.build.exclude.dir.push(build_config.build['module-src']);
	if (build_config.build.out) build_config.build.exclude.dir.push(build_config.build.out);

	// 并行执行:文件扫描 + 模块处理 + 缓存加载
	const [files, cache] = await Promise.all([
		filtrationFile(rootDir, build_config.build.exclude),
		handleModules().then(() => cachePath ? loadCache(cachePath) : null)
	]);
	const oldHashes: Record<string, string> = {};
	if (cache) {
		for (const key in cache.files) {
			oldHashes[key] = cache.files[key].hash;
		}
	}

	const obj: Record<string, SourceFile[]> = {};

	for (const info of files) {
		const file = info.path;
		const ext = fileUtil.getExtensionName(file);
		const fullPath = path.normalize(path.join(rootDir, file));
		const cacheKey = file;
		let hash: string;
		if (ext === 'm') {
			// .m files use content hash for accurate change detection
			const content = await Bun.file(fullPath).text();
			hash = Bun.hash(content).toString(16);
		} else {
			// non-.m files: mtime+size from scan is sufficient
			hash = `${info.mtime}-${info.size}`;
		}
		const s = new Source(file, ext, hash);
		if (cache && oldHashes[cacheKey] === hash) {
			const entry = cache.files[cacheKey];
			let outputsIntact = true;
			if (entry && entry.outputs.length > 0) {
				outputsIntact = entry.outputs.every((o) => existsSync(project['outDirMagic'] + o));
			}
			if (outputsIntact) {
				s.changed = false;
			} else {
				if (entry) {
					printf.outFile.warning(`增量缓存失效: ${file} 的输出文件丢失,重新编译`);
				}
			}
		}
		if (!obj[ext]) obj[ext] = [];
		obj[ext].push(s);
	}

	// ─── 依赖驱动的增量构建:通过 deps 表找到因被依赖文件变更而需重编的 .m ───────────
	// .m 文件的 contentHash 不会反映 magic_define_include 引入的文件,
	// 因此仅基于 hash 比对会漏掉此类变更. 借由 5_compile 中记录到 deps 表的依赖关系,
	// 找到所有受变更文件影响的 .m, 将其标记为 changed 触发重编.
	if (cache && cachePath) {
		const initiallyChanged: string[] = [];
		for (const key in obj) {
			for (const s of obj[key]) {
				if (s.changed) {
					initiallyChanged.push(s.relative().replace(/\\/g, '/'));
				}
			}
		}
		if (initiallyChanged.length > 0) {
			const store = getStore(cachePath);
			const dependents = store.getAffectedFiles(initiallyChanged);
			if (dependents.length > 0) {
				const fileMap = new Map<string, SourceFile>();
				for (const key in obj) {
					for (const s of obj[key]) {
						fileMap.set(s.relative().replace(/\\/g, '/'), s);
					}
				}
				for (const dep of dependents) {
					const s = fileMap.get(dep);
					if (s && s.ext === 'm' && !s.changed) {
						s.changed = true;
						printf.outFile.info(`依赖变更触发重编: ${dep}`);
					}
				}
			}
		}
	}

	// ─── 增量编译守卫:animation-keyframes.css 一致性校验 ──────────────────
	// 该文件是所有组件 <css keyframes> 块的全局聚合产物,组件级 cache 的
	// outputs[] 不包含它.某些场景下(用户删 build 目录,cache 损坏,上次
	// ---- end keyframes check ----

	project['source_file'] = {
		...obj,
		'*it': () => {
			const result: SourceFile[] = [];
			for (const key in obj) {
				result.push(...obj[key]);
			}
			return result;
		}
	} as Record<string, SourceFile[]> & { '*it': () => SourceFile[] };

	profiler.end('scan:process');
	profiler.start('scan:build');

	// _3 forwards the Promise from _5 → _6 (which writes index.html and persists
	// the cache). Awaiting it here makes `start` → `BuildProject` actually wait
	// for the full build pipeline to complete, instead of returning as soon as
	// the synchronous setup chain unwinds. Without this, callers can observe a
	// half-written index.html (missing the animation-keyframes.css link, etc.).
	BUILD_TIMER.lap('文件扫描');
	const pendingBuild = _3();
	if (pendingBuild) {
		await pendingBuild;
	}

	profiler.end('scan:build');
}
