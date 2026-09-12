import { describe, expect, it } from 'bun:test';
import { ProjectBuildConfig, ProjectBuildConfigContrast } from '../../script/util/config-validate.ts';

describe('config-validate (output)', () => {
	const baseToml = {
		config: { name: 't', src: 'app', main: 'index' },
		build: {
			out: 'build',
			model: 'debug',
			module: false,
			incremental: true,
			platform: { target: 'web', config: {} },
			exclude: { dir: [], file: [] },
			optimize: {
				'out-default-theme': true,
				'remove-unused': false,
				'min-code': { js: false, css: false, html: false }
			},
			output: { 'source-map': false, 'chunk-size': 1024 },
			import: { module: [] }
		}
	};

	it('accepts the default output/hmr config', () => {
		expect(ProjectBuildConfigContrast(ProjectBuildConfig.base as unknown as Record<string, unknown>, baseToml as unknown as Record<string, unknown>)).toBe(true);
	});

	it('rejects non-numeric chunk-size', () => {
		const t = structuredClone(baseToml);
		(t.build.output as { 'chunk-size': unknown })['chunk-size'] = 'big';
		expect(() => ProjectBuildConfigContrast(ProjectBuildConfig.base as unknown as Record<string, unknown>, t as unknown as Record<string, unknown>)).toThrow(/build\.output\.chunk-size/);
	});

	it('accepts chunk-size undefined (fallback to 1MB default)', () => {
		const t = structuredClone(baseToml);
		delete (t.build.output as { 'chunk-size'?: number })['chunk-size'];
		expect(ProjectBuildConfigContrast(ProjectBuildConfig.base as unknown as Record<string, unknown>, t as unknown as Record<string, unknown>)).toBe(true);
	});
});

