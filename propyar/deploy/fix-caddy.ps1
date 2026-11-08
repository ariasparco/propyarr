# Installs Caddy (the HTTPS front door) and opens the firewall.
#
# Caddy names its release files with the version inside, so there is no fixed
# "latest" download link. This asks GitHub which release is current and takes
# the Windows build from it.
#
#   powershell -ExecutionPolicy Bypass -File deploy\fix-caddy.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$AppDir   = 'C:\propino'
$ToolsDir = "$AppDir\tools"
$LogFile  = "$AppDir\setup.log"
$Domain   = 'propino.top'
$Nssm     = "$ToolsDir\nssm.exe"
$q        = [char]34

function Log {
    param([string]$Message, [string]$Colour = 'Gray')
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line -ForegroundColor $Colour
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Log '-------------------------------------------' 'White'
Log 'Installing HTTPS' 'White'
Log '-------------------------------------------' 'White'

# -- 1. Fetch Caddy --------------------------------------------
if (Test-Path "$ToolsDir\caddy.exe") {
    Log '--  caddy.exe already present' 'DarkGray'
} else {
    Log '== finding the current Caddy release' 'Cyan'
    $url = $null

    # GitHub's API tells us the exact asset name for the newest release.
    try {
        $release = Invoke-RestMethod `
            -Uri 'https://api.github.com/repos/caddyserver/caddy/releases/latest' `
            -Headers @{ 'User-Agent' = 'propino-setup' } -TimeoutSec 120
        $asset = $release.assets |
            Where-Object { $_.name -like 'caddy_*_windows_amd64.zip' } |
            Select-Object -First 1
        if ($asset) {
            $url = $asset.browser_download_url
            Log "  latest is $($release.tag_name)"
        }
    } catch {
        Log '  GitHub API unavailable, falling back to known versions' 'Yellow'
    }

    # If the API was unreachable or rate limited, try published versions.
    $candidates = @()
    if ($url) { $candidates += $url }
    foreach ($v in '2.10.0', '2.9.1', '2.8.4') {
        $candidates += "https://github.com/caddyserver/caddy/releases/download/v$v/caddy_${v}_windows_amd64.zip"
    }

    $zip = "$env:TEMP\caddy.zip"
    $got = $false
    foreach ($candidate in $candidates) {
        try {
            Log "  downloading $candidate"
            Invoke-WebRequest -Uri $candidate -OutFile $zip -UseBasicParsing -TimeoutSec 600
            $got = $true
            break
        } catch {
            Log '  that one is not available, trying the next' 'Yellow'
        }
    }
    if (-not $got) { throw 'Could not download Caddy. Check the server internet access.' }

    $extract = "$env:TEMP\caddy-extract"
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $extract -Force

    $exe = Get-ChildItem $extract -Filter 'caddy.exe' -Recurse | Select-Object -First 1
    if (-not $exe) { throw 'caddy.exe was not found inside the downloaded archive.' }
    Copy-Item $exe.FullName "$ToolsDir\caddy.exe" -Force

    Remove-Item $zip, $extract -Recurse -Force -ErrorAction SilentlyContinue
    Log 'OK  Caddy downloaded' 'Green'
}

& "$ToolsDir\caddy.exe" version
Log 'OK  Caddy runs' 'Green'

# -- 2. Configuration ------------------------------------------
Log '== writing the configuration' 'Cyan'
# Caddy requests and renews the certificate itself once the domain resolves
# here. Until then it simply serves the site over plain HTTP.
@"
$Domain, www.$Domain {
    reverse_proxy 127.0.0.1:3000
    encode gzip
}
"@ | Set-Content -Path "$AppDir\Caddyfile" -Encoding ascii
Log 'OK  Caddyfile written' 'Green'

# -- 3. Service ------------------------------------------------
if (-not (Test-Path $Nssm)) { throw "nssm.exe is missing from $ToolsDir. Run setup.ps1 first." }

Log '== registering the Caddy service' 'Cyan'
if (Get-Service caddy -ErrorAction SilentlyContinue) {
    & $Nssm stop caddy | Out-Null
    Start-Sleep -Seconds 2
    & $Nssm remove caddy confirm | Out-Null
    Start-Sleep -Seconds 2
}

$caddyArgs = 'run --config ' + $q + $AppDir + '\Caddyfile' + $q
& $Nssm install caddy "$ToolsDir\caddy.exe" $caddyArgs | Out-Null
& $Nssm set caddy AppDirectory $AppDir | Out-Null
& $Nssm set caddy DisplayName 'Caddy (HTTPS)' | Out-Null
& $Nssm set caddy Start SERVICE_AUTO_START | Out-Null
& $Nssm set caddy AppStdout "$AppDir\caddy.log" | Out-Null
& $Nssm set caddy AppStderr "$AppDir\caddy.log" | Out-Null
& $Nssm set caddy AppRotateFiles 1 | Out-Null
& $Nssm start caddy | Out-Null
Start-Sleep -Seconds 5
Log 'OK  Caddy service installed' 'Green'

# -- 4. Firewall -----------------------------------------------
Log '== firewall' 'Cyan'
foreach ($port in 80, 443) {
    $name = "PROPINO HTTP $port"
    if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP `
            -LocalPort $port -Action Allow | Out-Null
    }
}
Log 'OK  ports 80 and 443 open' 'Green'

# -- Summary ---------------------------------------------------
Log '' 'White'
Log ("Site service : {0}" -f (Get-Service propino).Status)
Log ("HTTPS service: {0}" -f (Get-Service caddy).Status)
Log ("Database     : {0}" -f (Get-Service postgresql).Status)
Log '' 'White'
Log 'Check the site locally:  curl.exe -I http://localhost:3000/fa' 'Cyan'
Log "Then point the domain's A record at this server." 'Yellow'
