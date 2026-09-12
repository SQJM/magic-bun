/**
 * PostCSS plugin: expand CSS shorthand properties into longhand sub-properties.
 *
 * Uses `css-shorthand-expand` for basic properties (font/padding/margin/border/background/outline)
 * and custom value parsers for animation/transition/flex/etc.
 */
import postcssValueParser from 'postcss-value-parser';

// css-shorthand-expand is CJS-only
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cssShorthandExpand: (prop: string, value: string) => Record<string, string> | undefined = require('css-shorthand-expand');

/* ------------------------------------------------------------------ */
/*  Per-property expanders (animation, transition, flex, etc.)        */
/* ------------------------------------------------------------------ */

// ---- animation ---------------------------------------------------------------

const ANIM_TIMING_FN = new Set([
	'ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out',
	'step-start', 'step-end'
]);
const ANIM_DIRECTION = new Set(['normal', 'reverse', 'alternate', 'alternate-reverse']);
const ANIM_FILL_MODE = new Set(['none', 'forwards', 'backwards', 'both']);
const ANIM_PLAY_STATE = new Set(['running', 'paused']);

function isTime(s: string): boolean {
	return /^-?\d+(\.\d+)?(s|ms)$/i.test(s);
}
function isNumber(s: string): boolean {
	return /^-?\d+(\.\d+)?$/.test(s);
}
function isCubicBezierOrSteps(s: string): boolean {
	return /^(cubic-bezier|steps)\(/.test(s);
}

function expandAnimation(value: string): Record<string, string> | undefined {
	// Skip comma-separated multiple animations
	if (value.includes(',')) return;

	const parsed = postcssValueParser(value);
	const parts: string[] = [];
	parsed.walk((node) => {
		if (node.type === 'div') return; // skip commas (multi-animation)
		if (node.type === 'word' || node.type === 'function') {
			parts.push(postcssValueParser.stringify(node as never));
		}
	});

	if (parts.length === 0) return;

	const result: Record<string, string> = {};
	let timeIdx = 0;

	for (const part of parts) {
		if (isTime(part)) {
			if (timeIdx === 0) result['animation-duration'] = part;
			else result['animation-delay'] = part;
			timeIdx++;
		} else if (part === 'infinite' || isNumber(part)) {
			result['animation-iteration-count'] = part;
		} else if (isCubicBezierOrSteps(part) || ANIM_TIMING_FN.has(part)) {
			result['animation-timing-function'] = part;
		} else if (ANIM_DIRECTION.has(part)) {
			result['animation-direction'] = part;
		} else if (ANIM_FILL_MODE.has(part)) {
			result['animation-fill-mode'] = part;
		} else if (ANIM_PLAY_STATE.has(part)) {
			result['animation-play-state'] = part;
		} else {
			result['animation-name'] = part;
		}
	}

	if (!result['animation-name']) return;
	if (!result['animation-duration']) result['animation-duration'] = '0s';
	return result;
}

// ---- transition ---------------------------------------------------------------

const TRANS_TIMING_FN = new Set([
	'ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out',
	'step-start', 'step-end'
]);

function expandTransition(value: string): Record<string, string> | undefined {
	// Skip comma-separated multiple transitions
	if (value.includes(',')) return;
	const parsed = postcssValueParser(value);
	const parts: string[] = [];
	parsed.walk((node) => {
		if (node.type === 'div') return;
		if (node.type === 'word' || node.type === 'function') {
			parts.push(postcssValueParser.stringify(node as never));
		}
	});
	if (parts.length === 0) return;
	if (parts[0] === 'none') return undefined; // "transition: none" -- don't expand

	const result: Record<string, string> = {};
	let timeIdx = 0;

	for (const part of parts) {
		if (isTime(part)) {
			if (timeIdx === 0) result['transition-duration'] = part;
			else result['transition-delay'] = part;
			timeIdx++;
		} else if (isCubicBezierOrSteps(part) || TRANS_TIMING_FN.has(part)) {
			result['transition-timing-function'] = part;
		} else {
			result['transition-property'] = part;
		}
	}
	if (!result['transition-property']) return;
	if (!result['transition-duration']) result['transition-duration'] = '0s';
	return result;
}

// ---- flex ---------------------------------------------------------------

function expandFlex(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s+/);
	if (parts.length === 0) return;

	if (parts[0] === 'none') return { 'flex-grow': '0', 'flex-shrink': '0', 'flex-basis': 'auto' };

	const result: Record<string, string> = {};

	// flex-grow
	if (parts[0] && isNumber(parts[0])) {
		result['flex-grow'] = parts[0];
		if (parts.length >= 2 && isNumber(parts[1])) {
			result['flex-shrink'] = parts[1];
			if (parts.length >= 3) result['flex-basis'] = parts[2];
		} else if (parts.length >= 2) {
			result['flex-shrink'] = '1';
			result['flex-basis'] = parts[1];
		}
	} else if (parts[0]) {
		// initial, auto, or basis value
		result['flex-grow'] = '1';
		result['flex-shrink'] = '1';
		result['flex-basis'] = parts[0];
	}
	return Object.keys(result).length ? result : undefined;
}

// ---- flex-flow ---------------------------------------------------------------

function expandFlexFlow(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s+/);
	if (parts.length === 0) return;
	const result: Record<string, string> = {};
	const direction = new Set(['row', 'row-reverse', 'column', 'column-reverse']);
	const wrap = new Set(['nowrap', 'wrap', 'wrap-reverse']);
	for (const p of parts) {
		if (direction.has(p)) result['flex-direction'] = p;
		else if (wrap.has(p)) result['flex-wrap'] = p;
	}
	return Object.keys(result).length ? result : undefined;
}

// ---- overflow ---------------------------------------------------------------

function expandOverflow(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s+/);
	if (parts.length === 0) return;
	if (parts.length === 1) {
		return { 'overflow-x': parts[0], 'overflow-y': parts[0] };
	}
	return { 'overflow-x': parts[0], 'overflow-y': parts[1] };
}

// ---- gap (row-gap column-gap) ---------------------------------------------------------------

function expandGap(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s+/);
	if (parts.length === 0) return;
	if (parts.length === 1) {
		return { 'row-gap': parts[0], 'column-gap': parts[0] };
	}
	return { 'row-gap': parts[0], 'column-gap': parts[1] };
}

// ---- columns (column-width column-count) ---------------------------------------------------------------

function expandColumns(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s+/);
	if (parts.length === 0) return;
	const result: Record<string, string> = {};
	for (const p of parts) {
		if (p === 'auto' || isNumber(p)) result['column-count'] = p;
		else result['column-width'] = p;
	}
	return Object.keys(result).length ? result : undefined;
}

// ---- grid-column / grid-row ---------------------------------------------------------------

function expandGridColumn(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s*\/\s*/);
	if (parts.length === 1) {
		return { 'grid-column-start': parts[0], 'grid-column-end': 'auto' };
	}
	return { 'grid-column-start': parts[0], 'grid-column-end': parts[1] };
}

function expandGridRow(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s*\/\s*/);
	if (parts.length === 1) {
		return { 'grid-row-start': parts[0], 'grid-row-end': 'auto' };
	}
	return { 'grid-row-start': parts[0], 'grid-row-end': parts[1] };
}

// ---- grid-area ---------------------------------------------------------------

function expandGridArea(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s*\/\s*/);
	if (parts.length === 0 || parts.length > 4) return;
	const props = ['grid-row-start', 'grid-column-start', 'grid-row-end', 'grid-column-end'];
	if (parts.length <= 2) {
		// shorthand: row-start / column-start
		return {
			'grid-row-start': parts[0],
			'grid-column-start': parts[1] || parts[0],
			'grid-row-end': 'auto',
			'grid-column-end': 'auto'
		};
	}
	const r: Record<string, string> = {};
	for (let i = 0; i < parts.length; i++) {
		r[props[i]] = parts[i];
	}
	return r;
}

// ---- text-decoration ---------------------------------------------------------------

// Note: text-decoration shorthand is common but the longhands (text-decoration-line,
// text-decoration-color, text-decoration-style, text-decoration-thickness) work well
// as-is in modern browsers. We skip automatic expansion here since the expansion
// rules depend on CSS Text Decoration Level 4 which differs between browsers.

// ---- place-content / place-items / place-self ---------------------------------------------------------------

function expandPlaceAlign(value: string, prefix: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s+/);
	if (parts.length === 0) return;
	if (parts.length === 1) {
		return { [`align-${prefix}`]: parts[0], [`justify-${prefix}`]: parts[0] };
	}
	return { [`align-${prefix}`]: parts[0], [`justify-${prefix}`]: parts[1] };
}

// ---- inset ---------------------------------------------------------------

function expandInset(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s+/);
	if (parts.length === 0) return;
	if (parts.length === 1) {
		return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
	}
	if (parts.length === 2) {
		return { top: parts[0], bottom: parts[0], right: parts[1], left: parts[1] };
	}
	if (parts.length === 3) {
		return { top: parts[0], right: parts[1], left: parts[1], bottom: parts[2] };
	}
	return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

// ---- list-style ---------------------------------------------------------------

function expandListStyle(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s+/);
	if (parts.length === 0) return;
	const result: Record<string, string> = {};
	for (const p of parts) {
		if (p === 'none') {
			result['list-style-type'] = 'none';
		} else if (/^(disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman|georgian|armenian|cjk-ideographic|hebrew|hiragana|katakana|hiragana-iroha|katakana-iroha)$/.test(p)) {
			result['list-style-type'] = p;
		} else if (/^(inside|outside)$/.test(p)) {
			result['list-style-position'] = p;
		} else if (/^(url\(|none)/.test(p)) {
			result['list-style-image'] = p;
		} else {
			result['list-style-image'] = p;
		}
	}
	return Object.keys(result).length > 1 ? result : undefined;
}

// ---- column-rule ---------------------------------------------------------------

function expandColumnRule(value: string): Record<string, string> | undefined {
	const parts = value.trim().split(/\s+/);
	if (parts.length === 0) return;
	const result: Record<string, string> = {};
	const widths = new Set(['thin', 'medium', 'thick']);
	const styles = new Set([
		'none', 'hidden', 'dotted', 'dashed', 'solid', 'double',
		'groove', 'ridge', 'inset', 'outset'
	]);
	for (const p of parts) {
		if (widths.has(p) || /^\d/.test(p)) result['column-rule-width'] = p;
		else if (styles.has(p)) result['column-rule-style'] = p;
		else result['column-rule-color'] = p;
	}
	return Object.keys(result).length >= 2 ? result : undefined;
}

// ---- border-image ---------------------------------------------------------------

function expandBorderImage(value: string): Record<string, string> | undefined {
	// border-image: <source> <slice> / <width> / <outset> <repeat>
	// Simplified: we split on '/' first
	const parts = value.split('/');
	const result: Record<string, string> = {};
	if (parts[0]) result['border-image-source'] = parts[0].trim();
	if (parts.length >= 2) result['border-image-slice'] = parts[1].trim();
	if (parts.length >= 3) result['border-image-width'] = parts[2].trim();
	if (parts.length >= 4) result['border-image-outset'] = parts[3].trim();
	if (parts.length >= 5) result['border-image-repeat'] = parts[4].trim();
	return Object.keys(result).length > 0 ? result : undefined;
}

/* ------------------------------------------------------------------ */
/*  Master expander -- maps shorthand property → expander function     */
/* ------------------------------------------------------------------ */

type ExpanderFn = (value: string) => Record<string, string> | undefined;

const customExpanders: Record<string, ExpanderFn> = {
	'animation': expandAnimation,
	'transition': expandTransition,
	'flex': expandFlex,
	'flex-flow': expandFlexFlow,
	'overflow': expandOverflow,
	'gap': expandGap,
	'grid-gap': expandGap,
	'grid-column': expandGridColumn,
	'grid-row': expandGridRow,
	'grid-area': expandGridArea,
	'columns': expandColumns,
	'list-style': expandListStyle,
	'text-decoration': (_v: string) => undefined, // skip -- browser-dependent expansion
	'inset': expandInset,
	'place-content': (v: string) => expandPlaceAlign(v, 'content'),
	'place-items': (v: string) => expandPlaceAlign(v, 'items'),
	'place-self': (v: string) => expandPlaceAlign(v, 'self'),
	'column-rule': expandColumnRule,
	'border-image': expandBorderImage
};

/**
 * Expand a single CSS declaration value if its property is a known shorthand.
 * Returns the longhand key-value pairs, or undefined if no expansion needed.
 */
function expandValue(prop: string, value: string): Record<string, string> | undefined {
	// Skip CSS-wide keywords
	if (value === 'initial' || value === 'inherit' || value === 'unset' || value === 'revert' || value === 'revert-layer') return;

	// 1. Try the custom expander first
	const custom = customExpanders[prop];
	if (custom) return custom(value);

	// 2. Try css-shorthand-expand for basic properties
	try {
		return cssShorthandExpand(prop, value);
	} catch {
		return undefined;
	}
}

/* ------------------------------------------------------------------ */
/*  PostCSS plugin                                                     */
/* ------------------------------------------------------------------ */

interface PostCSSDeclaration {
	prop: string;
	value: string;
	parent: PostCSSContainer | undefined;
	clone(props: { prop: string; value: string }): PostCSSDeclaration;
	remove(): void;
}
interface PostCSSContainer {
	insertAfter(node: PostCSSDeclaration, newNode: PostCSSDeclaration): void;
}

export const postcssShorthandExpand = {
	postcssPlugin: 'postcss-shorthand-expand',

	Declaration(decl: PostCSSDeclaration) {
		// Skip CSS variables
		if (decl.prop.startsWith('--')) return;

		// Skip if already a longhand (most longhands don't have expanders)
		const expanded = expandValue(decl.prop, decl.value);
		if (!expanded) return;

		// Replace the shorthand with its longhand properties.
		// Insert clones after the current decl, then remove the original.
		if (!decl.parent) return;

		let lastInserted: PostCSSDeclaration = decl;
		for (const [p, v] of Object.entries(expanded)) {
			const clone = decl.clone({ prop: p, value: v });
			decl.parent.insertAfter(lastInserted, clone);
			lastInserted = clone;
		}
		decl.remove();
	}
};

/**
 * PostCSS plugin: rename animation-name values that match component-local
 * @keyframes names to their prefixed versions (e.g. "logo" → "ui_g_f-logo").
 */
export function postcssKeyframesRename(
	names: string[],
	componentName: string
): { postcssPlugin: string; Declaration(decl: PostCSSDeclaration): void } {
	const nameSet = new Set(names);
	const prefix = componentName + '-';

	return {
		postcssPlugin: 'postcss-keyframes-rename',

		Declaration(decl: PostCSSDeclaration) {
			if (decl.prop !== 'animation-name') return;
			if (decl.value === 'none') return;

			// Split comma-separated animation names and rename each
			const parts = decl.value.split(',').map(s => s.trim());
			let changed = false;
			for (let i = 0; i < parts.length; i++) {
				if (nameSet.has(parts[i])) {
					parts[i] = prefix + parts[i];
					changed = true;
				}
			}
			if (changed) {
				decl.value = parts.join(', ');
			}
		}
	};
}
