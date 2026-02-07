// @ts-nocheck
/**
 * Robô Sungrow (iSolarCloud) – coleta usinas em https://web3.isolarcloud.com.hk
 * Fluxo: cookies → login → Estação de energia → 100/página → scroll horizontal → extrair.
 */
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { safeWait } from './robo_humanize.js';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

chromium.use(stealth());
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const LOGIN_URL = 'https://web3.isolarcloud.com.hk/#/login';
const APP_BASE = 'https://web3.isolarcloud.com.hk';
const STATION_URL = 'https://web3.isolarcloud.com.hk/#/station';

const isComplianceUrl = (u) => /cookiesIs|cookies\.html|compliance|static\/html\/compliance/i.test(u);

function ensurePage(page, context) {
    if (!page || !page.isClosed?.()) return page;
    const open = context?.pages?.().filter((p) => !p.isClosed?.()) || [];
    return open[0] || null;
}

const COOKIES_URL = 'cookiesIs.html';

async function aceitarCookies(page, context) {
    try {
        const pages = (context && context.pages()) || [];
        const cookieTab = pages.find((p) => !p.isClosed?.() && p.url().includes(COOKIES_URL));

        if (cookieTab) {
            console.log('🍪 Aba de cookies (compliance) detectada. Aceitando e fechando...');
            try {
                const clicked = await cookieTab.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, a, [role="button"], [class*="button"], [class*="btn"]'));
                    const accept = btns.find((b) => {
                        const t = (b.textContent || '').trim();
                        return /sim\s*[,]?\s*eu\s+concordo|sim\s+eu\s+concordo|eu\s+concordo|accept|aceitar|agree|concordo|同意|ok|allow|permitir|consentir/i.test(t);
                    });
                    if (accept) { accept.click(); return true; }
                    return false;
                });
                if (clicked) console.log('✅ Cookies aceitos na aba de compliance.');
                await safeWait(cookieTab, 800);
                await cookieTab.close();
                await safeWait(page, 500);
                if (page && !page.isClosed?.()) await page.bringToFront().catch(() => {});
            } catch (e) {
                try { await cookieTab.close(); } catch (_) {}
                if (page && !page.isClosed?.()) await page.bringToFront().catch(() => {});
            }
            return true;
        }

        if (!page || page.isClosed?.()) return false;
        console.log('🍪 Procurando botão "Sim, eu concordo" / aceitar cookies...');
        const ok = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a, [role="button"], [class*="button"], [class*="btn"]'));
            const accept = btns.find((b) => {
                const t = (b.textContent || '').trim();
                return /sim\s*[,]?\s*eu\s+concordo|sim\s+eu\s+concordo|eu\s+concordo|accept|aceitar|agree|concordo|同意|ok|allow|permitir|consentir/i.test(t);
            });
            if (accept) { accept.click(); return true; }
            return false;
        });
        if (ok) {
            console.log('✅ Cookies aceitos.');
            await safeWait(page, 1000);
        } else {
            console.log('⚠️ Botão de cookies não encontrado.');
        }
        return !!ok;
    } catch (e) {
        console.log('⚠️ Erro ao aceitar cookies:', e?.message || e);
        return false;
    }
}

async function fecharPopUpManutencao(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        const btn = page.getByRole('button', { name: /entendido|understood|ok|aceitar|accept/i });
        if ((await btn.count()) > 0) { await btn.first().click(); await safeWait(page, 800); return true; }
        const byText = page.locator('button, a, [role="button"]').filter({ hasText: /entendido|understood|ok|aceitar|accept/i }).first();
        if ((await byText.count()) > 0) { await byText.click(); await safeWait(page, 800); return true; }
    } catch (_) {}
    return false;
}

async function fecharPopupInformacoes(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        const closed = await page.evaluate(() => {
            const tryClose = (container) => {
                if (!container) return false;
                const x = container.querySelector('.el-message-box__headerbtn, .el-message-box__btns button, button[class*="close"], [aria-label="Close"], [class*="el-dialog__close"]');
                if (x) { x.click(); return true; }
                const btns = container.querySelectorAll('button');
                for (const b of btns) {
                    if (/ok|confirm|entendido|aceitar|accept|确定|关闭/i.test((b.textContent || '').trim())) { b.click(); return true; }
                }
                if (btns.length) { btns[btns.length - 1].click(); return true; }
                return false;
            };
            const byAria = document.querySelector('[aria-label="Informações"]');
            if (tryClose(byAria)) return true;
            const byClass = document.querySelector('.el-overlay-message-box');
            if (tryClose(byClass)) return true;
            const sel = '[class*="popup"], [class*="modal"], [class*="message"], .el-message, .el-notification, [class*="el-message"]';
            const candidates = Array.from(document.querySelectorAll(sel));
            const withInfo = candidates.filter((el) => /informações|information|info/i.test((el.textContent || '') + (el.getAttribute('aria-label') || '')));
            for (const el of withInfo) {
                if (tryClose(el)) return true;
            }
            const all = document.querySelectorAll('button, [role="button"]');
            for (const b of all) {
                const parent = b.closest(sel);
                if (parent && /informações|information|info/i.test((parent.textContent || '') + (parent.getAttribute('aria-label') || ''))) {
                    if (/close|fechar|×|x|ok|confirm|entendido|aceitar/i.test((b.textContent || '').trim())) { b.click(); return true; }
                }
            }
            return false;
        });
        if (closed) {
            console.log('✅ Popup "Informações" fechado.');
            await safeWait(page, 600);
        }
        return !!closed;
    } catch (e) {
        console.log('⚠️ Erro ao fechar popup Informações:', e?.message || e);
        return false;
    }
}

async function ativarAbaSenhaConta(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        const clicked = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('[role="tab"], .el-tabs__item, [class*="tab"], [class*="tabs"] span, [class*="tabs"] a'));
            const senha = tabs.find((t) => /senha da conta|account password|password|conta|senha/i.test((t.textContent || '').trim()) && !/e-mail|email|login por/i.test((t.textContent || '').trim()));
            if (senha) {
                senha.click();
                return true;
            }
            return false;
        });
        if (clicked) await safeWait(page, 800);
        return !!clicked;
    } catch (_) {}
    return false;
}

async function selecionarSiteServidor(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        const siteInput = page.locator('input[readonly][placeholder*="servidor"], input[readonly][placeholder*="server"], input[placeholder*="selecione um site"], input[placeholder*="select a site"]').first();
        if ((await siteInput.count()) === 0) return false;
        await siteInput.click();
        await safeWait(page, 1000);
        const selector = '.el-select-dropdown__item, [class*="select-dropdown"] li, [class*="dropdown"] [class*="item"]';
        await page.waitForSelector(selector, { state: 'visible', timeout: 3000 }).catch(() => {});
        const opt = page.locator(selector).first();
        if ((await opt.count()) > 0) {
            await opt.click();
            console.log('✅ Site do servidor selecionado.');
            await safeWait(page, 600);
            return true;
        }
        await page.keyboard.press('Escape');
        return false;
    } catch (_) {}
    return false;
}

async function fazerLoginAutomatico(page, user, pass, useVueSetter = false) {
    if (!user || !pass) return { success: false, reason: 'user_or_pass_empty' };
    try {
        await ativarAbaSenhaConta(page);
        await safeWait(page, 1200);
        await selecionarSiteServidor(page);
        await safeWait(page, 600);
        await page.waitForSelector('input[type="password"]', { state: 'visible', timeout: 8000 }).catch(() => {});

        if (useVueSetter) {
            await fecharPopupInformacoes(page);
            await safeWait(page, 400);
            const ok = await page.evaluate(({ user, pass }) => {
                const p = document.querySelector('input[type="password"]');
                if (!p) return false;
                const scope = p.closest('form') || p.closest('[class*="login"], [class*="form"], [class*="content"]') || document;
                const cand = Array.from(scope.querySelectorAll('input[type="text"], input[type="email"]')).filter((i) => i.type !== 'hidden' && !i.readOnly && !i.hasAttribute('readonly'));
                let u = cand.find((i) => !/servidor|server|selecione um site/i.test((i.placeholder || '') + (i.getAttribute('aria-label') || '')));
                if (!u && cand.length) u = cand.find((i) => !/site|servidor|server/i.test((i.placeholder || ''))) || cand[cand.length - 1];
                const btn = Array.from(document.querySelectorAll('button, [type="submit"], [role="button"]')).find((b) => /login|entrar|sign in|log in|登录/i.test((b.textContent || '')));
                if (!u || !p) return false;
                const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                if (set) {
                    set.call(u, user);
                    u.dispatchEvent(new Event('input', { bubbles: true }));
                    u.dispatchEvent(new Event('change', { bubbles: true }));
                    set.call(p, pass);
                    p.dispatchEvent(new Event('input', { bubbles: true }));
                    p.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    u.value = user;
                    p.value = pass;
                    u.dispatchEvent(new Event('input', { bubbles: true }));
                    p.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (u && u.blur) u.blur();
                if (p && p.blur) p.blur();
                return true;
            }, { user, pass });
            if (!ok) return { success: false, reason: 'vue_setter_inputs_not_found' };
            await safeWait(page, 1000);
            await fecharPopupInformacoes(page);
            await safeWait(page, 400);
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button, [type="submit"], [role="button"]')).find((b) => /login|entrar|sign in|log in|登录/i.test((b.textContent || '')));
                const p = document.querySelector('input[type="password"]');
                const form = p?.closest('form');
                if (btn && !btn.disabled) btn.click();
                else if (form) form.submit();
            });
        } else {
            const uSel = page.locator('input[type="text"]:not([readonly]):not([placeholder*="servidor"]):not([placeholder*="server"]), input[type="email"]:not([readonly]):not([placeholder*="servidor"]):not([placeholder*="server"])').first();
            const pSel = page.locator('input[type="password"]').first();
            const bSel = page.locator('button, [type="submit"], [role="button"]').filter({ hasText: /login|entrar|sign in|log in|登录/i }).first();

            if ((await uSel.count()) === 0 || (await pSel.count()) === 0) {
                return { success: false, reason: 'inputs_not_found' };
            }

            await uSel.click();
            await uSel.fill('');
            await uSel.fill(user);
            await safeWait(page, 200);
            await page.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input[type="text"]:not([readonly]), input[type="email"]:not([readonly])'));
                const i = inputs.find((el) => !/servidor|server/i.test((el.placeholder || '') + (el.getAttribute('aria-label') || '')));
                if (i) { i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur?.(); }
            });
            await safeWait(page, 200);

            await pSel.click();
            await pSel.fill('');
            await pSel.fill(pass);
            await safeWait(page, 400);
            await page.evaluate(() => {
                const i = document.querySelector('input[type="password"]');
                if (i) {
                    i.dispatchEvent(new Event('input', { bubbles: true }));
                    i.dispatchEvent(new Event('change', { bubbles: true }));
                    i.blur?.();
                }
            });
            await safeWait(page, 1200);

            await fecharPopupInformacoes(page);
            await safeWait(page, 500);
            await page.waitForFunction(
                () => {
                    const btns = Array.from(document.querySelectorAll('button, [type="submit"], [role="button"]'));
                    const loginBtn = btns.find((b) => /login|entrar|sign in|log in|登录/i.test((b.textContent || '')));
                    return loginBtn && !loginBtn.disabled && loginBtn.getAttribute('aria-disabled') !== 'true';
                },
                { timeout: 8000 }
            ).catch(() => {});
            await bSel.scrollIntoViewIfNeeded().catch(() => {});
            await safeWait(page, 300);
            if ((await bSel.count()) > 0) await bSel.click().catch(() => {});
            await safeWait(page, 1000);
            if (/\/login|#\/login/i.test(page.url())) {
                await fecharPopupInformacoes(page);
                await safeWait(page, 300);
                if ((await bSel.count()) > 0) await bSel.click({ force: true }).catch(() => {});
            }
            if (/\/login|#\/login/i.test(page.url())) await page.keyboard.press('Enter');
        }

        await safeWait(page, 1500);
        const navegou = await page.waitForFunction(
            () => !/\/login|#\/login/i.test(window.location.href),
            { timeout: 25000 }
        ).then(() => true).catch(() => false);
        if (navegou) return { success: true };
        if (!/\/login|#\/login/i.test(page.url())) return { success: true };
        const errMsg = await page.evaluate(() => {
            const t = (document.body?.innerText || '').toLowerCase();
            if (/incorreto|invalid|incorrect|wrong|erro|error|falha|failed|incorrecto|credencial/i.test(t)) return 'invalid_credentials';
            return '';
        }).catch(() => '');
        return { success: false, reason: errMsg || 'still_on_login' };
    } catch (e) {
        return { success: false, reason: e?.message || 'error' };
    }
}

async function ajustarTelaLogin(page) {
    try {
        if (!page || page.isClosed?.()) return;
        await page.evaluate(() => {
            const setVisible = (el) => {
                if (!el?.style) return;
                el.style.overflow = 'visible';
                el.style.overflowX = 'visible';
                el.style.overflowY = 'visible';
                el.style.maxHeight = 'none';
            };
            document.documentElement.style.overflow = 'visible';
            document.documentElement.style.overflowY = 'visible';
            document.body.style.overflow = 'visible';
            document.body.style.overflowY = 'visible';
            document.body.style.minHeight = '100vh';
            document.body.style.zoom = '1';
            ['#app', 'main', '[class*="content"]', '[class*="layout"]', '[class*="container"]', '[class*="scroll"]', '[class*="wrapper"]'].forEach((sel) => {
                try { document.querySelectorAll(sel).forEach(setVisible); } catch (_) {}
            });
            const form = document.querySelector('form');
            const pw = document.querySelector('input[type="password"]');
            const target = pw || form || document.querySelector('[class*="login"]');
            if (target) target.scrollIntoView({ block: 'center', behavior: 'instant' });
            else window.scrollTo({ top: Math.max(0, document.body.scrollHeight - window.innerHeight), left: 0, behavior: 'instant' });
        });
        await safeWait(page, 400);
    } catch (_) {}
}

async function fecharDropdowns(page) {
    try {
        if (!page || page.isClosed?.()) return;
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('Escape');
            await safeWait(page, 150);
        }
        await page.evaluate(() => document.body.click()).catch(() => {});
        await safeWait(page, 300);
    } catch (_) {}
}

async function scrollTabelaHorizontal(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        const scrolled = await page.evaluate(() => {
            const selectors = ['.el-table__body-wrapper', '.el-table__footer-wrapper', '.ant-table-body', '[class*="table"] [class*="scroll"]', 'main [style*="overflow-x"]'];
            let el = null;
            for (const sel of selectors) {
                const c = document.querySelector(sel);
                if (c && c.scrollWidth > c.clientWidth) { el = c; break; }
            }
            if (!el) return false;
            el.scrollLeft = el.scrollWidth - el.clientWidth;
            return true;
        });
        if (scrolled) await safeWait(page, 700);
        return !!scrolled;
    } catch (_) {
        return false;
    }
}

async function temTabelaLista(page) {
    try {
        if (!page || page.isClosed?.()) return false;
        return !!await page.evaluate(() => {
            const inDrop = (el) => el.closest('.el-select-dropdown, .el-popper, [class*="dropdown"]');
            const main = document.querySelector('.tab-content-container, [class*="station"], main');
            const t = main ? (main.querySelector('.el-table, .ant-table, table') || main.querySelector('table')) : (document.querySelector('.el-table, .ant-table, table') || document.querySelector('table'));
            if (!t) return false;
            const rowSel = 'tbody tr, .el-table__body tr, .ant-table-tbody .ant-table-row, tr.el-table__row, tr.ant-table-row';
            let rows = Array.from(t.querySelectorAll(rowSel)).filter((r) => !inDrop(r) && !r.closest('thead') && !r.querySelector('th'));
            if (!rows.length) rows = Array.from(document.querySelectorAll(rowSel)).filter((r) => !inDrop(r) && !r.closest('thead') && !r.querySelector('th'));
            const cellSel = 'td, .el-table__cell, .ant-table-cell, [class*="cell"]';
            const list = rows.filter((r) => r.querySelectorAll(cellSel).length >= 1 && !r.querySelector('td[colspan]'));
            return list.length >= 1;
        });
    } catch (_) {
        return false;
    }
}

async function mudarParaVisualizacaoLista(page) {
    try {
        await safeWait(page, 1500);
        if (await temTabelaLista(page)) return true;

        const btn = page.locator('button:has(use[href="#icon-tableDisplay"]), a:has(use[href="#icon-tableDisplay"]), [role="button"]:has(use[href="#icon-tableDisplay"]), div:has(use[href="#icon-tableDisplay"])').first();
        if ((await btn.count()) > 0) {
            await btn.scrollIntoViewIfNeeded();
            await safeWait(page, 400);
            await btn.click({ force: true, timeout: 5000 });
            await safeWait(page, 3500);
            if (await temTabelaLista(page)) return true;
        }

        const clicou = await page.evaluate(() => {
            const use = document.querySelector('use[href="#icon-tableDisplay"]') || Array.from(document.querySelectorAll('use')).find((u) => (u.getAttribute('href') || u.getAttribute('xlink:href') || '') === '#icon-tableDisplay');
            if (!use) return false;
            let el = use.parentElement;
            while (el && el !== document.body) {
                if (/\bactive\b/.test((el.className || '').toString())) return false;
                if (['button', 'a'].includes((el.tagName || '').toLowerCase()) || (el.getAttribute('role') || '') === 'button') { el.click(); return true; }
                el = el.parentElement;
            }
            const svg = use.closest('svg');
            if (svg?.parentElement) { svg.parentElement.click(); return true; }
            return false;
        });
        if (clicou) {
            await safeWait(page, 3500);
            if (await temTabelaLista(page)) return true;
        }

        const icon = page.locator('use[href="#icon-tableDisplay"]').first();
        if ((await icon.count()) > 0) {
            await icon.scrollIntoViewIfNeeded();
            await safeWait(page, 400);
            await page.evaluate(() => {
                const use = document.querySelector('use[href="#icon-tableDisplay"]');
                if (!use) return;
                let el = use;
                while (el) {
                    if (['button', 'a'].includes((el.tagName || '').toLowerCase()) || /btn|button|icon/.test((el.className || '').toString())) { el.click(); return; }
                    el = el.parentElement;
                }
                const svg = use.closest('svg');
                if (svg?.parentElement) svg.parentElement.click();
            });
            await safeWait(page, 3500);
            if (await temTabelaLista(page)) return true;
        }
        return false;
    } catch (_) {
        return false;
    }
}

function getDataHoraBrasil() {
    const agora = new Date();
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const parts = f.formatToParts(agora);
    const g = (t) => parts.find((p) => p.type === t)?.value || '00';
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}-03:00`;
}

function calcularStatus(potenciaAtual, potenciaInstalada, statusRaw = 'online') {
    const raw = String(statusRaw || '').trim().toLowerCase();
    const offlike = /off|desligado|defeito|离线|异常/i.test(raw);
    const onlike = /^(ligado|online|normal|conectado|running|ok|在线|正常)$/.test(raw);
    let s = offlike ? 'offline' : (onlike ? 'online' : 'offline');
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
        const inDrop = (el) => el.closest('.el-select-dropdown, .el-popper, [class*="dropdown"]');
        const main = document.querySelector('.tab-content-container, [class*="tab-content"], [class*="station"], main');
        const tbl = main ? (main.querySelector('.el-table, .ant-table, table') || main.querySelector('table')) : (document.querySelector('.el-table, .ant-table, table') || document.querySelector('table'));
        let scope = tbl || main || document;

        const getHeaders = () => {
            const thead = scope.querySelector('thead, .ant-table-thead, .el-table__header');
            if (!thead) return [];
            const rows = thead.querySelectorAll('tr');
            const last = rows[rows.length - 1];
            const ths = (last || thead).querySelectorAll('th, .el-table__cell');
            return Array.from(ths).map((th) => (th.textContent || '').trim().toLowerCase());
        };
        let hdrs = getHeaders();
        if (!hdrs.length) hdrs = Array.from(scope.querySelectorAll('th, .el-table__cell')).map((h) => (h.textContent || '').trim().toLowerCase());
        if (!hdrs.length) {
            const docTh = document.querySelectorAll('.el-table th, table th');
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
        const idx = (arr, ...keys) => { for (const k of keys) { const i = arr.findIndex((h) => h && h.includes(k)); if (i >= 0) return i; } return -1; };
        const iNome = idx(hdrsUse, 'nome', 'name', 'estação', 'station', 'plant', 'usina');
        const iStatus = idx(hdrsUse, 'status', 'state', 'estado');
        const iGeracao = idx(hdrsUse, 'rendimento diário', 'geração de energia ao longo do dia', 'geração', 'energy today', 'generation', 'today', 'kwh');
        const iCapacidade = idx(hdrsUse, 'potência cc instalada', 'potencia cc instalada', 'capacidade instalada', 'capacidade', 'installed', 'capacity', 'kwp', 'rated', 'size');
        const iPotencia = idx(hdrsUse, 'potência em tempo real', 'potencia em tempo real', 'potência operacional', 'operacional', 'potência atual', 'current', 'output', 'power', 'real-time');

        const rowSel = 'tbody tr, .el-table__body tr, .ant-table-tbody .ant-table-row, tr.el-table__row, tr.ant-table-row';
        let rows = Array.from(scope.querySelectorAll(rowSel)).filter((r) => !inDrop(r) && !r.closest('thead'));
        if (!rows.length && scope !== document) rows = Array.from(document.querySelectorAll(rowSel)).filter((r) => !inDrop(r) && !r.closest('thead'));
        const cellSel = 'td, .el-table__cell, .ant-table-cell, [class*="cell"]';
        rows = rows.filter((r) => !r.querySelector('th') && r.querySelectorAll(cellSel).length >= 1);

        const nc = hdrsUse.length;
        const getCell = (cells, i, stride) => { if (i < 0) return ''; const j = stride * i; return (cells[j]?.textContent || '').trim(); };
        const usinas = [];
        let debugInfo = null;
        for (let ri = 0; ri < rows.length; ri++) {
            const row = rows[ri];
            const cells = row.querySelectorAll(cellSel);
            const stride = (nc > 0 && cells.length >= 2 * nc && cells.length <= 2 * nc + 2) ? 2 : 1;
            const get = (i) => getCell(cells, i, stride);
            const nome = iNome >= 0 ? get(iNome) : get(0) || get(1);
            if (!nome || !nome.length) continue;
            let status = iStatus >= 0 ? get(iStatus) : '';
            if (!status) status = /green|online|ligado|normal/.test((row.innerHTML || '').toLowerCase()) ? 'online' : 'offline';
            const geracaoDia = iGeracao >= 0 ? get(iGeracao) : '';
            const capacidadeInstalada = iCapacidade >= 0 ? get(iCapacidade) : '';
            const potenciaOperacionalRaw = iPotencia >= 0 ? get(iPotencia) : '';
            usinas.push({ nome, status, geracaoDia, capacidadeInstalada, potenciaOperacionalRaw });
            if (doDebug && ri === 0) {
                const cellTexts = Array.from(cells).map((c) => (c.textContent || '').trim().slice(0, 50));
                debugInfo = { hdrs: hdrsUse, cellTexts, nHeaders: nc, nCells: cells.length, stride, iNome, iStatus, iGeracao, iCapacidade, iPotencia, nome, geracaoDia, capacidadeInstalada, potenciaOperacionalRaw };
            }
        }
        if (doDebug && !debugInfo && rows.length) {
            const first = rows[0];
            const sampleCells = Array.from(first.querySelectorAll(cellSel)).map((c) => (c.textContent || '').trim().slice(0, 40));
            debugInfo = { hdrs: hdrsUse, nRows: rows.length, sampleCells, iNome, iStatus, iGeracao, iCapacidade, iPotencia };
        }
        return { usinas, debug: debugInfo };
    }, debug);

    if (debug && result.debug) console.log('🔍 Debug extração Sungrow:', JSON.stringify(result.debug, null, 2));
    return result.usinas;
}

async function ajustarTela(page) {
    try {
        await page.evaluate(() => {
            const setVisible = (el) => {
                if (!el || !el.style) return;
                el.style.overflow = 'visible';
                el.style.overflowX = 'visible';
                el.style.overflowY = 'visible';
                el.style.maxHeight = 'none';
            };
            document.documentElement.style.overflow = 'visible';
            document.documentElement.style.overflowX = 'visible';
            document.documentElement.style.overflowY = 'visible';
            document.body.style.overflow = 'visible';
            document.body.style.overflowX = 'visible';
            document.body.style.overflowY = 'visible';
            document.body.style.minHeight = '100vh';
            document.body.style.maxHeight = 'none';
            document.body.style.zoom = '1';

            const sel = [
                '#app', 'main', '[class*="content"]', '[class*="layout"]', '[class*="container"]',
                '[class*="scroll"]', '[class*="wrapper"]', '[class*="station"]', '[class*="tab-content"]',
                '.el-scrollbar', '.el-scrollbar__wrap', '.el-scrollbar__view',
                '.el-table__body-wrapper', '.el-table__header-wrapper', '.el-table__footer-wrapper',
                '.ant-table-body', '.ant-table-content', '[class*="scrollbar"]'
            ].join(', ');
            document.querySelectorAll(sel).forEach(setVisible);
            document.querySelectorAll('.el-table__body-wrapper, .ant-table-body').forEach((el) => {
                setVisible(el);
                if (el.style) el.style.minHeight = '200px';
            });

            const layout = document.querySelector('#app, main, [class*="layout"], [class*="content"]');
            if (layout) {
                layout.style.minHeight = '100vh';
                layout.style.maxHeight = 'none';
            }

            window.scrollTo(0, 0);
            const table = document.querySelector('table, .ant-table, .el-table, [class*="table"]');
            if (table) {
                setVisible(table);
                table.scrollIntoView({ block: 'start', behavior: 'instant' });
            }
            const main = document.querySelector('main, [class*="content"], [class*="station"], .tab-content-container');
            if (main) main.scrollIntoView({ block: 'start', behavior: 'instant' });
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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
        if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
            await btn.click();
            return true;
        }
    } catch (_) {}
    try {
        return await page.evaluate(() => {
            const pag = document.querySelector('.ant-pagination, .el-pagination, [class*="pagination"]');
            if (!pag) return false;
            const n = Array.from(pag.querySelectorAll('button, li, [role="button"]')).find((b) => {
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
    console.log('🚀 Iniciando sincronização Sungrow (iSolarCloud)...\n');

    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: null
    });

    let page = await context.newPage();
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

    try {
        console.log('🔗 Etapa 1: Acessando', LOGIN_URL);
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await safeWait(page, 3000);

        console.log('🍪 Etapa 2: Aceitar cookies (e fechar aba de compliance se abrir)...');
        await aceitarCookies(page, context);
        await safeWait(page, 1500);

        console.log('📋 Fechando popup "Informações" (se houver)...');
        await fecharPopupInformacoes(page);
        await safeWait(page, 500);

        console.log('🖥️ Ajustando tela de login (formulário visível)...');
        await ajustarTelaLogin(page);
        await safeWait(page, 500);

        await page.waitForSelector('input[type="password"]', { state: 'visible', timeout: 10000 }).catch(() => {});

        console.log('🍪 Clicar em "Sim, eu concordo" no cookiesIs (antes de digitar login)...');
        await aceitarCookies(page, context);
        await safeWait(page, 1000);

        const user = (process.env.SUNGROW_USER || process.env.ISOLAR_USER || '').trim();
        const pass = (process.env.SUNGROW_PASS || process.env.ISOLAR_PASS || '').trim();
        if (!user || !pass) {
            console.log('❌ SUNGROW_USER e SUNGROW_PASS (ou ISOLAR_USER / ISOLAR_PASS) são obrigatórios no .env para login automático.');
            throw new Error('Credenciais Sungrow não configuradas.');
        }

        console.log('🔐 Etapa 4: Login automático...');
        let loginOk = false;
        let lastReason = '';
        for (let tentativa = 1; tentativa <= 3; tentativa++) {
            const useVue = tentativa >= 2;
            if (useVue) console.log('   Usando fallback Vue (setter nativo)...');
            const res = await fazerLoginAutomatico(page, user, pass, useVue);
            lastReason = res.reason || '';
            if (res.success) {
                loginOk = true;
                console.log('✅ Login automático OK.');
                break;
            }
            if (tentativa < 3) {
                console.log(`⚠️ Tentativa ${tentativa} falhou (${lastReason || '?'}). Nova tentativa em 3s...`);
                await safeWait(page, 3000);
                await aceitarCookies(page, context);
                await fecharPopupInformacoes(page);
                await ajustarTelaLogin(page);
                await safeWait(page, 500);
            } else {
                if (lastReason === 'invalid_credentials') console.log('❌ Usuário ou senha incorretos. Confira SUNGROW_USER e SUNGROW_PASS no .env.');
                else console.log(`❌ Login automático falhou após ${tentativa} tentativas (${lastReason || '?'}).`);
            }
        }
        if (!loginOk) {
            console.log('⏸️ Faça o login manualmente no navegador. Quando terminar, volte aqui e pressione Enter.');
            await new Promise((resolve) => {
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                rl.question('', () => { rl.close(); resolve(); });
            });
            await safeWait(page, 2000);
            const pages = (context?.pages?.() || []).filter((p) => !p.isClosed?.());
            for (const p of pages) {
                try { if (isComplianceUrl(p.url())) await p.close(); } catch (_) {}
            }
            await safeWait(page, 500);
            const remaining = (context?.pages?.() || []).filter((p) => !p.isClosed?.());
            if (remaining.length && (!page || page.isClosed?.())) {
                page = remaining[0];
                await page.bringToFront().catch(() => {});
            }
            const pick = () => (context?.pages?.() || []).filter((p) => !p.isClosed?.()).find((p) => !/\/login|#\/login/i.test(p.url()) && !isComplianceUrl(p.url())) || page;
            for (let i = 0; i < 12; i++) {
                const cand = pick();
                if (cand && !/\/login|#\/login/i.test(cand.url()) && !isComplianceUrl(cand.url())) {
                    if (cand !== page) { page = cand; await page.bringToFront().catch(() => {}); }
                    console.log('✅ Login manual detectado. Prosseguindo...');
                    break;
                }
                await safeWait(page, 1500);
            }
        }

        let urlAfterLogin = page.url();

        console.log('🖥️ Ajustando tela (pós-login)...');
        await ajustarTela(page);
        await safeWait(page, 500);

        console.log('📍 Etapa 5: Ir para Estação/Plant (lista de usinas)...');
        let url = page.url();
        const stationPaths = ['/#/plant/list', '/#/plant', '/#/overview', '/#/station', '/#/powerstation', '/#/oms/station'];

        const isOk = (u) => !/\/login|#\/login|\/404/i.test(u) && !isComplianceUrl(u);
        const alreadyOnPlant = (u) => /#\/plant|#\/station|#\/overview|#\/oms/i.test(u) && !/\/login|\/404/i.test(u);
        const needNav = !alreadyOnPlant(url) || /\/404/i.test(url);
        if (needNav) {
            let navegou = false;
            for (const p of stationPaths) {
                try {
                    const target = APP_BASE + p;
                    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await safeWait(page, 4000);
                    url = page.url();
                    if (isOk(url)) {
                        console.log('✅ Navegou para Estação via URL:', target);
                        navegou = true;
                        break;
                    }
                    if (/\/404/i.test(url)) console.log('⚠️ URL retornou 404:', target);
                } catch (_) {}
            }
            if (!navegou) {
                const clicou = await page.evaluate(() => {
                    const byHref = (sel) => {
                        const a = document.querySelector(sel);
                        if (a) { a.click(); return true; }
                        return false;
                    };
                    if (byHref('a[href*="#/plant"]')) return true;
                    if (byHref('a[href*="#/station"]')) return true;
                    if (byHref('a[href*="/plant"]')) return true;
                    if (byHref('a[href*="/station"]')) return true;
                    const links = Array.from(document.querySelectorAll('a, [role="menuitem"], [class*="menu"] span, [class*="nav"] *, [class*="sidebar"] *'));
                    const station = links.find((el) => {
                        const t = (el.textContent || '').toLowerCase();
                        const h = (el.getAttribute('href') || el.closest('a')?.getAttribute('href') || '').toLowerCase();
                        return /station|estação|estacao|plant|plants|usina|电站|power station|pv plant|estação de energia/i.test(t) || /#\/plant|#\/station|\/plant|\/station/.test(h);
                    });
                    if (station) { (station.closest('a') || station).click(); return true; }
                    return false;
                });
                if (clicou) {
                    console.log('✅ Navegou para Estação (menu).');
                    await safeWait(page, 4000);
                } else {
                    console.log('⚠️ Link Estação não encontrado.');
                }
            }
        }

        url = page.url();
        if (/\/login|#\/login/i.test(url)) {
            console.log('⚠️ Ainda em /login – não foi possível acessar Estação. Verifique login e tente novamente.');
        }
        if (/\/404/i.test(url)) console.log('⚠️ Página 404 após navegação.');
        await safeWait(page, 3000);

        console.log('🔔 Fechando pop-up de manutenção (se houver)...');
        if (await fecharPopUpManutencao(page)) console.log('✅ Pop-up fechado.');
        await safeWait(page, 500);

        console.log('📋 Etapa 6: Mudar para visualização em lista...');
        const mudouLista = await mudarParaVisualizacaoLista(page);
        if (mudouLista) console.log('✅ Visualização em lista ativada.');
        else console.log('⚠️ Lista não ativada; seguindo com view atual.');
        await safeWait(page, 2500);

        page = ensurePage(page, context);
        if (!page) {
            const abas = (context?.pages?.() || []).filter((p) => !p.isClosed?.());
            if (abas.length) { page = abas[abas.length - 1]; console.log('⚠️ Usando nova aba.'); }
        }
        if (!page) throw new Error('Página fechada e sem outra aba.');

        url = page.url();
        if (/\/404/i.test(url)) {
            console.log('⚠️ 404 detectado. Tentando URLs alternativas da Estação...');
            for (const p of ['/#/plant/list', '/#/plant', '/#/overview', '/#/station']) {
                try {
                    await page.goto(APP_BASE + p, { waitUntil: 'domcontentloaded', timeout: 12000 });
                    await safeWait(page, 3000);
                    const u = page.url();
                    if (!/\/404|\/login/i.test(u)) {
                        console.log('✅ Recuperado via', p);
                        break;
                    }
                } catch (_) {}
            }
        }

        console.log('🖥️ Ajustando tela...');
        await ajustarTela(page).catch(() => {});

        console.log('📄 Etapa 7: Configurar 100 itens por página...');
        const config100 = await configurar100PorPagina(page);
        if (config100) console.log('✅ 100 itens/página.');
        else console.log('⚠️ Seletor 100/página não encontrado.');
        await ajustarTela(page);

        await fecharDropdowns(page);

        let totalGeral = 0;
        let paginaAtual = 1;

        if (isComplianceUrl(page.url())) {
            console.log('⚠️ Página de compliance/cookies detectada. Faça login e rode novamente.');
        } else {
        console.log('📊 Etapa 8: Extrair usinas (scroll horizontal + coleta)...');
        while (true) {
            const scrollOk = await scrollTabelaHorizontal(page);
            if (scrollOk && paginaAtual === 1) console.log('↔️ Scroll horizontal na tabela.');
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
                    marca: 'SUNGROW',
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
            if (usinas.length > 0) console.log(`📦 Página ${paginaAtual}: ${usinas.length} usinas (total ${totalGeral})`);

            const temProxima = await avancarPagina(page);
            if (!temProxima) break;
            paginaAtual++;
            await safeWait(page, 3000);
        }
        }

        console.log(`\n🎉 Sungrow: ${totalGeral} usinas sincronizadas.`);
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
export { rodarRobo as rodarSungrow };
