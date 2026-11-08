# Checks why the site is failing and prints exactly what is wrong.
#
#   powershell -ExecutionPolicy Bypass -File deploy\diagnose.ps1
#
# Secrets are masked, so the output is safe to copy and share.

$ErrorActionPreference = 'Continue'

$AppDir = 'C:\propino'
$PgBin  = 'C:\pgsql\bin'

function Head { param([string]$Text) Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Good { param([string]$Text) Write-Host "   OK   $Text" -ForegroundColor Green }
function Bad  { param([string]$Text) Write-Host "   BAD  $Text" -ForegroundColor Red }
function Note { param([string]$Text) Write-Host "        $Text" -ForegroundColor DarkGray }

Write-Host '===========================================' -ForegroundColor White
Write-Host ' PROPINO diagnosis' -ForegroundColor White
Write-Host '===========================================' -ForegroundColor White

# -- Services --------------------------------------------------
Head 'services'
foreach ($name in 'propino', 'caddy', 'postgresql') {
    $svc = Get-Service $name -ErrorAction SilentlyContinue
    if (-not $svc) { Bad "$name is not installed" }
    elseif ($svc.Status -eq 'Running') { Good "$name running" }
    else { Bad "$name is $($svc.Status)" }
}

# -- Settings --------------------------------------------------
Head 'settings (.env)'
$envPath = "$AppDir\.env"
if (-not (Test-Path $envPath)) {
    Bad '.env is missing'
} else {
    $envText = Get-Content $envPath -Raw

    # Anything still holding a development placeholder breaks sign-in.
    $placeholders = @()
    foreach ($key in 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'BRIDGE_SECRET', 'CRON_SECRET') {
        $m = [regex]::Match($envText, "(?m)^$key=`"?([^`"\r\n]*)`"?")
        $val = $m.Groups[1].Value
        if (-not $m.Success -or $val -match '^(change-me|dev-)' -or $val.Length -lt 16) {
            $placeholders += $key
        }
    }
    if ($placeholders.Count -gt 0) {
        Bad ("still on placeholder values: " + ($placeholders -join ', '))
        Note 'Sign-in cannot work until these are real secrets.'
    } else {
        Good 'security keys look real'
    }

    $dbm = [regex]::Match($envText, '(?m)^DATABASE_URL="?([^"\r\n]+)"?')
    if (-not $dbm.Success) {
        Bad 'DATABASE_URL is missing'
    } else {
        $url = $dbm.Groups[1].Value
        # Show the shape without revealing the password.
        $masked = $url -replace '://([^:]+):([^@]+)@', '://$1:*****@'
        if ($url -match 'CHANGEME') {
            Bad "DATABASE_URL still says CHANGEME"
            Note $masked
        } elseif ($url -match '^file:') {
            Bad "DATABASE_URL points at SQLite, not PostgreSQL"
            Note $masked
        } else {
            Good $masked
        }
    }

    $site = [regex]::Match($envText, '(?m)^NEXT_PUBLIC_SITE_URL="?([^"\r\n]+)"?')
    if ($site.Success) { Good ("site url: " + $site.Groups[1].Value) }
}

# -- Database --------------------------------------------------
Head 'database connection'
if (Test-Path "$AppDir\dbpass.txt") {
    $dbPass = (Get-Content "$AppDir\dbpass.txt" -Raw).Trim()
    $env:PGPASSWORD = $dbPass
    $answer = & "$PgBin\psql.exe" -U propino -h 127.0.0.1 -d propino -tAc 'SELECT 1' 2>&1
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

    if ($answer -eq '1') {
        Good 'the propino user can reach the propino database'

        # Does the schema actually exist, and is there an administrator?
        $env:PGPASSWORD = $dbPass
        $tables = & "$PgBin\psql.exe" -U propino -h 127.0.0.1 -d propino -tAc `
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>&1
        $admins = & "$PgBin\psql.exe" -U propino -h 127.0.0.1 -d propino -tAc `
            "SELECT count(*) FROM ""User"" WHERE role='ADMIN'" 2>&1
        $plans = & "$PgBin\psql.exe" -U propino -h 127.0.0.1 -d propino -tAc `
            'SELECT count(*) FROM "Challenge"' 2>&1
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

        if ([int]::TryParse("$tables", [ref]$null) -and [int]$tables -gt 0) {
            Good "$tables tables present"
        } else {
            Bad 'no tables - the schema was never pushed'
            Note 'Run: deploy\update.ps1'
        }
        if ([int]::TryParse("$admins", [ref]$null)) {
            if ([int]$admins -gt 0) { Good "$admins administrator account(s)" }
            else { Bad 'no administrator yet - run deploy\seed.ps1' }
        }
        if ([int]::TryParse("$plans", [ref]$null)) {
            if ([int]$plans -gt 0) { Good "$plans challenge plans" }
            else { Bad 'no plans yet - run deploy\seed.ps1' }
        }
    } else {
        Bad 'the app cannot sign in to the database'
        Note "$answer"
        Note 'The password in .env probably does not match the database user.'
    }
} else {
    Bad 'dbpass.txt is missing - setup never created the database user'
}

# -- The site itself -------------------------------------------
Head 'site response'
try {
    $res = Invoke-WebRequest -Uri 'http://localhost:3000/fa' -UseBasicParsing -TimeoutSec 20
    Good "homepage returns $($res.StatusCode)"
} catch {
    Bad "homepage failed: $($_.Exception.Message)"
}

try {
    # A deliberately wrong password: a healthy site answers 401, not 500.
    $body = '{"email":"diagnostic@example.invalid","password":"not-a-real-password"}'
    $res = Invoke-WebRequest -Uri 'http://localhost:3000/api/auth/login' -Method POST `
        -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 20
    Good "login endpoint answered $($res.StatusCode)"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 401) {
        Good 'login endpoint healthy (rejected a bad password, as it should)'
    } elseif ($status -eq 500) {
        Bad 'login endpoint is crashing (500)'
        Note 'The cause is in the application log below.'
    } else {
        Note "login endpoint answered $status"
    }
}

# -- Application log -------------------------------------------
Head 'last errors from the application log'
if (Test-Path "$AppDir\app.log") {
    $lines = Get-Content "$AppDir\app.log" -Tail 200
    $errors = $lines | Where-Object { $_ -match 'Error|error|Invalid|failed|Exception|PrismaClient' }
    if ($errors) {
        $errors | Select-Object -Last 20 | ForEach-Object { Write-Host "   $_" -ForegroundColor Yellow }
    } else {
        Note 'no obvious errors in the last 200 lines'
    }
} else {
    Bad 'app.log not found'
}

Write-Host ''
Write-Host '===========================================' -ForegroundColor White
Write-Host ' Copy everything above when asking for help' -ForegroundColor White
Write-Host '===========================================' -ForegroundColor White
