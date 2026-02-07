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
    console.log("🚀 Iniciando sincronização Canadian Solar...");
    
    const browser = await chromium.launch({ headless: true }); 
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log("🔗 Acessando Canadian Solar Smart Energy...");
        await page.goto('https://smartenergy-gl.csisolar.com/dist/index.html#/login', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);
        
        // PASSO 1: Selecionar servidor internacional no modal
        console.log("🌍 Selecionando servidor internacional...");
        
        // Aguarda o modal de seleção de local aparecer
        await page.waitForTimeout(2000);
        
        // Clica na opção "Servidor internacional"
        const selecionouInternacional = await page.evaluate(() => {
            // Busca todos os elementos que podem conter "Servidor internacional"
            const elementos = Array.from(document.querySelectorAll('div, span, label, p, li'));
            
            for (const el of elementos) {
                const text = (el.textContent || '').trim();
                // Busca texto que começa com "Servidor internacional"
                if (text.startsWith('Servidor internacional') || text === 'Servidor internacional') {
                    // Clica no elemento ou no pai (pode ser um radio button ou card)
                    const parent = el.closest('div[class*="option"], div[class*="item"], div[class*="card"], label') || el.parentElement || el;
                    parent.click();
                    return { clicked: true, text: text.substring(0, 50) };
                }
            }
            
            // Tenta também por "international" em inglês
            for (const el of elementos) {
                const text = (el.textContent || '').toLowerCase();
                if (text.includes('international') && !text.includes('chinês') && !text.includes('emea')) {
                    const parent = el.closest('div[class*="option"], div[class*="item"], div[class*="card"], label') || el.parentElement || el;
                    parent.click();
                    return { clicked: true, text: el.textContent?.substring(0, 50) };
                }
            }
            
            return { clicked: false };
        });
        console.log("🌍 Servidor internacional:", JSON.stringify(selecionouInternacional));
        
        await page.waitForTimeout(1000);
        
        // Clica no botão "confirme" ou "Confirmar"
        const confirmou = await page.evaluate(() => {
            const botoes = Array.from(document.querySelectorAll('button, [class*="btn"], a'));
            
            for (const btn of botoes) {
                const text = (btn.textContent || '').trim().toLowerCase();
                if (text === 'confirme' || text === 'confirmar' || text === 'confirm' || text === 'ok') {
                    btn.click();
                    return { clicked: true, text: btn.textContent?.trim() };
                }
            }
            
            return { clicked: false };
        });
        console.log("✅ Confirmação:", JSON.stringify(confirmou));
        
        await page.waitForTimeout(3000);
        
        // PASSO 2: Fazer login
        console.log("🔐 Realizando login...");
        
        // Aguarda campos de login
        try {
            await page.waitForSelector('input[type="password"]', { timeout: 15000 });
        } catch (e) {
            console.log("⚠️ Campo de senha não encontrado. Tentando continuar...");
        }
        
        // Debug: mostra todos os inputs
        const debugInputs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('input')).map((i, idx) => ({
                idx,
                type: i.type,
                name: i.name,
                id: i.id,
                placeholder: i.placeholder,
                visible: i.offsetParent !== null
            }));
        });
        console.log("📋 Inputs encontrados:", JSON.stringify(debugInputs, null, 2));
        
        // Preenche credenciais via JavaScript (mais confiável para campos com readonly)
        const user = process.env.CANADIAN_USER || '';
        const pass = process.env.CANADIAN_PASS || '';
        
        {
            
            // Fallback: preenche via evaluate - busca campo com placeholder correto
            const loginPreenchido = await page.evaluate(({ user, pass }) => {
                const inputs = Array.from(document.querySelectorAll('input'));
                
                // Campo de usuário: PRIORIZA o que tem placeholder específico
                let userInput = inputs.find(i => 
                    i.placeholder && (
                        i.placeholder.toLowerCase().includes('usuário') ||
                        i.placeholder.toLowerCase().includes('user') ||
                        i.placeholder.toLowerCase().includes('email') ||
                        i.placeholder.toLowerCase().includes('celular') ||
                        i.placeholder.toLowerCase().includes('conta')
                    ) && !i.readOnly
                );
                
                // Se não encontrou, pega input de texto que NÃO é readonly
                if (!userInput) {
                    userInput = inputs.find(i => 
                        (i.type === 'text' || i.type === 'email') && 
                        !i.readOnly && 
                        i.offsetParent !== null
                    );
                }
                
                // Campo de senha
                const passInput = inputs.find(i => i.type === 'password');
                
                if (userInput && passInput) {
                    // Preenche usuário
                    userInput.focus();
                    userInput.value = user;
                    userInput.dispatchEvent(new Event('input', { bubbles: true }));
                    userInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Preenche senha
                    passInput.focus();
                    passInput.value = pass;
                    passInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    return { 
                        success: true, 
                        userPlaceholder: userInput.placeholder,
                        passType: passInput.type
                    };
                }
                return { success: false };
            }, { user, pass });
            console.log("📝 Login preenchido:", JSON.stringify(loginPreenchido));
        }
        
        // Clica no botão de login - busca especificamente o botão "Entrar"
        // Primeiro tenta via Playwright locator
        let botaoClicado = { clicked: false };
        
        try {
            // Tenta encontrar botão com texto "Entrar" ou "Login"
            const btnEntrar = page.locator('button').filter({ hasText: /^Entrar$|^Login$|^Sign in$/i }).first();
            if ((await btnEntrar.count()) > 0) {
                await btnEntrar.click();
                botaoClicado = { clicked: true, method: 'locator-button' };
            }
        } catch (e) {
            // Ignora erro e tenta via evaluate
        }
        
        if (!botaoClicado.clicked) {
            botaoClicado = await page.evaluate(() => {
                // Busca botões especificamente
                const buttons = Array.from(document.querySelectorAll('button'));
                
                // Primeiro, busca botão com texto exato "Entrar"
                for (const btn of buttons) {
                    const text = (btn.textContent || '').trim();
                    if (text === 'Entrar' || text === 'Login' || text === 'Sign in' || text === 'Log in') {
                        btn.click();
                        return { clicked: true, text: text, method: 'exact-match' };
                    }
                }
                
                // Se não encontrou, busca por botão que contenha
                for (const btn of buttons) {
                    const text = (btn.textContent || '').trim().toLowerCase();
                    if (text.includes('entrar') || text.includes('login') || text.includes('sign in')) {
                        // Verifica se não é um link/texto muito grande
                        if (text.length < 30) {
                            btn.click();
                            return { clicked: true, text: btn.textContent?.trim(), method: 'contains' };
                        }
                    }
                }
                
                // Tenta input submit
                const submits = Array.from(document.querySelectorAll('input[type="submit"]'));
                if (submits.length > 0) {
                    submits[0].click();
                    return { clicked: true, method: 'submit' };
                }
                
                return { clicked: false };
            });
        }
        
        console.log("🔘 Botão de login:", JSON.stringify(botaoClicado));
        
        if (!botaoClicado.clicked) {
            console.log("⚠️ Botão de login não encontrado. Tentando Enter...");
            await page.keyboard.press('Enter');
        }
        
        console.log("⏳ Aguardando redirecionamento após login...");
        await page.waitForTimeout(5000);
        
        // Aguarda mudança de URL ou carregamento
        try {
            await page.waitForURL(url => !url.href.includes('/login'), { timeout: 30000 });
        } catch (e) {
            console.log("⚠️ Timeout aguardando redirecionamento. Verificando se login foi bem-sucedido...");
        }
        
        await page.waitForTimeout(3000);
        console.log("✅ Login OK.");
        
        // PASSO 3: Clicar em "Plantas"
        console.log("🌱 Navegando para lista de plantas...");
        
        // Debug: mostra estrutura da página após login
        const estruturaAposLogin = await page.evaluate(() => {
            return {
                url: window.location.href,
                menus: Array.from(document.querySelectorAll('a, [class*="menu"], [class*="nav"] *')).slice(0, 30).map(el => ({
                    tag: el.tagName,
                    text: (el.textContent || '').trim().substring(0, 40),
                    href: el.href || ''
                })).filter(m => m.text.length > 0 && m.text.length < 40)
            };
        });
        console.log("📄 Menus encontrados:", JSON.stringify(estruturaAposLogin.menus.slice(0, 15), null, 2));
        
        // Clica em "Plantas" no menu lateral
        let clicouPlantas = { clicked: false };
        
        // Aguarda menu carregar
        await page.waitForTimeout(2000);
        
        // Método 1: Playwright locator
        try {
            const menuPlantas = page.locator('li').filter({ hasText: /^Plantas$/ }).first();
            if ((await menuPlantas.count()) > 0) {
                await menuPlantas.click();
                clicouPlantas = { clicked: true, method: 'locator-li' };
            }
        } catch (e) { /* ignora */ }
        
        // Método 2: Via JavaScript - mais específico
        if (!clicouPlantas.clicked) {
            clicouPlantas = await page.evaluate(() => {
                // Busca LI com texto exato "Plantas"
                const lis = Array.from(document.querySelectorAll('li'));
                for (const li of lis) {
                    // Verifica se o texto direto do LI é "Plantas"
                    const textoLi = (li.textContent || '').trim();
                    if (textoLi === 'Plantas') {
                        li.click();
                        return { clicked: true, method: 'li-exact' };
                    }
                }
                
                // Busca dentro do menu lateral (geralmente tem classe com "menu" ou "nav")
                const menuLateral = document.querySelector('[class*="menu"], [class*="sidebar"], [class*="nav"]');
                if (menuLateral) {
                    const itens = menuLateral.querySelectorAll('li, a, span, div');
                    for (const item of itens) {
                        const texto = (item.textContent || '').trim();
                        if (texto === 'Plantas' || texto === 'Plants') {
                            item.click();
                            return { clicked: true, method: 'menu-lateral' };
                        }
                    }
                }
                
                return { clicked: false };
            });
        }
        
        // Se ainda não clicou, tenta clicar por coordenadas baseado no screenshot
        if (!clicouPlantas.clicked) {
            console.log("⚠️ Não encontrou 'Plantas' no menu. Tentando via texto...");
            try {
                await page.getByText('Plantas', { exact: true }).first().click();
                clicouPlantas = { clicked: true, method: 'getByText' };
            } catch (e) {
                console.log("⚠️ getByText falhou:", e.message);
            }
        }
        
        console.log("🌱 Clique em plantas:", JSON.stringify(clicouPlantas));
        
        // Aguarda a tabela de plantas carregar
        await page.waitForTimeout(5000);
        
        // Verifica se está na página correta (deve ter "Capacidade instalada" ou "Estado da estação")
        const paginaCorreta = await page.evaluate(() => {
            const texto = document.body.innerText;
            return texto.includes('Capacidade instalada') || texto.includes('Estado da estação') || texto.includes('Geração de energia');
        });
        
        if (!paginaCorreta) {
            console.log("⚠️ Página de plantas não carregou corretamente. Tentando novamente...");
            // Tenta clicar novamente
            try {
                await page.getByText('Plantas', { exact: true }).first().click();
                await page.waitForTimeout(5000);
            } catch (e) { /* ignora */ }
        }
        
        // PASSO 4: Ajustar para 100/página
        console.log("⚙️ Configurando para 100 itens por página...");
        
        // Tenta encontrar seletor de itens por página
        let configurou100 = false;
        
        // Método 1: Element UI ou similar
        const seletorPagina = page.locator('.el-pagination__sizes, .el-pagination .el-select, [class*="page-size"], [class*="pagination"] select').first();
        if ((await seletorPagina.count()) > 0) {
            try {
                await seletorPagina.click();
                await page.waitForTimeout(800);
                
                const opt100 = page.locator('li, option, [class*="item"]').filter({ hasText: /^100$|100\/|100 / }).first();
                if ((await opt100.count()) > 0) {
                    await opt100.click();
                    configurou100 = true;
                    console.log("✅ 100/página selecionado! Aguardando 20s para carregar...");
                    await page.waitForTimeout(20000);
                    try {
                        await page.waitForLoadState('networkidle', { timeout: 10000 });
                    } catch (e) { /* ok */ }
                }
            } catch (e) {
                console.log("⚠️ Erro ao configurar 100/página:", e.message);
            }
        }
        
        // Método 2: via JavaScript
        if (!configurou100) {
            const config100JS = await page.evaluate(() => {
                // Busca por dropdown de paginação
                const dropdowns = Array.from(document.querySelectorAll('select, [class*="select"], [class*="dropdown"]'));
                for (const dd of dropdowns) {
                    if (dd.tagName === 'SELECT') {
                        const options = Array.from(dd.options);
                        const opt100 = options.find(o => o.value === '100' || o.textContent?.includes('100'));
                        if (opt100) {
                            dd.value = opt100.value;
                            dd.dispatchEvent(new Event('change', { bubbles: true }));
                            return { success: true, method: 'select' };
                        }
                    }
                }
                
                // Busca por elementos clicáveis com 100
                const elementos = Array.from(document.querySelectorAll('span, div, li, button'));
                const el100 = elementos.find(el => {
                    const text = (el.textContent || '').trim();
                    return text === '100' || text === '100/页' || text === '100/page';
                });
                if (el100) {
                    el100.click();
                    return { success: true, method: 'click' };
                }
                
                return { success: false };
            });
            
            if (config100JS.success) {
                configurou100 = true;
                console.log("✅ 100/página configurado via JS:", config100JS.method);
                await page.waitForTimeout(3000);
            }
        }
        
        if (!configurou100) {
            console.log("⚠️ Não foi possível configurar 100/página. Continuando com padrão...");
        }
        
        console.log("✅ Pronto para extrair dados...");
        
        // Função para extrair dados da página
        const extrairDadosPagina = async () => {
            return await page.evaluate(() => {
                const dados = [];
                const tabelas = Array.from(document.querySelectorAll('table'));
                
                // Encontra a tabela principal (com mais colunas e linhas)
                let tabelaPrincipal = null;
                let tabelaNomes = null;
                
                for (const tabela of tabelas) {
                    const linhas = tabela.querySelectorAll('tr');
                    const colunas = linhas[0]?.querySelectorAll('td, th').length || 0;
                    
                    if (linhas.length > 10 && colunas >= 10) {
                        tabelaPrincipal = tabela;
                    }
                    // Tabela com 2 colunas = checkbox + nome (colunas fixas VXE Table)
                    if (linhas.length > 10 && colunas === 2) {
                        tabelaNomes = tabela;
                    }
                }
                
                if (!tabelaPrincipal) {
                    // Fallback: pega a maior tabela
                    tabelaPrincipal = tabelas.reduce((a, b) => 
                        a.querySelectorAll('tr').length > b.querySelectorAll('tr').length ? a : b
                    , tabelas[0]);
                }
                
                if (!tabelaPrincipal) return dados;
                
                // Extrai nomes da tabela de nomes (2 colunas: checkbox | nome+endereço)
                const nomesPorLinha = {};
                function parseNome(str) {
                    if (!str || !str.trim()) return '';
                    let s = str.trim();
                    // Endereço começa com Rua/Av/Rod/BR etc. → usa só o que está antes
                    const pref = ['Rua ', 'Av. ', 'Avenida ', 'Rod. ', 'BR-', 'Trav. ', 'Praça ', 'Al. '];
                    let idx = -1;
                    for (const p of pref) {
                        const i = s.indexOf(p);
                        if (i > 1 && (idx < 0 || i < idx)) idx = i;
                    }
                    if (idx > 1) return s.substring(0, idx).trim();
                    // Remove " CIDADE / UF" no final (ex: " BREJO SANTO / CE")
                    const m = s.match(/\s+([A-ZÀ-Ú][A-Za-zÀ-ú\s]+\s*\/\s*[A-Z]{2})\s*$/);
                    if (m) return s.substring(0, s.length - m[0].length).trim();
                    // Remove cidade em maiúsculas no final: " PENAFORTE" ou "2000kwPENAFORTE"
                    const cap = s.match(/\s+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]{2,})\s*$/);
                    if (cap && /^[A-ZÀ-Ú\s]+$/.test(cap[1].trim())) return s.substring(0, s.length - cap[0].length).trim();
                    const kwCity = s.match(/(\d+kw)([A-ZÀ-Ú]{2,})\s*$/i);
                    if (kwCity) return s.substring(0, s.length - kwCity[2].length).trim();
                    return s;
                }
                function extrairNomeDaCelula(celula) {
                    const inner = celula.querySelector('.commonFlexC div, .commonFlexC');
                    if (inner) {
                        for (const el of inner.children) {
                            if (el.tagName === 'IMG') continue;
                            let t = (el.textContent || '').trim();
                            const firstLine = t.split(/\s*\n\s*/)[0] || t;
                            t = firstLine.length >= 2 && firstLine.length <= 80 ? firstLine : t;
                            if (t.length >= 2 && t.length <= 80) return parseNome(t) || t;
                        }
                        const first = inner.childNodes[0];
                        if (first && first.nodeType === 3) {
                            const t = (first.textContent || '').trim().split(/\s*\n\s*/)[0];
                            if (t.length >= 2) return parseNome(t) || t;
                        }
                    }
                    const texto = (celula.textContent || '').trim();
                    const primeiralinha = texto.split(/\s*\n\s*/)[0];
                    return parseNome(primeiralinha || texto) || (primeiralinha || texto);
                }
                if (tabelaNomes) {
                    const linhasNomes = Array.from(tabelaNomes.querySelectorAll('tr'));
                    linhasNomes.forEach((linha, idx) => {
                        const celulas = linha.querySelectorAll('td, th');
                        if (celulas.length >= 2) {
                            const nome = extrairNomeDaCelula(celulas[1]);
                            if (nome.length >= 2) nomesPorLinha[idx] = nome;
                        }
                    });
                }
                
                // Extrai dados da tabela principal
                const linhas = Array.from(tabelaPrincipal.querySelectorAll('tr'));
                linhas.forEach((linha, linhaIdx) => {
                    const celulas = Array.from(linha.querySelectorAll('td, th'));
                    if (celulas.length >= 3) {
                        const celulasTexto = celulas.map(c => (c.textContent || '').trim());
                        
                        // Adiciona o nome da tabela de nomes (se existir)
                        if (nomesPorLinha[linhaIdx]) {
                            celulasTexto[1] = nomesPorLinha[linhaIdx];
                        }
                        
                        dados.push({
                            tipo: 'tabela',
                            tabelaIndex: 0,
                            linhaIndex: linhaIdx,
                            celulas: celulasTexto
                        });
                    }
                });
                
                return dados;
            });
        };
        
        // PASSO 5: Coletar dados das usinas
        let totalGeral = 0;
        let paginaAtual = 1;
        let headerCells = [];
        let idxNome = -1, idxPotenciaAtual = -1, idxPotenciaInstalada = -1, idxEnergiaHoje = -1, idxStatus = -1;
        const MAX_PAGINAS = 20;
        
        // Loop de paginação
        while (paginaAtual <= MAX_PAGINAS) {
            console.log(`\n📄 Processando página ${paginaAtual} (Canadian)...`);
            
            await page.waitForTimeout(2000);
            
            const dadosExtraidos = await extrairDadosPagina();
            console.log(`📊 Dados extraídos: ${dadosExtraidos.length} linhas`);
            
            if (paginaAtual === 1 && dadosExtraidos.length > 0) {
                const amostra = dadosExtraidos.slice(0, 5).map((it, i) =>
                    `[${i}] ${(it.celulas?.[1] ?? it.celulas?.[0] ?? '').toString().substring(0, 35)}`
                ).join(' | ');
                console.log("📋 Amostra:", amostra);
            }
            
            if (dadosExtraidos.length === 0) {
                console.log("⚠️ Nenhum dado encontrado. Finalizando...");
                break;
            }
            
            // Identifica cabeçalho na primeira página
            if (paginaAtual === 1) {
                for (const item of dadosExtraidos) {
                    if (item.tipo === 'tabela' && item.celulas && 
                        item.celulas.some(c => {
                            const lower = (c || '').toLowerCase();
                            return lower.includes('name') || lower.includes('power') || lower.includes('capacity') || lower.includes('status');
                        })) {
                        headerCells = item.celulas;
                        break;
                    }
                }
                
                if (headerCells.length > 0) {
                    console.log("📋 Headers encontrados:", headerCells);
                    
                    const getColumnIndex = (searchTerms) => {
                        for (let i = 0; i < headerCells.length; i++) {
                            const cell = (headerCells[i] || '').toLowerCase();
                            if (searchTerms.some(term => cell.includes(term))) {
                                return i;
                            }
                        }
                        return -1;
                    };
                    
                    // Índices baseados na estrutura Canadian Solar
                    idxNome = getColumnIndex(['nome da estação', 'station name', 'name', 'nome', 'estação']);
                    idxStatus = getColumnIndex(['estado da estação', 'station status', 'status', 'state', 'estado']);
                    idxPotenciaInstalada = getColumnIndex(['capacidade instalada', 'installed capacity', 'capacity', 'capacidade']);
                    idxPotenciaAtual = getColumnIndex(['geração de energia', 'power generation', 'power', 'geração', 'potência']);
                    idxEnergiaHoje = getColumnIndex(['produção diária', 'daily production', 'today', 'diária', 'daily']);
                    
                    console.log(`📊 Índices: Nome=${idxNome}, Status=${idxStatus}, PotAtual=${idxPotenciaAtual}, PotInst=${idxPotenciaInstalada}, EnergiaHoje=${idxEnergiaHoje}`);
                }
            }
            
            // Prepara dados para batch
            const usinasParaSalvar = [];
            const leiturasTemp = [];
            
            for (const item of dadosExtraidos) {
                if (item.tipo === 'tabela' && item.celulas && item.celulas.length >= 3) {
                    // Pula cabeçalho
                    if (item.celulas.some(c => {
                        const lower = (c || '').toLowerCase();
                        return lower.includes('plant name') || lower.includes('station name') || 
                               (lower.includes('name') && lower.includes('status'));
                    })) {
                        continue;
                    }
                    
                    // Extrai nome - tenta várias posições
                    let nome = '';
                    if (idxNome >= 0 && item.celulas[idxNome]) {
                        nome = item.celulas[idxNome].trim();
                    }
                    // Se não encontrou, tenta posição 1 (comum na Canadian)
                    if (!nome && item.celulas[1]) {
                        nome = item.celulas[1].trim();
                    }
                    // Se ainda não, tenta posição 0
                    if (!nome && item.celulas[0]) {
                        nome = item.celulas[0].trim();
                    }
                    // Se ainda não encontrou, tenta qualquer célula com texto válido
                    if (!nome) {
                        const celulaComNome = item.celulas.find(c => 
                            c && c.length >= 3 && c.length < 100 && 
                            !c.includes('kW') && !c.includes('kWh') && !c.includes('kWp') &&
                            !c.toLowerCase().includes('on-line') && !c.toLowerCase().includes('off-line') &&
                            !c.toLowerCase().includes('nuvens') && !c.toLowerCase().includes('processo')
                        );
                        if (celulaComNome) nome = celulaComNome.trim();
                    }
                    
                    if (!nome || nome.length < 2 || nome.length > 100) continue;
                    
                    // Extrai potência instalada (kWp) - Canadian: índice 3 ou busca "kWp"
                    let potenciaInstalada = null;
                    const capCell = (idxPotenciaInstalada >= 0 && item.celulas[idxPotenciaInstalada])
                        ? item.celulas[idxPotenciaInstalada]
                        : item.celulas[3] || item.celulas.find(c => c && c.toLowerCase().includes('kwp'));
                    if (capCell) {
                        const match = capCell.match(/(\d+[.,]?\d*)\s*kwp?/i);
                        if (match) {
                            potenciaInstalada = parseFloat(match[1].replace(',', '.'));
                        }
                    }
                    
                    // Extrai potência atual (kW) - Canadian: índice 4 ou busca "kW" sem "kWp" e sem "kWh"
                    let potenciaAtual = 0;
                    const potCell = (idxPotenciaAtual >= 0 && item.celulas[idxPotenciaAtual])
                        ? item.celulas[idxPotenciaAtual]
                        : item.celulas[4] || item.celulas.find(c => c && c.includes('kW') && !c.includes('kWp') && !c.includes('kWh'));
                    if (potCell) {
                        const match = potCell.match(/(\d+[.,]?\d*)\s*kw/i);
                        if (match) {
                            potenciaAtual = parseFloat(match[1].replace(',', '.'));
                        }
                    }
                    
                    // Extrai energia hoje (kWh) - Canadian: índice 7 (Produção diária)
                    let energiaHoje = 0;
                    const energiaCell = (idxEnergiaHoje >= 0 && item.celulas[idxEnergiaHoje])
                        ? item.celulas[idxEnergiaHoje]
                        : item.celulas[7] || item.celulas.find(c => c && c.toLowerCase().includes('kwh'));
                    if (energiaCell) {
                        const match = energiaCell.match(/(\d+[.,]?\d*)\s*kwh?/i);
                        if (match) {
                            energiaHoje = parseFloat(match[1].replace(',', '.'));
                        }
                    }
                    
                    // Status - Canadian: índice 2 (Estado da estação)
                    let statusRaw = potenciaAtual > 0 ? 'online' : 'offline';
                    const statusCell = (idxStatus >= 0 && item.celulas[idxStatus])
                        ? item.celulas[idxStatus]
                        : item.celulas[2];
                    if (statusCell) {
                        const st = statusCell.toLowerCase();
                        if (st.includes('off-line') || st.includes('offline') || st.includes('disconnect') || st.includes('desconectado')) {
                            statusRaw = 'offline';
                        } else if (st.includes('on-line') || st.includes('online') || st.includes('normal') || st.includes('conectado')) {
                            statusRaw = 'online';
                        } else if (st.includes('alarm') || st.includes('warning') || st.includes('alerta') || st.includes('processo')) {
                            statusRaw = 'alerta';
                        }
                    }
                    
                    const statusFinal = calcularStatus(potenciaAtual, potenciaInstalada, statusRaw);
                    
                    usinasParaSalvar.push({
                        nome_cliente: nome,
                        marca: 'Canadian',
                        status: statusFinal,
                        potencia_kwp: potenciaInstalada,
                        potencia_atual_kw: Math.round(potenciaAtual * 100) / 100,
                        geracao_dia_kwh: energiaHoje,
                        ...(statusFinal !== 'offline' && { ultima_atualizacao: getDataHoraBrasil() })
                    });
                    
                    leiturasTemp.push({
                        nome_cliente: nome,
                        potencia_atual_kw: Math.round(potenciaAtual * 100) / 100,
                        geracao_dia_kwh: energiaHoje
                    });
                }
            }
            
            // Remove duplicatas
            const nomesVistos = new Set();
            const usinasUnicas = usinasParaSalvar.filter(u => {
                if (nomesVistos.has(u.nome_cliente)) return false;
                nomesVistos.add(u.nome_cliente);
                return true;
            });
            
            // Salva em batch
            if (usinasUnicas.length > 0) {
                console.log(`   💾 Salvando ${usinasUnicas.length} usinas em batch...`);
                
                const { error: upsertError } = await supabase
                    .from('usinas')
                    .upsert(usinasUnicas, { onConflict: 'nome_cliente' });
                
                if (!upsertError) {
                    // Busca IDs para leituras
                    const nomes = usinasUnicas.map(u => u.nome_cliente);
                    const { data: usinasData } = await supabase
                        .from('usinas')
                        .select('id, nome_cliente')
                        .in('nome_cliente', nomes);
                    
                    if (usinasData && usinasData.length > 0) {
                        const leiturasParaSalvar = [];
                        const dataHora = getDataHoraBrasil();
                        
                        for (const usina of usinasData) {
                            const leituraTemp = leiturasTemp.find(l => l.nome_cliente === usina.nome_cliente);
                            if (leituraTemp) {
                                leiturasParaSalvar.push({
                                    usina_id: usina.id,
                                    data_hora: dataHora,
                                    potencia_atual_kw: leituraTemp.potencia_atual_kw,
                                    geracao_dia_kwh: leituraTemp.geracao_dia_kwh
                                });
                            }
                        }
                        
                        if (leiturasParaSalvar.length > 0) {
                            const { error: insertError } = await supabase.from('leituras_diarias').insert(leiturasParaSalvar);
                            if (insertError) {
                                console.log(`⚠️ Erro ao salvar leituras: ${insertError.message}`);
                            }
                        }
                        
                        totalGeral += usinasData.length;
                        console.log(`   ✅ ${usinasData.length} usinas salvas!`);
                    }
                } else {
                    console.error(`❌ Erro no batch upsert:`, upsertError.message);
                }
            } else {
                console.log("⚠️ Nenhuma usina válida para salvar nesta página.");
            }
            
            // Verifica paginação
            const temProxima = await page.evaluate(() => {
                const botoes = Array.from(document.querySelectorAll('button, a, li, [class*="next"], [class*="arrow"]'));
                const btnNext = botoes.find(b => {
                    const text = (b.textContent || '').trim().toLowerCase();
                    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                    const disabled = b.hasAttribute('disabled') || b.classList.contains('disabled');
                    return !disabled && (text.includes('next') || text.includes('>') || text.includes('›') || 
                           text.includes('próx') || aria.includes('next'));
                });
                return !!btnNext;
            });
            
            if (!temProxima) {
                console.log("🏁 Fim das páginas.");
                break;
            }
            
            // Clica em próxima página
            const avancou = await page.evaluate(() => {
                const botoes = Array.from(document.querySelectorAll('button, a, li, [class*="next"], [class*="arrow"]'));
                const btnNext = botoes.find(b => {
                    const text = (b.textContent || '').trim().toLowerCase();
                    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                    const disabled = b.hasAttribute('disabled') || b.classList.contains('disabled');
                    return !disabled && (text.includes('next') || text.includes('>') || text.includes('›') || 
                           text.includes('próx') || aria.includes('next'));
                });
                if (btnNext) {
                    btnNext.click();
                    return true;
                }
                return false;
            });
            
            if (!avancou) {
                console.log("🏁 Não conseguiu avançar. Finalizando.");
                break;
            }
            
            paginaAtual++;
            await page.waitForTimeout(3000);
        }
        
        console.log(`\n🎉 Canadian Solar: ${totalGeral} usinas sincronizadas`);
        console.log("🏁 Processo encerrado.");
        
    } catch (err) {
        console.error(`🔴 Erro no robô Canadian Solar:`, err.message);
        console.error("Stack trace:", err.stack);
        if (typeof page !== 'undefined') {
            // (screenshot de erro removido)
        }
    } finally {
        await browser.close();
        console.log("🔒 Browser fechado.");
    }
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.basename(process.argv[1]) === path.basename(__filename);
if (isMain) rodarRobo().catch(console.error);
export { rodarRobo as rodarCanadian };
