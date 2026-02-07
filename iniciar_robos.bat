@echo off
:inicio
cls
echo ==========================================
echo 🚀 MAESTRO: MONITORAMENTO SOLAR
echo 🕒 Hora atual: %time%
echo ==========================================

:: Extrai apenas a hora do sistema (HH)
set "current_hour=%time:~0,2%"

:: Remove espaços (caso a hora seja menor que 10, ex: " 8")
set "current_hour=%current_hour: =%"

:: Verifica se a hora está entre 7 e 17 (termina às 18:00)
if %current_hour% GEQ 7 if %current_hour% LSS 18 (
    echo ☀️ Dentro do horário de operação (07h às 18h).
    goto executar_robo
) else (
    echo 🌙 Fora do horário de operação. 
    echo 💤 Aguardando o sol nascer para reiniciar...
    timeout /t 600 /nobreak
    goto inicio
)

:executar_robo
:: Entra na pasta do projeto
cd /d "C:\monitoramento"

:: Executa o Maestro
node robo_maestro.js

echo.
echo ✅ Ciclo finalizado com sucesso!
echo ⏳ Aguardando 180 segundos para a próxima rodada...

:: Aguarda 180 segundos (3 minutos)
timeout /t 180 /nobreak

goto inicio