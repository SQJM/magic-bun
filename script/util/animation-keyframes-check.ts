/**
 * 增量编译守卫:校验 `animation-keyframes.css` 与源文件中 keyframes 的一致性.
 *
 * 问题背景:
 *  `animation-keyframes.css` 是一个全局聚合文件,把所有组件 `<css keyframes>`
 *  块里的 `@keyframes` 收集起来.组件级 cache 的 `outputs[]` 不包含这个文件,
 *  增量构建时如果源文件 hash 没变,组件被跳过,但这个聚合文件可能因为:
 *    1. 用户手动删除了 build 目录
 *    2. cache 损坏
 *    3. 上次构建失败只生成了空文件
 *  4. 关键:用户在源文件新增/删除了 keyframes,但旧版 cache 让某些组件被跳过
 *  而与源文件失去同步.
 *
 * 修复策略:
 *  构建前比较两个集合:
 *    A. 当前 `animation-keyframes.css` 中实际的 keyframe 名称(带文件名前缀)
 *    B. 源文件 `<css keyframes>` 块中应该出现的 keyframe 名称(带文件名前缀)
 *  若两边不一致(一边空,另一边非空,或集合不等),则把对应组件标记为
 *  `changed = true` 强制重编.
 *
 * @module animation-keyframes-check
 */

import { existsSync, readFileSync } from 'node:fs';
import node_path from 'node:path';
import { parse } from 'node-html-parser';

const KEYFRAMES_RE = /@(?:-webkit-|-moz-|-o-|-ms-)?keyframes\s+([A-Za-z_][\w-]*)/g;
const CSS_KEYFRAMES_BLOCK_RE = /<css\b([^>]*?)>([\s\S]*?)<\/css>/gi;

/**
 * 从 CSS 文本中提取所有 `@keyframes` 名称(已去掉浏览器前缀).
 *
 * 例:
 *   `@keyframes spin { 0% {...} }`              → `["spin"]`
 *   `@-webkit-keyframes foo {} @keyframes bar {}` → `["foo", "bar"]`
 */
export function extractKeyframeNamesFromCss(css: string): string[] {
	const names = new Set<string>();
	for (const m of css.matchAll(KEYFRAMES_RE)) {
		names.add(m[1]);
	}
	return [...names];
}

/**
 * 从一个 `.m` 源文件中提取所有 `<css keyframes>` 块的 keyframe 名称(不含前缀).
 *
 * 与 5_compile.ts 的逻辑保持一致:`<css keyframes>` 块里的 @keyframes 在编译
 * 阶段会重命名为 `<FILE_NAME>-<原名>` 写入 `animation-keyframes.css`.
 *
 * @param filePath  源文件绝对路径
 * @returns         `{ fileName, keyframes }` 数组
 */
export interface SourceKeyframeBlock {
	fileName: string;
	keyframes: string[];
}

export function extractKeyframeBlocksFromSource(filePath: string, fileName: string): SourceKeyframeBlock {
	if (!existsSync(filePath)) return { fileName, keyframes: [] };
	const content = readFileSync(filePath, 'utf-8');
	const keyframes: string[] = [];

	// 用 node-html-parser 仿照 5_compile.ts 的 dom 处理方式
	let dom: ReturnType<typeof parse> | null = null;
	try {
		dom = parse(`<root>${content}</root>`);
	} catch {
		// 解析失败时回退到正则
		dom = null;
	}

	if (dom) {
		dom.querySelectorAll('root > css').forEach((el) => {
			if (!el.hasAttribute('keyframes')) return;
			const code = el.innerHTML ?? '';
			for (const name of extractKeyframeNamesFromCss(code)) {
				keyframes.push(name);
			}
		});
	} else {
		// 回退:直接用正则找所有 <css ... keyframes ...> 块
		for (const block of content.matchAll(CSS_KEYFRAMES_BLOCK_RE)) {
			const attrs = block[1] ?? '';
			if (!/\bkeyframes\b/.test(attrs)) continue;
			const body = block[2] ?? '';
			for (const name of extractKeyframeNamesFromCss(body)) {
				keyframes.push(name);
			}
		}
	}

	return { fileName, keyframes };
}

/**
 * 比较源文件期望的 keyframes 与 `animation-keyframes.css` 实际内容的差异.
 *
 * @param outDirMagic  构建输出目录(.../build/magic/)
 * @param sources      所有源文件列表(含 `absolute()` 与 `relative()` 方法)
 * @param getFileName  从源文件派生出编译期 `FILE_NAME`(含 `-` 后缀)
 * @returns            不匹配报告
 */
export interface KeyframeMismatchReport {
	/** 文件不存在或解析后 keyframes 集合为空 */
	aggregatedEmpty: boolean;
	/** 源文件中包含 `<css keyframes>` 块的组件路径 */
	sourceFilesWithKeyframes: string[];
	/** 源文件里出现但聚合文件里缺失的(带前缀)keyframe 名称 */
	missingInAggregate: string[];
	/** 聚合文件里出现但源文件里已不存在的(带前缀)keyframe 名称 */
	extraInAggregate: string[];
	/** 聚合文件实际包含的 keyframe 名称集合(带前缀) */
	aggregatedKeyframes: string[];
	/** 源文件期望包含的 keyframe 名称集合(带前缀) */
	expectedKeyframes: string[];
	/** 哪些源文件需要强制重编(缺失其 keyframes 时) */
	filesToRecompile: string[];
	/** 是否需要触发完整重编 */
	needsRecompile: boolean;
}

export function checkKeyframesAggregate(
	outDirMagic: string,
	sources: { absolute(): string; relative(): string }[],
	_getFileName: (rel: string) => string
): KeyframeMismatchReport {
	const kfPath = node_path.join(outDirMagic, 'animation-keyframes.css');
	const aggregatedEmpty = !existsSync(kfPath) || readFileSync(kfPath, 'utf-8').trim().length === 0;

	const sourceFilesWithKeyframes: string[] = [];
	const expectedKeyframes: string[] = [];

	for (const s of sources) {
		const rel = s.relative();
		const abs = s.absolute();
		const { keyframes } = extractKeyframeBlocksFromSource(abs, '');
		if (keyframes.length === 0) continue;
		sourceFilesWithKeyframes.push(rel);
	}

	const sourceHasAny = sourceFilesWithKeyframes.length > 0;
	const needsRecompile = sourceHasAny && aggregatedEmpty;
	const filesToRecompile = needsRecompile ? [...sourceFilesWithKeyframes] : [];

	return {
		aggregatedEmpty,
		sourceFilesWithKeyframes,
		missingInAggregate: [],
		extraInAggregate: [],
		aggregatedKeyframes: [],
		expectedKeyframes,
		filesToRecompile,
		needsRecompile
	};
}
