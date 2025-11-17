# 🎨 UI Style Guide - TerminalOne Bot

## 📋 Overview

This document defines the visual and structural standards for all Telegram bot panels to ensure a consistent, professional user experience.

---

## 🎯 Emoji System

### Navigation Emojis
```
🔙 Back          - Return to previous screen
🏠 Main Menu     - Return to main menu
🔄 Refresh       - Reload/update data
⚙️ Settings      - Configuration options
❓ Help          - Help and information
```

### Status Indicators
```
🟢 Active/Positive    - Strategy active, profit, success
🔴 Negative/Error     - Loss, error, critical
🟡 Warning/Paused     - Attention needed, paused state
⚪ Neutral/Inactive   - Neutral state, inactive
✅ Complete/Success   - Task completed successfully
❌ Failed/Cancel      - Failed operation, cancelled
⏸️ Paused            - Temporarily stopped
🛑 Stop              - Permanently stopped
```

### Financial Emojis
```
💰 Balance/Money      - SOL balance, wallet funds
📈 Profit/Up          - Positive P&L, price increase
📉 Loss/Down          - Negative P&L, price decrease
🎯 Target             - Profit target, goal
💎 Invested           - Total invested amount
⚡ Multiplier         - Strategy multiplier
📊 Stats/Analytics    - Statistics, analytics
💸 Fee                - Trading fee, cost
```

### Feature Emojis
```
🤖 Martingale Bot     - Martingale strategy
🕸️ Grid Bot           - Grid trading strategy
⚔️ Hero               - Hero RPG system
🔔 Notifications      - Notification settings
💻 Active Bots        - Active bots overview
📍 Address            - Wallet address
🔑 Private Key        - Private key/seed phrase
```

### Action Emojis
```
🚀 Launch             - Start/launch strategy
🔍 Search/Analyze     - Token search, analysis
✏️ Configure          - Edit configuration
🔄 Reset              - Reset to defaults
💾 Save               - Save changes
🗑️ Delete             - Remove/delete
⏹️ Stop               - Stop operation
▶️ Start              - Begin operation
```

---

## 📐 Panel Structure Template

### Standard Panel Format
```markdown
[TITLE_EMOJI] **Feature Name**

[CONTEXT_SECTION]
💰 **Balance:** X.XXXX SOL
[Additional Key Metrics]

[STATUS_SECTION]
📊 **Status/Info Line 1**
📊 **Status/Info Line 2**

[DESCRIPTION]
Brief description or current state

[ACTIONS - Optional content section]
```

### Example: Strategy Panel
```markdown
🤖 **Martingale Bot**

💰 **Balance:** 1.5000 SOL

📊 **Current Configuration:**
💰 Initial Buy: 0.01 SOL | 📉 Drop: 4%
⚡ Multiplier: 1.2x | 🔢 Levels: 6
🎯 Profit: 5% | 📎 Max Risk: 0.0856 SOL

📈 **Active Strategies:** 2

🚀 Ready to dominate the markets?
```

---

## 🎛️ Button Layout Rules

### Maximum Buttons Per Row
- **Maximum: 2 buttons per row** (for mobile readability)
- Exception: Toggle buttons (3 max for preset selections)

### Button Order Priority
1. **Primary Action** (left/top)
2. **Secondary Action** (right)
3. **Tertiary Actions** (below)
4. **Navigation** (always at bottom)

### Button Text Format
```
[Emoji] [Action/Label]
```

### Example Button Layouts

#### Good ✅
```javascript
[🚀 Launch Strategy] [⚙️ Configure]
[📊 Active Bots]    [📈 History]
[🔙 Back]           [🏠 Main Menu]
```

#### Bad ❌ (Too many per row)
```javascript
[🚀 Launch] [⚙️ Config] [📊 Active] [📈 History]
```

---

## 📏 Formatting Standards

### Number Formats
```
SOL amounts:    X.XXXX SOL (4 decimals)
Percentages:    X.XX% (2 decimals)
USD amounts:    $X.XX (2 decimals)
Token prices:   $X.XXXXXX (6-8 decimals for small values)
```

### Text Formatting
```
**Bold** for:
- Important values (balance, P&L)
- Section headers
- Key metrics

*Italic* for:
- Taglines
- Descriptions
- Status messages

`Code` for:
- Addresses (abbreviated: ABCD...WXYZ)
- Strategy IDs
- Technical values
```

### Section Spacing
```
[Title Line]

[Context Section - no extra space]

[Status Section - one blank line above]

[Description - one blank line above]

[Buttons - one blank line above]
```

---

## 🎨 Panel Templates

### Main Menu Template
```markdown
[BOT_TITLE]

🟠 *Your Premium Solana Trading Terminal*

📊 **Market:** SOL $XXX.XX | 24H: [+/-]X.XX%

💰 **Balance:** X.XXXX SOL
📍 `ABCD...WXYZ`

💻 **Active Bots:** X | [🟢/🔴] [+/-]X.XXXX SOL

[Buttons]
```

### Strategy Menu Template
```markdown
[STRATEGY_EMOJI] **Strategy Name**

💰 **Balance:** X.XXXX SOL

📊 **Current Configuration:**
💰 [Param 1]: [Value] | 📉 [Param 2]: [Value]
⚡ [Param 3]: [Value] | 🔢 [Param 4]: [Value]

📎 **Max Risk:** X.XXXX SOL
📈 **Active Strategies:** X

🚀 [Call to action message]

[Buttons: max 2 per row]
```

### Configuration Menu Template
```markdown
[STRATEGY_EMOJI] **Strategy Configuration**

💰 **Balance:** X.XXXX SOL

🔧 **Current Settings:**
💰 **[Param 1]:** [Value]
📉 **[Param 2]:** [Value]
⚡ **[Param 3]:** [Value]

📊 **Investment Breakdown:**
[Breakdown details]

💎 **Total Max Investment:** X.XXXX SOL

⚠️ [Risk warning]

[Buttons: Presets on top, params below, navigation at bottom]
```

### Active Strategy List Template
```markdown
[STRATEGY_EMOJI] **Active Strategies** (X)

[For each strategy:]
**X. [SYMBOL]**
🆔 `XXXXXXXX`
💰 Value: X.XXXX SOL
📈 Level: X/Y
[🟢/🔴] P&L: [+/-]X.XXXX SOL ([+/-]X.XX%)
⏰ [Time ago]

[One blank line between strategies]

💡 **Tap a strategy to view details**

[Buttons: individual strategy buttons, then navigation]
```

### Detail View Template
```markdown
[STRATEGY_EMOJI] **[SYMBOL]** Strategy Details

🆔 **ID:** `XXXXXXXX`
📈 **Status:** [Emoji] [STATUS]

💰 **Financial Summary:**
• Total Invested: **X.XXXX SOL**
• Current Value: **X.XXXX SOL**
• P&L: [🟢/🔴] **[+/-]X.XXXX SOL**

🤖 **Strategy Info:**
• Level: **X/Y**
• [Additional metrics]

📊 **Price Tracking:**
• Current: **$X.XXXXXX**
• 1H: [Change]
• 24H: [Change]

⏰ **Created:** [Date/Time]

[Buttons: Actions top, navigation bottom]
```

---

## 🚫 Anti-Patterns (Don't Do This)

### ❌ Too Much Text
```markdown
📊 This is a very long explanation of what this
feature does and why you should use it. We're going to
tell you about the history of this feature and all the
technical details that you probably don't need...

[LONG WALLS OF TEXT ARE BAD]
```

### ❌ Inconsistent Formatting
```markdown
Balance: 1.5 SOL    ❌ (not bold)
P&L: +0.125SOL      ❌ (no space before unit)
Profit: 5.5 %       ❌ (space before %)
```

### ❌ Too Many Buttons Per Row
```markdown
[Btn1] [Btn2] [Btn3] [Btn4]  ❌ (unreadable on mobile)
```

### ❌ Inconsistent Emoji Use
```markdown
💰 Balance: 1.5 SOL
💵 P&L: +0.125 SOL   ❌ (use 💰 or 📈, not 💵)
```

---

## ✅ Best Practices

### Do This ✅
```markdown
1. Keep panels scannable (max 10-12 lines of text)
2. Use bold for ALL important values
3. Group related information together
4. Max 2 buttons per row (except preset toggles)
5. Consistent emoji usage throughout
6. Always show units (SOL, %, $)
7. Use visual separators for clarity
8. Place navigation buttons at bottom
9. Show loading states for slow operations
10. Provide helpful error messages
```

---

## 📱 Mobile-First Design

### Key Principles
1. **Thumb-friendly buttons** - Easy to tap on mobile
2. **Readable text** - No tiny fonts or cramped spacing
3. **Scrollable content** - Long lists should paginate
4. **Clear hierarchy** - Most important info at top
5. **Fast loading** - Show placeholders while loading

### Example Mobile-Optimized Layout
```markdown
[Big, clear title]

[One key metric]
[Another key metric]

[Brief status]

[2 large buttons max per row]
[2 large buttons max per row]
[Navigation buttons]
```

---

## 🎯 Implementation Checklist

When creating or updating a panel:

```
☐ Follows standard panel structure template
☐ Uses consistent emoji system
☐ Max 2 buttons per row (except presets)
☐ All values show proper units
☐ Important values are bold
☐ Proper spacing between sections
☐ Navigation buttons at bottom
☐ Text is concise and scannable
☐ Number formats are consistent
☐ Mobile-friendly layout
```

---

## 📚 Examples by Feature

### Wallet Panel
```markdown
💰 **Wallet**

📍 **Address:** `ABCD...WXYZ`
💰 **Balance:** 1.5000 SOL

🔑 **Type:** Imported (Mnemonic)
📊 **Network:** Mainnet

✅ Your wallet is ready for trading!

[💸 Send] [🔑 Export Key]
[🔄 Refresh] [⚙️ Settings]
[🔙 Back] [🏠 Main Menu]
```

### Dashboard Panel
```markdown
📊 **Platform Dashboard**

👥 **User Engagement**
• Active Users (7d): **123**
• New Users (7d): **45**

🤖 **Trading Activity**
• Active Strategies: **67**
• Total Volume: **123.4500 SOL**

💰 **Revenue**
• Platform Fees (7d): **1.2345 SOL**

🔄 **Last Updated:** [Time]

[🔄 Refresh]
[🔙 Main Menu]
```

---

## 🔧 Maintenance

This style guide should be updated when:
- New features are added
- User feedback suggests improvements
- Competitor analysis reveals better patterns
- Mobile usability issues are identified

**Last Updated:** Phase 2A - UI Standardization
**Version:** 1.0.0
