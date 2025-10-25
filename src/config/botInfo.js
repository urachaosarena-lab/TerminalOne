const fs = require('fs');
const path = require('path');

// Read version from VERSION file
const versionPath = path.join(__dirname, '../../VERSION');
let version = 'v0.02';

try {
  version = fs.readFileSync(versionPath, 'utf8').trim();
} catch (error) {
  console.warn('Could not read VERSION file, using default:', version);
}

module.exports = {
  version,
  name: '\ud83e\udd88TerminalOne\ud83e\udd88',
  getTitle: () => `\ud83e\udd88TerminalOne\ud83e\udd88${version}`
};
