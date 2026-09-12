import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import { app, MFileTemplate } from '../app.ts';
import { interpolateDir } from './util/template-interp.ts';

function isValidProjectName(name: string): boolean {
	const p = os.platform();
	if (p === 'win32') {
		if (/[<>:"/\\|?*$]/.test(name)) return false;
	} else {
		if (/[/]/.test(name)) return false;
	}
	if (name.startsWith('.') || name === '') return false;
	return true;
}

export function createProject(name: string): void {
	if (!isValidProjectName(name)) {
		throw new Error(`项目名称包含非法字符: ${name}`);
	}

	const projectPath = path.join(app.project.dir, name);
	fs.mkdirSync(projectPath, { recursive: true });
	fs.mkdirSync(path.join(projectPath, 'app'), { recursive: true });

	let data = app.templateDir.projectBase.get('build.toml');
	data = data.replaceAll('$name', name).replace('module = false', 'module = true');
	fs.writeFileSync(path.join(projectPath, 'build.toml'), data);

	let data2 = app.templateDir.projectBase.get('app.xml');
	data2 = data2.replace('$name', name);
	fs.writeFileSync(path.join(projectPath, 'app', 'app.xml'), data2);

	fs.writeFileSync(path.join(projectPath, 'app', 'index.m'), MFileTemplate);

	// 变量插值:替换 {{name}} {{author}} {{year}} 等占位符
	const year = String(new Date().getFullYear());
	interpolateDir(projectPath, {
		name,
		author: process.env.USER || process.env.USERNAME || 'developer',
		year,
		description: ''
	});
}
