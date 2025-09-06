# Build Rust WASM and place it in the correct location for the library
# This script builds the G-code processor WASM module and ensures it's ready for use

Write-Host "Building Rust WASM G-code processor..." -ForegroundColor Cyan

# Check if we're in the right directory
if (-not (Test-Path "WASM_FileProcessor\Cargo.toml")) {
    Write-Host "Error: WASM_FileProcessor\Cargo.toml not found!" -ForegroundColor Red
    Write-Host "Please run this script from the root of the npm_gcodeviewer_ts project." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if wasm-pack is installed
try {
    $null = Get-Command wasm-pack -ErrorAction Stop
    $wasmPackVersion = wasm-pack --version
    Write-Host "Found wasm-pack: $wasmPackVersion" -ForegroundColor Green
}
catch {
    Write-Host "Error: wasm-pack is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "Please install wasm-pack: https://rustwasm.github.io/wasm-pack/installer/" -ForegroundColor Yellow
    Write-Host "  or run: cargo install wasm-pack" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Rust is installed
try {
    $null = Get-Command rustc -ErrorAction Stop
    $rustVersion = rustc --version
    Write-Host "Found Rust: $rustVersion" -ForegroundColor Green
}
catch {
    Write-Host "Error: Rust is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "Please install Rust: https://rustup.rs/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Building WASM module with wasm-pack..." -ForegroundColor Cyan

# Change to WASM directory
Push-Location WASM_FileProcessor

try {
    # Build the WASM package for web target with optimizations
    Write-Host "Building web target..." -ForegroundColor Yellow
    wasm-pack build --target web --out-dir pkg --release
    
    if ($LASTEXITCODE -ne 0) {
        throw "WASM web build failed"
    }
    
    # Also build for Node.js target (useful for testing)
    Write-Host ""
    Write-Host "Building Node.js target..." -ForegroundColor Yellow
    wasm-pack build --target nodejs --out-dir pkg-node --release
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Warning: Node.js build failed, but web build succeeded." -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "✅ WASM build completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Generated files:" -ForegroundColor Cyan
    Write-Host "  📁 WASM_FileProcessor/pkg/ - Web target (used by library)" -ForegroundColor White
    Write-Host "  📁 WASM_FileProcessor/pkg-node/ - Node.js target (for testing)" -ForegroundColor White
    Write-Host ""
    Write-Host "The WASM module is now ready for use in the TypeScript library." -ForegroundColor Green
    Write-Host "You can now run 'npm run dev' or 'npm run build' to use the updated WASM module." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    Pop-Location
    Read-Host "Press Enter to exit"
    exit 1
}
finally {
    Pop-Location
}

Read-Host "Press Enter to exit"