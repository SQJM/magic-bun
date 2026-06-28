import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';

export function needsMigration(config: Record<string, unknown>): boolean {
  // v1 配置的特征:没有 [config] 节,或者 config 结构扁平
	const hasConfig = 'config' in config;
	const hasBuild = 'build' in config;
	if (!hasBuild) return false;
	if (!hasConfig) return true;

	const buildSection = config.build as Record<string, unknown> | undefined;
	if (!buildSection) return false;
	if ('module' in buildSection) return false;
	if ('platform' in buildSection) return false;
	return true;
}

export function migrate(content: string): { migrated: boolean; result: string; changes: string[] } {
	const changes: string[] = [];
	let config: Record<string, unknown>;
	try { config = JSON.parse(content); }
	catch { return { migrated: false, result: content, changes }; }

	if (!needsMigration(config)) return { migrated: false, result: content, changes };

	if (!('config' in config)) {
		config.config = {};
		changes.push('添加 [config] 节');
	}

	if (!('build' in config)) {
		config.build = {};
		changes.push('添加 [build] 节');
	}

	return { migrated: true, result: JSON.stringify(config, null, 2), changes };
}

export function migrateFile(filePath: string): { migrated: boolean; changes: string[] } {
	if (!existsSync(filePath)) return { migrated: false, changes: [] };
	const content = readFileSync(filePath, 'utf-8');
	const result = migrate(content);
	if (result.migrated) {
		copyFileSync(filePath, filePath + '.bak');
		writeFileSync(filePath, result.result);
	}
	return { migrated: result.migrated, changes: result.changes };
}
