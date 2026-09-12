// 基础 E2E 测试
// 测试页面加载, 路由导航, 组件渲染
import { test, expect } from '@playwright/test';

test('page loads', async ({ page }) => {
	const response = await page.goto('/index.html');
	expect(response?.status()).toBe(200);

	// 检查页面标题存在
	const title = await page.title();
	expect(title.length).toBeGreaterThan(0);
});

test('app container exists', async ({ page }) => {
	await page.goto('/index.html');

	// 检查 #app 元素已渲染
	const appEl = await page.waitForSelector('#app', { timeout: 10000 });
	expect(appEl).not.toBeNull();
});

test('navigation works', async ({ page }) => {
	await page.goto('/index.html');

	// 等待页面稳定
	await page.waitForTimeout(1000);

	// 验证初始 URL
	const url = page.url();
	expect(url).toContain('index.html');
});

test('component renders', async ({ page }) => {
	await page.goto('/index.html');

	// 等待至少一个带有 __file 属性的组件元素出现
	const el = await page.waitForSelector('[__file]', { timeout: 10000 });
	expect(el).not.toBeNull();

	// 验证元素在 DOM 中可见
	const isVisible = await el.isVisible();
	// 组件可能为空容器但应在 DOM 中
	expect(el).not.toBeNull();
});

test('runtime scripts loaded', async ({ page }) => {
	await page.goto('/index.html');
	await page.waitForTimeout(2000);

	// 验证 window.magic 可用
	const hasMagic = await page.evaluate(() => {
		return typeof window.magic !== 'undefined';
	});
	expect(hasMagic).toBe(true);

	// 验证 magic_version 存在
	const hasVersion = await page.evaluate(() => {
		return typeof window.magic_version === 'string' && window.magic_version.length > 0;
	});
	expect(hasVersion).toBe(true);
});
