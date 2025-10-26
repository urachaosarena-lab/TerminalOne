const fs = require('fs');
const path = require('path');

let cachedVersion = null;

/**
 * Get the current bot version from VERSION file
 */
function getVersion() {
  if (cachedVersion) {
    return cachedVersion;
  }
  
  try {
    const versionPath = path.join(__dirname, '../../VERSION');
    const versionContent = fs.readFileSync(versionPath, 'utf8').trim();
    cachedVersion = versionContent;
    return cachedVersion;
  } catch (error) {
    console.error('Failed to read VERSION file:', error);
    return 'v0.06'; // Fallback
  }
}

/**
 * Get formatted title with version
 * @param {string} context - Optional context (e.g., 'Martingale', 'Hero')
 */
function getBotTitle(context = '') {
  const version = getVersion();
  if (context) {
    return `🦈 **TerminalOne ${version}** - ${context}`;
  }
  return `🦈 **TerminalOne ${version}**`;
}

module.exports = { getVersion, getBotTitle };
