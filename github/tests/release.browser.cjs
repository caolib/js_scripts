const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, firefox, webkit } = require('playwright');
const { source, row, release, savedRow } = require('./fixtures.cjs');

const artifacts = path.join(__dirname, 'artifacts');
const engines = { chromium, firefox, webkit };
const baseCSS = `
    body { margin: 8px; font: 14px sans-serif; }
    ul { margin: 0; padding: 0; list-style: none; }
    [data-file], .Box-row { display: flex; flex-direction: column; padding: 8px; }
    .col-md-6 { display: flex; align-items: center; }
    .gh-meta-container { margin-right: 8px; }
    .Button { padding: 3px 8px; }
    @media (max-width: 768px) { .d-sm-none, .d-md-none { display: none; } }
`;

async function fixturePage(browser, html, mobile) {
    const context = await browser.newContext({ viewport: { width: mobile ? 320 : 1280, height: 800 }, hasTouch: mobile });
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', configurable: true });
        Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<meta charset="utf-8"><style>${baseCSS}</style>${html}` }));
    await page.goto('https://github.com/owner/repo/releases/tag/v1');
    await page.addScriptTag({ content: source });
    return { context, page, errors };
}

async function checkFixture(browser, engine, opts, mobile) {
    const names = ['a-linux-x64.deb', 'b-win-x64.exe', 'c-win-x64.exe.sha256sum', 'd-win-x64.exe.sig'];
    const html = release(names.map(name => row(name, opts)).join(''), { ...opts, summary: '下载文件' });
    const { context, page, errors } = await fixturePage(browser, html, mobile);
    try {
        await page.waitForSelector('.gh-group-win');
        assert.equal(await page.locator('.gh-platform-tag').count(), 3);
        const first = await page.locator('[data-file]').first().getAttribute('data-file');
        assert.equal(first, 'b-win-x64.exe');
        const os = page.locator('.gh-os-select');
        const arch = page.locator('.gh-arch-select');
        await os.selectOption('android');
        assert.equal(await arch.inputValue(), 'arm64');
        assert.equal(await arch.locator('option').first().getAttribute('value'), 'arm64');
        for (const value of ['linux', 'mac', 'windows']) {
            await os.selectOption(value);
            assert.equal(await arch.inputValue(), 'x86_64');
            assert.equal(await arch.locator('option').first().getAttribute('value'), 'x86_64');
        }
        assert.equal(await page.locator('[data-file]').count(), 4);
        assert.equal(await page.locator('.gh-assets-foldout').count(), 2);
        await page.locator('.gh-group-aux-wrapper > summary').click();
        await os.selectOption('linux');
        assert.equal(await page.locator('.gh-group-aux-wrapper').getAttribute('open'), '');
        const visibleTags = await page.locator('.gh-platform-tag').evaluateAll(tags => tags.filter(t => t.getBoundingClientRect().width > 0).length);
        assert.ok(visibleTags >= 2);
        if (mobile) {
            const bounds = await page.locator('.gh-assets-controls').evaluate(el => ({ right: el.getBoundingClientRect().right, width: innerWidth }));
            assert.ok(bounds.right <= bounds.width, `Controls overflow: ${JSON.stringify(bounds)}`);
            await page.locator('.gh-proxy-dropdown button').first().tap();
        } else {
            await page.locator('.gh-proxy-dropdown button').first().focus();
            await page.keyboard.press('Enter');
        }
        assert.equal(await page.locator('.gh-proxy-dropdown.is-open').count(), 1);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.gh-proxy-dropdown.is-open').count(), 0);
        await page.evaluate(() => {
            const list = document.querySelector('#asset-list');
            const tag = list.tagName === 'UL' ? 'li' : 'div';
            const item = document.createElement(tag);
            if (tag === 'div') item.setAttribute('role', 'listitem');
            item.dataset.file = 'late-win-x64.exe';
            item.innerHTML = '<a href="/owner/repo/releases/download/v1/late-win-x64.exe">Late asset</a>';
            list.appendChild(item);
        });
        await page.waitForSelector('[data-file="late-win-x64.exe"] .gh-platform-tag');
        assert.deepEqual(errors, []);
        if (mobile && opts.listTag === 'div') {
            await page.screenshot({ path: path.join(artifacts, `${engine}-mobile.png`), fullPage: true });
        }
        console.log(`PASS ${engine} ${mobile ? '320px touch' : 'desktop'} ${opts.role || opts.classes || 'plain li'}`);
    } finally {
        await context.close();
    }
}

async function checkSavedFixtures(browser, engine) {
    for (const number of ['', '2', '3']) {
        const { context, page, errors } = await fixturePage(browser, release(savedRow(number)), true);
        try {
            await page.waitForSelector('.gh-platform-tag');
            assert.ok(await page.locator('.gh-platform-tag').first().isVisible());
            assert.equal(await page.locator('.gh-meta-container').evaluateAll(nodes => nodes.some(n => n.closest('.d-sm-none, .d-md-none'))), false);
            await page.locator('.gh-os-select').selectOption('linux');
            await page.locator('.gh-os-select').selectOption('windows');
            assert.deepEqual(errors, []);
            console.log(`PASS ${engine} saved DOM release${number}.html`);
        } finally { await context.close(); }
    }
}

async function checkLivePage(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await page.goto('https://github.com/denoland/deno/releases/tag/v2.8.3', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.addScriptTag({ content: source });
        await page.waitForSelector('.gh-os-select', { timeout: 30000 });
        const details = page.locator('details').filter({ has: page.locator('.gh-os-select') }).first();
        if (!(await details.evaluate(el => el.open))) await details.locator('summary').first().click();
        await page.waitForSelector('.gh-platform-tag', { timeout: 30000 });
        await page.locator('.gh-os-select').first().selectOption('linux');
        assert.ok(await page.locator('.gh-group-linux-other, .gh-group-linux-deb').count() > 0);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(await page.locator('.gh-platform-tag').first().isVisible());
        await page.screenshot({ path: path.join(artifacts, 'github-live-mobile.png'), fullPage: true });
        console.log(`PASS live GitHub release: ${await page.locator('.gh-platform-tag').count()} platform tags`);
    } finally { await context.close(); }
}

(async () => {
    fs.mkdirSync(artifacts, { recursive: true });
    for (const name of (process.env.BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        assert.ok(engines[name], `Unknown engine: ${name}`);
        const browser = await engines[name].launch({ headless: true });
        try {
            for (const opts of [{}, { tag: 'div', role: 'listitem', listTag: 'div', listRole: 'list' }, { tag: 'div', classes: 'Box-row', listTag: 'div' }]) {
                for (const mobile of [false, true]) await checkFixture(browser, name, opts, mobile);
            }
            await checkSavedFixtures(browser, name);
            if (process.env.LIVE_GITHUB === '1' && name === 'chromium') await checkLivePage(browser);
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
