import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			'no-unused-vars': 'warn',
			'no-console': 'off',
			'indent': ['error', 'tab'],
			'no-tabs': 'off',
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
		}
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			'no-unused-vars': 'warn',
			'no-console': 'off',
			'indent': ['error', 'tab'],
			'no-tabs': 'off'
		}
	},
	{
		ignores: ['node_modules/**', 'dist/**', 'output/**', '*.min.js']
	}
);
