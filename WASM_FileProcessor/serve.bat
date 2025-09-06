@echo off
echo Starting HTTP server for WASM test...
echo Open http://localhost:8000/test.html in your browser
python -m http.server 8000
pause