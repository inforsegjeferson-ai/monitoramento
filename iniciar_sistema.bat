@echo off
if not "%1"=="min" (
    start /min "" "%~f0" min
    exit /b
)
echo 🚀 Iniciando ecossistema de monitoramento...

:: Inicia o Monitoramento (Frontend) na porta 3000
start "Frontend" cmd /k "cd /d c:\monitoramento && npm run dev"

:: Inicia os Serviços (API/Backend) na porta 3001
start "Servicos" cmd /k "cd /d c:\servicos && npm run dev"

echo ✅ Tudo rodando!