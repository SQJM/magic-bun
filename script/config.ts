function MB(num: number): number {
	return num * 1024 * 1024;
}

export const Config = {
	log: {
		out: {
			maxSize: MB(2)
		},
		build: {
			maxSize: MB(2)
		}
	},
	build: {
		MScriptBlockSize: MB(1),
		CSSBlockSize: MB(1)
	},
	init: {}
};
