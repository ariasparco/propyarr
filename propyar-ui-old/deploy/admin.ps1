# Administrator management, on the server only.
#
#   powershell -ExecutionPolicy Bypass -File deploy\admin.ps1
#
# There is no page or button anywhere in the site that can create an
# administrator. It can only be done here, on the machine itself.

$ErrorActionPreference = 'Stop'

$AppDir = 'C:\propino'
$q = [char]34

Set-Location $AppDir

# A shell opened before Node was installed will not have it on PATH.
$nodeDir = 'C:\Program Files\nodejs'
if (-not (Test-Path "$nodeDir\node.exe")) {
    $found = Get-Command node -ErrorAction SilentlyContinue
    if ($found) { $nodeDir = Split-Path $found.Source -Parent }
    else { throw 'Node.js was not found. Run deploy\setup.ps1 first.' }
}
$node = "$nodeDir\node.exe"

function Invoke-AdminTool {
    param([string]$Command)
    # cmd.exe keeps native stderr as plain text; only the exit code decides.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & cmd.exe /c ($q + $node + $q + ' deploy\admin.js ' + $Command)
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    return $code
}

function Read-Password {
    param([string]$Prompt)
    $a = Read-Host $Prompt -AsSecureString
    $first = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($a))
    if ($first.Length -lt 8) {
        Write-Host 'Too short - at least 8 characters.' -ForegroundColor Red
        return $null
    }
    $b = Read-Host 'Type it once more' -AsSecureString
    $second = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($b))
    if ($first -ne $second) {
        Write-Host 'They do not match.' -ForegroundColor Red
        return $null
    }
    return $first
}

Write-Host ''
Write-Host '  PROPINO - administrators' -ForegroundColor Cyan
Write-Host '  ------------------------' -ForegroundColor DarkGray
Write-Host ''
Invoke-AdminTool 'list' | Out-Null
Write-Host ''
Write-Host '  1  Add an administrator'
Write-Host '  2  Change an administrator password'
Write-Host '  3  Remove administrator access'
Write-Host '  4  Just show the list again'
Write-Host '  0  Quit'
Write-Host ''

$choice = Read-Host 'Choose'

switch ($choice) {
    '1' {
        $name  = (Read-Host 'Full name').Trim()
        $email = (Read-Host 'Email').Trim()
        $pass  = Read-Password 'Password (at least 8 characters)'
        if (-not $pass) { exit 1 }

        $env:ADMIN_NAME = $name
        $env:ADMIN_EMAIL = $email
        $env:ADMIN_PASSWORD = $pass
        $code = Invoke-AdminTool 'add'
        Remove-Item Env:ADMIN_NAME, Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
        if ($code -ne 0) { exit 1 }
    }
    '2' {
        $email = (Read-Host 'Email of the administrator').Trim()
        $pass  = Read-Password 'New password (at least 8 characters)'
        if (-not $pass) { exit 1 }

        $env:ADMIN_EMAIL = $email
        $env:ADMIN_PASSWORD = $pass
        $code = Invoke-AdminTool 'password'
        Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
        if ($code -ne 0) { exit 1 }
    }
    '3' {
        $email = (Read-Host 'Email to remove admin access from').Trim()
        Write-Host ''
        Write-Host "This removes admin access from $email." -ForegroundColor Yellow
        Write-Host 'The account itself stays, as an ordinary user.' -ForegroundColor DarkGray
        $sure = Read-Host 'Type YES to confirm'
        if ($sure -ne 'YES') { Write-Host 'Cancelled.'; exit 0 }

        $env:ADMIN_EMAIL = $email
        $code = Invoke-AdminTool 'remove'
        Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
        if ($code -ne 0) { exit 1 }
    }
    '4' { }
    default { Write-Host 'Nothing done.'; exit 0 }
}

Write-Host ''
Write-Host '  Administrators now:' -ForegroundColor Cyan
Invoke-AdminTool 'list' | Out-Null
Write-Host ''
Write-Host '  Sign in at https://propino.top/fa/admin-login' -ForegroundColor Green
Write-Host ''
