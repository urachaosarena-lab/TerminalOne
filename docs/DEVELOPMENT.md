# 🛠️ TerminalOne Bot - Development Guide

This guide will help you set up the development environment and understand the project architecture.

## 🏗️ Architecture Overview

```
TerminalOne Bot Architecture

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Telegram API  │◄───┤  TerminalOne    │───►│  Solana Network │
│                 │    │      Bot        │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   External APIs │
                       │  (Jupiter, CG)  │
                       └─────────────────┘
```

### Core Components

1. **Bot Core** (`src/index.js`): Main bot class and startup logic
2. **Command Handlers** (`src/commands/`): Individual command implementations
3. **Services** (`src/services/`): Business logic and external integrations
4. **Utilities** (`src/utils/`): Helper functions and shared code
5. **Configuration** (`config/`): Environment and app configuration

## 🚀 Development Setup

### 1. Prerequisites Installation

```bash
# Check Node.js version (requires 18+)
node --version

# If you need to install/update Node.js:
# Visit https://nodejs.org/ or use nvm
nvm install 18
nvm use 18
```

### 2. Project Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd TerminalOne

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### 3. Get Telegram Bot Token

1. **Open Telegram** and search for `@BotFather`
2. **Start a conversation** and use `/newbot`
3. **Follow the prompts** to create your bot
4. **Copy the token** and add it to your `.env` file:
   ```env
   TELEGRAM_BOT_TOKEN=1234567890:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
   ```

### 4. Get Your Telegram User ID

1. **Message** [@userinfobot](https://t.me/userinfobot)
2. **Copy your ID** and add it to `.env`:
   ```env
   ADMIN_CHAT_IDS=123456789
   ```

### 5. Choose Solana Network

For development, use devnet (faster and free):
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
```

For production, use mainnet:
```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta
```

### 6. Start Development

```bash
# Start in development mode (auto-restart on changes)
npm run dev

# Or start normally
npm start
```

## 📁 Project Structure Deep Dive

```
TerminalOne/
├── 📁 src/
│   ├── 📁 commands/           # Command handlers
│   │   ├── start.js          # /start command
│   │   ├── help.js           # /help command
│   │   └── ...               # More commands
│   ├── 📁 services/          # Business logic
│   │   ├── SolanaService.js  # Blockchain interactions
│   │   ├── PriceService.js   # Price data (future)
│   │   └── ...               # More services
│   ├── 📁 utils/             # Utilities
│   │   ├── logger.js         # Logging configuration
│   │   ├── validators.js     # Input validation (future)
│   │   └── ...               # More utilities
│   ├── 📁 middleware/        # Custom middleware
│   │   ├── auth.js           # Authentication (future)
│   │   ├── rateLimit.js      # Rate limiting (future)
│   │   └── ...               # More middleware
│   └── index.js              # Main bot entry point
├── 📁 config/
│   └── config.js             # Configuration management
├── 📁 tests/                 # Test files
│   ├── commands/             # Command tests
│   ├── services/             # Service tests
│   └── utils/                # Utility tests
├── 📁 docs/                  # Documentation
├── 📁 scripts/               # Utility scripts
├── 📁 logs/                  # Log files (auto-created)
├── .env.example              # Environment template
├── .gitignore                # Git ignore rules
├── package.json              # Dependencies and scripts
└── README.md                 # Main documentation
```

## 🔧 Adding New Features

### Creating a New Command

1. **Create the command file:**
```javascript
// src/commands/mycommand.js
module.exports = async (ctx) => {
  try {
    // Command logic here
    ctx.reply('Hello from my new command! 🚀');
  } catch (error) {
    ctx.reply('❌ Something went wrong. Please try again.');
    console.error('Error in mycommand:', error);
  }
};
```

2. **Register the command:**
```javascript
// src/index.js
const myCommand = require('./commands/mycommand');

// In setupCommands() method:
this.bot.command('mycommand', myCommand);
```

3. **Update help command:**
```javascript
// src/commands/help.js
// Add your command to the help text
```

### Creating a New Service

1. **Create the service file:**
```javascript
// src/services/MyService.js
const logger = require('../utils/logger');

class MyService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize your service
      this.initialized = true;
      logger.info('MyService initialized');
    } catch (error) {
      logger.error('Failed to initialize MyService:', error);
      throw error;
    }
  }

  async doSomething() {
    if (!this.initialized) {
      throw new Error('Service not initialized');
    }
    // Service logic here
  }
}

module.exports = MyService;
```

2. **Use in main bot:**
```javascript
// src/index.js
const MyService = require('./services/MyService');

// In constructor:
this.myService = new MyService();

// In start() method:
await this.myService.initialize();
```

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Writing Tests
```javascript
// tests/commands/mycommand.test.js
const myCommand = require('../../src/commands/mycommand');

describe('mycommand', () => {
  it('should reply with greeting', async () => {
    const mockCtx = {
      reply: jest.fn()
    };

    await myCommand(mockCtx);
    
    expect(mockCtx.reply).toHaveBeenCalledWith('Hello from my new command! 🚀');
  });
});
```

## 📊 Monitoring and Debugging

### Logs
- **Location**: `logs/` directory
- **Development**: Console output + file
- **Production**: File only
- **Levels**: error, warn, info, debug

### Debug Mode
```bash
# Enable debug logs
LOG_LEVEL=debug npm run dev
```

### Common Issues

1. **Bot not responding**
   - Check bot token in `.env`
   - Verify bot is not already running elsewhere
   - Check network connectivity

2. **Solana connection failed**
   - Verify RPC URL is correct
   - Check network setting (mainnet/devnet)
   - Try different RPC provider

3. **Permission errors**
   - Ensure bot has necessary Telegram permissions
   - Check admin user IDs are correct

## 🔒 Security Best Practices

1. **Environment Variables**
   - Never commit `.env` file
   - Use different tokens for dev/prod
   - Rotate tokens regularly

2. **Input Validation**
   - Validate all user inputs
   - Sanitize data before processing
   - Use allowlists for addresses

3. **Rate Limiting**
   - Implement command rate limits
   - Monitor for spam/abuse
   - Block suspicious users

4. **Error Handling**
   - Don't expose internal errors
   - Log errors securely
   - Fail gracefully

## 📚 Learning Resources

### Telegram Bot Development
- [Telegraf Documentation](https://telegraf.js.org/)
- [Telegram Bot API](https://core.telegram.org/bots/api)

### Solana Development
- [Solana Web3.js Documentation](https://solana-labs.github.io/solana-web3.js/)
- [Solana Cookbook](https://solanacookbook.com/)
- [Solana Developer Resources](https://solana.com/developers)

### Node.js Best Practices
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Express.js Security](https://expressjs.com/en/advanced/best-practice-security.html)

## 🤝 Contributing Guidelines

1. **Fork and Branch**
   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Code Style**
   ```bash
   npm run lint        # Check style
   npm run lint:fix    # Fix auto-fixable issues
   ```

3. **Testing**
   ```bash
   npm test           # Ensure all tests pass
   ```

4. **Commit Convention**
   ```
   feat: add new command
   fix: resolve connection issue
   docs: update README
   test: add unit tests
   ```

5. **Pull Request**
   - Clear description of changes
   - Link to related issues
   - Include screenshots if UI changes

---

Happy coding! 🚀 If you have questions, create an issue or reach out to the team.