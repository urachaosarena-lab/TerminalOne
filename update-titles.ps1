# Update all panel titles to include version dynamically

$files = @(
    "src\commands\martingale.js",
    "src\commands\wallet.js",
    "src\commands\start.js",
    "src\commands\help.js",
    "src\commands\hero.js",
    "src\index.js"
)

foreach ($file in $files) {
    $filePath = Join-Path $PSScriptRoot $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw
        $content = $content -replace '🦈 \*\*TerminalOne🦈\*\*', '${getBotTitle()}'
        Set-Content $filePath -Value $content -NoNewline
        Write-Host "Updated $file" -ForegroundColor Green
    }
}

Write-Host "All titles updated!" -ForegroundColor Cyan
