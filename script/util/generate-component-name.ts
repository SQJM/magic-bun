export function generateComponentName(originalFile: string, isModule: boolean, moduleName?: string): string {
	if (originalFile.toLocaleLowerCase().endsWith('.m')) {
		originalFile = originalFile.slice(0, -2);
	}
	if (isModule) originalFile = (moduleName || '') + originalFile;
	const name = originalFile.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().replace(/^[0-9]+/, '');
	if (name.length === 0) throw new Error(`无法为文件生成有效的组件名称 [path:${originalFile}]`);
	return name;
}
