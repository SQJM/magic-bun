// Critical CSS 提取
// 解析 HTML,提取首屏可见元素的 CSS
// 输出独立的 critical.css 和内联 style 标签

interface CriticalResult {
	critical: string;
	remaining: string;
}

function extractSelectorsFromHTML(html: string): Set<string> {
	const selectors = new Set<string>();

	// 匹配标签名
	const tagRegex = /<(\w+)[\s>]/g;
	let match: RegExpExecArray | null;
	while ((match = tagRegex.exec(html)) !== null) {
		selectors.add(match[1].toLowerCase());
	}

	// 匹配 class
	const classRegex = /class=["']([^"']+)["']/g;
	while ((match = classRegex.exec(html)) !== null) {
		const classes = match[1].split(/\s+/);
		for (const cls of classes) {
			if (cls) selectors.add('.' + cls);
		}
	}

	// 匹配 id
	const idRegex = /id=["']([^"']+)["']/g;
	while ((match = idRegex.exec(html)) !== null) {
		selectors.add('#' + match[1]);
	}

	return selectors;
}

function isSelectorInFirstScreen(selector: string, firstScreenSelectors: Set<string>): boolean {
	const trimmed = selector.trim();
	if (!trimmed) return false;

	// 伪元素/伪类去掉再匹配
	const base = trimmed.replace(/::?[a-zA-Z-]+/g, '').trim();

	for (const sel of firstScreenSelectors) {
		if (base.includes(sel)) return true;
		if (sel.includes(base)) return true;
	}
	return false;
}

function normalizeSelector(s: string): string {
	return s
		.replace(/\s+/g, ' ')
		.replace(/[\n\r\t]/g, ' ')
		.trim();
}

export function extractCriticalCSS(html: string, css: string): CriticalResult {
	const firstScreenSelectors = extractSelectorsFromHTML(html);

	if (firstScreenSelectors.size === 0) {
		return { critical: '', remaining: css };
	}

	const criticalRules: string[] = [];
	const remainingRules: string[] = [];

	// Simple CSS rule extraction
	const ruleRegex = /([^{}]*\{[^{}]*\})/g;
	let ruleMatch: RegExpExecArray | null;
	while ((ruleMatch = ruleRegex.exec(css)) !== null) {
		const rule = ruleMatch[1].trim();
		// Extract selector from rule
		const braceIdx = rule.indexOf('{');
		if (braceIdx === -1) {
			remainingRules.push(rule);
			continue;
		}
		const selectorPart = normalizeSelector(rule.substring(0, braceIdx));

		// Split by comma for multiple selectors
		const selectors = selectorPart.split(',').map((s: string) => normalizeSelector(s));

		let isCritical = false;
		for (const sel of selectors) {
			if (isSelectorInFirstScreen(sel, firstScreenSelectors)) {
				isCritical = true;
				break;
			}
		}

		if (isCritical) {
			criticalRules.push(rule);
		} else {
			remainingRules.push(rule);
		}
	}

	// Handle @keyframes, @media, etc.
	const atRuleRegex = /(@[^{]+\{[^}]*(?:\{[^}]*\}[^}]*)*\})/g;
	const atBlocks: string[] = [];
	css.replace(atRuleRegex, (match) => {
		atBlocks.push(match);
		return '';
	});

	// Check if @keyframes are referenced in critical rules
	const criticalText = criticalRules.join('\n');
	const criticalAtBlocks: string[] = [];
	for (const block of atBlocks) {
		const nameMatch = block.match(/@(?:-webkit-)?keyframes\s+([^{]+)/);
		if (nameMatch && criticalText.includes(nameMatch[1].trim())) {
			criticalAtBlocks.push(block);
		}
	}

	return {
		critical: criticalAtBlocks.join('\n') + '\n' + criticalRules.join('\n'),
		remaining: remainingRules.join('\n')
	};
}
