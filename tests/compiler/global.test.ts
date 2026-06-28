import { describe, expect, it } from 'bun:test';
import {
	project,
	resetProject,
	withProject,
	getRawProject,
	createDefaultProject
} from '../../script/compiler/global.ts';
import type { ProjectState } from '../../script/compiler/global.ts';

describe('project DI injection', () => {
	it('should delegate property access through proxy', () => {
		withProject(createDefaultProject(), () => {
			project.srcDir = '/test/src';
			expect(project.srcDir).toBe('/test/src');
		});
		// After withProject, original project is restored
		expect(project.srcDir).not.toBe('/test/src');
	});

	it('should allow isolated project in nested contexts', () => {
		const outer = createDefaultProject();
		outer.srcDir = '/outer';

		const inner = createDefaultProject();
		inner.srcDir = '/inner';

		withProject(outer, () => {
			expect(project.srcDir).toBe('/outer');

			withProject(inner, () => {
				expect(project.srcDir).toBe('/inner');
			});

			expect(project.srcDir).toBe('/outer');
		});
	});

	it('should restore project after exception', () => {
		const temp = createDefaultProject();
		temp.srcDir = '/temp';

		const originalSrcDir = project.srcDir;

		try {
			withProject(temp, () => {
				throw new Error('test error');
			});
		} catch {
			// Expected
		}

		expect(project.srcDir).toBe(originalSrcDir);
	});

	it('should allow resetProject to work within injected project', () => {
		const temp = createDefaultProject();
		temp.srcDir = '/temp-before';
		temp.build_config.config.name = 'temp-name';

		withProject(temp, () => {
			expect(project.build_config.config.name).toBe('temp-name');
			resetProject();
			expect(project.build_config.config.name).toBe('');
		});
	});

	it('should expose raw project for debugging', () => {
		const temp = createDefaultProject();
		withProject(temp, () => {
			expect(getRawProject()).toBe(temp);
		});
	});
});
