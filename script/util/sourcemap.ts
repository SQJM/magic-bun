// Source Map 生成
// 生成 .map 文件到 build/magic/ 目录(与对应 .js 同目录,部署时一起发布)

import { mkdirSync, writeFileSync } from 'node:fs';
import { project } from '../compiler/global.ts';

interface RawSourceMap {
	version: number;
	file: string;
	sources: string[];
	sourcesContent: string[];
	names: string[];
	mappings: string;
}

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeVLQ(value: number): string {
	let result = '';
	let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;
	do {
		let digit = vlq & 0x1f;
		vlq >>>= 5;
		if (vlq > 0) digit |= 0x20;
		result += VLQ_CHARS[digit];
	} while (vlq > 0);
	return result;
}

export function generateSourceMap(code: string, original: string, file: string): string {
	// sources 字段: 与 .map 同目录,浏览器 fetch 时解析为同目录的 .js (200)
	const sources = [file];
	const sourcesContent = [original];
	const names: string[] = [];

	const originalLines = original.split('\n');
	const generatedLines = code.split('\n');

	const mappings: string[] = [];
	let prevGenCol = 0;
	let prevSrcLine = 0;
	let prevSrcCol = 0;
	let prevSrcIdx = 0;

	for (let genLine = 0; genLine < generatedLines.length; genLine++) {
		const genSegments: string[] = [];
		const srcLine = genLine < originalLines.length ? genLine : originalLines.length - 1;
		const srcLine0 = srcLine;

		const genCol = 0;
		const srcCol = 0;

		const relGenCol = genCol - prevGenCol;
		const relSrcIdx = 0 - prevSrcIdx;
		const relSrcLine = srcLine0 - prevSrcLine;
		const relSrcCol = srcCol - prevSrcCol;

		genSegments.push(encodeVLQ(relGenCol));
		genSegments.push(encodeVLQ(relSrcIdx));
		genSegments.push(encodeVLQ(relSrcLine));
		genSegments.push(encodeVLQ(relSrcCol));

		prevGenCol = genCol;
		prevSrcIdx = 0;
		prevSrcLine = srcLine0;
		prevSrcCol = srcCol;

		mappings.push(genSegments.join(''));
	}

	const map: RawSourceMap = {
		version: 3,
		file,
		sources,
		sourcesContent,
		names,
		mappings: mappings.join(';')
	};

	return JSON.stringify(map);
}

/**
 * 将 source map 写入 build/magic/ 目录(与对应 .js 同目录),
 * 返回带 sourceMappingURL 注释的代码.
 */
export function writeSourceMapFile(code: string, original: string, fileName: string): string {
	const mapDir = project.outDirMagic;
	mkdirSync(mapDir, { recursive: true });

	const map = generateSourceMap(code, original, fileName);
	writeFileSync(mapDir + fileName + '.map', map);

	// 从 build/magic/filename.js → ./filename.js.map (同目录相对引用)
	const mapRef = './' + fileName + '.map';
	return code + '\n//# sourceMappingURL=' + mapRef;
}

export function addSourceMapComment(code: string, map: string): string {
	const base64 = btoa(map);
	return code + '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' + base64;
}
