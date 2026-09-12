export function isStringOverSize(str: string, maxSize: number): boolean {
	const byteLength = new TextEncoder().encode(str).length;
	return byteLength > maxSize;
}
