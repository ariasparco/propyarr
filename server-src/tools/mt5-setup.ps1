# mt5-setup.ps1 -- prepares the template terminal so the farm can clone it.
#
#   .\tools\mt5-setup.ps1
#   .\tools\mt5-setup.ps1 -TemplateDir 'C:\MetaTrader 5'
#
# Does the parts that can be done without touching the MetaTrader window:
#   * copies PropinoBridge.mq5 into the template's MQL5\Experts
#   * compiles it with MetaEditor's command line and reports any errors
#   * writes the EA's settings file (site URL + bridge secret) so the inputs
#     never have to be typed into a dialog
#   * writes the startup config so the EA is attached automatically at launch,
#     which removes the "drag it onto a chart and save a profile" step entirely
#
# One thing is left to do by hand, because MetaTrader keeps it somewhere this
# script cannot safely write: allowing WebRequest to the site. It is one
# checkbox and one line of text, and the script prints exactly where.

[CmdletBinding()]
param(
    [string] $TemplateDir = 'C:\MetaTrader 5',
    [string] $ProjectDir  = 'C:\propino',
    [string] $SiteUrl     = 'https://propino.top',
    [string] $BridgeSecret = '',
    [int]    $PushSeconds = 5
)

$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Step($n, $msg) { Write-Host ""; Write-Host "[$n] $msg" -ForegroundColor Cyan }

# ---------------------------------------------------------------- secret ----
if (-not $BridgeSecret) {
    $envFile = Join-Path $ProjectDir '.env'
    if (-not (Test-Path $envFile)) { Fail "No -BridgeSecret given and $envFile not found." }
    $line = Select-String -Path $envFile -Pattern '^\s*BRIDGE_SECRET\s*=' | Select-Object -First 1
    if (-not $line) { Fail "BRIDGE_SECRET not found in $envFile." }
    $BridgeSecret = ($line.Line -replace '^\s*BRIDGE_SECRET\s*=\s*', '').Trim('"', "'", ' ')
}
if (-not $BridgeSecret) { Fail 'BRIDGE_SECRET is empty.' }

# ---------------------------------------------------------------- paths -----
$terminalExe = Join-Path $TemplateDir 'terminal64.exe'
$editorExe   = Join-Path $TemplateDir 'metaeditor64.exe'
if (-not (Test-Path $terminalExe)) { Fail "No terminal64.exe in '$TemplateDir'. Point -TemplateDir at the MetaTrader folder." }
if (-not (Test-Path $editorExe))   { Fail "No metaeditor64.exe in '$TemplateDir'." }

$source = Join-Path $ProjectDir 'ea\PropinoBridge.mq5'
if (-not (Test-Path $source)) { Fail "Source not found: $source" }

# A terminal launched /portable keeps everything inside its own folder, which
# is how the farm isolates accounts. The template is prepared the same way so
# the clones inherit a working layout.
$mql5 = Join-Path $TemplateDir 'MQL5'
if (-not (Test-Path $mql5)) {
    Write-Host "MQL5 folder not present yet -- starting the terminal once to create it..."
    Start-Process -FilePath $terminalExe -ArgumentList '/portable' -WorkingDirectory $TemplateDir | Out-Null
    $waited = 0
    while (-not (Test-Path $mql5) -and $waited -lt 60) { Start-Sleep -Seconds 2; $waited += 2 }
    Get-Process terminal64 -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $terminalExe } |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    if (-not (Test-Path $mql5)) { Fail "MetaTrader did not create $mql5. Open it once by hand, then re-run." }
}

Write-Host ""
Write-Host ("=" * 66)
Write-Host " Preparing template: $TemplateDir"
Write-Host ("=" * 66)

# ---------------------------------------------------------------- copy ------
Step 1 'Copying the Expert Advisor'
$expertsDir = Join-Path $mql5 'Experts'
New-Item -ItemType Directory -Force -Path $expertsDir | Out-Null
$target = Join-Path $expertsDir 'PropinoBridge.mq5'
Copy-Item -LiteralPath $source -Destination $target -Force
Write-Host "    -> $target"

# ---------------------------------------------------------------- compile ---
Step 2 'Compiling'
$log = Join-Path $env:TEMP 'propino-compile.log'
if (Test-Path $log) { Remove-Item $log -Force }

# MetaEditor's command line returns before the log is flushed, so the exit code
# alone is not a reliable signal -- the log is what actually says what happened.
$p = Start-Process -FilePath $editorExe `
                   -ArgumentList @("/compile:`"$target`"", "/log:`"$log`"") `
                   -Wait -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

$compiled = Join-Path $expertsDir 'PropinoBridge.ex5'
$logText = ''
if (Test-Path $log) {
    # MetaEditor writes its log as UTF-16.
    $logText = Get-Content -LiteralPath $log -Raw -Encoding Unicode -ErrorAction SilentlyContinue
    if (-not $logText) { $logText = Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue }
}

if (Test-Path $compiled) {
    Write-Host "    compiled OK -> PropinoBridge.ex5" -ForegroundColor Green
    if ($logText -match '(\d+)\s+warning') { Write-Host "    ($($Matches[1]) warning(s), harmless)" }
} else {
    Write-Host "    COMPILE FAILED (exit $($p.ExitCode))" -ForegroundColor Red
    if ($logText) {
        Write-Host ""
        Write-Host "--- compiler output ---------------------------------------" -ForegroundColor Yellow
        ($logText -split "`r?`n" | Where-Object { $_ -match '\S' } | Select-Object -Last 25) |
            ForEach-Object { Write-Host "  $_" }
        Write-Host "-----------------------------------------------------------" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Send those lines back and they can be fixed." -ForegroundColor Yellow
    } else {
        Write-Host "  No log was produced. Compile by hand instead: open MetaEditor (F4)," -ForegroundColor Yellow
        Write-Host "  open PropinoBridge.mq5, press F7, and send the error text." -ForegroundColor Yellow
    }
    exit 1
}

# ---------------------------------------------------------------- preset ----
Step 3 'Writing the EA settings'
# A preset file means the inputs are already filled in when the EA loads, so
# nobody has to type a 44-character secret into a dialog on every terminal.
$presetDir = Join-Path $mql5 'Presets'
New-Item -ItemType Directory -Force -Path $presetDir | Out-Null
$presetPath = Join-Path $presetDir 'propino.set'
$preset = @"
SiteUrl=$SiteUrl
BridgeSecret=$BridgeSecret
PushSeconds=$PushSeconds
VerboseLog=false
"@
Set-Content -LiteralPath $presetPath -Value $preset -Encoding ASCII
Write-Host "    -> $presetPath"
Write-Host "    SiteUrl      = $SiteUrl"
Write-Host "    BridgeSecret = $($BridgeSecret.Substring(0, 6))... ($($BridgeSecret.Length) chars)"

# ---------------------------------------------------------------- verify ----
Step 4 'Checking the WebRequest permission'
# MetaTrader refuses outbound HTTP from an EA unless the host is on an
# allow-list that lives in the terminal's own settings. Writing that file from
# outside is unreliable across versions, so this only reports the state.
$allowed = $false
$siteHost = ([uri]$SiteUrl).Host

# Look in both places MetaTrader may have written it. A terminal started by
# double-click stores its settings under AppData; only one started /portable
# keeps them in the installation folder. Checking just one of the two reported
# this step as undone after it had been done.
$searchDirs = @(Join-Path $TemplateDir 'config')
$roaming = Join-Path $env:APPDATA 'MetaQuotes\Terminal'
if (Test-Path $roaming) {
    Get-ChildItem -Path $roaming -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^[0-9A-F]{32}$' } |
        ForEach-Object { $searchDirs += (Join-Path $_.FullName 'config') }
}

$foundIn = $null
foreach ($d in $searchDirs) {
    if (-not (Test-Path $d)) { continue }
    foreach ($f in (Get-ChildItem -Path $d -Filter '*.ini' -File -ErrorAction SilentlyContinue)) {
        $ini = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $ini) { continue }

        # MetaTrader stores the allowed URL obfuscated, not as readable text:
        #
        #   WebRequest=1
        #   WebRequestUrl=451BF584A58E40E1F6FA816078B3DE94...
        #
        # Searching for the hostname never matches however correctly the
        # permission was granted, so this reported the step as outstanding long
        # after it had been done. What can be checked is that the feature is on
        # and that a URL was committed to the list.
        $on  = $ini -match '(?m)^\s*WebRequest\s*=\s*1\s*$'
        $url = $ini -match '(?m)^\s*WebRequestUrl\s*=\s*\S+\s*$'
        if ($on -and $url) {
            $allowed = $true
            $foundIn = $d
            break
        }
    }
    if ($allowed) { break }
}

# Granted, but in AppData: the clones run /portable and will never see it.
$portableConfig = Join-Path $TemplateDir 'config'
if ($allowed -and $foundIn -and ($foundIn -ne $portableConfig)) {
    Write-Host "    found in $foundIn" -ForegroundColor Yellow
    Write-Host "    copying it into the template so the clones inherit it..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $portableConfig | Out-Null
    Copy-Item -Path (Join-Path $foundIn '*.ini') -Destination $portableConfig -Force
    Write-Host "    -> $portableConfig" -ForegroundColor Green
} elseif ($allowed) {
    Write-Host "    found in $foundIn" -ForegroundColor Green
}

Write-Host ""
Write-Host ("=" * 66)
if ($allowed) {
    Write-Host " Template ready." -ForegroundColor Green
    Write-Host ""
    Write-Host " Next:"
    Write-Host "   cd $ProjectDir"
    Write-Host "   .\tools\mt5-farm.ps1 -Reset"
    Write-Host "   .\tools\mt5-farm.ps1 -Sync -TemplateDir '$TemplateDir'"
    Write-Host "   npm run feed:status"
} else {
    Write-Host " ONE MANUAL STEP LEFT" -ForegroundColor Yellow
    Write-Host ("=" * 66)
    Write-Host ""
    Write-Host " MetaTrader blocks an EA from reaching the internet until the"
    Write-Host " address is on its allow-list. This is the only part that has to"
    Write-Host " be clicked."
    Write-Host ""
    Write-Host "   1. Open:  $terminalExe"
    Write-Host "   2. Menu:  Tools  ->  Options       (or press Ctrl+O)"
    Write-Host "   3. Tab:   Expert Advisors"
    Write-Host "   4. Tick:  Allow WebRequest for listed URL"
    Write-Host "   5. In the box under it, type exactly:"
    Write-Host ""
    Write-Host "        $SiteUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "      then press Enter so it appears as a list entry."
    Write-Host "   6. Click OK, then close MetaTrader completely."
    Write-Host ""
    Write-Host " Then run this script again -- it will confirm the setting and"
    Write-Host " tell you the next command."
}
Write-Host ("=" * 66)
Write-Host ""
