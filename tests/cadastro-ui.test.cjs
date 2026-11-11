// Requer Playwright e Microsoft Edge. Defina PLAYWRIGHT_MODULE se não estiver no node_modules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('cadastro responsivo, validação, sucesso, falha e login', async () => {
  const root = path.resolve('.');
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.jpeg': 'image/jpeg' })[path.extname(file)] || 'text/plain');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Substitui só a fronteira de serviço. Nenhuma requisição ao Firebase real.
    await page.route('**/js/auth-service.js', route => route.fulfill({ contentType: 'application/javascript', body: `
      export async function registerAccount(input) {
        window.submissions = (window.submissions || 0) + 1;
        if (input.email === 'erro@example.com') throw new Error('Falha simulada');
        return { pending: input.perfil === 'administrador' };
      }
      export function homeFor() { return 'inicio.html'; }
      export async function login() { throw new Error('Acesso pendente'); }
      export async function resetPassword() {}
      export function errorMessage(error) { return error.message; }
    ` }));
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base + '/pages/cadastro.html');
    await page.locator('#submit-auth').waitFor();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(os.tmpdir(), 'ekklesia-cadastro-' + width + '.png'), fullPage: true });
    }
    await page.locator('#nome').fill('Pessoa Teste');
    await page.locator('#email').fill('teste@example.com');
    await page.locator('#senha').fill('senha12345');
    await page.locator('#confirmacao').fill('diferente123');
    await page.locator('#submit-auth').click();
    assert.equal(await page.evaluate(() => window.submissions || 0), 0);
    await page.locator('#confirmacao').fill('senha12345');
    await page.locator('#submit-auth').click();
    await page.waitForFunction(() => document.querySelector('#auth-feedback').textContent.includes('aguarda aprovação'));
    await page.locator('input[value="membro"]').check();
    assert.match(await page.locator('#role-description').innerText(), /informar sua disponibilidade/);
    async function fill(email) {
      await page.locator('#nome').fill('Pessoa Teste');
      await page.locator('#email').fill(email);
      await page.locator('#senha').fill('senha12345');
      await page.locator('#confirmacao').fill('senha12345');
    }
    await fill('teste@example.com'); await page.locator('#submit-auth').click();
    await page.waitForFunction(() => document.querySelector('#auth-feedback').textContent.includes('Conta de Membro criada'));
    await fill('erro@example.com'); await page.locator('#submit-auth').click();
    await page.waitForFunction(() => document.querySelector('#auth-feedback').textContent.includes('Falha simulada'));
    assert.equal(await page.locator('#submit-auth').isEnabled(), true);
    await page.goto(base + '/pages/login.html');
    await page.locator('#email').fill('teste@example.com');
    await page.locator('#senha').fill('senha12345');
    await page.locator('#submit-auth').click();
    await page.waitForFunction(() => document.querySelector('#auth-feedback').textContent.includes('Acesso pendente'));
    assert.equal(new URL(page.url()).search, '');
    await page.locator('#reset-password').click();
    await page.waitForFunction(() => document.querySelector('#auth-feedback').textContent.includes('instruções'));
    assert.deepEqual(errors, []);
    console.log('Capturas: ' + path.join(os.tmpdir(), 'ekklesia-cadastro-{1280,390}.png'));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
