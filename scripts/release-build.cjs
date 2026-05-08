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

const backendBuildResult = spawnSync(process.execPath, [path.join(projectDir, 'scripts', 'build-kugou-api.cjs')], {
  cwd: projectDir,
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
});

if (backendBuildResult.error) {
  console.error('[release-build] Failed to build KuGouMusicApi bundle:', backendBuildResult.error);
  process.exit(1);
}

if (typeof backendBuildResult.status !== 'number') {
  console.error('[release-build] KuGouMusicApi bundle build exited with no status code (likely killed/signaled)');
  process.exit(1);
}

if (backendBuildResult.status !== 0) {
  console.error(`[release-build] KuGouMusicApi bundle build failed with exit code ${backendBuildResult.status}`);
  process.exit(backendBuildResult.status);
}

const npmExecPath = process.env.npm_execpath;
const spawnCmd = npmExecPath ? process.execPath : 'npm';
const spawnArgs = npmExecPath ? [npmExecPath, 'run', 'dist:local'] : ['run', 'dist:local'];
console.log(`[release-build] Running npm run dist:local (version=${nextVersion})`);

const result = spawnSync(spawnCmd, spawnArgs, {
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
