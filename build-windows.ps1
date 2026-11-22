<#
.SYNOPSIS
Build Screenwriter Pro for Windows using Electron

.DESCRIPTION
Creates a Windows installer (NSIS) and portable executable
#>

param(
    [switch]$Clean,
    [switch]$PortableOnly
)

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
cd $projectDir

Write-Host "Building Screenwriter Pro for Windows..." -ForegroundColor Cyan

# Check prerequisites
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found. Install from https://nodejs.org/"
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found. Install Node.js from https://nodejs.org/"
    exit 1
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

# Install electron-builder if not present
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "Installing electron-builder..." -ForegroundColor Yellow
    npm install --save-dev electron-builder
}

# Build
$buildArgs = @("--win")
if ($PortableOnly) {
    $buildArgs += "--config.portable"
}

if ($Clean) {
    Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force "release" -ErrorAction SilentlyContinue
}

Write-Host "Building Windows installer..." -ForegroundColor Green
npx electron-builder $buildArgs

Write-Host "Build complete!" -ForegroundColor Cyan
Write-Host "Output in: $projectDir\release" -ForegroundColor Green