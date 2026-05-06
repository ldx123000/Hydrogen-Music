#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectDir, 'package.json');
const nextVersion = process.argv[2];

if (!nextVersion) {
  console.error('Missing next release version.');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageJson.version !== nextVersion) {
  packageJson.version = nextVersion;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

// Newer npm versions no longer export npm-cli.js, so call the platform npm binary directly.
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
console.log(`[release-build] Running: ${npmCommand} run dist:local (version=${nextVersion})`);

const result = spawnSync(npmCommand, ['run', 'dist:local'], {
  cwd: projectDir,
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
});

if (result.error) {
  console.error('[release-build] Failed to spawn dist:local:', result.error);
  process.exit(1);
}

if (typeof result.status !== 'number') {
  console.error('[release-build] dist:local exited with no status code (likely killed/signaled)');
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[release-build] dist:local failed with exit code ${result.status}`);
  process.exit(result.status);
}

console.log('[release-build] dist:local completed successfully');
