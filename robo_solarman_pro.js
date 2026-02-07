// @ts-nocheck
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { safeWait } from './robo_humanize.js';

chromium.use(stealth());
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const LOGIN_URL = 'https://pro.solarmanpv.com/login';
const INTERVALO_MS = 5 * 60 * 1000; // 5 minutos
const PLANTS_URL = 'https://globalpro.solarmanpv.com/business/maintain/plant';

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
    const getPart = (t) => partes.find(p => p.type === t)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}-03:00`;
}

function calcularStatus(potenciaAtual, potenciaInstalada, statusRaw = 'online') {
    let s = statusRaw === 'ligado' || statusRaw === 'online' ? 'online' : 'offline';
    if (potenciaInstalada && potenciaInstalada > 0) {
        const eff = (potenciaAtual / potenciaInstalada) * 100;
        const h = parseInt(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).split(':')[0]) || 0;
        if (h >= 14) {
            if (eff < 20 && potenciaAtual > 0) s = 'alerta';
            else if (potenciaAtual === 0) s = 'offline';
        } else if (potenciaAtual === 0 && h >= 8 && h <= 18) s = 'offline';
    } else if (potenciaAtual === 0 || /off|desligado/i.test(String(statusRaw))) s = 'offline';
    return s;
}

function parseNum(str) {
    if (str == null || str === '') return 0;
    const n = parseFloat(String(str).replace(/[^\d,.-]/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
}

async function extrairUsinasPagina(page) {
    return page.evaluate(() => {
        const hdrs = Array.from(document.querySelectorAll('thead th, .ant-table-thead th, table th')).map(h => (h.textContent || '').trim().toLowerCase());
        const idx = (arr, ...keys) => {
            for (const k of keys) {
                const i = arr.findIndex(h => h.includes(k));
                if (i >= 0) return i;
            }
            return -1;
        };
        const iNome = idx(hdrs, 'nome', 'name', 'estação', 'station', 'plant');
        const iStatus = idx(hdrs, 'status', 'state');
        const iGeracao = idx(hdrs, 'geração', 'gera', 'energy today', 'generation', 'dia', 'today');
        const iPotencia = idx(hdrs, 'potência', 'power', 'atual', 'current', 'gera');

        let rows = Array.from(document.querySelectorAll('.ant-table-tbody .ant-table-row, tbody tr, tr.el-table__row, tr:has(td)'));
        rows = rows.filter(r => r.querySelectorAll('td').length >= 2);

        return rows.map(row => {
            const cells = row.querySelectorAll('td, .ant-table-cell');
            const get = (i) => (i >= 0 && cells[i]) ? (cells[i].textContent || '').trim() : '';
            const nome = iNome >= 0 ? get(iNome) : (get(0) || get(1));
            let status = iStatus >= 0 ? get(iStatus) : '';
            if (!status) {
                const html = (row.innerHTML || '').toLowerCase();
                status = /green|online|ligado|conectado/.test(html) ? 'online' : 'offline';
            }
            const geracaoDia = iGeracao >= 0 ? get(iGeracao) : (get(2) || get(3) || get(4));
            const potenciaAtual = iPotencia >= 0 ? get(iPotencia) : (get(3) || get(4) || get(2));
            return { nome, status, geracaoDia, potenciaAtual };
        }).filter(u => u.nome && u.nome.length > 0);
    });
}

async function temTabelaUsinas(page) {
    try {
        const rows = await page.locator('.ant-table-tbody .ant-table-row, tbody tr:has(td), tr.el-table__row').count();
        return rows > 0;
    } catch {
        return false;
    }
}

async function configurar100PorPagina(page) {
    try {
        const sel = page.locator('.ant-pagination-options .ant-select, .el-pagination__sizes, [class*="pagination"] .ant-select, .ant-select-selector').first();
        if ((await sel.count()) > 0) {
            await sel.click();
            await safeWait(page, 800);
            const opt = page.locator('.ant-select-item, li, [class*="item"]').filter({ hasText: /100/ }).first();
            if ((await opt.count()) > 0) {
                await opt.click();
                await safeWait(page, 4000);
                return true;
            }
        }
    } catch (_) {}
    return false;
}

async function avancarPagina(page) {
    try {
        const btn = page.locator('button.ant-pagination-item-link:not(.ant-pagination-disabled)').filter({ has: page.locator('span[aria-label="right"]') }).first();
        if ((await btn.count()) > 0 && await btn.isVisible().catch(() => false)) {
            await btn.click();
            return true;
        }
    } catch (_) {}
    try {
        return await page.evaluate(() => {
            const pag = document.querySelector('.ant-pagination, .el-pagination, [class*="pagination"]');
            if (!pag) return false;
            const btns = pag.querySelectorAll('button, li, [role="button"]');
            const n = Array.from(btns).find(b => {
                const t = (b.textContent || '').trim();
                const a = (b.getAttribute('aria-label') || '').toLowerCase();
                return (t === '>' || t === '»' || a.includes('next')) && !b.disabled && !b.classList.contains('disabled');
            });
            if (n) { n.click(); return true; }
            return false;
        });
    } catch (_) {
        return false;
    }
}

/** Garante que está na página de usinas, configura 100/página, extrai todas as páginas e salva no Supabase. */
async function syncUsinas(page) {
    const url = page.url();
    if (!/plant|station|usina|maintain|list/i.test(url)) {
        try {
            await page.goto(PLANTS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await safeWait(page, 4000);
        } catch (e) {
            console.log('⚠️ Não foi possível ir para a tabela de usinas. Verifique se já está logado.');
            return 0;
        }
    }

    await safeWait(page, 2000);
    const config100 = await configurar100PorPagina(page);
    if (config100) console.log('✅ 100 itens/página.');

    let total = 0;
    let paginaAtual = 1;

    while (true) {
        const usinas = await extrairUsinasPagina(page);
        if (usinas.length === 0 && paginaAtual === 1) {
            console.log('⚠️ Nenhuma usina na tabela.');
            break;
        }

        for (const u of usinas) {
            const potenciaAtual = parseNum(u.potenciaAtual);
            const geracaoDia = parseNum(u.geracaoDia);
            const statusFinal = calcularStatus(potenciaAtual, null, u.status);
            const payload = {
                nome_cliente: u.nome,
                marca: 'Deye/Solarman',
                status: statusFinal,
                potencia_atual_kw: Math.round(potenciaAtual * 100) / 100,
                geracao_dia_kwh: Math.round(geracaoDia * 100) / 100,
                ...(statusFinal !== 'offline' && { ultima_atualizacao: getDataHoraBrasil() })
            };
            const { error } = await supabase.from('usinas').upsert(payload, { onConflict: 'nome_cliente' });
            if (error) console.error(`❌ ${u.nome}:`, error.message);
        }
        total += usinas.length;

        const temProxima = await avancarPagina(page);
        if (!temProxima) break;
        paginaAtual++;
        await safeWait(page, 3000);
    }

    return total;
}

async function rodarRobo() {
    console.log('🚀 Solarman Pro — login manual + atualização a cada 5 min (página aberta)\n');

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-web-security'
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    try {
        console.log('🔗 Acessando', LOGIN_URL);
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

        await page.pause();

        console.log('▶️ Robô assumindo (após Resume)...\n');

        let totalGeral = await syncUsinas(page);
        console.log(`\n🎉 Primeira sincronização: ${totalGeral} usinas.`);

        console.log(`\n⏰ Atualizando a cada 5 minutos. Página permanecerá aberta. (Ctrl+C para encerrar)\n`);

        while (true) {
            await safeWait(page, INTERVALO_MS);
            if (page.isClosed?.()) break;
            try {
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                await safeWait(page, 4000);
            } catch (_) {
                try {
                    await page.goto(PLANTS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await safeWait(page, 4000);
                } catch (e) {
                    console.log('⚠️ Erro ao recarregar. Verifique se o login ainda é válido.');
                    continue;
                }
            }
            const n = await syncUsinas(page);
            const h = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            console.log(`🔄 ${h} — ${n} usinas atualizadas.`);
        }
    } catch (err) {
        console.error('🔴 Erro:', err.message);
    } finally {
        console.log('🏁 Encerrando. Feche o navegador se ainda estiver aberto.');
    }
}

rodarRobo().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });
