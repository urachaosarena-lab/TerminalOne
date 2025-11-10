# 🦈 TerminalOne Project Summary

**Last Updated:** v0.12.0 | November 2025

This document serves as the central reference for TerminalOne's features, roadmap, and architecture. Used for maintaining context and structured workflow in development.

---

## 1. 🎉 What We Achieved in 2 Weeks

**User Growth & Engagement:**
- 💯 **100 unique users** actively using the bot in-app
- 🐦 **140 followers** on X (Twitter)
- 💎 **170 $MIRA holders** supporting the token
- 📊 **Over 2.5 SOL** in total trading volume processed
- 🤖 **100+ bot strategies** launched by users
- 🔐 **Wallet persistence** implemented with encryption
- 🕸️ **Grid Trading** fully operational alongside Martingale
- 📈 **Dashboard analytics** tracking all platform metrics
- 🎮 **RPG mini-game** (Hero system) with PvE battles live
- ✅ **Zero downtime** deployment with PM2 auto-restart

---

## 2. 🗺️ Mid-Term Roadmap

**Phase 1 - Polish & Optimize** (Current)
- 🎨 Fix small errors & enhance UI/UX visuals
- 🔬 Benchmark Grid & Martingale vs Liquidity Providing (closest competitors)
- 📊 Performance metrics & user feedback analysis

**Phase 2 - Tokenomics & Fees**
- 💰 Implement tokenomics structure (vault, buybacks, liquidity)
- 🎯 Deploy Bounty Jackpot system
- 📈 Fee management automation

**Phase 3 - Tool Expansion**
- 🛠️ Deploy 3rd major trading tool
- ⚡ Add basic tools from popular bots (BonkBot, Photon, GMGN) but with lower fees
- 🎁 User retention incentives & rewards
- 🤝 Referral system integration

**Phase 4 - Mira AI Agent** (Future Major Update)
- 🤖 Mira as autonomous X agent
- 🔍 Alpha scanning & engagement automation
- 📢 Community interaction & education

---

## 3. 🛠️ Trading Tools

### ✅ Currently Implemented

**🤖 Martingale Bot**
- DCA strategy with multipliers on price drops
- Auto-buys at configurable intervals (drop %)
- Take profit & stop loss controls
- Multiple preset configs (Degen, Regular, Stable)
- Real-time P&L tracking in SOL

**🕸️ Grid Trading Bot**
- Buy low, sell high automation within price ranges
- Configurable grid levels (buys & sells)
- Drop % and Leap % customization
- Perfect for volatile, range-bound tokens
- Realizes profits on every price swing

### 🔮 Future Tools

**Volume 3 - TBA**
- Third major automated strategy (under evaluation)
- Will complement Martingale & Grid for complete coverage

**Basic Trading Tools** (Phase 3)
- 🎯 Limit orders with alerts
- ⚡ Quick buy/sell with custom amounts
- 📊 Portfolio tracker with charts
- 🔔 Price alerts & notifications
- 💹 Copy trading features
- All with **lower fees than competitors** + retention incentives

---

## 4. 💰 Tokenomics & Fee Structure

> ⚠️ **Disclaimer:** Percentages and quantities subject to adjustment after testing phase.

### Revenue Streams

**1️⃣ Platform Fees (Primary)**
- 💸 **1% fee** on every swap transaction
- 🔒 **Minimum fee:** 0.0005 SOL per transaction
- 💼 Collected in secure **vault wallet**

**2️⃣ Pump.fun Revenue**
- Used for operational costs & infrastructure
- Contributes to development budget

**3️⃣ Liquidity Providing Rewards**
- Additional passive income stream
- Helps cover services & server costs

### Fee Distribution & Buybacks

**Daily Vault Operations (00:00 UTC):**
- 📅 Every day at midnight UTC
- 💎 **50% of vault** used to **buyback $MIRA**
- 🔄 Bought $MIRA + remaining SOL = **liquidity provision**
- 📈 Strengthens $MIRA chart continuously
- 🔐 Remaining 50% stays as reserve for Bounty Jackpot

**Operational Costs:**
- Pump.fun revenue → Services + dev compensation
- LP rewards → Infrastructure + keepup costs

---

## 5. 🎯 Bounty Jackpot System

**How It Works:**
- 🎰 Every action in-app has a **0.25% chance** (1 in 400) to hit Bounty
- 🤖 Includes automated bot trades, manual swaps, config changes
- 💰 Winner receives **50% of current vault balance** instantly
- 🔄 Ensures daily buyback always has funds (remaining 50%)
- 🎁 Incentivizes daily usage & engagement

**Example:**
- Vault has $50 in fees collected
- User hits Bounty → receives $25 reward
- Remaining $25 stays for daily buyback cycle

**Adjustable Parameters:**
- Win chance (currently 0.25%, may change after testing)
- Payout % (currently 50% of vault)
- Action eligibility (all actions vs specific ones)

---

## 6. 🔒 Security & Transparency

**Dev Wallet Token Lock:**
- 🏦 **25 Million $MIRA** locked on Streamflow
- 📊 Prevents rug pulls & demonstrates long-term commitment
- 🔗 **Proof:** [Links to be added to X announcements]

**Dexscreener Socials Verified:**
- ✅ Official socials paid & verified on Dexscreener
- 🌐 Enhanced visibility & trust for $MIRA holders
- 🔗 **Announcement:** [Links to be added]

**Additional Security Measures:**
- 🔐 AES-256 encryption for wallet private keys
- 💾 Persistent storage with auto-recovery on restart
- 🛡️ Rate limiting & CSRF protection
- 📝 Comprehensive audit logging
- 🔄 Automated backup system (30-day retention)

---

## 7. 🤖 Mira as X Agent (Future)

**Planned Features:**

**Community Engagement:**
- 💬 Auto-responds to mentions & DMs
- 📊 Shares market insights & alpha calls
- 🎓 Educates users on bot strategies
- 🎉 Celebrates user wins & milestones

**Alpha Scanner:**
- 🔍 Monitors trending tokens with volume spikes
- 📈 Identifies opportunities for Grid/Martingale strategies
- ⚡ Alerts community to potential plays
- 🧠 Learns from successful trades

**Content Creation:**
- 📸 Generates trading performance graphics
- 📊 Posts daily/weekly platform stats
- 🎯 Highlights top performers & strategies
- 💎 Promotes $MIRA utility & benefits

**Simple Implementation Ideas:**
- 🔔 Auto-tweet when Bounty Jackpot is hit
- 📢 Daily recap: "Today X strategies launched, Y SOL volume traded"
- 🏆 Weekly leaderboard of most profitable strategies
- 💡 Educational threads on strategy optimization

---

## 8. 🎮 Hero Mini-Game (RPG System)

**Current Features:**
- ⚔️ PvE turn-based battles
- 👤 Hero customization (classes, stats, equipment)
- 🧙 Companions: Mira & Jawzy with unique abilities
- 📦 Inventory system (weapons, pets, classes)
- ⭐ Item rarity (Common, Rare, Legendary)
- 💎 Item fusion system
- 🛍️ Shop for purchasing items
- 📊 XP & leveling system
- 🎯 Quick-time events (QTE) for bonus damage

**Planned Overhaul:**
- 🎨 **Polish turn-based combat** with better animations/flow
- ⚡ **Item abilities** - each item grants unique skills
- 🎪 **Boss events** with exclusive prizes & rewards
- 🏆 **PvP battles** (future consideration)
- 📅 **Seasonal events** tied to trading milestones
- 💰 **Gem economy** linked to trading volume
- 🎁 **Special rewards** for strategy profitability

**Integration with Trading:**
- Launch strategy → Earn Hero XP
- Trading volume → Earn gems for shop
- Profitable trades → Better item drop rates
- Bounty winners → Legendary item guaranteed

---

## 9. 🏗️ Technical Architecture

**Core Services:**
- 🔗 **SolanaService** - Blockchain interaction via Helius RPC
- 💱 **JupiterTradingService** - Swap execution with retry logic
- 💰 **WalletService** - Encrypted wallet management
- 📊 **EnhancedPriceService** - Multi-source price aggregation
- 🤖 **MartingaleStrategy** - DCA bot logic & monitoring
- 🕸️ **GridTradingService** - Grid bot orchestration
- 💵 **RevenueService** - Fee collection & tracking
- 👤 **HeroService** - RPG game logic
- ⚔️ **BattleService** - Combat system
- 📈 **AnalyticsService** - Platform metrics aggregation

**Infrastructure:**
- 📱 Telegram Bot API (Telegraf framework)
- 🖥️ Hetzner VPS (production deployment)
- ⚙️ PM2 process manager (auto-restart, monitoring)
- 💾 File-based persistence (JSON storage)
- 🔄 Git-based deployment workflow
- 🏥 Health check system for monitoring

**Security Layers:**
- 🔐 Session management with CSRF tokens
- ⏱️ Rate limiting (50 req/hour for heavy ops)
- 🛡️ Input validation on all user data
- 📝 Structured logging with security event tracking
- 🚨 Monitoring with Telegram alerts
- 💾 Automated daily backups

---

## 10. 📊 Active Bots Management

**Unified Dashboard:**
- 💻 Single "Active Bots" panel showing all running strategies
- 🤖 Martingale section with individual strategy cards
- 🕸️ Grid section with grid performance metrics
- 💰 Real-time P&L calculation in SOL
- 📈 Combined portfolio overview
- 🔄 Quick navigation to individual bot panels

**Individual Strategy Views:**
- 📊 Detailed P&L breakdown (realized vs unrealized)
- 📉 Entry price, current price, % change
- 🪙 Token holdings & value in SOL/USD
- 📈 Order fill history & statistics
- ⏱️ Runtime & last check timestamp
- 🛑 Stop/pause controls with confirmation

---

## 11. ⚙️ Configuration System

**Martingale Configuration:**
- 💰 Initial buy amount (0.01 - 100 SOL)
- 📉 Drop percentage (0.2% - 33%)
- ⚡ Multiplier (1.0x - 5.0x)
- 🔢 Max levels (1 - 20)
- 🎯 Profit target (1% - 1000%)
- 🌊 Slippage tolerance (0.1% - 10%)
- 🛑 Stop loss (0% = off, up to 90%)
- 🎯 Presets: Degen, Regular, Stable

**Grid Configuration:**
- 💰 Initial amount (0.04 - 100 SOL)
- 📉 Number of buy orders (2 - 50)
- 📈 Number of sell orders (2 - 50)
- 📊 Drop % between buys (0.2% - 33%)
- 🚀 Leap % between sells (0.2% - 100%)
- 🔄 Auto-reset to defaults option

**UX Enhancements:**
- ✅ Smooth input handling with auto-delete messages
- ❌ Clear error messaging with valid ranges
- 💾 Instant save & return to config menu
- 🔄 Reset to defaults with confirmation

---

## 12. 💾 Data Persistence

**Wallet Data:**
- 🔐 Encrypted private keys (AES-256)
- 💼 Stored in `data/wallets.json`
- 🔄 Auto-loaded on server restart
- 🆔 User ID consistency (string-based keys)

**Strategy Data:**
- 🤖 Martingale: `data/strategies.json`
- 🕸️ Grid: `data/grid_strategies.json`
- ⏱️ Timestamps converted on load/save
- ▶️ Active strategies auto-resume monitoring

**Analytics Data:**
- 👥 User activity: `data/user_activity.json`
- 📊 Tracks first seen, last seen, actions
- 🗓️ Historical data for 7d/30d metrics
- 🧹 Auto-cleanup (keeps last 100 actions per user)

**Backup System:**
- 📅 Daily automated backups at configured time
- 📦 30-day retention policy
- 🔄 One-command restore functionality
- 📁 Stored in `backups/` directory

---

## 13. 🔧 Admin Panel

**System Monitoring:**
- 💻 CPU, memory, active users stats
- 📊 Error rates & response times
- 🤖 Active strategies count
- 💰 Revenue tracking
- 📈 Real-time health metrics

**Management Commands:**
- 🔄 Trigger manual backups
- 📊 Export system logs
- 👥 User management tools
- ⚙️ Settings configuration
- 🔄 Restart instructions (via PM2)

**Restricted Access:**
- 🔐 Admin-only commands via whitelist
- 📝 All admin actions logged
- 🚨 Alert cooldowns to prevent spam

---

## 14. 🚀 Deployment & DevOps

**Development Workflow:**
1. 💻 Local development on Windows
2. ✅ Git commit with descriptive messages
3. 📤 Push to GitHub (main branch)
4. 🌐 SSH deploy to Hetzner VPS
5. 📦 `npm ci` for clean dependency install
6. ♻️ PM2 restart for zero-downtime
7. 📊 Monitor logs & health checks

**Production Setup:**
- 🖥️ Hetzner VPS (Ubuntu/Debian)
- ⚙️ PM2 daemon for process management
- 🔄 Auto-restart on crashes
- 💾 Persistent logs rotation
- 🏥 Health check HTTP endpoint
- 🔐 SSH key-based authentication

**Monitoring:**
- 📝 Structured logging to files
- 🚨 Telegram alerts for critical errors
- 📊 Error rate tracking with cooldowns
- ⏱️ Response time metrics
- 💾 Memory usage monitoring

---

## 15. 💎 Premium Features & $MIRA Utility

**Token-Gated Features:**
- 🔓 **80% of features remain FREE** - Core trading accessible to all
- 💎 **20% require $MIRA holdings** - Premium advantages for believers
- 📊 **Tiered system** - Different holdings unlock different features
- 💰 **Range: $20 - $1,000** worth of $MIRA depending on feature value

**Why Hold $MIRA:**
- 🎯 Access exclusive premium tools & advantages
- 🔄 Benefit from daily buyback pressure
- 🎰 Bounty Jackpot rewards returned to active users
- 📈 Aligned incentives - platform growth = token growth
- 🏆 VIP status & priority features

**Balance Philosophy:**
- ✅ Most users can use bot without holdings
- 💪 Power users get meaningful advantages
- 🚫 Never pay-to-win, always skill-enhancing
- 📊 Requirements balanced by testing & feedback

**Premium Feature Examples** (TBA):
- Advanced analytics & insights
- Higher priority in trade execution
- Exclusive bot strategies or presets
- Enhanced Bounty Jackpot odds
- Early access to new features
- Custom automation rules

> 💡 Specific features & holding requirements to be announced as developed. Community input welcomed!

---

## 16. 🎯 User Retention Strategy

**Immediate Incentives:**
- 🎰 Bounty Jackpot on every action (0.25% chance)
- 🎮 Hero XP gained from trading
- 💎 Gems earned from volume
- 🏆 Strategy performance leaderboards

**Medium-term:**
- 🎁 Referral rewards system
- 📈 Volume-based tier benefits
- 🌟 Exclusive items for top traders
- 👑 VIP features for $MIRA holders

**Long-term:**
- 🤖 Mira AI agent providing alpha
- 📊 Advanced analytics & insights
- 🔔 Priority support for active users
- 💰 Revenue sharing programs

**Lower Fees Than Competitors:**
- 💸 1% vs 2-5% on other platforms
- 🎯 Bounty system returns fees to users
- 💎 $MIRA holders get additional benefits
- 🔄 Daily buybacks strengthen token value

---

## 17. 📱 User Interface Philosophy

**Core Principles:**
- 🎯 **Simplicity** - Clear CTAs, minimal clutter
- ⚡ **Speed** - Fast responses, instant feedback
- 💬 **Conversational** - Telegram-native experience
- 🎨 **Visual Clarity** - Emojis for quick scanning
- 🔄 **Consistency** - Unified patterns across features

**Panel Structure:**
- 🏠 Main Menu → Entry point with wallet & active bots
- 💰 Wallet → Balance, address, management
- 💻 Active Bots → Unified view of all strategies
- 🤖 Strategies Menu → Launch new bots
- 📊 Dashboard → Platform analytics
- ⚔️ Hero Menu → RPG game access
- ❓ Help → Commands & support

**Feedback Mechanisms:**
- ✅ Success messages (auto-delete after 2s)
- ❌ Error messages (auto-delete after 3s)
- 🔄 Loading states with progress indicators
- 📊 Real-time P&L updates
- 🎯 Confirmation prompts for destructive actions

---

## 18. 🔮 Future Considerations

**Community Requests:**
- 📊 Custom charting & technical indicators
- 🔔 Advanced alert system (price, volume, volatility)
- 💹 Copy trading / follow top strategies
- 🎮 PvP battles in Hero system
- 🏪 NFT integration for unique items

**Scaling Plans:**
- 🗄️ Database migration for better performance
- 🌐 Web interface companion to Telegram bot
- 📱 Mobile app (optional, far future)
- 🔗 Multi-chain support (other L1s/L2s)
- 🤝 Partnership integrations

**Revenue Expansion:**
- 💎 Premium tiers with advanced features
- 🎓 Educational content (paid courses)
- 🔧 White-label bot solutions for projects
- 📊 API access for third-party integrations

---

## 19. 📞 Support & Community

**Community Channels:**
- 🐦 X (Twitter): [@YourHandle] - 140+ followers
- 💬 Telegram: Main bot + support group
- 📊 Dexscreener: Official verified profile
- 🌐 Website: [Coming Soon]

**Support System:**
- ❓ /help command with comprehensive guide
- 📧 Direct support via Telegram
- 📝 Detailed error messages with solutions
- 🎓 Tutorial content for new users

**Transparency:**
- 📊 Public dashboard with platform metrics
- 💰 On-chain transaction tracking
- 🔒 Token lock proofs published
- 📢 Regular updates on progress

---

## 20. 🎨 Branding & Identity

**Visual Identity:**
- 🦈 Shark mascot (TerminalOne)
- 👾 Mira character (AI companion)
- 🎮 Jawzy character (RPG companion)
- 🟠 Orange accent color
- 💎 $MIRA token symbol

**Voice & Tone:**
- 💬 Friendly but professional
- 🎯 Direct and action-oriented
- 🎉 Celebratory of user wins
- 🔬 Transparent about risks
- 🚀 Optimistic about future

---

## 21. ⚠️ Risk Disclaimers

**Trading Risks:**
- 📉 Cryptocurrency trading involves substantial risk
- 💸 Never invest more than you can afford to lose
- 🎯 Past performance doesn't guarantee future results
- 📊 Bot strategies can lose money in unfavorable markets

**Smart Contract Risks:**
- 🔗 Third-party protocol risks (Jupiter, Raydium, etc.)
- ⛓️ Blockchain congestion may affect execution
- 💰 Transaction fees can fluctuate significantly

**Platform Disclaimers:**
- 🔧 Features and fees subject to change
- 🧪 Testing phase for new implementations
- 🔐 Users responsible for wallet security
- 📱 Bot availability depends on server uptime

---

## Version History

- **v0.12.0** - Active Bots panel, Grid config fixes, Dashboard enhancements
- **v0.11.x** - Grid trading implementation, wallet persistence fixes
- **v0.10.x** - Security upgrades, admin panel, monitoring
- **v0.09.x** - Jupiter trading improvements, strategy persistence
- **v0.08.x** - Hero RPG system, battle mechanics
- **v0.07.x** - Martingale strategy implementation
- **v0.06.x** - Core wallet & trading infrastructure

---

**Document Maintenance:**
- 🔄 Update after each major version release
- 📝 Add new features as they're implemented
- ✅ Check off completed roadmap items
- 📊 Update metrics regularly (weekly/monthly)

**For Development Team:**
- Use this as single source of truth
- Reference when planning new features
- Keep updated for onboarding new contributors
- Maintain version history for context

---

*This document serves as living documentation. Update regularly to maintain accuracy.*
