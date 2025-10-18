# TerminalOne Bot 🚀

A powerful multi-feature Telegram bot with Solana blockchain integration.

## 📋 Features

### ✅ Current Features
- **Basic Bot Framework**: Telegram bot setup with command handling
- **Solana Integration**: Connection to Solana blockchain (mainnet/devnet)
- **Logging System**: Comprehensive logging with Winston
- **Error Handling**: Robust error handling and graceful shutdowns
- **Admin System**: Admin-only commands and permissions

### 🚧 Coming Soon
- **💰 Wallet Management**: Create, import, and manage Solana wallets
- **📈 Price Tracking**: Real-time token price monitoring
- **🔄 DEX Trading**: Swap tokens through Jupiter/Raydium
- **📊 Portfolio Analytics**: Track your holdings and performance
- **🎯 Price Alerts**: Custom notifications for price movements
- **🔍 Token Analytics**: Detailed token information and metrics
- **🎮 Trading Games**: Gamified trading experiences
- **📱 Mobile Optimization**: Enhanced mobile user experience

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Telegram Bot Token ([get one from @BotFather](https://t.me/botfather))
- Solana RPC access (free tier available from multiple providers)

### Installation

1. **Clone and setup**:
```bash
cd TerminalOne
npm install
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your bot token and settings
```

3. **Start the bot**:
```bash
# Development mode
npm run dev

# Production mode  
npm start
```

## 🔧 Configuration

Edit your `.env` file with the following required variables:

```env
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
ADMIN_CHAT_IDS=your_telegram_user_id_here

# Optional (defaults provided)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta
NODE_ENV=development
LOG_LEVEL=info
```

### Getting Your Telegram User ID
1. Start a chat with [@userinfobot](https://t.me/userinfobot)
2. It will show your user ID
3. Add this ID to `ADMIN_CHAT_IDS` in your `.env` file

## 📂 Project Structure

```
TerminalOne/
├── src/
│   ├── commands/          # Bot command handlers
│   ├── services/          # Business logic services
│   ├── utils/            # Utility functions
│   ├── middleware/       # Custom middleware
│   └── index.js          # Main bot entry point
├── config/
│   └── config.js         # Configuration management
├── tests/                # Test files
├── docs/                 # Documentation
├── scripts/              # Utility scripts
└── logs/                 # Log files (auto-created)
```

## 🤖 Available Commands

### Basic Commands
- `/start` - Welcome message and bot info
- `/help` - Show available commands

### Solana Commands (Coming Soon)
- `/balance` - Check wallet balance
- `/wallet` - Wallet management tools
- `/price <token>` - Get token price
- `/swap` - Token swap interface
- `/portfolio` - View your portfolio
- `/alerts` - Manage price alerts

### Admin Commands
- `/stats` - Bot statistics (admin only)
- `/broadcast` - Send message to all users (admin only)

## 🧪 Development

### Scripts
- `npm run dev` - Start with nodemon (auto-restart)
- `npm start` - Start in production mode
- `npm test` - Run tests
- `npm run lint` - Check code style
- `npm run lint:fix` - Fix code style issues

### Adding New Commands
1. Create a new file in `src/commands/`
2. Export a function that handles the command
3. Register it in `src/index.js`

Example:
```javascript
// src/commands/mycommand.js
module.exports = (ctx) => {
  ctx.reply('Hello from my command!');
};

// src/index.js
const myCommand = require('./commands/mycommand');
this.bot.command('mycommand', myCommand);
```

## 🔒 Security

- ⚠️ **Never commit your `.env` file**
- 🔐 Store sensitive data in environment variables
- 👥 Set up admin IDs properly
- 🌐 Use HTTPS in production
- 🔄 Regularly update dependencies

## 📈 Roadmap

### Phase 1: Foundation ✅
- Basic bot framework
- Solana integration
- Command structure

### Phase 2: Core Features 🚧
- Wallet management
- Price tracking
- Basic trading tools

### Phase 3: Advanced Features 🔮
- Portfolio analytics
- Advanced trading strategies
- Social features
- Mobile optimization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- 📧 Create an issue on GitHub
- 💬 Join our community chat
- 📚 Check the documentation in `/docs`

---

**⚡ Built with Node.js, Telegraf, and Solana Web3.js**

*Happy trading! 🚀*