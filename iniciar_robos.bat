@echo off
if not "%1"=="min" (
    start /min "" "%~f0" min
    exit /b
)
setlocal enabledelayedexpansion

:inicio
cls
echo ==========================================
echo 🚀 MAESTRO: MONITORAMENTO SOLAR
echo 🕒 Hora atual: %time%
echo ==========================================

:: Pega a hora de forma mais segura
set "hora=%time:~0,2%"
:: Remove espaços caso a hora seja entre 00 e 09
set "hora=%hora: =0%"

echo Hora processada: %hora%h

:: Verifica se esta entre 07 e 18
if %hora% GEQ 07 (
    if %hora% LSS 18 (
        echo ☀️ Dentro do horario de operacao.
        goto executar_robo
    )
)

:fora_horario
echo 🌙 Fora do horario de operacao (07h as 18h).
echo 💤 Aguardando...
timeout /t 300 /nobreak
goto inicio

:executar_robo
cd /d "C:\monitoramento"
:: Verificando se o arquivo existe antes de rodar
if exist robo_maestro.js (
    node robo_maestro.js
) else (
    echo ❌ ERRO: Arquivo robo_maestro.js nao encontrado em C:\monitoramento
    pause
    exit
)

echo.
echo ✅ Ciclo finalizado!
timeout /t 300 /nobreak
goto inicio