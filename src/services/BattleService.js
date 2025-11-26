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
      selectedTarget: null,
      turnReady: false,
      battleLog: [],
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      comboCount: 0,
      qteActive: false,
      qteCount: 0,
      qteStartTime: null
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


    // Apply pet passive abilities
    if (type === 'hero' && fighter.equipped && fighter.equipped.pet) {
      fighter.petPassive = this.getPetPassive(fighter.equipped.pet);
      fighter.rageStacks = 0; // For Bull's Rage ability
    }

    return fighter;
  }

  getHeroAbilities(hero) {
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
    ];
  }


  getPetPassive(equippedPet) {
    const getEquippedId = (equipped) => typeof equipped === 'string' ? equipped : (equipped ? equipped.id : null);
    const getEquippedRarity = (equipped) => {
      if (typeof equipped === 'object' && equipped.rarity) return equipped.rarity;
      return 'common';
    };
    
    const petId = getEquippedId(equippedPet);
    const petRarity = getEquippedRarity(equippedPet);
    
    if (!petId || !PETS[petId]) return null;
    
    const RARITY_MULTIPLIERS = { common: 1.0, rare: 1.25, legendary: 1.5 };
    const multiplier = RARITY_MULTIPLIERS[petRarity] || 1.0;
    
    const passive = { ...PETS[petId].ability };
    
    // Apply rarity scaling to values
    if (passive.value !== undefined) {
      passive.value = passive.value * multiplier;
    }
    if (passive.dmg !== undefined) {
      if (Array.isArray(passive.dmg)) {
        passive.dmg = passive.dmg.map(d => Math.floor(d * multiplier));
      } else {
        passive.dmg = Math.floor(passive.dmg * multiplier);
      }
    }
    
    return passive;
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
      const ability = hero.abilities[abilityIndex];
      
      // If not single-target damage ability, mark turn as ready
      if (ability.target !== 'single' || ability.effect) {
        battle.turnReady = true;
      }
      return battle;
    }
    return null;
  }

  setTarget(userId, targetIndex) {
    const battle = this.activeBattles.get(userId);
    if (!battle) return null;

    battle.selectedTarget = targetIndex;
    
    // 30% chance to trigger QTE
    if (Math.random() < 0.3) {
      battle.qteActive = true;
      battle.qteCount = 0;
      battle.qteStartTime = Date.now();
      battle.turnReady = false; // Wait for QTE
    } else {
      battle.turnReady = true;
    }
    
    return battle;
  }

  qteButtonPress(userId) {
    const battle = this.activeBattles.get(userId);
    if (!battle || !battle.qteActive) return null;

    const elapsed = Date.now() - battle.qteStartTime;
    if (elapsed > 3000) {
      // QTE expired
      battle.qteActive = false;
      battle.turnReady = true;
      return { expired: true, count: battle.qteCount };
    }

    battle.qteCount++;
    return { expired: false, count: battle.qteCount };
  }

  qteFinish(userId) {
    const battle = this.activeBattles.get(userId);
    if (!battle) return null;

    battle.qteActive = false;
    battle.turnReady = true;
    return battle;
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
    battle.selectedTarget = null;

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


  applyPetPassives(battle) {
    // Apply pet passives for all fighters
    [...battle.team, ...battle.enemies].forEach(fighter => {
      if (!fighter.petPassive || fighter.hp <= 0) return;
      
      const passive = fighter.petPassive;
      
      // 🦎 Lizard - Regeneration: Heal X HP per turn
      if (passive.effect === 'regen' && passive.value) {
        const healAmount = Math.floor(passive.value);
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + healAmount);
        battle.battleLog.push(`🦎 ${fighter.name} regenerates ${healAmount} HP!`);
      }
      
      // 🐂 Bull - Rage: +X damage accumulation per turn
      if (passive.effect === 'rage' && passive.value) {
        if (fighter.rageStacks === undefined) fighter.rageStacks = 0;
        fighter.rageStacks += Math.floor(passive.value);
        battle.battleLog.push(`🐂 ${fighter.name}'s rage builds! (+${Math.floor(passive.value)} bonus damage, total: ${fighter.rageStacks})`);
      }
      
      // 🐕 Dog - Loyalty: Deal X-Y damage to random enemy
      if (passive.effect === 'bite' && passive.dmg && fighter.userId) {
        const targets = fighter.type === 'hero' ? battle.enemies : battle.team;
        const aliveTargets = targets.filter(t => t.hp > 0);
        
        if (aliveTargets.length > 0) {
          const target = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
          const [minDmg, maxDmg] = passive.dmg;
          const damage = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
          
          target.hp = Math.max(0, target.hp - damage);
          battle.battleLog.push(`🐕 ${fighter.name}'s dog attacks ${target.name} for ${damage} damage!`);
          
          if (target.hp === 0) {
            battle.battleLog.push(`💀 ${target.name} was defeated by the loyal dog!`);
          }
        }
      }
    });
  }

  executeDamageAbility(battle, attacker, ability, targets) {
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
    
    // Apply strength bonus
    const strengthBonus = attacker.strength ? attacker.strength * 0.5 : 0;
    let finalDamage = Math.floor(baseDamage + strengthBonus);
    

    // Apply pet passive: defense reduction (🐻 Bear)
    targetList.forEach(target => {
      if (target.petPassive && target.petPassive.effect === 'defense' && target.petPassive.value) {
        const reductionPercent = target.petPassive.value;
        const originalDamage = finalDamage;
        finalDamage = Math.floor(finalDamage * (1 - reductionPercent));
        if (originalDamage !== finalDamage) {
          battle.battleLog.push(`🐻 ${target.name}'s thick fur reduces damage by ${Math.floor(reductionPercent * 100)}%!`);
        }
      }
    });
    
    // Apply pet passive: rage damage bonus (🐂 Bull)
    if (attacker.petPassive && attacker.petPassive.effect === 'rage' && attacker.rageStacks > 0) {
      finalDamage += attacker.rageStacks;
    }
    
        // Apply combo bonus for hero
    if (attacker.userId && battle.comboCount > 0) {
      const comboBonus = Math.floor(finalDamage * (battle.comboCount * 0.1));
      finalDamage += comboBonus;
      battle.battleLog.push(`🔥 ${battle.comboCount}x COMBO! +${comboBonus} damage!`);
    }
    
    // Apply QTE critical bonus for hero
    if (attacker.userId && battle.qteCount > 0) {
      const qteCritBonus = Math.floor(finalDamage * (battle.qteCount * 0.15));
      finalDamage += qteCritBonus;
      battle.battleLog.push(`💥 CRITICAL HIT! ${battle.qteCount} taps! +${qteCritBonus} damage!`);
      battle.qteCount = 0; // Reset after use
    }

    let targetList = [];
    if (ability.target === 'single') {
      const alive = targets.filter(t => t.hp > 0);
      if (attacker.userId && battle.selectedTarget !== null) {
        // Use player-selected target
        const target = targets[battle.selectedTarget];
        if (target && target.hp > 0) {
          targetList = [target];
        } else if (alive.length > 0) {
          targetList = [alive[0]]; // Fallback if target dead
        }
      } else if (alive.length > 0) {
        targetList = [alive[Math.floor(Math.random() * alive.length)]];
      }
    } else if (ability.target === 'two') {
      const alive = targets.filter(t => t.hp > 0);
      targetList = alive.sort(() => 0.5 - Math.random()).slice(0, 2);
    } else if (ability.target === 'all') {
      targetList = targets.filter(t => t.hp > 0);
    }

    targetList.forEach(target => {
      // Apply pet passive: dodge chance (🐙 Octopus)
      if (target.petPassive && target.petPassive.effect === 'dodge' && target.petPassive.value) {
        const dodgeChance = target.petPassive.value;
        if (Math.random() < dodgeChance) {
          battle.battleLog.push(`🐙 ${target.name} dodges the attack with ink cloud!`);
          return; // Skip this target
        }
      }
      
      let damage = finalDamage;
      

      // Apply pet passive: increased stun chance (🕷️ Spider)
      if (attacker.petPassive && attacker.petPassive.effect === 'stun' && attacker.petPassive.value) {
        const stunChance = attacker.petPassive.value;
        if (Math.random() < stunChance && !target.effects.includes('stun')) {
          target.effects.push('stun');
          battle.battleLog.push(`🕷️ ${target.name} is stunned by web trap!`);
        }
      }
      
      // Apply pet passive: bleed chance (🐍 Snake)
      if (attacker.petPassive && attacker.petPassive.effect === 'bleed' && attacker.petPassive.value) {
        const bleedChance = attacker.petPassive.value;
        if (Math.random() < bleedChance && !target.effects.includes('bleed')) {
          target.effects.push('bleed');
          battle.battleLog.push(`🐍 ${target.name} is bleeding from snake bite!`);
        }
      }
      
      // Apply pet passive: splash damage (🐋 Whale)
      if (attacker.petPassive && attacker.petPassive.effect === 'splash' && attacker.petPassive.value && ability.target === 'single') {
        const splashChance = attacker.petPassive.value;
        if (Math.random() < splashChance) {
          const splashTargets = (attacker.type === 'hero' ? battle.enemies : battle.team).filter(t => t.hp > 0 && t !== target);
          if (splashTargets.length > 0) {
            const splashTarget = splashTargets[Math.floor(Math.random() * splashTargets.length)];
            const splashDamage = Math.floor(damage * 0.5);
            splashTarget.hp = Math.max(0, splashTarget.hp - splashDamage);
            battle.battleLog.push(`🐋 Tidal wave splashes ${splashTarget.name} for ${splashDamage} damage!`);
          }
        }
      }
      
      // Apply pet passive: headbutt bonus damage (🐐 Goat)
      if (attacker.petPassive && attacker.petPassive.effect === 'damage' && attacker.petPassive.value && attacker.petPassive.dmg) {
        const procChance = attacker.petPassive.value;
        if (Math.random() < procChance) {
          const bonusDamage = attacker.petPassive.dmg;
          damage += bonusDamage;
          battle.battleLog.push(`🐐 ${attacker.name} headbutts for +${bonusDamage} bonus damage!`);
        }
      }
      
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
        // Increase combo on successful hero hit
        if (damage > 0) battle.comboCount++;
      } else if (target.userId) {
        battle.totalDamageTaken += damage;
        // Break combo if hero gets hit
        battle.comboCount = 0;
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
