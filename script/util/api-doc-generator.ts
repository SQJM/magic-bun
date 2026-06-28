// API 文档自动生成器
// 解析 runtime.d.ts 的 JSDoc 注释
// 输出 markdown 格式的 API 文档

import fs from 'node:fs';
import path from 'node:path';

interface DocField {
	name: string;
	type: string;
	description: string;
	example?: string;
}

interface DocInterface {
	name: string;
	description: string;
	methods: DocField[];
	properties: DocField[];
}

/**
 * 解析 .d.ts 文件中的 JSDoc 注释并生成 Markdown API 文档
 * @param dtsPath - runtime.d.ts 文件路径
 * @returns Markdown 文档字符串
 */
export function generateAPIDocs(dtsPath: string): string {
	const content = fs.readFileSync(dtsPath, 'utf-8');
	const lines = content.split('\n');

	const docs: DocInterface[] = [];
	let currentInterface: DocInterface | null = null;
	let currentComment: string[] = [];
	let inComment = false;
	let exampleBlock: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		if (line.startsWith('/**')) {
			inComment = true;
			currentComment = [];
			exampleBlock = [];
			continue;
		}

		if (inComment) {
			if (line === '*/' || line.startsWith('*/')) {
				inComment = false;
			} else if (line.startsWith('* @example')) {
				// 收集 example 代码块
				let ex = '';
				for (let j = i + 1; j < lines.length; j++) {
					const exLine = lines[j].trim();
					if (exLine.startsWith('*') && !exLine.startsWith('*/')) {
						ex += exLine.replace(/^\*\s?/, '') + '\n';
					} else {
						break;
					}
				}
				exampleBlock.push(ex.trim());
			} else {
				const cleaned = line.replace(/^\*\s?/, '');
				currentComment.push(cleaned);
			}
			continue;
		}

		// 检测 interface 声明
		const ifaceMatch = line.match(/^interface\s+(\w+)/);
		if (ifaceMatch && currentComment.length > 0) {
			const name = ifaceMatch[1];
			const description = currentComment.filter((c) => c && !c.startsWith('@')).join(' ');
			currentInterface = {
				name,
				description,
				methods: [],
				properties: []
			};

			// 解析方法和属性
			parseMembers(lines, i, currentInterface);
			docs.push(currentInterface);
			currentComment = [];
			exampleBlock = [];
		}
	}

	return formatMarkdown(docs);
}

function parseMembers(lines: string[], startIndex: number, iface: DocInterface): void {
	let commentStack: string[] = [];

	for (let i = startIndex + 1; i < lines.length; i++) {
		const line = lines[i];

		if (line.trim() === '}') break;

		if (line.trim().startsWith('/**')) {
			commentStack = [];
			continue;
		}

		if (line.trim().startsWith('*') && !line.trim().startsWith('*/')) {
			const cleaned = line.trim().replace(/^\*\s?/, '');
			commentStack.push(cleaned);
			continue;
		}

		if (line.trim() === '*/') continue;

		// 解析属性/方法声明
		const propMatch = line.trim().match(/^(\w+)(\??)\s*:\s*(.+?);?\s*$/);
		const funcMatch = line.trim().match(/^(\w+)\s*\(([^)]*)\)\s*:\s*(.+?);?\s*$/);

		if (propMatch && commentStack.length > 0) {
			const name = propMatch[1];
			const type = propMatch[3].replace(/;$/, '').trim();
			const description = commentStack.filter((c) => c && !c.startsWith('@')).join(' ');
			iface.properties.push({ name, type, description });
			commentStack = [];
		} else if (funcMatch && commentStack.length > 0) {
			const name = funcMatch[1];
			const params = funcMatch[2];
			const returnType = funcMatch[3].replace(/;$/, '').trim();
			const description = commentStack.filter((c) => c && !c.startsWith('@')).join(' ');
			iface.methods.push({ name, type: `(${params}) => ${returnType}`, description });
			commentStack = [];
		}
	}
}

function formatMarkdown(docs: DocInterface[]): string {
	let md = '# Magic API 文档\n\n';
	md += `> 自动生成自 \`runtime.d.ts\` JSDoc 注释\n\n`;
	md += `---\n\n`;

	for (const iface of docs) {
		md += `## ${iface.name}\n\n`;
		if (iface.description) {
			md += `${iface.description}\n\n`;
		}

		if (iface.methods.length > 0) {
			md += `### 方法\n\n`;
			md += `| 名称 | 类型 | 说明 |\n`;
			md += `|------|------|------|\n`;
			for (const m of iface.methods) {
				md += `| \`${m.name}\` | \`${escapeMd(m.type)}\` | ${m.description} |\n`;
			}
			md += '\n';
		}

		if (iface.properties.length > 0) {
			md += `### 属性\n\n`;
			md += `| 名称 | 类型 | 说明 |\n`;
			md += `|------|------|------|\n`;
			for (const p of iface.properties) {
				md += `| \`${p.name}\` | \`${escapeMd(p.type)}\` | ${p.description} |\n`;
			}
			md += '\n';
		}

		md += `---\n\n`;
	}

	return md;
}

function escapeMd(text: string): string {
	return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * 生成 API 文档并写入文件
 * @param dtsPath - runtime.d.ts 输入路径
 * @param outputPath - 输出的 markdown 文件路径
 */
export function writeAPIDocs(dtsPath: string, outputPath: string): void {
	const docs = generateAPIDocs(dtsPath);
	const dir = path.dirname(outputPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(outputPath, docs);
	console.log(`[api-doc] API 文档已生成: ${outputPath}`);
}
