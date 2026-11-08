# Puts the database password back in sync.
#
#   powershell -ExecutionPolicy Bypass -File deploy\fix-dbpass.ps1
#
# The password lives in two places - inside PostgreSQL, and inside DATABASE_URL
# in .env. If they drift apart the site cannot reach its own database. Rather
# than guess which side is right, this sets a brand new password on both at once
# and then proves the app can actually connect.

$ErrorActionPreference = 'Stop'

$AppDir = 'C:\propino'
$PgRoot = 'C:\pgsql'
$PgBin  = "$PgRoot\bin"
$EnvFile = "$AppDir\.env"
$q = [char]34

function Log {
    param([string]$Message, [string]$Colour = 'Gray')
    Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message) -ForegroundColor $Colour
}

function New-DbPassword {
    # Letters and digits only, so it never needs escaping inside a URL.
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, 24)
}

Log '-------------------------------------------' 'White'
Log 'Re-syncing the database password' 'White'
Log '-------------------------------------------' 'White'

if (-not (Test-Path $EnvFile)) { throw "No .env found at $EnvFile" }
if (-not (Test-Path "$PgRoot\superuser.txt")) {
    throw "The PostgreSQL superuser password is missing ($PgRoot\superuser.txt)."
}

# -- 1. Set the new password inside PostgreSQL -----------------
Log '== setting a new password on the database user' 'Cyan'
$newPass = New-DbPassword
$env:PGPASSWORD = (Get-Content "$PgRoot\superuser.txt" -Raw).Trim()

# ALTER rather than CREATE - the user already exists.
& "$PgBin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER USER propino WITH PASSWORD '$newPass'" | Out-Null
$alterCode = $LASTEXITCODE
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

if ($alterCode -ne 0) { throw "Could not change the password (psql exit $alterCode)." }
Log 'OK  password changed in PostgreSQL' 'Green'

# -- 2. Prove the new password works ---------------------------
Log '== checking it directly' 'Cyan'
$env:PGPASSWORD = $newPass
$answer = & "$PgBin\psql.exe" -U propino -h 127.0.0.1 -d propino -tAc 'SELECT 1' 2>&1
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

if ("$answer".Trim() -ne '1') { throw "The new password does not work: $answer" }
Log 'OK  psql connects with the new password' 'Green'

Set-Content -Path "$AppDir\dbpass.txt" -Value $newPass -Encoding ascii

# -- 3. Write the same password into .env ----------------------
Log '== updating DATABASE_URL in .env' 'Cyan'
$connection = "postgresql://propino:$newPass@127.0.0.1:5432/propino?schema=public"

# Rebuilt line by line rather than with a regex replace, because in a
# replacement string PowerShell treats $ as a capture-group reference - which is
# exactly the kind of silent corruption that caused this mismatch.
$lines = Get-Content $EnvFile
$updated = $false
$out = foreach ($line in $lines) {
    if ($line -match '^\s*DATABASE_URL\s*=') {
        $updated = $true
        'DATABASE_URL="' + $connection + '"'
    } else {
        $line
    }
}
if (-not $updated) { $out += 'DATABASE_URL="' + $connection + '"' }
Set-Content -Path $EnvFile -Value $out -Encoding utf8

# Read it back and confirm the file really holds the right value.
$check = (Get-Content $EnvFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' }) -join ''
if ($check -notlike "*$newPass*") {
    throw 'The password did not survive being written to .env.'
}
Log 'OK  .env now holds the same password' 'Green'

# -- 4. Prove the app itself can connect -----------------------
Log '== checking that the application can connect' 'Cyan'
$nodeDir = 'C:\Program Files\nodejs'
if ($env:Path -notlike "*$nodeDir*") { $env:Path = "$nodeDir;$env:Path" }

$probe = @'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const users = await prisma.user.count();
  const plans = await prisma.challenge.count();
  console.log(`CONNECTED users=${users} plans=${plans}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error('CONNECT FAILED:', e.message.split('\n')[0]);
  process.exit(1);
});
'@
# The probe has to live inside the app folder: Node resolves node_modules
# relative to the script's own location, not the working directory, so a file
# in TEMP could never find @prisma/client.
$probePath = "$AppDir\db-probe.js"
Set-Content -Path $probePath -Value $probe -Encoding utf8

Set-Location $AppDir
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& cmd.exe /c ($q + $nodeDir + '\node.exe' + $q + ' ' + $q + $probePath + $q)
$probeCode = $LASTEXITCODE
$ErrorActionPreference = $previous
Remove-Item $probePath -Force -ErrorAction SilentlyContinue

if ($probeCode -ne 0) {
    throw 'The application still cannot connect. Send this output for help.'
}
Log 'OK  the application connects' 'Green'

# -- 5. Restart ------------------------------------------------
Log '== restarting the site' 'Cyan'
Restart-Service propino
Start-Sleep -Seconds 10

# A wrong password makes login return 500; a right one makes it return 401.
$healthy = $false
foreach ($attempt in 1..10) {
    try {
        Invoke-WebRequest -Uri 'http://localhost:3000/api/auth/login' -Method POST `
            -ContentType 'application/json' `
            -Body '{"email":"probe@example.invalid","password":"wrong-on-purpose"}' `
            -UseBasicParsing -TimeoutSec 15 | Out-Null
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 401) { $healthy = $true; break }
        if ($status -eq 500) { Start-Sleep -Seconds 3; continue }
    }
    Start-Sleep -Seconds 3
}

Log '' 'White'
if ($healthy) {
    Log 'Sign-in is working again.' 'Green'
    Log '' 'White'
    Log 'Next: create your administrator account with' 'Yellow'
    Log '    powershell -ExecutionPolicy Bypass -File deploy\seed.ps1' 'Cyan'
} else {
    Log 'The login endpoint is still unhappy. Check the log:' 'Red'
    Log '    Get-Content C:\propino\app.log -Tail 40' 'Yellow'
}
