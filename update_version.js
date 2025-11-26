const fs = require('fs');

// Update package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
packageJson.version = '1.01.0';
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
console.log('✓ Updated package.json to v1.01.0');

// Check if there are other version references
const filesToCheck = [
  'src/index.js',
  'src/config/bot.js',
  'README.md'
];

filesToCheck.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    const before = content;
    
    // Replace version patterns
    content = content.replace(/v?1\.00\.[0-9]+/g, 'v1.01.0');
    content = content.replace(/"version":\s*"1\.00\.[0-9]+"/g, '"version": "1.01.0"');
    
    if (content !== before) {
      fs.writeFileSync(file, content);
      console.log(`✓ Updated version references in ${file}`);
    }
  }
});

console.log('\n✓ All version references updated to v1.01.0');
