// @ts-nocheck
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Função para obter data/hora atual no timezone do Brasil
function getDataHoraBrasil() {
    const agora = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const partes = formatter.formatToParts(agora);
    const getPart = (type) => partes.find(p => p.type === type)?.value || '00';
    
    const ano = getPart('year');
    const mes = getPart('month');
    const dia = getPart('day');
    const hora = getPart('hour');
    const minuto = getPart('minute');
    const segundo = getPart('second');
    
    // Retorna no formato ISO com timezone de Brasília
    return `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}-03:00`;
}

async function rodarRobo() {
    console.log("🚀 Iniciando sincronização Intelbras...");
    
    const browser = await chromium.launch({ headless: true }); 
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log("🔗 Acessando Intelbras Solar Monitoramento...");
        await page.goto('http://solar-monitoramento.intelbras.com.br/', { waitUntil: 'networkidle' });
        
        // Aguarda um pouco para a página carregar
        await page.waitForTimeout(2000);
        
        // Login
        console.log("🔐 Realizando login...");
        try {
            // Aguarda os campos de login aparecerem
            await page.waitForSelector('input[type="text"], input[type="email"], input:not([type])', { timeout: 10000 });
            await page.waitForSelector('input[type="password"]', { timeout: 10000 });
            
            // Tenta encontrar e preencher campos de login
            const loginInfo = await page.evaluate(({ user, pass }) => {
                // Busca por diferentes tipos de campos de input
                const inputs = Array.from(document.querySelectorAll('input'));
                const textInputs = inputs.filter(i => i.type === 'text' || i.type === 'email' || !i.type);
                const passwordInputs = inputs.filter(i => i.type === 'password');
                
                // Tenta encontrar campo de usuário
                let userInput = textInputs.find(i => 
                    i.placeholder?.toLowerCase().includes('usuário') ||
                    i.placeholder?.toLowerCase().includes('user') ||
                    i.placeholder?.toLowerCase().includes('login') ||
                    i.name?.toLowerCase().includes('user') ||
                    i.name?.toLowerCase().includes('username') ||
                    i.id?.toLowerCase().includes('user') ||
                    i.id?.toLowerCase().includes('login')
                ) || textInputs[0];
                
                // Tenta encontrar campo de senha
                let passInput = passwordInputs[0];
                
                if (userInput && passInput) {
                    // Limpa os campos primeiro
                    userInput.value = '';
                    passInput.value = '';
                    
                    // Preenche os campos
                    userInput.focus();
                    userInput.value = user;
                    userInput.dispatchEvent(new Event('input', { bubbles: true }));
                    userInput.dispatchEvent(new Event('change', { bubbles: true }));
                    userInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    passInput.focus();
                    passInput.value = pass;
                    passInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passInput.dispatchEvent(new Event('change', { bubbles: true }));
                    passInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    return { 
                        success: true, 
                        userFound: !!userInput, 
                        passFound: !!passInput,
                        userValue: userInput.value,
                        passValue: passInput.value ? '***' : ''
                    };
                }
                
                return { 
                    success: false, 
                    inputsCount: inputs.length, 
                    textInputsCount: textInputs.length, 
                    passwordInputsCount: passwordInputs.length 
                };
            }, { user: 'AEDQ2001', pass: 'Jsolar123' });
            
            console.log("📝 Info de login:", loginInfo);
            
            if (!loginInfo.success) {
                throw new Error('Campos de login não encontrados');
            }
            
            // Aguarda um pouco para os eventos serem processados
            await page.waitForTimeout(1500);
            
            // Tenta submeter o formulário de múltiplas formas
            let loginSubmetido = false;
            
            // Método 1: Tenta encontrar e clicar no botão de login
            try {
                const buttonClicked = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
                    const loginButton = buttons.find(b => {
                        const text = (b.textContent || b.value || '').toLowerCase();
                        return text.includes('entrar') || 
                               text.includes('login') || 
                               text.includes('acessar') ||
                               text.includes('sign in') ||
                               b.className?.toLowerCase().includes('login') ||
                               b.className?.toLowerCase().includes('submit') ||
                               b.id?.toLowerCase().includes('login') ||
                               b.id?.toLowerCase().includes('submit');
                    });
                    
                    if (loginButton) {
                        loginButton.click();
                        return true;
                    }
                    return false;
                });
                
                if (buttonClicked) {
                    console.log("✅ Botão de login clicado");
                    loginSubmetido = true;
                }
            } catch (err) {
                console.log("⚠️ Erro ao clicar no botão:", err.message);
            }
            
            // Método 2: Se não encontrou botão, tenta submeter o formulário diretamente
            if (!loginSubmetido) {
                try {
                    await page.evaluate(() => {
                        const forms = Array.from(document.querySelectorAll('form'));
                        if (forms.length > 0) {
                            forms[0].submit();
                        }
                    });
                    console.log("✅ Formulário submetido");
                    loginSubmetido = true;
                } catch (err) {
                    console.log("⚠️ Erro ao submeter formulário:", err.message);
                }
            }
            
            // Método 3: Tenta Enter no campo de senha
            if (!loginSubmetido) {
                try {
                    await page.focus('input[type="password"]');
                    await page.waitForTimeout(500);
                    await page.keyboard.press('Enter');
                    console.log("⌨️ Enter pressionado no campo de senha");
                    loginSubmetido = true;
                } catch (err) {
                    console.log("⚠️ Erro ao pressionar Enter:", err.message);
                }
            }
            
            // Aguarda redirecionamento ou mudança na página
            console.log("⏳ Aguardando redirecionamento após login...");
            
            // Aguarda até 30 segundos por mudança na URL ou elementos que indicam login bem-sucedido
            try {
                await Promise.race([
                    page.waitForURL(url => !url.href.includes('/login') && url.href !== 'http://solar-monitoramento.intelbras.com.br/', { timeout: 30000 }),
                    page.waitForSelector('table, [class*="dashboard"], [class*="plant"], [class*="station"], [class*="inverter"]', { timeout: 30000 })
                ]);
                console.log("✅ Redirecionamento detectado!");
            } catch (waitErr) {
                console.log("⚠️ Timeout aguardando redirecionamento, continuando...");
            }
            
            // Aguarda um pouco mais para garantir que a página carregou
            await page.waitForTimeout(3000);
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
            } catch (e) {
                console.log("⚠️ Timeout domcontentloaded após login, continuando...");
            }
            
            // Verifica se o login foi bem-sucedido
            const currentUrl = page.url();
            const pageContent = await page.evaluate(() => {
                return {
                    url: window.location.href,
                    title: document.title,
                    hasLoginForm: !!document.querySelector('input[type="password"]'),
                    bodyText: document.body.innerText.substring(0, 200)
                };
            });
            
            console.log("📍 URL após login:", currentUrl);
            console.log("📄 Conteúdo da página:", JSON.stringify(pageContent, null, 2));
            
            // Se ainda tem formulário de login, o login falhou
            if (pageContent.hasLoginForm && currentUrl.includes('/login')) {
                throw new Error('Login falhou - ainda na página de login');
            }
            
        } catch (loginErr) {
            console.error("❌ Erro no login:", loginErr.message);
            throw loginErr;
        }
        
        console.log("✅ Login OK. Aguardando carregamento da página...");
        
        // Aguarda a página carregar completamente
        try {
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        } catch (e) {
            console.log("⚠️ Timeout domcontentloaded, continuando...");
        }
        await page.waitForTimeout(5000);
        
        // Extrai informações da página para entender a estrutura
        const estruturaPagina = await page.evaluate(() => {
            return {
                url: window.location.href,
                title: document.title,
                hasTable: !!document.querySelector('table'),
                tableCount: document.querySelectorAll('table').length,
                hasList: !!document.querySelector('[class*="list"]'),
                hasGrid: !!document.querySelector('[class*="grid"]'),
                bodyText: document.body.innerText.substring(0, 500),
                allLinks: Array.from(document.querySelectorAll('a')).slice(0, 10).map(a => ({ text: a.textContent?.trim(), href: a.href }))
            };
        });
        
        console.log("📄 Estrutura da página:", JSON.stringify(estruturaPagina, null, 2));
        
        // Tenta encontrar a tabela ou lista de usinas/inversores
        console.log("🔍 Procurando dados das usinas/inversores...");
        
        // Aguarda por tabela ou lista
        let tabelaEncontrada = false;
        const seletoresTabela = [
            'table',
            'tbody tr',
            '[class*="table"]',
            '[class*="list"]',
            '[class*="grid"]',
            '[class*="plant"]',
            '[class*="inverter"]',
            '[class*="station"]'
        ];
        
        for (const seletor of seletoresTabela) {
            try {
                await page.waitForSelector(seletor, { timeout: 5000 });
                tabelaEncontrada = true;
                console.log(`✅ Tabela/Lista encontrada com seletor: ${seletor}`);
                break;
            } catch (e) {
                // Continua tentando
            }
        }
        
        if (!tabelaEncontrada) {
            console.log("⚠️ Tabela não encontrada automaticamente. Tentando extrair dados da página...");
        }
        
        // Função para extrair dados da página atual
        const extrairDadosPagina = async () => {
            return await page.evaluate(() => {
                const dados = [];
                
                // Tenta encontrar tabelas
                const tabelas = Array.from(document.querySelectorAll('table'));
                tabelas.forEach((tabela, idx) => {
                    const linhas = Array.from(tabela.querySelectorAll('tbody tr, tr'));
                    linhas.forEach((linha, linhaIdx) => {
                        const celulas = Array.from(linha.querySelectorAll('td, th'));
                        if (celulas.length > 0) {
                            dados.push({
                                tipo: 'tabela',
                                tabelaIndex: idx,
                                linhaIndex: linhaIdx,
                                celulas: celulas.map(c => c.textContent?.trim() || '')
                            });
                        }
                    });
                });
                
                return dados;
            });
        };
        
        // Função para encontrar botão de próxima página
        const encontrarBotaoProxima = async () => {
            const seletores = [
                'button:has-text("Próximo")',
                'button:has-text("Next")',
                'button[class*="next"]',
                '.pagination button:last-child',
                'a[class*="next"]',
                '[class*="pagination"] button:last-child',
                'button[aria-label*="next" i]',
                'button[aria-label*="próximo" i]'
            ];
            
            for (const seletor of seletores) {
                try {
                    const btn = page.locator(seletor).first();
                    const count = await btn.count();
                    if (count > 0) {
                        const isVisible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
                        if (isVisible) {
                            const isDisabled = await btn.evaluate(node => 
                                node.disabled || 
                                node.classList.contains('disabled') ||
                                node.classList.contains('is-disabled') ||
                                node.getAttribute('disabled') !== null
                            ).catch(() => false);
                            
                            if (!isDisabled) {
                                return btn;
                            }
                        }
                    }
                } catch (e) {
                    // Continua tentando
                }
            }
            
            // Tenta encontrar via JavaScript
            const botaoInfo = await page.evaluate(() => {
                const botoes = Array.from(document.querySelectorAll('button, a'));
                const botaoNext = botoes.find(b => {
                    const text = (b.textContent || '').toLowerCase();
                    const classes = (b.className || '').toLowerCase();
                    return (text.includes('próximo') || text.includes('next')) &&
                           !b.disabled &&
                           !classes.includes('disabled');
                });
                
                if (botaoNext) {
                    return {
                        encontrado: true,
                        tag: botaoNext.tagName,
                        text: botaoNext.textContent?.trim(),
                        classes: botaoNext.className
                    };
                }
                
                return { encontrado: false };
            });
            
            if (botaoInfo.encontrado) {
                // Tenta encontrar o botão novamente com base nas informações
                try {
                    return await page.locator(`button:has-text("${botaoInfo.text}"), a:has-text("${botaoInfo.text}")`).first();
                } catch (e) {
                    // Fallback
                }
            }
            
            return null;
        };
        
        let totalGeral = 0;
        let paginaAtual = 1;
        let headerCells = [];
        let idxNomePlanta = -1, idxStatus = -1, idxPotenciaTotal = -1, idxEnergiaHoje = -1, idxCidade = -1;
        const MAX_PAGINAS = 20; // Limite máximo de páginas para evitar loops infinitos
        let paginasVaziasConsecutivas = 0;
        let maxPaginaDetectada = null; // Rastreia a última página detectada
        
        // Loop de paginação
        while (paginaAtual <= MAX_PAGINAS) {
            console.log(`\n📄 Processando página ${paginaAtual}...`);
            
            // Aguarda a tabela carregar
            await page.waitForTimeout(2000);
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            } catch (e) {
                console.log("⚠️ Timeout domcontentloaded, continuando...");
            }
            
            // Extrai dados da página atual
            const dadosExtraidos = await extrairDadosPagina();
            
            if (dadosExtraidos.length === 0) {
                console.log("⚠️ Nenhum dado encontrado na página. Finalizando...");
                break;
            }
            
            // Conta quantas linhas de dados reais existem (excluindo cabeçalho)
            const linhasDadosReais = dadosExtraidos.filter(item => 
                item.tipo === 'tabela' && 
                item.celulas && 
                item.celulas.length >= 10 &&
                item.celulas[1] !== 'No.' &&
                !item.celulas.some(c => c.includes('Nome da planta'))
            );
            
            console.log(`📊 Dados extraídos da página ${paginaAtual}: ${dadosExtraidos.length} itens totais, ${linhasDadosReais.length} linhas de dados reais`);
            
            // Se não há linhas de dados reais, incrementa contador de páginas vazias
            if (linhasDadosReais.length === 0) {
                paginasVaziasConsecutivas++;
                console.log(`⚠️ Página ${paginaAtual} está vazia (sem dados reais). Páginas vazias consecutivas: ${paginasVaziasConsecutivas}`);
                
                // Se encontrou 2 páginas vazias consecutivas, para
                if (paginasVaziasConsecutivas >= 2) {
                    console.log("🏁 Encontradas 2 páginas vazias consecutivas. Finalizando paginação.");
                    break;
                }
            } else {
                // Reset contador se encontrou dados
                paginasVaziasConsecutivas = 0;
            }
            
            // Identifica o cabeçalho na primeira página
            if (paginaAtual === 1) {
                for (const item of dadosExtraidos) {
                    if (item.tipo === 'tabela' && item.celulas && 
                        item.celulas.some(c => c.includes('Nome da planta') || c.includes('Potência total'))) {
                        headerCells = item.celulas;
                        break;
                    }
                }
                
                // Função para encontrar índice da coluna
                const getColumnIndex = (searchTerms) => {
                    for (let i = 0; i < headerCells.length; i++) {
                        const cell = (headerCells[i] || '').toLowerCase();
                        if (searchTerms.some(term => cell.includes(term))) {
                            return i;
                        }
                    }
                    return -1;
                };
                
                idxNomePlanta = getColumnIndex(['nome da planta']);
                idxStatus = getColumnIndex(['status']);
                idxPotenciaTotal = getColumnIndex(['potência total', 'potencia total']);
                idxEnergiaHoje = getColumnIndex(['energia hoje']);
                idxCidade = getColumnIndex(['cidade']);
                
                console.log(`📊 Índices: Nome=${idxNomePlanta}, Status=${idxStatus}, Potência=${idxPotenciaTotal}, Energia Hoje=${idxEnergiaHoje}, Cidade=${idxCidade}`);
            }
            
            // Se não há dados reais, pula o processamento mas ainda tenta verificar se há próxima página
            if (linhasDadosReais.length === 0) {
                console.log(`⏭️ Pulando processamento da página ${paginaAtual} (sem dados reais)`);
            } else {
                // Processa as linhas de dados da página atual
                let itensProcessadosPagina = 0;
                for (const item of dadosExtraidos) {
                    if (item.tipo === 'tabela' && item.celulas && item.celulas.length >= 10) {
                        // Pula o cabeçalho
                        if (item.celulas[1] === 'No.' || item.celulas.some(c => c.includes('Nome da planta'))) {
                            continue;
                        }
                        
                        try {
                        // Extrai nome da planta (coluna 4 ou índice encontrado)
                        const nome = (idxNomePlanta >= 0 && item.celulas[idxNomePlanta]) 
                            ? item.celulas[idxNomePlanta].trim() 
                            : (item.celulas[4] || item.celulas[5] || '').trim();
                        
                        if (!nome || nome === '' || nome === 'Sem nome') {
                            continue; // Pula linhas sem nome válido
                        }
                        
                        // Extrai status (coluna 3)
                        const statusRaw = (idxStatus >= 0 && item.celulas[idxStatus]) 
                            ? item.celulas[idxStatus].trim().toLowerCase()
                            : (item.celulas[3] || 'ligado').trim().toLowerCase();
                        
                        // Extrai potência instalada (coluna 12 - "Potência total" em kWp)
                        let potenciaInstalada = null;
                        const potenciaTotalCell = (idxPotenciaTotal >= 0 && item.celulas[idxPotenciaTotal]) 
                            ? item.celulas[idxPotenciaTotal]
                            : item.celulas[12];
                        
                        if (potenciaTotalCell) {
                            const match = potenciaTotalCell.match(/(\d+[.,]?\d*)\s*kwp/i);
                            if (match) {
                                potenciaInstalada = parseFloat(match[1].replace(',', '.'));
                            }
                        }
                        
                        // Extrai energia hoje (coluna 13 - "Energia hoje" em kWh)
                        let energiaHoje = 0;
                        const energiaHojeCell = (idxEnergiaHoje >= 0 && item.celulas[idxEnergiaHoje]) 
                            ? item.celulas[idxEnergiaHoje]
                            : item.celulas[13];
                        
                        if (energiaHojeCell) {
                            const match = energiaHojeCell.match(/(\d+[.,]?\d*)\s*kwh/i);
                            if (match) {
                                energiaHoje = parseFloat(match[1].replace(',', '.'));
                            }
                        }
                        
                        // Calcula potência atual aproximada: Energia hoje (kWh) / horas decorridas do dia
                        const agora = new Date();
                        const horaBrasil = agora.toLocaleString('pt-BR', { 
                            timeZone: 'America/Sao_Paulo', 
                            hour: 'numeric', 
                            hour12: false 
                        });
                        const hora = parseInt(horaBrasil.split(':')[0]) || agora.getHours();
                        const horasDecorridas = Math.max(1, hora - 6); // Assume sol das 6h
                        const potenciaAtual = energiaHoje > 0 && horasDecorridas > 0 
                            ? energiaHoje / horasDecorridas 
                            : 0;
                        
                        // Extrai cidade (coluna 7)
                        const cidade = (idxCidade >= 0 && item.celulas[idxCidade]) 
                            ? item.celulas[idxCidade].trim()
                            : (item.celulas[7] || '').trim();
                        
                        // Calcula status baseado em eficiência (lógica de alerta)
                        let statusFinal = statusRaw === 'ligado' ? 'online' : 'offline';
                        
                        if (potenciaInstalada && potenciaInstalada > 0) {
                            const eficiencia = (potenciaAtual / potenciaInstalada) * 100;
                            
                            // Regra de Alerta: só após 14h (janela 11h–14h)
                            if (hora >= 14) {
                                if (eficiencia < 20 && potenciaAtual > 0) {
                                    statusFinal = 'alerta';
                                } else if (potenciaAtual === 0) {
                                    statusFinal = 'offline';
                                }
                            } else if (potenciaAtual === 0 && hora >= 8 && hora <= 18) {
                                statusFinal = 'offline';
                            }
                        } else if (potenciaAtual === 0 || statusRaw === 'desligado') {
                            statusFinal = 'offline';
                        }
                        
                        const dadosParaSalvar = {
                            nome_cliente: nome,
                            marca: 'Intelbras',
                            status: statusFinal,
                            potencia_kwp: potenciaInstalada,
                            potencia_atual_kw: Math.round(potenciaAtual * 100) / 100, // Arredonda para 2 decimais
                            geracao_dia_kwh: energiaHoje,
                            cidade: cidade,
                            ...(statusFinal !== 'offline' && { ultima_atualizacao: getDataHoraBrasil() })
                        };
                        
                        const { error } = await supabase.from('usinas').upsert(
                            dadosParaSalvar, 
                            { onConflict: 'nome_cliente' }
                        );
                        
                        if (error) {
                            console.error(`❌ Erro ao salvar ${nome}:`, error.message);
                        } else {
                            totalGeral++;
                            itensProcessadosPagina++;
                            if (totalGeral <= 5 || (paginaAtual === 1 && itensProcessadosPagina <= 5)) {
                                console.log(`✅ Salvo: ${nome} (${Math.round(potenciaAtual * 100) / 100}kW / ${potenciaInstalada || 'N/A'}kWp)`);
                            }
                        }
                        } catch (err) {
                            console.error(`❌ Erro ao processar item:`, err.message);
                        }
                    }
                }
                
                console.log(`✅ Página ${paginaAtual}: ${itensProcessadosPagina} itens processados`);
                
                // Se não processou nenhum item válido nesta página, para a paginação
                if (itensProcessadosPagina === 0) {
                    console.log("⚠️ Nenhum item válido processado nesta página. Finalizando paginação.");
                    break;
                }
            }
            
            // Verifica se há mais páginas antes de tentar avançar
            const infoPagina = await page.evaluate(() => {
                // Verifica se há indicadores de paginação
                const paginacao = document.querySelector('.pagination, [class*="pagination"], [class*="page"]');
                if (!paginacao) {
                    return { encontrado: false };
                }
                
                // Verifica se há botão de próxima página desabilitado
                const botoes = Array.from(paginacao.querySelectorAll('button, a'));
                const botaoNext = botoes.find(b => {
                    const text = (b.textContent || '').toLowerCase();
                    return text.includes('próximo') || text.includes('next');
                });
                
                if (botaoNext) {
                    const isDisabled = botaoNext.disabled || 
                                      botaoNext.classList.contains('disabled') ||
                                      botaoNext.classList.contains('is-disabled');
                    return { encontrado: true, temProxima: !isDisabled };
                }
                
                // Verifica números de página - busca mais agressivamente
                const todosElementos = Array.from(paginacao.querySelectorAll('*'));
                const numerosPagina = [];
                todosElementos.forEach(el => {
                    const text = el.textContent?.trim() || '';
                    const num = parseInt(text);
                    if (!isNaN(num) && num > 0 && num < 1000) { // Números razoáveis de página
                        // Verifica se é um número de página (não é parte de outro texto)
                        if (text === String(num) || /^\d+$/.test(text)) {
                            numerosPagina.push(num);
                        }
                    }
                });
                
                // Remove duplicatas e ordena
                const numerosUnicos = [...new Set(numerosPagina)].sort((a, b) => a - b);
                
                if (numerosUnicos.length > 0) {
                    const maxPagina = Math.max(...numerosUnicos);
                    // Tenta encontrar a página atual (geralmente destacada ou ativa)
                    const paginaAtualEl = todosElementos.find(el => {
                        const text = el.textContent?.trim();
                        const classes = el.className || '';
                        return (classes.includes('active') || classes.includes('current') || classes.includes('selected')) &&
                               !isNaN(parseInt(text)) && parseInt(text) > 0;
                    });
                    const paginaAtual = paginaAtualEl ? parseInt(paginaAtualEl.textContent?.trim() || '1') : numerosUnicos[0];
                    
                    return { 
                        encontrado: true, 
                        maxPagina, 
                        paginaAtual,
                        todasPaginas: numerosUnicos,
                        temProxima: paginaAtual < maxPagina
                    };
                }
                
                return { encontrado: true, temProxima: true };
            });
            
            console.log(`📄 Info paginação:`, JSON.stringify(infoPagina, null, 2));
            
            // Atualiza a última página detectada
            if (infoPagina.maxPagina) {
                if (!maxPaginaDetectada || infoPagina.maxPagina > maxPaginaDetectada) {
                    maxPaginaDetectada = infoPagina.maxPagina;
                }
                console.log(`📊 Página atual: ${paginaAtual}, Máxima detectada: ${infoPagina.maxPagina}, Última máxima conhecida: ${maxPaginaDetectada}, Todas páginas: ${infoPagina.todasPaginas?.join(', ') || 'N/A'}`);
                
                // Se chegou na última página conhecida, para
                if (paginaAtual >= infoPagina.maxPagina) {
                    console.log(`🏁 Chegou na última página conhecida (${infoPagina.maxPagina}). Finalizando.`);
                    break;
                }
            }
            
            // Se já detectou uma página máxima anteriormente e está próxima ou igual, para
            if (maxPaginaDetectada && paginaAtual >= maxPaginaDetectada) {
                console.log(`🏁 Página atual (${paginaAtual}) atingiu ou ultrapassou a última página detectada (${maxPaginaDetectada}). Finalizando.`);
                break;
            }
            
            // Se detectou que não há mais páginas, para
            if (infoPagina.encontrado && infoPagina.temProxima === false) {
                console.log("🏁 Botão de próxima página está desabilitado. Fim das páginas.");
                break;
            }
            
            // Tenta encontrar e clicar no botão de próxima página
            const btnProxima = await encontrarBotaoProxima();
            
            if (!btnProxima) {
                console.log("🏁 Nenhum botão de próxima página encontrado. Fim das páginas.");
                break;
            }
            
            // Verifica novamente se o botão está desabilitado antes de clicar
            const estaDesabilitado = await btnProxima.evaluate(node => 
                node.disabled || 
                node.classList.contains('disabled') ||
                node.classList.contains('is-disabled') ||
                node.getAttribute('disabled') !== null ||
                node.classList.contains('ant-pagination-disabled')
            ).catch(() => false);
            
            if (estaDesabilitado) {
                console.log("🏁 Botão de próxima página está desabilitado. Fim das páginas.");
                break;
            }
            
            // Clica no botão de próxima página
            try {
                const urlAntes = page.url();
                await btnProxima.scrollIntoViewIfNeeded();
                await btnProxima.click();
                console.log(`➡️ Avançando para página ${paginaAtual + 1}...`);
                
                // Aguarda a nova página carregar
                await page.waitForTimeout(2000);
                
                // Verifica se a página mudou
                await page.waitForFunction(
                    (urlAntes) => window.location.href !== urlAntes,
                    urlAntes,
                    { timeout: 5000 }
                ).catch(() => {
                    // Se não mudou a URL, aguarda um pouco mais
                    console.log("⏳ Aguardando carregamento da página...");
                });
                
                try {
                    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
                } catch (e) {
                    console.log("⚠️ Timeout domcontentloaded, continuando...");
                }
                
                // Verifica ANTES de incrementar se a próxima página tem dados
                const dadosProximaPagina = await extrairDadosPagina();
                const linhasDadosProximaPagina = dadosProximaPagina.filter(item => 
                    item.tipo === 'tabela' && 
                    item.celulas && 
                    item.celulas.length >= 10 &&
                    item.celulas[1] !== 'No.' &&
                    !item.celulas.some(c => c.includes('Nome da planta'))
                );
                
                console.log(`🔍 Verificação prévia: próxima página tem ${linhasDadosProximaPagina.length} linhas de dados reais`);
                
                // Se a próxima página não tem dados válidos, para ANTES de incrementar
                if (linhasDadosProximaPagina.length === 0) {
                    console.log("⚠️ Próxima página não tem dados válidos. Finalizando paginação.");
                    break;
                }
                
                paginaAtual++;
                
            } catch (err) {
                console.error(`❌ Erro ao clicar no botão de próxima página:`, err.message);
                console.log("🏁 Finalizando paginação devido ao erro.");
                break;
            }
        }
        
        console.log(`\n🎉 SUCESSO! Total sincronizado: ${totalGeral} usinas/inversores de ${paginaAtual} página(s)`);

    } catch (err) {
        console.error("🔴 Erro crítico:", err.message);
        console.error("Stack trace:", err.stack);
        
        if (typeof page !== 'undefined') {
            try {
                // (screenshot removido)
            } catch (_) {}
            try {
                const pageInfo = await page.evaluate(() => {
                    return {
                        url: window.location.href,
                        title: document.title,
                        bodyText: document.body.innerText.substring(0, 500),
                        hasTable: !!document.querySelector('table'),
                        rowCount: document.querySelectorAll('tr').length
                    };
                });
                console.log("📄 Informações da página no momento do erro:", JSON.stringify(pageInfo, null, 2));
            } catch (infoErr) {
                console.error("Erro ao obter informações da página:", infoErr.message);
            }
        }
    } finally {
        console.log("🏁 Processo encerrado.");
        // Fecha o browser após cada execução para liberar recursos
        try {
            if (browser) {
                await browser.close();
                console.log("🔒 Browser fechado.");
            }
        } catch (closeErr) {
            console.error("Erro ao fechar browser:", closeErr.message);
        }
    }
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.basename(process.argv[1]) === path.basename(__filename);
if (isMain) rodarRobo().catch((err) => { console.error('❌ Erro fatal:', err); process.exit(1); });
export { rodarRobo as rodarIntelbras };