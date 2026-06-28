import { app } from '../../app.ts';

export const macro: Record<string, string> = {
	$MAGIC_RUN_DIR: app.runDir,
	$PROJECT_RUN_DIR: app.project.dir
};
