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

  const buttons = [[Markup.button.callback('🔙 Back', 'hero_menu'), Markup.button.callback('🏠 Main Menu', 'back_to_main')]];
  
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
      [Markup.button.callback('🔙 Back', 'hero_menu'), Markup.button.callback('🏠 Main Menu', 'back_to_main')]
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
  `;

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🎽 Equip', 'inventory_equip'), Markup.button.callback('🔀 Fuse', 'inventory_fuse')],
      [Markup.button.callback('💰 Sell', 'inventory_sell'), Markup.button.callback('🛒 Shop', 'inventory_shop')],
      [Markup.button.callback('🔙 Back', 'hero_menu'), Markup.button.callback('🏠 Main Menu', 'back_to_main')]
    ])
  });
};

// EQUIP SYSTEM
const handleInventoryEquip = async (ctx) => {
  const message = `
${getBotTitle()}

🎽 **Equip Items**

Select item type to equip:
  `;

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('👤 Classes', 'equip_class')],
      [Markup.button.callback('⚔️ Weapons', 'equip_weapon')],
      [Markup.button.callback('🐾 Pets', 'equip_pet')],
      [Markup.button.callback('🔙 Back', 'hero_inventory')]
    ])
  });
};

const handleEquipType = async (ctx, type) => {
  const userId = ctx.from.id;
  const heroService = ctx.services.hero;
  const hero = heroService.getHero(userId);

  const typeNames = { class: '👤 Classes', weapon: '⚔️ Weapons', pet: '🐾 Pets' };
  const items = hero.inventory.filter(i => i.type === type)
    .sort((a, b) => {
      const rarityOrder = { legendary: 0, rare: 1, common: 2 };
      return rarityOrder[a.rarity] - rarityOrder[b.rarity];
    });

  if (items.length === 0) {
    await ctx.answerCbQuery(`No ${type}s available!`);
    return;
  }

  const rarityEmoji = { common: '⚪', rare: '🔵', legendary: '🟠' };
  const itemList = items.slice(0, 10).map((item, idx) => {
    const name = type === 'class' ? CLASSES[item.id].name :
                 type === 'weapon' ? WEAPONS[item.id].name :
                 PETS[item.id].name;
    return `${rarityEmoji[item.rarity]} ${idx + 1}. ${item.id} ${name}`;
  }).join('\\n');

  const message = `
${getBotTitle()}

${typeNames[type]}

**Available items:**
${itemList}
${items.length > 10 ? `\\n... and ${items.length - 10} more` : ''}

${hero.equipped[type] ? `\\n**Currently equipped:** ${hero.equipped[type]}` : ''}
  `;

  const buttons = [];
  items.slice(0, 10).forEach((_, idx) => {
    if (idx % 2 === 0) {
      buttons.push([
        Markup.button.callback(`${idx + 1}`, `equip_do_${type}_${idx}`),
        items[idx + 1] ? Markup.button.callback(`${idx + 2}`, `equip_do_${type}_${idx + 1}`) : null
      ].filter(Boolean));
    }
  });

  if (hero.equipped[type]) {
    buttons.push([Markup.button.callback('🔓 Unequip', `unequip_${type}`)]);
  }
  
  buttons.push([Markup.button.callback('🔙 Back', 'inventory_equip')]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

// FUSE SYSTEM
const handleInventoryFuse = async (ctx) => {
  const userId = ctx.from.id;
  const heroService = ctx.services.hero;
  const hero = heroService.getHero(userId);

  // Find fuseable items
  const grouped = {};
  hero.inventory.forEach(item => {
    if (item.rarity === 'legendary') return;
    const key = `${item.type}_${item.id}_${item.rarity}`;
    if (!grouped[key]) grouped[key] = { count: 0, item };
    grouped[key].count++;
  });

  const fuseable = Object.values(grouped).filter(g => g.count >= 5);

  const message = `
${getBotTitle()}

🔀 **Fuse Items**

${fuseable.length > 0 ? '**Fuseable items (5+ of same):**' : '⚠️ No fuseable items!\\nNeed 5+ identical items'}

${fuseable.length > 0 ? fuseable.map(g => {
  const rarityEmoji = { common: '⚪', rare: '🔵' };
  const name = g.item.type === 'class' ? CLASSES[g.item.id].name :
               g.item.type === 'weapon' ? WEAPONS[g.item.id].name :
               PETS[g.item.id].name;
  return `${rarityEmoji[g.item.rarity]} ${g.item.id} ${name} (${g.count})`;
}).join('\\n') : ''}

**Fusion rules:**
• 5 Common → 1 Rare
• 5 Rare → 1 Legendary
  `;

  const buttons = [];
  if (fuseable.length > 0) {
    buttons.push([Markup.button.callback('✨ Auto-Fuse All', 'fuse_auto')]);
  }
  buttons.push([Markup.button.callback('🔙 Back', 'hero_inventory')]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

// SELL SYSTEM
const handleInventorySell = async (ctx) => {
  const userId = ctx.from.id;
  const heroService = ctx.services.hero;
  const hero = heroService.getHero(userId);

  if (hero.inventory.length === 0) {
    await ctx.answerCbQuery('No items to sell!');
    return;
  }

  const rarityEmoji = { common: '⚪', rare: '🔵', legendary: '🟠' };
  const items = hero.inventory.slice(0, 10);
  
  const itemList = items.map((item, idx) => {
    const name = item.type === 'class' ? CLASSES[item.id].name :
                 item.type === 'weapon' ? WEAPONS[item.id].name :
                 PETS[item.id].name;
    const isPet = item.type === 'pet';
    const prices = {
      common: isPet ? 50 : 25,
      rare: isPet ? 500 : 250,
      legendary: isPet ? 5000 : 2500
    };
    return `${rarityEmoji[item.rarity]} ${idx + 1}. ${item.id} ${name} (${prices[item.rarity]}💎)`;
  }).join('\\n');

  const message = `
${getBotTitle()}

💰 **Sell Items**

💎 **Your Currency:** ${hero.currency} S

**Items:**
${itemList}
${hero.inventory.length > 10 ? `\\n... and ${hero.inventory.length - 10} more` : ''}

**Prices:**
⚪ Class/Weapon: 25 | Pet: 50
🔵 Class/Weapon: 250 | Pet: 500
🟠 Class/Weapon: 2500 | Pet: 5000
  `;

  const buttons = [];
  items.forEach((_, idx) => {
    if (idx % 2 === 0) {
      buttons.push([
        Markup.button.callback(`${idx + 1}`, `sell_do_${idx}`),
        items[idx + 1] ? Markup.button.callback(`${idx + 2}`, `sell_do_${idx + 1}`) : null
      ].filter(Boolean));
    }
  });
  
  buttons.push([Markup.button.callback('🔙 Back', 'hero_inventory')]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

// SHOP SYSTEM
const handleInventoryShop = async (ctx) => {
  const userId = ctx.from.id;
  const heroService = ctx.services.hero;
  const hero = heroService.getHero(userId);
  const shop = heroService.getShopItems(userId);

  const rarityEmoji = { common: '⚪', rare: '🔵', legendary: '🟠' };
  
  const shopList = shop.map((item, idx) => {
    const name = item.type === 'class' ? CLASSES[item.id].name :
                 item.type === 'weapon' ? WEAPONS[item.id].name :
                 PETS[item.id].name;
    return `${rarityEmoji[item.rarity]} ${idx + 1}. ${item.id} ${name} - ${item.price}💎`;
  }).join('\\n');

  const nextRotation = hero.shop ? new Date(hero.shop.lastRotation + 8 * 60 * 60 * 1000) : new Date();
  const hoursLeft = Math.ceil((nextRotation - Date.now()) / (1000 * 60 * 60));

  const message = `
${getBotTitle()}

🛒 **Item Shop**

💎 **Your Currency:** ${hero.currency} S

**Available items:**
${shopList}

⏰ **Shop rotates in:** ${hoursLeft}h

**Prices:**
⚪ Class/Weapon: 250 | Pet: 500
🔵 Class/Weapon: 2500 | Pet: 5000
🟠 Class/Weapon: 25000 | Pet: 50000
  `;

  const buttons = [];
  shop.forEach((_, idx) => {
    buttons.push([Markup.button.callback(`Buy ${idx + 1}`, `shop_buy_${idx}`)]);
  });
  
  buttons.push([Markup.button.callback('🔙 Back', 'hero_inventory')]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

module.exports = {
  handleHeroMenu,
  handleProfile,
  handleBattleMenu,
  handleInventory,
  handleInventoryEquip,
  handleEquipType,
  handleInventoryFuse,
  handleInventorySell,
  handleInventoryShop
};
