# TerminalOne v0.11.2 - Grid Trading

## 🕸️ Grid Trading Strategy

**Release Date:** 2025-11-03

---

## ✨ What's New

### Grid Trading Strategy
A fully automated grid trading bot that profits from market volatility by buying low and selling high at preset price levels.

**Features:**
- 🕸️ Automated grid trading with market orders via Jupiter
- ⚙️ Configurable parameters (initial amount, buy/sell orders, spacing)
- 📊 Real-time P&L tracking (realized + unrealized)
- 🔄 30-second price monitoring with automatic order execution
- 💰 Support for multiple concurrent grids

**Configuration Options:**
- **Initial Amount:** 0.04 - 100 SOL (default: 0.10)
- **Buy Orders:** 2 - 50 (default: 10)
- **Sell Orders:** 2 - 50 (default: 10)
- **Drop %:** 0.2% - 33% (default: 2%)
- **Leap %:** 0.2% - 100% (default: 4%)

---

## 🎨 UI/UX Improvements

### Consistent Interface
- ✅ Grid UI now matches Martingale Bot style
- ✅ Same configuration flow and button layout
- ✅ Unified color scheme and emojis
- ✅ Better visual hierarchy

### Title Updates
- 🆕 Bot title shows: `🦈TerminalOne | v0.11.2 | Grid Trading`
- 🕸️ All grid buttons use spider web emoji
- 📝 Cleaner, more professional presentation

---

## 🔧 Technical Changes

### New Files
- `src/services/GridTradingService.js` - Core grid logic
- `src/commands/grid.js` - Telegram command handlers

### Modified Files
- `VERSION` - Updated to 0.11.2
- `src/utils/version.js` - Updated title format
- `src/index.js` - Integrated grid service and commands

### Features Implemented
1. **Grid Calculation**
   - Buy grids: `entry_price * (1 - (i * drop%))`
   - Sell grids: `entry_price * (1 + (j * leap%))`

2. **Order Execution**
   - Market orders via Jupiter when price crosses levels
   - Automatic re-enabling of grid levels after fills
   - Smart position management

3. **Monitoring**
   - Price checks every 30 seconds
   - Automatic trade execution
   - Real-time P&L updates

---

## 📖 How to Use

1. Open bot and go to: **🤖 Strategies → 🕸️ Grid Trading**
2. Configure parameters (or use defaults)
3. Click **🔍 Search Token & Launch**
4. Send token address
5. Bot executes initial buy and starts monitoring
6. View **📊 Active Grids** to track performance

---

## ⚠️ Important Notes

- **Real Trading:** Uses real market orders from minute 1
- **No Limit Orders:** Solana DEX doesn't support native limit orders, so we simulate with market orders
- **Best for Sideways Markets:** Grid works optimally when price ranges
- **30s Monitoring:** Balance between responsiveness and API costs

---

## 🐛 Fixes

- Fixed configuration not saving when changing values
- Added reset to defaults button
- Improved error handling for missing services
- Better balance display in grid menu

---

## 🚀 Deployment

**Status:** ✅ Deployed to production

- GitHub: Updated
- Hetzner Server: Restarted
- Bot Status: Online (71s uptime)
- Memory: 117.6 MB

---

## 📊 Example Configuration

**Default Setup (0.10 SOL):**
- Initial buy: 0.05 SOL
- 10 buy orders @ 2% apart = 20% max drop
- 10 sell orders @ 4% apart = 40% max leap

**If entry = $1.00:**
- Buys: $0.98, $0.96, $0.94... → $0.80
- Sells: $1.04, $1.08, $1.12... → $1.40

Bot profits from price oscillations within this range!

---

## 🎯 What's Next

- Add grid re-balancing for large price moves (>50%)
- Implement grid templates (volatile, stable, etc.)
- Add historical performance analytics
- Support for custom grid spacing patterns
