# 🚀 Quick Deployment to Live Server

## Latest Changes Pushed
- ✅ Request throttling (1s interval between Jupiter API calls)
- ✅ Optimized quote parameters (32 accounts, minimize slippage)
- ✅ Enhanced error detection (API errors, rate limits)
- ✅ Improved logging for better debugging

---

## SSH to Your Server and Deploy

```bash
# 1. SSH to your server
ssh your-user@your-server-ip

# 2. Navigate to project directory
cd /path/to/TerminalOne

# 3. Pull latest changes
git pull origin master

# 4. Install dependencies (if needed)
npm ci

# 5. Restart the bot with PM2
pm2 restart terminalone-bot

# Or if not using PM2:
pm2 delete terminalone-bot
pm2 start src/index.js --name terminalone-bot

# 6. Check logs
pm2 logs terminalone-bot --lines 50

# 7. Verify it's running
pm2 list
```

---

## Alternative: Deploy Script (if on server)

```bash
# SSH to server first
ssh your-user@your-server-ip

cd /path/to/TerminalOne
git pull origin master
node scripts/deploy.js deploy
```

---

## Monitor After Deployment

```bash
# Watch real-time logs
pm2 logs terminalone-bot

# Check health (if health check server is running)
curl http://localhost:3001/health

# Check bot status
pm2 list

# Check process details
pm2 show terminalone-bot
```

---

## Quick Rollback (if issues occur)

```bash
# Revert to previous commit
git log --oneline -5  # See recent commits
git reset --hard <previous-commit-hash>

# Restart
pm2 restart terminalone-bot
```

---

## Test the Bot

1. Open Telegram
2. Send `/start` to your bot
3. Try executing a test trade with a small amount
4. Monitor logs: `pm2 logs terminalone-bot`

---

## Expected Improvements

✅ **Fewer 429 Rate Limit Errors**: 1s throttling prevents rapid API calls
✅ **Better Route Selection**: 32 accounts with minimizeSlippage for reliable swaps  
✅ **Smarter Retries**: Distinguishes between temporary vs permanent errors
✅ **Clearer Logs**: Enhanced error messages for easier debugging

---

## If Issues Persist

Check logs for:
- `Rate limit detected` - Throttling is working, will retry automatically
- `Jupiter API error detected` - Temporary API issue, will retry
- `Both Jupiter endpoints failed` - Check network/DNS connectivity
- `Swap variant no longer supported` - Route parameter issue (should be fixed now)
