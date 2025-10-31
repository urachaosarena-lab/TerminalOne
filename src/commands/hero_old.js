const { Markup } = require('telegraf');
const { getBotTitle } = require('../utils/version');
const { CLASSES, WEAPONS, PETS } = require('../services/HeroService');

const handleHeroMenu = async (ctx) => {
  const userId = ctx.from.id;
  const heroService = ctx.services?.hero;
  
  if (!heroService) {
    await ctx.reply('❌ Hero service not available');
    return;
  }

  const hero = heroService.getOrCreateHero(userId);
  heroService.rechargeEnergy(userId);

  const message = `
${getBotTitle()}

⚔️ **Hero RPG Game**

Welcome to the arena! Battle enemies with your companions **👩‍🦰Mira** and **🦈Jawzy** in turn-based combat.

📜 **Rules:**
• Each battle: You + 2 AI companions vs 3 enemies
• Select your ability each turn
• Companions attack automatically
• Win battles to gain XP, 💎S currency, and loot!

⚡ **Energy:** ${hero.energy}/${hero.maxEnergy} (${hero.energy < hero.maxEnergy ? 'recharges 1/hour' : 'full!'})
🧪 **Level:** ${hero.level}
💎 **Currency:** ${hero.currency} S

🎮 **Choose your path:**
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('👤 Profile', 'hero_profile')],
    [Markup.button.callback('⚔️ Battle', 'hero_battle_menu')],
    [Markup.button.callback('🎒 Inventory', 'hero_inventory')],
    [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } else {
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  }
};

const handleProfile = async (ctx) => {
  const userId = ctx.from.id;
  const heroService = ctx.services.hero;
  const hero = heroService.getHero(userId);

  const xpProgress = hero.xp / hero.xpToNextLevel;
  const xpBar = '█'.repeat(Math.floor(xpProgress * 10)) + '░'.repeat(10 - Math.floor(xpProgress * 10));

  const equippedClass = hero.equipped.class ? `${hero.equipped.class} ${CLASSES[hero.equipped.class].name}` : '❌ None';
  const equippedWeapon = hero.equipped.weapon ? `${hero.equipped.weapon} ${WEAPONS[hero.equipped.weapon].name}` : '❌ None';
  const equippedPet = hero.equipped.pet ? `${hero.equipped.pet} ${PETS[hero.equipped.pet].name}` : '❌ None';

  const message = `
${getBotTitle()}

👤 **Hero Profile**

🧪 **Level:** ${hero.level}
🌡️ **XP:** ${hero.xp}/${hero.xpToNextLevel}
${xpBar}

⚡ **Energy:** ${hero.energy}/${hero.maxEnergy}

💪 **Strength:** ${hero.strength}/100 (+${(hero.strength * 0.5).toFixed(1)} dmg)
🔮 **Wisdom:** ${hero.wisdom}/100 (+${(hero.wisdom * 0.5).toFixed(1)}% support)
🍀 **Luck:** ${hero.luck}/100 (+${(hero.luck * 0.5).toFixed(1)}% loot/💎S)

${hero.unspentPoints > 0 ? `✨ **Unspent Points:** ${hero.unspentPoints}` : ''}

👤 **Equipped:**
• Class: ${equippedClass}
• Weapon: ${equippedWeapon}
• Pet: ${equippedPet}

💎 **Currency:** ${hero.currency} S
🎒 **Inventory:** ${hero.inventory.length}/${hero.maxInventory}

📊 **Battle Stats:**
• Total: ${hero.stats.totalBattles} | Won: ${hero.stats.won} | Lost: ${hero.stats.lost}
• Win Rate: ${hero.stats.totalBattles > 0 ? ((hero.stats.won / hero.stats.totalBattles) * 100).toFixed(1) : 0}%
• Damage Dealt: ${hero.stats.damageDealt}
• Strategies: ${hero.stats.strategiesOpened} opened, ${hero.stats.strategiesClosed} closed
  `;

  const buttons = [[Markup.button.callback('🔙 Back', 'hero_menu')]];
  
  if (hero.unspentPoints > 0) {
    buttons.unshift(
      [Markup.button.callback('💪 +STR', 'stat_strength'), Markup.button.callback('🔮 +WIS', 'stat_wisdom'), Markup.button.callback('🍀 +LUCK', 'stat_luck')]
    );
  }

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

const handleBattleMenu = async (ctx) => {
  const userId = ctx.from.id;
  const heroService = ctx.services.hero;
  const hero = heroService.getHero(userId);

  heroService.rechargeEnergy(userId);

  const winRate = hero.stats.totalBattles > 0 ? ((hero.stats.won / hero.stats.totalBattles) * 100).toFixed(1) : 0;

  const message = `
${getBotTitle()}

⚔️ **Battle Arena**

🧟 **PvE Stats:**
• Battles: ${hero.stats.totalBattles}
• Won: ${hero.stats.won}
• Lost: ${hero.stats.lost}
• Win Rate: ${winRate}%

⚡ **Energy:** ${hero.energy}/${hero.maxEnergy}

🗡️ **PvP:** 🚧 Under Construction 🚧
*Coming in Phase 2 with ranked ladder!*

${hero.energy > 0 ? '⚔️ Ready to battle!' : '⏰ Energy recharges 1/hour'}
  `;

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🧟 Start PvE Battle', 'battle_start')],
      [Markup.button.callback('🔙 Back', 'hero_menu')]
    ])
  });
};

const handleInventory = async (ctx) => {
  const userId = ctx.from.id;
  const heroService = ctx.services.hero;
  const hero = heroService.getHero(userId);

  const rarityEmoji = { common: '⚪', rare: '🔵', legendary: '🟠' };
  
  const classItems = hero.inventory.filter(i => i.type === 'class');
  const weaponItems = hero.inventory.filter(i => i.type === 'weapon');
  const petItems = hero.inventory.filter(i => i.type === 'pet');

  const commonCount = hero.inventory.filter(i => i.rarity === 'common').length;
  const rareCount = hero.inventory.filter(i => i.rarity === 'rare').length;
  const legendaryCount = hero.inventory.filter(i => i.rarity === 'legendary').length;

  let itemsList = '';
  if (hero.inventory.length === 0) {
    itemsList = '📭 Empty - win battles to get loot!';
  } else {
    const preview = hero.inventory.slice(0, 10);
    itemsList = preview.map((item, idx) => {
      const emoji = rarityEmoji[item.rarity];
      const name = item.type === 'class' ? CLASSES[item.id].name :
                   item.type === 'weapon' ? WEAPONS[item.id].name :
                   PETS[item.id].name;
      return `${emoji} ${idx + 1}. ${item.id} ${name}`;
    }).join('\\n');
    if (hero.inventory.length > 10) {
      itemsList += `\\n... and ${hero.inventory.length - 10} more`;
    }
  }

  const message = `
${getBotTitle()}

🎒 **Inventory** (${hero.inventory.length}/${hero.maxInventory})

💎 **Currency:** ${hero.currency} S

📦 **By Rarity:**
⚪ Common: ${commonCount} | 🔵 Rare: ${rareCount} | 🟠 Legendary: ${legendaryCount}

📦 **By Type:**
👤 Classes: ${classItems.length} | ⚔️ Weapons: ${weaponItems.length} | 🐾 Pets: ${petItems.length}

**Items:**
${itemsList}

**Actions:**
• Sell items for 💎S (15/30/60)
• Fuse 5 commons → 1 rare
• Fuse 5 rares → 1 legendary
  `;

  const buttons = [[Markup.button.callback('💰 Manage Items', 'inventory_manage')]];
  
  if (commonCount >= 5) {
    buttons.push([Markup.button.callback('🔀 Fuse Commons (5→1 Rare)', 'fuse_common')]);
  }
  if (rareCount >= 5) {
    buttons.push([Markup.button.callback('🔀 Fuse Rares (5→1 Legendary)', 'fuse_rare')]);
  }

  buttons.push([Markup.button.callback('🔙 Back', 'hero_menu')]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

module.exports = {
  handleHeroMenu,
  handleProfile,
  handleBattleMenu,
  handleInventory
};
