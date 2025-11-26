const fs = require('fs');

let content = fs.readFileSync('src/services/HeroService.js', 'utf8');

// Fix 1: Change energy recharge from 60min to 30min
content = content.replace(
  /const hoursSinceLastRecharge = \(now - hero\.lastEnergyRecharge\) \/ \(1000 \* 60 \* 60\);/,
  'const halfHoursSinceLastRecharge = (now - hero.lastEnergyRecharge) / (1000 * 60 * 30);'
);

content = content.replace(
  /const energyToAdd = Math\.floor\(hoursSinceLastRecharge\);/,
  'const energyToAdd = Math.floor(halfHoursSinceLastRecharge);'
);

// Fix 2: Add maxEnergy migration to loadHeroesFromFile
const loadMethodStart = content.indexOf('Object.entries(heroes).forEach(([userId, heroData]) => {');
const insertPoint = content.indexOf('          [\'class\', \'weapon\', \'pet\'].forEach(type => {');

if (insertPoint > loadMethodStart) {
  const migrationCode = `          // Migrate maxEnergy from 3 to 5
          if (heroData.maxEnergy === 3) {
            heroData.maxEnergy = 5;
            migrationCount++;
            logger.info(\`Upgraded maxEnergy 3->5 for user \${userId}\`);
          }
          
          `;
  
  content = content.slice(0, insertPoint) + migrationCode + content.slice(insertPoint);
}

fs.writeFileSync('src/services/HeroService.js', content);
console.log('✓ Fixed energy recharge (30min) and added maxEnergy migration');
