import { defineConfig } from '@playwright/test';
export default defineConfig({
	testDir: './tests/e2e',
	timeout: 30000,
	use: {
		baseURL: 'http://localhost:3000',
		headless: true,
	},
	webServer: {
		command: 'bun run script/run-project.ts',
		port: 3000,
		reuseExistingServer: true,
		timeout: 60000,
	},
});
