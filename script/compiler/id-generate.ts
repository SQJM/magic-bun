export function idGenerate(len: number = 4): string {
	const timestamp = `${new Date().getTime()}`.substring(len);

	function getRandomLetter(): string {
		const letters = 'abcdefghijklmnopqrstuvwxyz';
		return letters[Math.floor(Math.random() * letters.length)];
	}

	let result = '';
	for (let i = 0; i < timestamp.length; i++) {
		result += timestamp[i];
		if (i < timestamp.length - 1) {
			result += getRandomLetter();
		}
	}

	return result;
}
