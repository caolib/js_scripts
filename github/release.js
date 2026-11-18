// ==UserScript==
// @name         GitHub Release 增强显示
// @namespace    http://tampermonkey.net/
// @version      2.10.4
// @description  github release 所有文件下载量显示；文件安装包分组、添加平台标签与系统图标；根据用户当前系统/架构排序，推荐最可能安装的文件；将相对时间替换为精确时间（兼容手机与PC端）；更新日志可手动折叠
// @author       caolib
// @match        https://github.com/*
// @icon         https://github.githubassets.com/pinned-octocat.svg
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      api.github.com
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // --- 功能开关配置 ---
    const FEATURES = {
        groupAndSort: { key: 'feat_groupSort', label: '文件分组排序', default: true },
        downloadBtn: { key: 'feat_dlBtn', label: '显示下载量按钮', default: true },
        replaceTime: { key: 'feat_replaceTime', label: '替换相对时间', default: false },
        collapsibleNotes: { key: 'feat_collapsibleNotes', label: '可折叠更新日志', default: true },
    };

    function isEnabled(feature) {
        if (typeof GM_getValue === 'undefined') return FEATURES[feature].default;
        return GM_getValue(FEATURES[feature].key, FEATURES[feature].default);
    }

    function registerMenus() {
        if (typeof GM_registerMenuCommand === 'undefined') return;
        Object.entries(FEATURES).forEach(([featureKey, cfg]) => {
            const update = () => {
                const current = GM_getValue(cfg.key, cfg.default);
                const next = !current;
                GM_setValue(cfg.key, next);
                alert(`「${cfg.label}」已${next ? '启用' : '禁用'}，刷新页面生效`);
            };
            const state = () => isEnabled(featureKey) ? '✅' : '❌';
            GM_registerMenuCommand(`${state()} ${cfg.label}`, update);
        });
    }

    registerMenus();

    // One Dark 官方色板（只应用于资源分组）：
    // https://github.com/atom/atom/blob/master/packages/one-dark-syntax/styles/colors.less
    const GROUP_COLORS = {
        win: '#61afef',                  // Blue / hue-2
        mac: '#c678dd',                  // Purple / hue-3
        android: '#98c379',              // Green / hue-4
        ios: '#e5c07b',                  // Orange 2 / hue-6-2
        'linux-rpm': '#e06c75',          // Red 1 / hue-5
        'linux-deb': '#d19a66',          // Orange 1 / hue-6
        'linux-arch': '#be5046',         // Red 2 / hue-5-2
        'linux-appimage': '#56b6c2',     // Cyan / hue-1
        'linux-flatpak': '#528bff',      // Syntax accent
        'linux-other': '#abb2bf',        // Default text / mono-1
    };

    // --- 注入 CSS 样式 ---
    function injectCSS() {
        if (document.getElementById('gh-release-grouper-css')) return;
        const style = document.createElement('style');
        style.id = 'gh-release-grouper-css';
        const groupStyles = Object.entries(GROUP_COLORS).map(([group, color]) => {
            const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)).join(', ');
            return `
      .gh-group-${group}, .gh-tag-${group} { --gh-group-color: ${color}; }
      .gh-group-${group} { border-left: 4px solid var(--gh-group-color) !important; background-color: rgba(${rgb}, 0.08) !important; }
      .gh-group-${group}:hover { background-color: rgba(${rgb}, 0.14) !important; }
      .gh-group-${group} a[href*="/releases/download/"], .gh-group-${group} a[href*="/archive/"] { color: var(--gh-group-color) !important; }`;
        }).join('\n');
        style.innerHTML = `
      ${groupStyles}
      .gh-group-other { border-left: 4px solid transparent !important; }

      /* 平台标签跟随分组色板,系统 logo 使用自身配色。 */
      .gh-platform-tag { background-color: transparent !important; color: var(--gh-group-color) !important; border-color: var(--gh-group-color) !important; }
      .gh-platform-icon { flex-shrink: 0; width: 16px; height: 16px; fill: currentColor; }
      .gh-platform-icon[data-platform="windows"] { color: #0078d4 !important; }
      .gh-platform-icon[data-platform="android"] { color: #3ddc84 !important; }
      .gh-platform-icon[data-platform="apple"] { color: #d1d5db !important; }
      .gh-platform-icon-original { display: none !important; }

      /* 第三方代理按钮的下拉菜单样式 */
      .gh-proxy-dropdown { position: relative; display: flex; align-items: center; }
      .gh-proxy-dropdown::after { content: ""; position: absolute; top: 100%; left: 0; right: 0; height: 10px; z-index: 998; }
      .gh-proxy-dropdown-menu {
        display: none; position: absolute; right: 0; top: 100%; z-index: 999;
        min-width: 80px; padding: 4px 0; margin-top: 4px;
        background-color: var(--overlay-bgColor, var(--color-canvas-overlay));
        border: 1px solid var(--border-color-default, var(--color-border-default));
        border-radius: 6px;
        box-shadow: var(--shadow-floating-large, 0 8px 24px rgba(140,149,159,0.2));
      }
      .gh-proxy-dropdown.is-open .gh-proxy-dropdown-menu { display: block; }
      .gh-proxy-menu-item {
        display: block !important; padding: 4px 16px !important; margin: 0 !important;
        border: none !important; border-radius: 0 !important; background: transparent !important;
        color: var(--fgColor-default, var(--color-fg-default)) !important; text-decoration: none !important;
        font-size: 12px !important; text-align: center !important; line-height: 1.5 !important;
      }
      .gh-proxy-menu-item:hover {
        background-color: var(--controlAction-bgColor-hover, var(--color-action-list-item-default-hover-bg)) !important;
        text-decoration: none !important;
      }
      .gh-proxy-container {
        margin-left: 8px;
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }
      .XIU2-RS.gh-xiu2-hidden {
        display: none !important;
      }

      /* OS / 架构 切换下拉框 */
      .gh-os-select, .gh-arch-select {
        appearance: auto;
        background-color: var(--button-default-bgColor-rest, var(--color-btn-bg, #21262d));
        border: 1px solid var(--button-default-borderColor-rest, var(--color-btn-border, rgba(240,246,252,0.1)));
        border-radius: 6px;
        color: var(--button-default-fgColor-rest, var(--color-btn-text, #c9d1d9));
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        line-height: 20px;
        padding: 3px 8px;
        margin-left: 8px;
      }
      .gh-os-select:hover, .gh-arch-select:hover {
        background-color: var(--button-default-bgColor-hover, var(--color-btn-hover-bg, #30363d));
        border-color: var(--button-default-borderColor-hover, var(--color-btn-hover-border, rgba(240,246,252,0.3)));
      }

      /* 签名/校验文件折叠区 */
      .gh-meta-files-wrapper > summary {
        cursor: pointer; padding: 8px 16px; font-size: 12px;
        color: var(--fgColor-muted, var(--color-fg-muted, #8b949e));
        border-top: 1px solid var(--borderColor-muted, var(--color-border-muted, #30363d));
      }
      .gh-meta-files-wrapper > summary:hover {
        color: var(--fgColor-default, var(--color-fg-default, #e6edf3));
      }

      /* 折叠区保持合法的列表结构,内部行不再重复绘制分组背景 */
      .gh-assets-foldout { list-style: none; }
      .gh-folded-list { list-style: none; padding: 0; margin: 0; }
      .gh-group-aux-wrapper { padding-left: 0 !important; }
      .gh-group-aux-wrapper .gh-folded-list > * {
        border-left: none !important;
        background-color: transparent !important;
      }
      .gh-group-aux-wrapper > summary {
        cursor: pointer; padding: 6px 16px; font-size: 12px;
        color: var(--fgColor-muted, var(--color-fg-muted, #8b949e));
      }
      .gh-group-aux-wrapper > summary:hover {
        color: var(--fgColor-default, var(--color-fg-default, #e6edf3));
      }

      /* summary 保留 list-item 才会绘制原生折叠箭头;仅控件内部使用 flex。 */
      .gh-assets-controls { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 0 4px 12px; vertical-align: middle; max-width: 100%; }
      .gh-assets-controls > * { margin-left: 0 !important; }
      .gh-assets-summary { display: list-item !important; }
      .gh-assets-summary::marker { content: "▶ "; }
      details[open] > .gh-assets-summary::marker { content: "▼ "; }
      .gh-asset-info { flex-wrap: wrap; gap: 4px 0; }
      .gh-meta-container { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
      @media (max-width: 768px) {
        .gh-meta-container { margin-top: 4px; }
        .gh-assets-controls { display: flex; margin-left: 0; }
      }

      /* 更新日志手动折叠(默认展开):低调的标题行,非按钮外观 */
      .markdown-body.gh-notes-collapsed { display: none !important; }
      .gh-notes-toggle {
        appearance: none; background: none; border: none; padding: 0;
        margin: 0 0 8px;
        display: inline-flex; align-items: center; gap: 6px;
        cursor: pointer; user-select: none;
        color: var(--fgColor-muted, var(--color-fg-muted, #8b949e));
        font-size: 14px; font-weight: 600;
      }
      .gh-notes-toggle:hover { color: var(--fgColor-default, var(--color-fg-default, #e6edf3)); }
      .gh-notes-chevron {
        display: inline-block; width: 0; height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 6px solid currentColor;
        transition: transform 0.12s ease;
        transform-origin: 50% 40%;
      }
      .gh-notes-toggle.is-collapsed .gh-notes-chevron { transform: rotate(-90deg); }

      /* 架构说明按钮 */
      .gh-arch-help-btn {
        appearance: none;
        background-color: var(--button-default-bgColor-rest, var(--color-btn-bg, #21262d));
        border: 1px solid var(--button-default-borderColor-rest, var(--color-btn-border, rgba(240,246,252,0.1)));
        border-radius: 6px;
        color: var(--button-default-fgColor-rest, var(--color-btn-text, #c9d1d9));
        cursor: pointer;
        font-size: 12px; font-weight: 600;
        width: 22px; height: 22px; line-height: 1;
        padding: 0; margin-left: 4px;
        display: inline-flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .gh-arch-help-btn:hover {
        background-color: var(--button-default-bgColor-hover, var(--color-btn-hover-bg, #30363d));
        border-color: var(--button-default-borderColor-hover, var(--color-btn-hover-border, rgba(240,246,252,0.3)));
      }

      /* 架构说明弹窗 */
      .gh-arch-help-overlay {
        position: fixed; inset: 0; z-index: 10000;
        background-color: rgba(1,4,9,0.6);
        display: flex; align-items: center; justify-content: center;
      }
      .gh-arch-help-modal {
        background-color: var(--color-canvas-default, #0d1117);
        border: 1px solid var(--color-border-default, #30363d);
        border-radius: 8px;
        padding: 16px 20px;
        max-width: 92vw; max-height: 85vh; overflow: auto;
        position: relative;
        box-shadow: var(--shadow-floating-large, 0 8px 24px rgba(0,0,0,0.4));
      }
      .gh-arch-help-modal h3 { margin: 0 0 8px; font-size: 16px; }
      .gh-arch-help-tip { margin: 0 0 12px; font-size: 12px; color: var(--color-fg-muted, #8b949e); }
      .gh-arch-help-modal table { border-collapse: collapse; width: 100%; font-size: 13px; }
      .gh-arch-help-modal th, .gh-arch-help-modal td {
        border: 1px solid var(--color-border-default, #30363d);
        padding: 6px 10px; text-align: left; vertical-align: top;
      }
      .gh-arch-help-modal th { background-color: var(--color-canvas-subtle, #161b22); font-weight: 600; }
      .gh-arch-help-close {
        position: absolute; top: 6px; right: 10px;
        background: none; border: none;
        color: var(--color-fg-muted, #8b949e);
        cursor: pointer; font-size: 22px; line-height: 1; padding: 0;
      }
      .gh-arch-help-close:hover { color: var(--color-fg-default, #e6edf3); }

      .gh-scroll-top-btn {
        position: fixed; right: 24px; bottom: 24px; z-index: 9999;
        width: 40px; height: 40px; border-radius: 8px;
        background-color: var(--button-default-bgColor-rest, var(--color-btn-bg, #21262d));
        border: 1px solid var(--button-default-borderColor-rest, var(--color-btn-border, rgba(240,246,252,0.1)));
        color: var(--button-default-fgColor-rest, var(--color-btn-text, #c9d1d9));
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        opacity: 0; pointer-events: none; transition: opacity 0.2s ease, background-color 0.15s ease;
      }
      .gh-scroll-top-btn:hover {
        background-color: var(--button-default-bgColor-hover, var(--color-btn-hover-bg, #30363d));
        border-color: var(--button-default-borderColor-hover, var(--color-btn-hover-border, rgba(240,246,252,0.3)));
      }
      .gh-scroll-top-btn.gh-visible { opacity: 1; pointer-events: auto; }
    `;
        document.head.appendChild(style);
    }

    // --- 相对时间替换 ---
    function replaceOneTime(el) {
        const dt = el.getAttribute('datetime');
        if (!dt) return;
        const d = new Date(dt);
        if (isNaN(d.getTime())) return;
        const pad = n => String(n).padStart(2, '0');
        const formatted =
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
            `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        el.setAttribute('data-gh-replaced', '1');
        // 同时替换 Shadow DOM（实际渲染层）和 Light DOM（fallback）
        if (el.shadowRoot) {
            el.shadowRoot.textContent = formatted;
        }
        el.textContent = formatted;
        el.style.cssText = 'font-variant-numeric: tabular-nums;';
    }

    function replaceRelativeTimes() {
        document.querySelectorAll('relative-time:not([data-gh-replaced])').forEach(replaceOneTime);
    }

    let _timeObserver = null;
    function startTimeObserver() {
        if (_timeObserver) return;
        _timeObserver = new MutationObserver(() => {
            document.querySelectorAll('relative-time:not([data-gh-replaced])').forEach(replaceOneTime);
        });
        _timeObserver.observe(document.body, { childList: true, subtree: true });
    }

    // --- 工具函数 ---

    function getCurrentOS() {
        const ua = navigator.userAgent.toLowerCase();
        const platform = String(navigator.platform || '').toLowerCase();
        // iOS UA 含有 Mac OS X;iPad 桌面模式通常报告 MacIntel。
        if (/iphone|ipad|ipod/.test(ua) || (platform === 'macintel' && navigator.maxTouchPoints > 1)) return 'ios';
        if (ua.includes('android')) return 'android';
        const hintedPlatform = String(navigator.userAgentData?.platform || '').toLowerCase();
        if (hintedPlatform === 'windows' || /windows|win32|win64/.test(ua)) return 'windows';
        if (hintedPlatform === 'macos' || /macintosh|mac os x/.test(ua)) return 'mac';
        if (hintedPlatform === 'linux' || /linux|cros/.test(ua)) return 'linux';
        return 'unknown';
    }

    let _selectedOS = null;
    let _selectedArch = null;
    let _hintedArch = null;
    let _archHintsRequested = false;
    const _processedDetails = new Set();

    function getActiveOS() {
        return _selectedOS || getCurrentOS();
    }

    function getActiveArch() {
        return _selectedArch || getCurrentArch();
    }

    // 强制重新排序所有已处理的 details
    function reprocessAllDetails() {
        _processedDetails.forEach(d => {
            if (!d.isConnected) {
                d._ghObserver?.disconnect();
                _processedDetails.delete(d);
            } else {
                d._ghRowStates = new WeakMap();
                if (d.open && isEnabled('groupAndSort')) formatAndSortUI(d, true);
            }
        });
    }

    const OS_OPTIONS = [
        { value: 'windows', label: 'Windows' },
        { value: 'mac', label: 'macOS' },
        { value: 'linux', label: 'Linux' },
        { value: 'android', label: 'Android' },
        { value: 'ios', label: 'iOS' },
    ];

    const ARCH_OPTIONS = [
        { value: 'x86_64', label: 'x64' },
        { value: 'arm64', label: 'arm64' },
        { value: 'x86', label: 'x86' },
        { value: 'arm32', label: 'arm32' },
    ];

    function appendAutoOption(select) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '自动检测';
        select.appendChild(option);
    }

    function populateArchOptions(select) {
        const preferred = getActiveOS() === 'android' ? ['arm64', 'arm32'] : [];
        const options = [
            ...preferred.map(value => ARCH_OPTIONS.find(opt => opt.value === value)),
            ...ARCH_OPTIONS.filter(opt => !preferred.includes(opt.value)),
        ];
        const selectedArch = getActiveArch();
        select.replaceChildren(...options.map(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            option.selected = opt.value === selectedArch;
            return option;
        }));
        appendAutoOption(select);
        if (selectedArch === 'unknown') select.value = '';
    }

    function getCurrentArch() {
        if (_hintedArch) return _hintedArch;
        const platform = String(navigator.platform || '').toLowerCase();
        const ua = navigator.userAgent.toLowerCase();
        const info = `${platform} ${ua}`;
        if (/aarch64|arm64/.test(info)) return 'arm64';
        if (/win64|x64|x86[_-]64|amd64|wow64/.test(info)) return 'x86_64';
        // armv8l/Win32/MacIntel 可能是兼容标识,不足以判断实际 CPU。
        if (/armv8l/.test(info)) return 'unknown';
        if (/armv7|armhf|armeabi/.test(info)) return 'arm32';
        if (/i[3-6]86|ia32/.test(info)) return 'x86';
        return 'unknown';
    }

    async function detectArchHints() {
        if (_archHintsRequested) return;
        _archHintsRequested = true;
        if (!navigator.userAgentData?.getHighEntropyValues) return;
        try {
            const hints = await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness']);
            const arch = String(hints.architecture || '').toLowerCase();
            const bits = String(hints.bitness || '');
            if (arch === 'x86' && bits === '64') _hintedArch = 'x86_64';
            else if (arch === 'x86' && bits === '32') _hintedArch = 'x86';
            else if (arch === 'arm' && bits === '64') _hintedArch = 'arm64';
            else if (arch === 'arm' && bits === '32') _hintedArch = 'arm32';
            else if (/^(arm64|aarch64)$/.test(arch)) _hintedArch = 'arm64';
            else if (/^(x86_64|amd64|x64)$/.test(arch)) _hintedArch = 'x86_64';
            if (_hintedArch && !_selectedArch) {
                document.querySelectorAll('.gh-arch-select').forEach(s => { s.value = _hintedArch; });
                reprocessAllDetails();
            }
        } catch (e) { /* 浏览器可能不支持或拒绝提供高熵信息,保留未知/手动选择 */ }
    }

    // 下划线也作为分隔符,避免 source/arm/x86 等子串误匹配。
    function hasFileToken(name, pattern) {
        return new RegExp(`(?:^|[^a-z0-9])(?:${pattern})(?=$|[^a-z0-9])`, 'i').test(name);
    }

    function parseFileArch(fileName) {
        const name = fileName.toLowerCase();
        const arm64 = hasFileToken(name, 'aarch64|arm64e?');
        const x64 = hasFileToken(name, 'x86[_-]64|x64|amd64');
        if (hasFileToken(name, 'universal|universal2') || (arm64 && x64)) return 'universal';
        if (arm64) return 'arm64';
        if (x64) return 'x86_64';
        if (hasFileToken(name, 'riscv64|riscv')) return 'riscv64';
        if (hasFileToken(name, 'armv[5-8]l|armv[5-7](?:a|hf)?|armeabi(?:-v7a)?|armhf|armel|arm32|arm')) return 'arm32';
        if (hasFileToken(name, 'i[3-6]86|ia32|x86|32[-_]?bit')) return 'x86';
        if (hasFileToken(name, 'mips(?:64|el|64el)?')) return 'mips';
        if (hasFileToken(name, 'ppc(?:64|64le)?|powerpc(?:64|64le)?')) return 'ppc';
        return null;
    }

    // --- 架构说明弹窗(全局复用一个,点背景或 × 关闭) ---
    let _archHelpModal = null;
    function showArchHelp() {
        if (!_archHelpModal) {
            _archHelpModal = createArchHelpModal();
            document.body.appendChild(_archHelpModal);
        }
        _archHelpModal.style.display = 'flex';
    }
    function createArchHelpModal() {
        const overlay = document.createElement('div');
        overlay.className = 'gh-arch-help-overlay';
        overlay.innerHTML = `
            <div class="gh-arch-help-modal">
                <button type="button" class="gh-arch-help-close" aria-label="关闭">×</button>
                <h3>设备架构说明</h3>
                <p class="gh-arch-help-tip">架构指 CPU 指令集架构(ISA),决定软件能否运行,不同架构一般不兼容。</p>
                <table>
                    <thead><tr><th>架构</th><th>别名</th><th>常见设备</th><th>说明</th></tr></thead>
                    <tbody>
                        <tr><td><strong>x86</strong></td><td>i386、i686、32 位</td><td>老电脑、旧工控机</td><td>Intel/AMD 32 位,已逐渐淘汰</td></tr>
                        <tr><td><strong>x86_64</strong></td><td>amd64、x64</td><td>大多数 Windows/Linux PC</td><td>桌面与服务器最常见</td></tr>
                        <tr><td><strong>ARM32</strong></td><td>armv7、armeabi-v7a</td><td>老安卓手机、树莓派早期</td><td>32 位 ARM</td></tr>
                        <tr><td><strong>ARM64</strong></td><td>aarch64、arm64</td><td>新安卓手机、Apple Silicon、树莓派 3/4/5</td><td>移动设备主流</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        const close = () => { overlay.style.display = 'none'; };
        overlay.querySelector('.gh-arch-help-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.style.display = 'none';
        return overlay;
    }

    // 判断是否为校验/增量更新等衍生文件(如 .sha256sum、.bsdiff),这类文件在本组内折叠收起
    function isAuxiliaryFile(fileName) {
        const name = fileName.toLowerCase();
        if (/\.sha\d*sum$/.test(name)) return true;       // .sha256sum / .sha512sum / .shasum
        if (/\.md5sum$/.test(name)) return true;
        if (/\.checksums?$/.test(name)) return true;
        if (/\.sums$/.test(name)) return true;
        if (/\.(bsdiff|delta|patch)$/.test(name)) return true;   // 增量更新补丁
        return false;
    }

    function parseFileGroup(fileName) {
        let name = fileName.toLowerCase();
        // 更新清单/配置文件优先归为元文件,不能由名称中的平台关键词判为安装包。
        if (/\.(sig|asc|sha\d+|md5|pem|blockmap|ya?ml)$/.test(name)) return { id: 'meta', showTag: false };
        // 衍生文件继承原安装包的平台,但仍在本组折叠。
        if (isAuxiliaryFile(name)) name = name.replace(/\.(sha\d*sum|md5sum|checksums?|sums|bsdiff|delta|patch)$/, '');

        if (/\.(exe|msi|msix|msixbundle)$/.test(name)) return { id: 'windows', name: 'Win', showTag: true };
        if (/\.(dmg|pkg)$/.test(name) || name.endsWith('.app.tar.gz')) return { id: 'mac', name: 'Mac', showTag: true };
        if (/\.(apk|aab)$/.test(name)) return { id: 'android', name: 'Android', showTag: true };
        if (name.endsWith('.ipa')) return { id: 'ios', name: 'iOS', showTag: true };
        if (name.endsWith('.deb')) return { id: 'linux-deb', name: 'Debian', showTag: true };
        if (name.endsWith('.rpm')) return { id: 'linux-rpm', name: 'RedHat', showTag: true };
        if (name.endsWith('.appimage')) return { id: 'linux-appimage', name: 'AppImage', showTag: true };
        if (/\.(flatpak|flatpakref)$/.test(name)) return { id: 'linux-flatpak', name: 'Flatpak', showTag: true };
        if (name.endsWith('.pacman') || /\.pkg\.tar\.(zst|xz|gz)$/.test(name)) return { id: 'linux-arch', name: 'Arch', showTag: true };

        if (hasFileToken(name, 'source|sources|src')) return { id: 'source', showTag: false };
        if (hasFileToken(name, 'windows|win(?:32|64)?')) return { id: 'windows', name: 'Win', showTag: true };
        if (hasFileToken(name, 'mac(?:os|osx)?|osx|darwin')) return { id: 'mac', name: 'Mac', showTag: true };
        if (hasFileToken(name, 'android')) return { id: 'android', name: 'Android', showTag: true };
        if (hasFileToken(name, 'ios')) return { id: 'ios', name: 'iOS', showTag: true };
        if (hasFileToken(name, 'linux')) return { id: 'linux-other', name: 'Linux', showTag: true };
        // 压缩格式不能证明平台或是否为源码。
        return { id: 'other', showTag: false };
    }

    function getGroupClass(groupId) {
        if (groupId === 'windows') return 'gh-group-win';
        if (groupId === 'mac') return 'gh-group-mac';
        if (groupId === 'linux-deb') return 'gh-group-linux-deb';
        if (groupId === 'linux-rpm') return 'gh-group-linux-rpm';
        if (groupId === 'linux-arch') return 'gh-group-linux-arch';
        if (groupId === 'linux-appimage') return 'gh-group-linux-appimage';
        if (groupId === 'linux-flatpak') return 'gh-group-linux-flatpak';
        if (groupId.startsWith('linux')) return 'gh-group-linux-other';
        if (groupId === 'android') return 'gh-group-android';
        if (groupId === 'ios') return 'gh-group-ios';
        return 'gh-group-other';
    }

    function getTagClass(groupId) {
        if (groupId === 'windows') return 'gh-tag-win';
        if (groupId === 'mac') return 'gh-tag-mac';
        if (groupId === 'linux-deb') return 'gh-tag-linux-deb';
        if (groupId === 'linux-rpm') return 'gh-tag-linux-rpm';
        if (groupId === 'linux-arch') return 'gh-tag-linux-arch';
        if (groupId === 'linux-appimage') return 'gh-tag-linux-appimage';
        if (groupId === 'linux-flatpak') return 'gh-tag-linux-flatpak';
        if (groupId.startsWith('linux')) return 'gh-tag-linux-other';
        if (groupId === 'android') return 'gh-tag-android';
        if (groupId === 'ios') return 'gh-tag-ios';
        return '';
    }

    function calculateMatchScore(fileName, currentOS, groupId, currentArch) {
        let groupScore = 0;
        let innerScore = 0;
        const name = fileName.toLowerCase();
        const isCurrentOS = (groupId === currentOS) || groupId.startsWith(currentOS + '-');

        if (isCurrentOS) {
            groupScore = 10000;
            if (groupId === 'linux-deb') groupScore += 300;
            else if (groupId === 'linux-rpm') groupScore += 200;
            else if (groupId === 'linux-appimage' || groupId === 'linux-flatpak') groupScore += 100;
        } else {
            if (groupId === 'windows') groupScore = 9000;
            else if (groupId === 'mac') groupScore = 8000;
            else if (groupId === 'linux-deb') groupScore = 7000;
            else if (groupId === 'linux-rpm') groupScore = 6000;
            else if (groupId === 'linux-appimage') groupScore = 5200;
            else if (groupId === 'linux-flatpak') groupScore = 5000;
            else if (groupId === 'linux-arch') groupScore = 4500;
            else if (groupId === 'linux-other') groupScore = 4000;
            else if (groupId === 'android') groupScore = 3500;
            else if (groupId === 'ios') groupScore = 3000;
            else if (groupId === 'other') groupScore = 2000;
            else if (groupId === 'meta') groupScore = -1000;
            else if (groupId === 'source') groupScore = -2000;
        }

        const fileArch = parseFileArch(fileName);
        if (currentArch !== 'unknown') {
            if (fileArch === currentArch) innerScore += 500;
            else if (fileArch === 'universal' && (currentArch === 'x86_64' || currentArch === 'arm64')) innerScore += 480;
            else if (!fileArch) innerScore += 100;
        }

        if (name.endsWith('.exe') || name.endsWith('.dmg') || name.endsWith('.appimage') || name.endsWith('.flatpak') || name.endsWith('.apk')) innerScore += 10;
        if (name.endsWith('.zip') || name.endsWith('.7z')) innerScore += 5;

        // 组间权重必须高于任何架构分,否则 Linux 各组会被交叉拆散。
        return groupScore * 1000 + innerScore;
    }

    function getFileNameFromLink(linkElem) {
        // 优先从 href 提取真实文件名（兼容显示名被重命名的界面）
        const href = linkElem.getAttribute('href');
        if (href) {
            try {
                const lastSegment = new URL(href, window.location.href).pathname.split('/').pop();
                if (lastSegment) {
                    try { return decodeURIComponent(lastSegment); }
                    catch (e) { return lastSegment; }
                }
            } catch (e) { /* 非法链接回退到显示文本 */ }
        }
        // 回退到 span 文本
        const fileNameSpan = linkElem.querySelector('.Truncate-text');
        return fileNameSpan ? fileNameSpan.textContent.trim() : linkElem.textContent.trim();
    }

    function formatCount(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return num;
    }

    function getRepoInfo() {
        const parts = window.location.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
        return null;
    }

    function fetchReleaseData(owner, repo, tag) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'GitHub-Release-Helper/2.10.1'
                },
                onload: (response) => {
                    if (response.status === 200) {
                        resolve(JSON.parse(response.responseText));
                    } else {
                        let errMsg = `API 请求失败: ${response.status}`;
                        try {
                            const errData = JSON.parse(response.responseText);
                            if (errData.message) {
                                errMsg += ` - ${errData.message}`;
                            }
                        } catch (e) { }
                        reject(errMsg);
                    }
                },
                onerror: (err) => reject(err)
            });
        });
    }

    // --- 以原始下载链接和列表语义定位,布局类名仅作为可选的摆放提示 ---
    const ASSET_LINK_SELECTOR = 'a[href*="/releases/download/"], a[href*="/archive/"], a[href*="/attestations/"]';
    const FOLDOUT_SELECTOR = '.gh-meta-files-wrapper, .gh-group-aux-wrapper';

    function getAssetLink(root) {
        return Array.from(root.querySelectorAll(ASSET_LINK_SELECTOR)).find(link => {
            if (link.closest('.gh-proxy-container, .XIU2-RS, summary')) return false;
            try {
                const url = new URL(link.getAttribute('href'), window.location.href);
                return url.origin === window.location.origin && /^\/[^/]+\/[^/]+\/(releases\/download\/|archive\/|attestations\/)/.test(url.pathname);
            } catch (e) { return false; }
        }) || null;
    }

    function getAssetRows(detailsElem) {
        const rows = new Set();
        detailsElem.querySelectorAll(ASSET_LINK_SELECTOR).forEach(link => {
            if (getAssetLink(link.parentElement) !== link) return;
            const row = link.closest('li, [role="listitem"], .Box-row');
            if (!row || !detailsElem.contains(row)) return;
            // 不跨入其他原生 details;允许重新取出本脚本折叠的行。
            let owner = row.closest('details');
            while (owner?.matches(FOLDOUT_SELECTOR)) owner = owner.parentElement.closest('details');
            if (owner === detailsElem) rows.add(row);
        });
        return Array.from(rows);
    }

    function getAssetList(row) {
        const foldout = row.closest('.gh-assets-foldout');
        if (foldout) return foldout.parentElement;
        const legacyWrapper = row.closest(FOLDOUT_SELECTOR);
        return legacyWrapper ? legacyWrapper.parentElement : row.parentElement;
    }

    function ensureMetaContainer(row) {
        let container = row.querySelector('.gh-meta-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'gh-meta-container d-flex flex-items-center flex-shrink-0 mr-3';
        }
        const rightSection = row.querySelector('.col-md-6, .flex-auto.flex-justify-end');
        const target = rightSection || row;
        if (rightSection) rightSection.classList.add('gh-asset-info');
        if (container.parentElement !== target) target.insertBefore(container, rightSection ? target.firstChild : null);
        return container;
    }

    /*
     * Windows/Apple/Android SVG: https://github.com/twbs/icons/tree/main/icons
     * Linux SVG: https://github.com/icons8/flat-color-icons/blob/master/svg/linux.svg
     * The MIT License (MIT)
     * Copyright (c) 2019-2024 The Bootstrap Authors
     * Copyright (c) Icons8
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    const PLATFORM_ICONS = {
        windows: '<path d="M6.555 1.375 0 2.237v5.45h6.555zM0 13.795l6.555.933V8.313H0zm7.278-5.4.026 6.378L16 16V8.395zM16 0 7.33 1.244v6.414H16z"/>',
        apple: '<path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516s1.52.087 2.475-1.258.762-2.391.728-2.43m3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422s1.675-2.789 1.698-2.854-.597-.79-1.254-1.157a3.7 3.7 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56s.625 1.924 1.273 2.796c.576.984 1.34 1.667 1.659 1.899s1.219.386 1.843.067c.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758q.52-1.185.473-1.282"/>',
        android: '<path d="m10.213 1.471.691-1.26q.069-.124-.048-.192-.128-.057-.195.058l-.7 1.27A4.8 4.8 0 0 0 8.005.941q-1.032 0-1.956.404l-.7-1.27Q5.281-.037 5.154.02q-.117.069-.049.193l.691 1.259a4.25 4.25 0 0 0-1.673 1.476A3.7 3.7 0 0 0 3.5 5.02h9q0-1.125-.623-2.072a4.27 4.27 0 0 0-1.664-1.476ZM6.22 3.303a.37.37 0 0 1-.267.11.35.35 0 0 1-.263-.11.37.37 0 0 1-.107-.264.37.37 0 0 1 .107-.265.35.35 0 0 1 .263-.11q.155 0 .267.11a.36.36 0 0 1 .112.265.36.36 0 0 1-.112.264m4.101 0a.35.35 0 0 1-.262.11.37.37 0 0 1-.268-.11.36.36 0 0 1-.112-.264q0-.154.112-.265a.37.37 0 0 1 .268-.11q.155 0 .262.11a.37.37 0 0 1 .107.265q0 .153-.107.264M3.5 11.77q0 .441.311.75.311.306.76.307h.758l.01 2.182q0 .414.292.703a.96.96 0 0 0 .7.288.97.97 0 0 0 .71-.288.95.95 0 0 0 .292-.703v-2.182h1.343v2.182q0 .414.292.703a.97.97 0 0 0 .71.288.97.97 0 0 0 .71-.288.95.95 0 0 0 .292-.703v-2.182h.76q.436 0 .749-.308.31-.307.311-.75V5.365h-9zm10.495-6.587a.98.98 0 0 0-.702.278.9.9 0 0 0-.293.685v4.063q0 .406.293.69a.97.97 0 0 0 .702.284q.42 0 .712-.284a.92.92 0 0 0 .293-.69V6.146a.9.9 0 0 0-.293-.685 1 1 0 0 0-.712-.278m-12.702.283a1 1 0 0 1 .712-.283q.41 0 .702.283a.9.9 0 0 1 .293.68v4.063a.93.93 0 0 1-.288.69.97.97 0 0 1-.707.284 1 1 0 0 1-.712-.284.92.92 0 0 1-.293-.69V6.146q0-.396.293-.68"/>',
        // 彩色 Tux: Icons8 Flat Color Icons（MIT）,保留上游 SVG 的独立填色。
        // https://github.com/icons8/flat-color-icons/blob/master/svg/linux.svg
        // Copyright (c) Icons8 — https://github.com/icons8/flat-color-icons/blob/master/LICENSE.md
        linux: `<g transform="translate(-5 -7)">
            <polygon fill="#ECEFF1" points="20.1,18.2 20.2,20.5 18.6,23.5 16.1,28.4 15.6,32.5 17.4,38.3 21.5,40.6 27.7,40.6 33.5,36.2 36.1,29.3 30.1,22 28.4,17.9"/>
            <path fill="#263238" d="M34.3,23.9c-1.6-2.3-2.9-3.7-3.6-6.6c-0.7-2.9,0.2-2.1-0.4-4.6c-0.3-1.3-0.8-2.2-1.3-2.9c-0.6-0.7-1.3-1.1-1.7-1.2c-0.9-0.5-3-1.3-5.6,0.1c-2.7,1.4-2.4,4.4-1.9,10.5c0,0.4-0.1,0.9-0.3,1.3c-0.4,0.9-1.1,1.7-1.7,2.4c-0.7,1-1.4,2-1.9,3.1c-1.2,2.3-2.3,5.2-2,6.3c0.5-0.1,6.8,9.5,6.8,9.7c0.4-0.1,2.1-0.1,3.6-0.1c2.1-0.1,3.3-0.2,5,0.2c0-0.3-0.1-0.6-0.1-0.9c0-0.6,0.1-1.1,0.2-1.8c0.1-0.5,0.2-1,0.3-1.6c-1,0.9-2.8,1.9-4.5,2.2c-1.5,0.3-4-0.2-5.2-1.7c0.1,0,0.3,0,0.4-0.1c0.3-0.1,0.6-0.2,0.7-0.4c0.3-0.5,0.1-1-0.1-1.3c-0.2-0.3-1.7-1.4-2.4-2c-0.7-0.6-1.1-0.9-1.5-1.3c0,0-0.6-0.6-0.8-0.8c-0.2-0.2-0.3-0.4-0.4-0.5c-0.2-0.5-0.3-1.1-0.2-1.9c0.1-1.1,0.5-2,1-3c0.2-0.4,0.7-1.2,0.7-1.2s-1.7,4.2-0.8,5.5c0,0,0.1-1.3,0.5-2.6c0.3-0.9,0.8-2.2,1.4-2.9s2.1-3.3,2.2-4.9c0-0.7,0.1-1.4,0.1-1.9c-0.4-0.4,6.6-1.4,7-0.3c0.1,0.4,1.5,4,2.3,5.9c0.4,0.9,0.9,1.7,1.2,2.7c0.3,1.1,0.5,2.6,0.5,4.1c0,0.3,0,0.8-0.1,1.3c0.2,0,4.1-4.2-0.5-7.7c0,0,2.8,1.3,2.9,3.9c0.1,2.1-0.8,3.8-1,4.1c0.1,0,2.1,0.9,2.2,0.9c0.4,0,1.2-0.3,1.2-0.3c0.1-0.3,0.4-1.1,0.4-1.4C37.6,29.9,35.9,26.2,34.3,23.9z"/>
            <ellipse fill="#ECEFF1" cx="21.6" cy="15.3" rx="1.3" ry="2"/>
            <ellipse fill="#ECEFF1" cx="26.1" cy="15.2" rx="1.7" ry="2.3"/>
            <ellipse transform="matrix(-0.1254 -0.9921 0.9921 -0.1254 8.9754 38.9969)" fill="#212121" cx="21.7" cy="15.5" rx="1.2" ry="0.7"/>
            <ellipse fill="#212121" cx="26" cy="15.6" rx="1" ry="1.3"/>
            <path fill="#FFC107" d="M39.3,37.6c-0.4-0.2-1.1-0.5-1.7-1.4c-0.3-0.5-0.2-1.9-0.7-2.5c-0.3-0.4-0.7-0.2-0.8-0.2c-0.9,0.2-3,1.6-4.4,0c-0.2-0.2-0.5-0.5-1-0.5c-0.5,0-0.7,0.2-0.9,0.6s-0.2,0.7-0.2,1.7c0,0.8,0,1.7-0.1,2.4c-0.2,1.7-0.5,2.7-0.5,3.7c0,1.1,0.3,1.8,0.7,2.1c0.3,0.3,0.8,0.5,1.9,0.5c1.1,0,1.8-0.4,2.5-1.1c0.5-0.5,0.9-0.7,2.3-1.7c1.1-0.7,2.8-1.6,3.1-1.9c0.2-0.2,0.5-0.3,0.5-0.9C40,37.9,39.6,37.7,39.3,37.6z"/>
            <path fill="#FFC107" d="M19.2,37.9c-1-1.6-1.1-1.9-1.8-2.9c-0.6-1-1.9-2.9-2.7-2.9c-0.6,0-0.9,0.3-1.3,0.7c-0.4,0.4-0.8,1.3-1.5,1.8c-0.6,0.5-2.3,0.4-2.7,1c-0.4,0.6,0.4,1.5,0.4,3c0,0.6-0.5,1-0.6,1.4c-0.1,0.5-0.2,0.8,0,1.2c0.4,0.6,0.9,0.8,4.3,1.5c1.8,0.4,3.5,1.4,4.6,1.5c1.1,0.1,3,0,3-2.7C21,39.9,20.1,39.5,19.2,37.9z"/>
            <path fill="#FFC107" d="M21.1,19.8C20.5,19.4,20,19,20,18.4c0-0.6,0.4-0.8,1-1.3c0.1-0.1,1.2-1.1,2.3-1.1s2.4,0.7,2.9,0.9c0.9,0.2,1.8,0.4,1.7,1.1c-0.1,1-0.2,1.2-1.2,1.7c-0.7,0.2-2,1.3-2.9,1.3c-0.4,0-1,0-1.4-0.1C22.1,20.8,21.6,20.3,21.1,19.8z"/>
            <path fill="#634703" d="M20.9,19c0.2,0.2,0.5,0.4,0.8,0.5c0.2,0.1,0.5,0.2,0.5,0.2c0.4,0,0.7,0,0.9,0c0.5,0,1.2-0.2,1.9-0.6c0.7-0.3,0.8-0.5,1.3-0.7c0.5-0.3,1-0.6,0.8-0.7c-0.2-0.1-0.4,0-1.1,0.4c-0.6,0.4-1.1,0.6-1.7,0.9c-0.3,0.1-0.7,0.3-1,0.3c-0.3,0-0.6,0-0.9,0c-0.3,0-0.5-0.1-0.8-0.2c-0.2-0.1-0.3-0.2-0.4-0.2c-0.2-0.1-0.6-0.5-0.8-0.6c0,0-0.2,0-0.1,0.1C20.6,18.7,20.7,18.8,20.9,19z"/>
            <path fill="#634703" d="M23.9,16.8c0.1,0.2,0.3,0.2,0.4,0.3c0.1,0.1,0.2,0.1,0.2,0.1c0.1-0.1,0-0.3-0.1-0.3C24.4,16.7,23.9,16.7,23.9,16.8z"/>
            <path fill="#634703" d="M22.3,17c0,0.1,0.2,0.2,0.2,0.1c0.1-0.1,0.2-0.2,0.3-0.2c0.2-0.1,0.1-0.2-0.2-0.2C22.4,16.8,22.4,16.9,22.3,17z"/>
            <path fill="#455A64" d="M32,34.7c0,0.1,0,0.2,0,0.3c0.2,0.4,0.7,0.5,1.1,0.5c0.6,0,1.2-0.4,1.5-0.8c0-0.1,0.1-0.2,0.2-0.3c0.2-0.3,0.3-0.5,0.4-0.6c0,0-0.1-0.1-0.1-0.2c-0.1-0.2-0.4-0.4-0.8-0.5c-0.3-0.1-0.8-0.2-1-0.2c-0.9-0.1-1.4,0.2-1.7,0.5c0,0,0.1,0,0.1,0.1c0.2,0.2,0.3,0.4,0.3,0.7C32.1,34.4,32,34.5,32,34.7z"/>
        </g>`,
    };

    function applyPlatformIcon(row) {
        const groupId = row._groupInfo.id;
        const platform = groupId.startsWith('linux') ? 'linux'
            : (groupId === 'mac' || groupId === 'ios') ? 'apple' : groupId;
        const markup = PLATFORM_ICONS[platform];
        // 只替换包图标,保留 span.d-flex.flex-items-start 等原有容器和其他图标。
        const original = row.querySelector('svg.gh-platform-icon-original, svg.octicon-package');
        let icon = row.querySelector('svg.gh-platform-icon');
        if (!markup || !original) {
            icon?.remove();
            original?.classList.remove('gh-platform-icon-original');
            return;
        }
        if (!icon) {
            icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('width', '16');
            icon.setAttribute('height', '16');
            icon.setAttribute('aria-hidden', 'true');
            icon.setAttribute('focusable', 'false');
        }
        const margins = Array.from(original.classList).filter(c => /^(?:tmp-)?mr-/.test(c));
        icon.setAttribute('class', ['octicon', 'gh-platform-icon', ...margins].join(' '));
        icon.setAttribute('viewBox', platform === 'linux' ? '0 0 38 38' : '0 0 16 16');
        if (icon.dataset.platform !== platform) {
            icon.innerHTML = markup;
            icon.dataset.platform = platform;
        }
        // 原图标仅隐藏不销毁:同一行链接变为源码/未知文件时可以原样恢复。
        original.classList.add('gh-platform-icon-original');
        if (icon.nextSibling !== original) original.before(icon);
    }

    function applyRowStyle(row) {
        Array.from(row.classList).filter(c => c.startsWith('gh-group-')).forEach(c => row.classList.remove(c));
        row.classList.add(getGroupClass(row._groupInfo.id));
        applyPlatformIcon(row);
        const container = ensureMetaContainer(row);
        row.querySelectorAll('.gh-platform-tag').forEach(tag => tag.remove());
        if (row._groupInfo.showTag) {
            const tag = document.createElement('span');
            tag.className = `Label gh-platform-tag ${getTagClass(row._groupInfo.id)} mr-2`;
            tag.textContent = row._groupInfo.name;
            container.appendChild(tag);
        }
    }

    function appendFoldout(parentList, rows, className, label, open) {
        const holder = document.createElement(parentList.matches('ul, ol') ? 'li' : 'div');
        holder.className = 'gh-assets-foldout';
        if (parentList.getAttribute('role') === 'list') holder.setAttribute('role', 'listitem');
        const wrapper = document.createElement('details');
        wrapper.className = className;
        wrapper.open = open;
        const summary = document.createElement('summary');
        summary.textContent = `${label} (${rows.length})`;
        wrapper.appendChild(summary);
        const list = document.createElement(rows[0].tagName === 'LI' ? 'ul' : 'div');
        list.className = 'gh-folded-list';
        if (rows[0].getAttribute('role') === 'listitem') list.setAttribute('role', 'list');
        rows.forEach(row => {
            list.appendChild(row);
            applyRowStyle(row);
        });
        wrapper.appendChild(list);
        holder.appendChild(wrapper);
        parentList.appendChild(holder);
    }

    function formatAndSortUI(detailsElem, force) {
        const lists = new Map();
        getAssetRows(detailsElem).forEach(row => {
            const parent = getAssetList(row);
            if (!lists.has(parent)) lists.set(parent, []);
            lists.get(parent).push(row);
        });
        const os = getActiveOS();
        const arch = getActiveArch();
        if (!detailsElem._ghRowStates) detailsElem._ghRowStates = new WeakMap();

        lists.forEach((rows, parentList) => {
            const state = new Map(rows.map(row => [row, getAssetLink(row).getAttribute('href')]));
            const prev = detailsElem._ghRowStates.get(parentList);
            // 比较节点和链接而不只比较数量,兼容同数量替换和展开更多资源。
            if (!force && prev?.size === state.size && Array.from(state).every(([row, href]) => prev.get(row) === href)) return;
            detailsElem._ghRowStates.set(parentList, state);
            const openGroups = new Set();
            Array.from(parentList.children).forEach(child => {
                const wrapper = child.matches(FOLDOUT_SELECTOR) ? child : child.querySelector(FOLDOUT_SELECTOR);
                if (wrapper?.open) openGroups.add(wrapper.dataset.groupId || (wrapper.classList.contains('gh-meta-files-wrapper') ? 'meta' : ''));
            });
            rows.forEach(row => {
                const link = getAssetLink(row);
                const path = new URL(link.getAttribute('href'), window.location.href).pathname;
                const name = getFileNameFromLink(link);
                row._nameLink = link;
                row._groupInfo = path.includes('/archive/') ? { id: 'source', showTag: false }
                    : path.includes('/attestations/') ? { id: 'meta', showTag: false } : parseFileGroup(name);
                row.dataset.matchScore = calculateMatchScore(name, os, row._groupInfo.id, arch);
                row.remove();
            });
            // 只清除当前列表的折叠区,不把多个列表误合并。
            Array.from(parentList.children).filter(c => c.matches('.gh-assets-foldout') || c.matches(FOLDOUT_SELECTOR)).forEach(c => c.remove());
            rows.sort((a, b) => Number(b.dataset.matchScore) - Number(a.dataset.matchScore));
            const groups = new Map();
            rows.forEach(row => {
                const id = row._groupInfo.id;
                if (!groups.has(id)) groups.set(id, []);
                groups.get(id).push(row);
            });
            groups.forEach((groupRows, id) => {
                if (id === 'meta') {
                    appendFoldout(parentList, groupRows, 'gh-meta-files-wrapper', '签名 / 校验 / 配置文件', openGroups.has(id));
                } else {
                    const main = groupRows.filter(r => !isAuxiliaryFile(getFileNameFromLink(r._nameLink)));
                    const aux = groupRows.filter(r => isAuxiliaryFile(getFileNameFromLink(r._nameLink)));
                    main.forEach(row => { parentList.appendChild(row); applyRowStyle(row); });
                    if (aux.length) appendFoldout(parentList, aux, `gh-group-aux-wrapper ${getGroupClass(id)}`, '校验/增量文件', openGroups.has(id));
                }
                const wrapper = parentList.lastElementChild?.querySelector(FOLDOUT_SELECTOR);
                if (wrapper) wrapper.dataset.groupId = id;
            });
            const showAllBtn = Array.from(parentList.children).find(child =>
                !child.matches('.gh-assets-foldout') && !getAssetLink(child) && /show all/i.test(child.textContent)
            );
            if (showAllBtn) parentList.appendChild(showAllBtn);
        });
    }

    function injectDownloadCounts(detailsElem, assets) {
        if (!assets) return;

        getAssetRows(detailsElem).forEach(row => {
            const nameLink = getAssetLink(row);
            if (!nameLink) return;

            const fileName = getFileNameFromLink(nameLink);

            const assetData = assets.find(a => a.name === fileName);
            if (assetData && !row.querySelector('.github-dl-count')) {
                const countSpan = document.createElement('span');
                countSpan.className = 'color-fg-muted flex-shrink-0 d-flex flex-items-center mr-2 github-dl-count';
                countSpan.style.whiteSpace = 'nowrap';
                countSpan.innerHTML = `
          <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-download mr-1" style="flex-shrink: 0; min-width: 16px;">
            <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"></path>
            <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"></path>
          </svg>
          <span>${formatCount(assetData.download_count)}</span>
        `;

                ensureMetaContainer(row).appendChild(countSpan);
            }
        });
    }

    function processProxyButtons(detailsElem) {
        function getOriginalDownloadUrl(row) {
            const directLink = getAssetLink(row);
            if (directLink && !directLink.getAttribute('href').includes('/attestations/')) {
                const href = directLink.getAttribute('href');
                if (href) return new URL(href, window.location.origin).href;
            }
            return null;
        }

        function collectXiuLinks(row) {
            const xiuBox = row.querySelector('.XIU2-RS');
            if (!xiuBox) return [];
            return Array.from(xiuBox.querySelectorAll('a.btn[href]'));
        }

        function mergeProxySources(originalUrl, xiuLinks) {
            const merged = [];
            const seen = new Set();

            const pushIfNew = (href, text, title = '') => {
                if (!href) return;
                const key = href.trim();
                if (!key || seen.has(key)) return;
                seen.add(key);
                merged.push({ href: key, text: text || '未命名', title });
            };

            if (originalUrl) {
                pushIfNew(`https://gh-proxy.org/${originalUrl}`, 'gh-proxy.org');
                pushIfNew(`https://ghproxy.net/${originalUrl}`, 'ghproxy.net');
            }

            // 仅用链接文本作为菜单项名称（如「美国」），完整描述放入 title 供悬停查看
            xiuLinks.forEach(link => {
                const href = link.getAttribute('href') || '';
                const text = link.textContent.trim();
                const title = link.getAttribute('title') || '';
                pushIfNew(href, text, title);
            });

            return merged;
        }

        function buildDropdown(proxySources) {
            const dropdown = document.createElement('div');
            dropdown.className = 'gh-proxy-dropdown';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'Button Button--secondary Button--small';
            btn.setAttribute('aria-expanded', 'false');
            btn.innerHTML = `<span class="Button-content"><span class="Button-label">代理下载 ▼</span></span>`;

            const menu = document.createElement('div');
            menu.className = 'gh-proxy-dropdown-menu';
            const setOpen = open => {
                dropdown.classList.toggle('is-open', open);
                btn.setAttribute('aria-expanded', String(open));
            };
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(!dropdown.classList.contains('is-open'));
            });
            dropdown.addEventListener('mouseenter', () => {
                if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) setOpen(true);
            });
            dropdown.addEventListener('mouseleave', () => {
                if (!dropdown.contains(document.activeElement)) setOpen(false);
            });
            dropdown.addEventListener('focusout', e => {
                if (!dropdown.contains(e.relatedTarget)) setOpen(false);
            });
            dropdown.addEventListener('keydown', e => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    btn.focus();
                } else if (e.key === 'ArrowDown' && e.target === btn) {
                    e.preventDefault();
                    setOpen(true);
                    menu.querySelector('a')?.focus();
                }
            });

            proxySources.forEach(source => {
                const link = document.createElement('a');
                link.className = 'gh-proxy-menu-item';
                link.href = source.href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = source.text;
                if (source.title) link.title = source.title;
                menu.appendChild(link);
            });

            dropdown.appendChild(btn);
            dropdown.appendChild(menu);
            return dropdown;
        }

        function ensureProxyContainer(row) {
            let container = row.querySelector('.gh-proxy-container');
            if (container) return container;

            container = document.createElement('div');
            container.className = 'gh-proxy-container';

            const rightSection = row.querySelector('.col-md-6') || row.querySelector('.flex-auto.flex-justify-end');
            const metaContainer = row.querySelector('.gh-meta-container');
            if (rightSection) {
                rightSection.classList.add('gh-asset-info');
                rightSection.appendChild(container);
            } else if (metaContainer) {
                metaContainer.appendChild(container);
            } else {
                row.appendChild(container);
            }

            return container;
        }

        getAssetRows(detailsElem).forEach(row => {
            const originalUrl = getOriginalDownloadUrl(row);
            if (!originalUrl) return;
            const xiuBox = row.querySelector('.XIU2-RS');
            const proxySources = mergeProxySources(originalUrl, collectXiuLinks(row));
            const container = ensureProxyContainer(row);
            const signature = JSON.stringify(proxySources);
            if (xiuBox) xiuBox.classList.add('gh-xiu2-hidden');
            if (container.querySelector('.gh-proxy-dropdown') && container.dataset.proxySignature === signature) return;
            container.replaceChildren(buildDropdown(proxySources));
            container.dataset.proxySignature = signature;
        });
    }

    // --- 更新日志手动折叠(默认展开) ---
    function processReleaseNotes() {
        document.querySelectorAll('.markdown-body.tmp-my-3:not(.gh-notes-processed)').forEach(el => {
            el.classList.add('gh-notes-processed');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'gh-notes-toggle';
            btn.innerHTML = `<span class="gh-notes-chevron"></span>更新日志`;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const collapsed = el.classList.toggle('gh-notes-collapsed');
                btn.classList.toggle('is-collapsed', collapsed);
            });
            el.parentNode.insertBefore(btn, el);
        });
    }

    function processReleaseBox(details, repoInfo, tagName) {
        if (_processedDetails.has(details)) return;
        details.dataset.boxProcessed = "true";
        _processedDetails.add(details);
        // Turbo 缓存可能恢复 cloneNode 的快照:属性还在,事件监听器不在。
        details.querySelectorAll('.gh-assets-controls').forEach(el => el.remove());
        details.querySelectorAll('.gh-proxy-container').forEach(el => { delete el.dataset.proxySignature; });

        if (details.open) {
            if (isEnabled('groupAndSort')) formatAndSortUI(details);
            processProxyButtons(details);
        }

        const fetchAndInject = async (forceRefresh) => {
            if (details.dataset.fetching === "true") return;
            if (!forceRefresh && details._assetsData) {
                injectDownloadCounts(details, details._assetsData);
                return;
            }

            details.dataset.fetching = "true";
            try {
                details.querySelectorAll('.github-dl-count').forEach(el => el.remove());
                const data = await fetchReleaseData(repoInfo.owner, repoInfo.repo, tagName);
                details._assetsData = data.assets;
                injectDownloadCounts(details, data.assets);
            } catch (error) {
                console.warn(`[GitHub Release 助手] 版本 ${tagName} 下载量获取失败:`, error);
                throw error;
            } finally {
                details.dataset.fetching = "false";
            }
        };

        const summary = Array.from(details.children).find(el => el.tagName === 'SUMMARY');
        let titleSpan = null;
        if (summary) {
            delete summary.dataset.btnInjected;
            delete summary.dataset.osSelectInjected;
            delete summary.dataset.archSelectInjected;
            summary.classList.add('gh-assets-summary');
            titleSpan = document.createElement('span');
            titleSpan.className = 'gh-assets-controls';
            summary.appendChild(titleSpan);
        }

        // 下载量需要 tag,文件分组本身不依赖 tag 或 API。
        if (isEnabled('downloadBtn') && tagName && titleSpan && !summary.dataset.btnInjected) {
            summary.dataset.btnInjected = 'true';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'Button Button--secondary Button--small ml-3 gh-fetch-dl-btn';
            btn.innerHTML = `<span class="Button-content"><span class="Button-label">显示下载量</span></span>`;

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (details.dataset.fetching === "true") return;

                const isRefresh = !!details._assetsData;
                btn.innerHTML = `<span class="Button-content"><span class="Button-label">获取中...</span></span>`;
                btn.disabled = true;

                fetchAndInject(isRefresh).then(() => {
                    btn.innerHTML = `<span class="Button-content"><span class="Button-label">刷新下载量</span></span>`;
                    btn.disabled = false;
                }).catch(() => {
                    btn.innerHTML = `<span class="Button-content"><span class="Button-label color-fg-danger">获取失败(限流)</span></span>`;
                    btn.disabled = false;
                });
            });

            titleSpan.appendChild(btn);
        }

        // OS 切换下拉框
        if (isEnabled('groupAndSort') && titleSpan && !summary.dataset.osSelectInjected) {
            summary.dataset.osSelectInjected = 'true';

            const select = document.createElement('select');
            select.className = 'gh-os-select';
            select.setAttribute('aria-label', '目标操作系统');
            const detectedOS = getCurrentOS();
            OS_OPTIONS.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                if (opt.value === (_selectedOS || detectedOS)) option.selected = true;
                select.appendChild(option);
            });
            appendAutoOption(select);
            if (!_selectedOS && detectedOS === 'unknown') select.value = '';

            // 阻止点击下拉框时折叠/展开 details
            select.addEventListener('click', (e) => e.stopPropagation());
            select.addEventListener('mousedown', (e) => e.stopPropagation());

            select.addEventListener('change', () => {
                _selectedOS = select.value || null;
                if (!_selectedOS) {
                    _selectedArch = null;
                } else if (_selectedOS === 'android') _selectedArch = 'arm64';
                else if (['windows', 'mac', 'linux'].includes(_selectedOS)) _selectedArch = 'x86_64';
                document.querySelectorAll('.gh-os-select').forEach(s => { s.value = _selectedOS || ''; });
                document.querySelectorAll('.gh-arch-select').forEach(populateArchOptions);
                // 强制重新排序所有已处理的 details
                reprocessAllDetails();
            });

            titleSpan.appendChild(select);
        }

        // 架构切换下拉框
        if (isEnabled('groupAndSort') && titleSpan && !summary.dataset.archSelectInjected) {
            summary.dataset.archSelectInjected = 'true';

            const archSelect = document.createElement('select');
            archSelect.className = 'gh-arch-select';
            archSelect.setAttribute('aria-label', '目标 CPU 架构');
            archSelect.title = '浏览器可能隐藏真实架构；自动检测失败时请手动选择';
            populateArchOptions(archSelect);

            // 阻止点击下拉框时折叠/展开 details
            archSelect.addEventListener('click', (e) => e.stopPropagation());
            archSelect.addEventListener('mousedown', (e) => e.stopPropagation());

            archSelect.addEventListener('change', () => {
                _selectedArch = archSelect.value || null;
                // 同步所有架构下拉框的选中状态
                document.querySelectorAll('.gh-arch-select').forEach(s => { s.value = _selectedArch || ''; });
                reprocessAllDetails();
            });

            titleSpan.appendChild(archSelect);

            // 架构说明按钮
            const helpBtn = document.createElement('button');
            helpBtn.type = 'button';
            helpBtn.className = 'gh-arch-help-btn';
            helpBtn.textContent = '?';
            helpBtn.title = '架构说明';
            helpBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            helpBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showArchHelp();
            });
            titleSpan.appendChild(helpBtn);
        }

        const observer = new MutationObserver(() => {
            if (details.open) {
                if (isEnabled('groupAndSort')) formatAndSortUI(details);
                processProxyButtons(details);
                if (details._assetsData) {
                    injectDownloadCounts(details, details._assetsData);
                }
            }
        });
        observer.observe(details, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
        details._ghObserver = observer;

        details.addEventListener('toggle', () => {
            if (details.open) {
                if (isEnabled('groupAndSort')) formatAndSortUI(details);
                processProxyButtons(details);
            }
        });
    }

    function getTagFromPath(path, kind) {
        const match = path.match(new RegExp(`^/[^/]+/[^/]+/releases/${kind}/(.+)$`));
        if (!match) return null;
        try { return decodeURIComponent(match[1]); }
        catch (e) { return match[1]; }
    }

    function getAssetsFragmentTag(detailsElem) {
        for (const fragment of detailsElem.querySelectorAll('include-fragment[src], turbo-frame[src]')) {
            if (fragment.closest('details') !== detailsElem) continue;
            try {
                const url = new URL(fragment.getAttribute('src'), window.location.href);
                if (url.origin !== window.location.origin) continue;
                const tag = getTagFromPath(url.pathname, 'expanded_assets');
                if (tag) return tag;
            } catch (e) { }
        }
        return null;
    }

    function isAssetsDetails(detailsElem) {
        if (detailsElem.matches(FOLDOUT_SELECTOR) || detailsElem.closest('.markdown-body')) return false;
        const summary = Array.from(detailsElem.children).find(el => el.tagName === 'SUMMARY');
        return !!summary && (getAssetRows(detailsElem).length > 0 || !!getAssetsFragmentTag(detailsElem) || /\bAssets\b/i.test(summary.textContent));
    }

    function findTagNameForAssets(detailsElem) {
        const fragmentTag = getAssetsFragmentTag(detailsElem);
        if (fragmentTag) return fragmentTag;
        const singleTag = getTagFromPath(window.location.pathname, 'tag');
        if (singleTag) return singleTag;
        // 从近到远查找唯一版本,避免把多张发布卡片都绑定到第一个 tag。
        for (let container = detailsElem.parentElement; container && container !== document.body; container = container.parentElement) {
            const tags = new Set();
            container.querySelectorAll('a[href*="/releases/tag/"]').forEach(link => {
                try {
                    const url = new URL(link.getAttribute('href'), window.location.href);
                    if (url.origin !== window.location.origin) return;
                    const tag = getTagFromPath(url.pathname, 'tag');
                    if (tag) tags.add(tag);
                } catch (e) { }
            });
            if (tags.size === 1) return Array.from(tags)[0];
            if (tags.size > 1) return null;
        }
        return null;
    }

    let _scrollTopBtn = null;
    function injectScrollToTopButton() {
        if (_scrollTopBtn) return;
        const btn = document.createElement('button');
        btn.className = 'gh-scroll-top-btn';
        btn.title = '回到顶部';
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4.25a.75.75 0 0 1 .53.22l4.25 4.25a.75.75 0 1 1-1.06 1.06L8 6.06 4.28 9.78a.75.75 0 1 1-1.06-1.06L7.47 4.47a.75.75 0 0 1 .53-.22Z"></path></svg>`;
        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        document.body.appendChild(btn);
        _scrollTopBtn = btn;
        const updateVisibility = () => {
            const threshold = 300;
            btn.classList.toggle('gh-visible', window.scrollY > threshold);
        };
        window.addEventListener('scroll', updateVisibility, { passive: true });
        updateVisibility();
    }

    function init() {
        injectCSS();
        injectScrollToTopButton();

        if (isEnabled('replaceTime')) {
            replaceRelativeTimes();
            startTimeObserver();
        }

        if (!/^\/[^\/]+\/[^\/]+\/releases/.test(window.location.pathname)) return;

        const repoInfo = getRepoInfo();
        if (!repoInfo) return;

        if (isEnabled('collapsibleNotes')) {
            processReleaseNotes();
        }

        _processedDetails.forEach(details => {
            if (!details.isConnected) {
                details._ghObserver?.disconnect();
                _processedDetails.delete(details);
            }
        });
        document.querySelectorAll('details').forEach(details => {
            if (isAssetsDetails(details) && (isEnabled('groupAndSort') || isEnabled('downloadBtn'))) {
                processReleaseBox(details, repoInfo, findTagNameForAssets(details));
            }
        });
        if (isEnabled('groupAndSort')) detectArchHints();
    }

    // GitHub 可在页面事件之后才插入发布卡片或加载 Assets。
    let _initTimer = null;
    const pageObserver = new MutationObserver(records => {
        const relevant = records.some(record => Array.from(record.addedNodes).some(node =>
            node.nodeType === 1 && (node.matches('details, summary, include-fragment, turbo-frame, .markdown-body') ||
                node.querySelector('details, summary, include-fragment, turbo-frame, .markdown-body') ||
                node.matches(ASSET_LINK_SELECTOR) || node.querySelector(ASSET_LINK_SELECTOR))
        ));
        if (!relevant || _initTimer !== null) return;
        _initTimer = window.setTimeout(() => { _initTimer = null; init(); }, 80);
    });
    pageObserver.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('click', e => {
        document.querySelectorAll('.gh-proxy-dropdown.is-open').forEach(dropdown => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('is-open');
                dropdown.querySelector('button').setAttribute('aria-expanded', 'false');
            }
        });
    });
    // Safari 触屏点击按钮可能不获得焦点,Esc 仍需能关闭已展开的菜单。
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.gh-proxy-dropdown.is-open').forEach(dropdown => {
            dropdown.classList.remove('is-open');
            dropdown.querySelector('button').setAttribute('aria-expanded', 'false');
        });
    });
    init();
    document.addEventListener('turbo:load', init);
    document.addEventListener('pjax:end', init);

})();