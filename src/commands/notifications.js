const { Markup } = require('telegraf');

module.exports = (bot, notificationService) => {
  
  /**
   * Main notifications settings menu
   */
  bot.action('notifications', async (ctx) => {
    const userId = ctx.from.id;
    const prefs = notificationService.getUserPreferences(userId);
    
    const statusIcon = prefs.enabled ? '🔔' : '🔕';
    const statusText = prefs.enabled ? 'Enabled' : 'Disabled';
    
    const message = `${statusIcon} *Notification Settings*\n\n` +
      `Status: *${statusText}*\n` +
      `Quiet Hours: ${prefs.quietHours.enabled ? '✅ On' : '❌ Off'}\n\n` +
      `Configure your trading notifications below.`;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          prefs.enabled ? '🔕 Disable All' : '🔔 Enable All',
          'notify_toggle_all'
        )
      ],
      [
        Markup.button.callback('⚙️ Event Settings', 'notify_events'),
        Markup.button.callback('🌙 Quiet Hours', 'notify_quiet_hours')
      ],
      [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  });
  
  /**
   * Toggle all notifications on/off
   */
  bot.action('notify_toggle_all', async (ctx) => {
    const userId = ctx.from.id;
    const prefs = notificationService.getUserPreferences(userId);
    
    notificationService.updatePreferences(userId, {
      enabled: !prefs.enabled
    });
    
    await ctx.answerCbQuery(prefs.enabled ? 'Notifications disabled' : 'Notifications enabled');
    
    // Refresh the menu by re-rendering
    const updatedPrefs = notificationService.getUserPreferences(userId);
    const statusIcon = updatedPrefs.enabled ? '🔔' : '🔕';
    const statusText = updatedPrefs.enabled ? 'Enabled' : 'Disabled';
    
    const message = `${statusIcon} *Notification Settings*\\n\\n` +
      `Status: *${statusText}*\\n` +
      `Quiet Hours: ${updatedPrefs.quietHours.enabled ? '✅ On' : '❌ Off'}\\n\\n` +
      `Configure your trading notifications below.`;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          updatedPrefs.enabled ? '🔕 Disable All' : '🔔 Enable All',
          'notify_toggle_all'
        )
      ],
      [
        Markup.button.callback('⚙️ Event Settings', 'notify_events'),
        Markup.button.callback('🌙 Quiet Hours', 'notify_quiet_hours')
      ],
      [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  });
  
  /**
   * Event-specific settings menu
   */
  bot.action('notify_events', async (ctx) => {
    const userId = ctx.from.id;
    const prefs = notificationService.getUserPreferences(userId);
    
    const eventNames = {
      gridBuy: '🟢 Grid Buys',
      gridSell: '🔴 Grid Sells',
      gridComplete: '✅ Grid Complete',
      gridError: '❌ Grid Errors',
      martingaleBuy: '🟢 Martingale Buys',
      martingaleSell: '🔴 Martingale Sells',
      martingaleComplete: '✅ Martingale Complete',
      martingaleError: '❌ Martingale Errors',
      profitTarget: '🎯 Profit Targets',
      stopLoss: '🛑 Stop Loss',
      lowBalance: '⚠️ Low Balance'
    };
    
    let message = '⚙️ *Event Notification Settings*\n\n';
    message += 'Toggle individual event notifications:\n\n';
    
    Object.entries(prefs.events).forEach(([event, enabled]) => {
      const icon = enabled ? '✅' : '❌';
      message += `${icon} ${eventNames[event]}\n`;
    });
    
    const keyboard = [];
    
    // Create rows of 2 buttons each
    const events = Object.keys(prefs.events);
    for (let i = 0; i < events.length; i += 2) {
      const row = [];
      
      for (let j = 0; j < 2 && i + j < events.length; j++) {
        const event = events[i + j];
        const enabled = prefs.events[event];
        row.push(
          Markup.button.callback(
            `${enabled ? '✅' : '❌'} ${eventNames[event].split(' ')[1]}`,
            `notify_toggle_${event}`
          )
        );
      }
      
      keyboard.push(row);
    }
    
    keyboard.push([Markup.button.callback('« Back', 'notifications')]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(keyboard)
    });
  });
  
  /**
   * Toggle individual event notifications
   */
  Object.keys(notificationService.defaultPreferences.events).forEach(eventType => {
    bot.action(`notify_toggle_${eventType}`, async (ctx) => {
      const userId = ctx.from.id;
      const prefs = notificationService.getUserPreferences(userId);
      
      notificationService.updatePreferences(userId, {
        events: {
          [eventType]: !prefs.events[eventType]
        }
      });
      
      await ctx.answerCbQuery();
      
      // Refresh event settings menu by re-rendering
      const updatedPrefs = notificationService.getUserPreferences(userId);
      
      const eventNames = {
        gridBuy: '🟢 Grid Buys',
        gridSell: '🔴 Grid Sells',
        gridComplete: '✅ Grid Complete',
        gridError: '❌ Grid Errors',
        martingaleBuy: '🟢 Martingale Buys',
        martingaleSell: '🔴 Martingale Sells',
        martingaleComplete: '✅ Martingale Complete',
        martingaleError: '❌ Martingale Errors',
        profitTarget: '🎯 Profit Targets',
        stopLoss: '🛑 Stop Loss',
        lowBalance: '⚠️ Low Balance'
      };
      
      let message = '⚙️ *Event Notification Settings*\\n\\n';
      message += 'Toggle individual event notifications:\\n\\n';
      
      Object.entries(updatedPrefs.events).forEach(([event, enabled]) => {
        const icon = enabled ? '✅' : '❌';
        message += `${icon} ${eventNames[event]}\\n`;
      });
      
      const keyboard = [];
      
      // Create rows of 2 buttons each
      const events = Object.keys(updatedPrefs.events);
      for (let i = 0; i < events.length; i += 2) {
        const row = [];
        
        for (let j = 0; j < 2 && i + j < events.length; j++) {
          const event = events[i + j];
          const enabled = updatedPrefs.events[event];
          row.push(
            Markup.button.callback(
              `${enabled ? '✅' : '❌'} ${eventNames[event].split(' ')[1]}`,
              `notify_toggle_${event}`
            )
          );
        }
        
        keyboard.push(row);
      }
      
      keyboard.push([Markup.button.callback('« Back', 'notifications')]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(keyboard)
      });
    });
  });
  
  /**
   * Quiet hours settings
   */
  bot.action('notify_quiet_hours', async (ctx) => {
    const userId = ctx.from.id;
    const prefs = notificationService.getUserPreferences(userId);
    
    const message = '🌙 *Quiet Hours Settings*\n\n' +
      `Status: ${prefs.quietHours.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `From: ${prefs.quietHours.start}\n` +
      `To: ${prefs.quietHours.end}\n\n` +
      `During quiet hours, notifications will be suppressed.`;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          prefs.quietHours.enabled ? '❌ Disable' : '✅ Enable',
          'notify_quiet_toggle'
        )
      ],
      [
        Markup.button.callback('⏰ Set Start Time', 'notify_quiet_start'),
        Markup.button.callback('⏰ Set End Time', 'notify_quiet_end')
      ],
      [Markup.button.callback('« Back', 'notifications')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  });
  
  /**
   * Toggle quiet hours on/off
   */
  bot.action('notify_quiet_toggle', async (ctx) => {
    const userId = ctx.from.id;
    const prefs = notificationService.getUserPreferences(userId);
    
    notificationService.updatePreferences(userId, {
      quietHours: {
        enabled: !prefs.quietHours.enabled
      }
    });
    
    await ctx.answerCbQuery(
      prefs.quietHours.enabled ? 'Quiet hours disabled' : 'Quiet hours enabled'
    );
    
    // Refresh quiet hours menu by re-rendering
    const updatedPrefs = notificationService.getUserPreferences(userId);
    
    const message = '🌙 *Quiet Hours Settings*\\n\\n' +
      `Status: ${updatedPrefs.quietHours.enabled ? '✅ Enabled' : '❌ Disabled'}\\n` +
      `From: ${updatedPrefs.quietHours.start}\\n` +
      `To: ${updatedPrefs.quietHours.end}\\n\\n` +
      `During quiet hours, notifications will be suppressed.`;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          updatedPrefs.quietHours.enabled ? '❌ Disable' : '✅ Enable',
          'notify_quiet_toggle'
        )
      ],
      [
        Markup.button.callback('⏰ Set Start Time', 'notify_quiet_start'),
        Markup.button.callback('⏰ Set End Time', 'notify_quiet_end')
      ],
      [Markup.button.callback('« Back', 'notifications')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  });
  
  /**
   * Set quiet hours start time
   */
  bot.action('notify_quiet_start', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      'Please enter the quiet hours START time in 24-hour format (e.g., 22:00):',
      { parse_mode: 'Markdown' }
    );
    
    ctx.session.awaitingQuietStart = true;
  });
  
  /**
   * Set quiet hours end time
   */
  bot.action('notify_quiet_end', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      'Please enter the quiet hours END time in 24-hour format (e.g., 08:00):',
      { parse_mode: 'Markdown' }
    );
    
    ctx.session.awaitingQuietEnd = true;
  });
  
  /**
   * Handle quiet hours time input
   */
  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    
    // Check if awaiting quiet hours time input
    if (ctx.session.awaitingQuietStart || ctx.session.awaitingQuietEnd) {
      const timeText = ctx.message.text.trim();
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      
      if (!timeRegex.test(timeText)) {
        await ctx.reply('Invalid time format. Please use HH:MM format (e.g., 22:00)');
        return;
      }
      
      if (ctx.session.awaitingQuietStart) {
        notificationService.updatePreferences(userId, {
          quietHours: {
            start: timeText
          }
        });
        
        await ctx.reply(`✅ Quiet hours start time set to ${timeText}`);
        ctx.session.awaitingQuietStart = false;
      } else if (ctx.session.awaitingQuietEnd) {
        notificationService.updatePreferences(userId, {
          quietHours: {
            end: timeText
          }
        });
        
        await ctx.reply(`✅ Quiet hours end time set to ${timeText}`);
        ctx.session.awaitingQuietEnd = false;
      }
      
      return;
    }
    
    // Pass to next handler
    return next();
  });
};
