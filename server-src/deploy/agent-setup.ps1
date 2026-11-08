# Sets up the MetaTrader monitoring agent on this server.
#
#   powershell -ExecutionPolicy Bypass -File deploy\agent-setup.ps1
#
# Installs Python and the two packages the agent needs, writes its
# configuration with the bridge secret already filled in, and schedules it to
# start automatically.
#
# MetaTrader 5 itself must be installed first - its installer has a UI and
# cannot be scripted. Download it from your broker.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$AppDir   = 'C:\propino'
$AgentDir = "$AppDir\agent"
$LogFile  = "$AppDir\agent-setup.log"
$q        = [char]34

function Log {
    param([string]$Message, [string]$Colour = 'Gray')
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line -ForegroundColor $Colour
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Invoke-Native {
    param([string]$CommandLine)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Log "  > $CommandLine"
    & cmd.exe /c ($CommandLine + ' >> ' + $q + $LogFile + $q + ' 2>&1')
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    return $code
}

Log '-------------------------------------------' 'White'
Log 'Monitoring agent setup' 'White'
Log '-------------------------------------------' 'White'

if (-not (Test-Path "$AgentDir\mt5_agent.py")) {
    throw "The agent is missing from $AgentDir. Copy the agent folder there first."
}

# -- 1. MetaTrader 5 -------------------------------------------
Log '== looking for MetaTrader 5' 'Cyan'

function Find-MetaTrader {
    # A terminal that is already running tells us its exact path - the most
    # reliable answer there is.
    $running = Get-Process terminal64 -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($running -and $running.Path) { return $running.Path }

    # Brokers install into a folder named after themselves, so search rather
    # than guess at "MetaTrader 5".
    $roots = @(
        'C:\Program Files',
        'C:\Program Files (x86)',
        "$env:LOCALAPPDATA\Programs",
        "$env:APPDATA",
        'C:\'
    )
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        # Depth-limited so a full C:\ scan cannot take minutes.
        $depth = if ($root -eq 'C:\') { 2 } else { 3 }
        $found = Get-ChildItem -Path $root -Filter 'terminal64.exe' -Recurse -Depth $depth `
                     -ErrorAction SilentlyContinue -File |
                 Select-Object -First 1
        if ($found) { return $found.FullName }
    }

    # Shortcuts point at it too, and are cheap to read.
    $shortcutDirs = @(
        "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
        "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
        "$env:PUBLIC\Desktop",
        "$env:USERPROFILE\Desktop"
    )
    $shell = New-Object -ComObject WScript.Shell
    foreach ($dir in $shortcutDirs) {
        if (-not (Test-Path $dir)) { continue }
        $links = Get-ChildItem $dir -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue
        foreach ($link in $links) {
            try {
                $target = $shell.CreateShortcut($link.FullName).TargetPath
                if ($target -like '*terminal64.exe' -and (Test-Path $target)) {
                    return $target
                }
            } catch { }
        }
    }
    return $null
}

$mt5 = Find-MetaTrader
if ($mt5) {
    Log "OK  found at $mt5" 'Green'
} else {
    Log 'MetaTrader 5 was not found.' 'Yellow'
    Log 'If it is installed somewhere unusual, note the full path to' 'Yellow'
    Log 'terminal64.exe and put it in config.json as terminalPath.' 'Yellow'
    Log 'Everything else below will still be prepared.' 'DarkGray'
}

# -- 2. Python -------------------------------------------------
Log '== Python' 'Cyan'

function Find-Python {
    # Windows ships a stub at WindowsApps that only opens the Microsoft Store.
    # It answers "where python" but is not a working interpreter, so any path
    # under WindowsApps is ignored.
    $candidates = @()
    $onPath = Get-Command python.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -notlike '*WindowsApps*' }
    if ($onPath) { $candidates += $onPath.Source }

    foreach ($pattern in @(
        'C:\Python3*\python.exe',
        'C:\Program Files\Python3*\python.exe',
        "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe"
    )) {
        $candidates += (Get-Item $pattern -ErrorAction SilentlyContinue |
            ForEach-Object { $_.FullName })
    }

    foreach ($candidate in $candidates) {
        if (-not $candidate -or -not (Test-Path $candidate)) { continue }
        # Ask it to prove itself. Routed through cmd so a failure cannot raise
        # a terminating PowerShell error.
        $check = & cmd.exe /c ('"' + $candidate + '" -c "print(42)" 2>nul')
        if ("$check".Trim() -eq '42') { return $candidate }
    }
    return $null
}

$python = Find-Python
if ($python) {
    Log ("--  already installed: " + (& $python --version 2>&1)) 'DarkGray'
} else {
    # 3.11 is chosen deliberately: the MetaTrader5 package publishes prebuilt
    # wheels for it, so pip never needs a compiler.
    $installer = "$env:TEMP\python-setup.exe"
    Log 'downloading Python 3.11'
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 600 `
        -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' `
        -OutFile $installer
    Log 'installing (a minute or two)'
    Start-Process $installer -Wait -ArgumentList `
        '/quiet InstallAllUsers=1 PrependPath=1 Include_pip=1 Include_launcher=1'
    Remove-Item $installer -Force -ErrorAction SilentlyContinue

    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $env:Path = "$machinePath;$env:Path"
    $python = Find-Python
    if (-not $python) { throw 'Python installed but is still not on PATH. Reboot and run this again.' }
    Log "OK  $(& $python --version)" 'Green'
}

# -- 3. Packages -----------------------------------------------
Log '== installing the agent packages' 'Cyan'
# The full path is used everywhere from here on, so nothing depends on PATH
# being refreshed in this particular shell.
$code = Invoke-Native ($q + $python + $q + ' -m pip install --upgrade pip')
$code = Invoke-Native ($q + $python + $q + ' -m pip install MetaTrader5 requests')
if ($code -ne 0) { throw "pip install failed (exit $code) - see agent-setup.log" }
Log 'OK  MetaTrader5 and requests installed' 'Green'

# -- 4. Configuration ------------------------------------------
Log '== agent configuration' 'Cyan'
$configPath = "$AgentDir\config.json"

# The secret has to match the site exactly, so read it rather than retype it.
$envText = Get-Content "$AppDir\.env" -Raw
$secretMatch = [regex]::Match($envText, '(?m)^BRIDGE_SECRET="?([^"\r\n]+)"?')
if (-not $secretMatch.Success) { throw 'BRIDGE_SECRET was not found in C:\propino\.env' }
$bridgeSecret = $secretMatch.Groups[1].Value

$siteMatch = [regex]::Match($envText, '(?m)^NEXT_PUBLIC_SITE_URL="?([^"\r\n]+)"?')
$siteUrl = if ($siteMatch.Success) { $siteMatch.Groups[1].Value } else { 'https://propino.top' }

# Set-Content -Encoding utf8 prefixes a byte-order mark on Windows PowerShell
# 5.1, and Python's json parser rejects it. Write plain UTF-8 instead.
function Write-Json {
    param([string]$Path, [string]$Text)
    [System.IO.File]::WriteAllText(
        $Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

if (Test-Path $configPath) {
    Log '--  config.json already exists, leaving your accounts alone' 'DarkGray'
    # Keep the accounts but refresh the connection details.
    $existing = Get-Content $configPath -Raw | ConvertFrom-Json
    $existing.siteUrl = $siteUrl
    $existing.bridgeSecret = $bridgeSecret
    if ($mt5) { $existing.terminalPath = $mt5 }
    Write-Json $configPath ($existing | ConvertTo-Json -Depth 6)
    Log 'OK  connection details refreshed' 'Green'
} else {
    $config = [ordered]@{
        siteUrl         = $siteUrl
        bridgeSecret    = $bridgeSecret
        intervalSeconds = 120
        historyDays     = 60
        terminalPath    = if ($mt5) { $mt5 } else { 'C:\Program Files\MetaTrader 5\terminal64.exe' }
        accounts        = @(
            [ordered]@{
                login    = 'REPLACE-WITH-ACCOUNT-NUMBER'
                password = 'REPLACE-WITH-INVESTOR-PASSWORD'
                server   = 'REPLACE-WITH-BROKER-SERVER'
            }
        )
    }
    Write-Json $configPath ($config | ConvertTo-Json -Depth 6)
    Log 'OK  config.json created' 'Green'
    Log '    Add your accounts to it before starting the agent.' 'Yellow'
}

# -- 5. Start it automatically ---------------------------------
# A scheduled task at logon, not a Windows service: the MetaTrader terminal
# needs a real desktop session, which services do not get.
Log '== scheduling the agent' 'Cyan'
$taskName = 'PROPINO Monitoring Agent'

$startBat = "$AgentDir\start-agent.bat"
@"
@echo off
cd /d "$AgentDir"
:loop
"$python" mt5_agent.py >> "$AppDir\agent.log" 2>&1
echo [%date% %time%] agent stopped, restarting in 15s >> "$AppDir\agent.log"
timeout /t 15 /nobreak >nul
goto loop
"@ | Set-Content -Path $startBat -Encoding ascii

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action  = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$startBat`"" -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -RunLevel Highest -User $env:USERNAME -Force | Out-Null
Log 'OK  the agent will start whenever you sign in' 'Green'

# -- Done ------------------------------------------------------
Log '' 'White'
Log '-------------------------------------------' 'White'
Log 'Agent prepared.' 'Green'
Log '' 'White'
Log 'Still to do:' 'Yellow'
if (-not $mt5) {
    Log '  1. Install MetaTrader 5 from your broker, then run this script again' 'Yellow'
}
Log "  2. Open $configPath and add your accounts" 'Yellow'
Log '     - use each account READ-ONLY (investor) password, never the master one' 'Yellow'
Log '     - the server name is exactly what MetaTrader shows in its login window' 'Yellow'
Log '  3. Start it now with:' 'Yellow'
Log "       Start-ScheduledTask -TaskName '$taskName'" 'Cyan'
Log '  4. Watch it work:' 'Yellow'
Log "       Get-Content $AppDir\agent.log -Wait -Tail 20" 'Cyan'
Log '' 'White'
Log 'IMPORTANT: when you finish with Remote Desktop, click the X to disconnect.' 'Red'
Log 'Do NOT choose Sign out - that closes the session and stops MetaTrader.' 'Red'
