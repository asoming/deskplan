'use strict';
const { spawnSync } = require('node:child_process');
const env = { ...process.env };
// An empty signing secret is not a certificate path. Some builder backends interpret it as cwd.
for (const key of ['CSC_LINK','CSC_KEY_PASSWORD','WIN_CSC_LINK','WIN_CSC_KEY_PASSWORD','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID']) {
  if (env[key] !== undefined && !env[key].trim()) delete env[key];
}
const args = process.argv.slice(2);
if (!args.includes('--publish')) args.push('--publish', 'never');
const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), ...args], { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
