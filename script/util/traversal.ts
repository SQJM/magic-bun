interface Entry<T> {
	value: T;
	index: number;
	key: string;
}

export function* traverseObject<T extends Record<string, unknown>>(obj: T): Generator<Entry<T[keyof T]>> {
	if (Object.keys(obj as object).length === 0) return;
	let i = 0;
	for (const key in obj) {
		yield { value: obj[key], index: i++, key };
	}
}

type ObjectCallback = (value: unknown, index: number, key: string) => unknown;

function objectLegacy(
	obj: unknown,
	callback: ObjectCallback = () => {},
	emCallback: () => void = () => {}
): { value: unknown; index: number; key: string } | undefined {
	if (!obj || typeof obj !== 'object') {
		emCallback();
		return undefined;
	}
	if (Object.keys(obj).length === 0) {
		emCallback();
		return undefined;
	}
	let i = 0;
	for (const objKey in obj as Record<string, unknown>) {
		const val = (obj as Record<string, unknown>)[objKey];
		const r = callback(val, i++, objKey);
		if (r === 'return') return { value: val, index: i, key: objKey };
		else if (r === 'break') break;
	}
}

export const traversal = {
	object: objectLegacy,
	each: traverseObject
};
