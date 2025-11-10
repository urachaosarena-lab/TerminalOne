# 🔧 TerminalOne Fixes & Improvements - Implementation Plan

**Created:** November 10, 2025  
**Version Target:** v0.12.2

---

## ✅ APPROVED FOR IMPLEMENTATION

### **1. Decimal Handling Fix (Solution 1 - Hybrid)**
**Priority:** CRITICAL  
**Status:** 🟡 IN PROGRESS

**Changes:**
- Create on-chain decimal fetching in SolanaService
- Add persistent decimal cache (data/token_decimals.json)
- Update JupiterTradingService to use new decimal fetching
- Default to 6 decimals (Pump.fun standard) if all methods fail
- Remove 100x correction hack from GridTradingService

**Files to modify:**
- `src/services/SolanaService.js` - Add `getTokenDecimals()` method
- `src/services/JupiterTradingService.js` - Update buy/sell to fetch decimals
- `src/services/TokenMetadataService.js` - Improve decimal caching
- `src/services/GridTradingService.js` - Remove lines 656-665 (100x hack)
- Create `data/token_decimals.json` - Pre-populated with common tokens

---

### **2. Price API Caching**
**Priority:** HIGH  
**Status:** 🟡 IN PROGRESS

**Solution:** Implement 30-second cache for all price fetches

**Changes:**
- Add memory cache with 30s TTL in EnhancedPriceService
- Cache key: `tokenAddress`
- Cache value: `{ price, change1h, change24h, timestamp }`

**Files to modify:**
- `src/services/EnhancedPriceService.js` - Add caching layer

---

### **3. Transaction Simulation**
**Priority:** HIGH  
**Status:** 🟡 IN PROGRESS

**Solution:** Simulate all trades before execution

**Changes:**
- Add `simulateSwap()` method in JupiterTradingService
- Check simulation result before executing real transaction
- Estimate gas and validate account state
- Fail early with clear error messages

**Files to modify:**
- `src/services/JupiterTradingService.js` - Add simulation before executeTransaction

---

### **4. Pre-trade Balance Verification**
**Priority:** HIGH  
**Status:** 🟡 IN PROGRESS

**Solution:** Check balance before all trades with 0.01 SOL buffer

**Changes:**
- Add `verifyBalanceFor Trade()` in JupiterTradingService
- Called before every buy/sell
- Reserve 0.01 SOL for fees and rent exemption

**Files to modify:**
- `src/services/JupiterTradingService.js` - Add balance check in executeBuy/executeSell

---

### **5. User Notifications System**
**Priority:** MEDIUM  
**Status:** 🟡 IN PROGRESS

**Solution:** Telegram notifications for strategy events with user control

**Features:**
- Notify on: Buy executed, Sell executed, Profit target hit, Strategy stopped
- Settings panel in main menu: 🔔 Notifications
- Master ON/OFF switch
- Individual notification type toggles
- Persistent user preferences

**Files to create/modify:**
- Create `src/commands/notifications.js` - Notification settings UI
- Create `src/services/NotificationService.js` - Handle notifications
- Modify `src/services/MartingaleStrategy.js` - Send notifications on events
- Modify `src/services/GridTradingService.js` - Send notifications on events
- Modify `src/commands/start.js` - Add 🔔Notifications button
- Create `data/notification_preferences.json` - Store user preferences

---

### **6. Fee Collection Report**
**Priority:** LOW  
**Status:** ✅ COMPLETED

**Action:** Analyze logs for fee collection failures

**Output:** Generate report on recent fee collection success/failure rate

---

## ❌ DEFERRED / NOT IMPLEMENTING

### **Stop Loss Improvements**
**Reason:** Not needed per user

### **Slippage Auto-Adjustment** 
**Reason:** Already partially implemented, good enough

### **Trade History Export**
**Reason:** Not priority right now

### **Circuit Breakers**
**Reason:** Can implement later if needed

---

## 📋 IMPLEMENTATION CHECKLIST

- [ ] 1. Create decimal cache database
- [ ] 2. Implement on-chain decimal fetching
- [ ] 3. Update JupiterTradingService decimal handling
- [ ] 4. Remove 100x correction hack
- [ ] 5. Add price caching layer
- [ ] 6. Implement transaction simulation
- [ ] 7. Add balance verification
- [ ] 8. Create NotificationService
- [ ] 9. Create notification settings UI
- [ ] 10. Integrate notifications into strategies
- [ ] 11. Add notification button to main menu
- [ ] 12. Test all changes thoroughly
- [ ] 13. Update version to v0.12.2
- [ ] 14. Push to GitHub
- [ ] 15. Deploy to Hetzner server

---

## 🧪 TESTING PLAN

### **Decimal Handling:**
- [ ] Test token with 6 decimals (USDC)
- [ ] Test token with 7 decimals (ORE)
- [ ] Test token with 9 decimals (SOL)
- [ ] Test unknown token (should default to 6)
- [ ] Verify no 100x errors in Grid

### **Price Caching:**
- [ ] Verify cache hits reduce API calls
- [ ] Check 429 errors reduced significantly

### **Transaction Simulation:**
- [ ] Test failed simulation prevents execution
- [ ] Verify error messages are clear

### **Balance Checks:**
- [ ] Test trade blocked with insufficient balance
- [ ] Verify 0.01 SOL buffer works

### **Notifications:**
- [ ] Test all notification types
- [ ] Verify ON/OFF switches work
- [ ] Check persistence across restarts

---

*Document will be updated as implementation progresses*
