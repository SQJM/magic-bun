export function envsubst(value: string, env?: Record<string, string>): string {
  const envSource = env || (process.env as Record<string, string>);

  // 替换 ${VAR_NAME:-default}
  let result = value.replace(/\$\{(\w+):-\s*([^}]*)\}/g, (_, varName: string, defaultValue: string) => {
    const envValue = envSource[varName];
    return envValue !== undefined ? envValue : defaultValue;
  });

  // 替换 ${VAR_NAME}
  result = result.replace(/\$\{(\w+)\}/g, (_, varName: string) => {
    const envValue = envSource[varName];
    if (envValue === undefined) {
      throw new Error(`环境变量 ${varName} 未设置,也没有默认值`);
    }
    return envValue;
  });

  return result;
}

export function envsubstConfig(config: Record<string, unknown>, env?: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      // 只对字符串值进行替换
      if (value.includes('${')) {
        result[key] = envsubst(value, env);
      } else {
        result[key] = value;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // 递归处理嵌套对象
      result[key] = envsubstConfig(value as Record<string, unknown>, env);
    } else if (Array.isArray(value)) {
      // 处理数组中的字符串
      result[key] = value.map(item => {
        if (typeof item === 'string' && item.includes('${')) {
          return envsubst(item, env);
        }
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return envsubstConfig(item as Record<string, unknown>, env);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }

  return result;
}
