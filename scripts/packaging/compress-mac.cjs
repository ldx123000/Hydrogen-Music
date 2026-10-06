const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execute = promisify(execFile);

async function compressMacApplication(appPath) {
  const staging = await fs.mkdtemp(path.join(path.dirname(appPath), '.compression-'));
  const compressed = path.join(staging, path.basename(appPath));
  const original = path.join(staging, 'original.app');
  try {
    // ditto preserves signatures, extended attributes, modes and framework symlinks.
    await execute('/usr/bin/ditto', ['--hfsCompression', '--rsrc', '--extattr', appPath, compressed]);
    const framework = await fs.stat(path.join(compressed,
      'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'));
    if (framework.blocks * 512 >= framework.size) {
      throw new Error('macOS application compression failed: build on an APFS or HFS+ volume.');
    }
    await fs.rename(appPath, original);
    try {
      await fs.rename(compressed, appPath);
    } catch (error) {
      await fs.rename(original, appPath);
      throw error;
    }
    console.log(`Transparent compression enabled: ${appPath}`);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  await compressMacApplication(path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`));
}

module.exports = { afterSign, compressMacApplication };
