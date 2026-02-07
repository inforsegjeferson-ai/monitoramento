@echo off
chcp 65001 >nul
:inicio
cls
echo ==========================================
echo MAESTRO: INICIANDO CICLO DE MONITORAMENTO
echo Hora de inicio: %time%
echo ==========================================

:: Entra na pasta do projeto
cd /d "C:\monitoramento"

:: Executa o Maestro (arquivo correto: robo_maestro.js)
node robo_maestro.js

echo.
echo Ciclo encerrado ou erro. Reiniciando em 180 segundos...
echo (Mantenha esta janela aberta para o loop continuar)

:: Aguarda 180 segundos
timeout /t 180 /nobreak

goto inicio
