const fs = require('fs');

let content = fs.readFileSync('src/services/BattleService.js', 'utf8');

// Add pet passive data to createFighter for hero
const createFighterEnd = content.indexOf('    return fighter;\n  }\n\n  getHeroAbilities');
if (createFighterEnd > 0) {
  const petPassiveCode = `
    // Apply pet passive abilities
    if (type === 'hero' && fighter.equipped && fighter.equipped.pet) {
      fighter.petPassive = this.getPetPassive(fighter.equipped.pet);
      fighter.rageStacks = 0; // For Bull's Rage ability
    }

`;
  content = content.slice(0, createFighterEnd) + petPassiveCode + content.slice(createFighterEnd);
}

// Add getPetPassive method after getHeroAbilities
const afterGetHeroAbilities = content.indexOf('  generateEnemies()');
if (afterGetHeroAbilities > 0) {
  const getPetPassiveMethod = `
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

`;
  content = content.slice(0, afterGetHeroAbilities) + getPetPassiveMethod + content.slice(afterGetHeroAbilities);
}

// Add applyPetPassives method - this will be called each turn
const afterExecuteAction = content.indexOf('  executeDamageAbility(battle, attacker, ability, targets) {');
if (afterExecuteAction > 0) {
  const applyPetPassivesMethod = `
  applyPetPassives(battle) {
    // Apply pet passives for all fighters
    [...battle.team, ...battle.enemies].forEach(fighter => {
      if (!fighter.petPassive || fighter.hp <= 0) return;
      
      const passive = fighter.petPassive;
      
      // 🦎 Lizard - Regeneration: Heal X HP per turn
      if (passive.effect === 'regen' && passive.value) {
        const healAmount = Math.floor(passive.value);
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + healAmount);
        battle.battleLog.push(\`🦎 \${fighter.name} regenerates \${healAmount} HP!\`);
      }
      
      // 🐂 Bull - Rage: +X damage accumulation per turn
      if (passive.effect === 'rage' && passive.value) {
        if (fighter.rageStacks === undefined) fighter.rageStacks = 0;
        fighter.rageStacks += Math.floor(passive.value);
        battle.battleLog.push(\`🐂 \${fighter.name}'s rage builds! (+\${Math.floor(passive.value)} bonus damage, total: \${fighter.rageStacks})\`);
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
          battle.battleLog.push(\`🐕 \${fighter.name}'s dog attacks \${target.name} for \${damage} damage!\`);
          
          if (target.hp === 0) {
            battle.battleLog.push(\`💀 \${target.name} was defeated by the loyal dog!\`);
          }
        }
      }
    });
  }

`;
  content = content.slice(0, afterExecuteAction) + applyPetPassivesMethod + content.slice(afterExecuteAction);
}

// Modify executeDamageAbility to apply pet modifiers
// Find where finalDamage is calculated and add pet effects

// 1. Add defense reduction (🐻 Bear)
const afterFinalDamage = content.indexOf('    // Apply combo bonus for hero');
if (afterFinalDamage > 0) {
  const defenseCode = `
    // Apply pet passive: defense reduction (🐻 Bear)
    targetList.forEach(target => {
      if (target.petPassive && target.petPassive.effect === 'defense' && target.petPassive.value) {
        const reductionPercent = target.petPassive.value;
        const originalDamage = finalDamage;
        finalDamage = Math.floor(finalDamage * (1 - reductionPercent));
        if (originalDamage !== finalDamage) {
          battle.battleLog.push(\`🐻 \${target.name}'s thick fur reduces damage by \${Math.floor(reductionPercent * 100)}%!\`);
        }
      }
    });
    
    // Apply pet passive: rage damage bonus (🐂 Bull)
    if (attacker.petPassive && attacker.petPassive.effect === 'rage' && attacker.rageStacks > 0) {
      finalDamage += attacker.rageStacks;
    }
    
    `;
  content = content.slice(0, afterFinalDamage) + defenseCode + content.slice(afterFinalDamage);
}

// 2. Add stun/bleed/dodge/splash chance bonuses
// Find where targetList damage is applied
const damageApplicationStart = content.indexOf('    targetList.forEach(target => {\n      let damage = finalDamage;');
if (damageApplicationStart > 0) {
  // Add dodge check at the start of damage application
  const dodgeCheck = `    targetList.forEach(target => {
      // Apply pet passive: dodge chance (🐙 Octopus)
      if (target.petPassive && target.petPassive.effect === 'dodge' && target.petPassive.value) {
        const dodgeChance = target.petPassive.value;
        if (Math.random() < dodgeChance) {
          battle.battleLog.push(\`🐙 \${target.name} dodges the attack with ink cloud!\`);
          return; // Skip this target
        }
      }
      
      let damage = finalDamage;`;
  
  content = content.replace(
    '    targetList.forEach(target => {\n      let damage = finalDamage;',
    dodgeCheck
  );
}

// Add stun/bleed chance bonuses and apply effects
const afterDamageCalc = content.indexOf('      // Check shield');
if (afterDamageCalc > 0) {
  const effectsCode = `
      // Apply pet passive: increased stun chance (🕷️ Spider)
      if (attacker.petPassive && attacker.petPassive.effect === 'stun' && attacker.petPassive.value) {
        const stunChance = attacker.petPassive.value;
        if (Math.random() < stunChance && !target.effects.includes('stun')) {
          target.effects.push('stun');
          battle.battleLog.push(\`🕷️ \${target.name} is stunned by web trap!\`);
        }
      }
      
      // Apply pet passive: bleed chance (🐍 Snake)
      if (attacker.petPassive && attacker.petPassive.effect === 'bleed' && attacker.petPassive.value) {
        const bleedChance = attacker.petPassive.value;
        if (Math.random() < bleedChance && !target.effects.includes('bleed')) {
          target.effects.push('bleed');
          battle.battleLog.push(\`🐍 \${target.name} is bleeding from snake bite!\`);
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
            battle.battleLog.push(\`🐋 Tidal wave splashes \${splashTarget.name} for \${splashDamage} damage!\`);
          }
        }
      }
      
      // Apply pet passive: headbutt bonus damage (🐐 Goat)
      if (attacker.petPassive && attacker.petPassive.effect === 'damage' && attacker.petPassive.value && attacker.petPassive.dmg) {
        const procChance = attacker.petPassive.value;
        if (Math.random() < procChance) {
          const bonusDamage = attacker.petPassive.dmg;
          damage += bonusDamage;
          battle.battleLog.push(\`🐐 \${attacker.name} headbutts for +\${bonusDamage} bonus damage!\`);
        }
      }
      
      `;
  content = content.slice(0, afterDamageCalc) + effectsCode + content.slice(afterDamageCalc);
}

// Add Cat's Nine Lives survival passive - check when HP would go to 0
const hpZeroCheck = content.indexOf('      target.hp -= damage;');
if (hpZeroCheck > 0) {
  const survivalCode = `      // Apply pet passive: survival chance (🐈 Cat)
      const wouldDie = (target.hp - damage) <= 0;
      if (wouldDie && target.petPassive && target.petPassive.effect === 'survival' && target.petPassive.value) {
        const survivalChance = target.petPassive.value;
        if (Math.random() < survivalChance) {
          target.hp = 1;
          battle.battleLog.push(\`🐈 \${target.name} survives with Nine Lives!\`);
          return; // Skip normal damage
        }
      }
      
      `;
  content = content.slice(0, hpZeroCheck) + survivalCode + content.slice(hpZeroCheck);
}

// Add applyPetPassives call at the start of each round
// Find where turns are executed
const executeTurnStart = content.indexOf('  async executeTurn(ctx, battle)');
if (executeTurnStart > 0) {
  const afterTurnStart = content.indexOf('{', executeTurnStart) + 1;
  const applyPassivesCall = `
    // Apply pet passive abilities at start of turn
    this.applyPetPassives(battle);
    `;
  content = content.slice(0, afterTurnStart) + applyPassivesCall + content.slice(afterTurnStart);
}

fs.writeFileSync('src/services/BattleService.js', content);
console.log('✓ Implemented pet passive abilities with rarity scaling');
