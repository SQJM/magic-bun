class Type<T> {
	key: boolean;
	type: string;
	scope: T[] | undefined;

	constructor(type: string, key: boolean = true, scope?: T[]) {
		this.key = key;
		this.type = type;
		this.scope = scope;
	}

	getScope(): T[] | false {
		if (Array.isArray(this.scope)) {
			return this.scope;
		}
		return false;
	}

	getType(): string {
		return this.type;
	}

	isKey(): boolean {
		return this.key;
	}
}

const _base = {
	config: {
		name: new Type<string>('string'),
		src: new Type<string>('string'),
		main: new Type<string>('string')
	},
	build: {
		out: new Type<string>('string'),
		model: new Type<string>('string', true, ['debug', 'release']),
		module: new Type<boolean>('boolean', false, [true, false]),
		'module-src': new Type<string>('string', false),
		'module-out': new Type<string>('string', false),
		incremental: new Type<boolean>('boolean', false, [true, false]),
		'dry-run': new Type<boolean>('boolean', false, [true, false]),
		'front-run': new Type<string[]>('array', false),
		'back-run': new Type<string[]>('array', false),
		exclude: {
			dir: new Type<string[]>('array', false),
			file: new Type<string[]>('array', false)
		},
		optimize: {
			'out-default-theme': new Type<boolean>('boolean', false, [true, false]),
			'remove-unused': new Type<boolean>('boolean', false, [true, false]),
			'min-code': {
				js: new Type<boolean>('boolean', false, [true, false]),
				css: new Type<boolean>('boolean', false, [true, false]),
				html: new Type<boolean>('boolean', false, [true, false])
			}
		},
		output: {
			'source-map': new Type<boolean>('boolean', false, [true, false]),
			'chunk-size': new Type<number>('number', false)
		},
		import: {
			module: new Type<string[]>('array', false)
		}
	},
	dev: {
		server: {
			port: new Type<number>('number'),
			host: new Type<string>('string')
		}
	}
};

const web = {
	..._base,
	build: {
		..._base.build
	}
};

export const ProjectBuildConfig = {
	base: _base,
	web
};

export function ProjectBuildConfigContrast(base: Record<string, unknown>, target: Record<string, unknown>): boolean {
	function it(obj: Record<string, unknown>, t: Record<string, unknown>, keyPath: string = ''): void {
		for (const objKey in obj) {
			const objValue = obj[objKey];
			const tValue = t[objKey];
			const fullKey = keyPath ? `${keyPath}.${objKey}` : objKey;

			if (t && typeof t === 'object' && objKey in t) {
				if (typeof objValue === 'object' && objValue !== null && !(objValue instanceof Type)) {
					it(objValue as Record<string, unknown>, tValue as Record<string, unknown>, fullKey);
					continue;
				}

				const type = (objValue as Type<unknown>).getType();
				let typeError = false;

				if (type === 'array') {
					typeError = !Array.isArray(tValue);
				} else if (type === 'string' || type === 'number' || type === 'boolean') {
					typeError = typeof tValue !== type;
				}

				if (typeError) {
					throw new Error(`配置项 [${fullKey}] 的值 [${tValue}] 类型错误, 期望类型为 ${type}`);
				} else {
					const result = (objValue as Type<unknown>).getScope();
					if (result) {
						if (!result.includes(tValue)) {
							throw new Error(`配置项 [${fullKey}] 的值 [${tValue}] 不在允许范围内, 允许值: ${result.join(',')}`);
						}
					}
				}
			} else {
				if (typeof objValue === 'object' && objValue !== null && !(objValue instanceof Type)) {
					it(objValue as Record<string, unknown>, {} as Record<string, unknown>, fullKey);
				} else if ((objValue as Type<unknown>).isKey()) {
					throw new Error(`缺少必要的配置项 [${fullKey}], 请检查 build.toml 配置文件`);
				}
			}
		}
	}

	it(base, target);
	return true;
}
