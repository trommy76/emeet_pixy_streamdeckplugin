# Builds native/uvc-util-win (this plugin's Windows-native, DirectShow-based
# stand-in for macOS's uvc-util) and drops the resulting uvc-util.exe into the
# plugin's bin\ folder, where pixy-uvc.ts expects to find it at runtime.
#
# Requires the .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0
# Only needed for the PTZ Preset, PTZ Nudge, PTZ Center, and Image Control
# actions -- every other action in this plugin works without it.
#
# Run from the project root:
#   powershell -ExecutionPolicy Bypass -File scripts/build-uvc-util-win.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ProjectFile = Join-Path $ProjectRoot "native\uvc-util-win\UvcUtilWin.csproj"
$OutDir = Join-Path $ProjectRoot "com.emeetpixy.pixycontrol.sdPlugin\bin"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Error "dotnet (the .NET SDK) isn't on PATH. Install it from https://dotnet.microsoft.com/download/dotnet/8.0 and try again."
    exit 1
}

Write-Host "Building uvc-util.exe (self-contained, single-file)..."
dotnet publish $ProjectFile `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -o $OutDir

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed."
    exit 1
}

# The publish step also drops a .pdb (debug symbols) alongside the exe --
# harmless to keep, but not needed for the plugin to run.
Write-Host "Built $OutDir\uvc-util.exe"
& "$OutDir\uvc-util.exe" --version
