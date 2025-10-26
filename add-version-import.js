const fs = require('fs');
const path = require('path');

const files = [
  'src/commands/wallet.js',
  'src/commands/start.js',
  'src/commands/help.js',
  'src/commands/hero.js',
  'src/commands/battle.js',
  'src/index.js'
];

const importLine = "const { getBotTitle } = require('../utils/version');";
const indexImportLine = "const { getBotTitle } = require('./utils/version');";

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if import already exists
    if (content.includes("getBotTitle")) {
      console.log(`⏭️  ${file}: Import already exists`);
      return;
    }
    
    // Add import after first require line
    const isIndex = file.includes('index.js');
    const importToAdd = isIndex ? indexImportLine : importLine;
    
    // Find first line with require
    const lines = content.split('\n');
    let insertIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("require(")) {
        insertIndex = i + 1;
        break;
      }
    }
    
    if (insertIndex > 0) {
      lines.splice(insertIndex, 0, importToAdd);
      content = lines.join('\n');
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Added import to ${file}`);
    } else {
      console.log(`⚠️  Could not find insertion point in ${file}`);
    }
  } else {
    console.log(`⚠️  File not found: ${file}`);
  }
});

console.log('\n✨ All imports added!');
