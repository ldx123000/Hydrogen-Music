#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const defaultWorkflow = 'build-mpv-audio-only.yml';
const defaultArtifact = 'mpv-audio-only-all-platforms';
const platforms = ['win32-x64', 'darwin-arm64', 'linux-x64'];
const artifactByPlatform = Object.freeze({
  'win32-x64': 'mpv-audio-only-win32-x64',
  'darwin-arm64': 'mpv-audio-only-darwin-arm64',
  'linux-x64': 'mpv-audio-only-linux-x64',
});

function parseArgs(argv) {
  const options = {
    workflow: defaultWorkflow,
    artifact: '',
    platform: 'current',
    runId: '',
    repo: '',
    clean: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || '';

    if (arg === '--workflow') options.workflow = next();
    else if (arg === '--artifact') options.artifact = next();
    else if (arg === '--platform') options.platform = next();
    else if (arg === '--current') options.platform = 'current';
    else if (arg === '--run-id') options.runId = next();
    else if (arg === '--repo') options.repo = next();
    else if (arg === '--keep-existing') options.clean = false;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.platform = resolveRequestedPlatform(options.platform);
  options.artifact = options.artifact || resolveArtifactName(options.platform);
  return options;
}

function printHelp() {
  console.log(`Download the latest audio-only MPV GitHub Actions artifact.

Usage:
  node scripts/mpv-audio-only/download-artifacts.cjs
  node scripts/mpv-audio-only/download-artifacts.cjs --platform all
  node scripts/mpv-audio-only/download-artifacts.cjs --platform win32-x64
  node scripts/mpv-audio-only/download-artifacts.cjs --run-id 123456789

Options:
  --repo owner/name        GitHub repository. Defaults to the current git repo.
  --workflow file.yml      Workflow file. Defaults to ${defaultWorkflow}.
  --artifact name          Artifact name. Defaults to ${defaultArtifact}, or the selected platform artifact.
  --platform platform      current, all, win32-x64, darwin-arm64, or linux-x64. Defaults to current.
  --current                Shortcut for --platform current.
  --run-id id              Download a specific workflow run.
  --keep-existing          Copy over existing resources/mpv directories instead of replacing them.
`);
}

function resolveCurrentPlatform() {
  const arch = process.arch === 'x64' || process.arch === 'arm64' ? process.arch : '';
  const platform = arch ? `${process.platform}-${arch}` : process.platform;
  if (platforms.includes(platform)) return platform;
  throw new Error(`Current platform is not supported by this workflow: ${process.platform}-${process.arch}`);
}

function resolveRequestedPlatform(value) {
  const platform = value || 'all';
  if (platform === 'all') return platform;
  if (platform === 'current') return resolveCurrentPlatform();
  if (platforms.includes(platform)) return platform;
  throw new Error(`Unsupported platform "${platform}". Use all, current, ${platforms.join(', ')}.`);
}

function resolveArtifactName(platform) {
  if (platform === 'all') return defaultArtifact;
  return artifactByPlatform[platform];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    throw new Error(stderr || stdout || `${command} ${args.join(' ')} failed`);
  }

  return String(result.stdout || '').trim();
}

function runGh(args, options) {
  return run('gh', args, options);
}

function ensureGhAvailable() {
  try {
    runGh(['--version']);
  } catch (error) {
    throw new Error('GitHub CLI is required. Install it, then run: gh auth login');
  }
}

function resolveRepo(explicitRepo) {
  if (explicitRepo) return explicitRepo;
  return runGh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
}

function resolveRunId(options) {
  if (options.runId) return options.runId;

  const runId = runGh([
    'run',
    'list',
    '--repo',
    options.repo,
    '--workflow',
    options.workflow,
    '--status',
    'success',
    '--limit',
    '1',
    '--json',
    'databaseId',
    '--jq',
    '.[0].databaseId',
  ]);

  if (!runId) {
    throw new Error(`No successful ${options.workflow} run was found. Run the workflow on GitHub Actions first.`);
  }

  return runId;
}

function isInside(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function findSourceRoot(downloadDir, selectedPlatforms) {
  const candidates = [
    path.join(downloadDir, 'resources', 'mpv'),
    path.join(downloadDir, 'mpv'),
    downloadDir,
  ];

  return candidates.find(candidate => selectedPlatforms.every(platform => fs.existsSync(path.join(candidate, platform)))) || '';
}

function hasAnyFile(directoryPath) {
  if (!fs.existsSync(directoryPath)) return false;

  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile()) return true;
    }
  }

  return false;
}

function findPlatformSourceDir(downloadDir, platform, platformMode) {
  const candidates = [
    path.join(downloadDir, 'resources', 'mpv', platform),
    path.join(downloadDir, 'mpv', platform),
    path.join(downloadDir, platform),
  ];

  const platformDirectory = candidates.find(candidate => hasAnyFile(candidate));
  if (platformDirectory) return platformDirectory;
  if (platformMode !== 'all' && hasAnyFile(downloadDir)) return downloadDir;
  return '';
}

function copyDirectory(sourceDir, targetDir, clean) {
  const resourceRoot = path.join(repoRoot, 'resources', 'mpv');
  if (!isInside(resourceRoot, targetDir)) {
    throw new Error(`Refusing to write outside resources/mpv: ${targetDir}`);
  }

  if (clean) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
}

function listFiles(directoryPath) {
  const files = [];
  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  return files.sort();
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  return `${bytes} B`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureGhAvailable();
  options.repo = resolveRepo(options.repo);
  const runId = resolveRunId(options);
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydrogen-mpv-artifacts-'));
  const selectedPlatforms = options.platform === 'all' ? platforms : [options.platform];

  console.log(`Downloading ${options.artifact} from ${options.repo} run ${runId}...`);
  runGh([
    'run',
    'download',
    runId,
    '--repo',
    options.repo,
    '--name',
    options.artifact,
    '--dir',
    downloadDir,
  ], { stdio: 'inherit' });

  const sourceRoot = options.platform === 'all' ? findSourceRoot(downloadDir, selectedPlatforms) : '';
  if (options.platform === 'all' && !sourceRoot) {
    throw new Error(`Downloaded artifact, but no resources/mpv platform directories were found: ${downloadDir}`);
  }

  for (const platform of selectedPlatforms) {
    const sourceDir = options.platform === 'all'
      ? path.join(sourceRoot, platform)
      : findPlatformSourceDir(downloadDir, platform, options.platform);
    if (!sourceDir || !fs.existsSync(sourceDir)) {
      throw new Error(`Artifact is missing ${platform}`);
    }

    const targetDir = path.join(repoRoot, 'resources', 'mpv', platform);
    copyDirectory(sourceDir, targetDir, options.clean);
  }

  fs.rmSync(downloadDir, { recursive: true, force: true });

  console.log('Updated MPV resources:');
  for (const platform of selectedPlatforms) {
    const targetDir = path.join(repoRoot, 'resources', 'mpv', platform);
    for (const filePath of listFiles(targetDir)) {
      const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      console.log(`- ${relativePath} (${formatBytes(fs.statSync(filePath).size)})`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
