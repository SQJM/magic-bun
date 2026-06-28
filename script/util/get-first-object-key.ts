export function getFirstObjectKey(obj: object): string | undefined {
	const keys = Object.keys(obj);
	return keys.length > 0 ? keys[0] : undefined;
}
