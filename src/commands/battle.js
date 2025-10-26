const { Markup } = require('telegraf');

const displayBattle = (battle) => {
  const team = battle.team.map((f, i) => {
    const hpBar = '█'.repeat(Math.max(0, Math.floor(f.hp / 10))) + '░'.repeat(Math.max(0, 10 - Math.floor(f.hp / 10)));
    const effects = f.effects.map(e => e.type === 'stun' ? '✨' : e.type === 'bleed' ? '🩸' : '').join('');
    return `${f.name} ${effects}\\n${hpBar} ${f.hp}/${f.maxHp}HP${f.shield > 0 ? ` 🛡️${f.shield}` : ''}`;
  }).join('\\n\\n');

  const enemies = battle.enemies.map((f, i) => {
    const hpBar = '█'.repeat(Math.max(0, Math.floor(f.hp / 10))) + '░'.repeat(Math.max(0, 10 - Math.floor(f.hp / 10)));
    const effects = f.effects.map(e => e.type === 'stun' ? '✨' : e.type === 'bleed' ? '🩸' : '').join('');
    return `${f.name} ${effects}\\n${hpBar} ${f.hp}/${f.maxHp}HP`;
  }).join('\\n\\n');

  return `
🦈**TerminalOne🦈v0.04**

⚔️ **Battle - Turn ${battle.turn}**

**Your Team:**
${team}

━━━━━━━━━━━━━━━

**Enemies:**
${enemies}
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
  const log = battle.battleLog.join('\\n');
  
  let message = `
🦈**TerminalOne🦈v0.04**

⚔️ **Battle Complete!**

${log}

**Final Stats:**
💥 Damage Dealt: ${battle.totalDamageDealt}
🛡️ Damage Taken: ${battle.totalDamageTaken}
`;

  const buttons = [[Markup.button.callback('🔙 Battle Menu', 'hero_battle_menu')]];

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

module.exports = {
  handleStartBattle,
  handleSelectAbility,
  handleFleeBattle
};
