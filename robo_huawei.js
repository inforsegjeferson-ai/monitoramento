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
    console.log("🚀 Iniciando sincronização (Versão Robusta - 132 Usinas)...");
    
    const browser = await chromium.launch({ headless: true }); 
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log("🔗 Acessando Huawei FusionSolar...");
        await page.goto('https://la5.fusionsolar.huawei.com/', { waitUntil: 'networkidle' });
        
        // Login (Lógica validada)
        await page.evaluate(({ user, pass }) => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const u = inputs.find(i => i.placeholder?.includes('User') || i.type === 'text');
            const p = inputs.find(i => i.type === 'password');
            if (u && p) { u.value = user; u.dispatchEvent(new Event('input', {bubbles:true})); p.value = pass; p.dispatchEvent(new Event('input', {bubbles:true})); }
        }, { user: process.env.HUAWEI_USER, pass: process.env.HUAWEI_PASS });
        await page.keyboard.press('Enter');

        await page.waitForURL(url => url.href.includes('/home/list'), { timeout: 90000 });
        console.log("✅ Login OK. Ajustando zoom...");
        
        // Zoom 0.8 para garantir que o rodapé apareça
        await page.evaluate(() => { document.body.style.zoom = "0.8"; });
        await page.waitForTimeout(8000);

        // Aguarda a página carregar completamente
        console.log("⏳ Aguardando carregamento completo da página...");
        await page.waitForLoadState('networkidle', { timeout: 60000 });
        await page.waitForTimeout(5000);

        // Configura para mostrar 100 itens por página (muito mais rápido!)
        console.log("⚙️ Configurando para 100 itens por página...");
        try {
            // Tenta encontrar o seletor de itens por página (Ant Design)
            const seletorItensPorPagina = await page.evaluate(() => {
                // Busca por select ou dropdown de paginação
                const possiveisSeletores = [
                    '.ant-pagination-options-size-changer',
                    '.ant-select-selector',
                    'select.ant-pagination-options-size-changer',
                    '.pagination-size-selector',
                    '[class*="page-size"]',
                    '[class*="items-per-page"]'
                ];
                
                for (const sel of possiveisSeletores) {
                    const el = document.querySelector(sel);
                    if (el) {
                        return {
                            seletor: sel,
                            encontrado: true,
                            tagName: el.tagName,
                            classes: el.className
                        };
                    }
                }
                
                // Busca por qualquer elemento que contenha números de página (10, 20, 50, 100) ou "100 / página"
                const todosElementos = Array.from(document.querySelectorAll('*'));
                const elementoComNumeros = todosElementos.find(el => {
                    const text = el.innerText?.trim();
                    return text && (
                        /^(10|20|50|100)$/.test(text) || 
                        /100.*página|100.*page/i.test(text)
                    ) && 
                    (el.tagName === 'DIV' || el.tagName === 'SPAN' || el.tagName === 'LI' || el.tagName === 'BUTTON') &&
                    el.offsetParent !== null; // Está visível
                });
                
                if (elementoComNumeros) {
                    return {
                        seletor: 'elemento-encontrado',
                        encontrado: true,
                        tagName: elementoComNumeros.tagName,
                        classes: elementoComNumeros.className,
                        text: elementoComNumeros.innerText
                    };
                }
                
                return { encontrado: false };
            });
            
            console.log("🔍 Seletor de itens por página:", JSON.stringify(seletorItensPorPagina, null, 2));
            
            if (seletorItensPorPagina.encontrado) {
                // Tenta encontrar e clicar no seletor de itens por página usando Playwright
                try {
                    // Método 1: Busca pelo seletor do Ant Design
                    // Tenta múltiplos seletores possíveis
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
                    
                    if (count > 0) {
                        await selectSizeChanger.click();
                        await page.waitForTimeout(500);
                        
                        // Busca a opção "100" ou "100 / página" no dropdown
                        // Tenta múltiplas variações do texto
                        let opcao100 = page.locator('.ant-select-item-option').filter({ hasText: /100/ }).first();
                        let opcao100Count = await opcao100.count();
                        
                        // Se não encontrou, tenta buscar por "100 / página" ou "100/página"
                        if (opcao100Count === 0) {
                            opcao100 = page.locator('.ant-select-item-option, .ant-select-item').filter({ 
                                hasText: /100.*página|100.*page/i 
                            }).first();
                            opcao100Count = await opcao100.count();
                        }
                        
                        if (opcao100Count > 0) {
                            await opcao100.click();
                            console.log("✅ Configurado para 100 itens por página! Aguardando recarregamento...");
                            await page.waitForTimeout(3000);
                            await page.waitForLoadState('networkidle', { timeout: 30000 });
                            await page.waitForTimeout(2000);
                        } else {
                            console.log("⚠️ Opção '100' não encontrada no dropdown. Tentando método alternativo...");
                            // Tenta via JavaScript com busca mais ampla
                            const configurado = await page.evaluate(() => {
                                // Busca todas as opções do dropdown
                                const opcoes = Array.from(document.querySelectorAll('.ant-select-item-option, .ant-select-item, [class*="select-item"]'));
                                
                                // Procura por opção que contenha "100" e possivelmente "página" ou "page"
                                const opcao100 = opcoes.find(el => {
                                    const text = el.innerText?.trim().toLowerCase();
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
                                    opcao100.click();
                                    return true;
                                }
                                return false;
                            });
                            
                            if (configurado) {
                                console.log("✅ Configurado para 100 itens por página (método JavaScript)! Aguardando recarregamento...");
                                await page.waitForTimeout(3000);
                                await page.waitForLoadState('networkidle', { timeout: 30000 });
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
                                const text = el.innerText?.trim();
                                return (text === '100' || text?.match(/100/)) && 
                                       (el.tagName === 'DIV' || el.tagName === 'SPAN' || el.tagName === 'LI') &&
                                       el.offsetParent !== null; // Está visível
                            });
                            
                            if (elemento100) {
                                elemento100.click();
                                return true;
                            }
                            return false;
                        });
                        
                        if (configurado) {
                            console.log("✅ Configurado para 100 itens por página (método alternativo)! Aguardando recarregamento...");
                            await page.waitForTimeout(3000);
                            await page.waitForLoadState('networkidle', { timeout: 30000 });
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
            }
        } catch (err) {
            console.log("⚠️ Erro ao configurar itens por página:", err.message);
            console.log("   Continuando com o padrão da página...");
        }

        // Verifica se a tabela existe na página
        const estruturaPagina = await page.evaluate(() => {
            const possiveisTabelas = [
                document.querySelector('table'),
                document.querySelector('.el-table'),
                document.querySelector('tbody'),
                document.querySelector('[class*="table"]'),
                document.querySelector('tr.el-table__row'),
                document.querySelector('tr[class*="row"]')
            ];
            return {
                temTable: !!document.querySelector('table'),
                temElTable: !!document.querySelector('.el-table'),
                temTbody: !!document.querySelector('tbody'),
                temRows: document.querySelectorAll('tr').length,
                url: window.location.href,
                titulo: document.title
            };
        });
        console.log("📊 Estrutura da página:", JSON.stringify(estruturaPagina, null, 2));

        let totalGeral = 0;
        let temProxima = true;
        let paginaAtual = 1;
        let ultimoLog = 0; // Controla logs de 100 em 100

        while (temProxima) {
            // Processa silenciosamente, sem logs de cada página
            
            // Tenta múltiplos seletores possíveis
            let tabelaEncontrada = false;
            const seletoresPossiveis = [
                'tr.el-table__row',
                'tbody tr',
                'table tr',
                '.el-table__row',
                'tr[class*="row"]',
                'tr:has(td)'
            ];

            for (const seletor of seletoresPossiveis) {
                try {
                    await page.waitForSelector(seletor, { timeout: 10000 });
                    const count = await page.evaluate((sel) => {
                        return document.querySelectorAll(sel).length;
                    }, seletor);
                    if (count > 0) {
                        tabelaEncontrada = true;
                        break;
                    }
                } catch (e) {
                    // Continua tentando próximo seletor
                }
            }

            if (!tabelaEncontrada) {
                console.error("❌ Nenhuma tabela encontrada na página!");
                
                // Tenta verificar o HTML da página
                const htmlDebug = await page.evaluate(() => {
                    return {
                        bodyHTML: document.body.innerHTML.substring(0, 1000),
                        allTables: Array.from(document.querySelectorAll('table')).map(t => t.outerHTML.substring(0, 200))
                    };
                });
                console.log("🔍 Debug HTML:", JSON.stringify(htmlDebug, null, 2));
                throw new Error(`Tabela não encontrada na página ${paginaAtual}`);
            }

            // Extrai dados usando múltiplos seletores possíveis
            const usinas = await page.evaluate(() => {
                // Tenta encontrar linhas da tabela com diferentes seletores
                let rows = Array.from(document.querySelectorAll('tr.el-table__row'));
                if (rows.length === 0) {
                    rows = Array.from(document.querySelectorAll('tbody tr'));
                }
                if (rows.length === 0) {
                    rows = Array.from(document.querySelectorAll('table tr'));
                }
                if (rows.length === 0) {
                    rows = Array.from(document.querySelectorAll('tr:has(td)'));
                }
                
                // Tenta encontrar o header da tabela para identificar colunas
                const headers = Array.from(document.querySelectorAll('thead th, table th, .ant-table-thead th, .ant-table-thead > tr > th, [class*="table"] th'));
                const headerTexts = headers.map(h => h.innerText?.trim() || '');
                const headerTextsLower = headerTexts.map(h => h.toLowerCase());
                
                // Busca especificamente por "Capacidade total da string (kWp)" ou variações
                let potenciaInstaladaIndex = -1;
                
                // Busca exata primeiro
                potenciaInstaladaIndex = headerTextsLower.findIndex(h => 
                    h.includes('capacidade total da string')
                );
                
                // Se não encontrou, busca variações
                if (potenciaInstaladaIndex === -1) {
                    potenciaInstaladaIndex = headerTextsLower.findIndex(h => 
                        h.includes('capacidade total') ||
                        (h.includes('capacidade') && h.includes('kwp')) ||
                        (h.includes('capacity') && h.includes('kwp'))
                    );
                }
                
                // Se ainda não encontrou, busca por qualquer menção a capacidade/kwp
                if (potenciaInstaladaIndex === -1) {
                    potenciaInstaladaIndex = headerTextsLower.findIndex(h => 
                        h.includes('capacidade') ||
                        (h.includes('kwp') && !h.includes('atual'))
                    );
                }
                
                // Retorna informações dos headers para debug
                const headersInfo = headers.map((h, idx) => ({
                    index: idx,
                    text: h.innerText?.trim() || '',
                    textLower: (h.innerText?.trim() || '').toLowerCase()
                }));
                
                return rows.map(row => {
                    const cols = row.querySelectorAll('td');
                    // Tenta diferentes índices de colunas
                    const nome = cols[1]?.innerText?.trim() || cols[0]?.innerText?.trim() || '';
                    // Status deve ser em minúsculas: 'online', 'offline', 'alerta' (conforme esperado pelo frontend)
                    const status = row.innerHTML.includes('green') || row.innerHTML.includes('online') ? 'online' : 'offline';
                    
                    // Extrai todas as colunas para debug e identificação
                    const todasColunas = Array.from(cols).map((col, idx) => ({
                        index: idx,
                        text: col.innerText?.trim() || '',
                        html: col.innerHTML
                    }));
                    
                    // Potência atual (geralmente em kW)
                    const potencia = cols[4]?.innerText?.trim() || cols[3]?.innerText?.trim() || cols[2]?.innerText?.trim() || '';
                    
                    // Potência instalada - "Capacidade total da string (kWp)"
                    // Primeiro tenta usar o índice do header se encontrado
                    let potenciaInstalada = '';
                    if (potenciaInstaladaIndex >= 0 && cols[potenciaInstaladaIndex]) {
                        potenciaInstalada = cols[potenciaInstaladaIndex].innerText?.trim() || '';
                    } else {
                        // Se não encontrou pelo header, tenta encontrar coluna com valores maiores
                        // (potência instalada é geralmente maior que potência atual)
                        const potenciaAtualValor = parseFloat(potencia.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
                        for (let i = 0; i < cols.length; i++) {
                            const texto = cols[i]?.innerText?.trim() || '';
                            const valor = parseFloat(texto.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
                            // Se encontrar um valor significativamente maior que a potência atual, pode ser a potência instalada
                            if (valor > potenciaAtualValor * 1.5 && valor > 0) {
                                potenciaInstalada = texto;
                                break;
                            }
                        }
                        // Se não encontrou, tenta colunas comuns (geralmente após potência atual)
                        if (!potenciaInstalada) {
                            potenciaInstalada = cols[5]?.innerText?.trim() || cols[6]?.innerText?.trim() || cols[7]?.innerText?.trim() || '';
                        }
                    }
                    
                    const rendimento = cols[6]?.innerText?.trim() || cols[5]?.innerText?.trim() || cols[4]?.innerText?.trim() || '';
                    
                    return {
                        nome,
                        status,
                        potencia,
                        potenciaInstalada,
                        rendimento,
                        colCount: cols.length,
                        todasColunas: todasColunas.slice(0, 8), // Primeiras 8 para debug
                        potenciaInstaladaIndex: potenciaInstaladaIndex, // Índice encontrado para debug
                        headersInfo: headersInfo // Headers para debug
                    };
                }).filter(u => u.nome && u.nome.length > 0);
            });
            
            if (usinas.length > 0) {
                // Log de debug na primeira página para verificar estrutura das colunas
                if (paginaAtual === 1 && usinas.length > 0) {
                    console.log("🔍 Debug - Headers da tabela encontrados:", JSON.stringify(usinas[0].headersInfo, null, 2));
                    console.log("🔍 Debug - Índice da potência instalada encontrado:", usinas[0].potenciaInstaladaIndex);
                    console.log("🔍 Debug - Estrutura das colunas (primeira usina):", JSON.stringify(usinas[0].todasColunas, null, 2));
                    console.log("🔍 Debug - Valores extraídos:", {
                        nome: usinas[0].nome,
                        potencia: usinas[0].potencia,
                        potenciaInstalada: usinas[0].potenciaInstalada,
                        potenciaInstaladaIndex: usinas[0].potenciaInstaladaIndex,
                        rendimento: usinas[0].rendimento
                    });
                    
                    // Se não encontrou potência instalada, mostra aviso
                    if (!usinas[0].potenciaInstalada || usinas[0].potenciaInstalada.trim() === '') {
                        console.warn("⚠️ ATENÇÃO: Potência instalada não foi encontrada! Verifique os headers acima.");
                    }
                }
                
                // Salva sem logs detalhados de cada página
                for (const u of usinas) {
                    try {
                        const potenciaNum = parseFloat(u.potencia?.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
                        
                        // Converte potência instalada, mas mantém null se não encontrou valor válido
                        let potenciaInstaladaNum = null;
                        if (u.potenciaInstalada && u.potenciaInstalada.trim() !== '') {
                            const parsed = parseFloat(u.potenciaInstalada.replace(/[^\d,.-]/g, '').replace(',', '.'));
                            if (!isNaN(parsed) && parsed > 0) {
                                potenciaInstaladaNum = parsed;
                            }
                        }
                        
                        const rendimentoNum = parseFloat(u.rendimento?.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
                        
                        // Calcula status baseado em eficiência (lógica de alerta)
                        let statusFinal = u.status; // Começa com o status extraído (online/offline)
                        
                        // Se temos potência instalada e atual, calcula eficiência e determina alerta
                        if (potenciaInstaladaNum && potenciaInstaladaNum > 0) {
                            const eficiencia = (potenciaNum / potenciaInstaladaNum) * 100;
                            const agora = new Date();
                            // Obtém hora no timezone do Brasil
                            const horaBrasil = agora.toLocaleString('pt-BR', { 
                                timeZone: 'America/Sao_Paulo', 
                                hour: 'numeric', 
                                hour12: false 
                            });
                            const hora = parseInt(horaBrasil.split(':')[0]) || agora.getHours();
                            
                            // Regra de Alerta: só após 14h (janela 11h–14h)
                            if (hora >= 14) {
                                if (eficiencia < 20 && potenciaNum > 0) {
                                    statusFinal = 'alerta'; // Baixa eficiência durante horário de pico
                                } else if (potenciaNum === 0) {
                                    statusFinal = 'offline'; // Sem produção durante horário de pico
                                }
                            } else if (potenciaNum === 0 && hora >= 8 && hora <= 18) {
                                statusFinal = 'offline'; // Sem produção durante dia útil
                            }
                        } else if (potenciaNum === 0) {
                            // Se não tem potência instalada mas potência atual é 0, mantém offline
                            statusFinal = 'offline';
                        }
                        
                        // Log de debug na primeira página para verificar valores salvos
                        if (paginaAtual === 1 && totalGeral === 0) {
                            const eficiencia = potenciaInstaladaNum && potenciaInstaladaNum > 0 
                                ? (potenciaNum / potenciaInstaladaNum) * 100 
                                : 0;
                            console.log(`💾 Debug - ANTES de salvar (primeira usina):`, {
                                nome: u.nome,
                                potenciaInstaladaRaw: u.potenciaInstalada,
                                potenciaInstaladaIndex: u.potenciaInstaladaIndex,
                                potencia_kwp_convertido: potenciaInstaladaNum,
                                potencia_atual_kw: potenciaNum,
                                eficiencia: eficiencia.toFixed(1) + '%',
                                status_original: u.status,
                                status_final: statusFinal,
                                todasColunas: u.todasColunas,
                                headersInfo: u.headersInfo
                            });
                        }
                        
                        // Log após salvar para verificar se foi salvo corretamente
                        if (paginaAtual === 1 && totalGeral === 0) {
                            const { data: savedData, error: checkError } = await supabase
                                .from('usinas')
                                .select('potencia_kwp, nome_cliente')
                                .eq('nome_cliente', u.nome)
                                .single();
                            
                            if (!checkError && savedData) {
                                console.log(`✅ Debug - DEPOIS de salvar (verificação):`, {
                                    nome: savedData.nome_cliente,
                                    potencia_kwp_no_banco: savedData.potencia_kwp,
                                    tipo: typeof savedData.potencia_kwp
                                });
                            }
                        }
                        
                        const dadosParaSalvar = {
                            nome_cliente: u.nome,
                            marca: 'Huawei',
                            status: statusFinal, // Usa status calculado com lógica de alerta
                            potencia_kwp: potenciaInstaladaNum, // Potência instalada (coluna no banco) - null se não encontrado
                            potencia_atual_kw: potenciaNum,
                            geracao_dia_kwh: rendimentoNum,
                            ...(statusFinal !== 'offline' && { ultima_atualizacao: getDataHoraBrasil() })
                        };
                        
                        // Log detalhado do que está sendo salvo
                        if (paginaAtual === 1 && totalGeral === 0) {
                            console.log(`💾 Debug - Dados que serão salvos:`, JSON.stringify(dadosParaSalvar, null, 2));
                        }
                        
                        const { error } = await supabase.from('usinas').upsert(dadosParaSalvar, { onConflict: 'nome_cliente' });
                        
                        if (error) {
                            console.error(`❌ Erro ao salvar ${u.nome}:`, error.message);
                            console.error(`❌ Dados que causaram erro:`, JSON.stringify(dadosParaSalvar, null, 2));
                        } else if (paginaAtual === 1 && totalGeral === 0) {
                            console.log(`✅ Sucesso ao salvar ${u.nome}`);
                        }
                    } catch (err) {
                        console.error(`❌ Erro ao processar usina ${u.nome}:`, err.message);
                    }
                }
                totalGeral += usinas.length;
                
                // Mostra log apenas a cada 100 usinas (100, 200, 300, etc.)
                const proximoMarco = ultimoLog + 100;
                if (totalGeral >= proximoMarco) {
                    console.log(`📦 ✅ ${totalGeral} usinas processadas!`);
                    ultimoLog = Math.floor(totalGeral / 100) * 100;
                }
            } else {
                console.warn(`⚠️ Nenhuma usina encontrada na página ${paginaAtual}. Verificando estrutura...`);
            }

            // PAGINAÇÃO POR CLIQUE FÍSICO (Coordenadas)
            // Processa silenciosamente
            
            // Tenta encontrar o botão de próxima página com múltiplos seletores
            const seletoresBotao = [
                'button.ant-pagination-item-link:has(span[aria-label="right"])', // Ant Design - prioridade
                '.ant-pagination button.ant-pagination-item-link:not(.ant-pagination-disabled):has(span[aria-label="right"])',
                'button.btn-next',
                'button[class*="next"]',
                '.el-pagination button.btn-next',
                '.el-pagination .btn-next',
                'button:has-text("Próximo")',
                'button:has-text("Next")',
                'button[aria-label*="next" i]',
                '.pagination button:last-child',
                'button.el-pagination__next'
            ];
            
            let btnNext = null;
            let botaoEncontrado = false;
            
            for (const seletor of seletoresBotao) {
                try {
                    const count = await page.locator(seletor).count();
                    if (count > 0) {
                        btnNext = page.locator(seletor).first();
                        const isVisible = await btnNext.isVisible({ timeout: 2000 }).catch(() => false);
                        if (isVisible) {
                            console.log(`✅ Botão de próxima página encontrado: ${seletor}`);
                            botaoEncontrado = true;
                            break;
                        }
                    }
                } catch (e) {
                    // Continua tentando próximo seletor
                }
            }
            
            if (!botaoEncontrado) {
                // Tenta encontrar via JavaScript direto - busca mais abrangente
                const infoPagina = await page.evaluate(() => {
                    // Busca botões
                    const botoes = Array.from(document.querySelectorAll('button'));
                    const todosBotoes = botoes.map((btn, idx) => ({
                        index: idx,
                        text: btn.innerText.trim(),
                        classes: btn.className,
                        disabled: btn.disabled,
                        ariaLabel: btn.getAttribute('aria-label') || '',
                        type: 'button'
                    }));
                    
                    // Busca elementos clicáveis de paginação (spans, divs, etc.)
                    const elementosPagina = Array.from(document.querySelectorAll('.el-pagination button, .pagination button, [class*="pagination"] button, [class*="page"] button'));
                    const elementosPaginaInfo = elementosPagina.map((el, idx) => ({
                        index: idx,
                        text: el.innerText.trim(),
                        classes: el.className,
                        disabled: el.disabled || el.classList.contains('disabled'),
                        ariaLabel: el.getAttribute('aria-label') || '',
                        type: 'pagination-element'
                    }));
                    
                    // Filtra possíveis botões de próxima página
                    const possiveisBotoes = [...todosBotoes, ...elementosPaginaInfo].filter(btn => 
                        btn.text.toLowerCase().includes('próximo') || 
                        btn.text.toLowerCase().includes('next') ||
                        btn.classes.includes('next') ||
                        btn.ariaLabel.toLowerCase().includes('next') ||
                        btn.text === '>' ||
                        btn.text === '»' ||
                        btn.classes.includes('btn-next') ||
                        btn.classes.includes('el-pagination__next')
                    );
                    
                    return {
                        encontrados: possiveisBotoes,
                        totalBotoes: botoes.length,
                        todosBotoes: todosBotoes.slice(0, 10), // Primeiros 10 para debug
                        elementosPagina: elementosPaginaInfo.slice(0, 10)
                    };
                });
                
                console.log("🔍 Botões de paginação encontrados:", JSON.stringify(infoPagina, null, 2));
                
                if (infoPagina.encontrados.length === 0) {
                    // Se não encontrou, tenta buscar por setas ou último botão da paginação
                    console.log("🔍 Tentando encontrar paginação por outros métodos...");
                    const paginacaoAlternativa = await page.evaluate(() => {
                        // Busca por elementos de paginação de várias formas
                        let paginacao = document.querySelector('.el-pagination, .pagination, [class*="pagination"]');
                        
                        // Se não encontrou, busca por qualquer elemento que contenha números de página
                        if (!paginacao) {
                            const elementosComNumeros = Array.from(document.querySelectorAll('*')).filter(el => {
                                const text = el.innerText.trim();
                                return /^\d+$/.test(text) && parseInt(text) > 1 && el.tagName === 'LI';
                            });
                            if (elementosComNumeros.length > 0) {
                                paginacao = elementosComNumeros[0].closest('.el-pagination, .pagination, [class*="pagination"]');
                            }
                        }
                        
                        if (paginacao) {
                            // Busca botões, spans clicáveis, lis, etc.
                            const botoes = Array.from(paginacao.querySelectorAll('button, .el-pager li, [role="button"], span[class*="next"], button[class*="next"]'));
                            return botoes.map((btn, idx) => {
                                const rect = btn.getBoundingClientRect();
                                return {
                                    index: idx,
                                    text: btn.innerText.trim(),
                                    classes: btn.className,
                                    disabled: btn.disabled || btn.classList.contains('disabled') || btn.classList.contains('number') || btn.classList.contains('is-disabled'),
                                    tagName: btn.tagName,
                                    isLast: idx === botoes.length - 1,
                                    isVisible: rect.width > 0 && rect.height > 0,
                                    hasNextClass: btn.className.includes('next'),
                                    innerHTML: btn.innerHTML.substring(0, 50)
                                };
                            }).filter(b => b.isVisible);
                        }
                        
                        // Última tentativa: busca qualquer elemento com classe "next"
                        const elementosNext = Array.from(document.querySelectorAll('[class*="next"]:not([class*="previous"])'));
                        return elementosNext.map((el, idx) => ({
                            index: idx,
                            text: el.innerText.trim(),
                            classes: el.className,
                            disabled: el.disabled || el.classList.contains('disabled') || el.classList.contains('is-disabled'),
                            tagName: el.tagName,
                            isLast: false,
                            isVisible: true,
                            hasNextClass: true
                        }));
                    });
                    
                    console.log("🔍 Elementos de paginação:", JSON.stringify(paginacaoAlternativa, null, 2));
                    
                    // Tenta encontrar o botão de próxima página
                    // Prioridade: elementos com classe "next", depois setas (>, »), depois último botão
                    const botaoProximo = paginacaoAlternativa.filter(b => !b.disabled && b.hasNextClass)[0] || 
                                         paginacaoAlternativa.filter(b => !b.disabled && (b.text === '>' || b.text === '»'))[0] ||
                                         paginacaoAlternativa.filter(b => !b.disabled && b.isLast)[0];
                    
                    if (botaoProximo) {
                        console.log(`🎯 Tentando clicar no elemento: ${botaoProximo.tagName} com classes: ${botaoProximo.classes}`);
                        
                        // Tenta múltiplos métodos de clique
                        let clicou = false;
                        
                        // Método 1: Busca direta pelo botão com aria-label="right" (Ant Design)
                        try {
                            clicou = await page.evaluate(() => {
                                // Busca especificamente o botão de próxima página do Ant Design
                                const paginacao = document.querySelector('.ant-pagination');
                                if (paginacao) {
                                    // Busca botão com aria-label="right" ou que contenha ícone de seta direita
                                    const botoes = Array.from(paginacao.querySelectorAll('button.ant-pagination-item-link'));
                                    const botaoNext = botoes.find(btn => {
                                        const span = btn.querySelector('span[aria-label="right"]');
                                        return span !== null && !btn.disabled && !btn.classList.contains('ant-pagination-disabled');
                                    });
                                    
                                    if (botaoNext) {
                                        botaoNext.click();
                                        return true;
                                    }
                                }
                                
                                // Fallback: busca por qualquer botão de paginação não desativado
                                const todosBotoes = Array.from(document.querySelectorAll('button.ant-pagination-item-link'));
                                const botaoAtivo = todosBotoes.find(btn => 
                                    !btn.disabled && 
                                    !btn.classList.contains('ant-pagination-disabled') &&
                                    btn.querySelector('span[aria-label="right"]')
                                );
                                
                                if (botaoAtivo) {
                                    botaoAtivo.click();
                                    return true;
                                }
                                
                                return false;
                            });
                            
                            if (clicou) {
                                console.log("✅ Clique realizado no botão de próxima página (Ant Design).");
                            }
                        } catch (e) {
                            console.log("⚠️ Erro no método 1:", e.message);
                        }
                        
                        // Método 2: Clique via coordenadas se o elemento foi encontrado
                        if (!clicou) {
                            try {
                                const box = await page.evaluate(({ index, tagName }) => {
                                    let elementos;
                                    if (tagName === 'BUTTON') {
                                        elementos = Array.from(document.querySelectorAll('button'));
                                    } else {
                                        const paginacao = document.querySelector('.ant-pagination, .el-pagination, .pagination, [class*="pagination"]');
                                        if (paginacao) {
                                            elementos = Array.from(paginacao.querySelectorAll('button, .el-pager li, [role="button"], span[class*="next"], button[class*="next"]'));
                                        } else {
                                            elementos = Array.from(document.querySelectorAll('[class*="next"]:not([class*="previous"])'));
                                        }
                                    }
                                    const el = elementos[index];
                                    if (el) {
                                        const rect = el.getBoundingClientRect();
                                        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                                    }
                                    return null;
                                }, { index: botaoProximo.index, tagName: botaoProximo.tagName });
                                
                                if (box) {
                                    await page.mouse.click(box.x, box.y);
                                    clicou = true;
                                    console.log("➡️ Clique realizado via coordenadas.");
                                }
                            } catch (e) {
                                console.log("⚠️ Erro no método 2:", e.message);
                            }
                        }
                        
                        // Método 3: Clique direto usando o seletor do Ant Design
                        if (!clicou) {
                            try {
                                const botaoNext = page.locator('button.ant-pagination-item-link:not(.ant-pagination-disabled)').filter({ has: page.locator('span[aria-label="right"]') }).first();
                                const count = await botaoNext.count();
                                if (count > 0) {
                                    await botaoNext.click();
                                    clicou = true;
                                    console.log("✅ Clique realizado via seletor Playwright.");
                                }
                            } catch (e) {
                                console.log("⚠️ Erro no método 3:", e.message);
                            }
                        }
                        
                        if (clicou) {
                            console.log("➡️ Clique realizado no botão de paginação alternativo.");
                            paginaAtual++;
                            await page.waitForTimeout(12000);
                        } else {
                            console.log("🏁 Não foi possível clicar no botão de paginação. Fim das páginas.");
                            temProxima = false;
                        }
                    } else {
                        console.log("🏁 Nenhum botão de próxima página encontrado. Fim das páginas.");
                        temProxima = false;
                    }
                } else {
                    // Tenta clicar no primeiro botão encontrado via JavaScript
                    const primeiroBotao = infoPagina.encontrados[0];
                    if (!primeiroBotao.disabled) {
                        const clicou = await page.evaluate((index) => {
                            const botoes = Array.from(document.querySelectorAll('button'));
                            const btn = botoes[index];
                            if (btn && !btn.disabled) {
                                btn.click();
                                return true;
                            }
                            return false;
                        }, primeiroBotao.index);
                        
                        if (clicou) {
                            console.log("➡️ Clique realizado via JavaScript.");
                            paginaAtual++;
                            await page.waitForTimeout(12000);
                        } else {
                            console.log("🏁 Botão encontrado mas não foi possível clicar. Fim das páginas.");
                            temProxima = false;
                        }
                    } else {
                        console.log("🏁 Botão encontrado mas está desativado. Fim das páginas.");
                        temProxima = false;
                    }
                }
            } else {
                // Verifica se o botão está desativado
                try {
                    const estaDesativado = await btnNext.evaluate(node => 
                        node.disabled || 
                        node.classList.contains('is-disabled') ||
                        node.classList.contains('disabled') ||
                        node.getAttribute('disabled') !== null
                    );
                    
                    if (estaDesativado) {
                        console.log("🏁 Botão de próxima página está desativado. Fim das páginas.");
                        temProxima = false;
                    } else {
                        // Rola para o botão para garantir que ele está na tela
                        await btnNext.scrollIntoViewIfNeeded();
                        
                        // Obtém a posição exata do botão na tela
                        const box = await btnNext.boundingBox();
                        
                        if (box) {
                            // Clica exatamente no centro das coordenadas do botão
                            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                            console.log("➡️ Clique físico realizado.");
                            paginaAtual++;
                            await page.waitForTimeout(12000); // Espera carregamento pesado da Huawei
                        } else {
                            console.log("⚠️ Botão detectado, mas posição não encontrada. Tentando via Enter...");
                            await btnNext.focus();
                            await page.keyboard.press('Enter');
                            paginaAtual++;
                            await page.waitForTimeout(12000);
                        }
                    }
                } catch (err) {
                    console.error("❌ Erro ao interagir com botão:", err.message);
                    // Tenta uma última vez via JavaScript
                    try {
                        await page.evaluate(() => {
                            const botoes = Array.from(document.querySelectorAll('button'));
                            const btn = botoes.find(b => 
                                b.className.includes('next') || 
                                b.innerText.includes('Próximo') ||
                                b.innerText.includes('Next')
                            );
                            if (btn && !btn.disabled) {
                                btn.click();
                            }
                        });
                        console.log("➡️ Clique realizado via JavaScript.");
                        paginaAtual++;
                        await page.waitForTimeout(12000);
                    } catch (jsErr) {
                        console.log("🏁 Não foi possível avançar para próxima página. Fim das páginas.");
                        temProxima = false;
                    }
                }
            }
        }

        console.log(`\n🎉 SUCESSO! Total sincronizado: ${totalGeral}/132`);

    } catch (err) {
        console.error("🔴 Erro crítico:", err.message);
        console.error("Stack trace:", err.stack);
        
        if (typeof page !== 'undefined') {
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

// Função para executar o robô em loop a cada 5 minutos
async function executarEmLoop() {
    const INTERVALO_MINUTOS = 5;
    const INTERVALO_MS = INTERVALO_MINUTOS * 60 * 1000; // 5 minutos em milissegundos
    
    console.log(`\n🤖 Robô configurado para executar a cada ${INTERVALO_MINUTOS} minutos`);
    console.log(`⏰ Próxima execução em ${INTERVALO_MINUTOS} minutos...\n`);
    
    // Executa imediatamente na primeira vez
    await rodarRobo();
    
    // Depois executa a cada 5 minutos
    setInterval(async () => {
        const agora = new Date();
        const horaBrasil = agora.toLocaleString('pt-BR', { 
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        console.log(`\n🔄 Iniciando execução agendada às ${horaBrasil}`);
        console.log(`⏰ Próxima execução em ${INTERVALO_MINUTOS} minutos...\n`);
        
        try {
            await rodarRobo();
        } catch (err) {
            console.error(`❌ Erro na execução agendada:`, err.message);
            console.error("🔄 Continuando o loop mesmo com erro...");
        }
    }, INTERVALO_MS);
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.basename(process.argv[1]) === path.basename(__filename);
if (isMain) rodarRobo().catch((err) => { console.error('❌ Erro fatal:', err); process.exit(1); });
export { rodarRobo as rodarHuawei };
