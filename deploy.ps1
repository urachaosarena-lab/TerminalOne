# TerminalOne Bot Deployment Script
# Usage: .\deploy.ps1 ["commit message"]

param(
    [string]$Message = "Update bot code"
)

Write-Host "Starting deployment..." -ForegroundColor Cyan

# Step 1: Stage and commit changes
Write-Host "`nCommitting changes..." -ForegroundColor Yellow
git add -A
git commit -m $Message

# Step 2: Push to GitHub
Write-Host "`nPushing to GitHub..." -ForegroundColor Yellow
git push origin master

# Step 3: Deploy to server
Write-Host "`nDeploying to server..." -ForegroundColor Yellow
$deployCmd = "cd /root/terminalone-bot; git pull origin master; npm install --omit=dev; pm2 restart terminalone-bot"
ssh -i C:\Users\0xeN48Le1337\.ssh\terminalone-key root@178.156.196.9 $deployCmd

# Step 4: Check status
Write-Host "`nChecking bot status..." -ForegroundColor Green
ssh -i C:\Users\0xeN48Le1337\.ssh\terminalone-key root@178.156.196.9 "pm2 status terminalone-bot"

Write-Host "`nDeployment complete!" -ForegroundColor Green
