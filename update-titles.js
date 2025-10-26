const fs = require('fs');
const path = require('path');

const files = [
  'src/commands/martingale.js',
  'src/commands/wallet.js',
  'src/commands/start.js',
  'src/commands/help.js',
  'src/commands/hero.js',
  'src/index.js'
];

const oldPattern = /🦈 \*\*TerminalOne🦈\*\*/g;
const newReplacement = '${getBotTitle()}';

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const beforeCount = (content.match(oldPattern) || []).length;
    
    content = content.replace(oldPattern, newReplacement);
    
    const afterCount = (content.match(/\$\{getBotTitle\(\)\}/g) || []).length;
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated ${file}: ${beforeCount} occurrences replaced`);
  } else {
    console.log(`⚠️  File not found: ${file}`);
  }
});

console.log('\n✨ All titles updated successfully!');
