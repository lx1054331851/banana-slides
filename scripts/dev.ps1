param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Start-DevProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Command
    )

    $args = @("-NoExit", "-Command", "cd `"$repoRoot`"; $Command")
    $proc = Start-Process -FilePath "powershell" -ArgumentList $args -WorkingDirectory $repoRoot -PassThru
    Write-Host "Started $Name (PID $($proc.Id))."
}

if (-not $FrontendOnly) {
    Start-DevProcess -Name "backend" -Command "npm run dev:backend"
}

if (-not $BackendOnly) {
    Start-DevProcess -Name "frontend" -Command "npm run dev:frontend"
}
