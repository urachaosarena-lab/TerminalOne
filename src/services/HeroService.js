const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Item definitions
const CLASSES = {
   ' 💂 ' : { name:  ' Guard ' , ability: { name:  ' Shield ' , effect:  ' shield ' , dmg: [4, 20], desc:  ' Apply a 4-20 🛡️shield to you and your allies for 2 turns '  }},
   ' 🧝 ' : { name:  ' Elf ' , ability: { name:  ' Nature Breeze ' , effect:  ' heal ' , value: 30, desc:  ' Heal 30HP to an ally or yourself '  }},
   ' 🧙 ' : { name:  ' Wizard ' , ability: { name:  ' Fireball ' , effect:  ' damage ' , dmg: [15, 40], target:  ' two ' , desc:  ' Deal 15-40 damage to a maximum of 2 random enemies '  }},
   ' 🧚 ' : { name:  ' Fairy ' , ability: { name:  ' Dispel ' , effect:  ' teamHeal ' , dmg: [2, 12], desc:  ' Heal you and your allies for 2-12 '  }},
   ' 🧞 ' : { name:  ' Genie ' , ability: { name:  ' Wish ' , effect:  ' revive ' , value: 0.5, desc:  ' 50% chance to revive a fallen ally with 50% HP '  }},
   ' 🧛 ' : { name:  ' Vampire ' , ability: { name:  ' Life Drain ' , effect:  ' drain ' , dmg: [8, 14], desc:  ' Deal 10-20 damage to all enemies and heal for 25% of the amount dealt '  }}
};

const WEAPONS = {
   ' 🏹 ' : { name:  ' Bow ' , ability: { name:  ' Pierce Shot ' , dmg: [5, 50], target:  ' single ' , desc:  ' 5-50 damage to one enemy '  }},
   ' 🔨 ' : { name:  ' Hammer ' , ability: { name:  ' Ground Slam ' , dmg: [5, 20], target:  ' all ' , desc:  ' 5-20 damage to all enemies '  }},
   ' 🪓 ' : { name:  ' Axe ' , ability: { name:  ' Cleave ' , dmg: [20, 35], target:  ' single ' , desc:  ' 20-35 damage to one enemy '  }},
   ' 🗡️ ' : { name:  ' Sword ' , ability: { name:  ' Slash ' , dmg: [15, 40], target:  ' single ' , desc:  ' 15-40 damage to one enemy '  }},
   ' ⚔️ ' : { name:  ' Dual Swords ' , ability: { name:  ' Double Strike ' , dmg: [12, 25], target:  ' two ' , desc:  ' 12-25 damage to two random enemies '  }},
   ' 🔫 ' : { name:  ' Gun ' , ability: { name:  ' Rapid Fire ' , dmg: [10, 15], target:  ' all ' , desc:  ' 10-15 damage to all enemies '  }}
};

const PETS = {
   ' 🕷️ ' : { name:  ' Spider ' , ability: { name:  ' Web Trap ' , effect:  ' stun ' , value: 0.3, desc:  ' +30% ✨stun chance '  }},
   ' 🦎 ' : { name:  ' Lizard ' , ability: { name:  ' Regeneration ' , effect:  ' regen ' , value: 5, desc:  ' Heal 5HP per turn '  }},
   ' 🐍 ' : { name:  ' Snake ' , ability: { name:  ' Bite ' , effect:  ' bleed ' , value: 0.3, desc:  ' +30% 🩸bleed chance '  }},
   ' 🐙 ' : { name:  ' Octopus ' , ability: { name:  ' Ink Cloud ' , effect:  ' dodge ' , value: 0.2, desc:  ' +20% dodge chance '  }},
   ' 🐋 ' : { name:  ' Whale ' , ability: { name:  ' Tidal Wave ' , effect:  ' splash ' , value: 0.3, desc:  ' +30% splash damage '  }},
   ' 🐂 ' : { name:  ' Bull ' , ability: { name:  ' Rage ' , effect:  ' rage ' , value: 2, desc:  ' +2 bonus damage accumulation per turn '  }},
   ' 🐻 ' : { name:  ' Bear ' , ability: { name:  ' Thick Fur ' , effect:  ' defense ' , value: 0.08, desc:  ' Reduce damage taken by 8% '  }},
   ' 🐐 ' : { name:  ' Goat ' , ability: { name:  ' Headbutt ' , effect:  ' damage ' , value: 0.5, dmg: 10, desc:  ' 50% chance to do 10 bonus damage '  }},
   ' 🦉 ' : { name:  ' Owl ' , ability: { name:  ' Wisdom ' , effect:  ' wisdom ' , value: 0.5, desc:  ' Healing effects are increased by 50% '  }},
   ' 🐕 ' : { name:  ' Dog ' , ability: { name:  ' Loyalty ' , effect:  ' bite ' , dmg: [5, 30], desc:  ' 5-30 damage on a random enemy '  }},
   ' 🐈 ' : { name:  ' Cat ' , ability: { name:  ' Nine Lives ' , effect:  ' survival ' , value: 0.5, desc:  ' 50% chance to survive fatal damage '  }}
};


// Canonical ID normalization utility
function normalizeId(id) {
  if (!id) return '';
  return String(id)
    .normalize('NFKC')           // Normalize Unicode
    .replace(/️/g, '')      // Remove variation selector 16
    .replace(/‍/g, '')      // Remove zero-width joiner
    .trim();                      // Remove leading/trailing whitespace
}

// Build canonical lookup maps with normalized keys
function canonicalizeMap(map) {
  const result = {};
  for (const [key, value] of Object.entries(map)) {
    const normalizedKey = normalizeId(key);
    result[normalizedKey] = value;
  }
  return result;
}

const CLASSES_BY_ID = canonicalizeMap(CLASSES);
const WEAPONS_BY_ID = canonicalizeMap(WEAPONS);
const PETS_BY_ID = canonicalizeMap(PETS);

const ENEMIES = ['🧝', '🧞', '🧛', '🧜', '🧟', '🐦‍⬛', '🕷️', '🦟', '🦇', '🦖'];

class HeroService {
  constructor() {
    this.heroStoragePath = path.join(__dirname, '../../data/heroes.json');
    this.heroes = new Map();
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.heroStoragePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.loadHeroesFromFile();
  }

  loadHeroesFromFile() {
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
          // Migrate maxEnergy from 3 to 5
          if (heroData.maxEnergy === 3) {
            heroData.maxEnergy = 5;
            migrationCount++;
            logger.info(`Upgraded maxEnergy 3->5 for user ${userId}`);
          }
          
                    ['class', 'weapon', 'pet'].forEach(type => {
            if (heroData.equipped && heroData.equipped[type]) {
              const equipped = heroData.equipped[type];
              
              if (typeof equipped === 'string') {
                if (REMOVED_ITEMS[type] && REMOVED_ITEMS[type][equipped]) {
                  const randomItem = VALID_ITEMS[type][Math.floor(Math.random() * VALID_ITEMS[type].length)];
                  heroData.equipped[type] = { id: randomItem, rarity: 'common' };
                  migrationCount++;
                  logger.info(`Replaced removed ${type} ${equipped} with ${randomItem} for user ${userId}`);
                } else {
                  heroData.equipped[type] = { id: equipped, rarity: 'common' };
                }
              } else if (equipped && typeof equipped === 'object') {
                if (REMOVED_ITEMS[type] && REMOVED_ITEMS[type][equipped.id]) {
                  const randomItem = VALID_ITEMS[type][Math.floor(Math.random() * VALID_ITEMS[type].length)];
                  heroData.equipped[type] = { id: randomItem, rarity: equipped.rarity || 'common' };
                  migrationCount++;
                  logger.info(`Replaced removed ${type} ${equipped.id} with ${randomItem} for user ${userId}`);
                }
              }
            }
          });
          
          if (heroData.inventory && Array.isArray(heroData.inventory)) {
            heroData.inventory = heroData.inventory.map(item => {
              if (REMOVED_ITEMS[item.type] && REMOVED_ITEMS[item.type][item.id]) {
                const randomItem = VALID_ITEMS[item.type][Math.floor(Math.random() * VALID_ITEMS[item.type].length)];
                migrationCount++;
                logger.info(`Replaced inventory ${item.type} ${item.id} with ${randomItem} for user ${userId}`);
                return { ...item, id: randomItem };
              }
              return item;
            });
          }
          
          this.heroes.set(userId, heroData);
        });
        
        if (migrationCount > 0) {
          logger.info(`Migrated ${migrationCount} items total`);
          this.saveHeroesToFile();
        }
        
        logger.info(`Loaded ${this.heroes.size} heroes from storage`);
      }
    } catch (error) {
      logger.error('Failed to load heroes:', error);
    }
  }

  saveHeroesToFile() {
    try {
      const heroesObject = {};
      this.heroes.forEach((hero, userId) => {
        heroesObject[userId] = hero;
      });
      
      fs.writeFileSync(this.heroStoragePath, JSON.stringify(heroesObject, null, 2), 'utf8');
      logger.info(`Saved ${this.heroes.size} heroes to storage`);
    } catch (error) {
      logger.error('Failed to save heroes:', error);
    }
  }

  createHero(userId) {
    userId = String(userId);
    const hero = {
      level: 1,
      xp: 0,
      xpToNextLevel: 500,
      energy: 5,
      maxEnergy: 5,
      lastEnergyRecharge: Date.now(),
      strength: 0,
      wisdom: 0,
      luck: 0,
      unspentPoints: 0,
      currency: 0,
      equipped: {
        class: null,
        weapon: null,
        pet: null
      },
      inventory: [],
      maxInventory: 50,
      stats: {
        totalBattles: 0,
        won: 0,
        lost: 0,
        damageDealt: 0,
        damageTaken: 0,
        strategiesOpened: 0,
        strategiesClosed: 0
      },
      createdAt: Date.now()
    };
    
    this.heroes.set(userId, hero);
    this.saveHeroesToFile();
    logger.info(`Created hero for user ${userId}`);
    
    return hero;
  }

  getHero(userId) {
    userId = String(userId);
    return this.heroes.get(userId) || null;
  }

  getOrCreateHero(userId) {
    userId = String(userId);
    let hero = this.getHero(userId);
    if (!hero) {
      hero = this.createHero(userId);
    }
    // Migrate old energy system
    if (hero.maxEnergy === 3) {
      hero.maxEnergy = 5;
      this.saveHeroesToFile();
    }
    return hero;
  }

  addXP(userId, amount) {
    userId = String(userId);
    const hero = this.getOrCreateHero(userId);
    hero.xp += amount;
    
    // Check for level ups
    while (hero.xp >= hero.xpToNextLevel && hero.level < 100) {
      hero.xp -= hero.xpToNextLevel;
      hero.level++;
      hero.unspentPoints += 3;
      hero.xpToNextLevel = Math.floor(500 * Math.pow(1.1, hero.level - 1));
    }
    
    this.saveHeroesToFile();
    return hero;
  }

  addCurrency(userId, amount) {
    userId = String(userId);
    const hero = this.getOrCreateHero(userId);
    const luckBonus = 1 + (hero.luck * 0.005);
    const finalAmount = Math.floor(amount * luckBonus);
    hero.currency += finalAmount;
    this.saveHeroesToFile();
    return finalAmount;
  }

  spendStat(userId, stat) {
    userId = String(userId);
    const hero = this.getHero(userId);
    if (!hero || hero.unspentPoints <= 0) return false;
    
    if (['strength', 'wisdom', 'luck'].includes(stat) && hero[stat] < 100) {
      hero[stat]++;
      hero.unspentPoints--;
      this.saveHeroesToFile();
      return true;
    }
    return false;
  }

  rechargeEnergy(userId) {
    userId = String(userId);
    const hero = this.getHero(userId);
    if (!hero) return;
    
    const now = Date.now();
    const halfHoursSinceLastRecharge = (now - hero.lastEnergyRecharge) / (1000 * 60 * 30);
    const energyToAdd = Math.floor(halfHoursSinceLastRecharge);
    
    if (energyToAdd > 0 && hero.energy < hero.maxEnergy) {
      hero.energy = Math.min(hero.maxEnergy, hero.energy + energyToAdd);
      hero.lastEnergyRecharge = now;
      this.saveHeroesToFile();
    }
  }

  consumeEnergy(userId) {
    userId = String(userId);
    const hero = this.getHero(userId);
    if (!hero || hero.energy <= 0) return false;
    
    hero.energy--;
    this.saveHeroesToFile();
    return true;
  }

  addItem(userId, itemType, itemId, rarity) {
    userId = String(userId);
    const hero = this.getOrCreateHero(userId);
    
    if (hero.inventory.length >= hero.maxInventory) {
      return { success: false, reason: 'Inventory full' };
    }
    
    hero.inventory.push({
      type: itemType,
      id: itemId,
      rarity,
      addedAt: Date.now()
    });
    
    this.saveHeroesToFile();
    return { success: true };
  }

  equipItem(userId, inventoryIndex) {
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
  }

  // Unequip item
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
  }

  // New sell system with proper pricing
  sellItem(userId, inventoryIndex) {
    userId = String(userId);
    const hero = this.getHero(userId);
    if (!hero || inventoryIndex >= hero.inventory.length) return 0;
    
    const item = hero.inventory[inventoryIndex];
    const isPet = item.type === 'pet';
    const prices = {
      common: isPet ? 50 : 25,
      rare: isPet ? 500 : 250,
      legendary: isPet ? 5000 : 2500
    };
    const price = prices[item.rarity] || 25;
    
    hero.currency += price;
    hero.inventory.splice(inventoryIndex, 1);
    this.saveHeroesToFile();
    return price;
  }

  // Auto-fuse all eligible items
  autoFuseItems(userId) {
    userId = String(userId);
    const hero = this.getHero(userId);
    if (!hero) return { fused: 0, items: [] };
    
    const fused = [];
    
    // Group items by type, id, and rarity
    const grouped = {};
    hero.inventory.forEach((item, index) => {
      if (item.rarity === 'legendary') return; // Can't fuse legendary
      const key = `${item.type}_${item.id}_${item.rarity}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(index);
    });
    
    // Fuse groups of 5+
    Object.entries(grouped).forEach(([key, indices]) => {
      while (indices.length >= 5) {
        const targetRarity = key.endsWith('_common') ? 'rare' : 'legendary';
        const [type, id] = key.split('_');
        
        // Remove 5 items (from end to preserve indices)
        for (let i = 0; i < 5; i++) {
          hero.inventory.splice(indices.pop(), 1);
        }
        
        // Add fused item
        this.addItem(userId, type, id, targetRarity);
        fused.push({ type, id, rarity: targetRarity });
      }
    });
    
    return { fused: fused.length, items: fused };
  }

  // Shop system
  getShopItems(userId) {
    userId = String(userId);
    const hero = this.getOrCreateHero(userId);
    if (!hero.shop || !hero.shop.lastRotation || 
        Date.now() - hero.shop.lastRotation > 8 * 60 * 60 * 1000) {
      hero.shop = this.generateShopItems();
      this.saveHeroesToFile();
    }
    return hero.shop.items;
  }

  generateShopItems() {
    const items = [];
    const rarities = ['common', 'rare', 'legendary'];
    const types = ['class', 'weapon', 'pet'];
    
    for (let i = 0; i < 2; i++) {
      const rarity = rarities[Math.floor(Math.random() * rarities.length)];
      const type = types[Math.floor(Math.random() * types.length)];
      const itemList = type === 'class' ? Object.keys(CLASSES) :
                       type === 'weapon' ? Object.keys(WEAPONS) : 
                       Object.keys(PETS);
      const id = itemList[Math.floor(Math.random() * itemList.length)];
      
      const isPet = type === 'pet';
      const prices = {
        common: isPet ? 500 : 250,
        rare: isPet ? 5000 : 2500,
        legendary: isPet ? 50000 : 25000
      };
      
      items.push({
        type,
        id,
        rarity,
        price: prices[rarity]
      });
    }
    
    return { items, lastRotation: Date.now() };
  }

  buyShopItem(userId, shopIndex) {
    userId = String(userId);
    const hero = this.getHero(userId);
    if (!hero) return { success: false, error: 'Hero not found' };
    
    const shop = this.getShopItems(userId);
    if (shopIndex >= shop.length) return { success: false, error: 'Invalid item' };
    
    const item = shop[shopIndex];
    if (hero.currency < item.price) {
      return { success: false, error: 'Not enough currency' };
    }
    
    hero.currency -= item.price;
    const result = this.addItem(userId, item.type, item.id, item.rarity);
    
    if (result.success) {
      // Remove from shop
      hero.shop.items.splice(shopIndex, 1);
      this.saveHeroesToFile();
      return { success: true, item };
    }
    
    return result;
  }

  fuseItems(userId, rarityToFuse) {
    userId = String(userId);
    const hero = this.getHero(userId);
    if (!hero) return false;
    
    const itemsOfRarity = hero.inventory.filter(item => item.rarity === rarityToFuse);
    if (itemsOfRarity.length < 5) return false;
    
    const targetRarity = rarityToFuse === 'common' ? 'rare' : 'legendary';
    const randomType = ['class', 'weapon', 'pet'][Math.floor(Math.random() * 3)];
    const items = randomType === 'class' ? Object.keys(CLASSES) : 
                  randomType === 'weapon' ? Object.keys(WEAPONS) : Object.keys(PETS);
    const randomItem = items[Math.floor(Math.random() * items.length)];
    
    // Remove 5 items of the rarity
    let removed = 0;
    hero.inventory = hero.inventory.filter(item => {
      if (item.rarity === rarityToFuse && removed < 5) {
        removed++;
        return false;
      }
      return true;
    });
    
    // Add the fused item
    this.addItem(userId, randomType, randomItem, targetRarity);
    return true;
  }

  updateBattleStats(userId, won, damageDealt, damageTaken) {
    userId = String(userId);
    const hero = this.getOrCreateHero(userId);
    hero.stats.totalBattles++;
    if (won) hero.stats.won++;
    else hero.stats.lost++;
    hero.stats.damageDealt += damageDealt;
    hero.stats.damageTaken += damageTaken;
    this.saveHeroesToFile();
  }

  awardStrategyXP(userId, type) {
    userId = String(userId);
    if (type === 'open') {
      this.getOrCreateHero(userId).stats.strategiesOpened++;
      return this.addXP(userId, 500);
    } else if (type === 'close') {
      this.getOrCreateHero(userId).stats.strategiesClosed++;
      return this.addXP(userId, 500);
    }
  }
}

module.exports = { 
  HeroService, 
  CLASSES, WEAPONS, PETS, ENEMIES,           // Legacy maps
  CLASSES_BY_ID, WEAPONS_BY_ID, PETS_BY_ID, // Canonical maps
  normalizeId                                 // Utility function
};
