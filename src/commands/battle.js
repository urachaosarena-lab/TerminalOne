const { Markup } = require('telegraf');
const { getBotTitle } = require('../utils/version');

const getStatusEffects = (fighter) => {
  if (!fighter.effects || fighter.effects.length === 0) return '';
  const icons = fighter.effects.map(e => {
    if (e.type === 'stun') return '✨';
    if (e.type === 'bleed') return '🩸';
    if (e.type === 'shield') return '🛡️';
    return '';
  }).join('');
  return icons ? ` ${icons}` : '';
};

const displayBattle = (battle) => {
  // Display enemies at top
  const enemies = battle.enemies.map((f) => {
    const dead = f.hp <= 0 ? '💀' : '';
    const hpBar = '█'.repeat(Math.max(0, Math.floor(f.hp / 10))) + '░'.repeat(Math.max(0, 10 - Math.floor(f.hp / 10)));
    const statusEffects = getStatusEffects(f);
    const lastAction = f.lastAction || '';
    return `${dead}${f.name} | ${hpBar} ${f.hp}/${f.maxHp}HP${statusEffects} | ${lastAction}`;
  }).join('\n');

  // Environment separator
  const environment = '🌲🏞️🌳⛰️🌴🏞️🌲⛰️🌳🏞️🌲⛰️🌳';

  // Display team at bottom
  const team = battle.team.map((f) => {
    const dead = f.hp <= 0 ? '💀' : '';
    const hpBar = '█'.repeat(Math.max(0, Math.floor(f.hp / 10))) + '░'.repeat(Math.max(0, 10 - Math.floor(f.hp / 10)));
    const statusEffects = getStatusEffects(f);
    const lastAction = f.lastAction || '';
    return `${dead}${f.name} | ${hpBar} ${f.hp}/${f.maxHp}HP${statusEffects} | ${lastAction}`;
  }).join('\n');

  return `
${getBotTitle()}

⚔️ **Battle - Turn ${battle.turn}**

**Enemies:**
${enemies}

${environment}

**TerminalOne Team:**
${team}
`;
};

const handleStartBattle = async (ctx) => {
  const userId = ctx.from.id;
  const battleService = ctx.services?.battle;
  
  if (!battleService) {
    await ctx.answerCbQuery('❌ Battle service not available');
    return;
  }

  const result = battleService.startBattle(userId);
  
  if (result.error) {
    await ctx.answerCbQuery(result.error, { show_alert: true });
    return;
  }

  const battle = result;
  const hero = battle.team[0];
  
  const message = displayBattle(battle);

  const buttons = hero.abilities.map((ability, i) => {
    const desc = ability.desc || ability.name;
    return [Markup.button.callback(`${i + 1}. ${ability.name}`, `ability_${i}`)];
  });
  buttons.push([Markup.button.callback('❌ Flee Battle', 'battle_flee')]);

  await ctx.editMessageText(message + '\n\n**Select your ability:**', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

const handleSelectAbility = async (ctx) => {
  const userId = ctx.from.id;
  const battleService = ctx.services.battle;
  const abilityIndex = parseInt(ctx.match[1]);

  const battle = battleService.selectAbility(userId, abilityIndex);
  if (!battle) {
    await ctx.answerCbQuery('❌ Invalid ability');
    return;
  }

  const hero = battle.team[0];
  const selectedAbility = hero.abilities[abilityIndex];
  
  // If single-target ability, show target selection
  if (selectedAbility.target === 'single' && !selectedAbility.effect) {
    await ctx.answerCbQuery('🎯 Select target...');
    await displayTargetSelection(ctx, battle, abilityIndex);
    return;
  }

  await ctx.answerCbQuery('⚔️ Ability selected! Executing turn...');
  
  // Execute turn
  const result = battleService.executeTurn(userId);
  
  if (result.ended) {
    await displayBattleEnd(ctx, result);
  } else {
    await displayBattleTurn(ctx, result);
  }
};

const displayTargetSelection = async (ctx, battle, abilityIndex) => {
  const battleDisplay = displayBattle(battle);
  const hero = battle.team[0];
  const ability = hero.abilities[abilityIndex];
  
  const message = battleDisplay + `\n\n🎯 **${ability.name}** - Select target:`;
  
  const buttons = battle.enemies
    .map((enemy, i) => {
      if (enemy.hp > 0) {
        return [Markup.button.callback(`${enemy.name} (${enemy.hp}HP)`, `target_${abilityIndex}_${i}`)];
      }
      return null;
    })
    .filter(b => b !== null);
  
  buttons.push([Markup.button.callback('🔙 Back to Abilities', 'battle_back')]);
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

const handleSelectTarget = async (ctx) => {
  const userId = ctx.from.id;
  const battleService = ctx.services.battle;
  const [abilityIndex, targetIndex] = ctx.match[1].split('_').map(Number);
  
  const battle = battleService.setTarget(userId, targetIndex);
  
  // Check if QTE triggered
  if (battle.qteActive) {
    await ctx.answerCbQuery('🎯 CRITICAL CHANCE!');
    await displayQTE(ctx, battle);
  } else {
    await ctx.answerCbQuery('⚔️ Target locked! Executing turn...');
    
    // Execute turn
    const result = battleService.executeTurn(userId);
    
    if (result.ended) {
      await displayBattleEnd(ctx, result);
    } else {
      await displayBattleTurn(ctx, result);
    }
  }
};

const displayQTE = async (ctx, battle) => {
  const battleDisplay = displayBattle(battle);
  const message = battleDisplay + `\n\n💥 **CRITICAL CHANCE!**\n👊 Tap as fast as you can! (3s)\n\nTaps: ${battle.qteCount}`;
  
  const buttons = [
    [Markup.button.callback('💥 TAP! 💥', 'qte_tap')],
    [Markup.button.callback('⏭️ Skip', 'qte_finish')]
  ];
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
  
  // Auto-finish after 3 seconds
  setTimeout(async () => {
    const battleService = ctx.services.battle;
    const currentBattle = battleService.getBattle(ctx.from.id);
    if (currentBattle && currentBattle.qteActive) {
      await handleQTEFinish(ctx);
    }
  }, 3000);
};

const handleQTETap = async (ctx) => {
  const userId = ctx.from.id;
  const battleService = ctx.services.battle;
  
  const result = battleService.qteButtonPress(userId);
  
  if (!result) {
    await ctx.answerCbQuery('❌ QTE not active');
    return;
  }
  
  if (result.expired) {
    await ctx.answerCbQuery(`⏱️ Time up! ${result.count} taps!`);
    await handleQTEFinish(ctx);
  } else {
    await ctx.answerCbQuery(`💥 ${result.count}!`, { show_alert: false });
    const battle = battleService.getBattle(userId);
    if (battle && battle.qteActive) {
      await displayQTE(ctx, battle);
    }
  }
};

const handleQTEFinish = async (ctx) => {
  const userId = ctx.from.id;
  const battleService = ctx.services.battle;
  
  const battle = battleService.qteFinish(userId);
  if (!battle) return;
  
  if (battle.qteCount > 0) {
    await ctx.answerCbQuery(`💥 ${battle.qteCount} taps recorded!`);
  }
  
  // Execute turn
  const result = battleService.executeTurn(userId);
  
  if (result.ended) {
    await displayBattleEnd(ctx, result);
  } else {
    await displayBattleTurn(ctx, result);
  }
};

const handleBackToAbilities = async (ctx) => {
  const userId = ctx.from.id;
  const battleService = ctx.services.battle;
  const battle = battleService.getBattle(userId);
  
  if (!battle) {
    await ctx.answerCbQuery('❌ Battle not found');
    return;
  }
  
  await ctx.answerCbQuery('🔙 Back to abilities');
  await displayBattleTurn(ctx, battle);
};

const displayBattleTurn = async (ctx, battle) => {
  const hero = battle.team[0];
  
  // Build battle log FIRST
  const log = battle.battleLog.join('\n');
  const logSection = log ? `**Battle Log:**\n${log}\n\n` : '';
  
  // Then get battle display (enemies + environment + team)
  const battleDisplay = displayBattle(battle);
  
  const message = battleDisplay + '\n' + logSection + '**Select your ability:**';

  const buttons = hero.abilities.map((ability, i) => {
    return [Markup.button.callback(`${i + 1}. ${ability.name}`, `ability_${i}`)];
  });
  buttons.push([Markup.button.callback('❌ Flee Battle', 'battle_flee')]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

const displayBattleEnd = async (ctx, battle) => {
  let message = `
${getBotTitle()}

⚔️ **Battle Complete!**

${battle.won ? '🎉 **VICTORY!**' : '💀 **DEFEAT...**'}

**Final Stats:**
💥 Damage Dealt: ${battle.totalDamageDealt}
🛡️ Damage Taken: ${battle.totalDamageTaken}
`;

  if (battle.won && battle.rewards) {
    message += `

🎁 **Rewards:**
• +${battle.rewards.xp} XP
• +${battle.rewards.currency} 💎S`;
    
    if (battle.rewards.item) {
      const rarityEmoji = battle.rewards.item.rarity === 'common' ? '⚪' : 
                          battle.rewards.item.rarity === 'rare' ? '🔵' : '🟠';
      message += `
• ${rarityEmoji} ${battle.rewards.item.id} ${battle.rewards.item.type}`;
    }
  }

  const buttons = battle.won ? 
    [[Markup.button.callback('🎁 Collect Rewards', 'battle_collect')]] :
    [[Markup.button.callback('🔙 Battle Menu', 'hero_battle_menu')]];

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

const handleFleeBattle = async (ctx) => {
  const userId = ctx.from.id;
  const battleService = ctx.services.battle;
  
  const battle = battleService.getBattle(userId);
  if (battle) {
    battleService.endBattle(userId, false);
  }

  await ctx.answerCbQuery('🏃 Fled from battle!');
  await ctx.editMessageText('💨 You fled from the battle!', {
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Battle Menu', 'hero_battle_menu')]])
  });
};

const handleCollectRewards = async (ctx) => {
  await ctx.answerCbQuery('🎁 Rewards collected!');
  await ctx.editMessageText('✅ Rewards collected! Check your Hero profile.', {
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Battle Menu', 'hero_battle_menu')]])
  });
};

module.exports = {
  handleStartBattle,
  handleSelectAbility,
  handleSelectTarget,
  handleBackToAbilities,
  handleQTETap,
  handleQTEFinish,
  handleFleeBattle,
  handleCollectRewards
};
