# Hover Image Saver - native helper.
# Firefox talks to this over stdin/stdout (native messaging): each message is a
# 4-byte little-endian length followed by that many bytes of UTF-8 JSON.

$ErrorActionPreference = 'Stop'
$VERSION = 1
$STAGING_DIR_NAME = '_hover-image-saver-tmp'

$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()

function Read-Exact([int]$count) {
    $buf = New-Object byte[] $count
    $read = 0
    while ($read -lt $count) {
        $n = $stdin.Read($buf, $read, $count - $read)
        if ($n -le 0) { return $null }
        $read += $n
    }
    return ,$buf
}

function Send-Message($obj) {
    $json = ConvertTo-Json $obj -Compress -Depth 4
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $stdout.Write([BitConverter]::GetBytes([int]$bytes.Length), 0, 4)
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

function Test-AbsolutePath([string]$p) {
    return $p -match '^[A-Za-z]:\\' -or $p -match '^\\\\[^\\]+\\[^\\]+'
}

function Get-UniquePath([string]$dir, [string]$name) {
    $target = Join-Path $dir $name
    if (-not (Test-Path -LiteralPath $target)) { return $target }
    $base = [IO.Path]::GetFileNameWithoutExtension($name)
    $ext = [IO.Path]::GetExtension($name)
    for ($i = 1; ; $i++) {
        $target = Join-Path $dir ("{0} ({1}){2}" -f $base, $i, $ext)
        if (-not (Test-Path -LiteralPath $target)) { return $target }
    }
}

function Invoke-Move($msg) {
    $src = [string]$msg.src
    $dir = ([string]$msg.dir).Trim().Replace('/', '\').TrimEnd('\')
    if ($dir -match '^[A-Za-z]:$') { $dir += '\' }

    # Only ever move files the add-on just downloaded into its staging folder.
    $srcParent = Split-Path -Leaf (Split-Path -Parent $src)
    if ($srcParent -ne $STAGING_DIR_NAME -or -not (Test-Path -LiteralPath $src -PathType Leaf)) {
        return @{ ok = $false; error = "Unexpected source file: $src" }
    }
    if (-not (Test-AbsolutePath $dir) -or $dir -match '(^|\\)\.\.(\\|$)') {
        return @{ ok = $false; error = "Not a full folder path: $dir" }
    }

    if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $target = Get-UniquePath $dir (Split-Path -Leaf $src)
    Move-Item -LiteralPath $src -Destination $target
    return @{ ok = $true; path = $target }
}

function Invoke-Reveal($msg) {
    $path = [string]$msg.path
    if (-not (Test-AbsolutePath $path) -or -not (Test-Path -LiteralPath $path)) {
        return @{ ok = $false; error = "File not found: $path" }
    }
    Start-Process explorer.exe -ArgumentList "/select,`"$path`""
    return @{ ok = $true }
}

while ($true) {
    $lenBytes = Read-Exact 4
    if ($null -eq $lenBytes) { break }
    $len = [BitConverter]::ToInt32($lenBytes, 0)
    $body = Read-Exact $len
    if ($null -eq $body) { break }

    try {
        $msg = [Text.Encoding]::UTF8.GetString($body) | ConvertFrom-Json
        switch ($msg.type) {
            'ping'   { $reply = @{ ok = $true; version = $VERSION } }
            'move'   { $reply = Invoke-Move $msg }
            'reveal' { $reply = Invoke-Reveal $msg }
            default  { $reply = @{ ok = $false; error = "Unknown request: $($msg.type)" } }
        }
    } catch {
        $reply = @{ ok = $false; error = $_.Exception.Message }
    }
    Send-Message $reply
}
