declare module 'css-shorthand-expand' {
	function expand(
		property: string,
		value: string
	): Record<string, string> | undefined;
	export = expand;
}
