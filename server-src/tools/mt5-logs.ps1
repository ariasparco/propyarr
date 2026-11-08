# mt5-logs.ps1 -- reads what the EA itself reported inside each cloned terminal.
#
#   .\tools\mt5-logs.ps1            # last lines from every instance
#   .\tools\mt5-logs.ps1 -Lines 40
#   .\tools\mt5-logs.ps1 -Account 5055004470
#
# When no data reaches the platform, this is the file that says why. MetaTrader
# writes everything an EA prints to MQL5\Logs\<date>.log inside the terminal's
# own folder, and the message there distinguishes the three failures that look
# identical from outside:
#
#   "PropinoBridge started"        -> the EA is running
#   "WebRequest is not allowed"    -> the permission did not carry to the clone
#   "rejected (403)"               -> BridgeSecret does not match the server
#   nothing at all                 -> the EA never loaded

[CmdletBinding()]
param(
    [string] $InstanceRoot = 'C:\mt5-farm',
    [string] $Account = '',
    [int]    $Lines = 15
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $InstanceRoot)) {
    Write-Host "No instances at $InstanceRoot -- run mt5-farm.ps1 -Sync first." -ForegroundColor Yellow
    exit 0
}

$dirs = Get-ChildItem -Path $InstanceRoot -Directory -ErrorAction SilentlyContinue
if ($Account) { $dirs = $dirs | Where-Object { $_.Name -eq $Account } }
if (-not $dirs) {
    Write-Host "No instance folders found." -ForegroundColor Yellow
    exit 0
}

$verdicts = @()

foreach ($d in $dirs) {
    Write-Host ''
    Write-Host ('=' * 70)
    Write-Host " account #$($d.Name)"
    Write-Host ('=' * 70)

    # Two logs matter: MQL5\Logs holds what the EA printed, Logs holds what the
    # terminal itself did (including whether it managed to log in at all).
    $expertLog = $null
    $mqlLogs = Join-Path $d.FullName 'MQL5\Logs'
    if (Test-Path $mqlLogs) {
        $expertLog = Get-ChildItem -Path $mqlLogs -Filter '*.log' -File -ErrorAction SilentlyContinue |
                     Sort-Object LastWriteTime -Descending | Select-Object -First 1
    }

    if (-not $expertLog) {
        Write-Host '  no EA log at all -- the Expert Advisor never loaded' -ForegroundColor Red
        $verdicts += [pscustomobject]@{ Account = $d.Name; Verdict = 'EA never loaded' }

        $termLogs = Join-Path $d.FullName 'Logs'
        if (Test-Path $termLogs) {
            $tl = Get-ChildItem -Path $termLogs -Filter '*.log' -File -ErrorAction SilentlyContinue |
                  Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($tl) {
                Write-Host '  terminal log (last lines):' -ForegroundColor DarkGray
                # MetaTrader writes these as UTF-16.
                $txt = Get-Content -LiteralPath $tl.FullName -Tail $Lines -Encoding Unicode -ErrorAction SilentlyContinue
                if (-not $txt) { $txt = Get-Content -LiteralPath $tl.FullName -Tail $Lines -ErrorAction SilentlyContinue }
                $txt | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
            }
        }
        continue
    }

    $text = Get-Content -LiteralPath $expertLog.FullName -Tail $Lines -Encoding Unicode -ErrorAction SilentlyContinue
    if (-not $text) { $text = Get-Content -LiteralPath $expertLog.FullName -Tail $Lines -ErrorAction SilentlyContinue }

    foreach ($l in $text) {
        $colour = 'Gray'
        if ($l -match 'WebRequest is not allowed|rejected \(403\)|push failed|error') { $colour = 'Red' }
        elseif ($l -match 'PropinoBridge started|balance') { $colour = 'Green' }
        Write-Host "    $l" -ForegroundColor $colour
    }

    $all = $text -join "`n"

    # Which account the terminal is REALLY signed into.
    #
    # This is the failure that hides best. A stored password that no longer
    # works does not raise an error: the login fails silently and the broker's
    # demo server issues a brand new account, so the terminal runs perfectly
    # while watching an account nobody asked about. The folder is named after
    # the account it was meant to be on, so the two can simply be compared --
    # no cooperation from MetaTrader required.
    $actual = $null
    foreach ($m in [regex]::Matches($all, 'account #(\d+)')) {
        $actual = $m.Groups[1].Value
    }

    $verdict =
        if ($actual -and $actual -ne $d.Name) {
            "WRONG ACCOUNT -- signed in as #$actual, not #$($d.Name). The stored password is wrong."
        }
        elseif ($all -match 'WebRequest is not allowed') { 'WebRequest blocked -- permission did not carry into the clone' }
        elseif ($all -match 'rejected \(403\)')      { 'BridgeSecret does not match the server' }
        elseif ($all -match 'server answered')       { 'reached the site but it answered with an error' }
        elseif ($all -match 'connected --')          { 'EA running' }
        elseif ($all -match 'PropinoBridge started') { 'EA running' }
        else                                          { 'EA log exists but PropinoBridge never announced itself' }

    $verdicts += [pscustomobject]@{ Account = $d.Name; Verdict = $verdict }
}

Write-Host ''
Write-Host ('=' * 70)
Write-Host ' VERDICT'
Write-Host ('=' * 70)
$verdicts | Format-Table -AutoSize

$wrong = $verdicts | Where-Object { $_.Verdict -like 'WRONG ACCOUNT*' }
if ($wrong) {
    Write-Host ''
    Write-Host (' ' + ('!' * 62)) -ForegroundColor Red
    Write-Host " $($wrong.Count) terminal(s) are signed into the wrong account." -ForegroundColor Red
    Write-Host ' The stored investor password no longer works, so MetaTrader opened' -ForegroundColor Red
    Write-Host ' a fresh demo account instead. Nothing from these reaches the site.' -ForegroundColor Red
    Write-Host '' -ForegroundColor Red
    Write-Host ' Fix: admin panel -> Trading accounts -> Edit login details' -ForegroundColor Red
    Write-Host ' Then: .\tools\mt5-farm.ps1 -Reset ; .\tools\mt5-farm.ps1 -Sync' -ForegroundColor Red
    Write-Host (' ' + ('!' * 62)) -ForegroundColor Red
    Write-Host ''
}

$blocked = $verdicts | Where-Object { $_.Verdict -like 'WebRequest blocked*' }
if ($blocked) {
    Write-Host ' The WebRequest permission does not survive being cloned.' -ForegroundColor Yellow
    Write-Host ' MetaTrader ties that encoded URL to the installation it was set' -ForegroundColor Yellow
    Write-Host ' in, so copying the config file is not enough.' -ForegroundColor Yellow
    Write-Host ''
    Write-Host ' Two ways forward:' -ForegroundColor Yellow
    Write-Host '   a) grant it once per terminal by hand (fine for a few accounts,' -ForegroundColor Yellow
    Write-Host '      impractical past a handful)' -ForegroundColor Yellow
    Write-Host '   b) switch the EA to writing a file the server reads instead of' -ForegroundColor Yellow
    Write-Host '      calling the site directly -- no permission needed at all' -ForegroundColor Yellow
    Write-Host ''
}
