# Repairs a half-created PostgreSQL install.
#
# initdb refuses to take over a data directory that already exists, because it
# cannot set the permissions it needs. The first setup run pre-created that
# directory, so the cluster was never built and the service has nothing to
# serve. This removes the leftovers and builds the cluster properly.
#
#   powershell -ExecutionPolicy Bypass -File deploy\fix-postgres.ps1
#
# Then run setup.ps1 again - it will carry on from where it stopped.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$AppDir  = 'C:\propino'
$PgRoot  = 'C:\pgsql'
$PgData  = 'C:\pgsql\data'
$PgBin   = "$PgRoot\bin"
$LogFile = "$AppDir\setup.log"

function Log {
    param([string]$Message, [string]$Colour = 'Gray')
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line -ForegroundColor $Colour
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function New-Secret {
    param([int]$Bytes = 24)
    $buffer = New-Object byte[] $Bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    # Base64 can contain characters that need quoting in a connection string;
    # strip them so the password is safe to drop into DATABASE_URL as-is.
    ([Convert]::ToBase64String($buffer) -replace '[^A-Za-z0-9]', '').Substring(0, 24)
}

Log '-------------------------------------------' 'White'
Log 'Repairing PostgreSQL' 'White'
Log '-------------------------------------------' 'White'

if (-not (Test-Path "$PgBin\initdb.exe")) {
    throw "PostgreSQL binaries are missing from $PgBin. Run setup.ps1 first."
}

# -- 1. Remove the broken service ------------------------------
Log '== removing the incomplete service' 'Cyan'
$svc = Get-Service postgresql -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -ne 'Stopped') {
        Stop-Service postgresql -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
    # sc.exe rather than pg_ctl unregister, which needs a valid cluster.
    & sc.exe delete postgresql | Out-Null
    Start-Sleep -Seconds 3
    Log 'OK  service removed' 'Green'
} else {
    Log '--  no service to remove' 'DarkGray'
}

# -- 2. Clear the empty data directory -------------------------
Log '== clearing the data directory' 'Cyan'
if (Test-Path "$PgData\PG_VERSION") {
    throw "There is a real database at $PgData. Stopping so nothing is destroyed. Contact support before continuing."
}
if (Test-Path $PgData) {
    Remove-Item $PgData -Recurse -Force
    Log 'OK  removed the empty directory' 'Green'
} else {
    Log '--  nothing there' 'DarkGray'
}

# -- 3. Build the cluster --------------------------------------
# initdb creates the directory itself; that is the whole point - it needs to own
# the permissions from the start.
Log '== building the database cluster' 'Cyan'
$pgSuper = New-Secret 24
$pwFile = "$env:TEMP\pgpw.txt"
Set-Content -Path $pwFile -Value $pgSuper -Encoding ascii -NoNewline

& "$PgBin\initdb.exe" -D $PgData -U postgres --pwfile=$pwFile -A scram-sha-256 -E UTF8
$initExit = $LASTEXITCODE
Remove-Item $pwFile -Force -ErrorAction SilentlyContinue

if ($initExit -ne 0 -or -not (Test-Path "$PgData\PG_VERSION")) {
    throw "initdb failed (exit $initExit). The cluster was not created."
}
Set-Content -Path "$PgRoot\superuser.txt" -Value $pgSuper -Encoding ascii
Log 'OK  cluster built' 'Green'

# -- 4. Register and start -------------------------------------
Log '== registering the service' 'Cyan'
& "$PgBin\pg_ctl.exe" register -N postgresql -D $PgData -S auto
if ($LASTEXITCODE -ne 0) { throw "pg_ctl register failed (exit $LASTEXITCODE)" }

Start-Service postgresql
Log 'waiting for PostgreSQL to accept connections' 'Gray'

$ready = $false
foreach ($attempt in 1..20) {
    Start-Sleep -Seconds 2
    & "$PgBin\pg_isready.exe" -h 127.0.0.1 -p 5432 | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
}
if (-not $ready) {
    Log 'PostgreSQL did not come up. Its own log follows:' 'Red'
    Get-ChildItem "$PgData\log" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 |
        ForEach-Object { Get-Content $_.FullName -Tail 30 }
    throw 'PostgreSQL is not accepting connections.'
}
Log 'OK  PostgreSQL is running and accepting connections' 'Green'

# -- 5. Application database -----------------------------------
Log '== creating the application database' 'Cyan'
$env:PGPASSWORD = $pgSuper
$dbPass = New-Secret 24

& "$PgBin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE USER propino WITH PASSWORD '$dbPass'"
if ($LASTEXITCODE -ne 0) { throw 'Could not create the database user.' }

& "$PgBin\psql.exe" -U postgres -h 127.0.0.1 -c 'CREATE DATABASE propino OWNER propino'
if ($LASTEXITCODE -ne 0) { throw 'Could not create the database.' }

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Set-Content -Path "$AppDir\dbpass.txt" -Value $dbPass -Encoding ascii
Log 'OK  database propino created' 'Green'

Log '' 'White'
Log 'PostgreSQL is fixed. Now run:' 'Yellow'
Log '    powershell -ExecutionPolicy Bypass -File deploy\setup.ps1' 'Yellow'
