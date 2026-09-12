import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';

export function mergeConfigs(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(base)) {
    result[key] = base[key];
  }

  for (const key of Object.keys(override)) {
    const baseValue = result[key];
    const overrideValue = override[key];

    if (
      typeof baseValue === 'object' && baseValue !== null && !Array.isArray(baseValue) &&
      typeof overrideValue === 'object' && overrideValue !== null && !Array.isArray(overrideValue)
    ) {
      // 深度合并对象
      result[key] = mergeConfigs(
        baseValue as Record<string, unknown>,
        overrideValue as Record<string, unknown>
      );
    } else {
      // 直接覆盖
      result[key] = overrideValue;
    }
  }

  return result;
}

export function resolveConfigExtends(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }

  const content = readFileSync(configPath, 'utf-8');
  const config = Bun.TOML.parse(content) as Record<string, unknown>;

  const ext = config.extends as string | undefined;
  if (!ext) return config;

  const baseDir = dirname(configPath);
  const resolvedExtPath = isAbsolute(ext) ? ext : resolve(baseDir, ext);

  if (!existsSync(resolvedExtPath)) {
    throw new Error(`继承的配置文件不存在: ${resolvedExtPath}`);
  }

  // 防止循环继承
  const visited = new Set<string>([configPath]);

  function resolveBase(extPath: string): Record<string, unknown> {
    if (visited.has(extPath)) {
      throw new Error(`检测到循环继承: ${extPath}`);
    }
    visited.add(extPath);

    const extContent = readFileSync(extPath, 'utf-8');
    const extConfig = Bun.TOML.parse(extContent) as Record<string, unknown>;

    // 如果基配置也有 extends,先递归解析
    const nestedExt = extConfig.extends as string | undefined;
    if (nestedExt) {
      const nestedPath = isAbsolute(nestedExt)
        ? nestedExt
        : resolve(dirname(extPath), nestedExt);
      const nestedBase = resolveBase(nestedPath);
      // 移除 extends 字段以避免重复处理
      delete extConfig.extends;
      return mergeConfigs(nestedBase, extConfig);
    }

    delete extConfig.extends;
    return extConfig;
  }

  const baseConfig = resolveBase(resolvedExtPath);

  // 合并:基配置 + 子配置覆盖
  delete config.extends;
  return mergeConfigs(baseConfig, config);
}
