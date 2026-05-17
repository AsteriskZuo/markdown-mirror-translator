import { defineConfig } from '@vscode/test-cli';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	launchArgs: [
		'--user-data-dir',
		join(tmpdir(), 'mmt-vscode-test-user-data'),
		'--extensions-dir',
		join(tmpdir(), 'mmt-vscode-test-extensions'),
	],
});
