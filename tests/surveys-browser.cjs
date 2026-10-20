// PLAYWRIGHT_MODULE points to an installed Playwright package. No live API calls.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const server = http.createServer(async (req, res) => {
  const file = path.resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await fs.readFile(file);
    res.setHeader(
      "Content-Type",
      ({
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".webp": "image/webp",
      })[path.extname(file)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    let admin = false,
      available = true,
      failMail = false,
      votes = [],
      drafts = [];
    const survey = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "¿Qué tema prefieres tratar?",
      description: "Elige una opción para la próxima sesión.",
      state: "active",
      admin_only: false,
      options: [{
        id: "22222222-2222-4222-8222-222222222222",
        label: "Jornada",
      }, { id: "33333333-3333-4333-8333-333333333333", label: "Permisos" }],
    };
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.includes("cdn.jsdelivr.net")) {
        return route.fulfill({
          contentType: "text/javascript",
          body:
            'export function createClient(){return {auth:{getSession:async()=>({data:{session:{access_token:"test"}}})}}}',
        });
      }
      if (url.endsWith("/functions/v1/surveys")) {
        const body = route.request().postDataJSON();
        let result = {}, status = 200;
        if (body.action === "authorize") {
          result = admin ? { ok: true } : { error: "FORBIDDEN" };
          status = admin ? 200 : 403;
        }
        if (body.action === "list") {
          result = { surveys: available ? [survey, ...drafts] : [] };
        }
        if (body.action === "request") {
          result = failMail
            ? { error: "MAIL_FAILED" }
            : { challengeId: "44444444-4444-4444-8444-444444444444" };
          status = failMail ? 503 : 200;
        }
        if (body.action === "vote") {
          votes.push(body);
          result = { ok: true };
        }
        if (body.action === "create") {
          drafts.push({
            ...survey,
            id: "55555555-5555-4555-8555-555555555555",
            title: body.title,
            state: "draft",
            admin_only: body.adminOnly,
          });
          result = { ok: true };
        }
        if (body.action === "activate") {
          drafts[0].state = "active";
          result = { ok: true };
        }
        if (body.action === "close") {
          survey.state = "closed";
          result = { ok: true };
        }
        if (body.action === "results") {
          result = {
            total: 5,
            options: [{ label: "Jornada", votes: 5 }, {
              label: "Permisos",
              votes: 0,
            }],
          };
        }
        return route.fulfill({
          status,
          contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify(result),
        });
      }
      if (url.startsWith(base)) return route.continue();
      return route.abort();
    });
    const output = process.env.SURVEY_SCREENSHOTS ||
      path.resolve(root, "..", "encuestas-preview");
    await fs.mkdir(output, { recursive: true });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + "/encuestas.html");
      await page.getByRole("button", { name: "Participar", exact: true })
        .click();
      await page.locator("#email").fill("voter@example.com");
      await page.getByRole("button", { name: "Enviar código", exact: true })
        .click();
      await page.locator("#vote-form").waitFor({ state: "visible" });
      assert.equal(await page.locator("#consent").isChecked(), false);
      assert.ok(
        await page.evaluate(() =>
          document.documentElement.scrollWidth <= innerWidth
        ),
        `overflow ${width}`,
      );
      await page.screenshot({
        path: path.join(output, `vote-${width}.png`),
        fullPage: true,
      });
      await page.locator("#code").fill("123456");
      await page.getByLabel("Jornada", { exact: true }).check();
      await page.getByRole("button", { name: "Verificar código y votar" })
        .click();
      await page.getByRole("status").filter({ hasText: "Gracias" }).waitFor();
      assert.equal(votes.at(-1).consent, false);
    }
    await page.goto(base + "/encuestas.html");
    await page.getByRole("button", { name: "Participar", exact: true }).click();
    await page.locator("#email").fill("yes@example.com");
    failMail = true;
    await page.getByRole("button", { name: "Enviar código", exact: true })
      .click();
    await page.getByRole("status").filter({ hasText: "No se ha podido enviar" })
      .waitFor();
    failMail = false;
    await page.getByRole("button", { name: "Enviar código", exact: true })
      .click();
    await page.locator("#code").fill("123456");
    await page.getByLabel("Permisos", { exact: true }).check();
    await page.locator("#consent").check();
    await page.getByRole("button", { name: "Verificar código y votar" })
      .click();
    await page.getByRole("status").filter({ hasText: "Gracias" }).waitFor();
    assert.equal(votes.at(-1).consent, true);
    available = false;
    await page.reload();
    await page.getByRole("status").filter({ hasText: "No hay encuestas" })
      .waitFor();
    available = true;
    await page.goto(base + "/encuestas-admin.html");
    await page.getByRole("status").filter({ hasText: "Acceso exclusivo" })
      .waitFor();
    assert.equal(await page.locator("#admin-content").isVisible(), false);
    admin = true;
    await page.reload();
    await page.locator("#admin-content").waitFor({ state: "visible" });
    await page.locator("#title").fill("Prueba creada");
    await page.locator("#new-options").fill("Sí\nNo");
    assert.equal(await page.locator("#admin-only").isChecked(), true);
    await page.getByRole("button", { name: "Crear borrador" }).click();
    await page.getByRole("status").filter({ hasText: "Borrador creado" })
      .waitFor();
    await page.getByRole("button", { name: "Activar encuesta" }).click();
    await page.getByRole("status").filter({ hasText: "Encuesta activada" })
      .waitFor();
    await page.getByRole("button", { name: "Cerrar definitivamente" }).first()
      .click();
    await page.getByRole("status").filter({ hasText: "Encuesta cerrada" })
      .waitFor();
    await page.getByRole("button", { name: "Consultar resultados" }).first()
      .click();
    await page.locator("#results").waitFor({ state: "visible" });
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(() =>
          document.documentElement.scrollWidth <= innerWidth
        ),
      );
      await page.screenshot({
        path: path.join(output, `admin-${width}.png`),
        fullPage: true,
      });
    }
    // Inspect home card with local files and external calls blocked.
    await page.goto(base + "/index.html");
    const card = page.locator('a[href="encuestas.html"]');
    await card.scrollIntoViewIfNeeded();
    assert.equal(
      await card.locator("img").evaluate((img) =>
        img.complete && img.naturalWidth > 0
      ),
      true,
    );
    await card.screenshot({ path: path.join(output, "card.png") });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: mobile/desktop, consent off/on, mail failure, empty list, admin denial/create/activate/close/results, home card",
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
