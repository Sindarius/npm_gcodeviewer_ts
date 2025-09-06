@echo off
REM Build Rust WASM and place it in the correct location for the library
REM This script builds the G-code processor WASM module and ensures it's ready for use

echo Building Rust WASM G-code processor...

REM Check if we're in the right directory
if not exist "WASM_FileProcessor\Cargo.toml" (
    echo Error: WASM_FileProcessor\Cargo.toml not found!
    echo Please run this script from the root of the npm_gcodeviewer_ts project.
    pause
    exit /b 1
)

REM Check if wasm-pack is installed
wasm-pack --version >nul 2>&1
if errorlevel 1 (
    echo Error: wasm-pack is not installed or not in PATH!
    echo Please install wasm-pack: https://rustwasm.github.io/wasm-pack/installer/
    echo   or run: cargo install wasm-pack
    pause
    exit /b 1
)

REM Check if Rust is installed
rustc --version >nul 2>&1
if errorlevel 1 (
    echo Error: Rust is not installed or not in PATH!
    echo Please install Rust: https://rustup.rs/
    pause
    exit /b 1
)

echo.
echo Building WASM module with wasm-pack...
cd WASM_FileProcessor

REM Build the WASM package for web target with optimizations
wasm-pack build --target web --out-dir pkg --release

if errorlevel 1 (
    echo.
    echo Error: WASM build failed!
    cd ..
    pause
    exit /b 1
)

REM Also build for Node.js target (useful for testing)
echo.
echo Building Node.js target...
wasm-pack build --target nodejs --out-dir pkg-node --release

if errorlevel 1 (
    echo.
    echo Warning: Node.js build failed, but web build succeeded.
)

cd ..

echo.
echo ✅ WASM build completed successfully!
echo.
echo Generated files:
echo   📁 WASM_FileProcessor/pkg/ - Web target (used by library)
echo   📁 WASM_FileProcessor/pkg-node/ - Node.js target (for testing)
echo.
echo The WASM module is now ready for use in the TypeScript library.
echo You can now run 'npm run dev' or 'npm run build' to use the updated WASM module.

pause