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

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'dist:local'], {
  cwd: projectDir,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);