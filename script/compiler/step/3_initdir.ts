import { app } from '../../../app.ts';
import { printf } from '../../util/printf.ts';
import { project } from '../global.ts';
import { _4 } from './4_classify.ts';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { BUILD_TIMER } from '../start.ts';

export function _3(): Promise<void> | void {
	printf.outFile.info(`初始化构建项目`);

	const outDir = project.outDir;
	const outDirMagic = project.outDirMagic;
	const isModule = project.build_config.build.module === true;

	if (!existsSync(outDir)) {
		mkdirSync(outDir, { recursive: true });
	}

	if (isModule) {
		project.outDirMagic = outDir;
	} else {
		if (!existsSync(outDirMagic)) {
			mkdirSync(outDirMagic, { recursive: true });
		}

		if (!project._dryRun) {
			writeFileSync(
				`${outDirMagic}/runtime.js`,
				`window[ "magic_version" ] = "${app.version}";\n` + app.templateDir.runtime.get('runtime.js')
			);
			writeFileSync(`${outDirMagic}/runtime.css`, app.templateDir.runtime.get('runtime.css'));
		}
	}
	// _4 forwards the Promise from _5 → _6 (which writes index.html). Returning it
	// here lets _2 → _1 → start → BuildProject properly await the whole build.
	BUILD_TIMER.lap('初始化目录');
	return _4();
}
