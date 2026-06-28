import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

if (!Bun) {
	throw `不是 Bun 环境,无法使用!`;
}

const __filename = fileURLToPath(import.meta.url);
const runDir = path.dirname(__filename) + path.sep;

export interface AppTemplate {
    path: string;
    get: (fileName: string) => string;
    getAsync: (fileName: string) => Promise<string>;
}

export interface AppConfig {
    version: string;
    runDir: string;
    templateDir: {
        runtime: AppTemplate;
        platformConfig: AppTemplate;
        projectBase: AppTemplate;
    };
    project: {
        dir: string;
    };
}

const packageJson = readFileSync(path.join(runDir, "package.json"), 'utf-8');
const App: Omit<AppConfig, 'templateDir'> & { templateDir: Record<string, { path: string }> } = {
    version: JSON.parse(packageJson).version,
    runDir: runDir,
    templateDir: {
        runtime: { path: path.join(runDir, "template/runtime/") },
        platformConfig: { path: path.join(runDir, "template/platform-config/") },
        projectBase: { path: path.join(runDir, "template/project-base/") }
    },
    project: {
        dir: process.cwd() + path.sep
    }
};

function read(filePath: string): string {
    return readFileSync(filePath, 'utf-8');
}

async function readAsync(filePath: string): Promise<string> {
    return await Bun.file(filePath).text();
}

const makeTemplate = (basePath: string): AppTemplate => ({
    path: basePath,
    get: (fileName: string) => read(path.join(basePath, fileName)),
    getAsync: async (fileName: string) => readAsync(path.join(basePath, fileName))
});

export const app: AppConfig = {
    ...App,
    templateDir: {
        runtime: makeTemplate(App.templateDir.runtime.path),
        platformConfig: makeTemplate(App.templateDir.platformConfig.path),
        projectBase: makeTemplate(App.templateDir.projectBase.path)
    }
};

export const MFileTemplate: string = `<import root="">
</import>

<template>
	<div #id="view"></div>
</template>

<script code="global">
    const {
        $view
    } = $id()
</script>

<script code="listen">
</script>

<script code="event">
</script>

<script code="component-event">
	created = () => {}
	destroy = () => {}
	visibleChange = (visible) => {}
</script>

<script>
</script>

<script code="interface">
</script>

<css scope="#id:view" default-theme>
	& {}
</css>

<css scope="#id:view">
	& {}
</css>
`;