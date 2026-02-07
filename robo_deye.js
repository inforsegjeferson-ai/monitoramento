/**
 * Robô Deye Cloud – https://us1.deyecloud.com/login
 * Fluxo: aceitar cookies → login → visão global → extrair dados das usinas.
 * Baseado na estrutura do robo_huawei.js.
 */
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const LOGIN_URL = 'https://us1.deyecloud.com/login';
const BASE_URL = 'https://us1.deyecloud.com';
/** Intervalo (ms) entre cada ação do robô para não sobrecarregar a página. */
const INTERVALO_MS = 1500;
/** Usa setTimeout para não depender da página aberta (evita erro se o browser fechar). */
const delay = (_page, ms = INTERVALO_MS) => new Promise(r => setTimeout(r, ms));

/** Corrige nomes com encoding errado (UTF-8 lido como Latin-1): AcÃ¡cio → Acácio */
function corrigirEncoding(str) {
    if (typeof str !== 'string') return str;
    const map = [
        [/Ã¡/g, 'á'], [/Ã /g, 'à'], [/Ã¢/g, 'â'], [/Ã£/g, 'ã'],
        [/Ã©/g, 'é'], [/Ãª/g, 'ê'],
        [/Ã­/g, 'í'],
        [/Ã³/g, 'ó'], [/Ã´/g, 'ô'], [/Ãµ/g, 'õ'],
        [/Ãº/g, 'ú'], [/Ã§/g, 'ç'],
        [/Ã‡/g, 'Ç'], [/Ãƒ/g, 'Ã']
    ];
    let s = str;
    for (const [re, ch] of map) s = s.replace(re, ch);
    return s;
}

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
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}-03:00`;
}

/** Regra de alerta: só após 14h. ultima_atualizacao só quando status !== 'offline'. */
function calcularStatus(potenciaAtual, potenciaInstalada, statusRaw = '') {
    const raw = String(statusRaw || '').trim();
    const explicitOffline = raw && /off|desligado|offline/i.test(raw) && !/online|normal|ok/i.test(raw);
    let statusFinal = explicitOffline ? 'offline' : 'online';
    if (potenciaAtual > 0) statusFinal = 'online';
    if (potenciaInstalada && potenciaInstalada > 0) {
        const eficiencia = (potenciaAtual / potenciaInstalada) * 100;
        const hora = parseInt(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).split(':')[0]) || 0;
        if (potenciaAtual > 0) statusFinal = eficiencia < 20 && hora >= 14 ? 'alerta' : 'online';
        else if (hora >= 14 || (hora >= 8 && hora <= 18)) statusFinal = 'offline';
    } else if (potenciaAtual === 0 && (raw === '-' || raw === '' || explicitOffline)) statusFinal = 'offline';
    return statusFinal;
}

/** Clica em "Concordo" primeiro (antes de aceitar cookies). */
async function clicarConcordo(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        const clicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a, [role="button"], [class*="cookie"], [class*="consent"], [class*="agree"]'));
            const concordo = btns.find(b => {
                const t = (b.textContent || '').trim().toLowerCase();
                return /^concordo$|^eu concordo$|^i agree$|^agree$|sim,? eu concordo/i.test(t);
            });
            if (concordo) { concordo.click(); return true; }
            return false;
        });
        if (clicked) {
            console.log('✅ Clicou em "Concordo".');
            await delay(page, 800);
        }
        return !!clicked;
    } catch (e) {
        return false;
    }
}

async function aceitarCookies(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        const clicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a, [role="button"], [class*="cookie"], [class*="consent"]'));
            const accept = btns.find(b => {
                const t = (b.textContent || '').trim().toLowerCase();
                return /accept|aceitar|agree|concordo|ok|allow|permitir|i agree|eu concordo|got it|entendi/.test(t);
            });
            if (accept) { accept.click(); return true; }
            return false;
        });
        if (clicked) {
            console.log('✅ Cookies aceitos.');
            await delay(page, 800);
        }
        return !!clicked;
    } catch (e) {
        console.log('⚠️ Cookies:', e?.message || e);
        return false;
    }
}

const PLANT_LIST_URL = 'https://us1.deyecloud.com/business/maintain/plant';

async function irParaVisaoGlobal(page) {
    try {
        const url = page.url();
        // Se já está na página de lista de usinas (plant)
        if (/business\/maintain\/plant|\/plant\b/i.test(url) && !/login/i.test(url)) {
            console.log('✅ Já na lista de usinas (plant).');
            return true;
        }
        // Primeiro: ir para a URL da lista de usinas (Deye Cloud)
        try {
            console.log('📍 Navegando para lista de usinas:', PLANT_LIST_URL);
            await page.goto(PLANT_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await delay(page, 4000);
            const current = page.url();
            if (!/login/i.test(current)) {
                console.log('✅ Página de usinas (plant) carregada.');
                return true;
            }
        } catch (_) {}
        // Fallback: outras URLs comuns da Deye Cloud
        const urls = [
            `${BASE_URL}/business/maintain/plant`,
            `${BASE_URL}/overview`,
            `${BASE_URL}/plant`,
            `${BASE_URL}/station`,
            `${BASE_URL}/dashboard`
        ];
        for (const u of urls) {
            try {
                await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await delay(page, 3000);
                const current = page.url();
                if (!/login/i.test(current)) {
                    console.log('✅ Navegou para:', u);
                    return true;
                }
            } catch (_) {}
        }
        // Fallback: clicar no menu Plant / Usinas
        const clicou = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a, [role="menuitem"], [class*="menu"] *, [class*="nav"] *'));
            const terms = ['plant', 'usina', 'estação', 'maintain', 'visão global', 'overview'];
            const el = links.find(l => {
                const t = (l.textContent || '').trim().toLowerCase();
                const h = (l.getAttribute('href') || '').toLowerCase();
                return terms.some(term => t.includes(term) || h.includes(term));
            });
            if (el) { (el.closest('a') || el).click(); return true; }
            return false;
        });
        if (clicou) {
            console.log('✅ Clicou no menu plant/usinas.');
            await delay(page, 4000);
            return true;
        }
        return false;
    } catch (e) {
        console.log('⚠️ irParaVisaoGlobal:', e?.message || e);
        return false;
    }
}

async function rodarRobo() {
    console.log('🚀 Iniciando sincronização Deye Cloud...\n');

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('🔗 Acessando', LOGIN_URL);
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(page, 2500);

        console.log('🍪 Clicando em "Concordo" (se houver)...');
        await clicarConcordo(page);
        await delay(page);
        console.log('🍪 Aceitando cookies (se houver)...');
        await aceitarCookies(page);
        await delay(page);

        const user = (process.env.DEYE_USER || process.env.DEYE_EMAIL || '').trim();
        const pass = (process.env.DEYE_PASS || '').trim();
        if (!user || !pass) {
            console.log('❌ DEYE_USER e DEYE_PASS (ou DEYE_EMAIL) são obrigatórios no .env.');
            console.log('   Se a senha tem # ou $, use aspas: DEYE_PASS="sua_senha#$"');
            throw new Error('Credenciais Deye não configuradas.');
        }

        console.log('🔐 Fazendo login (preenchendo caractere por caractere)...');
        await delay(page);
        const emailInput = page.locator('input[type="email"], input[type="text"]').first();
        const passInput = page.locator('input[type="password"]').first();
        if ((await emailInput.count()) > 0) {
            await emailInput.click();
            await delay(page, 600);
            await emailInput.fill('');
            await delay(page, 400);
            await emailInput.pressSequentially(user, { delay: 80 });
            await delay(page);
        }
        if ((await passInput.count()) > 0) {
            await passInput.click();
            await delay(page, 600);
            await passInput.fill('');
            await delay(page, 400);
            for (const c of pass) {
                await page.evaluate((char) => {
                    const input = document.querySelector('input[type="password"]');
                    if (input) {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                        if (nativeInputValueSetter) {
                            nativeInputValueSetter.call(input, input.value + char);
                        } else {
                            input.value += char;
                        }
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, c);
                await delay(page, 60);
            }
            await delay(page);
        }

        console.log('🔐 Clicando em "Iniciar sessão"...');
        await delay(page, 800);
        const btnIniciar = page.locator('button, [type="submit"], [role="button"]').filter({
            hasText: /iniciar sessão|iniciar sesión|sign in|login|entrar|log in/i
        }).first();
        if ((await btnIniciar.count()) > 0) {
            await btnIniciar.click();
        } else {
            await page.keyboard.press('Enter');
        }
        console.log('⏳ Aguardando carregamento após login (internet pode estar lenta)...');
        await delay(page, 12000);

        const aindaLogin = /login/i.test(page.url());
        if (aindaLogin) {
            console.log('⚠️ Ainda na página de login. Verifique usuário/senha ou faça login manualmente.');
            await delay(page, 10000);
        }

        console.log('📍 Indo para lista de usinas...');
        await delay(page, 3000);
        await irParaVisaoGlobal(page);
        await delay(page, 4000);

        // Usar 50 itens por página (padrão) e paginar
        console.log('✅ Usando 50 itens por página (padrão).');
        await delay(page, 1500);

        let totalGeral = 0;
        let temProxima = true;
        let paginaAtual = 1;
        let primeiroNomePrev = '';
        await delay(page);

        // Deye: só 3 páginas (50 + 50 + 39 usinas). Parar após página 3.
        while (temProxima && paginaAtual <= 3) {
            await delay(page, 800);
            if (paginaAtual >= 2 && primeiroNomePrev) {
                for (let w = 0; w < 30; w++) {
                    const { primeiro, paginaAtiva } = await page.evaluate((pag) => {
                        const root = document.querySelector('.plantList, [class*="plantList"]') || document;
                        const rows = root.querySelectorAll('tbody tr, table tbody tr, .el-table__row');
                        const dataRow = Array.from(rows).find(r => !r.querySelector('th') && r.querySelectorAll('td').length >= 2);
                        const primeiro = dataRow && dataRow.querySelectorAll('td').length ? (dataRow.querySelectorAll('td')[0].textContent || '').trim() : '';
                        const pagArea = document.querySelector('.el-pagination, [class*="pagination"], [class*="pager"]');
                        const ativo = pagArea ? Array.from(pagArea.querySelectorAll('li, span, button, a')).find(el => {
                            const t = (el.textContent || '').trim();
                            const cls = (el.className || '').toLowerCase();
                            return t === String(pag) && (cls.includes('active') || cls.includes('current'));
                        }) : null;
                        return { primeiro, paginaAtiva: !!ativo };
                    }, paginaAtual);
                    if (paginaAtiva && primeiro && primeiro !== primeiroNomePrev) break;
                    if (primeiro && primeiro !== primeiroNomePrev) break;
                    await delay(page, 500);
                }
                await delay(page, 800);
            }
            // Rolagem no div com scroll (plantList > panel > content > div) e coleta em chunks para pegar todas as usinas
            const usinasMap = new Map();
            for (let step = 0; step < 40; step++) {
                const result = await page.evaluate((stepIdx) => {
                    const plantList = document.querySelector('.plantList, [class*="plantList"]');
                    if (!plantList) return { noFim: true, chunk: [], debug: 'plantList não encontrado' };
                    const candidates = [
                        plantList.querySelector('.el-table__body-wrapper'),
                        plantList.querySelector('[class*="content"] > div'),
                        plantList.querySelector('.content > div'),
                        plantList.querySelector('[data-v-56b9a3b4]'),
                        ...Array.from(plantList.querySelectorAll('[class*="panel"] div, .content div'))
                    ].filter(Boolean);
                    const scrollables = candidates.filter(d => d.scrollHeight > d.clientHeight && d.scrollHeight > 80);
                    const scrollEl = scrollables.length
                        ? scrollables.reduce((best, d) => (d.scrollHeight > best.scrollHeight ? d : best), scrollables[0])
                        : candidates.reduce((best, d) => (d.scrollHeight > (best ? best.scrollHeight : 0) ? d : best), null);
                    const debug = scrollEl
                        ? `scrollEl: ${(scrollEl.className || '').slice(0, 40)} scrollH=${scrollEl.scrollHeight} clientH=${scrollEl.clientHeight} scrollTop=${scrollEl.scrollTop}`
                        : `scrollEl não encontrado (candidatos=${candidates.length})`;
                    if (stepIdx === 0 && scrollEl) scrollEl.scrollTop = 0;
                    const headerRow = plantList.querySelector('thead tr, table tr:first-child');
                    const ths = headerRow ? Array.from(headerRow.querySelectorAll('th, td')).map(h => (h.textContent || '').trim().toLowerCase()) : [];
                    const idx = (arr, ...keys) => arr.findIndex(h => h && keys.some(k => h.includes(k)));
                    const iNome = idx(ths, 'name', 'plant', 'station', 'usina', 'nome', 'estação');
                    const iStatus = idx(ths, 'status', 'state', 'estado', 'com');
                    const iCom = idx(ths, 'com', 'communication', 'comunicação');
                    const iPotencia = idx(ths, 'produção(kw)', 'producao(kw)', 'production', 'produção', 'power', 'potência', 'output', 'real-time', 'atual', 'kw');
                    const iCapacidade = idx(ths, 'capacity', 'capacidade', 'installed', 'kwp');
                    const iGeracao = idx(ths, 'today', 'hoje', 'generation', 'geração', 'energy', 'kwh', 'daily');
                    const rows = Array.from(plantList.querySelectorAll('tbody tr, table tr, .el-table__row'));
                    const chunk = rows
                        .filter(row => !row.querySelector('th') && row.querySelectorAll('td').length >= 2)
                        .map(row => {
                            const cols = Array.from(row.querySelectorAll('td'));
                            const get = (i) => (i >= 0 && cols[i] ? cols[i].textContent?.trim() : '') || '';
                            const statusCol = get(iCom) || get(iStatus);
                            return {
                                nome: get(iNome) || get(0) || get(1),
                                status: statusCol,
                                potencia: get(iPotencia) || get(2) || get(3) || get(4),
                                potenciaInstalada: get(iCapacidade) || get(4) || get(5),
                                geracaoDia: get(iGeracao) || get(5) || get(6)
                            };
                        })
                        .filter(u => u.nome && u.nome.length > 0);
                    if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight) {
                        scrollEl.scrollTop = Math.min(scrollEl.scrollTop + 380, scrollEl.scrollHeight);
                    }
                    const noFim = !scrollEl || scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 10;
                    return { noFim, chunk, debug };
                }, step);
                for (const u of result.chunk) if (u.nome) usinasMap.set(u.nome, u);
                if (result.noFim || (usinasMap.size >= 50 && step > 2)) break;
                await delay(page, 380);
            }
            const usinas = Array.from(usinasMap.values());

            if (paginaAtual >= 2 && usinas.length > 0 && primeiroNomePrev && usinas[0].nome === primeiroNomePrev) {
                console.log('   (Mesma página repetida; parando.)');
                temProxima = false;
                break;
            }

            if (usinas.length === 0 && paginaAtual === 1) {
                console.log('⚠️ Nenhuma usina encontrada na tabela. URL:', page.url());
                break;
            }

            for (const u of usinas) {
                const potenciaNum = parseFloat(String(u.potencia || '').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
                let potenciaInstaladaNum = null;
                if (u.potenciaInstalada) {
                    const p = parseFloat(String(u.potenciaInstalada).replace(/[^\d,.-]/g, '').replace(',', '.'));
                    if (!isNaN(p) && p > 0) potenciaInstaladaNum = p;
                }
                const geracaoNum = parseFloat(String(u.geracaoDia).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
                const statusFinal = calcularStatus(potenciaNum, potenciaInstaladaNum, u.status);
                const nomeCorrigido = corrigirEncoding(u.nome);

                const payload = {
                    nome_cliente: nomeCorrigido,
                    marca: 'Deye',
                    status: statusFinal,
                    potencia_atual_kw: Math.round(potenciaNum * 100) / 100,
                    potencia_kwp: potenciaInstaladaNum,
                    geracao_dia_kwh: Math.round(geracaoNum * 100) / 100,
                    ...(statusFinal !== 'offline' && { ultima_atualizacao: getDataHoraBrasil() })
                };
                const { error } = await supabase.from('usinas').upsert(payload, { onConflict: 'nome_cliente' });
                if (error) console.error(`❌ ${nomeCorrigido}:`, error.message);

                }
            totalGeral += usinas.length;
            if (usinas.length > 0) console.log(`📦 Página ${paginaAtual}: ${usinas.length} usinas (total ${totalGeral})`);
            primeiroNomePrev = usinas[0]?.nome || '';

            let clicouProxima = false;
            await delay(page, 1200);
            const proximoNum = paginaAtual + 1;
            const btnPagNum = page.locator(`[class*="pagination"] li, [class*="pager"] li, [class*="pagination"] *`).filter({ hasText: new RegExp(`^${proximoNum}$`) }).first();
            if ((await btnPagNum.count()) > 0) {
                try {
                    const isActive = await btnPagNum.evaluate(n => n.classList.contains('active') || n.classList.contains('current')).catch(() => true);
                    if (!isActive) {
                        await btnPagNum.scrollIntoViewIfNeeded().catch(() => {});
                        await delay(page, 400);
                        await btnPagNum.click();
                        clicouProxima = true;
                        paginaAtual++;
                        await delay(page, 5500);
                    }
                } catch (_) {}
            }
            if (!clicouProxima) {
                const seletoresNext = [
                    '.el-pagination__next:not(.disabled):not([class*="disabled"])',
                    'button.el-pagination__next',
                    '.el-pagination .el-pagination__next',
                    '.el-icon-arrow-right',
                    '[class*="arrow-right"]:not([class*="disabled"])',
                    'button.ant-pagination-item-link:has(span[aria-label="right"])',
                    '.ant-pagination-next:not(.ant-pagination-disabled)',
                    '.ant-pagination-next button',
                    '.el-pagination .btn-next:not(.disabled)',
                    '.el-pagination button.btn-next',
                    '.el-pager .btn-quicknext',
                    '[class*="pagination"] button:has(svg)',
                'button:has-text("Next")',
                'button:has-text("Próximo")',
                'button:has-text(">")',
                'span:has-text(">")',
                'a:has-text("Next")',
                'a:has-text(">")',
                '[aria-label="Next"]',
                '[aria-label="next"]',
                '[title="Next"]',
                '[title="next"]',
                'li.ant-pagination-next:not(.ant-pagination-disabled) button',
                '[class*="pagination"] [class*="next"]:not([class*="disabled"])',
                '[class*="pagination"] span[class*="arrow"]',
                '[class*="pager"] [class*="next"]'
            ];
            for (const sel of seletoresNext) {
                try {
                    const btn = page.locator(sel).first();
                    if ((await btn.count()) > 0) {
                        const dis = await btn.evaluate(n => n.disabled || n.classList.contains('disabled') || n.getAttribute('aria-disabled') === 'true').catch(() => true);
                        if (!dis) {
                            await delay(page, 600);
                            await btn.scrollIntoViewIfNeeded().catch(() => {});
                            await btn.click();
                            clicouProxima = true;
                            paginaAtual++;
                            await delay(page, 4500);
                            break;
                        }
                    }
                } catch (_) {}
            }
            if (!clicouProxima) {
                const clicouIcone = await page.evaluate(() => {
                    const pag = document.querySelector('.el-pagination, [class*="pagination"], [class*="pager"]');
                    if (!pag) return false;
                    const btns = Array.from(pag.querySelectorAll('button, a, [role="button"]')).filter(b => {
                        if (b.disabled || b.classList.contains('disabled') || b.classList.contains('is-disabled')) return false;
                        if (/^\d+$/.test((b.textContent || '').trim())) return false;
                        return b.offsetParent != null;
                    });
                    const comNext = btns.filter(b => {
                        const cls = (b.className || '').toLowerCase();
                        const hasSvg = b.querySelector && b.querySelector('svg');
                        return cls.includes('next') || cls.includes('arrow-right') || hasSvg;
                    });
                    const target = comNext.length ? comNext[comNext.length - 1] : btns[btns.length - 1];
                    if (target) { target.click(); return true; }
                    return false;
                });
                if (clicouIcone) {
                    paginaAtual++;
                    await delay(page, 5500);
                    clicouProxima = true;
                }
            }
            if (!clicouProxima) {
                const clicouPosicao = await page.evaluate(() => {
                    const pag = document.querySelector('.el-pagination, .ant-pagination, [class*="pagination"], [class*="pager"]');
                    if (!pag) return false;
                    const rect = pag.getBoundingClientRect();
                    const el = document.elementFromPoint(rect.right - 40, rect.top + rect.height / 2);
                    if (!el) return false;
                    const clickable = el.closest ? el.closest('button, a, [role="button"], li') : el;
                    if (clickable && clickable !== pag && !clickable.disabled && !/^\d+$/.test((clickable.textContent || '').trim())) {
                        clickable.click();
                        return true;
                    }
                    return false;
                });
                if (clicouPosicao) {
                    paginaAtual++;
                    await delay(page, 5500);
                    clicouProxima = true;
                }
            }
            if (!clicouProxima) {
                await delay(page, 500);
                const pagArea = page.locator('.ant-pagination, .el-pagination, [class*="pagination"], [class*="pager"]').first();
                if ((await pagArea.count()) > 0) {
                    await pagArea.scrollIntoViewIfNeeded().catch(() => {});
                    await page.evaluate(() => {
                        const pag = document.querySelector('.ant-pagination, .el-pagination, [class*="pagination"], [class*="pager"]');
                        if (pag && pag.scrollWidth > pag.clientWidth) {
                            pag.scrollLeft = pag.scrollWidth;
                        }
                    }).catch(() => {});
                }
                await delay(page, 400);
                const clicou = await page.evaluate(() => {
                    const pag = document.querySelector('.ant-pagination, .el-pagination, [class*="pagination"], [class*="pager"]');
                    if (!pag) return false;
                    const all = pag.querySelectorAll('button, a, span, li, div[role="button"]');
                    let next = Array.from(all).find(b => {
                        const t = (b.textContent || '').trim();
                        const a = (b.getAttribute('aria-label') || b.getAttribute('title') || '').toLowerCase();
                        const c = (b.className || '').toLowerCase();
                        const disabled = b.disabled || b.getAttribute('disabled') != null || b.classList.contains('disabled') || b.classList.contains('ant-pagination-disabled') || b.classList.contains('is-disabled');
                        const looksNext = t === '>' || t === '»' || /^next$/i.test(t) || /próxim/i.test(t) || a.includes('next') || c.includes('next') || c.includes('arrow');
                        return looksNext && !disabled && b.offsetParent != null;
                    });
                    if (!next) {
                        const clickables = Array.from(pag.querySelectorAll('button, a, [role="button"]')).filter(b => {
                            const disabled = b.disabled || b.getAttribute('disabled') != null || b.classList.contains('disabled') || b.classList.contains('is-disabled');
                            const t = (b.textContent || '').trim();
                            const isNum = /^\d+$/.test(t);
                            return !disabled && b.offsetParent != null && !isNum;
                        });
                        next = clickables[clickables.length - 1];
                    }
                    if (next) { next.click(); return true; }
                    return false;
                });
                if (clicou) {
                    paginaAtual++;
                    await delay(page, 5500);
                    clicouProxima = true;
                }
            }
            if (!clicouProxima && usinas.length > 0) {
                const proximoNum = paginaAtual + 1;
                const btnPag = page.locator('[class*="pagination"] *, [class*="pager"] *').filter({ hasText: new RegExp(`^${proximoNum}$`) }).first();
                if ((await btnPag.count()) > 0) {
                    await btnPag.scrollIntoViewIfNeeded().catch(() => {});
                    await delay(page, 400);
                    const clicouPag = await btnPag.click().then(() => true).catch(() => false);
                    if (clicouPag) {
                        paginaAtual++;
                        await delay(page, 5500);
                        clicouProxima = true;
                    }
                }
            }
            if (!clicouProxima && usinas.length > 0) {
                const clicouUltimo = await page.evaluate(() => {
                    const pag = document.querySelector('.ant-pagination, .el-pagination, [class*="pagination"], [class*="pager"]');
                    if (!pag) return false;
                    const items = pag.querySelectorAll('li, [class*="page"], button, a');
                    const last = Array.from(items).filter(el => {
                        const disabled = el.disabled || el.getAttribute('disabled') != null || el.classList.contains('disabled') || el.classList.contains('is-disabled');
                        const t = (el.textContent || '').trim();
                        if (/^\d+$/.test(t)) return false;
                        return !disabled && el.offsetParent != null;
                    }).pop();
                    if (last) { last.click(); return true; }
                    return false;
                });
                if (clicouUltimo) {
                    paginaAtual++;
                    await delay(page, 5500);
                    clicouProxima = true;
                }
            }
            if (!clicouProxima) {
                if (usinas.length > 0) console.log('   (Última página ou botão "Próxima" não encontrado.)');
                temProxima = false;
            }
            }
        }

        console.log(`\n🎉 Deye Cloud: ${totalGeral} usinas sincronizadas.`);
    } catch (err) {
        console.error('🔴 Erro:', err.message);
        if (typeof page !== 'undefined') {
            try {
                const info = await page.evaluate(() => ({ url: window.location.href, title: document.title }));
                console.log('📄 Página:', JSON.stringify(info, null, 2));
            } catch (_) {}
        }
    } finally {
        try { await browser.close(); } catch (_) {}
        console.log('🏁 Processo encerrado.');
    }
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.basename(process.argv[1]) === path.basename(__filename);
if (isMain) rodarRobo().catch((e) => { console.error('❌ Fatal:', e); process.exit(1); });
export { rodarRobo as rodarDeye };
