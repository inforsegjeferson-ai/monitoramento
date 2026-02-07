// @ts-nocheck
/**
 * Helpers humanizados para robôs (delays variáveis, mouse aleatório, digitação).
 * Usar com page e context do Playwright.
 */

/** User-Agent Chrome Windows atualizado (evitar detecção de bot). */
export const USER_AGENT_CHROME_WIN =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Atraso aleatório entre min e max (ms). */
export function humanDelay(min = 400, max = 1100) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

/** Aguarda um tempo humanizado (random min–max ms). Se page fechou, não propaga erro. */
export async function humanWait(page, minMs = 300, maxMs = 800) {
    const ms = humanDelay(minMs, maxMs);
    try {
        if (typeof page?.isClosed === 'function' && page.isClosed()) return;
        await page.waitForTimeout(ms);
    } catch (e) {
        if (!/closed|target.*closed/i.test(String(e?.message || ''))) throw e;
    }
}

/** Espera fixa (ms). Ignora erro "closed". */
export async function safeWait(page, ms) {
    try {
        if (typeof page?.isClosed === 'function' && page.isClosed()) return;
        await page.waitForTimeout(ms);
    } catch (e) {
        if (!/closed|target.*closed/i.test(String(e?.message || ''))) throw e;
    }
}

/** Move o mouse para (x,y) com passos suaves. */
export async function mouseMoveSmooth(page, x, y, steps = 12) {
    try {
        if (typeof page?.isClosed === 'function' && page.isClosed()) return;
        await page.mouse.move(x, y, { steps });
    } catch (e) {
        if (!/closed|target.*closed/i.test(String(e?.message || ''))) throw e;
    }
}

/** Movimento de mouse aleatório dentro da viewport. */
export async function randomMouseMove(page) {
    try {
        if (typeof page?.isClosed === 'function' && page.isClosed()) return;
        const vp = page.viewportSize() || { width: 1280, height: 720 };
        const x = Math.floor(100 + Math.random() * (vp.width - 200));
        const y = Math.floor(100 + Math.random() * (vp.height - 200));
        const steps = 8 + Math.floor(Math.random() * 10);
        await page.mouse.move(x, y, { steps });
    } catch (e) {
        if (!/closed|target.*closed/i.test(String(e?.message || ''))) throw e;
    }
}

/** Move até o centro do elemento e clica de forma suave (hover + pequeno delay + click). */
export async function smoothClick(page, locator) {
    try {
        if (typeof page?.isClosed === 'function' && page.isClosed()) return false;
        await locator.waitFor({ state: 'visible', timeout: 8000 });
        const box = await locator.boundingBox();
        if (!box) return false;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        const steps = 10 + Math.floor(Math.random() * 8);
        await page.mouse.move(x, y, { steps });
        await safeWait(page, humanDelay(80, 220));
        await locator.click({ force: true });
        return true;
    } catch (e) {
        if (!/closed|target.*closed/i.test(String(e?.message || ''))) throw e;
        return false;
    }
}

/** Digitação humanizada: delay por caractere variável. */
export async function humanType(page, locator, text, opts = {}) {
    const { minDelay = 60, maxDelay = 140, clearFirst = true } = opts;
    try {
        if (typeof page?.isClosed === 'function' && page.isClosed()) return false;
        await locator.waitFor({ state: 'visible', timeout: 5000 });
        if (clearFirst) await locator.fill('');
        await locator.focus();
        await locator.pressSequentially(text, { delay: humanDelay(minDelay, maxDelay) });
        return true;
    } catch (e) {
        if (!/closed|target.*closed/i.test(String(e?.message || ''))) throw e;
        return false;
    }
}

/**
 * Digita texto caractere por caractere com atrasos aleatórios 100–200 ms.
 * Não usa page.fill(). Limpa via Ctrl+A + Backspace.
 */
export async function digitarComoHumano(page, locator, text, opts = {}) {
    const { minDelay = 100, maxDelay = 200 } = opts;
    try {
        if (typeof page?.isClosed === 'function' && page.isClosed()) return false;
        await locator.waitFor({ state: 'visible', timeout: 6000 });
        await locator.focus();
        await page.keyboard.press('Control+a');
        await safeWait(page, 50);
        await page.keyboard.press('Backspace');
        await safeWait(page, humanDelay(80, 150));
        for (const c of text) {
            await page.keyboard.type(c, { delay: 0 });
            await safeWait(page, humanDelay(minDelay, maxDelay));
        }
        return true;
    } catch (e) {
        if (!/closed|target.*closed/i.test(String(e?.message || ''))) throw e;
        return false;
    }
}

/**
 * Espera até 10 s por qualquer checkbox "Verify you are human".
 * Se aparecer: avisa no console e pausa o robô (aguarda 5 min).
 */
export async function waitVerifyHumanPauseIfFound(page) {
    const totalMs = 10000;
    const stepMs = 500;
    const pauseMs = 300000; // 5 min
    for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
        try {
            if (typeof page?.isClosed === 'function' && page.isClosed()) return;
            const found = await page.getByText(/verify you are human|confirme que é humano|verify you're human/i).first().isVisible().catch(() => false);
            if (found) {
                console.log('\n⚠️ CLOUDFLARE: "Verify you are human" detectado. O robô pausou.');
                console.log('   Resolva manualmente no navegador. Após 5 min o script segue (ou reinicie).\n');
                await safeWait(page, pauseMs);
                return;
            }
        } catch (_) {}
        try {
            const frame = page.frameLocator('iframe[src*="turnstile"], iframe[src*="cloudflare"], iframe[title*="widget"]').first();
            const chk = frame.locator('[role="checkbox"], input[type="checkbox"], .mark').first();
            if (await chk.isVisible().catch(() => false)) {
                console.log('\n⚠️ CLOUDFLARE: Checkbox "Verify you are human" (iframe) detectado. O robô pausou.');
                console.log('   Resolva manualmente no navegador. Após 5 min o script segue (ou reinicie).\n');
                await safeWait(page, pauseMs);
                return;
            }
        } catch (_) {}
        await safeWait(page, stepMs);
    }
}

/**
 * Espera o checkbox "Verify you are human" / "Confirme que é humano" e tenta clicar de forma suave.
 * Retorna true se clicou, false caso contrário.
 */
export async function waitAndSmoothClickVerifyHuman(page) {
    try {
        if (typeof page?.isClosed === 'function' && page.isClosed()) return false;
        const textLoc = page.getByText(/verify you are human|confirme que é humano|verify you're human/i).first();
        await textLoc.waitFor({ state: 'visible', timeout: 8000 });
        await humanWait(page, 200, 500);
        const ok = await smoothClick(page, textLoc);
        if (ok) return true;
    } catch (_) {}

    try {
        if (typeof page?.isClosed === 'function' && page.isClosed()) return false;
        const frame = page.frameLocator('iframe[src*="turnstile"], iframe[src*="cloudflare"], iframe[title*="widget"]').first();
        const chk = frame.locator('[role="checkbox"], input[type="checkbox"], .mark, body').first();
        await chk.waitFor({ state: 'visible', timeout: 6000 });
        await humanWait(page, 200, 500);
        await chk.click({ force: true });
        return true;
    } catch (_) {}

    return false;
}
