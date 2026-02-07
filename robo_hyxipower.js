// @ts-nocheck
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { safeWait } from './robo_humanize.js';
import path from 'path';
import { fileURLToPath } from 'url';

chromium.use(stealth());
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const LOGIN_URL = 'https://www.hyxicloud.com/#/login?redirect=%2F';
const STATION_URL = 'https://www.hyxicloud.com/#/station';

function ensurePage(page, context) {
    if (!page || !page.isClosed?.()) return page;
    const open = context?.pages?.().filter((p) => !p.isClosed?.()) || [];
    return open[0] || null;
}

async function temTabelaLista(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        const ok = await page.evaluate(() => {
            const inDropdown = (el) => el.closest('.el-select-dropdown, .el-popper, [class*="dropdown"], [class*="popover"]');
            const main = document.querySelector('.tab-content-container, [class*="tab-content"], [class*="station"], main');
            const t = main
                ? (main.querySelector('.el-table, .ant-table, table') || main.querySelector('table'))
                : (document.querySelector('.el-table, .ant-table, table') || document.querySelector('table'));
            if (!t) return false;
            const scope = t;
            const rowSel = 'tbody tr, .el-table__body tr, .ant-table-tbody .ant-table-row, tr.el-table__row, tr.ant-table-row';
            let rows = Array.from(scope.querySelectorAll(rowSel)).filter((r) => !inDropdown(r) && !r.closest('thead') && !r.querySelector('th'));
            if (rows.length === 0 && scope !== document) {
                const docRows = Array.from(document.querySelectorAll(rowSel)).filter((r) => !inDropdown(r) && !r.closest('thead') && !r.querySelector('th'));
                rows = docRows;
            }
            const cellSel = 'td, .el-table__cell, .ant-table-cell, [class*="cell"]';
            const listRows = rows.filter((r) => {
                const hasColspan = !!r.querySelector('td[colspan]');
                const n = r.querySelectorAll(cellSel).length;
                return n >= 1 && !hasColspan;
            });
            return listRows.length >= 1;
        });
        return !!ok;
    } catch (_) {
        return false;
    }
}

async function fecharDropdowns(page) {
    try {
        if (!page || page.isClosed?.()) return;
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('Escape');
            await safeWait(page, 150);
        }
        await page.evaluate(() => {
            document.body.click();
        }).catch(() => {});
        await safeWait(page, 300);
    } catch (_) {}
}

/** Faz scroll horizontal na tabela para a direita, expondo colunas (capacidade, potência, etc.) antes da extração. */
async function scrollTabelaHorizontal(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        const scrolled = await page.evaluate(() => {
            const selectors = [
                '.el-table__body-wrapper',
                '.el-table__footer-wrapper',
                '.ant-table-body',
                '[class*="table"] [class*="scroll"]',
                '.tab-content-container [style*="overflow"]',
                'main [style*="overflow-x"]'
            ];
            let el = null;
            for (const sel of selectors) {
                const cand = document.querySelector(sel);
                if (cand && cand.scrollWidth > cand.clientWidth) { el = cand; break; }
            }
            if (!el) return false;
            const maxLeft = el.scrollWidth - el.clientWidth;
            el.scrollLeft = maxLeft;
            return true;
        });
        if (scrolled) await safeWait(page, 700);
        return !!scrolled;
    } catch (_) {
        return false;
    }
}

async function fecharPopUpManutencao(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        const btn = page.getByRole('button', { name: /entendido|understood|ok/i });
        if ((await btn.count()) > 0) {
            await btn.first().click();
            await safeWait(page, 800);
            return true;
        }
        const byText = page.locator('button, a, [role="button"]').filter({ hasText: /entendido|understood|ok/i }).first();
        if ((await byText.count()) > 0) {
            await byText.click();
            await safeWait(page, 800);
            return true;
        }
    } catch (_) {}
    return false;
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
    const getPart = (t) => partes.find(p => p.type === t)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}-03:00`;
}

function calcularStatus(potenciaAtual, potenciaInstalada, statusRaw = 'online') {
    const raw = String(statusRaw || '').trim().toLowerCase();
    const offlike = /off|desligado|defeito|离线|异常/i.test(raw);
    const onlike = /^(ligado|online|normal|conectado|running|ok|在线|正常)$/.test(raw);
    let s = offlike ? 'offline' : (onlike ? 'online' : 'offline');
    if (potenciaInstalada && potenciaInstalada > 0) {
        const eff = (potenciaAtual / potenciaInstalada) * 100;
        const h = parseInt(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).split(':')[0]) || 0;
        if (h >= 10 && h <= 16) {
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

/** Converte potência operacional: UI em W (ex. "768.0W") → kW. Se já for kW, mantém. */
function parsePotenciaOperacionalKw(raw) {
    if (raw == null || raw === '') return 0;
    const s = String(raw).trim();
    const val = parseNum(s);
    if (val === 0) return 0;
    if (/[.\d]\s*W\b/i.test(s) && !/kW|kwh/i.test(s)) return Math.round((val / 1000) * 100) / 100;
    return Math.round(val * 100) / 100;
}

async function extrairUsinasPagina(page, opts = {}) {
    const debug = !!opts.debug;
    const result = await page.evaluate((doDebug) => {
        const inDropdown = (el) => el.closest('.el-select-dropdown, .el-popper, [class*="dropdown"], [class*="popover"]');
        const mainContent = document.querySelector('.tab-content-container, [class*="tab-content"], [class*="station"], main');
        const mainTable = mainContent
            ? (mainContent.querySelector('.el-table, .ant-table, table') || mainContent.querySelector('table'))
            : (document.querySelector('.el-table, .ant-table, table[class*="table"]') || document.querySelector('table'));
        let scope = mainTable || mainContent || document;

        const getHeaderRow = () => {
            const thead = scope.querySelector('thead, .ant-table-thead, .el-table__header');
            if (!thead) return [];
            const rows = thead.querySelectorAll('tr');
            const last = rows[rows.length - 1];
            const ths = (last || thead).querySelectorAll('th, .el-table__cell');
            return Array.from(ths).map((th) => (th.textContent || '').trim().toLowerCase());
        };
        let hdrs = getHeaderRow();
        if (hdrs.length === 0) {
            hdrs = Array.from(scope.querySelectorAll('th, .el-table__cell')).map((h) => (h.textContent || '').trim().toLowerCase());
        }
        if (hdrs.length === 0) {
            const docTh = document.querySelectorAll('.el-table th, .el-table__header th, table th');
            if (docTh.length) hdrs = Array.from(docTh).map((h) => (h.textContent || '').trim().toLowerCase());
        }
        const seen = new Set();
        const hdrsUnique = [];
        for (const h of hdrs) {
            const k = (h || '').trim();
            if (!k || seen.has(k)) continue;
            seen.add(k);
            hdrsUnique.push(k);
        }
        const hdrsUse = hdrsUnique.length ? hdrsUnique : hdrs;
        const idx = (arr, ...keys) => {
            for (const k of keys) {
                const i = arr.findIndex((h) => h && h.includes(k));
                if (i >= 0) return i;
            }
            return -1;
        };
        const iNome = idx(hdrsUse, 'nome', 'name', 'estação', 'station', 'plant', 'usina');
        const iStatus = idx(hdrsUse, 'status', 'state', 'estado');
        const iGeracao = idx(hdrsUse, 'rendimento diário', 'rendimento', 'geração', 'gera', 'energy today', 'generation', 'dia', 'today', 'today\'s', 'kwh');
        const iCapacidade = idx(hdrsUse, 'capacidade instalada', 'capacidade de a operar', 'capacidade a operar', 'capacidade de operar', 'capacidade', 'instalada', 'installed', 'capacity', 'kwp', 'rated', 'tamanho', 'size');
        const iPotenciaOperacional = idx(hdrsUse, 'potência operacional', 'potência operací', 'operacional', 'operací', 'potência atual', 'atual', 'current', 'output', 'power', 'potência');

        const rowSel = 'tbody tr, .el-table__body tr, .ant-table-tbody .ant-table-row, tr.el-table__row, tr.ant-table-row, tr[class*="row"]';
        let rows = Array.from(scope.querySelectorAll(rowSel)).filter((r) => !inDropdown(r) && !r.closest('thead'));
        if (rows.length === 0 && scope !== document) {
            scope = document;
            rows = Array.from(scope.querySelectorAll(rowSel)).filter((r) => !inDropdown(r) && !r.closest('thead'));
        }
        const nBefore = rows.length;
        const cellSel = 'td, .el-table__cell, .ant-table-cell, [class*="cell"]';
        const rowFilterInfo = [];
        rows = rows.filter((r) => {
            if (r.querySelector('th')) return false;
            const tds = r.querySelectorAll(cellSel);
            const ok = tds.length >= 1;
            if (doDebug && rowFilterInfo.length < 5) rowFilterInfo.push({ nCells: tds.length, ok, firstText: (tds[0]?.textContent || '').trim().slice(0, 30) });
            return ok;
        });
        const nAfter = rows.length;

        const nc = hdrsUse.length;
        const getCell = (cells, i, stride) => {
            if (i < 0) return '';
            const j = stride * i;
            if (!cells[j]) return '';
            return (cells[j].textContent || '').trim();
        };

        const usinas = [];
        let debugInfo = null;
        for (let ri = 0; ri < rows.length; ri++) {
            const row = rows[ri];
            const cells = row.querySelectorAll(cellSel);
            const stride = (nc > 0 && cells.length >= 2 * nc && cells.length <= 2 * nc + 2) ? 2 : 1;
            const get = (i) => getCell(cells, i, stride);
            const nome = iNome >= 0 ? get(iNome) : get(0) || get(1);
            if (!nome || nome.length === 0) continue;
            let status = iStatus >= 0 ? get(iStatus) : '';
            if (!status) {
                const html = (row.innerHTML || '').toLowerCase();
                status = /green|online|ligado|conectado|running|normal/.test(html) ? 'online' : 'offline';
            }
            const geracaoDia = iGeracao >= 0 ? get(iGeracao) : '';
            const capacidadeInstalada = iCapacidade >= 0 ? get(iCapacidade) : '';
            const potenciaOperacionalRaw = iPotenciaOperacional >= 0 ? get(iPotenciaOperacional) : '';
            usinas.push({ nome, status, geracaoDia, capacidadeInstalada, potenciaOperacionalRaw });
            if (doDebug && ri === 0) {
                const cellTexts = Array.from(cells).map((c) => (c.textContent || '').trim().slice(0, 50));
                debugInfo = { hdrs: hdrsUse, cellTexts, nHeaders: nc, nCells: cells.length, stride, iNome, iStatus, iGeracao, iCapacidade, iPotenciaOperacional, nome, geracaoDia, capacidadeInstalada, potenciaOperacionalRaw };
            }
        }
        if (doDebug && !debugInfo) {
            let sampleCells = [];
            if (rows.length > 0) {
                const first = rows[0];
                sampleCells = Array.from(first.querySelectorAll(cellSel)).map((c) => (c.textContent || '').trim().slice(0, 40));
            }
            debugInfo = { hdrs: hdrsUse, nRowsBefore: nBefore, nRowsAfter: nAfter, nUsinas: usinas.length, sampleCells, rowFilterInfo, iNome, iStatus, iGeracao, iCapacidade, iPotenciaOperacional, hasMainTable: !!mainTable };
        }
        return { usinas, debug: debugInfo };
    }, debug);

    if (debug && result.debug) {
        console.log('🔍 Debug extração HyxiPower:', JSON.stringify(result.debug, null, 2));
    }
    return result.usinas;
}

async function mudarParaVisualizacaoLista(page) {
    try {
        await safeWait(page, 1500);
        await fecharPopUpManutencao(page);
        await safeWait(page, 500);

        if (await temTabelaLista(page)) {
            return true;
        }

        const btnLista = page.locator('button:has(use[href="#icon-tableDisplay"]), a:has(use[href="#icon-tableDisplay"]), [role="button"]:has(use[href="#icon-tableDisplay"]), span:has(use[href="#icon-tableDisplay"]), div:has(use[href="#icon-tableDisplay"])').first();
        if ((await btnLista.count()) > 0) {
            try {
                await btnLista.scrollIntoViewIfNeeded();
                await safeWait(page, 400);
                await btnLista.click({ force: true, timeout: 5000 });
                await safeWait(page, 3500);
                if (await temTabelaLista(page)) return true;
            } catch (_) {}
        }

        const clicouEvaluate = await page.evaluate(() => {
            const use = document.querySelector('use[href="#icon-tableDisplay"]')
                || Array.from(document.querySelectorAll('use')).find(u => (u.getAttribute('href') || u.getAttribute('xlink:href') || '') === '#icon-tableDisplay');
            if (!use) return false;
            let el = use.parentElement;
            while (el && el !== document.body) {
                if (/\bactive\b/.test((el.className || '').toString())) return false;
                const tag = (el.tagName || '').toLowerCase();
                const role = (el.getAttribute('role') || '').toLowerCase();
                if (tag === 'button' || tag === 'a' || role === 'button') { el.click(); return true; }
                if (el.onclick || /click|btn|button|icon/.test((el.className || '').toString())) { el.click(); return true; }
                el = el.parentElement;
            }
            const svg = use.closest('svg');
            if (svg?.parentElement) { svg.parentElement.click(); return true; }
            return false;
        });
        if (clicouEvaluate) {
            await safeWait(page, 3500);
            if (await temTabelaLista(page)) return true;
        }

        const desdobrar = page.getByText('Desdobrar', { exact: false });
        if ((await desdobrar.count()) > 0) {
            try {
                const container = desdobrar.first().locator('xpath=ancestor::*[.//use[@href="#icon-tableDisplay"]][1]');
                if ((await container.count()) > 0) {
                    const btn = container.locator('button:has(use[href="#icon-tableDisplay"]), [role="button"]:has(use[href="#icon-tableDisplay"])').first();
                    if ((await btn.count()) > 0) {
                        await btn.scrollIntoViewIfNeeded();
                        await safeWait(page, 300);
                        await btn.click({ force: true });
                        await safeWait(page, 3500);
                        return true;
                    }
                }
            } catch (_) {}
        }

        const iconLista = page.locator('use[href="#icon-tableDisplay"], use[xlink\\:href="#icon-tableDisplay"]').first();
        if ((await iconLista.count()) > 0) {
            try {
                await iconLista.scrollIntoViewIfNeeded();
                await safeWait(page, 400);
                const clicou = await page.evaluate(() => {
                    const use = document.querySelector('use[href="#icon-tableDisplay"]')
                        || Array.from(document.querySelectorAll('use')).find(u => (u.getAttribute('href') || u.getAttribute('xlink:href') || '') === '#icon-tableDisplay');
                    if (!use) return false;
                    let el = use.parentElement;
                    while (el && el !== document.body) {
                        if (/\bactive\b/.test((el.className || '').toString())) return false;
                        el = el.parentElement;
                    }
                    el = use;
                    while (el) {
                        const tag = (el.tagName || '').toLowerCase();
                        const role = (el.getAttribute('role') || '').toLowerCase();
                        if (tag === 'button' || tag === 'a' || role === 'button') { el.click(); return true; }
                        const cls = (el.className || '').toString();
                        if (/btn|button|icon/.test(cls) && typeof el.click === 'function') { el.click(); return true; }
                        el = el.parentElement;
                    }
                    const svg = use.closest('svg');
                    if (svg && svg.parentElement) { svg.parentElement.click(); return true; }
                    return false;
                });
                if (clicou) {
                    await safeWait(page, 3500);
                    if (await temTabelaLista(page)) return true;
                }
            } catch (_) {}
        }

        const keywords = ['lista', 'list', 'list view', 'visualização em lista', 'visualizacao em lista', 'tabela', 'table', '列表', '表格', '表'];
        const clicou = await page.evaluate((kws) => {
            const sidebars = document.querySelectorAll('nav, [class*="sidebar"], [class*="menu"]');
            const inSidebar = (el) => el.closest('nav, [class*="sidebar"], [class*="menu"], aside') != null;
            const all = Array.from(document.querySelectorAll(
                'button, a, [role="button"], [role="tab"], [class*="view"], [class*="toggle"], [class*="toolbar"] button, [class*="toolbar"] a, .el-radio-button, .ant-segmented-item, [class*="segmented"] > *'
            ));
            const mainOnly = all.filter(el => !inSidebar(el));
            const listBtn = (mainOnly.length ? mainOnly : all).find(el => {
                const t = (el.textContent || '').trim().toLowerCase();
                const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                const title = (el.getAttribute('title') || '').toLowerCase();
                const cls = (el.className || '').toLowerCase();
                const dataView = (el.getAttribute('data-view') || el.getAttribute('data-mode') || '').toLowerCase();
                if (kws.some(k => t.includes(k) || aria.includes(k) || title.includes(k) || dataView.includes(k))) return true;
                if (/list|lista|列表|表格/.test(cls) && !/grid|card|map|地图|卡片/.test(cls)) return true;
                return false;
            });
            if (listBtn) {
                const target = listBtn.closest('button') || listBtn.closest('a') || listBtn.closest('[role="button"]') || listBtn;
                target.click();
                return true;
            }
            const iconOnly = (mainOnly.length ? mainOnly : all).filter(el => {
                const txt = (el.textContent || '').trim();
                if (txt.length > 4) return false;
                const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                const title = (el.getAttribute('title') || '').toLowerCase();
                return /list|lista|列表|表格|table/.test(aria + title);
            });
            if (iconOnly.length) { iconOnly[0].click(); return true; }
            return false;
        }, keywords);
        if (clicou) {
            await safeWait(page, 2500);
            if (await temTabelaLista(page)) return true;
        }
        const loc = page.locator('button, a, [role="button"], [role="tab"], .el-radio-button, .ant-segmented-item').filter({
            hasText: /lista|list\s*(view)?|visualização\s*em\s*lista|tabela|表格|列表/
        }).first();
        if ((await loc.count()) > 0 && await loc.isVisible().catch(() => false)) {
            await loc.click();
            await safeWait(page, 2500);
            if (await temTabelaLista(page)) return true;
        }
        const byAria = page.locator('[aria-label*="list" i], [aria-label*="lista" i], [aria-label*="列表" i], [title*="list" i], [title*="lista" i], [title*="列表" i]').first();
        if ((await byAria.count()) > 0 && await byAria.isVisible().catch(() => false)) {
            await byAria.click();
            await safeWait(page, 2500);
            if (await temTabelaLista(page)) return true;
        }
        const main = page.locator('main, [class*="station"], [class*="content"]').first();
        for (const scope of [main, page]) {
            const byText = scope.getByText(/列表|lista|list\s*view|visualização\s*em\s*lista|tabela/i).first();
            if ((await byText.count()) > 0) {
                try {
                    await byText.scrollIntoViewIfNeeded();
                    await safeWait(page, 300);
                    await byText.click();
                    await safeWait(page, 2500);
                    if (await temTabelaLista(page)) return true;
                } catch (_) {}
            }
        }
        const byTextCn = page.getByText('列表').first();
        if ((await byTextCn.count()) > 0) {
            try {
                await byTextCn.scrollIntoViewIfNeeded();
                await safeWait(page, 300);
                await byTextCn.click();
                await safeWait(page, 2500);
                if (await temTabelaLista(page)) return true;
            } catch (_) {}
        }
        const debug = await page.evaluate(() => {
            const use = document.querySelector('use[href="#icon-tableDisplay"]')
                || document.querySelector('use[xlink\\:href="#icon-tableDisplay"]')
                || Array.from(document.querySelectorAll('use')).find(u => (u.getAttribute('href') || u.getAttribute('xlink:href') || '') === '#icon-tableDisplay');
            const useInfo = use ? {
                found: true,
                href: use.getAttribute('href') || use.getAttribute('xlink:href'),
                parentTag: use.parentElement?.tagName,
                parentClass: (use.parentElement?.className || '').toString().slice(0, 80),
                ancestors: (() => {
                    const a = [];
                    let el = use;
                    for (let i = 0; i < 6 && el; i++) {
                        el = el.parentElement;
                        if (el) a.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60) });
                    }
                    return a;
                })()
            } : { found: false };
            const all = Array.from(document.querySelectorAll('button, a, [role="button"], [role="tab"], [class*="view"], [class*="toggle"], [class*="toolbar"] *'));
            const candidatos = all.slice(0, 30).map(el => ({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 30), aria: el.getAttribute('aria-label') || '', cls: (el.className || '').slice(0, 60) }));
            return { useIconTableDisplay: useInfo, candidatos };
        }).catch(() => ({}));
        console.log('🔍 Debug (lista não ativada) – icon-tableDisplay e candidatos:', JSON.stringify(debug, null, 2));
    } catch (_) {}
    return false;
}

async function ajustarTela(page) {
    try {
        await page.evaluate(() => {
            document.documentElement.style.overflow = 'visible';
            document.body.style.overflow = 'visible';
            document.body.style.minHeight = '100vh';
            document.body.style.zoom = '1';
            const sel = '#app, main, [class*="content"], [class*="layout"], [class*="container"], [class*="scroll"], [class*="wrapper"], [class*="station"]';
            for (const el of document.querySelectorAll(sel)) {
                el.style.overflow = 'visible';
                el.style.maxHeight = 'none';
            }
            window.scrollTo(0, 0);
            const table = document.querySelector('table, .ant-table, .el-table, [class*="table"]');
            if (table) {
                table.style.overflow = 'visible';
                table.scrollIntoView({ block: 'start', behavior: 'instant' });
            }
            const main = document.querySelector('main, [class*="content"]');
            if (main) main.scrollIntoView({ block: 'start', behavior: 'instant' });
        });
        await safeWait(page, 500);
    } catch (_) {}
}

async function configurar100PorPagina(page) {
    try {
        const sel = page.locator('.ant-pagination-options .ant-select, .el-pagination__sizes, [class*="pagination"] .ant-select, .ant-select-selector, [class*="page-size"]').first();
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

async function rodarRobo() {
    console.log('🚀 Iniciando sincronização HyxiPower...\n');

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-web-security'
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1400 }
    });

    let page = await context.newPage();

    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    try {
        console.log('🔗 Acessando', LOGIN_URL);
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await safeWait(page, 2000);

        await page.evaluate(() => {
            const accept = Array.from(document.querySelectorAll('button, a, [role="button"]')).find(b => /accept|aceitar|concordo|同意|ok/i.test((b.textContent || '').trim()));
            if (accept) accept.click();
        }).catch(() => {});
        await safeWait(page, 1000);

        console.log('🖥️ Ajustando tela (login)...');
        await ajustarTela(page);
        await safeWait(page, 300);

        const user = process.env.HYXI_USER || process.env.HYXIPOWER_USER || '';
        const pass = process.env.HYXI_PASS || process.env.HYXIPOWER_PASS || '';

        console.log('🔐 Fazendo login...');
        const loginOk = await page.evaluate(({ user, pass }) => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const u = inputs.find(i => (i.type === 'text' || i.type === 'email') && !i.hidden);
            const p = inputs.find(i => i.type === 'password');
            if (!u || !p) return false;
            u.focus();
            u.value = user;
            u.dispatchEvent(new Event('input', { bubbles: true }));
            p.focus();
            p.value = pass;
            p.dispatchEvent(new Event('input', { bubbles: true }));
            const btn = Array.from(document.querySelectorAll('button, [type="submit"], [role="button"], a')).find(b => {
                const t = (b.textContent || '').toLowerCase();
                return /login|entrar|sign in|log in|登录/.test(t) && t.length < 50;
            });
            if (btn) { btn.click(); return true; }
            return false;
        }, { user, pass });

        if (!loginOk) {
            console.log('⚠️ Campos de login não encontrados. Tentando Enter...');
            await page.keyboard.press('Enter').catch(() => {});
        }

        await safeWait(page, 4000);
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

        console.log('🖥️ Ajustando tela (pós-login)...');
        await ajustarTela(page);
        await safeWait(page, 500);

        console.log('📍 Indo para Station...');
        const url = page.url();
        if (!/station|plant|usina/i.test(url)) {
            try {
                await page.goto(STATION_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await safeWait(page, 4000);
            } catch (_) {}
            const clicou = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a, [role="menuitem"], [class*="menu"] span, [class*="nav"]'));
                const station = links.find(el => /station|estação|estacao|plant|usina|电站/i.test((el.textContent || '').toLowerCase()));
                if (station) { (station.closest('a') || station).click(); return true; }
                return false;
            });
            if (clicou) await safeWait(page, 4000);
        }

        await safeWait(page, 4000);

        console.log('🔔 Fechando pop-up de manutenção (se houver)...');
        if (await fecharPopUpManutencao(page)) console.log('✅ Pop-up fechado.');
        await safeWait(page, 500);

        console.log('📋 Mudando para visualização em lista...');
        const mudouLista = await mudarParaVisualizacaoLista(page);
        if (mudouLista) console.log('✅ Visualização em lista ativada.');
        else console.log('⚠️ Botão "lista" não encontrado; seguindo com a view atual.');

        await safeWait(page, 2500);

        page = ensurePage(page, context);
        if (!page) {
            const abas = (context?.pages?.() || []).filter((p) => !p.isClosed?.());
            if (abas.length) {
                page = abas[abas.length - 1];
                console.log('⚠️ Página anterior fechada; usando nova aba (lista?).');
            }
        }
        if (!page) throw new Error('Página fechada após clicar em lista e não há outra aba.');

        console.log('🖥️ Ajustando tela...');
        try {
            await ajustarTela(page);
        } catch (e) {
            if (/closed|target.*closed/i.test(String(e?.message || ''))) {
                console.log('⚠️ Erro "página fechada" no ajuste. Tentando recuperar...');
                page = context?.pages?.().find((p) => !p.isClosed?.()) || null;
                if (page) {
                    await ajustarTela(page);
                } else throw new Error('Página fechada durante ajuste de tela.');
            } else throw e;
        }

        const config100 = await configurar100PorPagina(page);
        if (config100) console.log('✅ 100 itens/página.');
        await ajustarTela(page);

        await fecharDropdowns(page);

        let totalGeral = 0;
        let paginaAtual = 1;

        while (true) {
            const scrollOk = await scrollTabelaHorizontal(page);
            if (scrollOk && paginaAtual === 1) console.log('↔️ Scroll horizontal na tabela (expor colunas).');
            const usinas = await extrairUsinasPagina(page, { debug: paginaAtual === 1 });
            if (usinas.length === 0 && paginaAtual === 1) {
                console.log('⚠️ Nenhuma usina na tabela. URL:', page.url());
                break;
            }

            for (const u of usinas) {
                const potenciaOperacionalKw = parsePotenciaOperacionalKw(u.potenciaOperacionalRaw);
                const capacidadeInstalada = parseNum(u.capacidadeInstalada);
                const geracaoDia = parseNum(u.geracaoDia);
                const statusFinal = calcularStatus(potenciaOperacionalKw, capacidadeInstalada > 0 ? capacidadeInstalada : null, u.status);
                const payload = {
                    nome_cliente: u.nome,
                    marca: 'HYXIPOWER',
                    status: statusFinal,
                    potencia_atual_kw: potenciaOperacionalKw,
                    potencia_kwp: capacidadeInstalada > 0 ? Math.round(capacidadeInstalada * 100) / 100 : null,
                    geracao_dia_kwh: Math.round(geracaoDia * 100) / 100,
                    ...(statusFinal !== 'offline' && { ultima_atualizacao: getDataHoraBrasil() })
                };
                const { error } = await supabase.from('usinas').upsert(payload, { onConflict: 'nome_cliente' });
                if (error) console.error(`❌ ${u.nome}:`, error.message);
            }
            totalGeral += usinas.length;
            if (usinas.length > 0)
                console.log(`📦 Página ${paginaAtual}: ${usinas.length} usinas (total ${totalGeral})`);

            const temProxima = await avancarPagina(page);
            if (!temProxima) break;
            paginaAtual++;
            await safeWait(page, 3000);
        }

        console.log(`\n🎉 HyxiPower: ${totalGeral} usinas sincronizadas.`);
    } catch (err) {
        console.error('🔴 Erro:', err.message);
    } finally {
        try { await browser.close(); } catch (_) {}
        console.log('🏁 Processo encerrado.');
    }
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.basename(process.argv[1]) === path.basename(__filename);
if (isMain) rodarRobo().catch((e) => { console.error('❌ Fatal:', e); process.exit(1); });
export { rodarRobo as rodarHyxi };
