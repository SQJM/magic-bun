import { macro } from './macro.ts';
import { generateComponentName } from '../util/generate-component-name.ts';
import { project } from './global.ts';

function stringMacroReplace(string: string, componentPath?: string): string {
	let result = string
		.replaceAll('[$MAGIC_RUN_DIR]', macro.$MAGIC_RUN_DIR.replaceAll('\\', '\\\\'))
		.replaceAll('[$PROJECT_RUN_DIR]', macro.$PROJECT_RUN_DIR.replaceAll('\\', '\\\\'));
	// 仅对 .m 组件文件替换 [$m] (组件名宏);其它文件 (如 front-run / back-run 脚本) 保留字面量
	if (componentPath && componentPath.toLocaleLowerCase().endsWith('.m') && result.includes('[$m]')) {
		const name = generateComponentName(
			componentPath,
			project.build_config.build.module === true,
			project.build_config.config.name
		);
		result = result.replaceAll('[$m]', name);
	}
	return result;
}

export function macroReplace(data: string, componentPath?: string): string;
export function macroReplace(data: object, componentPath?: string): object;
export function macroReplace(data: string | object, componentPath?: string): string | object {
	if (typeof data === 'object') {
		return JSON.parse(stringMacroReplace(JSON.stringify(data), componentPath));
	} else if (typeof data === 'string') {
		return stringMacroReplace(data, componentPath);
	}
	return data;
}
