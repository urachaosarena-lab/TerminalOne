const logger = require('../utils/logger');
const { CLASSES, WEAPONS, PETS, ENEMIES } = require('./HeroService');

// Companion definitions
const COMPANIONS = {
  mira: {
    name: '👩‍🦰Mira',
    hp: 100,
    abilities: [
      { name: 'Strike', dmg: [20, 40], target: 'single' },
      { name: 'Stun', effect: 'stun', chance: 0.5, target: 'single' },
      { name: 'Triple Shot', dmg: [2, 35], target: 'all' }
    ]
  },
  jawzy: {
    name: '🦈Jawzy',
    hp: 100,
    abilities: [
      { name: 'Bite', dmg: [5, 40], target: 'single' },
      { name: 'Bleed', effect: 'bleed', chance: 0.5, target: 'single' },
      { name: 'Tail Sweep', dmg: [5, 40], target: 'all' }
    ]
  }
};

class BattleService {
  constructor(heroService) {
    this.heroService = heroService;
    this.activeBattles = new Map();
  }

  startBattle(userId) {
    const hero = this.heroService.getHero(userId);
    if (!hero) return null;

    // Recharge energy
    this.heroService.rechargeEnergy(userId);
    
    if (hero.energy <= 0) {
      return { error: 'No energy available. Recharges 1/hour.' };
    }

    // Generate enemies
    const enemies = this.generateEnemies();

    // Setup team
    const team = [
      this.createFighter('hero', hero, userId),
      this.createFighter('mira', COMPANIONS.mira),
      this.createFighter('jawzy', COMPANIONS.jawzy)
    ];

    const battle = {
      userId,
      team,
      enemies,
      turn: 1,
      selectedAbility: null,
      turnReady: false,
      battleLog: [],
      totalDamageDealt: 0,
      totalDamageTaken: 0
    };

    this.activeBattles.set(userId, battle);
    return battle;
  }

  createFighter(type, data, userId = null) {
    const fighter = {
      type,
      name: type === 'hero' ? '🧙Hero' : data.name,
      hp: 100,
      maxHp: 100,
      effects: [],
      shield: 0,
      userId
    };

    if (type === 'hero') {
      const hero = data;
      fighter.strength = hero.strength;
      fighter.wisdom = hero.wisdom;
      fighter.luck = hero.luck;
      fighter.equipped = hero.equipped;
      
      // Get abilities from equipment
      fighter.abilities = this.getHeroAbilities(hero);
    } else if (type === 'mira' || type === 'jawzy') {
      fighter.abilities = data.abilities;
    } else if (type === 'enemy') {
      fighter.name = data.emoji;
      fighter.abilities = this.generateEnemyAbilities();
    }

    return fighter;
  }

  getHeroAbilities(hero) {
    const abilities = [];
    
    if (hero.equipped.class && CLASSES[hero.equipped.class]) {
      abilities.push(CLASSES[hero.equipped.class].ability);
    }
    if (hero.equipped.weapon && WEAPONS[hero.equipped.weapon]) {
      abilities.push(WEAPONS[hero.equipped.weapon].ability);
    }
    
    return abilities.length > 0 ? abilities : [
      { name: 'Punch', dmg: [5, 15], target: 'single', desc: '5-15 damage' }
    ];
  }

  generateEnemies() {
    const enemies = [];
    for (let i = 0; i < 3; i++) {
      const emoji = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
      enemies.push(this.createFighter('enemy', { emoji }));
    }
    return enemies;
  }

  generateEnemyAbilities() {
    return [
      { name: 'Attack', dmg: [15, 35], target: 'single' },
      { name: 'Stun', effect: 'stun', chance: 0.5, target: 'single' },
      { name: 'Multi Hit', dmg: [5, 30], target: 'all' }
    ];
  }

  selectAbility(userId, abilityIndex) {
    const battle = this.activeBattles.get(userId);
    if (!battle) return null;

    const hero = battle.team[0];
    if (abilityIndex >= 0 && abilityIndex < hero.abilities.length) {
      battle.selectedAbility = abilityIndex;
      battle.turnReady = true;
      return battle;
    }
    return null;
  }

  executeTurn(userId) {
    const battle = this.activeBattles.get(userId);
    if (!battle || !battle.turnReady) return null;

    battle.battleLog = [];
    battle.battleLog.push(`\n━━━ Turn ${battle.turn} ━━━`);

    // Hero attacks
    if (battle.team[0].hp > 0 && battle.selectedAbility !== null) {
      this.executeAction(battle, battle.team[0], battle.team[0].abilities[battle.selectedAbility], battle.enemies, battle.team);
    }

    // Companions attack (auto)
    for (let i = 1; i < battle.team.length; i++) {
      if (battle.team[i].hp > 0) {
        const randomAbility = battle.team[i].abilities[Math.floor(Math.random() * battle.team[i].abilities.length)];
        this.executeAction(battle, battle.team[i], randomAbility, battle.enemies, battle.team);
      }
    }

    // Enemies attack
    battle.enemies.forEach(enemy => {
      if (enemy.hp > 0) {
        // Check stun
        if (enemy.effects.some(e => e.type === 'stun')) {
          battle.battleLog.push(`${enemy.name} is stunned! ✨`);
          enemy.effects = enemy.effects.filter(e => e.type !== 'stun');
          return;
        }

        const randomAbility = enemy.abilities[Math.floor(Math.random() * enemy.abilities.length)];
        this.executeAction(battle, enemy, randomAbility, battle.team, battle.enemies);
      }
    });

    // Apply bleed effects
    this.applyDOT(battle);

    // Check battle end
    const teamAlive = battle.team.filter(f => f.hp > 0).length;
    const enemiesAlive = battle.enemies.filter(f => f.hp > 0).length;

    battle.turn++;
    battle.turnReady = false;
    battle.selectedAbility = null;

    if (teamAlive === 0) {
      return this.endBattle(userId, false);
    } else if (enemiesAlive === 0) {
      return this.endBattle(userId, true);
    }

    return battle;
  }

  executeAction(battle, attacker, ability, targets, allies) {
    // Check if ability is damage or support
    if (ability.dmg) {
      this.executeDamageAbility(battle, attacker, ability, targets);
    } else if (ability.effect) {
      this.executeSupportAbility(battle, attacker, ability, targets, allies);
    }
  }

  executeDamageAbility(battle, attacker, ability, targets) {
    const [minDmg, maxDmg] = ability.dmg;
    const baseDamage = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
    
    // Apply strength bonus
    const strengthBonus = attacker.strength ? attacker.strength * 0.5 : 0;
    const finalDamage = Math.floor(baseDamage + strengthBonus);

    let targetList = [];
    if (ability.target === 'single') {
      const alive = targets.filter(t => t.hp > 0);
      if (alive.length > 0) targetList = [alive[Math.floor(Math.random() * alive.length)]];
    } else if (ability.target === 'two') {
      const alive = targets.filter(t => t.hp > 0);
      targetList = alive.sort(() => 0.5 - Math.random()).slice(0, 2);
    } else if (ability.target === 'all') {
      targetList = targets.filter(t => t.hp > 0);
    }

    targetList.forEach(target => {
      let damage = finalDamage;
      
      // Check shield
      if (target.shield > 0) {
        const blocked = Math.min(damage, target.shield);
        target.shield -= blocked;
        damage -= blocked;
      }

      target.hp = Math.max(0, target.hp - damage);
      target.lastAction = `Attacked by ${attacker.name} doing ${damage}dmg`;
      
      if (attacker.userId) {
        battle.totalDamageDealt += damage;
      } else if (target.userId) {
        battle.totalDamageTaken += damage;
      }
    });
  }

  executeSupportAbility(battle, attacker, ability, targets, allies) {
    const wisdomBonus = attacker.wisdom ? attacker.wisdom * 0.005 : 0;

    if (ability.effect === 'stun') {
      const alive = targets.filter(t => t.hp > 0);
      if (alive.length > 0) {
        const target = alive[Math.floor(Math.random() * alive.length)];
        const chance = ability.chance + wisdomBonus;
        if (Math.random() < chance) {
          target.effects.push({ type: 'stun', duration: 1 });
          target.lastAction = `Attacked by ${attacker.name} Stunned ✨`;
        }
      }
    } else if (ability.effect === 'bleed') {
      const alive = targets.filter(t => t.hp > 0);
      if (alive.length > 0) {
        const target = alive[Math.floor(Math.random() * alive.length)];
        const chance = ability.chance + wisdomBonus;
        if (Math.random() < chance) {
          target.effects.push({ type: 'bleed', duration: 3, damage: 10 });
          target.lastAction = `Attacked by ${attacker.name} Bleeding 🩸`;
        }
      }
    } else if (ability.effect === 'heal') {
      allies.forEach(ally => {
        if (ally.hp > 0 && ally.hp < ally.maxHp) {
          const heal = ability.value;
          ally.hp = Math.min(ally.maxHp, ally.hp + heal);
          battle.battleLog.push(`${attacker.name} healed ${ally.name} +${heal}HP!`);
        }
      });
    } else if (ability.effect === 'shield') {
      allies.forEach(ally => {
        if (ally.hp > 0) {
          ally.shield += ability.value;
          battle.battleLog.push(`${attacker.name} granted ${ally.name} +${ability.value} shield!`);
        }
      });
    }
  }

  applyDOT(battle) {
    [...battle.team, ...battle.enemies].forEach(fighter => {
      if (fighter.hp > 0) {
        fighter.effects.forEach(effect => {
          if (effect.type === 'bleed') {
            fighter.hp = Math.max(0, fighter.hp - effect.damage);
            battle.battleLog.push(`${fighter.name} bleeds for ${effect.damage}HP! 🩸`);
          }
        });
        fighter.effects = fighter.effects.filter(e => --e.duration > 0 || e.type === 'stun');
      }
    });
  }

  endBattle(userId, won) {
    const battle = this.activeBattles.get(userId);
    if (!battle) return null;

    // Consume energy
    this.heroService.consumeEnergy(userId);

    // Update stats
    this.heroService.updateBattleStats(userId, won, battle.totalDamageDealt, battle.totalDamageTaken);

    let rewards = null;
    if (won) {
      // Award XP
      this.heroService.addXP(userId, 250);
      
      // Award currency
      const currency = Math.floor(Math.random() * 96) + 5;
      const actualCurrency = this.heroService.addCurrency(userId, currency);

      // Award loot
      rewards = this.generateLoot(userId);
      rewards.currency = actualCurrency;
      rewards.xp = 250;

      battle.battleLog.push(`\n🎉 Victory!`);
      battle.battleLog.push(`+250 XP | +${actualCurrency} 💎S`);
      if (rewards.item) {
        const rarityEmoji = rewards.item.rarity === 'common' ? '⚪' : rewards.item.rarity === 'rare' ? '🔵' : '🟠';
        battle.battleLog.push(`${rarityEmoji} Loot: ${rewards.item.id} ${rewards.item.type}`);
      }
    } else {
      battle.battleLog.push(`\n💀 Defeat...`);
    }

    battle.ended = true;
    battle.won = won;
    battle.rewards = rewards;

    this.activeBattles.delete(userId);
    return battle;
  }

  generateLoot(userId) {
    const loot = { item: null };

    // 60% chance for item
    if (Math.random() < 0.6) {
      // Determine type
      const roll = Math.random();
      let itemType;
      if (roll < 0.4) itemType = 'class';
      else if (roll < 0.8) itemType = 'weapon';
      else itemType = 'pet';

      // Determine rarity
      const rarityRoll = Math.random();
      let rarity;
      if (rarityRoll < 0.75) rarity = 'common';
      else if (rarityRoll < 0.95) rarity = 'rare';
      else rarity = 'legendary';

      // Get random item
      const items = itemType === 'class' ? Object.keys(CLASSES) :
                    itemType === 'weapon' ? Object.keys(WEAPONS) :
                    Object.keys(PETS);
      const itemId = items[Math.floor(Math.random() * items.length)];

      const result = this.heroService.addItem(userId, itemType, itemId, rarity);
      if (result.success) {
        loot.item = { type: itemType, id: itemId, rarity };
      }
    }

    return loot;
  }

  getBattle(userId) {
    return this.activeBattles.get(userId) || null;
  }
}

module.exports = BattleService;
