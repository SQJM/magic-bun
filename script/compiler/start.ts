import { printf } from '../util/printf.ts';
import { macroReplace } from './macro-replace.ts';
import { _1 } from './step/1_config.ts';
import { resetProject } from './global.ts';
import { clearParseCache } from './parse-cache.ts';
import { resetCompileState } from './step/5_compile.ts';
import { pluginManager } from './plugin.ts';
import { generateTraceId } from '../util/trace-id.ts';
import { PerfTimer } from '../util/perf-timing.ts';
import type { BuildConfig } from '../types.ts';

export let START_TIME: number;
export let BUILD_TIMER: PerfTimer;

export async function start(root: BuildConfig, paht: string): Promise<void> {
	generateTraceId();
	BUILD_TIMER = new PerfTimer();
	resetProject();
	clearParseCache();
	resetCompileState();
	pluginManager.clear();
	await pluginManager.loadFromConfig(root);
	await pluginManager.notify('onBuildStart', root);
	printf.outFile.info(`预处理 Build 配置文件 [path:${paht}]`);
	START_TIME = new Date().getTime();
	await _1(macroReplace(root) as BuildConfig);
}
