import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const MAGIC_HOME = process.env.MAGIC_HOME || join(homedir(), '.magic');
const CONFIG_PATH = join(MAGIC_HOME, 'config.json');
const CACHE_DIR = join(MAGIC_HOME, 'cache');
const AUDIT_LOG = join(MAGIC_HOME, 'audit.log');
const REGISTRY_DIR = join(MAGIC_HOME, 'magic-module');

const DEFAULTS = {
  registry: 'https://github.com',
  proxy: null,
  concurrency: 4,
  retry: 3,
  timeout: 30000,
  cache: true,
  audit: true,
  integrity: 'required',
  lockfileVersion: 2,
  updateChannel: 'latest'
};

function ensureHome() {
  if (!existsSync(MAGIC_HOME)) mkdirSync(MAGIC_HOME, { recursive: true });
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  if (!existsSync(REGISTRY_DIR)) mkdirSync(REGISTRY_DIR, { recursive: true });
}

let memCache = null;

export function getConfigPath() { return CONFIG_PATH; }
export function getMagicHome() { return MAGIC_HOME; }
export function getCacheDir() { return CACHE_DIR; }
export function getAuditLogPath() { return AUDIT_LOG; }
export function getRegistryDir() { return REGISTRY_DIR; }

export function loadConfig() {
  ensureHome();
  if (memCache) return memCache;
  let user = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      user = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
      user = {};
    }
  }
  const env = {
    registry: process.env.MAGIC_REGISTRY,
    proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.magic_proxy
  };
  const merged = { ...DEFAULTS, ...user };
  for (const k of Object.keys(env)) {
    if (env[k] != null && env[k] !== '') merged[k] = env[k];
  }
  memCache = merged;
  return merged;
}

export function saveConfig(patch) {
  ensureHome();
  const cur = loadConfig();
  const next = { ...cur, ...patch };
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  memCache = null;
  return loadConfig();
}

export function get(key) {
  return loadConfig()[key];
}

export function set(key, value) {
  return saveConfig({ [key]: value });
}

export function unset(key) {
  ensureHome();
  const cur = loadConfig();
  delete cur[key];
  writeFileSync(CONFIG_PATH, JSON.stringify(cur, null, 2));
  memCache = null;
  return loadConfig();
}

export function reset() {
  ensureHome();
  writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
  memCache = null;
  return loadConfig();
}

export function list() {
  return loadConfig();
}
