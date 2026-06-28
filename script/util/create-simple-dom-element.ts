import { getFirstObjectKey } from './get-first-object-key.ts';

interface DomElementOptions {
	attrs: Array<Record<string, string>>;
	one?: boolean;
	tag: string;
	content?: string;
}

export function createSimpleDomElement(obj: DomElementOptions): string {
	let attrs = '';
	obj.attrs.forEach((attr) => {
		const name = getFirstObjectKey(attr);
		if (name) attrs += `${name}="${attr[name]}"`;
	});

	if (obj.one) {
		return `<${obj.tag} ${attrs}/>`;
	}
	return `<${obj.tag} ${attrs}>${obj.content || ''}</${obj.tag}>`;
}
