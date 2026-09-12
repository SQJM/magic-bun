import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface Template {
  name: string;
  description: string;
  source: 'local' | 'github';
  path?: string;
  tags?: string[];
}

const LOCAL_TEMPLATE_DIR = join(import.meta.dir, '..', '..', 'template');
const DEFAULT_REGISTRY = 'https://github.com';

interface GitHubRawTemplate {
  name: string;
  description: string;
  repo: string;
  tags?: string[];
}

const REMOTE_TEMPLATES: GitHubRawTemplate[] = [
  {
    name: 'magic-starter-web',
    description: 'Magic Web 应用入门模板',
    repo: 'SQJM/magic-starter-web',
    tags: ['web', 'starter']
  },
  {
    name: 'magic-starter-desktop',
    description: 'Magic 桌面应用入门模板 (NW.js)',
    repo: 'SQJM/magic-starter-desktop',
    tags: ['desktop', 'node-webkit', 'starter']
  },
  {
    name: 'magic-starter-module',
    description: 'Magic 模块开发模板',
    repo: 'SQJM/magic-starter-module',
    tags: ['module', 'library']
  }
];

export function listLocalTemplates(): Template[] {
  const templates: Template[] = [];

  if (!existsSync(LOCAL_TEMPLATE_DIR)) return templates;

  const entries = readdirSync(LOCAL_TEMPLATE_DIR);
  for (const entry of entries) {
    const fullPath = join(LOCAL_TEMPLATE_DIR, entry);
    if (statSync(fullPath).isDirectory()) {
      templates.push({
        name: entry,
        description: `本地模板: ${entry}`,
        source: 'local',
        path: fullPath,
        tags: ['local']
      });
    }
  }

  return templates;
}

export function listRemoteTemplates(): Template[] {
  return REMOTE_TEMPLATES.map(t => ({
    name: t.name,
    description: t.description,
    source: 'github' as const,
    path: `${DEFAULT_REGISTRY}/${t.repo}`,
    tags: t.tags
  }));
}

export async function listTemplates(registry?: string): Promise<Template[]> {
  const local = listLocalTemplates();
  const remote = registry ? [] : listRemoteTemplates();

  if (registry) {
    try {
      const url = registry.endsWith('/') ? registry.slice(0, -1) : registry;
      const response = await fetch(`${url}/api/templates`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const data = await response.json() as GitHubRawTemplate[];
        for (const t of data) {
          remote.push({
            name: t.name,
            description: t.description,
            source: 'github',
            path: `${url}/${t.repo}`,
            tags: t.tags
          });
        }
      }
    } catch {
      // 远程注册表不可用,忽略
    }
  }

  return [...local, ...remote];
}

export async function fetchTemplate(name: string, registry?: string): Promise<string> {
  // 先检查本地模板
  const localTemplates = listLocalTemplates();
  const localMatch = localTemplates.find(t => t.name === name);
  if (localMatch && localMatch.path) {
    return localMatch.path;
  }

  // 检查远程模板
  const remoteMatch = REMOTE_TEMPLATES.find(t => t.name === name);
  if (!remoteMatch) {
    throw new Error(`模板 [${name}] 不存在.使用 magic init --list 查看可用模板.`);
  }

  const baseUrl = registry || DEFAULT_REGISTRY;
  const url = `${baseUrl}/${remoteMatch.repo}/archive/main.zip`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`无法获取模板 [${name}]: HTTP ${response.status}`);
  }

  // 下载并解压模板
  const tempDir = join(import.meta.dir, '..', '..', '.magic-temp');
  const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

  const zipPath = join(tempDir, `${name}.zip`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(zipPath, buffer as any);

  // 解压 (Bun 不支持原生解压,使用系统命令)
  const extractDir = join(tempDir, name);
  const { execSync } = await import('node:child_process');
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'ignore' });
  } catch {
    throw new Error(`解压模板 [${name}] 失败.请确保系统支持 PowerShell.`);
  }

  return extractDir;
}
