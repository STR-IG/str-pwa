// Run with PLAYWRIGHT_PACKAGE pointing to the installed playwright package.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const root = resolve('.');
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' }[extname(path)] || 'text/plain'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  for (const mode of ['public', 'nonmember', 'member']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    let aiCalls = 0, sends = 0;
    await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: `export function createClient(){return {auth:{getSession:async()=>({data:{session:${mode === 'public' ? 'null' : '{access_token:"test"}'}}}),onAuthStateChange:()=>({})},rpc:async()=>({data:${mode === 'member'},error:null})}}` }));
    await context.route('https://icneigdnuntzugisexaz.supabase.co/functions/v1/**', async route => {
      const url = route.request().url(); let data;
      if (url.endsWith('answer-public-duty')) {
        aiCalls++; const facts = route.request().postDataJSON(); assert.match(facts.workSchedule, /Turno posterior: 08:00–16:00/); assert.equal(facts.time, '10:00');
        assert.equal(route.request().headers().authorization, undefined);
        data = { guidance: { case: 'Citación oficial', eligibility: 'Puede encajar, pendiente de comprobar.', time: 'Tiempo indispensable.', documents: 'Citación y asistencia.', next: 'Comunícalo a la empresa.' }, quota: { remaining: 1 } };
      } else if (url.endsWith('submit-permit-case')) {
        sends++; assert.equal(mode, 'member'); assert.equal(route.request().headers().authorization, 'Bearer test'); data = { sent: true };
      } else data = { quota: { remaining: 2 } };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(base + '/preguntale-str-permisos.html');
    await page.getByRole('link').filter({ has: page.locator('img[src="card-deber-inexcusable.png"]') }).click();
    for (const answer of ['Citación judicial u oficial', 'Sí', 'No, el horario viene impuesto']) {
      await page.locator('.screen:not([hidden])').getByRole('button', { name: answer, exact: true }).click();
      await page.getByRole('button', { name: 'Continuar', exact: true }).filter({ visible: true }).click();
    }
    await page.locator('#date').fill('2026-10-02'); await page.locator('#time').fill('10:00');
    await page.locator('#previousShift').selectOption({ label: 'No trabajo / descanso' });
    await page.locator('#followingShift').selectOption({ label: 'Trabajo ese turno' });
    await page.locator('#followingStart').fill('08:00'); await page.locator('#followingEnd').fill('16:00');
    await page.locator('.screen:not([hidden]) .next').click();
    await page.getByRole('button', { name: 'Todavía no', exact: true }).click(); await page.locator('.screen:not([hidden]) .next').click();
    await page.getByRole('button', { name: 'Volver al paso anterior' }).click();
    assert.equal(await page.getByRole('button', { name: 'Todavía no' }).getAttribute('aria-pressed'), 'true');
    await page.locator('.screen:not([hidden]) .next').click();
    await page.getByRole('button', { name: 'Obtener orientación' }).click();
    await page.getByRole('heading', { name: '¿Puede corresponderte?' }).waitFor();
    await page.getByRole('link', { name: 'Estatuto de los Trabajadores, art. 37.3.d' }).waitFor();
    if (mode === 'public') {
      await page.getByRole('link', { name: 'Iniciar sesión para enviar tu caso a STR' }).waitFor();
      await page.reload(); await page.getByRole('heading', { name: 'Tu caso', exact: true }).waitFor(); assert.equal(aiCalls, 1);
    } else if (mode === 'nonmember') {
      await page.getByText('El envío directo de consultas al equipo de STR está disponible para personas afiliadas.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Enviar mi caso a STR', exact: true }).count(), 0);
    } else {
      await page.getByRole('button', { name: 'Enviar mi caso a STR', exact: true }).click(); await page.getByText('Tu caso se ha enviado a STR.', { exact: true }).waitFor(); assert.equal(sends, 1);
    }
    assert.equal(await page.getByText('Afíliate a STR', { exact: true }).count(), 0);
    assert.deepEqual(errors, []); assert.equal(aiCalls, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log(`OK: ${mode}, six steps, back navigation, five sections, mobile layout`);
    await context.close();
  }
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
