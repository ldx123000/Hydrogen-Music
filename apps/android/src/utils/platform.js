// src/utils/platform.js
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';
const isDevelopment = process.env.NODE_ENV === 'development';

const isCreateTray = isWindows || isLinux || isDevelopment;
const isCreateMpris = isLinux;

module.exports = {
  isWindows,
  isMac,
  isLinux,
  isDevelopment,
  isCreateTray,
  isCreateMpris
};
