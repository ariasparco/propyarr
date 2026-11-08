# Installs the MetaTrader 5 terminal.
#
#   powershell -ExecutionPolicy Bypass -File deploy\mt5-install.ps1
#
# This installs the standard MetaQuotes build, which can connect to any broker's
# server. If your broker gives you their own branded installer, use that instead
# and skip this script - the agent works with either.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$LogFile = 'C:\propino\mt5-install.log'

function Log {
    param([string]$Message, [string]$Colour = 'Gray')
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line -ForegroundColor $Colour
    if (Test-Path 'C:\propino') { Add-Content -Path $LogFile -Value $line -Encoding utf8 }
}

Log '-------------------------------------------' 'White'
Log 'Installing MetaTrader 5' 'White'
Log '-------------------------------------------' 'White'

# -- Already there? --------------------------------------------
$existing = @(
    'C:\Program Files\MetaTrader 5\terminal64.exe',
    'C:\Program Files (x86)\MetaTrader 5\terminal64.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($existing) {
    Log "OK  already installed at $existing" 'Green'
    Log 'Nothing to do. Run deploy\agent-setup.ps1 next.' 'Yellow'
    return
}

# -- Download --------------------------------------------------
Log '== downloading the installer' 'Cyan'
[Net.ServicePointManager]::SecurityProtocol =
    [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11
$installer = "$env:TEMP\mt5setup.exe"
Remove-Item $installer -Force -ErrorAction SilentlyContinue

# MetaQuotes turns away PowerShell's default user agent, so every attempt sends
# a browser one. curl.exe is tried first because it ships with Windows and
# handles their redirects most reliably.
$agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

$sources = @(
    'https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe',
    'https://download.mql5.com/cdn/web/metaquotes.ltd/mt5/mt5setup.exe'
)

function Test-Downloaded {
    param([string]$Path)
    # A real installer is megabytes; an error page would be a few kilobytes.
    (Test-Path $Path) -and ((Get-Item $Path).Length -gt 500KB)
}

$got = $false
foreach ($url in $sources) {
    Log "  source: $url"

    # 1) curl.exe
    if (-not $got -and (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
        Log '    trying curl'
        & curl.exe -L -A $agent --connect-timeout 30 --max-time 900 -s -S -o $installer $url 2>&1 |
            ForEach-Object { Log "      $_" 'DarkGray' }
        if (Test-Downloaded $installer) { $got = $true }
    }

    # 2) Invoke-WebRequest with a browser user agent
    if (-not $got) {
        Log '    trying Invoke-WebRequest'
        try {
            Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing `
                -UserAgent $agent -TimeoutSec 900
            if (Test-Downloaded $installer) { $got = $true }
        } catch {
            Log ("      " + $_.Exception.Message) 'DarkGray'
        }
    }

    # 3) Plain .NET client, which negotiates differently again
    if (-not $got) {
        Log '    trying WebClient'
        try {
            $client = New-Object Net.WebClient
            $client.Headers.Add('User-Agent', $agent)
            $client.DownloadFile($url, $installer)
            $client.Dispose()
            if (Test-Downloaded $installer) { $got = $true }
        } catch {
            Log ("      " + $_.Exception.Message) 'DarkGray'
        }
    }

    if ($got) { break }
    Log '    this source did not work, trying the next' 'Yellow'
}

if (-not $got) {
    Log '' 'White'
    Log 'Could not download MetaTrader 5 automatically.' 'Red'
    Log '' 'White'
    Log 'Do this instead - it takes a minute:' 'Yellow'
    Log '  1. Open a browser on this server' 'Yellow'
    Log '  2. Go to https://www.metatrader5.com/en/download' 'Cyan'
    Log '     (or use your broker download page)' 'DarkGray'
    Log '  3. Run the installer you download' 'Yellow'
    Log '  4. Then run: deploy\agent-setup.ps1' 'Cyan'
    exit 1
}

$sizeMb = [math]::Round((Get-Item $installer).Length / 1MB, 1)
Log "OK  downloaded ($sizeMb MB)" 'Green'

# -- Install ---------------------------------------------------
# /auto runs the installer without prompting.
Log '== installing (a couple of minutes)' 'Cyan'
Start-Process $installer -ArgumentList '/auto' -Wait
Remove-Item $installer -Force -ErrorAction SilentlyContinue

# The installer sometimes lands in a broker-named folder rather than the
# default one, so search rather than assume.
Log '== locating the terminal' 'Cyan'
$terminal = $null
foreach ($root in 'C:\Program Files', 'C:\Program Files (x86)') {
    $found = Get-ChildItem $root -Filter 'terminal64.exe' -Recurse -ErrorAction SilentlyContinue |
             Select-Object -First 1
    if ($found) { $terminal = $found.FullName; break }
}

if ($terminal) {
    Log "OK  installed at $terminal" 'Green'
    Log '' 'White'
    Log 'Next steps:' 'Yellow'
    Log '  1. Open MetaTrader once and log into an account so it downloads' 'Yellow'
    Log '     the broker server list.' 'Yellow'
    Log '  2. Then run: powershell -ExecutionPolicy Bypass -File deploy\agent-setup.ps1' 'Cyan'
} else {
    Log 'The installer finished but terminal64.exe was not found.' 'Red'
    Log 'It may still be running - wait a moment and check Program Files.' 'Yellow'
}
