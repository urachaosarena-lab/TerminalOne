const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Item definitions
const CLASSES = {
  '👷': { name: 'Worker', ability: { name: 'Shield Wall', effect: 'block', value: 0.3, desc: '30% chance to block all damage this turn' }},
  '💂': { name: 'Guard', ability: { name: 'Taunt', effect: 'taunt', value: 1, desc: 'Force all enemies to attack you' }},
  '🕵️': { name: 'Detective', ability: { name: 'Analyze', effect: 'weaken', value: 0.25, desc: 'Reduce enemy damage by 25% for 2 turns' }},
  '🧝': { name: 'Elf', ability: { name: 'Nature Heal', effect: 'heal', value: 30, desc: 'Heal 30HP to all allies' }},
  '🧙': { name: 'Wizard', ability: { name: 'Mana Shield', effect: 'shield', value: 50, desc: 'Grant 50 shield to all allies' }},
  '🦹': { name: 'Hero', ability: { name: 'Inspire', effect: 'buff', value: 0.5, desc: 'Increase all ally damage by 50% for 2 turns' }},
  '🧚': { name: 'Fairy', ability: { name: 'Dispel', effect: 'cleanse', value: 1, desc: 'Remove all debuffs from allies' }},
  '🧞': { name: 'Genie', ability: { name: 'Wish', effect: 'revive', value: 0.5, desc: '50% chance to revive a fallen ally with 50% HP' }},
  '🧛': { name: 'Vampire', ability: { name: 'Life Drain', effect: 'drain', value: 25, desc: 'Deal 25 damage and heal for amount dealt' }}
};

const WEAPONS = {
  '🦴': { name: 'Bone', ability: { name: 'Bone Crush', dmg: [15, 30], target: 'single', desc: '15-30 damage to one enemy' }},
  '🏹': { name: 'Bow', ability: { name: 'Pierce Shot', dmg: [20, 35], target: 'single', desc: '20-35 damage to one enemy' }},
  '🔨': { name: 'Hammer', ability: { name: 'Ground Slam', dmg: [10, 20], target: 'all', desc: '10-20 damage to all enemies' }},
  '🪓': { name: 'Axe', ability: { name: 'Cleave', dmg: [25, 40], target: 'single', desc: '25-40 damage to one enemy' }},
  '🗡️': { name: 'Sword', ability: { name: 'Slash', dmg: [18, 32], target: 'single', desc: '18-32 damage to one enemy' }},
  '⚔️': { name: 'Dual Swords', ability: { name: 'Double Strike', dmg: [12, 24], target: 'two', desc: '12-24 damage to two enemies' }},
  '🔫': { name: 'Gun', ability: { name: 'Rapid Fire', dmg: [8, 16], target: 'all', desc: '8-16 damage to all enemies' }}
};

const PETS = {
  '🕷️': { name: 'Spider', ability: { name: 'Web Trap', effect: 'slow', value: 0.2, desc: '+20% stun chance' }},
  '🦎': { name: 'Lizard', ability: { name: 'Regeneration', effect: 'regen', value: 5, desc: 'Heal 5HP per turn' }},
  '🐍': { name: 'Snake', ability: { name: 'Venom', effect: 'poison', value: 0.2, desc: '+20% bleed chance' }},
  '🐙': { name: 'Octopus', ability: { name: 'Ink Cloud', effect: 'dodge', value: 0.15, desc: '+15% dodge chance' }},
  '🐋': { name: 'Whale', ability: { name: 'Tidal Wave', effect: 'splash', value: 0.3, desc: '+30% splash damage' }},
  '🐂': { name: 'Bull', ability: { name: 'Rage', effect: 'strength', value: 5, desc: '+5 Strength' }},
  '🐻': { name: 'Bear', ability: { name: 'Thick Fur', effect: 'defense', value: 0.15, desc: 'Reduce damage taken by 15%' }},
  '🦙': { name: 'Llama', ability: { name: 'Spit', effect: 'accuracy', value: 0.1, desc: '+10% critical hit chance' }},
  '🐐': { name: 'Goat', ability: { name: 'Headbutt', effect: 'knockback', value: 10, desc: 'Deal 10 bonus damage' }},
  '🦉': { name: 'Owl', ability: { name: 'Wisdom', effect: 'wisdom', value: 5, desc: '+5 Wisdom' }},
  '🐕': { name: 'Dog', ability: { name: 'Loyalty', effect: 'luck', value: 5, desc: '+5 Luck' }},
  '🐈': { name: 'Cat', ability: { name: 'Nine Lives', effect: 'survival', value: 0.1, desc: '10% chance to survive fatal damage' }}
};

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
        
        Object.entries(heroes).forEach(([userId, heroData]) => {
          this.heroes.set(userId, heroData);
        });
        
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
    const hero = {
      level: 1,
      xp: 0,
      xpToNextLevel: 500,
      energy: 3,
      maxEnergy: 3,
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
    return this.heroes.get(userId) || null;
  }

  getOrCreateHero(userId) {
    let hero = this.getHero(userId);
    if (!hero) {
      hero = this.createHero(userId);
    }
    return hero;
  }

  addXP(userId, amount) {
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
    const hero = this.getOrCreateHero(userId);
    const luckBonus = 1 + (hero.luck * 0.005);
    const finalAmount = Math.floor(amount * luckBonus);
    hero.currency += finalAmount;
    this.saveHeroesToFile();
    return finalAmount;
  }

  spendStat(userId, stat) {
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
    const hero = this.getHero(userId);
    if (!hero) return;
    
    const now = Date.now();
    const hoursSinceLastRecharge = (now - hero.lastEnergyRecharge) / (1000 * 60 * 60);
    const energyToAdd = Math.floor(hoursSinceLastRecharge);
    
    if (energyToAdd > 0 && hero.energy < hero.maxEnergy) {
      hero.energy = Math.min(hero.maxEnergy, hero.energy + energyToAdd);
      hero.lastEnergyRecharge = now;
      this.saveHeroesToFile();
    }
  }

  consumeEnergy(userId) {
    const hero = this.getHero(userId);
    if (!hero || hero.energy <= 0) return false;
    
    hero.energy--;
    this.saveHeroesToFile();
    return true;
  }

  addItem(userId, itemType, itemId, rarity) {
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
    const hero = this.getHero(userId);
    if (!hero || inventoryIndex >= hero.inventory.length) return false;
    
    const item = hero.inventory[inventoryIndex];
    hero.equipped[item.type] = item.id;
    hero.inventory.splice(inventoryIndex, 1);
    this.saveHeroesToFile();
    return true;
  }

  sellItem(userId, inventoryIndex) {
    const hero = this.getHero(userId);
    if (!hero || inventoryIndex >= hero.inventory.length) return 0;
    
    const item = hero.inventory[inventoryIndex];
    const prices = { common: 15, rare: 30, legendary: 60 };
    const price = prices[item.rarity] || 15;
    
    hero.currency += price;
    hero.inventory.splice(inventoryIndex, 1);
    this.saveHeroesToFile();
    return price;
  }

  fuseItems(userId, rarityToFuse) {
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
    const hero = this.getOrCreateHero(userId);
    hero.stats.totalBattles++;
    if (won) hero.stats.won++;
    else hero.stats.lost++;
    hero.stats.damageDealt += damageDealt;
    hero.stats.damageTaken += damageTaken;
    this.saveHeroesToFile();
  }

  awardStrategyXP(userId, type) {
    if (type === 'open') {
      this.getOrCreateHero(userId).stats.strategiesOpened++;
      return this.addXP(userId, 500);
    } else if (type === 'close') {
      this.getOrCreateHero(userId).stats.strategiesClosed++;
      return this.addXP(userId, 500);
    }
  }
}

module.exports = { HeroService, CLASSES, WEAPONS, PETS, ENEMIES };
