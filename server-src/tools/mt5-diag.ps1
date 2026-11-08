# mt5-diag.ps1 -- finds where MetaTrader actually stored the WebRequest setting,
# and copies it where the cloned terminals will read it.
#
#   .\tools\mt5-diag.ps1              # look only, change nothing
#   .\tools\mt5-diag.ps1 -Fix         # copy the config into the template
#
# Why this is needed
# ------------------
# MetaTrader keeps its settings in one of two places depending on how it was
# started:
#
#   double-clicked  ->  C:\Users\<you>\AppData\Roaming\MetaQuotes\Terminal\<id>\
#   /portable       ->  inside the installation folder itself
#
# The farm launches every clone with /portable, so a WebRequest permission that
# was granted in a normally-started terminal lives in AppData and is invisible
# to them. The EA then silently fails to reach the site on every clone, while
# working perfectly in the window where it was set up.

[CmdletBinding()]
param(
    [string] $TemplateDir = 'C:\MetaTrader 5',
    [string] $SiteUrl     = 'https://propino.top',
    [switch] $Fix
)

$ErrorActionPreference = 'Stop'
$host_ = ([uri]$SiteUrl).Host

Write-Host ''
Write-Host ('=' * 66)
Write-Host " Looking for the WebRequest permission for: $host_"
Write-Host ('=' * 66)

# Every place MetaTrader might be keeping settings for this installation.
$candidates = @()
$candidates += [pscustomobject]@{ Kind = 'portable'; Dir = (Join-Path $TemplateDir 'config') }

$roaming = Join-Path $env:APPDATA 'MetaQuotes\Terminal'
if (Test-Path $roaming) {
    Get-ChildItem -Path $roaming -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^[0-9A-F]{32}$' } |
        ForEach-Object {
            $candidates += [pscustomobject]@{ Kind = 'appdata'; Dir = (Join-Path $_.FullName 'config') }
        }
}

$found = @()

foreach ($c in $candidates) {
    if (-not (Test-Path $c.Dir)) {
        Write-Host ("  [{0,-8}] {1}  -- not present" -f $c.Kind, $c.Dir) -ForegroundColor DarkGray
        continue
    }

    $files = Get-ChildItem -Path $c.Dir -Filter '*.ini' -File -ErrorAction SilentlyContinue
    $hit = $null
    foreach ($f in $files) {
        $text = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $text) { continue }

        # MetaTrader does not store the allowed URL as readable text -- it
        # writes an obfuscated blob:
        #
        #   WebRequest=1
        #   WebRequestUrl=451BF584A58E40E1F6FA816078B3DE94...
        #
        # Searching for the hostname therefore never matches, however correctly
        # the permission was granted. What can be checked is that the feature is
        # switched on and that a URL was actually committed to the list.
        $on  = $text -match '(?m)^\s*WebRequest\s*=\s*1\s*$'
        $url = $text -match '(?m)^\s*WebRequestUrl\s*=\s*(\S+)\s*$'
        if ($on -and $url) { $hit = $f; break }
    }

    if ($hit) {
        Write-Host ("  [{0,-8}] {1}" -f $c.Kind, $c.Dir) -ForegroundColor Green
        Write-Host ("             FOUND in {0}" -f $hit.Name) -ForegroundColor Green
        $found += [pscustomobject]@{ Kind = $c.Kind; Dir = $c.Dir; File = $hit }

        $lines = Get-Content -LiteralPath $hit.FullName -ErrorAction SilentlyContinue
        foreach ($l in $lines) {
            if ($l -match '(?i)^\s*(WebRequest|WebRequestUrl|Enabled|AllowLiveTrading)\s*=') {
                $shown = if ($l.Length -gt 60) { $l.Substring(0, 57) + '...' } else { $l }
                Write-Host ("             $shown") -ForegroundColor DarkGray
            }
        }

        # Algorithmic trading being off stops the EA from running at all, no
        # matter what the WebRequest list says.
        $expertsOff = ($lines -join "`n") -match '(?ms)^\[Experts\].*?^\s*Enabled\s*=\s*0\s*$'
        if ($expertsOff) {
            Write-Host '             WARNING: [Experts] Enabled=0 -- algo trading is off' -ForegroundColor Yellow
        }
    } else {
        $n = if ($files) { $files.Count } else { 0 }
        Write-Host ("  [{0,-8}] {1}  -- {2} ini file(s), no match" -f $c.Kind, $c.Dir, $n) -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host ('=' * 66)

$portable = $found | Where-Object { $_.Kind -eq 'portable' } | Select-Object -First 1
$appdata  = $found | Where-Object { $_.Kind -eq 'appdata'  } | Select-Object -First 1

if ($portable) {
    Write-Host ' The permission is already where the clones will read it.' -ForegroundColor Green
    Write-Host ''
    Write-Host ' Next:'
    Write-Host '   .\tools\mt5-farm.ps1 -Reset'
    Write-Host "   .\tools\mt5-farm.ps1 -Sync -TemplateDir '$TemplateDir'"
    Write-Host '   npm run feed:status'
}
elseif ($appdata) {
    Write-Host ' The permission was granted, but it is stored in AppData.' -ForegroundColor Yellow
    Write-Host ''
    Write-Host ' The cloned terminals run /portable and read their settings from'
    Write-Host ' inside their own folder, so they cannot see it there. The config'
    Write-Host ' has to be copied into the template first.'
    Write-Host ''

    if ($Fix) {
        $dest = Join-Path $TemplateDir 'config'
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        Copy-Item -Path (Join-Path $appdata.Dir '*.ini') -Destination $dest -Force
        Write-Host " copied $($appdata.Dir)\*.ini" -ForegroundColor Green
        Write-Host "     -> $dest" -ForegroundColor Green

        # Turn algorithmic trading on in the copy. Without it the EA is loaded
        # and then never allowed to run, which looks exactly like a broken EA.
        $common = Join-Path $dest 'common.ini'
        if (Test-Path $common) {
            $txt = Get-Content -LiteralPath $common -Raw
            $patched = [regex]::Replace(
                $txt,
                '(?ms)(^\[Experts\].*?^\s*Enabled\s*=\s*)0(\s*$)',
                '${1}1${2}')
            if ($patched -ne $txt) {
                Set-Content -LiteralPath $common -Value $patched -Encoding ASCII
                Write-Host ' enabled algorithmic trading in the copied config' -ForegroundColor Green
            }
        }
        Write-Host ''
        Write-Host ' Now rebuild the clones so they pick it up:'
        Write-Host '   .\tools\mt5-farm.ps1 -Reset'
        Write-Host "   .\tools\mt5-farm.ps1 -Sync -TemplateDir '$TemplateDir'"
        Write-Host '   npm run feed:status'
    } else {
        Write-Host ' Run again with -Fix to copy it across:' -ForegroundColor Cyan
        Write-Host '   .\tools\mt5-diag.ps1 -Fix' -ForegroundColor Cyan
    }
}
else {
    Write-Host ' The permission is not stored anywhere yet.' -ForegroundColor Red
    Write-Host ''
    Write-Host ' MetaTrader only writes its settings to disk when it closes'
    Write-Host ' cleanly. If the terminal is still open, the tick is only in'
    Write-Host ' memory and nothing on disk has changed yet.'
    Write-Host ''
    Write-Host '   1. Is MetaTrader still open? Close it completely.'
    Write-Host '   2. Re-run this script.'
    Write-Host ''
    Write-Host ' If it still finds nothing, the URL may have been typed but not'
    Write-Host ' committed: in the Options box it has to be entered as a list'
    Write-Host ' row, not left as loose text in the field. Re-open Options,'
    Write-Host ' check the row is really listed, click OK, and close the'
    Write-Host ' terminal.'
    Write-Host ''
    Write-Host ' Terminals currently running:'
    $running = Get-Process terminal64 -ErrorAction SilentlyContinue
    if ($running) {
        $running | ForEach-Object { Write-Host ("   pid {0}  {1}" -f $_.Id, $_.Path) }
    } else {
        Write-Host '   (none)'
    }
}

Write-Host ('=' * 66)
Write-Host ''
