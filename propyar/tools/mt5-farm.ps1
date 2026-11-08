# mt5-farm.ps1 -- keeps one MetaTrader terminal running per live trading account.
#
#   .\tools\mt5-farm.ps1 -Status      # what is running, and what it costs in RAM
#   .\tools\mt5-farm.ps1 -Sync        # start what should run, stop what should not
#   .\tools\mt5-farm.ps1 -Sync -WhatIf
#   .\tools\mt5-farm.ps1 -StopAll
#   .\tools\mt5-farm.ps1 -Measure     # measured RAM per terminal + capacity
#
# Why
# ---
# MetaTrader connects to one account per process, so continuous monitoring of N
# accounts needs N terminals. Left to itself that grows without bound: a failed
# or passed account keeps its terminal, and its RAM, forever.
#
# This reads the platform's own roster -- which already lists only ACTIVE and
# FUNDED accounts -- and makes the running terminals match it. An account that
# breaches a rule disappears from the roster on its next check, so its terminal
# is stopped here on the next sync and the memory comes back.
#
# Setup, once
# -----------
#   1. Install MetaTrader 5 normally and set it up as the template:
#        - compile ea\PropinoBridge.mq5 (MetaEditor, F7)
#        - Tools -> Options -> Expert Advisors -> allow WebRequest for the site
#        - attach the EA to one XAUUSD chart and save the profile
#        - close the terminal
#   2. Point -TemplateDir at that installation.
#   3. Run with -Sync. Each account gets its own copy, launched /portable with
#      its own login.

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch] $Status,
    [switch] $Sync,
    [switch] $StopAll,
    [switch] $Measure,
    [switch] $Reset,

    # The hand-configured MetaTrader installation every instance is cloned from.
    [string] $TemplateDir = 'C:\MetaTrader 5',

    # Where the per-account copies live. One subfolder per account number.
    [string] $InstanceRoot = 'C:\mt5-farm',

    [string] $SiteUrl = 'https://propino.top',

    # Falls back to BRIDGE_SECRET in the project's .env.
    [string] $BridgeSecret = '',

    [string] $EnvFile = 'C:\propino\.env',

    # Safety margin held back on top of whatever is already running.
    #
    # NOT an allowance for Windows and the site -- their usage is measured
    # directly, and counting them here as well subtracted them twice and
    # reported a capacity of two accounts on a server that fits several times
    # that. This is only the cushion that keeps the box off the swap file.
    [int] $ReserveMb = 800
)

$ErrorActionPreference = 'Stop'

function Get-BridgeSecret {
    if ($BridgeSecret) { return $BridgeSecret }
    if (-not (Test-Path $EnvFile)) {
        throw "No -BridgeSecret given and $EnvFile not found."
    }
    $line = Select-String -Path $EnvFile -Pattern '^\s*BRIDGE_SECRET\s*=' |
            Select-Object -First 1
    if (-not $line) { throw "BRIDGE_SECRET not found in $EnvFile." }
    return ($line.Line -replace '^\s*BRIDGE_SECRET\s*=\s*', '').Trim('"', "'", ' ')
}

# Accounts the platform still wants watched. Failed, passed and disabled
# accounts are already absent from this list -- that is what makes their
# terminals stoppable.
function Get-Roster {
    $secret = Get-BridgeSecret
    $uri = "$($SiteUrl.TrimEnd('/'))/api/bridge/roster"
    try {
        $res = Invoke-RestMethod -Uri $uri -Headers @{ Authorization = "Bearer $secret" } -TimeoutSec 30
    } catch {
        throw "Could not read the roster from $uri : $($_.Exception.Message)"
    }
    $all = @($res.accounts)

    # An account with no read-only password cannot be signed into, so it cannot
    # be watched. Dropping it quietly is the dangerous version of that: the
    # account looks live in the panel while nothing is actually monitoring it.
    $usable = @()
    $skipped = @()
    foreach ($a in $all) {
        if ($a.password -and $a.password -ne '********') { $usable += $a }
        else { $skipped += $a.accountNumber }
    }

    if ($skipped.Count -gt 0) {
        Write-Host ''
        Write-Host ('  ' + ('!' * 60)) -ForegroundColor Red
        Write-Host "  $($skipped.Count) LIVE ACCOUNT(S) ARE NOT BEING MONITORED" -ForegroundColor Red
        Write-Host '  No investor password is stored, so no terminal can sign in.' -ForegroundColor Red
        foreach ($n in $skipped) { Write-Host "    - #$n" -ForegroundColor Red }
        Write-Host '  Fix it in the admin panel: Trading accounts -> Edit login details' -ForegroundColor Red
        Write-Host ('  ' + ('!' * 60)) -ForegroundColor Red
        Write-Host ''
    }

    return $usable
}

# Terminals started by this script, keyed by account number. Identified by the
# instance path in the command line, so a hand-started terminal is never killed.
function Get-RunningInstances {
    $rows = @()
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'terminal64.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        $cmd = [string]$p.CommandLine
        if ($cmd -match [regex]::Escape($InstanceRoot) + '\\([^\\"\s]+)') {
            $rows += [pscustomobject]@{
                Account = $Matches[1]
                Pid     = $p.ProcessId
                RamMb   = [math]::Round($p.WorkingSetSize / 1MB, 0)
            }
        }
    }
    return $rows
}

function Get-MemorySnapshot {
    $os = Get-CimInstance Win32_OperatingSystem
    $total = [math]::Round($os.TotalVisibleMemorySize / 1KB, 0)

    # 'Available MBytes' is the number Windows itself uses to decide whether an
    # allocation can be served: it includes the standby cache, which is
    # reclaimable on demand. FreePhysicalMemory excludes it and so understates
    # what is really available, sometimes by more than a gigabyte.
    $free = $null
    try {
        $free = [math]::Round((Get-Counter '\Memory\Available MBytes' -ErrorAction Stop).CounterSamples[0].CookedValue, 0)
    } catch {
        $free = [math]::Round($os.FreePhysicalMemory / 1KB, 0)
    }

    [pscustomobject]@{
        TotalMb = $total
        FreeMb  = $free
    }
}

function New-Instance {
    param([string] $Account)

    $dir = Join-Path $InstanceRoot $Account
    if (Test-Path (Join-Path $dir 'terminal64.exe')) { return $dir }

    if (-not (Test-Path (Join-Path $TemplateDir 'terminal64.exe'))) {
        throw "No terminal64.exe in -TemplateDir '$TemplateDir'."
    }

    Write-Host "  cloning template -> $dir"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    # Logs and history from the template are the template's, not this account's,
    # and copying them wastes both disk and the first-run sync.
    robocopy $TemplateDir $dir /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 `
        /XD 'logs' 'Tester' 'history' | Out-Null
    return $dir
}

# MetaTrader reads login, server and startup expert from this file at launch.
# One per account, so a single template serves every account without edits.
function Write-InstanceConfig {
    param([string] $Dir, [pscustomobject] $Account)

    $cfgDir = Join-Path $Dir 'config'
    New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
    $path = Join-Path $cfgDir 'propino.ini'

    $server = if ($Account.server) { $Account.server } else { 'MetaQuotes-Demo' }

    # No charts, no news, minimal history: this terminal exists to run one EA,
    # and every megabyte saved here is another account that fits in RAM.
    #
    # [StartUp] loads the EA on launch with its settings already filled in, so
    # no chart has to be opened and no profile saved by hand -- the step that
    # made this setup awkward to repeat across twenty terminals.
    $ini = @"
[Common]
Login=$($Account.accountNumber)
Password=$($Account.password)
Server=$server
AutoConfiguration=false
EnableNews=false
EnableDDE=false
KeepPrivate=true

[Experts]
AllowLiveTrading=true
AllowDllImport=false
Enabled=true
Account=false
Profile=false

[Charts]
MaxBars=5000
PrintColor=false
SaveDeleted=false

[StartUp]
Expert=PropinoBridge
ExpertParameters=propino-$($Account.accountNumber).set
Symbol=XAUUSD
Period=M1
"@
    Set-Content -LiteralPath $path -Value $ini -Encoding ASCII

    # One preset per account, carrying the login this terminal is supposed to
    # be on. A stale investor password makes the login fail quietly and the
    # broker's demo server issues a fresh account instead; without this the EA
    # would happily push that stranger's balance under the customer's name.
    $presetDir = Join-Path $Dir 'MQL5\Presets'
    New-Item -ItemType Directory -Force -Path $presetDir | Out-Null
    $secret = Get-BridgeSecret
    $preset = @"
SiteUrl=$($SiteUrl.TrimEnd('/'))
BridgeSecret=$secret
PushSeconds=5
VerboseLog=false
ExpectedLogin=$($Account.accountNumber)
"@
    Set-Content -LiteralPath (Join-Path $presetDir "propino-$($Account.accountNumber).set") `
                -Value $preset -Encoding ASCII

    return $path
}

function Start-Instance {
    param([pscustomobject] $Account)

    $acc = [string]$Account.accountNumber
    $dir = New-Instance -Account $acc
    $cfg = Write-InstanceConfig -Dir $dir -Account $Account
    $exe = Join-Path $dir 'terminal64.exe'

    if ($PSCmdlet.ShouldProcess("account $acc", 'start terminal')) {
        Start-Process -FilePath $exe `
                      -ArgumentList @('/portable', "/config:$cfg") `
                      -WorkingDirectory $dir | Out-Null
        Write-Host "  started #$acc" -ForegroundColor Green
    }
}

function Stop-Instance {
    param([int] $ProcessId, [string] $Account, [string] $Reason)

    if (-not $PSCmdlet.ShouldProcess("account $Account (pid $ProcessId)", "stop terminal -- $Reason")) {
        return
    }

    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue

    # Wait for the process to actually be gone. Stop-Process returns as soon as
    # the request is made, so without this the status printed straight after a
    # stop still lists the terminal as running, and anything that deletes the
    # instance folder fails on files the dying process still holds open.
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 300
    }

    if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
        Write-Host "  #$Account did not exit within 20s (pid $ProcessId)" -ForegroundColor Red
    } else {
        Write-Host "  stopped #$Account -- $Reason" -ForegroundColor Yellow
    }
}

function Show-Status {
    $running = @(Get-RunningInstances)
    $mem = Get-MemorySnapshot

    Write-Host ''
    Write-Host ('=' * 62)
    Write-Host " terminals running : $($running.Count)"
    if ($running.Count -gt 0) {
        $used = ($running | Measure-Object RamMb -Sum).Sum
        $avg  = [math]::Round($used / $running.Count, 0)
        Write-Host " RAM used by them  : $used MB   (avg $avg MB each)"
    }
    Write-Host " system RAM        : $($mem.FreeMb) MB free of $($mem.TotalMb) MB"
    Write-Host ('=' * 62)

    if ($running.Count -gt 0) {
        $running | Sort-Object Account | Format-Table -AutoSize
    }
}

function Show-Capacity {
    $running = @(Get-RunningInstances)
    $mem = Get-MemorySnapshot

    if ($running.Count -eq 0) {
        Write-Host 'No terminals running -- start at least one, then re-run -Measure.'
        return
    }

    $avg = ($running | Measure-Object RamMb -Average).Average
    $terminalMb = ($running | Measure-Object RamMb -Sum).Sum

    # What everything that is NOT a farm terminal is using right now: Windows,
    # the site, the database, the old agent, anything else on the box.
    #
    # Subtracting this is the whole point. Dividing total RAM by the size of a
    # terminal assumes the machine is otherwise empty, and reports a capacity
    # several times larger than what will actually start.
    $otherMb = $mem.TotalMb - $mem.FreeMb - $terminalMb
    if ($otherMb -lt 0) { $otherMb = 0 }

    $budget = $mem.TotalMb - $otherMb - $ReserveMb
    if ($budget -lt 0) { $budget = 0 }
    $capacity = [math]::Floor($budget / $avg)

    Write-Host ''
    Write-Host ('=' * 62)
    Write-Host ' MEASURED CAPACITY'
    Write-Host ('=' * 62)
    Write-Host (" measured RAM per terminal : {0} MB   (from {1} running)" -f [math]::Round($avg,0), $running.Count)
    Write-Host (" total system RAM          : {0} MB" -f $mem.TotalMb)
    Write-Host (" used by these terminals   : {0} MB" -f $terminalMb)
    Write-Host (" used by everything else   : {0} MB" -f $otherMb)
    Write-Host (" safety margin             : {0} MB" -f $ReserveMb)
    Write-Host (" left for terminals        : {0} MB" -f $budget)
    Write-Host ''
    Write-Host (" ==> this server fits about {0} accounts in total" -f $capacity) -ForegroundColor Cyan
    Write-Host ('     ({0} running now, room for about {1} more)' -f $running.Count, [math]::Max(0, $capacity - $running.Count))
    Write-Host ''
    if ($otherMb -gt 3000) {
        Write-Host ' NOTE: non-terminal usage is high. Every MB reclaimed there is' -ForegroundColor Yellow
        Write-Host ' another fraction of an account. Check what else is running:' -ForegroundColor Yellow
        Write-Host '   Get-Process | Sort-Object WS -Descending | Select-Object -First 12 Name, Id, @{n="MB";e={[math]::Round($_.WS/1MB)}}' -ForegroundColor Yellow
        Write-Host ''
    }
    Write-Host ('=' * 62)
}

function Invoke-Sync {
    # @() so a single account still reports a count. PowerShell unwraps a
    # one-element array on return, and a lone object has no .Count -- which is
    # why "1 account" printed as a blank.
    $roster = @(Get-Roster)
    $running = @(Get-RunningInstances)

    Write-Host ''
    Write-Host "roster: $($roster.Count) account(s) to watch"
    Write-Host "running: $($running.Count) terminal(s)"
    Write-Host ''

    $wanted = @{}
    foreach ($a in $roster) { $wanted[[string]$a.accountNumber] = $a }

    # Stop first, so memory is freed before anything new is started. On a tight
    # server the order is the difference between a clean swap and swapping.
    foreach ($r in $running) {
        if (-not $wanted.ContainsKey($r.Account)) {
            Stop-Instance -ProcessId $r.Pid -Account $r.Account -Reason 'no longer on the roster'
        }
    }

    $stillRunning = @{}
    foreach ($r in (Get-RunningInstances)) { $stillRunning[$r.Account] = $true }

    # Only start what fits. Launching past the RAM budget takes the whole box
    # down -- including the site -- and a partial farm is far better than that.
    $mem = Get-MemorySnapshot
    $avgMb = 300
    $current = @(Get-RunningInstances)
    if ($current.Count -gt 0) {
        $avgMb = [math]::Max(150, ($current | Measure-Object RamMb -Average).Average)
    }

    foreach ($acc in $wanted.Keys) {
        if ($stillRunning.ContainsKey($acc)) { continue }

        $free = (Get-MemorySnapshot).FreeMb
        if ($free - $avgMb -lt $ReserveMb) {
            Write-Host ''
            Write-Host "  STOPPED SHORT: only $free MB free, each terminal needs ~$([math]::Round($avgMb,0)) MB" -ForegroundColor Red
            Write-Host "  and $ReserveMb MB is held back as a safety margin." -ForegroundColor Red
            Write-Host "  Remaining accounts were not started. Add RAM or reduce the roster." -ForegroundColor Red
            break
        }

        Start-Instance -Account $wanted[$acc]
        # Terminals are heaviest while connecting; starting them in a burst
        # spikes memory well above where they settle.
        Start-Sleep -Seconds 8
    }

    Show-Status
}

function Invoke-StopAll {
    foreach ($r in (Get-RunningInstances)) {
        Stop-Instance -ProcessId $r.Pid -Account $r.Account -Reason 'stop-all requested'
    }

    # MetaEditor opens alongside the terminal and keeps metaeditor.log open.
    # Left running it holds the instance folder hostage.
    $editors = Get-CimInstance Win32_Process -Filter "Name = 'metaeditor64.exe'" -ErrorAction SilentlyContinue |
               Where-Object { $_.ExecutablePath -like "$InstanceRoot*" }
    foreach ($e in $editors) {
        Write-Host "  closing MetaEditor (pid $($e.ProcessId))" -ForegroundColor Yellow
        Stop-Process -Id $e.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if ($editors) { Start-Sleep -Seconds 2 }
}

# Stops everything and removes the cloned instances, so the next -Sync rebuilds
# them from a freshly prepared template. This is the step to run after changing
# anything in the template: the clones are copies, and they do not update
# themselves.
function Invoke-Reset {
    Invoke-StopAll

    if (-not (Test-Path $InstanceRoot)) {
        Write-Host 'Nothing to remove.'
        return
    }

    if (-not $PSCmdlet.ShouldProcess($InstanceRoot, 'delete all cloned instances')) { return }

    # Windows releases file handles a moment after a process exits, so a single
    # delete attempt races the shutdown it just requested.
    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            Remove-Item -LiteralPath $InstanceRoot -Recurse -Force -ErrorAction Stop
            Write-Host "removed $InstanceRoot" -ForegroundColor Green
            return
        } catch {
            if ($attempt -eq 5) {
                Write-Host "Could not remove $InstanceRoot after 5 attempts:" -ForegroundColor Red
                Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
                Write-Host '  Something still has a file open. Check with:' -ForegroundColor Red
                Write-Host '    Get-Process terminal64,metaeditor64 -ErrorAction SilentlyContinue | Select-Object Id,Path' -ForegroundColor Red
                return
            }
            Write-Host "  locked, retrying in 3s ($attempt/5)..."
            Start-Sleep -Seconds 3
        }
    }
}

if ($Reset)        { Invoke-Reset }
elseif ($StopAll)  { Invoke-StopAll; Show-Status }
elseif ($Sync)     { Invoke-Sync }
elseif ($Measure)  { Show-Capacity }
elseif ($Status)   { Show-Status }
else {
    Write-Host 'Pick one: -Status, -Sync, -Measure, -StopAll, -Reset'
    Write-Host '  -Reset  stops everything and deletes the clones, so the next'
    Write-Host '          -Sync rebuilds them from the template. Run it after'
    Write-Host '          changing anything in the template.'
    Write-Host 'Add -WhatIf to -Sync to see what it would do without doing it.'
}
