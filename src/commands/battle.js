const { Markup } = require('telegraf');
const { getBotTitle } = require('../utils/version');

const displayBattle = (battle) => {
  // Display enemies at top
  const enemies = battle.enemies.map((f) => {
    const dead = f.hp <= 0 ? '💀' : '';
    const hpBar = '█'.repeat(Math.max(0, Math.floor(f.hp / 10))) + '░'.repeat(Math.max(0, 10 - Math.floor(f.hp / 10)));
    const lastAction = f.lastAction || '';
    return `${dead}${f.name} | ${hpBar} ${f.hp}/${f.maxHp}HP | ${lastAction}`;
  }).join('\n');

  // Environment separator
  const environment = '🌲🏞️🌳⛰️🌴🏞️🌲⛰️🌳🏞️🌲⛰️🌳';

  // Display team at bottom
  const team = battle.team.map((f) => {
    const dead = f.hp <= 0 ? '💀' : '';
    const hpBar = '█'.repeat(Math.max(0, Math.floor(f.hp / 10))) + '░'.repeat(Math.max(0, 10 - Math.floor(f.hp / 10)));
    const lastAction = f.lastAction || '';
    return `${dead}${f.name} | ${hpBar} ${f.hp}/${f.maxHp}HP | ${lastAction}`;
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

  await ctx.editMessageText(message + '\\n\\n**Select your ability:**', {
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

  await ctx.answerCbQuery('⚔️ Ability selected! Executing turn...');
  
  // Execute turn
  const result = battleService.executeTurn(userId);
  
  if (result.ended) {
    await displayBattleEnd(ctx, result);
  } else {
    await displayBattleTurn(ctx, result);
  }
};

const displayBattleTurn = async (ctx, battle) => {
  const hero = battle.team[0];
  const battleDisplay = displayBattle(battle);
  
  const log = battle.battleLog.join('\\n');
  
  const message = battleDisplay + '\\n\\n**Battle Log:**\\n' + log + '\\n\\n**Select your ability:**';

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
  handleFleeBattle,
  handleCollectRewards
};
