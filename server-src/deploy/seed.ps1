# Prepares the database for real use: challenge plans, rule settings, and the
# first administrator account.
#
#   powershell -ExecutionPolicy Bypass -File deploy\seed.ps1
#
# Safe to run again later - it only adds and updates, never deletes traders,
# orders or trading accounts.

$ErrorActionPreference = 'Stop'

$AppDir = 'C:\propino'
$q = [char]34

Set-Location $AppDir

# A PowerShell window opened before Node was installed will not have it on PATH.
# Find it rather than making the operator restart their shell.
$nodeDir = 'C:\Program Files\nodejs'
if (-not (Test-Path "$nodeDir\node.exe")) {
    $found = Get-Command node -ErrorAction SilentlyContinue
    if ($found) {
        $nodeDir = Split-Path $found.Source -Parent
    } else {
        throw 'Node.js was not found. Run deploy\setup.ps1 first.'
    }
}
if ($env:Path -notlike "*$nodeDir*") { $env:Path = "$nodeDir;$env:Path" }
$node = "$nodeDir\node.exe"

Write-Host ''
Write-Host ('Node: ' + (& $node -v)) -ForegroundColor DarkGray

# -- Administrator details -------------------------------------
Write-Host ''
Write-Host 'Set up the administrator account.' -ForegroundColor Cyan
Write-Host 'This is the account you will sign in to the admin panel with.' -ForegroundColor DarkGray
Write-Host ''

$adminEmail = (Read-Host 'Admin email').Trim()
if ($adminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
    Write-Host 'That does not look like an email address. Run the script again.' -ForegroundColor Red
    exit 1
}

$secure = Read-Host 'Admin password (at least 8 characters)' -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

if ($plain.Length -lt 8) {
    Write-Host 'That password is too short. Run the script again.' -ForegroundColor Red
    exit 1
}

$confirm = Read-Host 'Type it once more' -AsSecureString
$plainConfirm = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm))

if ($plain -ne $plainConfirm) {
    Write-Host 'The two passwords do not match. Run the script again.' -ForegroundColor Red
    exit 1
}

# -- Run the initialiser ---------------------------------------
Write-Host ''
Write-Host 'Preparing the database...' -ForegroundColor Cyan

# Passed through the environment, so the password never appears in a command
# line where other processes could read it.
$env:SEED_EMAIL = $adminEmail
$env:SEED_PASSWORD = $plain

# Native stderr becomes a terminating error under ErrorActionPreference=Stop, so
# a harmless warning would abort the run. cmd.exe keeps it as plain text and
# only the exit code decides success.
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& cmd.exe /c ($q + $node + $q + ' deploy\init.js')
$code = $LASTEXITCODE
$ErrorActionPreference = $previous

Remove-Item Env:SEED_EMAIL, Env:SEED_PASSWORD -ErrorAction SilentlyContinue

if ($code -ne 0) {
    Write-Host ''
    Write-Host "Database preparation failed (exit $code)." -ForegroundColor Red
    exit 1
}

# -- Restart so the site picks everything up -------------------
Write-Host ''
Write-Host 'Restarting the site...' -ForegroundColor Cyan
Restart-Service propino -ErrorAction SilentlyContinue
Start-Sleep -Seconds 8

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host ''
Write-Host '  Admin panel : https://propino.top/fa/admin-login' -ForegroundColor Green
Write-Host ("  Email       : {0}" -f $adminEmail) -ForegroundColor Green
Write-Host ''
Write-Host 'To add more administrators later: have them register on the site,' -ForegroundColor DarkGray
Write-Host 'then use the "Make admin" button on the Users page.' -ForegroundColor DarkGray
Write-Host ''
