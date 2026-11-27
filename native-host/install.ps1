# Registers the Hover Image Saver helper with Firefox for the current Windows user.
# Run again after moving this folder. Run with -Uninstall to remove it.
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$name = 'hover_image_saver'
$regKey = "HKCU:\Software\Mozilla\NativeMessagingHosts\$name"
$manifestPath = Join-Path $PSScriptRoot "$name.json"

if ($Uninstall) {
    if (Test-Path $regKey) { Remove-Item $regKey -Force }
    if (Test-Path $manifestPath) { Remove-Item $manifestPath -Force }
    Write-Host "Helper unregistered."
    return
}

$manifest = [ordered]@{
    name               = $name
    description        = 'Hover Image Saver helper: moves saved images to folders outside Downloads'
    path               = (Join-Path $PSScriptRoot 'host.bat')
    type               = 'stdio'
    allowed_extensions = @('hover-image-saver@xman2000')
}
# Write UTF-8 without a BOM; Firefox won't parse the manifest with one.
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name '(default)' -Value $manifestPath

Write-Host "Helper registered:"
Write-Host "  $manifestPath"
Write-Host "Restart Firefox (or reload the add-on) to pick it up."
