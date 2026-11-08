# Checks what this server can and cannot reach.
#
#   powershell -ExecutionPolicy Bypass -File deploy\net-check.ps1
#
# Every service the platform depends on is tested, so a blocked route is
# identified rather than guessed at.

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

function Head { param([string]$Text) Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }

function Test-Http {
    param([string]$Label, [string]$Url)
    $result = & curl.exe -L -A $agent -o NUL -s -w '%{http_code}' --connect-timeout 15 --max-time 40 $Url 2>&1
    $code = "$result".Trim()
    if ($code -match '^(200|206|301|302|401|403)$') {
        Write-Host ("   OK   {0,-28} {1}" -f $Label, $code) -ForegroundColor Green
        return $true
    }
    Write-Host ("   BAD  {0,-28} {1}" -f $Label, $(if ($code) { $code } else { 'no response' })) -ForegroundColor Red
    return $false
}

function Test-Port {
    param([string]$Label, [string]$TargetHost, [int]$Port)
    $client = New-Object Net.Sockets.TcpClient
    try {
        $connect = $client.BeginConnect($TargetHost, $Port, $null, $null)
        $ok = $connect.AsyncWaitHandle.WaitOne(8000, $false)
        if ($ok -and $client.Connected) {
            Write-Host ("   OK   {0,-28} port {1}" -f $Label, $Port) -ForegroundColor Green
            $client.Close(); return $true
        }
        Write-Host ("   BAD  {0,-28} port {1} unreachable" -f $Label, $Port) -ForegroundColor Red
        $client.Close(); return $false
    } catch {
        Write-Host ("   BAD  {0,-28} {1}" -f $Label, $_.Exception.Message) -ForegroundColor Red
        return $false
    }
}

Write-Host '===========================================' -ForegroundColor White
Write-Host ' What can this server reach?' -ForegroundColor White
Write-Host '===========================================' -ForegroundColor White

Head 'general internet (these already worked during setup)'
Test-Http 'nodejs.org'        'https://nodejs.org/dist/index.json'      | Out-Null
Test-Http 'github.com'        'https://api.github.com'                  | Out-Null

Head 'MetaTrader download'
Test-Http 'metatrader5.com'   'https://www.metatrader5.com/en/download' | Out-Null
Test-Http 'download.mql5.com' 'https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe' | Out-Null

Head 'the blockchain nodes that confirm USDT payments'
foreach ($node in 'bsc-dataseed.binance.org', 'bsc-rpc.publicnode.com', 'bsc.drpc.org') {
    Test-Http $node ("https://$node") | Out-Null
}

Head 'email sending'
Test-Port 'smtp.c1.liara.email' 'smtp.c1.liara.email' 465 | Out-Null
Test-Port 'smtp.c1.liara.email' 'smtp.c1.liara.email' 587 | Out-Null

Head 'the dollar rate feed'
Test-Http 'tgju.org' 'https://call1.tgju.org/ajax.json' | Out-Null

Head 'broker trading servers (MetaTrader uses port 443)'
# These are the demo servers of common brokers. The agent needs whichever one
# your own accounts live on.
foreach ($broker in 'demo.metaquotes.net', 'mt5-demo.alpari.com', 'mt5demo.litefinance.com') {
    Test-Port $broker $broker 443 | Out-Null
}

Write-Host ''
Write-Host '===========================================' -ForegroundColor White
Write-Host ' Send this whole output for help' -ForegroundColor White
Write-Host '===========================================' -ForegroundColor White
