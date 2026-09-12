import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.json', '.toml', '.md', '.js', '.ts', '.m', '.css', '.html', '.xml',
  '.txt', '.yml', '.yaml', '.gitignore', '.env', '.jsx', '.tsx',
  '.editorconfig', '.prettierrc', '.eslintrc'
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.bmp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.wav', '.ogg', '.mp4', '.webm',
  '.zip', '.tar', '.gz', '.bz2', '.7z',
  '.db', '.sqlite', '.sqlite3',
  '.lockb', '.wasm'
]);

function isTextFile(filename: string): boolean {
  const lower = filename.toLowerCase();

  // 特殊文件名
  const basename = filename.split('/').pop()?.split('\\').pop() || filename;
  if (basename === '.gitignore' || basename === '.editorconfig' || basename === '.prettierrc' ||
      basename === 'LICENSE' || basename === 'README' || basename === 'Dockerfile') {
    return true;
  }

  for (const ext of BINARY_EXTENSIONS) {
    if (lower.endsWith(ext)) return false;
  }
  for (const ext of TEXT_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }

  // 未知扩展,检查是否有点号
  return !filename.includes('.') || false;
}

export function interpolateTemplate(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export function interpolateDir(dir: string, vars: Record<string, string>): void {
  if (!existsSync(dir)) return;

  const processDir = (currentDir: string) => {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // 递归处理子目录
        processDir(fullPath);
      } else if (stat.isFile() && isTextFile(entry)) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const interpolated = interpolateTemplate(content, vars);
          if (interpolated !== content) {
            writeFileSync(fullPath, interpolated, 'utf-8');
          }
        } catch {
          // 跳过无法读取为文本的文件
        }
      }
    }
  };

  processDir(dir);
}
