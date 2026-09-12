import fs from 'node:fs';
import path from 'node:path';

export function copyDir(src: string, dest: string): void {
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, { recursive: true });
	}

	const files = fs.readdirSync(src, { withFileTypes: true });

	files.forEach((file) => {
		const srcPath = path.join(src, file.name);
		const destPath = path.join(dest, file.name);

		if (file.isDirectory()) {
			copyDir(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	});
}
