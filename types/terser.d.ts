declare module 'terser' {
	export function minify(code: string, options?: Record<string, unknown>): Promise<{ code?: string; error?: Error }>;
	export function minify_sync(code: string, options?: Record<string, unknown>): { code?: string; error?: Error };
}
