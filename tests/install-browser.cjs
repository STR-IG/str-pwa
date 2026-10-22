// PLAYWRIGHT_MODULE: installed Playwright; BROWSER_EXECUTABLE: optional Chromium path.
// All external requests are blocked; no production API writes.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const relative = decodeURIComponent(url.pathname).replace(/^\/str-pwa\//, '');
  const file = path.resolve(root, relative || 'index.html');
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    const data = await fs.readFile(file);
    res.setHeader('Content-Type', ({ '.js':'text/javascript', '.html':'text/html', '.json':'application/manifest+json', '.png':'image/png' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let context;
  try {
    for (const [name, userAgent, standalone] of [
      ['Android', 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36', false],
      ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1', false],
      ['iPhone embedded', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Instagram', false],
      ['installed', 'Mozilla/5.0 (iPhone)', true],
    ]) {
      const profile = await fs.mkdtemp(path.join(root, '..', 'install-profile-'));
      context = await chromium.launchPersistentContext(profile, { headless:true, executablePath:process.env.BROWSER_EXECUTABLE || undefined, userAgent, viewport:{width:390,height:844} });
      await context.route('**/*', route => {
        const url = route.request().url();
        if (!url.startsWith(origin) || /app-analytics\.js/.test(url)) return route.abort();
        return route.continue();
      });
      if (standalone) await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', {value:true}));
      const page = await context.newPage();
      await page.goto(`${origin}/str-pwa/`);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await page.waitForLoadState('load');
      if (!standalone) await page.locator('#install-panel').waitFor({state:'visible'});
      assert.equal(await page.locator('#install-panel').isVisible(), !standalone);
      if (!standalone) {
        assert.equal(await page.locator('#install-ios').isVisible(), name.startsWith('iPhone'));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      if (name === 'Android') {
        const manifest = await page.evaluate(async () => (await fetch('./manifest.json')).json());
        assert.equal(manifest.id, '/str-pwa/');
        assert.equal(manifest.scope, './');
        for (const icon of manifest.icons) {
          const size = await page.evaluate(async src => {
            const image = new Image(); image.src = src; await image.decode();
            return `${image.naturalWidth}x${image.naturalHeight}`;
          }, icon.src);
          assert.equal(size, icon.sizes);
        }
        const cdp = await context.newCDPSession(page);
        const errors = await cdp.send('Page.getInstallabilityErrors');
        assert.deepEqual(errors.installabilityErrors, []);
        for (const outcome of ['dismissed', 'accepted', 'error']) {
          await page.evaluate(outcome => {
            window.promptCalls = 0;
            const event = new Event('beforeinstallprompt', {cancelable:true});
            event.prompt = async () => { window.promptCalls++; if (outcome === 'error') throw Error('unavailable'); };
            event.userChoice = Promise.resolve({outcome});
            window.dispatchEvent(event);
          }, outcome);
          await page.locator('#install-app').click();
          assert.equal(await page.evaluate(() => window.promptCalls), 1);
          assert.equal(await page.locator('#install-app').isVisible(), false);
          assert.ok(await page.locator('#install-status').textContent());
        }
        await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
        assert.equal(await page.locator('#install-panel').isVisible(), false);
      }
      await page.screenshot({path:path.join(root, '..', `install-${name.replaceAll(' ', '-')}.png`), fullPage:false});
      console.log(`PASS ${name}`);
      await context.close();
    }
  } finally { await context?.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
