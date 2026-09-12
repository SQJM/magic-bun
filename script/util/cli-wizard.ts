/**
 * 交互式向导
 * 使用 readline 实现简单的交互式问答
 * 无需额外依赖
 */

import * as readline from 'node:readline';

export interface WizardQuestion {
	name: string;
	message: string;
	type: 'input' | 'confirm' | 'select' | 'password';
	default?: string | boolean;
	choices?: string[];
	validate?: (value: string) => boolean | string;
}

function isTTY(): boolean {
	return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

async function ask(rl: readline.Interface, message: string): Promise<string> {
	return new Promise((resolve) => {
		rl.question(message, (answer) => {
			resolve(answer.trim());
		});
	});
}

export async function wizard(questions: WizardQuestion[]): Promise<Record<string, string | boolean>> {
	if (!isTTY()) {
		// 非 TTY 环境自动回退:使用默认值
		const result: Record<string, string | boolean> = {};
		for (const q of questions) {
			result[q.name] = q.default ?? (q.type === 'confirm' ? false : '');
		}
		return result;
	}

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const answers: Record<string, string | boolean> = {};

	try {
		for (const q of questions) {
			let prompt = q.message;
			const defaultVal = q.default;

			if (q.type === 'confirm') {
				const defaultIsYes = defaultVal === true;
				const suffix = defaultIsYes ? ' [Y/n] ' : ' [y/N] ';
				const raw = await ask(rl, prompt + suffix);
				if (raw === '') {
					answers[q.name] = defaultIsYes;
				} else {
					answers[q.name] = raw.toLowerCase() === 'y' || raw.toLowerCase() === 'yes';
				}
			} else if (q.type === 'select' && q.choices) {
				prompt += '\n';
				for (let i = 0; i < q.choices.length; i++) {
					prompt += `  ${i + 1}. ${q.choices[i]}\n`;
				}
				const defaultIdx = typeof defaultVal === 'string' ? q.choices.indexOf(defaultVal) + 1 : 0;
				prompt += `请选择 [${defaultIdx || 1}-${q.choices.length}]`;
				const defaultSuffix = defaultIdx ? ` (${defaultIdx}) ` : ' ';
				const raw = await ask(rl, prompt + defaultSuffix);
				if (raw === '' && defaultIdx) {
					answers[q.name] = q.choices[defaultIdx - 1];
				} else {
					const idx = parseInt(raw, 10) - 1;
					if (idx >= 0 && idx < q.choices.length) {
						answers[q.name] = q.choices[idx];
					} else {
						answers[q.name] = raw;
					}
				}
			} else {
				// input / password
				const defaultStr = defaultVal !== undefined ? String(defaultVal) : '';
				const suffix = defaultStr ? ` (${defaultStr}) ` : ' ';
				const raw = await ask(rl, prompt + suffix);
				const value = raw === '' ? defaultStr : raw;

				if (q.validate) {
					const validation = q.validate(value);
					if (validation !== true) {
						process.stderr.write(`\n${typeof validation === 'string' ? validation : '输入无效'}\n\n`);
						// Re-ask the same question
						answers[q.name] = await retryAsk(rl, q, value);
					} else {
						answers[q.name] = value;
					}
				} else {
					answers[q.name] = value;
				}
			}
		}
	} finally {
		rl.close();
	}

	return answers;
}

async function retryAsk(rl: readline.Interface, q: WizardQuestion, _prevValue: string): Promise<string> {
	const defaultStr = q.default !== undefined ? String(q.default) : '';
	const suffix = defaultStr ? ` (${defaultStr}) ` : ' ';
	const raw = await ask(rl, q.message + suffix);
	return raw === '' ? defaultStr : raw;
}

export async function confirm(message: string, defaultYes?: boolean): Promise<boolean> {
	if (!isTTY()) return defaultYes ?? false;
	const result = await wizard([{ name: 'confirm', message, type: 'confirm', default: defaultYes }]);
	return Boolean(result.confirm);
}

export async function prompt(message: string, defaultValue?: string): Promise<string> {
	if (!isTTY()) return defaultValue ?? '';
	const result = await wizard([{ name: 'input', message, type: 'input', default: defaultValue }]);
	return String(result.input);
}
