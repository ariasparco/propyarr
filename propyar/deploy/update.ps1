# Applies updated source files to the live site.
#
# Run this after copying changed files into C:\propino:
#   powershell -ExecutionPolicy Bypass -File deploy\update.ps1
#
# It reinstalls anything new, applies schema changes, rebuilds, and restarts.
# Your .env, database and uploaded files are never touched.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$AppDir  = 'C:\propino'
$LogFile = "$AppDir\update.log"
$q = [char]34

function Log {
    param([string]$Message, [string]$Colour = 'Gray')
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line -ForegroundColor $Colour
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

# Native stderr becomes a terminating error under ErrorActionPreference=Stop,
# so a harmless warning would abort the run. cmd.exe keeps it as plain text.
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

# A shell opened before Node was installed will not have it on PATH.
$nodeDir = 'C:\Program Files\nodejs'
if (Test-Path "$nodeDir\node.exe") {
    if ($env:Path -notlike "*$nodeDir*") { $env:Path = "$nodeDir;$env:Path" }
} elseif (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found. Run deploy\setup.ps1 first.'
}

Set-Location $AppDir

Log '-------------------------------------------' 'White'
Log 'Updating the site' 'White'
Log '-------------------------------------------' 'White'

# -- 1. Stop the site ------------------------------------------
# The running site holds files inside node_modules open - most notably the
# Prisma query engine. On Windows those locks make npm install and prisma
# generate fail outright, so the service has to come down first.
Log '== stopping the site' 'Cyan'
if (Get-Service propino -ErrorAction SilentlyContinue) {
    Stop-Service propino -Force -ErrorAction SilentlyContinue
    # Wait for the process to actually release its handles.
    foreach ($attempt in 1..15) {
        Start-Sleep -Seconds 1
        if ((Get-Service propino).Status -eq 'Stopped') { break }
    }
    Log ("OK  service {0}" -f (Get-Service propino).Status) 'Green'
} else {
    Log '--  no service registered yet' 'DarkGray'
}

# Any stray node process from a manual run would keep the same locks.
Get-Process node -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$AppDir*" } |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# -- 2. Dependencies -------------------------------------------
Log '== dependencies' 'Cyan'
$code = Invoke-Native 'npm install --no-audit --no-fund'
if ($code -ne 0) {
    Log 'npm install failed. The last lines of the log:' 'Red'
    Get-Content $LogFile -Tail 25 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    throw "npm install failed (exit $code)"
}
Log 'OK  dependencies up to date' 'Green'

# -- 3. Database schema ----------------------------------------
# Harmless when nothing changed; applies new columns when they have.
Log '== database schema' 'Cyan'
$code = Invoke-Native 'node scripts\sync-db-provider.mjs'
if ($code -ne 0) { throw "could not set the schema provider (exit $code)" }
$code = Invoke-Native 'npx prisma generate'
if ($code -ne 0) { throw "prisma generate failed (exit $code)" }
$code = Invoke-Native 'npx prisma db push --skip-generate'
if ($code -ne 0) { throw "prisma db push failed (exit $code) - see update.log" }
Log 'OK  schema current' 'Green'

# -- 4. Build --------------------------------------------------
Log '== building (a few minutes)' 'Cyan'
# Remove the previous build so nothing stale is served.
if (Test-Path "$AppDir\.next") { Remove-Item "$AppDir\.next" -Recurse -Force }
$code = Invoke-Native 'npm run build'
if ($code -ne 0 -or -not (Test-Path "$AppDir\.next")) {
    Log 'Build failed. The last lines of the log:' 'Red'
    Get-Content $LogFile -Tail 30 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    throw "Build failed (exit $code)"
}
Log 'OK  build complete' 'Green'

# -- 5. Start the site again -----------------------------------
Log '== starting the site' 'Cyan'
Start-Service propino
Start-Sleep -Seconds 10

$state = (Get-Service propino).Status
Log ("site service: {0}" -f $state) $(if ($state -eq 'Running') { 'Green' } else { 'Red' })

# -- 6. Prove it answers ---------------------------------------
$ok = $false
foreach ($attempt in 1..10) {
    try {
        $res = Invoke-WebRequest -Uri 'http://localhost:3000/fa' -UseBasicParsing -TimeoutSec 15
        if ($res.StatusCode -eq 200) { $ok = $true; break }
    } catch {
        Start-Sleep -Seconds 3
    }
}

Log '' 'White'
if ($ok) {
    Log 'The site is live and answering.' 'Green'
} else {
    Log 'The site is not answering yet. Check its log:' 'Red'
    Log '    Get-Content C:\propino\app.log -Tail 40' 'Yellow'
}
