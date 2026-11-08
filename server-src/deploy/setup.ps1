# PROPINO - server setup.
#
# Run once on a fresh Windows Server. Installs Node.js, PostgreSQL, Caddy and
# the app itself, then registers everything to start automatically on boot.
#
# Safe to re-run: each step checks whether it is already done and skips it.
#
#   powershell -ExecutionPolicy Bypass -File setup.ps1
#
# Everything it does is written to C:\propino\setup.log - send that file if a
# step fails.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # progress bars make downloads crawl

$AppDir  = 'C:\propino'
$LogFile = "$AppDir\setup.log"
$Domain  = 'propino.top'
$q = [char]34

New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

function Log {
    param([string]$Message, [string]$Colour = 'Gray')
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line -ForegroundColor $Colour
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Step { param([string]$Message) Log "== $Message" 'Cyan' }
function Done { param([string]$Message) Log "OK  $Message" 'Green' }
function Skip { param([string]$Message) Log "--  $Message (already done)" 'DarkGray' }

function Get-File {
    param([string]$Url, [string]$OutFile)
    Log "downloading $Url"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing -TimeoutSec 600
}

function Add-ToPath {
    param([string]$Dir)
    $current = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    if ($current -notlike "*$Dir*") {
        [Environment]::SetEnvironmentVariable('Path', "$current;$Dir", 'Machine')
    }
    if ($env:Path -notlike "*$Dir*") { $env:Path = "$env:Path;$Dir" }
}

# Runs a command-line tool and returns its exit code.
#
# PowerShell turns anything a native program writes to stderr into an error
# record, and with ErrorActionPreference set to Stop a mere warning would kill
# the script. Going through cmd.exe keeps stderr as plain text, so only a real
# non-zero exit code counts as failure.
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

function New-Secret {
    param([int]$Bytes = 48)
    $buffer = New-Object byte[] $Bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    [Convert]::ToBase64String($buffer)
}

Log "-------------------------------------------" 'White'
Log "PROPINO setup starting" 'White'
Log "-------------------------------------------" 'White'

# -- 1. Node.js ------------------------------------------------
Step 'Node.js'
if (Get-Command node -ErrorAction SilentlyContinue) {
    Skip "Node.js $(node -v)"
} else {
    # Ask nodejs.org which release is current LTS rather than pinning a version
    # that will age out.
    $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json' -TimeoutSec 120
    $lts = $index | Where-Object { $_.lts -ne $false } | Select-Object -First 1
    $version = $lts.version
    Log "latest LTS is $version"

    $msi = "$env:TEMP\node-$version.msi"
    Get-File "https://nodejs.org/dist/$version/node-$version-x64.msi" $msi
    Log 'installing (this takes a minute)'
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$msi`" /quiet /norestart"
    Add-ToPath 'C:\Program Files\nodejs'
    Remove-Item $msi -Force -ErrorAction SilentlyContinue
    Done "Node.js $(node -v)"
}

# -- 2. PostgreSQL ---------------------------------------------
Step 'PostgreSQL'
$PgRoot = 'C:\pgsql'
$PgData = 'C:\pgsql\data'
$PgBin  = "$PgRoot\bin"

if (Test-Path "$PgBin\postgres.exe") {
    Skip 'PostgreSQL binaries'
} else {
    # The binaries zip needs no installer UI, which makes it scriptable. Try a
    # few published builds in case one has been withdrawn.
    $candidates = @(
        'https://get.enterprisedb.com/postgresql/postgresql-16.8-1-windows-x64-binaries.zip',
        'https://get.enterprisedb.com/postgresql/postgresql-16.6-1-windows-x64-binaries.zip',
        'https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip',
        'https://get.enterprisedb.com/postgresql/postgresql-17.4-1-windows-x64-binaries.zip'
    )
    $zip = "$env:TEMP\pgsql.zip"
    $ok = $false
    foreach ($url in $candidates) {
        try { Get-File $url $zip; $ok = $true; break }
        catch { Log "  not available, trying next" 'Yellow' }
    }
    if (-not $ok) { throw 'Could not download PostgreSQL. Check the server''s internet access.' }

    Log 'extracting'
    Expand-Archive -Path $zip -DestinationPath 'C:\' -Force   # unpacks to C:\pgsql
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Done 'PostgreSQL binaries'
}
Add-ToPath $PgBin

if (Test-Path "$PgData\PG_VERSION") {
    Skip 'database cluster'
} else {
    Step 'creating the database cluster'
    # initdb must create this directory itself. If it already exists, initdb
    # cannot set the permissions it needs and fails with "Permission denied".
    if (Test-Path $PgData) { Remove-Item $PgData -Recurse -Force }

    $pgSuper = New-Secret 24
    $pwFile = "$env:TEMP\pgpw.txt"
    Set-Content -Path $pwFile -Value $pgSuper -Encoding ascii -NoNewline
    & "$PgBin\initdb.exe" -D $PgData -U postgres --pwfile=$pwFile -A scram-sha-256 -E UTF8
    $initExit = $LASTEXITCODE
    Remove-Item $pwFile -Force -ErrorAction SilentlyContinue

    if ($initExit -ne 0 -or -not (Test-Path "$PgData\PG_VERSION")) {
        throw "initdb failed (exit $initExit) - the cluster was not created."
    }
    Set-Content -Path "$PgRoot\superuser.txt" -Value $pgSuper -Encoding ascii
    Done 'cluster created'
}

if (Get-Service postgresql -ErrorAction SilentlyContinue) {
    Skip 'PostgreSQL service'
} else {
    Step 'registering PostgreSQL as a service'
    & "$PgBin\pg_ctl.exe" register -N postgresql -D $PgData -S auto
    if ($LASTEXITCODE -ne 0) { throw "pg_ctl register failed (exit $LASTEXITCODE)" }
    Done 'service registered'
}

Start-Service postgresql -ErrorAction SilentlyContinue
Step 'waiting for PostgreSQL'
$pgReady = $false
foreach ($attempt in 1..20) {
    Start-Sleep -Seconds 2
    & "$PgBin\pg_isready.exe" -h 127.0.0.1 -p 5432 | Out-Null
    if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
}
if (-not $pgReady) {
    Log 'PostgreSQL did not start. Its own log follows:' 'Red'
    Get-ChildItem "$PgData\log" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 |
        ForEach-Object { Get-Content $_.FullName -Tail 30 | ForEach-Object { Log $_ 'Red' } }
    throw 'PostgreSQL is not accepting connections. Run deploy\fix-postgres.ps1'
}
Done 'PostgreSQL running'

# -- 3. Application database -----------------------------------
Step 'application database'
$env:PGPASSWORD = (Get-Content "$PgRoot\superuser.txt" -Raw).Trim()
$exists = & "$PgBin\psql.exe" -U postgres -h 127.0.0.1 -tAc "SELECT 1 FROM pg_database WHERE datname='propino'" 2>$null

if ($exists -eq '1') {
    Skip 'database propino'
    $dbPass = (Get-Content "$AppDir\dbpass.txt" -Raw).Trim()
} else {
    # Alphanumeric only, so it can go straight into a connection string without
    # needing to be URL-encoded.
    $dbPass = ((New-Secret 32) -replace '[^A-Za-z0-9]', '').Substring(0, 24)
    & "$PgBin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE USER propino WITH PASSWORD '$dbPass'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the database user.' }
    & "$PgBin\psql.exe" -U postgres -h 127.0.0.1 -c 'CREATE DATABASE propino OWNER propino'
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the database.' }
    Set-Content -Path "$AppDir\dbpass.txt" -Value $dbPass -Encoding ascii
    Done 'database propino created'
}
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

# -- 4. Application files --------------------------------------
Step 'application files'
if (-not (Test-Path "$AppDir\package.json")) {
    throw "No app found in $AppDir. Copy the propino folder contents there first, then re-run."
}
Done 'source present'

# -- 5. Environment --------------------------------------------
Step 'environment'
$EnvFile = "$AppDir\.env"
if (-not (Test-Path $EnvFile)) {
    throw "No .env in $AppDir. Rename env-template.txt to .env and re-run."
}

# Point the app at the local database and replace any secret still left at its
# development placeholder.
#
# Done line by line on purpose. PowerShell's -replace treats $ in the
# REPLACEMENT text as a capture-group reference, so a generated secret or
# password containing one would be silently mangled - producing an .env that
# looks fine but no longer matches the database.
$q = [char]34
$lines = Get-Content $EnvFile

function Set-EnvValue {
    param([string[]]$Lines, [string]$Key, [string]$Value)
    $written = $false
    $result = foreach ($line in $Lines) {
        if ($line -match ('^\s*' + [regex]::Escape($Key) + '\s*=')) {
            $written = $true
            $Key + '=' + $q + $Value + $q
        } else {
            $line
        }
    }
    if (-not $written) { $result += ($Key + '=' + $q + $Value + $q) }
    return $result
}

function Get-EnvValue {
    param([string[]]$Lines, [string]$Key)
    foreach ($line in $Lines) {
        if ($line -match ('^\s*' + [regex]::Escape($Key) + '\s*=\s*"?([^"\r\n]*)"?\s*$')) {
            return $Matches[1]
        }
    }
    return $null
}

$lines = Set-EnvValue $lines 'DATABASE_URL' `
    ('postgresql://propino:' + $dbPass + '@127.0.0.1:5432/propino?schema=public')

foreach ($key in @('JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','BRIDGE_SECRET','CRON_SECRET')) {
    $current = Get-EnvValue $lines $key
    # Only replace placeholders - a real secret already in use must survive, or
    # every session and every configured agent would be invalidated.
    if (-not $current -or $current -match '^(dev-|change-me)' -or $current.Length -lt 16) {
        $lines = Set-EnvValue $lines $key (New-Secret 32)
        Log "  generated a fresh $key"
    }
}

$lines = Set-EnvValue $lines 'NEXT_PUBLIC_SITE_URL' ('https://' + $Domain)
$lines = Set-EnvValue $lines 'STORAGE_DIR' ($AppDir + '\storage')

Set-Content -Path $EnvFile -Value $lines -Encoding utf8

# Read it back and confirm the database password really landed in the file.
$writtenUrl = Get-EnvValue (Get-Content $EnvFile) 'DATABASE_URL'
if ($writtenUrl -notlike "*$dbPass*") {
    throw 'The database password did not survive being written to .env.'
}

New-Item -ItemType Directory -Force -Path "$AppDir\storage" | Out-Null
Done 'environment configured'

# -- 6. Build --------------------------------------------------
Push-Location $AppDir

Step 'installing dependencies (several minutes, no output while it works)'
# The build needs the dev dependencies too, so this is a full install.
$code = Invoke-Native 'npm install --no-audit --no-fund'
if ($code -ne 0) { throw "npm install failed (exit $code) - see setup.log" }
Done 'dependencies installed'

Step 'pointing the schema at PostgreSQL'
# The schema ships set to SQLite for local work; this switches it to match
# DATABASE_URL before anything touches the database.
$code = Invoke-Native 'node scripts\sync-db-provider.mjs'
if ($code -ne 0) { throw "could not switch the schema provider (exit $code)" }
Done 'schema provider set'

Step 'creating the database tables'
$code = Invoke-Native 'npx prisma generate'
if ($code -ne 0) { throw "prisma generate failed (exit $code) - see setup.log" }
$code = Invoke-Native 'npx prisma db push --accept-data-loss --skip-generate'
if ($code -ne 0) { throw "prisma db push failed (exit $code) - see setup.log" }
Done 'tables created'

Step 'building the site (several minutes)'
$code = Invoke-Native 'npm run build'
if ($code -ne 0 -or -not (Test-Path "$AppDir\.next")) {
    throw "Build failed (exit $code) - see the end of setup.log"
}
Done 'build complete'

Pop-Location

# -- 7. Run as a service ---------------------------------------
Step 'registering the site as a service'
$Nssm = "$AppDir\tools\nssm.exe"
if (-not (Test-Path $Nssm)) {
    New-Item -ItemType Directory -Force -Path "$AppDir\tools" | Out-Null
    $zip = "$env:TEMP\nssm.zip"
    Get-File 'https://nssm.cc/release/nssm-2.24.zip' $zip
    Expand-Archive -Path $zip -DestinationPath "$env:TEMP\nssm" -Force
    Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" $Nssm -Force
    Remove-Item $zip, "$env:TEMP\nssm" -Recurse -Force -ErrorAction SilentlyContinue
}

if (Get-Service propino -ErrorAction SilentlyContinue) {
    Skip 'service propino'
    & $Nssm restart propino | Out-Null
} else {
    & $Nssm install propino 'C:\Program Files\nodejs\node.exe' 'node_modules\next\dist\bin\next start -p 3000' | Out-Null
    & $Nssm set propino AppDirectory $AppDir | Out-Null
    & $Nssm set propino DisplayName 'PROPINO' | Out-Null
    & $Nssm set propino Start SERVICE_AUTO_START | Out-Null
    & $Nssm set propino AppStdout "$AppDir\app.log" | Out-Null
    & $Nssm set propino AppStderr "$AppDir\app.log" | Out-Null
    & $Nssm set propino AppRotateFiles 1 | Out-Null
    & $Nssm start propino | Out-Null
    Done 'service installed'
}
Start-Sleep -Seconds 8

# -- 8. HTTPS --------------------------------------------------
Step 'HTTPS'
$CaddyDir = "$AppDir\tools"
if (-not (Test-Path "$CaddyDir\caddy.exe")) {
    # Caddy puts the version inside the file name, so there is no fixed
    # "latest" link. Ask GitHub for the current asset, with known versions as
    # a fallback if the API is unreachable.
    $caddyUrls = @()
    try {
        $release = Invoke-RestMethod `
            -Uri 'https://api.github.com/repos/caddyserver/caddy/releases/latest' `
            -Headers @{ 'User-Agent' = 'propino-setup' } -TimeoutSec 120
        $asset = $release.assets |
            Where-Object { $_.name -like 'caddy_*_windows_amd64.zip' } |
            Select-Object -First 1
        if ($asset) { $caddyUrls += $asset.browser_download_url }
    } catch {
        Log '  GitHub API unavailable, using known versions' 'Yellow'
    }
    foreach ($v in '2.10.0', '2.9.1', '2.8.4') {
        $caddyUrls += "https://github.com/caddyserver/caddy/releases/download/v$v/caddy_${v}_windows_amd64.zip"
    }

    $zip = "$env:TEMP\caddy.zip"
    $gotCaddy = $false
    foreach ($candidate in $caddyUrls) {
        try { Get-File $candidate $zip; $gotCaddy = $true; break }
        catch { Log '  not available, trying next' 'Yellow' }
    }
    if (-not $gotCaddy) { throw 'Could not download Caddy.' }

    $extract = "$env:TEMP\caddy-extract"
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    $exe = Get-ChildItem $extract -Filter 'caddy.exe' -Recurse | Select-Object -First 1
    if (-not $exe) { throw 'caddy.exe not found in the archive.' }
    Copy-Item $exe.FullName "$CaddyDir\caddy.exe" -Force
    Remove-Item $zip, $extract -Recurse -Force -ErrorAction SilentlyContinue
}

# Caddy obtains and renews the certificate on its own once DNS points here.
@"
$Domain, www.$Domain {
    reverse_proxy 127.0.0.1:3000
    encode gzip
}
"@ | Set-Content -Path "$AppDir\Caddyfile" -Encoding ascii

if (Get-Service caddy -ErrorAction SilentlyContinue) {
    Skip 'service caddy'
    & $Nssm restart caddy | Out-Null
} else {
    $caddyArgs = 'run --config ' + $q + $AppDir + '\Caddyfile' + $q
    & $Nssm install caddy "$CaddyDir\caddy.exe" $caddyArgs | Out-Null
    & $Nssm set caddy AppDirectory $AppDir | Out-Null
    & $Nssm set caddy DisplayName 'Caddy (HTTPS)' | Out-Null
    & $Nssm set caddy Start SERVICE_AUTO_START | Out-Null
    & $Nssm set caddy AppStdout "$AppDir\caddy.log" | Out-Null
    & $Nssm set caddy AppStderr "$AppDir\caddy.log" | Out-Null
    & $Nssm start caddy | Out-Null
    Done 'HTTPS service installed'
}

# -- 9. Firewall -----------------------------------------------
Step 'firewall'
foreach ($port in 80, 443) {
    $name = "PROPINO HTTP $port"
    if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP `
            -LocalPort $port -Action Allow | Out-Null
    }
}
Done 'ports 80 and 443 open'

# -- Done ------------------------------------------------------
Log "-------------------------------------------" 'White'
Done 'setup finished'
Log ''
Log "Site service : $((Get-Service propino).Status)"
Log "HTTPS service: $((Get-Service caddy).Status)"
Log "Database     : $((Get-Service postgresql).Status)"
Log ''
Log "Local check  : http://localhost:3000" 'Cyan'
Log "Public       : https://$Domain  (once DNS points at this server)" 'Cyan'
Log ''
Log 'Next: point the domain A record at this server, then run seed.ps1' 'Yellow'
