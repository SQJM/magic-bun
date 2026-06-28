export function task(func: () => void, _name: string | boolean = false): void {
	func();
}
