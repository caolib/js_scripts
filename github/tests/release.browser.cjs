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
    .asset-name, .d-flex { display: flex; align-items: center; }
    .mr-2 { margin-right: 8px; }
    .Label { display: inline-block; border: 1px solid; border-radius: 999px; padding: 0 6px; }
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
        const details = page.locator('#assets');
        const summary = details.locator(':scope > summary');
        const assertMarker = async () => {
            const style = await summary.evaluate(el => ({
                display: getComputedStyle(el).display,
                marker: getComputedStyle(el, '::marker').content,
                open: el.parentElement.open,
            }));
            assert.equal(style.display, 'list-item');
            assert.equal(style.marker, style.open ? '"▼ "' : '"▶ "');
        };
        await assertMarker();
        await summary.locator('span').first().click();
        assert.equal(await details.evaluate(el => el.open), false);
        await assertMarker();
        await summary.focus();
        await page.keyboard.press('Enter');
        assert.equal(await details.evaluate(el => el.open), true);
        await assertMarker();
        assert.equal(await page.locator('.gh-platform-tag').count(), 3);
        assert.equal(await page.locator('.gh-platform-icon').count(), 3);
        assert.equal(await page.locator('.gh-platform-icon-original').first().isVisible(), false);
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

async function checkPlatformAppearance(browser, engine, mobile, theme) {
    const names = ['tool-win-x64.exe', 'tool-mac-arm64.dmg', 'tool-linux-x64.deb',
        'tool-arm64.apk', 'tool-arm64.ipa', 'release.json'];
    const styles = theme === 'dark'
        ? 'body { background: #0d1117; color: #e6edf3; }'
        : 'body { background: #ffffff; color: #1f2328; --fgColor-success: #1a7f37; --color-success-subtle: rgba(46,160,67,0.1); }';
    const { context, page, errors } = await fixturePage(browser,
        `<style>${styles}</style>${release(names.map(name => row(name)).join(''))}`, mobile);
    try {
        await page.waitForSelector('.gh-platform-icon');
        const scrollButtonStyle = await page.locator('.gh-scroll-top-btn').evaluate(el => {
            const style = getComputedStyle(el);
            return { width: style.width, height: style.height, radius: style.borderRadius };
        });
        assert.deepEqual(scrollButtonStyle, { width: '40px', height: '40px', radius: '8px' });
        const getAppearance = name => page.locator(`[data-file="${name}"]`).evaluate(el => {
            const tag = el.querySelector('.gh-platform-tag');
            const icon = el.querySelector('.gh-platform-icon');
            const link = el.querySelector('a');
            return {
                border: getComputedStyle(el).borderLeftColor,
                background: getComputedStyle(el).backgroundColor,
                tagColor: getComputedStyle(tag).color,
                tagBorder: getComputedStyle(tag).borderColor,
                linkColor: getComputedStyle(link).color,
                iconColor: getComputedStyle(icon).color,
                iconFill: getComputedStyle(icon).fill,
                platform: icon.dataset.platform,
            };
        });
        const android = await getAppearance('tool-arm64.apk');
        const ios = await getAppearance('tool-arm64.ipa');
        assert.equal(android.platform, 'android');
        assert.equal(ios.platform, 'apple');
        assert.notEqual(android.border, ios.border);
        assert.notEqual(android.background, ios.background);
        for (const appearance of [android, ios]) {
            for (const key of ['tagColor', 'tagBorder', 'linkColor']) {
                assert.equal(appearance[key], appearance.border, `${key} does not match row color`);
            }
            assert.notEqual(appearance.iconColor, appearance.border);
            assert.equal(appearance.iconFill, appearance.iconColor);
        }
        assert.equal(android.iconColor, 'rgb(61, 220, 132)');
        assert.equal(ios.iconColor, 'rgb(209, 213, 219)');
        const linuxFills = await page.locator('[data-file="tool-linux-x64.deb"] .gh-platform-icon [fill]').evaluateAll(nodes =>
            Array.from(new Set(nodes.map(node => node.getAttribute('fill')))));
        assert.ok(linuxFills.includes('#ECEFF1'));
        assert.ok(linuxFills.includes('#263238'));
        assert.ok(linuxFills.includes('#FFC107'));
        for (const [name, platform] of [['tool-win-x64.exe', 'windows'], ['tool-mac-arm64.dmg', 'apple'],
            ['tool-linux-x64.deb', 'linux']]) {
            const icon = page.locator(`[data-file="${name}"] .gh-platform-icon`);
            assert.ok(await icon.isVisible());
            assert.equal(await icon.getAttribute('data-platform'), platform);
        }
        assert.equal(await page.locator('[data-file="release.json"] .gh-platform-icon').count(), 0);
        const details = page.locator('#assets');
        const summary = details.locator(':scope > summary');
        assert.equal(await summary.evaluate(el => getComputedStyle(el, '::marker').content), '"▼ "');
        await page.screenshot({ path: path.join(artifacts, `${engine}-${theme}-${mobile ? 'mobile' : 'desktop'}-platforms.png`), fullPage: true });
        await summary.locator('span').first().click();
        assert.equal(await details.evaluate(el => el.open), false);
        assert.equal(await summary.evaluate(el => getComputedStyle(el, '::marker').content), '"▶ "');
        assert.deepEqual(errors, []);
        console.log(`PASS ${engine} ${theme} ${mobile ? '320px touch' : 'desktop'} platform colors and logos`);
    } finally { await context.close(); }
}

async function checkLivePage(browser) {
    // 模拟用户脚本管理器注入:仅此临时测试上下文绕过页面 CSP。
    const context = await browser.newContext({ bypassCSP: true });
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
            for (const theme of ['light', 'dark']) {
                for (const mobile of [false, true]) await checkPlatformAppearance(browser, name, mobile, theme);
            }
            if (process.env.LIVE_GITHUB === '1' && name === 'chromium') await checkLivePage(browser);
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
