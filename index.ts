import { Command } from 'commander';
import fs from "node:fs";
import path from "node:path";
import { app, MFileTemplate } from "./app.ts";
import { START_TIME, BUILD_TIMER } from './script/compiler/start.ts';
import { BuildProject } from "./script/build-project.ts";
import { createProject } from "./script/create-project.ts";
import { addModule } from "./script/add-module.ts";
import {
	removeGlobalModule,
	updateGlobalModule,
	listModules,
	viewModule,
	outdatedModules,
	removeLocalModule,
	parseModuleSource
} from "./script/module-manager.ts";
import { formatMagicFile } from "./script/format-magic-file.ts";
import { FormatAllProject } from "./script/format-project.ts";
import { printf } from "./script/util/printf.ts";
import { RunProject } from "./script/run-project.ts";
import { completeProject } from "./script/complete-project.ts";
import { listTemplates } from "./script/util/template-market.ts";
import { generatePreset, PRESETS } from "./script/util/preset-examples.ts";
import { lintConfig } from "./script/util/config-lint.ts";
import { migrateFile } from "./script/util/config-migration.ts";
import { logger, LogLevel } from "./script/util/log-level.ts";
import { generateTraceId, setTraceId, getTraceId } from "./script/util/trace-id.ts";
import { colors, disableColor, enableColor } from "./script/util/cli-colors.ts";
import { wizard } from "./script/util/cli-wizard.ts";
import { reportError } from "./script/util/error-report.ts";

const program = new Command();

interface GlobalOpts {
	verbose?: boolean; quiet?: boolean; silent?: boolean; debug?: boolean;
	color?: boolean; noColor?: boolean; traceId?: string; dryRun?: boolean;
}

function applyGlobalOpts(opts: GlobalOpts): void {
	if (opts.verbose || opts.debug) logger.setLevel(LogLevel.DEBUG);
	else if (opts.quiet) logger.setLevel(LogLevel.WARN);
	else if (opts.silent) logger.setLevel(LogLevel.SILENT);
	if (opts.noColor) disableColor();
	else if (opts.color) enableColor();
	if (opts.traceId) setTraceId(opts.traceId);
}

function fail(e: unknown): never {
	console.error(colors.red(String(e)));
	process.exit(1);
}

function welcome(): void {
	generateTraceId();
	printf.log(colors.bold + colors.blue(`Magic v${app.version}`) + colors.reset);
	printf.log(colors.gray(`Trace ID: ${getTraceId()}`));
}

async function buildProject(): Promise<void> {
	const opts = program['opts']() as GlobalOpts;
	applyGlobalOpts(opts);
	welcome();
	await BuildProject({ dryRun: opts.dryRun });
	const elapsed = ((new Date().getTime() - START_TIME) / 1000).toFixed(2);
	printf.log(colors.green('✓ 构建成功 ヾ(๑╹◡╹))'));
	printf.log(`耗时 ${elapsed}(s)`);
	const report = BUILD_TIMER.report();
	if (report) printf.outFile.log(report);
}

process.on('exit', () => {
	if (!printf.isUse) {
		printf.remove();
	}
});

process.on('uncaughtException', (err) => {
	console.error(colors.red(String(err)));
	process.exit(1);
});

process.on('unhandledRejection', (reason) => {
	console.error(colors.red(String(reason)));
	process.exit(1);
});


program.version(app.version);

program
	.name('magic')
	.usage('<command> [options]');

program
	.command('init [name]')
	.option('--list', '列出可用模板')
	.option('--template <name>', '指定模板名称')
	.option('--preset <name>', '使用预置示例模板 (todo/blog/spa)')
	.action(async (...args: unknown[]) => {
		const name = args[0] as string;
		const cmd = args[1] as Record<string, string | boolean>;

		// --list 列出模板
		if (cmd.list) {
			try {
				const templates = await listTemplates();
				if (templates.length === 0) {
					console.log('没有可用模板');
				} else {
					console.log('可用模板:');
					for (const t of templates) {
						const tags = t.tags ? ` [${t.tags.join(', ')}]` : '';
						console.log(`  ${t.name} - ${t.description}${tags} (来源: ${t.source})`);
					}
					console.log('\n预置示例模板 (--preset):');
					for (const [presetName, preset] of Object.entries(PRESETS)) {
						console.log(`  ${presetName} - ${preset.description}`);
					}
				}
				process.exit(0);
			} catch (e) { fail(e); }
		}

		// --preset 模式
		if (cmd.preset) {
			const presetName = cmd.preset as string;
			if (!name) fail(`错误: 使用 --preset 时必须提供项目名称`);
			try {
				const projectPath = path.join(app.project.dir, name);
				if (fs.existsSync(projectPath)) throw `项目目录已存在: ${projectPath}`;
				generatePreset(presetName, projectPath);
				const { interpolateDir } = await import('./script/util/template-interp.ts');
				const year = String(new Date().getFullYear());
				interpolateDir(projectPath, { name, author: process.env.USER || process.env.USERNAME || 'developer', year, description: PRESETS[presetName]?.description || '' });
				printf.outFile.info(colors.green(`预置模板 [${presetName}] 项目 "${name}" 创建成功!`));
				process.exit(0);
			} catch (e) { fail(e); }
		}

		// 无参数时启动交互式向导
		if (!name) {
			try {
				const answers = await wizard([
					{ name: 'name', message: '项目名称:', type: 'input', validate: (v: string) => v.trim() !== '' || '项目名称不能为空' },
				]);
				const projectName = String(answers.name);
				if (projectName.includes('$')) throw `不允许包含特殊符号 $`;
				createProject(projectName);
				printf.outFile.info(colors.green(`项目 "${projectName}" 创建成功`));
				return;
			} catch (e) { fail(e); }
		}

		try {
			if (name.includes("$")) throw `不允许包含特殊符号 $`;
			createProject(name);
		} catch (e) { fail(e); }
	});

program
	.command('build')
	.action(async () => {
		try { await buildProject(); }
		catch (e) { reportError(e as Error, { command: 'build', traceId: getTraceId(), version: app.version }); fail(e); }
	});

program
	.command('run')
	.action(async () => {
		try { await RunProject(); }
		catch (e) {
			reportError(e as Error, { command: 'run', traceId: getTraceId(), version: app.version });
			fail(e);
		}
	});

program
	.command('build-run')
	.action(async () => {
		try { await buildProject(); await RunProject(); }
		catch (e) { reportError(e as Error, { command: 'build-run', traceId: getTraceId(), version: app.version }); fail(e); }
	});

program
	.command('create-m <filename>')
	.action((filename: unknown) => {
		let filenameStr = filename as string;
		try {
			if (!filenameStr) throw '请指定文件名 (用法: magic create-m <filename>)';
			if (filenameStr.includes("$")) throw `不允许包含特殊符号 $`;
			if (!filenameStr.endsWith(".m")) filenameStr += ".m";
			const filePath = path.join(app.project.dir, filenameStr);
			if (fs.existsSync(filePath)) throw `文件已存在 [path:${filePath}]`;
			fs.writeFileSync(filePath, MFileTemplate);
			printf.outFile.info(`创建组件文件 [path:${colors.cyan(filePath)}]`);
		} catch (e) { fail(e); }
	});

program
	.command('format <file>')
	.description('格式化 .m 文件')
	.option('--dry-run', '仅预览不写入文件')
	.action(async (file: unknown, options: { dryRun?: boolean }) => {
		try {
			const filePath = file as string;
			if (!filePath) throw '请指定文件名 (用法: magic format <file.m>)';
			const resolvedPath = path.resolve(app.project.dir, filePath);
			if (!fs.existsSync(resolvedPath)) throw `文件不存在 [path:${resolvedPath}]`;
			if (!resolvedPath.endsWith('.m')) throw '仅支持 .m 文件';

			printf.log(`格式化: ${colors.cyan(resolvedPath)}`);
			const changed = await formatMagicFile(resolvedPath, options.dryRun === true);

			if (options.dryRun) {
				printf.log(changed ? colors.yellow('✓ 将进行格式化') : colors.gray('无需修改'));
			} else if (changed) {
				printf.outFile.info(colors.green('✓ 格式化完成'));
			} else {
				printf.log(colors.gray('无需修改'));
			}
		} catch (e) { fail(e); }
	});

program
	.command('format-all')
	.description('格式化所有 .m 文件')
	.action(async () => {
		try {
			await FormatAllProject();
		} catch (e) {
			reportError(e as Error, { command: 'format-all', traceId: getTraceId(), version: app.version });
			fail(e);
		}
	});

program
	.command('add <source>')
	.option('-g, --global', '全局安装')
	.action(async (source: unknown, options: { global?: boolean }) => {
		try { await addModule(source as string, { global: options.global === true }); }
		catch (e) { fail(e); }
	});

program
	.command('remove [module]')
	.option('-g, --global', '全局移除')
	.action(async (moduleName: unknown, options: { global?: boolean }) => {
		try {
			if (options.global) {
				const parsed = parseModuleSource(moduleName as string);
				if (!parsed) throw `请指定有效的模块名称: @用户名/仓库名`;
				await removeGlobalModule(parsed.user, parsed.repo);
			} else {
				removeLocalModule(moduleName as string);
			}
		} catch (e) { fail(e); }
	});

program
	.command('update [module]')
	.action(async (moduleName: unknown) => {
		try {
			const parsed = parseModuleSource(moduleName as string);
			if (!parsed) throw `请指定有效的模块名称: @用户名/仓库名`;
			await updateGlobalModule(parsed.user, parsed.repo);
		} catch (e) { fail(e); }
	});

program
	.command('list')
	.option('-g, --global', '仅显示全局模块')
	.option('-l, --local', '仅显示本地模块')
	.action(async (options: { global?: boolean; local?: boolean }) => {
		try {
			const g = options.global === true;
			const l = options.local === true;
			await listModules({ global: g || !l, local: l || !g });
		} catch (e) { fail(e); }
	});

program
	.command('view <module>')
	.action(async (moduleName: unknown) => {
		try {
			const parsed = parseModuleSource(moduleName as string);
			if (!parsed) throw `请指定有效的模块名称: @用户名/仓库名`;
			await viewModule(parsed.user, parsed.repo);
		} catch (e) { fail(e); }
	});

program
	.command('outdated')
	.action(async () => {
		try { await outdatedModules(); }
		catch (e) { fail(e); }
	});

program
	.command('complete')
	.option('--fix', '自动修复缺失的文件', true)
	.option('--no-fix', '仅检查不修复')
	.action((options: { fix?: boolean }) => {
		try { completeProject({ fix: options.fix !== false }); }
		catch (e) { fail(e); }
	});

const configCmd = program
	.command('config')
	.description('配置管理 (lint / migrate)');

configCmd
	.command('lint')
	.description('检查 build.toml 配置文件,检测无效/未知字段')
	.action(() => {
		try {
			const filePath = path.join(app.project.dir, 'build.toml');
			const result = lintConfig(filePath);

			console.log(`配置文件: ${result.file}`);
			console.log(`错误: ${result.errors.length} 个, 警告: ${result.warnings.length} 个`);

			for (const err of result.errors) {
				console.log(colors.red(`  [error] ${err.key}: ${err.message}`));
			}
			for (const warn of result.warnings) {
				let msg = `  [warn]  ${warn.key}: ${warn.message}`;
				if (warn.suggestion) msg += ` (${warn.suggestion})`;
				console.log(colors.yellow(msg));
			}

			if (result.errors.length === 0 && result.warnings.length === 0) {
				console.log(colors.green('✓ 配置检查通过,未发现问题'));
			}

			if (result.errors.length > 0) {
				process.exit(1);
			}
		} catch (e) {
			console.error(colors.red(String(e)));
			process.exit(1);
		}
	});

configCmd
	.command('migrate')
	.description('迁移 v1 格式的 build.toml 到 v2 格式')
	.action(() => {
		try {
			const filePath = path.join(app.project.dir, 'build.toml');
			const result = migrateFile(filePath);

			if (!result.migrated) {
				console.log(colors.yellow('配置文件无需迁移'));
				process.exit(0);
			}

			console.log(colors.green('迁移完成!变更记录:'));
			for (const change of result.changes) {
				console.log(`  ${change}`);
			}
		} catch (e) {
			console.error(colors.red(String(e)));
			process.exit(1);
		}
	});

program
	.on('--help', () => { });

// 全局 CLI 选项
program.option('-v, --verbose', '启用详细日志输出 (DEBUG 级别)');
program.option('-q, --quiet', '减少日志输出 (仅 WARN 及以上)');
program.option('--silent', '静默模式 (仅 ERROR)');
program.option('--debug', '启用调试模式 (DEBUG 级别)');
program.option('--no-color', '禁用彩色输出');
program.option('--color', '强制启用彩色输出');
program.option('--trace-id <id>', '自定义 Trace ID');
program.option('--dry-run', '干运行模式 (不写入文件)');

// 在解析前先应用颜色选项(因为 help 等早于 action 触发)
(function preApplyColorOpts() {
	const args = process.argv;
	const noColorIdx = args.indexOf('--no-color');
	const colorIdx = args.indexOf('--color');
	if (noColorIdx > -1 && (colorIdx === -1 || noColorIdx < colorIdx)) {
		disableColor();
	} else if (colorIdx > -1) {
		enableColor();
	}
})();

program.parse(process.argv);
