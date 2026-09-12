import { readFileSync, writeFileSync } from 'node:fs';
import prettier from 'prettier';

/** .m 文件中的块类型 */
interface MagicBlock {
	type: string;
	attrs: string;
	code: string;
	startTag: string;
	endTag: string;
	/** 原始文本中开标签 > 之后的偏移 */
	contentStart: number;
	/** 原始文本中 </tag> 的偏移 */
	contentEnd: number;
}

/**
 * 解析 .m 文件内容,提取各个代码块
 */
function parseMagicBlocks(text: string): MagicBlock[] {
	const blocks: MagicBlock[] = [];
	const tagRegex = /<(import|template|script|css|extend|expose-event)([^>]*)>/gi;
	let match: RegExpExecArray | null;

	while ((match = tagRegex.exec(text)) !== null) {
		const tagName = match[1].toLowerCase();
		const attrs = match[2];
		const tagStart = match[0];
		const contentStart = match.index + tagStart.length;

		// 自闭合标签跳过
		if (tagStart.trim().endsWith('/>')) continue;

		// 查找 </tagName>
		const closeTag = `</${tagName}>`;
		const closeIdx = text.indexOf(closeTag, contentStart);
		if (closeIdx === -1) continue;

		const code = text.slice(contentStart, closeIdx);
		blocks.push({
			type: tagName,
			attrs,
			code,
			startTag: tagStart,
			endTag: closeTag,
			contentStart,
			contentEnd: closeIdx,
		});
	}

	return blocks;
}

/**
 * 使用 prettier 格式化单个代码块的内容
 */
async function formatCode(code: string, type: string): Promise<string | null> {
	const trimmed = code.trim();
	if (!trimmed) return null;

	let parser: string;
	switch (type) {
		case 'css':
			parser = 'css';
			break;
		case 'script':
			parser = 'babel';
			break;
		case 'template':
		case 'extend':
			parser = 'html';
			break;
		default:
			return null;
	}

	try {
			const formatted = await prettier.format(trimmed, {
				parser,
				useTabs: true,
				semi: type === 'script' ? false : true,
				singleQuote: true,
				htmlWhitespaceSensitivity: 'ignore',
				printWidth: 120,
			});
		return formatted.trimEnd();
	} catch {
		return null;
	}
}

/**
 * 格式化 .m 文件
 * @param filePath .m 文件路径
 * @param dryRun 只输出不写入
 * @returns 是否修改了内容
 */
export async function formatMagicFile(filePath: string, dryRun = false): Promise<boolean> {
	const text = readFileSync(filePath, 'utf-8');
	const blocks = parseMagicBlocks(text);

	if (blocks.length === 0) return false;

	// 倒序替换,避免偏移变化
	const sorted = [...blocks].sort((a, b) => b.contentStart - a.contentStart);
	let result = text;
	let changed = false;

	for (const block of sorted) {
		const formatted = await formatCode(block.code, block.type);
		if (formatted === null || formatted === block.code) continue;

		// 缩进一个 tab(内容在标签内部)
		const indented = formatted.split('\n').map(line => '\t' + line).join('\n');
		result = result.slice(0, block.contentStart) + '\n' + indented + '\n' + result.slice(block.contentEnd);
		changed = true;
	}

	if (!changed) return false;

	if (!dryRun) {
		writeFileSync(filePath, result, 'utf-8');
	}

	return true;
}
