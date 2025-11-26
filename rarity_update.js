const fs = require('fs');

// Read HeroService.js
let content = fs.readFileSync('src/services/HeroService.js', 'utf8');

// Replace loadHeroesFromFile method
content = content.replace(
  /  loadHeroesFromFile\(\) \{[\s\S]*?^  \}/m,
  `  loadHeroesFromFile() {
    try {
      if (fs.existsSync(this.heroStoragePath)) {
        const data = fs.readFileSync(this.heroStoragePath, 'utf8');
        const heroes = JSON.parse(data);
        
        const REMOVED_ITEMS = {
          class: { '👷': true, '🦹': true, '🕵️': true },
          weapon: { '🦴': true },
          pet: { '🦙': true }
        };
        
        const VALID_ITEMS = {
          class: ['💂', '🧝', '🧙', '🧚', '🧞', '🧛'],
          weapon: ['🏹', '🔨', '🪓', '🗡️', '⚔️', '🔫'],
          pet: ['🕷️', '🦎', '🐍', '🐙', '🐋', '🐂', '🐻', '🐐', '🦉', '🐕', '🐈']
        };
        
        let migrationCount = 0;
        
        Object.entries(heroes).forEach(([userId, heroData]) => {
          ['class', 'weapon', 'pet'].forEach(type => {
            if (heroData.equipped && heroData.equipped[type]) {
              const equipped = heroData.equipped[type];
              
              if (typeof equipped === 'string') {
                if (REMOVED_ITEMS[type] && REMOVED_ITEMS[type][equipped]) {
                  const randomItem = VALID_ITEMS[type][Math.floor(Math.random() * VALID_ITEMS[type].length)];
                  heroData.equipped[type] = { id: randomItem, rarity: 'common' };
                  migrationCount++;
                  logger.info(\`Replaced removed \${type} \${equipped} with \${randomItem} for user \${userId}\`);
                } else {
                  heroData.equipped[type] = { id: equipped, rarity: 'common' };
                }
              } else if (equipped && typeof equipped === 'object') {
                if (REMOVED_ITEMS[type] && REMOVED_ITEMS[type][equipped.id]) {
                  const randomItem = VALID_ITEMS[type][Math.floor(Math.random() * VALID_ITEMS[type].length)];
                  heroData.equipped[type] = { id: randomItem, rarity: equipped.rarity || 'common' };
                  migrationCount++;
                  logger.info(\`Replaced removed \${type} \${equipped.id} with \${randomItem} for user \${userId}\`);
                }
              }
            }
          });
          
          if (heroData.inventory && Array.isArray(heroData.inventory)) {
            heroData.inventory = heroData.inventory.map(item => {
              if (REMOVED_ITEMS[item.type] && REMOVED_ITEMS[item.type][item.id]) {
                const randomItem = VALID_ITEMS[item.type][Math.floor(Math.random() * VALID_ITEMS[item.type].length)];
                migrationCount++;
                logger.info(\`Replaced inventory \${item.type} \${item.id} with \${randomItem} for user \${userId}\`);
                return { ...item, id: randomItem };
              }
              return item;
            });
          }
          
          this.heroes.set(userId, heroData);
        });
        
        if (migrationCount > 0) {
          logger.info(\`Migrated \${migrationCount} items total\`);
          this.saveHeroesToFile();
        }
        
        logger.info(\`Loaded \${this.heroes.size} heroes from storage\`);
      }
    } catch (error) {
      logger.error('Failed to load heroes:', error);
    }
  }`
);

// Replace equipItem method
content = content.replace(
  /  equipItem\(userId, inventoryIndex\) \{[\s\S]*?return \{ success: true, item \};[\s\S]*?^  \}/m,
  `  equipItem(userId, inventoryIndex) {
    userId = String(userId);
    const hero = this.getHero(userId);
    if (!hero || inventoryIndex >= hero.inventory.length) {
      return { success: false, error: 'Invalid item index' };
    }
    
    const item = hero.inventory[inventoryIndex];
    
    if (hero.equipped[item.type]) {
      const oldEquipped = hero.equipped[item.type];
      const oldItemId = typeof oldEquipped === 'string' ? oldEquipped : oldEquipped.id;
      const oldItemRarity = typeof oldEquipped === 'object' ? oldEquipped.rarity : 'common';
      
      hero.inventory.push({
        type: item.type,
        id: oldItemId,
        rarity: oldItemRarity,
        addedAt: Date.now()
      });
    }
    
    hero.equipped[item.type] = { id: item.id, rarity: item.rarity };
    hero.inventory.splice(inventoryIndex, 1);
    this.saveHeroesToFile();
    
    return { success: true, item };
  }`
);

// Replace unequipItem method
content = content.replace(
  /  \/\/ Unequip item[\s\S]*?unequipItem\(userId, itemType\) \{[\s\S]*?return \{ success: true \};[\s\S]*?^  \}/m,
  `  // Unequip item
  unequipItem(userId, itemType) {
    userId = String(userId);
    const hero = this.getHero(userId);
    if (!hero || !hero.equipped[itemType]) {
      return { success: false, error: 'No item equipped' };
    }
    
    const equipped = hero.equipped[itemType];
    const itemId = typeof equipped === 'string' ? equipped : equipped.id;
    const itemRarity = typeof equipped === 'object' ? equipped.rarity : 'common';
    
    this.addItem(userId, itemType, itemId, itemRarity);
    hero.equipped[itemType] = null;
    this.saveHeroesToFile();
    return { success: true };
  }`
);

fs.writeFileSync('src/services/HeroService.js', content);
console.log('✓ Updated HeroService.js');

// Update hero.js  
let heroJs = fs.readFileSync('src/commands/hero.js', 'utf8');

// Find and replace the equipped items display (lines 65-67)
const heroLines = heroJs.split('\n');
for (let i = 0; i < heroLines.length; i++) {
  if (heroLines[i].includes('const equippedClass = hero.equipped.class ?')) {
    // Insert helper functions before equipped declarations
    heroLines.splice(i, 0,
      '  const getEquippedId = (equipped) => typeof equipped === \'string\' ? equipped : (equipped ? equipped.id : null);',
      '  const getEquippedRarity = (equipped) => typeof equipped === \'object\' && equipped.rarity ? equipped.rarity : \'common\';',
      '  const raritySymbols = { common: \'⚪️\', rare: \'🔵\', legendary: \'🟠\' };',
      ''
    );
    // Update the three equipped lines
    heroLines[i + 4] = '  const equippedClass = hero.equipped.class ? `${getEquippedId(hero.equipped.class)} ${CLASSES[getEquippedId(hero.equipped.class)].name} ${raritySymbols[getEquippedRarity(hero.equipped.class)]}` : \'❌ None\';';
    heroLines[i + 5] = '  const equippedWeapon = hero.equipped.weapon ? `${getEquippedId(hero.equipped.weapon)} ${WEAPONS[getEquippedId(hero.equipped.weapon)].name} ${raritySymbols[getEquippedRarity(hero.equipped.weapon)]}` : \'❌ None\';';
    heroLines[i + 6] = '  const equippedPet = hero.equipped.pet ? `${getEquippedId(hero.equipped.pet)} ${PETS[getEquippedId(hero.equipped.pet)].name} ${raritySymbols[getEquippedRarity(hero.equipped.pet)]}` : \'❌ None\';';
    break;
  }
}
heroJs = heroLines.join('\n');

fs.writeFileSync('src/commands/hero.js', heroJs);
console.log('✓ Updated hero.js');

// Update BattleService.js
let battleJs = fs.readFileSync('src/services/BattleService.js', 'utf8');

battleJs = battleJs.replace(
  /  getHeroAbilities\(hero\) \{[\s\S]*?return abilities\.length > 0[\s\S]*?\];/,
  `  getHeroAbilities(hero) {
    const abilities = [];
    
    const getEquippedId = (equipped) => typeof equipped === 'string' ? equipped : (equipped ? equipped.id : null);
    
    const classId = getEquippedId(hero.equipped.class);
    const weaponId = getEquippedId(hero.equipped.weapon);
    
    if (classId && CLASSES[classId]) {
      abilities.push(CLASSES[classId].ability);
    }
    if (weaponId && WEAPONS[weaponId]) {
      abilities.push(WEAPONS[weaponId].ability);
    }
    
    return abilities.length > 0 ? abilities : [
      { name: 'Punch', dmg: [5, 15], target: 'single', desc: '5-15 damage' }
    ];`
);

battleJs = battleJs.replace(
  /  executeDamageAbility\(battle, attacker, ability, targets\) \{[\s\S]*?const baseDamage = Math\.floor.*\n    \n    \/\/ Apply strength bonus/,
  `  executeDamageAbility(battle, attacker, ability, targets) {
    const [minDmg, maxDmg] = ability.dmg;
    let baseDamage = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
    
    // Apply rarity multiplier for hero equipped items
    if (attacker.userId && attacker.equipped) {
      const getEquippedRarity = (equipped) => {
        if (typeof equipped === 'object' && equipped.rarity) return equipped.rarity;
        return 'common';
      };
      
      const RARITY_MULTIPLIERS = { common: 1.0, rare: 1.25, legendary: 1.5 };
      
      const classRarity = attacker.equipped.class ? getEquippedRarity(attacker.equipped.class) : 'common';
      const weaponRarity = attacker.equipped.weapon ? getEquippedRarity(attacker.equipped.weapon) : 'common';
      
      const maxMultiplier = Math.max(RARITY_MULTIPLIERS[classRarity] || 1.0, RARITY_MULTIPLIERS[weaponRarity] || 1.0);
      baseDamage = Math.floor(baseDamage * maxMultiplier);
    }
    
    // Apply strength bonus`
);

fs.writeFileSync('src/services/BattleService.js', battleJs);
console.log('✓ Updated BattleService.js');

console.log('\nAll files updated successfully!');
