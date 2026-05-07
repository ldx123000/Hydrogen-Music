#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectDir = path.resolve(__dirname, '..');
const apiRoot = path.resolve(projectDir, '..', 'KuGouMusicApi');
const nodeModulesDir = path.join(apiRoot, 'node_modules');
const esbuildBin = path.join(nodeModulesDir, 'esbuild', 'bin', 'esbuild');
const outRoot = path.join(apiRoot, 'bin', 'api_js');

function runEsbuild(args) {
  const result = spawnSync(process.execPath, [esbuildBin, ...args], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status !== 'number') {
    throw new Error('esbuild exited without a status code');
  }

  if (result.status !== 0) {
    throw new Error(`esbuild failed with exit code ${result.status}`);
  }
}

function buildDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    runEsbuild([
      sourcePath,
      '--bundle',
      '--minify',
      '--platform=node',
      '--outfile=' + targetPath,
    ]);
  }
}

if (!fs.existsSync(esbuildBin)) {
  console.error(`[build-kugou-api] Missing esbuild binary: ${esbuildBin}`);
  process.exit(1);
}

fs.mkdirSync(path.join(outRoot, 'util'), { recursive: true });
fs.mkdirSync(path.join(outRoot, 'module'), { recursive: true });

runEsbuild([
  path.join(apiRoot, 'index.js'),
  '--bundle',
  '--minify',
  '--platform=node',
  '--outfile=' + path.join(outRoot, 'app.js'),
]);

buildDirectory(path.join(apiRoot, 'util'), path.join(outRoot, 'util'));
buildDirectory(path.join(apiRoot, 'module'), path.join(outRoot, 'module'));

console.log('[build-kugou-api] KuGouMusicApi JS bundle completed');
