@echo off
title INVENTARIO - Sistema Empresarial CDS
echo ========================================================
echo   INICIANDO SISTEMA DE INVENTARIO 100% OFFLINE (CDS)
echo ========================================================
cd /d "%~dp0"

if not exist "%~dp0inventario.db" (
    echo Inicializando base de datos SQLite y migrando datos de Excel...
    python src\database\init_and_seed.py
)

echo Iniciando Servidor Local...
start "" /b node src\api\server.js

timeout /t 2 /nobreak >nul

echo Abriendo aplicacion...
start msedge --app="http://localhost:3000" 2>nul || start chrome --app="http://localhost:3000" 2>nul || start http://localhost:3000
