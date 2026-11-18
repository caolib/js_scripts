const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const { instrumentedSource, row, release, savedRow } = require('./fixtures.cjs');

function load(t, html = '', navigator = {}, url = 'https://github.com/owner/repo/releases/tag/v1', features = {}) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    for (const [key, value] of Object.entries(navigator)) {
        Object.defineProperty(dom.window.navigator, key, { configurable: true, value });
    }
    dom.window.GM_getValue = (key, fallback) => features[key] ?? fallback;
    dom.window.matchMedia = () => ({ matches: false });
    dom.window.eval(instrumentedSource);
    return dom.window;
}

const settle = () => new Promise(resolve => setTimeout(resolve, 160));
const files = details => Array.from(details.querySelectorAll('[data-file]'), el => el.dataset.file);

for (const [name, navigator, expected] of [
    ['iPhone Safari', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone' }, 'ios'],
    ['iPad Safari', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', platform: 'iPad' }, 'ios'],
    ['iPad desktop mode', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }, 'ios'],
    ['Android Chrome', { userAgent: 'Mozilla/5.0 (Linux; Android 15; K)', platform: 'Linux armv8l' }, 'android'],
    ['Windows Firefox', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' }, 'windows'],
    ['Mac Safari', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel' }, 'mac'],
    ['Linux Firefox', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' }, 'linux'],
]) {
    test(`OS: ${name}`, t => {
        assert.equal(load(t, '', navigator).releaseTest.getCurrentOS(), expected);
    });
}

for (const [name, navigator, expected] of [
    ['MacIntel is ambiguous', { userAgent: 'Macintosh; Intel Mac OS X', platform: 'MacIntel' }, 'unknown'],
    ['Win32 is ambiguous', { userAgent: 'Windows NT 10.0', platform: 'Win32' }, 'unknown'],
    ['Android armv8l is ambiguous', { userAgent: 'Linux; Android 15', platform: 'Linux armv8l' }, 'unknown'],
    ['explicit ARM64', { userAgent: 'Linux; Android; aarch64', platform: 'Linux aarch64' }, 'arm64'],
    ['explicit x64', { userAgent: 'Windows NT 10.0; Win64; x64', platform: 'Win32' }, 'x86_64'],
    ['explicit x86', { userAgent: 'Linux i686', platform: 'Linux i686' }, 'x86'],
]) {
    test(`architecture: ${name}`, t => {
        assert.equal(load(t, '', navigator).releaseTest.getCurrentArch(), expected);
    });
}

test('Client Hints uses architecture/bitness and updates all releases', async t => {
    const html = release(row('tool-win-x64.exe') + row('tool-win-arm64.exe'));
    const w = load(t, html, {
        userAgent: 'Windows NT 10.0; Win64; x64',
        userAgentData: {
            platform: 'Windows',
            getHighEntropyValues: async keys => {
                assert.deepEqual(Array.from(keys), ['architecture', 'bitness']);
                return { architecture: 'arm', bitness: '64' };
            },
        },
    });
    await settle();
    assert.equal(w.releaseTest.getCurrentArch(), 'arm64');
    assert.equal(w.document.querySelector('.gh-arch-select').value, 'arm64');
    assert.equal(files(w.document.querySelector('#assets'))[0], 'tool-win-arm64.exe');
});

test('late Client Hints does not override a manual selection', async t => {
    let resolve;
    const w = load(t, release(row('tool-win-x64.exe') + row('tool-win-arm64.exe')), {
        userAgentData: { getHighEntropyValues: () => new Promise(r => { resolve = r; }) },
    });
    const select = w.document.querySelector('.gh-arch-select');
    select.value = 'x86';
    select.dispatchEvent(new w.Event('change'));
    resolve({ architecture: 'arm', bitness: '64' });
    await settle();
    assert.equal(select.value, 'x86');
});

test('denied Client Hints does not break grouping', async t => {
    const w = load(t, release(row('tool-win-x64.exe')), {
        userAgentData: { getHighEntropyValues: async () => { throw new Error('Not allowed'); } },
    });
    await settle();
    assert.ok(w.document.querySelector('.gh-group-win'));
    assert.equal(w.document.querySelector('.gh-arch-select').value, '');
    assert.equal(Array.from(w.document.querySelector('.gh-arch-select').options).some(option => option.value === 'unknown'), false);
    assert.equal(Array.from(w.document.querySelector('.gh-os-select').options).some(option => option.value === 'unknown'), false);
});

for (const [name, expected] of [
    ['SourceGit-win-x64.exe', 'windows'],
    ['resource-monitor-linux-x64.AppImage', 'linux-appimage'],
    ['tool-aarch64.tar.gz', 'other'],
    ['tool-freebsd-x64.tar.xz', 'other'],
    ['project-source.tar.xz', 'source'],
    ['tool-osx-arm64.zip', 'mac'],
    ['darwin-arm64.zip', 'mac'],
    ['tool_linux_arm.zip', 'linux-other'],
    ['tool-linux-x64.AppImage.sha256sum', 'linux-appimage'],
    ['tool-win-x64.exe.bsdiff', 'windows'],
    ['tool.pkg.tar.zst', 'linux-arch'],
    ['tool-win-x64.exe.sha512', 'meta'],
    ['latest-mac.yml', 'meta'],
    ['latest-linux.yaml', 'meta'],
    ['tool-windows-x64.YML', 'meta'],
    ['tool-android.yml', 'meta'],
    ['tool-ios.yaml', 'meta'],
]) {
    test(`file group: ${name}`, t => assert.equal(load(t).releaseTest.parseFileGroup(name).id, expected));
}

for (const [name, expected] of [
    ['tool-win-x86-64.exe', 'x86_64'],
    ['tool-win-x86_64.exe', 'x86_64'],
    ['tool_linux_arm.zip', 'arm32'],
    ['tool-linux-armv8l.tar.xz', 'arm32'],
    ['tool-linux-armv8.tar.xz', null],
    ['tool-arm64-v8a.apk', 'arm64'],
    ['tool-universal-x86_64-arm64.dmg', 'universal'],
    ['tool-universal2.dmg', 'universal'],
    ['charm.zip', null],
    ['tool-ia32.zip', 'x86'],
]) {
    test(`file architecture: ${name}`, t => assert.equal(load(t).releaseTest.parseFileArch(name), expected));
}

for (const [name, opts] of [
    ['plain li without GitHub classes', {}],
    ['ARIA list', { tag: 'div', role: 'listitem', listTag: 'div', listRole: 'list' }],
    ['Box-row fallback', { tag: 'div', classes: 'Box-row', listTag: 'div' }],
]) {
    test(`grouping DOM: ${name}`, t => {
        const html = release(row('tool-linux-x64.deb', opts) + row('tool-win-x64.exe', opts), { ...opts, summary: '下载文件' });
        const w = load(t, html, { userAgent: 'Windows NT 10.0; Win64; x64' });
        const details = w.document.querySelector('#assets');
        assert.deepEqual(files(details), ['tool-win-x64.exe', 'tool-linux-x64.deb']);
        assert.equal(details.querySelectorAll('.gh-platform-tag').length, 2);
        assert.equal(details.querySelectorAll('.gh-proxy-dropdown').length, 2);
    });
}

for (const number of ['', '2', '3']) {
    test(`saved GitHub DOM fixture release${number}.html`, t => {
        const w = load(t, release(savedRow(number)));
        const details = w.document.querySelector('#assets');
        assert.ok(w.releaseTest.getAssetRows(details).length > 0);
        assert.ok(details.querySelector('.gh-platform-tag'));
        details.querySelectorAll('.gh-meta-container').forEach(container => {
            assert.ok(container.parentElement === container.closest('li').querySelector('.col-md-6'));
            assert.equal(container.closest('.d-sm-none, .d-md-none'), null);
        });
        assert.equal(details.querySelector('.gh-meta-files-wrapper') !== null, number === '3');
        const platformIcons = details.querySelectorAll('.gh-platform-icon');
        assert.ok(platformIcons.length > 0);
        platformIcons.forEach(icon => {
            assert.ok(icon.nextElementSibling.classList.contains('gh-platform-icon-original'));
        });
        if (number === '3') assert.ok(details.querySelector('svg.octicon-verified:not(.gh-platform-icon-original)'));
    });
}

test('scroll-to-top button is a rounded square', t => {
    const w = load(t);
    const style = w.getComputedStyle(w.document.querySelector('.gh-scroll-top-btn'));
    assert.equal(style.width, '40px');
    assert.equal(style.height, '40px');
    assert.equal(style.borderRadius, '8px');
});

test('Assets summary keeps its native disclosure marker layout', t => {
    const w = load(t, release(row('tool-win-x64.exe')));
    const summary = w.document.querySelector('#assets > summary');
    assert.equal(w.getComputedStyle(summary).display, 'list-item');
    assert.equal(summary.querySelectorAll('.gh-assets-controls').length, 1);
});

test('Android and iOS use separate row, tag and auxiliary foldout classes', async t => {
    const w = load(t, release(row('tool-arm64.apk') + row('tool-arm64.ipa') +
        row('tool-arm64.apk.sha256sum') + row('tool-arm64.ipa.delta')));
    const details = w.document.querySelector('#assets');
    for (const [name, platform] of [['tool-arm64.apk', 'android'], ['tool-arm64.ipa', 'ios']]) {
        const asset = details.querySelector(`[data-file="${name}"]`);
        assert.ok(asset.classList.contains(`gh-group-${platform}`));
        assert.ok(asset.querySelector(`.gh-platform-tag.gh-tag-${platform}`));
        assert.ok(details.querySelector(`.gh-group-aux-wrapper.gh-group-${platform}`));
    }
    const apk = details.querySelector('[data-file="tool-arm64.apk"]');
    apk.querySelector('a').href = '/owner/repo/releases/download/v1/tool-arm64.ipa';
    await settle();
    assert.ok(apk.classList.contains('gh-group-ios'));
    assert.equal(apk.classList.contains('gh-group-android'), false);
    assert.ok(apk.querySelector('.gh-platform-tag.gh-tag-ios'));
    assert.equal(details.querySelector('.gh-group-mobile, .gh-tag-mobile'), null);
});

for (const [name, expected] of [
    ['tool-win-x64.exe', 'windows'],
    ['tool-mac-arm64.dmg', 'apple'],
    ['tool-arm64.ipa', 'apple'],
    ['tool-arm64.apk', 'android'],
    ['tool-linux-x64.deb', 'linux'],
    ['tool-linux-x64.rpm', 'linux'],
    ['tool-linux-x64.AppImage', 'linux'],
    ['tool-linux-x64.flatpak', 'linux'],
    ['tool.pkg.tar.zst', 'linux'],
    ['tool-linux-x64.tar.gz', 'linux'],
    ['tool-arm64.apk.sha256sum', 'android'],
    ['tool-win-x64.exe.sig', null],
    ['project-source.zip', null],
    ['release.json', null],
]) {
    test(`platform icon: ${name}`, t => {
        const w = load(t, release(row(name)));
        const asset = w.document.querySelector('[data-file]');
        const original = asset.querySelector('svg.octicon-package');
        const wrapper = original.parentElement;
        const link = asset.querySelector('a');
        const icon = asset.querySelector('.gh-platform-icon');
        if (expected) {
            assert.equal(icon.dataset.platform, expected);
            assert.equal(icon.namespaceURI, 'http://www.w3.org/2000/svg');
            assert.equal(icon.getAttribute('viewBox'), expected === 'linux' ? '0 0 38 38' : '0 0 16 16');
            assert.equal(Array.from(icon.classList).some(c => c.startsWith('gh-tag-')), false);
            assert.equal(icon.parentElement, wrapper);
            assert.equal(icon.nextSibling, original);
            assert.equal(icon.getAttribute('aria-hidden'), 'true');
            assert.ok(original.classList.contains('gh-platform-icon-original'));
        } else {
            assert.equal(icon, null);
            assert.equal(original.classList.contains('gh-platform-icon-original'), false);
        }
        for (let i = 0; i < 3; i++) w.releaseTest.formatAndSortUI(w.document.querySelector('#assets'), true);
        assert.equal(asset.querySelectorAll('.gh-platform-icon').length, expected ? 1 : 0);
        assert.equal(asset.querySelector('a'), link);
        assert.equal(original.parentElement, wrapper);
    });
}

test('platform icons update and restore originals when an asset href changes', async t => {
    const w = load(t, release(row('tool-arm64.apk')));
    const asset = w.document.querySelector('[data-file]');
    const original = asset.querySelector('svg.octicon-package');
    const originalMarkup = original.innerHTML;
    const icon = asset.querySelector('.gh-platform-icon');
    const link = asset.querySelector('a');
    link.href = '/owner/repo/releases/download/v1/tool-arm64.ipa';
    await settle();
    assert.equal(asset.querySelector('.gh-platform-icon'), icon);
    assert.equal(icon.dataset.platform, 'apple');
    assert.equal(icon.classList.contains('gh-tag-ios'), false);
    assert.equal(icon.getAttribute('viewBox'), '0 0 16 16');
    link.href = '/owner/repo/releases/download/v1/release.json';
    await settle();
    assert.equal(asset.querySelector('.gh-platform-icon'), null);
    assert.equal(original.classList.contains('gh-platform-icon-original'), false);
    assert.equal(original.innerHTML, originalMarkup);
    link.href = '/owner/repo/releases/download/v1/tool-win-x64.exe';
    await settle();
    assert.equal(asset.querySelector('.gh-platform-icon').dataset.platform, 'windows');
    assert.equal(original.innerHTML, originalMarkup);
});

test('grouping is independent of release tag and API', t => {
    const w = load(t, release(row('tool-win-x64.exe'), { summary: '下载文件' }), {}, 'https://github.com/owner/repo/releases');
    assert.ok(w.document.querySelector('.gh-group-win'));
    assert.equal(w.document.querySelector('.gh-fetch-dl-btn'), null);
});

test('lazy Assets and late release cards are discovered without page events', async t => {
    const w = load(t, '', {}, 'https://github.com/owner/repo/releases');
    w.document.body.insertAdjacentHTML('beforeend', release('', { summary: '下载文件', fragment: '/owner/repo/releases/expanded_assets/feature%2Fv1' }));
    await settle();
    const details = w.document.querySelector('#assets');
    assert.equal(w.releaseTest.findTagNameForAssets(details), 'feature/v1');
    assert.ok(details.querySelector('.gh-fetch-dl-btn'));
    details.querySelector('#asset-list').insertAdjacentHTML('beforeend', row('tool-win-x64.exe'));
    await settle();
    assert.ok(details.querySelector('.gh-group-win'));
});

test('same-count node replacement and href changes are reprocessed', async t => {
    const w = load(t, release(row('tool-win-x64.exe')));
    w.document.querySelector('[data-file]').outerHTML = row('tool-osx-arm64.zip');
    await settle();
    let asset = w.document.querySelector('[data-file]');
    assert.ok(asset.classList.contains('gh-group-mac'));
    asset.querySelector('a').href = '/owner/repo/releases/download/v1/tool-linux-x64.deb';
    await settle();
    assert.ok(asset.classList.contains('gh-group-linux-deb'));
    assert.equal(asset.querySelector('.gh-platform-tag').textContent, 'Debian');
});

test('Android switches to arm64 and synchronizes option order and asset ranking', async t => {
    let resolveHints;
    const html = release(row('tool-x86_64.apk') + row('tool-arm64-v8a.apk'));
    const w = load(t, html + html.replace('id="assets"', 'id="assets2"'), {
        userAgent: 'Windows NT 10.0; Win64; x64',
        userAgentData: { getHighEntropyValues: () => new Promise(resolve => { resolveHints = resolve; }) },
    });
    const os = w.document.querySelector('.gh-os-select');
    os.value = 'android';
    os.dispatchEvent(new w.Event('change'));
    resolveHints({ architecture: 'x86', bitness: '64' });
    await settle();
    w.document.querySelectorAll('.gh-arch-select').forEach(select => {
        assert.equal(select.value, 'arm64');
        assert.equal(select.options[0].value, 'arm64');
        assert.equal(select.options[1].value, 'arm32');
    });
    w.document.querySelectorAll('#assets, #assets2').forEach(details => {
        assert.equal(files(details)[0], 'tool-arm64-v8a.apk');
    });
    const arch = w.document.querySelector('.gh-arch-select');
    arch.value = 'x86_64';
    arch.dispatchEvent(new w.Event('change'));
    assert.equal(files(w.document.querySelector('#assets'))[0], 'tool-x86_64.apk');
});

for (const osName of ['windows', 'mac', 'linux']) {
    test(`switching to ${osName} defaults to x64 but allows manual override`, t => {
        const w = load(t, release(row('tool-arm64-v8a.apk') + row('tool-x86_64.apk')));
        const os = w.document.querySelector('.gh-os-select');
        os.value = 'android';
        os.dispatchEvent(new w.Event('change'));
        assert.equal(w.document.querySelector('.gh-arch-select').value, 'arm64');
        os.value = osName;
        os.dispatchEvent(new w.Event('change'));
        const arch = w.document.querySelector('.gh-arch-select');
        assert.equal(arch.value, 'x86_64');
        assert.equal(arch.options[0].value, 'x86_64');
        arch.value = 'arm64';
        arch.dispatchEvent(new w.Event('change'));
        assert.equal(arch.value, 'arm64');
    });
}

test('closed releases use the latest selection when reopened', async t => {
    const w = load(t, release(row('tool-win-x64.exe') + row('tool-linux-x64.deb')), { userAgent: 'Windows NT 10.0; Win64; x64' });
    const details = w.document.querySelector('#assets');
    details.open = false;
    await settle();
    const select = details.querySelector('.gh-os-select');
    select.value = 'linux';
    select.dispatchEvent(new w.Event('change'));
    details.open = true;
    await settle();
    assert.equal(files(details)[0], 'tool-linux-x64.deb');
});

test('multiple parent lists are not merged', t => {
    const w = load(t, `<details id="assets" open><summary>Assets</summary>
        <ul id="a">${row('tool-win-x64.exe')}</ul><ul id="b">${row('tool-linux-x64.deb')}</ul></details>`);
    assert.equal(w.document.querySelector('#a [data-file]').dataset.file, 'tool-win-x64.exe');
    assert.equal(w.document.querySelector('#b [data-file]').dataset.file, 'tool-linux-x64.deb');
});

test('foldouts remain valid and lossless when all rows are auxiliary/meta', async t => {
    const w = load(t, release(row('tool-win-x64.exe.sha256sum') + row('tool-win-x64.exe.sig')));
    const details = w.document.querySelector('#assets');
    details.querySelector('.gh-group-aux-wrapper').open = true;
    details.querySelector('.gh-meta-files-wrapper').open = true;
    for (let i = 0; i < 8; i++) w.releaseTest.formatAndSortUI(details, true);
    await settle();
    assert.equal(w.releaseTest.getAssetRows(details).length, 2);
    assert.equal(details.querySelectorAll('.gh-assets-foldout').length, 2);
    assert.equal(details.querySelectorAll('.gh-assets-foldout > details[open]').length, 2);
    assert.ok(Array.from(details.querySelector('#asset-list').children).every(el => el.tagName === 'LI'));
    assert.equal(details.querySelectorAll('.gh-folded-list > li').length, 2);
});

test('Linux groups cannot interleave due to architecture scores', t => {
    const w = load(t, release(row('a-linux-arm64.deb') + row('b-linux-x64.rpm') + row('c-linux-x64.deb')),
        { userAgent: 'X11; Linux x86_64' });
    const ids = Array.from(w.document.querySelectorAll('[data-file]'), el => el._groupInfo.id);
    assert.deepEqual(ids, ['linux-deb', 'linux-deb', 'linux-rpm']);
});

test('reordering preserves original links and event handlers', t => {
    const w = load(t, release(row('tool-linux-x64.deb') + row('tool-win-x64.exe')));
    const details = w.document.querySelector('#assets');
    const link = details.querySelector('[data-file="tool-linux-x64.deb"] a');
    let clicks = 0;
    link.addEventListener('click', e => { e.preventDefault(); clicks++; });
    w.releaseTest.formatAndSortUI(details, true);
    assert.equal(details.querySelector('[data-file="tool-linux-x64.deb"] a'), link);
    link.click();
    assert.equal(clicks, 1);
});

test('proxy links do not create fake asset rows and update even at same count', async t => {
    const w = load(t, release(row('tool-win-x64.exe')));
    const asset = w.document.querySelector('[data-file]');
    asset.insertAdjacentHTML('beforeend', `<div class="XIU2-RS"><a class="btn" href="https://mirror.example/https://github.com/owner/repo/releases/download/v1/tool-win-x64.exe">Mirror A</a></div>`);
    await settle();
    assert.equal(w.releaseTest.getAssetRows(w.document.querySelector('#assets')).length, 1);
    asset.querySelector('.XIU2-RS a').href = 'https://mirror2.example/file';
    await settle();
    assert.ok(asset.querySelector('.gh-proxy-dropdown-menu a[href="https://mirror2.example/file"]'));
});

test('touch click, keyboard Escape and outside click operate the proxy menu', t => {
    const w = load(t, release(row('tool-win-x64.exe')));
    const dropdown = w.document.querySelector('.gh-proxy-dropdown');
    const button = dropdown.querySelector('button');
    button.click();
    assert.ok(dropdown.classList.contains('is-open'));
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    button.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(dropdown.classList.contains('is-open'), false);
    button.click();
    w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(dropdown.classList.contains('is-open'), false);
    button.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(w.document.activeElement, dropdown.querySelector('a'));
    w.document.body.click();
    assert.equal(dropdown.classList.contains('is-open'), false);
});

test('Turbo-style cloned snapshots regain controls and proxy listeners', async t => {
    const w = load(t, release(row('tool-win-x64.exe') + row('tool-linux-x64.deb')));
    const old = w.document.querySelector('#assets');
    const clone = old.cloneNode(true);
    old.replaceWith(clone);
    w.document.dispatchEvent(new w.Event('turbo:load'));
    await settle();
    assert.equal(clone.querySelectorAll('.gh-assets-controls').length, 1);
    assert.equal(clone.querySelectorAll('.gh-os-select').length, 1);
    const select = clone.querySelector('.gh-os-select');
    select.value = 'linux';
    select.dispatchEvent(new w.Event('change'));
    assert.equal(files(clone)[0], 'tool-linux-x64.deb');
    clone.querySelector('.gh-proxy-dropdown button').click();
    assert.ok(clone.querySelector('.gh-proxy-dropdown.is-open'));
});

test('malformed percent encoding does not abort classification', t => {
    const w = load(t, release(row('tool-win-x64.exe', { href: '/owner/repo/releases/download/v1/tool-win-100%.exe' })));
    assert.ok(w.document.querySelector('.gh-group-win'));
});

test('unknown row structures are left intact, not guessed destructively', t => {
    const w = load(t, release(row('tool-win-x64.exe', { tag: 'article' }), { listTag: 'div' }));
    assert.equal(w.document.querySelector('article').parentElement.id, 'asset-list');
    assert.equal(w.document.querySelector('.gh-group-win'), null);
});

test('disabled grouping stays disabled after dynamic loading', async t => {
    const w = load(t, release(row('tool-win-x64.exe')), {}, undefined, { feat_groupSort: false });
    w.document.querySelector('#asset-list').insertAdjacentHTML('beforeend', row('tool-linux-x64.deb'));
    await settle();
    assert.equal(w.document.querySelector('.gh-platform-tag'), null);
    assert.equal(w.document.querySelector('.gh-platform-icon'), null);
    assert.equal(w.document.querySelector('.gh-platform-icon-original'), null);
    assert.equal(w.document.querySelector('.gh-os-select'), null);
});
