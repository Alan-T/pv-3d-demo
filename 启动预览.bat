@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Please install Node.js and try again.
  pause
  exit /b 1
)
where yarn >nul 2>nul
if errorlevel 1 (
  echo Yarn 1.22.22 is required. Please enable Yarn with Corepack and try again.
  pause
  exit /b 1
)
call yarn install --frozen-lockfile --non-interactive
if errorlevel 1 (
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $url = 'http://127.0.0.1:8765/'; function Test-Preview { try { $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; return ($r.Content.Contains('/@vite/client') -and $r.Content.Contains('src/main.js')) } catch { return $false } }; if (Test-Preview) { Start-Process $url; exit 0 }; $listener = [System.Net.Sockets.TcpClient]::new(); try { $listener.Connect('127.0.0.1', 8765); Write-Host 'Port 8765 is already used by another service.'; exit 1 } catch {} finally { $listener.Dispose() }; $server = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'node_modules/vite/bin/vite.js --host 127.0.0.1 --port 8765 --strictPort' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru; for ($attempt = 0; $attempt -lt 60; $attempt++) { if (Test-Preview) { Start-Process $url; exit 0 }; if ($server.HasExited) { Write-Host 'Preview server exited unexpectedly.'; exit 1 }; Start-Sleep -Milliseconds 300 }; Write-Host 'Preview server did not respond. Please run yarn dev --host 127.0.0.1 --port 8765 --strictPort to diagnose.'; exit 1"
if errorlevel 1 (
  pause
  exit /b 1
)
endlocal
