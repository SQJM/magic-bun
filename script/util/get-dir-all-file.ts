import fs from 'node:fs';
import path from 'node:path';

export function getDirAllFile(dir: string): string[] {
	const arr: string[] = [];

	function it(currentPath: string): void {
		try {
			fs.readdirSync(currentPath).forEach((file) => {
				const filePath = path.join(currentPath, file);
				if (fs.statSync(filePath).isDirectory()) it(filePath);
				else arr.push(filePath);
			});
		} catch (e) {
			throw new Error(`无法读取目录: ${e}`, { cause: e });
		}
	}

	it(dir);
	return arr;
}
