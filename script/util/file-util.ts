import fs from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';

function createFileWithDirectories(filePath: string, data: string): void {
	const directoryPath = path.dirname(filePath);

	function createDirectories(dirPath: string): void {
		if (!fs.existsSync(dirPath)) {
			createDirectories(path.dirname(dirPath));
			fs.mkdirSync(dirPath);
		}
	}

	createDirectories(directoryPath);

	if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, data);
}

function copyFileWithDirectories(srcPath: string, targetPath: string): void {
	const directoryPath = path.dirname(targetPath);

	function createDirectories(dirPath: string): void {
		if (!fs.existsSync(dirPath)) {
			createDirectories(path.dirname(dirPath));
			fs.mkdirSync(dirPath);
		}
	}

	createDirectories(directoryPath);

	fs.copyFileSync(srcPath, targetPath);
}

function readFileLine(filePath: string): Promise<string> {
	const fileStream = fs.createReadStream(filePath);

	const reader = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity
	});

	return new Promise((resolve, reject) => {
		reader.on('line', (line: string) => {
			resolve(line);
			reader.close();
		});

		reader.on('error', (error: Error) => {
			reject(error);
		});

		reader.on('close', () => {
			fileStream.destroy();
		});
	});
}

function getExtensionName(filePath: string): string {
	const name = path.basename(filePath);
	const lastDotIndex = name.lastIndexOf('.');
	if (lastDotIndex === -1 || lastDotIndex === name.length - 1) {
		return name;
	}
	return name.substring(lastDotIndex + 1);
}

export const fileUtil = {
	createFileWithDirectories,
	copyFileWithDirectories,
	readFileLine,
	getExtensionName
};
