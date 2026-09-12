export function isEmptyObject(obj: object): boolean {
	return Object.keys(obj).length === 0;
}

export function is<T>(
	target: () => { bool: boolean; result: T },
	succeed?: (result: T) => void,
	fail?: (result: T) => void
): void {
	if (typeof target !== 'function') {
		throw new Error('Error: target must be a function');
	}
	const { bool, result } = target();
	if (bool) succeed?.(result);
	else fail?.(result);
}
