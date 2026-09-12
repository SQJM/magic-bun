// 简易 autoprefixer(PostCSS 插件)
// 只处理最常用的前缀:-webkit-, -moz-, -ms-

const PROPERTY_MAP: Record<string, string[]> = {
	'animation': ['-webkit-animation'],
	'transform': ['-webkit-transform', '-moz-transform', '-ms-transform'],
	'transition': ['-webkit-transition', '-moz-transition'],
	'user-select': ['-webkit-user-select', '-moz-user-select', '-ms-user-select'],
	'box-shadow': ['-webkit-box-shadow', '-moz-box-shadow'],
	'box-sizing': ['-webkit-box-sizing', '-moz-box-sizing'],
	'filter': ['-webkit-filter'],
	'flex': ['-webkit-flex'],
	'flex-direction': ['-webkit-flex-direction'],
	'flex-wrap': ['-webkit-flex-wrap'],
	'flex-flow': ['-webkit-flex-flow'],
	'justify-content': ['-webkit-justify-content'],
	'align-items': ['-webkit-align-items'],
	'align-content': ['-webkit-align-content'],
	'align-self': ['-webkit-align-self'],
	'order': ['-webkit-order'],
	'flex-grow': ['-webkit-flex-grow'],
	'flex-shrink': ['-webkit-flex-shrink'],
	'flex-basis': ['-webkit-flex-basis'],
	'backface-visibility': ['-webkit-backface-visibility'],
	'perspective': ['-webkit-perspective'],
	'border-radius': ['-webkit-border-radius', '-moz-border-radius'],
	'border-image': ['-webkit-border-image', '-moz-border-image'],
	'text-size-adjust': ['-webkit-text-size-adjust', '-moz-text-size-adjust', '-ms-text-size-adjust'],
	'appearance': ['-webkit-appearance', '-moz-appearance'],
	'column-count': ['-webkit-column-count', '-moz-column-count'],
	'column-gap': ['-webkit-column-gap', '-moz-column-gap'],
	'column-rule': ['-webkit-column-rule', '-moz-column-rule'],
	'column-width': ['-webkit-column-width', '-moz-column-width'],
	'hyphens': ['-webkit-hyphens', '-moz-hyphens', '-ms-hyphens'],
	'tab-size': ['-moz-tab-size'],
	'text-overflow': ['-o-text-overflow'],
	'placeholder': ['::-webkit-input-placeholder', '::-moz-placeholder', ':-ms-input-placeholder']
};

const VALUE_MAP: Record<string, string[]> = {
	'flex': ['-webkit-flex'],
	'inline-flex': ['-webkit-inline-flex'],
	'linear-gradient': ['-webkit-linear-gradient', '-moz-linear-gradient'],
	'radial-gradient': ['-webkit-radial-gradient', '-moz-radial-gradient'],
	'transform': ['-webkit-transform', '-moz-transform', '-ms-transform']
};

export function magicAutoprefixer(_browsers?: string[]): {
	postcssPlugin: string;
	Declaration(decl: { prop: string; value: string; cloneBefore(opts: { prop: string; value: string }): void }): void;
} {
	return {
		postcssPlugin: 'magic-autoprefixer',

		Declaration(decl: { prop: string; value: string; cloneBefore(opts: { prop: string; value: string }): void }) {
			// Add prefixed properties
			const prefixes = PROPERTY_MAP[decl.prop];
			if (prefixes) {
				for (const prefixed of prefixes) {
					decl.cloneBefore({ prop: prefixed, value: decl.value });
				}
			}

			// Add prefixed values (for display, background, etc.)
			for (const [key, vals] of Object.entries(VALUE_MAP)) {
				if (decl.value.includes(key)) {
					for (const prefixedVal of vals) {
						const newValue = decl.value.replace(new RegExp(key, 'g'), prefixedVal);
						decl.cloneBefore({ prop: decl.prop, value: newValue });
					}
				}
			}
		}
	};
}

// Mark as PostCSS plugin
(magicAutoprefixer as unknown as Record<string, boolean>).postcss = true;
