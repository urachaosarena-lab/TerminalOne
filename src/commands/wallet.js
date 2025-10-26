const { Markup } = require('telegraf');

const handleWalletMenu = async (ctx) => {
  const walletService = ctx.services?.wallet;
  const userId = ctx.from.id;

  try {
    const balanceInfo = await walletService.getWalletBalance(userId);
    
    if (!balanceInfo.hasWallet) {
      await ctx.editMessageText(
        '${getBotTitle()}\n\n❌ No wallet found. Please create or import a wallet first.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Create Wallet', 'create_wallet')],
            [Markup.button.callback('📥 Import Wallet', 'import_wallet')],
            [Markup.button.callback('🔙 Back', 'back_to_main')]
          ])
        }
      );
      return;
    }

    const walletMessage = `
${getBotTitle()}

🟠 **Wallet Management**

💰 **Balance:** ${balanceInfo.balance.toFixed(4)} SOL
📍 **Address:** \`${balanceInfo.publicKey.slice(0,5)}...${balanceInfo.publicKey.slice(-5)}\`

🔐 **Manage your wallet securely**
    `;

    // Check if devnet for airdrop option
    const config = require('../../config/config');
    const isDevnet = config.solana.network === 'devnet';
    
    const buttons = [
      [Markup.button.callback('🔑 View Private Key', 'view_private_key')],
      [Markup.button.callback('📋 Copy Address', 'copy_address')],
      [Markup.button.callback('🔄 Refresh Balance', 'refresh_balance')]
    ];
    
    if (isDevnet) {
      buttons.push([Markup.button.callback('💰 Request SOL (Devnet)', 'request_airdrop')]);
    }
    
    buttons.push(
      [Markup.button.callback('🚪 Log Off Wallet', 'delete_wallet')],
      [Markup.button.callback('🔙 Back', 'back_to_main')]
    );

    await ctx.editMessageText(walletMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });

  } catch (error) {
    console.error('Error in wallet menu:', error);
    await ctx.reply('❌ Error loading wallet information. Please try again.');
  }
};

const handleCreateWallet = async (ctx) => {
  const walletService = ctx.services?.wallet;
  const userId = ctx.from.id;

  try {
    // Show creating message
    await ctx.editMessageText(
      '${getBotTitle()}\n\n🔄 **Creating your new wallet...**\n\n⏳ Please wait...',
      { parse_mode: 'Markdown' }
    );

    // Create wallet
    const result = await walletService.createWallet(userId);
    
    if (result.success) {
      const successMessage = `
${getBotTitle()}

🎉 **Wallet Created Successfully!**

🟢 **Your new wallet is ready:**
📍 **Address:** \`${result.publicKey.slice(0,5)}...${result.publicKey.slice(-5)}\`

⚠️ **IMPORTANT SECURITY NOTICE:**
• Your private key is stored securely
• Always backup your wallet
• Never share your private key
• You are responsible for your funds

💰 **Your wallet balance:** 0.0000 SOL
💡 **Tip:** Fund your wallet to start trading!
      `;

      await ctx.editMessageText(successMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔑 View Private Key', 'view_private_key')],
          [Markup.button.callback('📋 Copy Address', 'copy_address')],
          [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
        ])
      });
    }

  } catch (error) {
    console.error('Error creating wallet:', error);
    await ctx.editMessageText(
      '${getBotTitle()}\n\n❌ **Failed to create wallet**\n\nPlease try again later.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Try Again', 'create_wallet')],
          [Markup.button.callback('🔙 Back', 'back_to_main')]
        ])
      }
    );
  }
};

const handleImportWallet = async (ctx) => {
  await ctx.editMessageText(
    '${getBotTitle()}\n\n📥 **Import Existing Wallet**\n\n🔐 Send your wallet credentials in the next message\n\n**✅ Supported formats:**\n🌱 **Seed Phrase:** 12 or 24 words\n🔑 **Private Key:** Base64 encoded\n📋 **Private Key:** JSON array [1,2,3...]\n\n**💡 Examples:**\n• `word1 word2 word3 ... word12`\n• `lGJkS4wqjmGGol6ZOFQb7luG...`\n• `[123,45,67,89,12...]`\n\n⚠️ **Security:** All data encrypted & this message auto-deleted',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', 'back_to_main')]
      ])
    }
  );

  // Set user state for next message
  ctx.session = ctx.session || {};
  ctx.session.awaitingPrivateKey = true;
};

const handleViewPrivateKey = async (ctx) => {
  const walletService = ctx.services?.wallet;
  const userId = ctx.from.id;

  try {
    const wallet = walletService.getPrivateKey(userId);
    
    const keyMessage = `
${getBotTitle()}

🔐 **PRIVATE KEY - KEEP SECURE!**

⚠️ **WARNING:** Never share this information!

**Private Key (Base64):**
\`${wallet.privateKey}\`

**Public Address:**
\`${wallet.publicKey}\`

${wallet.mnemonic ? `**Mnemonic Phrase:**\n\`${wallet.mnemonic}\`\n\n💡 Store this phrase safely - it can recover your wallet!` : '🔄 *Imported wallet - no mnemonic available*'}

🗑️ **This message will auto-delete in 60 seconds**
    `;

    // Send as a new message that will be deleted
    const sentMessage = await ctx.reply(keyMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Delete Now', 'delete_key_message')]
      ])
    });

    // Auto-delete after 60 seconds
    setTimeout(async () => {
      try {
        await ctx.deleteMessage(sentMessage.message_id);
      } catch (error) {
        // Message might already be deleted
      }
    }, 60000);

  } catch (error) {
    console.error('Error viewing private key:', error);
    await ctx.reply('❌ Error retrieving private key. Please try again.');
  }
};

const handleCopyAddress = async (ctx) => {
  const walletService = ctx.services?.wallet;
  const userId = ctx.from.id;

  try {
    const wallet = walletService.getUserWallet(userId);
    if (!wallet) {
      await ctx.answerCbQuery('❌ No wallet found');
      return;
    }

    // Show full address for easy copying
    const copyMessage = `
📋 **Your Wallet Address:**

\`${wallet.publicKey}\`

💡 **How to copy:**
• On mobile: Long press the address above
• On desktop: Click and drag to select
• The full address will be copied to clipboard

🔒 This is your **public** address - safe to share
    `;

    await ctx.reply(copyMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Back to Wallet', 'wallet')]
      ])
    });

    await ctx.answerCbQuery('📋 Full address shown above - tap to copy!');

  } catch (error) {
    console.error('Error copying address:', error);
    await ctx.answerCbQuery('❌ Error retrieving address');
  }
};

const handleDeleteWallet = async (ctx) => {
  await ctx.editMessageText(
    '${getBotTitle()}\n\n🚪 **LOG OFF WALLET**\n\n⚠️ **This will disconnect your current wallet**\n\n• Your wallet will be removed from this device\n• Your funds remain safe in your wallet\n• You can reconnect anytime with your seed phrase\n• Make sure you have your seed phrase saved!\n\n**Ready to log off?**',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🚪 Yes, Log Off', 'confirm_delete_wallet')],
        [Markup.button.callback('❌ Cancel', 'wallet')]
      ])
    }
  );
};

const handleConfirmDeleteWallet = async (ctx) => {
  const walletService = ctx.services?.wallet;
  const userId = ctx.from.id;

  try {
    const deleted = walletService.deleteWallet(userId);
    
    if (deleted) {
      await ctx.editMessageText(
        '${getBotTitle()}\n\n✅ **Wallet Logged Off Successfully**\n\n🚪 Your wallet has been disconnected from this device.\n\n🔒 **Your funds are still safe in your wallet!**\n💡 You can reconnect anytime or use a different wallet.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Create New Wallet', 'create_wallet')],
            [Markup.button.callback('📥 Import Wallet', 'import_wallet')],
            [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
          ])
        }
      );
    } else {
      await ctx.answerCbQuery('❌ No wallet found to delete');
    }

  } catch (error) {
    console.error('Error deleting wallet:', error);
    await ctx.answerCbQuery('❌ Error deleting wallet');
  }
};

/**
 * Handle SOL airdrop request (devnet only)
 */
const handleRequestAirdrop = async (ctx) => {
  const walletService = ctx.services?.wallet;
  const userId = ctx.from.id;

  try {
    const wallet = walletService.getUserWallet(userId);
    if (!wallet) {
      await ctx.answerCbQuery('❌ No wallet found');
      return;
    }

    const message = `
${getBotTitle()}

💰 **Request Devnet SOL**

📍 **Wallet:** \`${wallet.publicKey.slice(0,5)}...${wallet.publicKey.slice(-5)}\`

🔧 **Devnet Testing Only**
These are test tokens with no real value.

💵 **How much SOL do you need?**
    `;

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('💰 1 SOL', 'airdrop_1')],
        [Markup.button.callback('💰 2 SOL', 'airdrop_2')],
        [Markup.button.callback('💰 5 SOL', 'airdrop_5')],
        [Markup.button.callback('❌ Cancel', 'wallet')]
      ])
    });

  } catch (error) {
    console.error('Error in airdrop request:', error);
    await ctx.answerCbQuery('❌ Error preparing airdrop request');
  }
};

/**
 * Execute airdrop
 */
const handleExecuteAirdrop = async (ctx, amount) => {
  const walletService = ctx.services?.wallet;
  const userId = ctx.from.id;

  try {
    const wallet = walletService.getUserWallet(userId);
    if (!wallet) {
      await ctx.answerCbQuery('❌ No wallet found');
      return;
    }

    // Show processing message
    await ctx.editMessageText(
      `${getBotTitle()}\n\n💰 **Requesting ${amount} SOL...**\n\n⏳ Please wait...`,
      { parse_mode: 'Markdown' }
    );

    // Create airdrop service
    const AirdropService = require('../services/AirdropService');
    const airdropService = new AirdropService(ctx.services.solana);

    // Request airdrop
    const result = await airdropService.requestAirdrop(wallet.publicKey, amount);

    if (result.success) {
      const successMessage = `
${getBotTitle()}

✅ **Airdrop Successful!**

💰 **Received:** ${result.amount} SOL
💵 **New Balance:** ${result.newBalance.toFixed(4)} SOL
📝 **Transaction:** \`${result.signature.slice(0,8)}...\`

🎉 **Ready to test strategies!**
      `;

      await ctx.editMessageText(successMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💰 View Wallet', 'wallet')],
          [Markup.button.callback('🤖 Start Trading', 'martingale_menu')],
          [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
        ])
      });
    }

  } catch (error) {
    console.error('Airdrop execution error:', error);
    
    await ctx.editMessageText(
      `${getBotTitle()}\n\n❌ **Airdrop Failed**\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Try Again', 'request_airdrop')],
          [Markup.button.callback('🔙 Back', 'wallet')]
        ])
      }
    );
  }
};

module.exports = {
  handleWalletMenu,
  handleCreateWallet,
  handleImportWallet,
  handleViewPrivateKey,
  handleCopyAddress,
  handleDeleteWallet,
  handleConfirmDeleteWallet,
  handleRequestAirdrop,
  handleExecuteAirdrop
};
