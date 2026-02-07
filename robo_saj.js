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

// Função para calcular status baseado em eficiência
function calcularStatus(potenciaAtual, potenciaInstalada, statusRaw = 'online') {
    let statusFinal = statusRaw === 'ligado' || statusRaw === 'online' ? 'online' : 'offline';
    
    if (potenciaInstalada && potenciaInstalada > 0) {
        const eficiencia = (potenciaAtual / potenciaInstalada) * 100;
        const agora = new Date();
        const horaBrasil = agora.toLocaleString('pt-BR', { 
            timeZone: 'America/Sao_Paulo', 
            hour: 'numeric', 
            hour12: false 
        });
        const hora = parseInt(horaBrasil.split(':')[0]) || agora.getHours();
        
        if (hora >= 14) {
            if (eficiencia < 20 && potenciaAtual > 0) {
                statusFinal = 'alerta';
            } else if (potenciaAtual === 0) {
                statusFinal = 'offline';
            }
        } else if (potenciaAtual === 0 && hora >= 8 && hora <= 18) {
            statusFinal = 'offline';
        }
    } else if (potenciaAtual === 0 || statusRaw === 'desligado' || statusRaw === 'offline') {
        statusFinal = 'offline';
    }
    
    return statusFinal;
}

async function rodarRobo() {
    console.log("🚀 Iniciando sincronização SAJ...");
    
    const browser = await chromium.launch({ headless: ftrue }); 
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log("🔗 Acessando SAJ Plant Monitor...");
        await page.goto('https://iop.saj-electric.com/monitor/plant-monitor', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        
        // Verifica se precisa fazer login
        const precisaLogin = await page.evaluate(() => {
            // Verifica se há campos de login ou se já está logado
            const temLoginForm = !!document.querySelector('input[type="password"], input[type="text"]');
            const temBotaoLogin = !!Array.from(document.querySelectorAll('button, a')).find(b => {
                const text = (b.textContent || '').toLowerCase();
                return text.includes('login') || text.includes('entrar') || text.includes('sign in');
            });
            return temLoginForm || temBotaoLogin;
        });
        
        if (precisaLogin) {
            console.log("🔐 Realizando login...");
            
            // Aguarda campos de login aparecerem
            try {
                await page.waitForSelector('input[type="text"], input[type="email"], input:not([type]), input[type="password"]', { timeout: 10000 });
            } catch (e) {
                console.log("⚠️ Campos de login não encontrados automaticamente. Tentando continuar...");
            }
            
            // Tenta fazer login
            await page.evaluate(({ user, pass }) => {
                const inputs = Array.from(document.querySelectorAll('input'));
                const textInputs = inputs.filter(i => i.type === 'text' || i.type === 'email' || !i.type);
                const passwordInputs = inputs.filter(i => i.type === 'password');
                
                const userInput = textInputs.find(i => 
                    i.placeholder?.toLowerCase().includes('usuário') ||
                    i.placeholder?.toLowerCase().includes('user') ||
                    i.placeholder?.toLowerCase().includes('login') ||
                    i.name?.toLowerCase().includes('user') ||
                    i.id?.toLowerCase().includes('user')
                ) || textInputs[0];
                
                const passInput = passwordInputs[0];
                
                if (userInput && passInput) {
                    userInput.value = '';
                    passInput.value = '';
                    userInput.focus();
                    userInput.value = user;
                    userInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passInput.focus();
                    passInput.value = pass;
                    passInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, { user: process.env.SAJ_USER || '', pass: process.env.SAJ_PASS || '' });
            
            await page.waitForTimeout(1000);
            
            // Submete login
            const buttonClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
                const loginButton = buttons.find(b => {
                    const text = (b.textContent || b.value || '').toLowerCase();
                    return text.includes('entrar') || text.includes('login') || text.includes('sign in') || text.includes('acessar');
                });
                if (loginButton) {
                    loginButton.click();
                    return true;
                }
                return false;
            });
            
            if (!buttonClicked) {
                await page.keyboard.press('Enter');
            }
            
            await page.waitForTimeout(3000);
            
            // Aguarda redirecionamento ou mudança na página
            try {
                await page.waitForURL(url => !url.href.includes('/login') && !url.href.includes('/signin'), { timeout: 30000 }).catch(() => {});
            } catch (e) {
                console.log("⏳ Aguardando carregamento após login...");
            }
            
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            } catch (e) {
                console.log("⚠️ Timeout no domcontentloaded após login, continuando...");
            }
            await page.waitForTimeout(3000);
        }
        
        console.log("✅ Login OK (ou já estava logado).");

        // Função para extrair dados da página
        const extrairDadosPagina = async () => {
            return await page.evaluate(() => {
                const dados = [];
                
                // Tenta encontrar tabelas - busca mais agressivamente
                const tabelas = Array.from(document.querySelectorAll('table, .table, [class*="table"], [role="table"]'));
                
                // Se não encontrou, tenta encontrar por estrutura de linhas
                if (tabelas.length === 0) {
                    const linhasComTd = Array.from(document.querySelectorAll('tr:has(td)'));
                    if (linhasComTd.length > 0) {
                        // Cria uma tabela virtual
                        linhasComTd.forEach((linha, linhaIdx) => {
                            const celulas = Array.from(linha.querySelectorAll('td, th'));
                            if (celulas.length > 0) {
                                dados.push({
                                    tipo: 'tabela',
                                    tabelaIndex: 0,
                                    linhaIndex: linhaIdx,
                                    celulas: celulas.map(c => c.textContent?.trim() || '')
                                });
                            }
                        });
                        return dados;
                    }
                }
                
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

        // Aguarda a página carregar (com timeout mais flexível)
        await page.waitForTimeout(3000);
        try {
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        } catch (e) {
            console.log("⚠️ Timeout no domcontentloaded, continuando...");
        }
        await page.waitForTimeout(2000);
        
        // Configura para mostrar 100 itens por página (muito mais rápido!)
        console.log("⚙️ Configurando para 100 itens por página...");
        try {
            // 1) Element UI (SAJ usa el-pagination com "10/page" "20/page" "100/page")
            let configurado100 = false;
            const elPaginationSizes = page.locator('.el-pagination__sizes, .el-pagination .el-select').first();
            if ((await elPaginationSizes.count()) > 0) {
                try {
                    await elPaginationSizes.scrollIntoViewIfNeeded();
                    await elPaginationSizes.click();
                    await page.waitForTimeout(800);
                    const opt100 = page.locator('li.el-select-dropdown__item, .el-select-dropdown__item, [class*="select-dropdown"] li').filter({ hasText: /100\/page|100\s*\/\s*page/i }).first();
                    await opt100.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null);
                    if ((await opt100.count()) > 0) {
                        await opt100.click();
                        configurado100 = true;
                        console.log("✅ Element UI: 100/page selecionado! Aguardando recarregamento...");
                        await page.waitForTimeout(3500);
                        try {
                            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
                        } catch (e) { /* ok */ }
                        await page.waitForTimeout(1500);
                    }
                } catch (e) {
                    console.log("⚠️ Element UI 100/page:", e.message);
                }
            }
            
            if (!configurado100) {
            // Tenta encontrar o seletor de itens por página (Ant Design etc.)
            const seletorItensPorPagina = await page.evaluate(() => {
                const possiveisSeletores = [
                    '.el-pagination__sizes',
                    '.el-pagination .el-select',
                    '.ant-pagination-options-size-changer',
                    '.ant-select-selector',
                    'select.ant-pagination-options-size-changer',
                    '.pagination-size-selector',
                    '[class*="page-size"]',
                    '[class*="items-per-page"]',
                    '[class*="pagination"] select',
                    'select[class*="pagination"]'
                ];
                for (const sel of possiveisSeletores) {
                    const el = document.querySelector(sel);
                    if (el) {
                        return { seletor: sel, encontrado: true, tagName: el.tagName, classes: el.className };
                    }
                }
                const todosElementos = Array.from(document.querySelectorAll('*'));
                const elementoComNumeros = todosElementos.find(el => {
                    const text = el.innerText?.trim();
                    return text && (/^(10|20|50|100)$/.test(text) || /100.*página|100.*page/i.test(text)) &&
                        (el.tagName === 'DIV' || el.tagName === 'SPAN' || el.tagName === 'LI' || el.tagName === 'BUTTON' || el.tagName === 'SELECT') &&
                        el.offsetParent !== null;
                });
                if (elementoComNumeros) {
                    return { seletor: 'elemento-encontrado', encontrado: true, tagName: elementoComNumeros.tagName, classes: elementoComNumeros.className, text: elementoComNumeros.innerText };
                }
                return { encontrado: false };
            });
            
            console.log("🔍 Seletor de itens por página:", JSON.stringify(seletorItensPorPagina, null, 2));
            
            if (seletorItensPorPagina.encontrado) {
                // Tenta encontrar e clicar no seletor de itens por página usando Playwright
                try {
                    // Método 1: Busca pelo seletor do Ant Design ou similar
                    let selectSizeChanger = page.locator('.ant-pagination-options-size-changer').first();
                    let count = await selectSizeChanger.count();
                    
                    if (count === 0) {
                        // Tenta buscar pelo seletor que mostra o valor atual (ex: "10 / página")
                        selectSizeChanger = page.locator('.ant-select-selector, .ant-pagination-options').first();
                        count = await selectSizeChanger.count();
                    }
                    
                    if (count === 0) {
                        // Busca por elemento que contenha "/ página" ou "/ page"
                        selectSizeChanger = page.locator('*').filter({ hasText: /\/\s*página|\/\s*page/i }).first();
                        count = await selectSizeChanger.count();
                    }
                    
                    if (count === 0) {
                        // Busca por select de paginação
                        selectSizeChanger = page.locator('select[class*="pagination"], select').first();
                        count = await selectSizeChanger.count();
                    }
                    
                    if (count > 0) {
                        await selectSizeChanger.click();
                        await page.waitForTimeout(500);
                        
                        // Busca a opção "100" ou "100 / página" no dropdown
                        let opcao100 = page.locator('.ant-select-item-option').filter({ hasText: /100/ }).first();
                        let opcao100Count = await opcao100.count();
                        
                        // Se não encontrou, tenta buscar por "100 / página" ou "100/página"
                        if (opcao100Count === 0) {
                            opcao100 = page.locator('.ant-select-item-option, .ant-select-item, option').filter({ 
                                hasText: /100.*página|100.*page|^100$/i 
                            }).first();
                            opcao100Count = await opcao100.count();
                        }
                        
                        if (opcao100Count > 0) {
                            await opcao100.click();
                            console.log("✅ Configurado para 100 itens por página! Aguardando recarregamento...");
                            await page.waitForTimeout(3000);
                            try {
                                await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
                            } catch (e) {
                                console.log("⚠️ Timeout no domcontentloaded, continuando...");
                            }
                            await page.waitForTimeout(2000);
                        } else {
                            console.log("⚠️ Opção '100' não encontrada no dropdown. Tentando método alternativo...");
                            // Tenta via JavaScript com busca mais ampla
                            const configurado = await page.evaluate(() => {
                                // Busca todas as opções do dropdown
                                const opcoes = Array.from(document.querySelectorAll('.ant-select-item-option, .ant-select-item, [class*="select-item"], option'));
                                
                                // Procura por opção que contenha "100" e possivelmente "página" ou "page"
                                const opcao100 = opcoes.find(el => {
                                    const text = el.innerText?.trim().toLowerCase() || el.textContent?.trim().toLowerCase() || el.value;
                                    return text && (
                                        text === '100' || 
                                        text.includes('100') || 
                                        text.includes('100 / página') ||
                                        text.includes('100/página') ||
                                        text.includes('100 / page') ||
                                        text.includes('100/page')
                                    );
                                });
                                
                                if (opcao100) {
                                    if (opcao100.tagName === 'OPTION') {
                                        opcao100.selected = true;
                                        opcao100.dispatchEvent(new Event('change', { bubbles: true }));
                                    } else {
                                        opcao100.click();
                                    }
                                    return true;
                                }
                                return false;
                            });
                            
                            if (configurado) {
                                console.log("✅ Configurado para 100 itens por página (método JavaScript)! Aguardando recarregamento...");
                                await page.waitForTimeout(3000);
                                try {
                                    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
                                } catch (e) {
                                    console.log("⚠️ Timeout no domcontentloaded, continuando...");
                                }
                                await page.waitForTimeout(2000);
                            } else {
                                console.log("⚠️ Não foi possível encontrar a opção '100 / página'. Continuando com padrão...");
                            }
                        }
                    } else {
                        // Método 2: Busca via JavaScript direto
                        const configurado = await page.evaluate(() => {
                            // Busca qualquer elemento clicável que contenha "100"
                            const elementos = Array.from(document.querySelectorAll('*'));
                            const elemento100 = elementos.find(el => {
                                const text = el.innerText?.trim() || el.textContent?.trim();
                                return (text === '100' || text?.match(/100/)) && 
                                       (el.tagName === 'DIV' || el.tagName === 'SPAN' || el.tagName === 'LI' || el.tagName === 'BUTTON' || el.tagName === 'SELECT') &&
                                       el.offsetParent !== null; // Está visível
                            });
                            
                            if (elemento100) {
                                if (elemento100.tagName === 'SELECT') {
                                    elemento100.value = '100';
                                    elemento100.dispatchEvent(new Event('change', { bubbles: true }));
                                } else {
                                    elemento100.click();
                                }
                                return true;
                            }
                            return false;
                        });
                        
                        if (configurado) {
                            console.log("✅ Configurado para 100 itens por página (método alternativo)! Aguardando recarregamento...");
                            await page.waitForTimeout(3000);
                            try {
                                await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
                            } catch (e) {
                                console.log("⚠️ Timeout no domcontentloaded, continuando...");
                            }
                            await page.waitForTimeout(2000);
                        } else {
                            console.log("⚠️ Não foi possível configurar automaticamente. Continuando com padrão...");
                        }
                    }
                } catch (err) {
                    console.log("⚠️ Erro ao configurar itens por página:", err.message);
                    console.log("   Continuando com o padrão da página...");
                }
            } else {
                console.log("⚠️ Seletor de itens por página não encontrado. Continuando com padrão...");
                // Debug: lista todos os selects e elementos com 10/20/50/100 para inspeção
                const debugPageSize = await page.evaluate(() => {
                    const selects = Array.from(document.querySelectorAll('select')).map(s => ({
                        id: s.id,
                        name: s.name,
                        className: s.className,
                        options: Array.from(s.options || []).map(o => ({ value: o.value, text: o.textContent?.trim() })),
                        value: s.value
                    }));
                    const withNumbers = Array.from(document.querySelectorAll('span, div, button, li, a')).filter(el => {
                        const t = (el.textContent || '').trim();
                        return /^(10|20|50|100)$/.test(t) || /\d+\s*\/\s*page/i.test(t) || /\d+\s*\/\s*página/i.test(t);
                    }).slice(0, 20).map(el => ({
                        tag: el.tagName,
                        className: el.className,
                        text: (el.textContent || '').trim().substring(0, 50)
                    }));
                    return { selects, withNumbers };
                });
                console.log("🔍 Debug page-size (selects e elementos com 10/20/50/100):", JSON.stringify(debugPageSize, null, 2));
                // Tenta usar o maior page-size disponível em qualquer select
                const setMaior = await page.evaluate(() => {
                    for (const s of document.querySelectorAll('select')) {
                        const opts = Array.from(s.options || []).map(o => ({ v: parseInt(o.value, 10) || 0, el: o }));
                        const ord = opts.filter(x => x.v > 0).sort((a, b) => b.v - a.v);
                        if (ord.length && ord[0].v >= 20) {
                            s.value = String(ord[0].v);
                            s.dispatchEvent(new Event('change', { bubbles: true }));
                            return { ok: true, value: ord[0].v };
                        }
                    }
                    return { ok: false };
                });
                if (setMaior.ok) {
                    console.log("✅ Page-size definido para", setMaior.value, "itens (maior disponível). Aguardando...");
                    await page.waitForTimeout(3000);
                }
            }
            }
        } catch (err) {
            console.log("⚠️ Erro ao configurar itens por página:", err.message);
            console.log("   Continuando com o padrão da página...");
        }
        
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

        let totalGeral = 0;
        let paginaAtual = 1;
        let headerCells = [];
        let idxNomePlanta = -1, idxStatus = -1, idxPotenciaTotal = -1, idxEnergiaHoje = -1, idxCidade = -1;
        const MAX_PAGINAS = 20;
        let paginasVaziasConsecutivas = 0;
        let maxPaginaDetectada = null;

        // Loop de paginação
        while (paginaAtual <= MAX_PAGINAS) {
            console.log(`\n📄 Processando página ${paginaAtual} (SAJ)...`);
            
            await page.waitForTimeout(2000);
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            } catch (e) {
                console.log("⚠️ Timeout no domcontentloaded, continuando...");
            }
            await page.waitForTimeout(1000);
            
            const dadosExtraidos = await extrairDadosPagina();
            
            if (dadosExtraidos.length === 0) {
                console.log("⚠️ Nenhum dado encontrado. Finalizando...");
                break;
            }
            
            // Conta linhas de dados reais
            const linhasDadosReais = dadosExtraidos.filter(item => 
                item.tipo === 'tabela' && 
                item.celulas && 
                item.celulas.length >= 3 &&
                !item.celulas.some(c => c.toLowerCase().includes('nome') && c.toLowerCase().includes('planta'))
            );
            
            console.log(`📊 Dados extraídos da página ${paginaAtual}: ${dadosExtraidos.length} itens totais, ${linhasDadosReais.length} linhas de dados reais`);
            
            if (linhasDadosReais.length === 0) {
                paginasVaziasConsecutivas++;
                if (paginasVaziasConsecutivas >= 2) {
                    console.log("🏁 2 páginas vazias consecutivas. Finalizando.");
                    break;
                }
            } else {
                paginasVaziasConsecutivas = 0;
            }
            
            // Identifica cabeçalho na primeira página
            if (paginaAtual === 1) {
                for (const item of dadosExtraidos) {
                    if (item.tipo === 'tabela' && item.celulas && 
                        (item.celulas.some(c => {
                            const lower = c.toLowerCase();
                            return lower.includes('plant type') || 
                                   lower.includes('generated power') || 
                                   lower.includes('production today') ||
                                   lower.includes('plant capacity');
                        }))) {
                        headerCells = item.celulas;
                        break;
                    }
                }
                
                if (headerCells.length > 0) {
                    const getColumnIndex = (searchTerms) => {
                        for (let i = 0; i < headerCells.length; i++) {
                            const cell = (headerCells[i] || '').toLowerCase();
                            if (searchTerms.some(term => cell.includes(term))) {
                                return i;
                            }
                        }
                        return -1;
                    };
                    
                    // Baseado na estrutura da SAJ: Plant Type, Generated power, Production Today, Lifetime Production, etc.
                    idxNomePlanta = getColumnIndex(['plant type', 'plant', 'name', 'nome']);
                    idxStatus = getColumnIndex(['status', 'estado', 'state', 'offline', 'normal', 'alarm']);
                    idxPotenciaTotal = getColumnIndex(['plant capacity', 'capacity', 'potência', 'kwp']);
                    idxEnergiaHoje = getColumnIndex(['production today', 'production', 'energia hoje', 'energy', 'kwh']);
                    idxCidade = getColumnIndex(['country', 'cidade', 'city', 'brazil']);
                    
                    console.log(`📊 Índices: Nome=${idxNomePlanta}, Status=${idxStatus}, Potência=${idxPotenciaTotal}, Energia Hoje=${idxEnergiaHoje}, Cidade=${idxCidade}`);
                    console.log(`📋 Headers encontrados:`, headerCells);
                }
            }
            
            // Prepara todos os dados da página para batch
            const usinasParaSalvar = [];
            const leiturasTemp = []; // Para guardar dados de leitura temporariamente
            
            for (const item of dadosExtraidos) {
                if (item.tipo === 'tabela' && item.celulas && item.celulas.length >= 3) {
                    // Pula cabeçalho
                    if (item.celulas.some(c => {
                        const lower = c.toLowerCase();
                        return lower.includes('plant type') || 
                               lower.includes('generated power') || 
                               lower.includes('production today') ||
                               lower.includes('lifetime production');
                    })) {
                        continue;
                    }
                    
                    const nome = (idxNomePlanta >= 0 && item.celulas[idxNomePlanta]) 
                        ? item.celulas[idxNomePlanta].trim() 
                        : (item.celulas[0] || item.celulas[1] || '').trim();
                    
                    let nomeUsar = nome;
                    if (!nome || nome === '' || nome === 'Sem nome' || nome === 'On-Grid' || nome === 'Off-Grid') {
                        const nomeAlternativo = item.celulas.find(c => c && c.length > 3 && c.length < 100 && 
                            !c.toLowerCase().includes('on-grid') && 
                            !c.toLowerCase().includes('off-grid') &&
                            !c.toLowerCase().includes('w') &&
                            !c.toLowerCase().includes('kwh') &&
                            !c.toLowerCase().includes('brazil') &&
                            !c.toLowerCase().includes('h') &&
                            !c.toLowerCase().includes('%'));
                        
                        if (nomeAlternativo && nomeAlternativo.trim() !== '') {
                            nomeUsar = nomeAlternativo.trim();
                        } else {
                            continue;
                        }
                    }
                    
                    // Extrai potência atual
                    let potenciaAtual = 0;
                    const potenciaAtualCell = item.celulas.find(c => c && (c.includes('W') || c.includes('kW')));
                    if (potenciaAtualCell) {
                        const match = potenciaAtualCell.match(/(\d+[.,]?\d*)\s*(w|kw)/i);
                        if (match) {
                            let valor = parseFloat(match[1].replace(',', '.'));
                            if (match[2].toLowerCase() === 'w') valor = valor / 1000;
                            potenciaAtual = valor;
                        }
                    }
                    
                    // Extrai potência instalada
                    let potenciaInstalada = null;
                    const potenciaTotalCell = (idxPotenciaTotal >= 0 && item.celulas[idxPotenciaTotal]) 
                        ? item.celulas[idxPotenciaTotal]
                        : item.celulas.find(c => c && c.toLowerCase().includes('kwp'));
                    
                    if (potenciaTotalCell) {
                        const match = potenciaTotalCell.match(/(\d+[.,]?\d*)\s*kwp/i);
                        if (match) {
                            potenciaInstalada = parseFloat(match[1].replace(',', '.'));
                        } else {
                            const match2 = potenciaTotalCell.match(/(\d+[.,]?\d*)/);
                            if (match2 && potenciaTotalCell.toLowerCase().includes('kwp')) {
                                potenciaInstalada = parseFloat(match2[1].replace(',', '.'));
                            }
                        }
                    }
                    
                    // Extrai energia hoje
                    let energiaHoje = 0;
                    const energiaHojeCell = (idxEnergiaHoje >= 0 && item.celulas[idxEnergiaHoje]) 
                        ? item.celulas[idxEnergiaHoje]
                        : item.celulas.find(c => c && c.toLowerCase().includes('kwh') && !c.toLowerCase().includes('lifetime'));
                    
                    if (energiaHojeCell) {
                        const match = energiaHojeCell.match(/(\d+[.,]?\d*)\s*kwh/i);
                        if (match) energiaHoje = parseFloat(match[1].replace(',', '.'));
                    }
                    
                    // Calcula potência se não encontrou
                    if (potenciaAtual === 0 && energiaHoje > 0) {
                        const agora = new Date();
                        const horaBrasil = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
                        const hora = parseInt(horaBrasil.split(':')[0]) || agora.getHours();
                        potenciaAtual = energiaHoje / Math.max(1, hora - 6);
                    }
                    
                    const cidade = (idxCidade >= 0 && item.celulas[idxCidade]) 
                        ? item.celulas[idxCidade].trim()
                        : (item.celulas.find(c => c && c.toLowerCase().includes('brazil')) || 'Brazil').trim();
                    
                    let statusRaw = potenciaAtual === 0 ? 'offline' : 'online';
                    const statusFinal = calcularStatus(potenciaAtual, potenciaInstalada, statusRaw);
                    
                    usinasParaSalvar.push({
                        nome_cliente: nomeUsar,
                        marca: 'SAJ',
                        status: statusFinal,
                        potencia_kwp: potenciaInstalada,
                        potencia_atual_kw: Math.round(potenciaAtual * 100) / 100,
                        geracao_dia_kwh: energiaHoje,
                        cidade: cidade,
                        ...(statusFinal !== 'offline' && { ultima_atualizacao: getDataHoraBrasil() })
                    });
                    
                    leiturasTemp.push({
                        nome_cliente: nomeUsar,
                        potencia_atual_kw: Math.round(potenciaAtual * 100) / 100,
                        geracao_dia_kwh: energiaHoje
                    });
                }
            }
            
            let itensProcessadosPagina = 0;
            
            // Remove duplicatas (mantém a primeira ocorrência de cada nome_cliente)
            const nomesVistos = new Set();
            const usinasUnicas = usinasParaSalvar.filter(u => {
                if (nomesVistos.has(u.nome_cliente)) return false;
                nomesVistos.add(u.nome_cliente);
                return true;
            });
            const leiturasUnicas = leiturasTemp.filter(l => nomesVistos.has(l.nome_cliente));
            
            // BATCH 1: Upsert todas as usinas de uma vez
            if (usinasUnicas.length > 0) {
                console.log(`   💾 Salvando ${usinasUnicas.length} usinas em batch (${usinasParaSalvar.length - usinasUnicas.length} duplicatas removidas)...`);
                const { error: upsertError } = await supabase
                    .from('usinas')
                    .upsert(usinasUnicas, { onConflict: 'nome_cliente' });
                
                if (!upsertError) {
                    // BATCH 2: Busca todos os IDs de uma vez
                    const nomes = usinasUnicas.map(u => u.nome_cliente);
                    const { data: usinasData } = await supabase
                        .from('usinas')
                        .select('id, nome_cliente')
                        .in('nome_cliente', nomes);
                    
                    if (usinasData && usinasData.length > 0) {
                        // Prepara leituras com IDs
                        const leiturasParaSalvar = [];
                        const dataHora = getDataHoraBrasil();
                        
                        for (const usina of usinasData) {
                            const leituraTemp = leiturasUnicas.find(l => l.nome_cliente === usina.nome_cliente);
                            if (leituraTemp) {
                                leiturasParaSalvar.push({
                                    usina_id: usina.id,
                                    data_hora: dataHora,
                                    potencia_atual_kw: leituraTemp.potencia_atual_kw,
                                    geracao_dia_kwh: leituraTemp.geracao_dia_kwh
                                });
                            }
                        }
                        
                        // BATCH 3: Insere todas as leituras de uma vez
                        if (leiturasParaSalvar.length > 0) {
                            const { error: insertError } = await supabase.from('leituras_diarias').insert(leiturasParaSalvar);
                            if (insertError) {
                                console.log(`⚠️ Erro ao salvar leituras: ${insertError.message}`);
                            }
                        }
                        
                        itensProcessadosPagina = usinasData.length;
                        totalGeral += itensProcessadosPagina;
                        console.log(`   ✅ ${itensProcessadosPagina} usinas salvas!`);
                    }
                } else {
                    console.error(`❌ Erro no batch upsert:`, upsertError.message);
                }
            }
            
            if (itensProcessadosPagina === 0 && linhasDadosReais.length === 0) {
                console.log("⚠️ Nenhum item processado. Finalizando.");
                break;
            }
            
            // Verifica paginação e tenta avançar
            const infoPagina = await page.evaluate(() => {
                const paginacao = document.querySelector('.pagination, [class*="pagination"], [class*="el-pager"]');
                const botoes = paginacao ? Array.from(paginacao.querySelectorAll('button, a, span, div, li')) : [];
                const botaoNext = botoes.find(b => {
                    const text = (b.textContent || '').trim().toLowerCase();
                    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                    const cls = (b.className || '').toLowerCase();
                    return text === '>' || text === '»' || text.includes('next') || text.includes('próximo') ||
                           aria.includes('next') || aria.includes('próximo') || cls.includes('next');
                });
                const numeros = botoes.filter(b => {
                    const t = (b.textContent || '').trim();
                    const n = parseInt(t, 10);
                    return !isNaN(n) && n >= 1 && n <= 999 && t === String(n);
                }).map(b => parseInt(b.textContent.trim(), 10));
                const maxPag = numeros.length ? Math.max(...numeros) : 0;
                return {
                    encontrado: !!paginacao,
                    temProxima: botaoNext ? !(botaoNext.disabled || botaoNext.classList.contains('disabled') || botaoNext.getAttribute('disabled')) : null,
                    temNumeros: numeros.length > 0,
                    maxPagina: maxPag,
                    numeros: [...new Set(numeros)].sort((a, b) => a - b).slice(0, 15)
                };
            });
            
            console.log("📄 Paginação:", JSON.stringify(infoPagina));
            
            let avancou = false;
            
            // 1) Tenta botão Next / Próximo / > / »
            const selNext = [
                'button:has-text("Next")',
                'button:has-text("Próximo")',
                'a:has-text("Next")',
                'a:has-text("Próximo")',
                '[aria-label*="next" i]',
                '[aria-label*="próximo" i]',
                '[class*="pagination"] button:has-text(">")',
                '[class*="pagination"] a:has-text(">")',
                '[class*="pagination"] [class*="next"]:not(.disabled)',
                'button:has-text(">")',
                'a:has-text(">")'
            ];
            for (const sel of selNext) {
                try {
                    const btn = page.locator(sel).first();
                    if ((await btn.count()) > 0) {
                        const dis = await btn.evaluate(n => n.disabled || n.classList.contains('disabled') || n.getAttribute('disabled')).catch(() => true);
                        if (!dis) {
                            await btn.scrollIntoViewIfNeeded();
                            await btn.click();
                            avancou = true;
                            console.log("➡️ Avançou (seletor):", sel);
                            break;
                        }
                    }
                } catch (e) { /* next */ }
                if (avancou) break;
            }
            
            // 2) Fallback: clicar no número da próxima página (ex.: 2)
            if (!avancou && infoPagina.numeros && infoPagina.numeros.length > 0) {
                const prox = paginaAtual + 1;
                if (infoPagina.numeros.includes(prox)) {
                    try {
                        const btnNum = page.locator('.pagination button, .pagination a, [class*="pagination"] button, [class*="pagination"] a, [class*="el-pager"] button, [class*="el-pager"] a').filter({ hasText: new RegExp(`^${prox}$`) }).first();
                        if ((await btnNum.count()) > 0) {
                            await btnNum.scrollIntoViewIfNeeded();
                            await btnNum.click();
                            avancou = true;
                            console.log("➡️ Avançou (página número):", prox);
                        }
                    } catch (e) { /* ok */ }
                }
            }
            
            // 3) Fallback: evaluate clicando em elemento com ">" ou "next"
            if (!avancou) {
                avancou = await page.evaluate(() => {
                    const cand = Array.from(document.querySelectorAll('button, a, span, div, li'));
                    const n = cand.find(el => {
                        const t = (el.textContent || '').trim();
                        const a = (el.getAttribute('aria-label') || '').toLowerCase();
                        const c = (el.className || '').toLowerCase();
                        const isNext = t === '>' || t === '»' || t.toLowerCase().includes('next') || a.includes('next') || c.includes('next');
                        const ok = !el.disabled && !el.classList.contains('disabled') && el.getAttribute('disabled') == null;
                        return isNext && ok && el.offsetParent != null;
                    });
                    if (n) { n.click(); return true; }
                    return false;
                });
                if (avancou) console.log("➡️ Avançou (evaluate)");
            }
            
            if (!avancou) {
                if (infoPagina.encontrado && infoPagina.temProxima === false) {
                    console.log("🏁 Fim das páginas (Next desabilitado).");
                } else if (infoPagina.maxPagina && paginaAtual >= infoPagina.maxPagina) {
                    console.log("🏁 Última página atingida.");
                } else {
                    console.log("🏁 Não foi possível avançar para próxima página. Finalizando.");
                }
                break;
            }
            
            paginaAtual++;
            await page.waitForTimeout(3000);
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            } catch (e) {
                console.log("⚠️ Timeout domcontentloaded, continuando...");
            }
            await page.waitForTimeout(1000);
        }

        console.log(`\n🎉 SAJ: ${totalGeral} usinas sincronizadas`);

    } catch (err) {
        console.error("🔴 Erro no robô SAJ:", err.message);
        console.error("Stack trace:", err.stack);
        
        if (typeof page !== 'undefined') {
            // (screenshot removido)
        }
    } finally {
        console.log("🏁 Processo encerrado.");
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
export { rodarRobo as rodarSaj };