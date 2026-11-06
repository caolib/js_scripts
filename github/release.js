// ==UserScript==
// @name         GitHub Release 增强显示
// @namespace    http://tampermonkey.net/
// @version      2.10.2
// @description  github release 所有文件下载量显示；文件安装包分组、添加平台标签；根据用户当前系统/架构排序，推荐最可能安装的文件；将相对时间替换为精确时间（兼容手机与PC端）；更新日志可手动折叠
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

    // --- 注入 CSS 样式 ---
    function injectCSS() {
        if (document.getElementById('gh-release-grouper-css')) return;
        const style = document.createElement('style');
        style.id = 'gh-release-grouper-css';
        style.innerHTML = `
      .gh-group-win { border-left: 4px solid var(--color-accent-emphasis, #1f6feb) !important; background-color: var(--color-accent-subtle, rgba(56,139,253,0.1)) !important; }
      .gh-group-win:hover { background-color: var(--color-accent-muted, rgba(56,139,253,0.15)) !important; }
    .gh-group-win a[href*="/releases/download/"], .gh-group-win a[href*="/archive/"] { color: var(--color-accent-emphasis, #1f6feb) !important; }

      .gh-group-mac { border-left: 4px solid var(--color-done-emphasis, #8957e5) !important; background-color: var(--color-done-subtle, rgba(137,87,229,0.1)) !important; }
      .gh-group-mac:hover { background-color: var(--color-done-muted, rgba(137,87,229,0.15)) !important; }
    .gh-group-mac a[href*="/releases/download/"], .gh-group-mac a[href*="/archive/"] { color: var(--color-done-emphasis, #8957e5) !important; }

            .gh-group-mobile { border-left: 4px solid #e3b341 !important; background-color: rgba(227, 179, 65, 0.12) !important; }
            .gh-group-mobile:hover { background-color: rgba(227, 179, 65, 0.18) !important; }
        .gh-group-mobile a[href*="/releases/download/"], .gh-group-mobile a[href*="/archive/"] { color: #e3b341 !important; }

      .gh-group-linux-rpm { border-left: 4px solid var(--color-danger-emphasis, #f85149) !important; background-color: var(--color-danger-subtle, rgba(248,81,73,0.1)) !important; }
      .gh-group-linux-rpm:hover { background-color: var(--color-danger-muted, rgba(248,81,73,0.15)) !important; }
    .gh-group-linux-rpm a[href*="/releases/download/"], .gh-group-linux-rpm a[href*="/archive/"] { color: var(--color-danger-emphasis, #f85149) !important; }

      .gh-group-linux-deb { border-left: 4px solid var(--color-severe-emphasis, #db6d28) !important; background-color: var(--color-severe-subtle, rgba(219,109,40,0.1)) !important; }
      .gh-group-linux-deb:hover { background-color: var(--color-severe-muted, rgba(219,109,40,0.15)) !important; }
    .gh-group-linux-deb a[href*="/releases/download/"], .gh-group-linux-deb a[href*="/archive/"] { color: var(--color-severe-emphasis, #db6d28) !important; }

      .gh-group-linux-arch { border-left: 4px solid var(--color-sponsors-emphasis, #bf4b8a) !important; background-color: var(--color-sponsors-subtle, rgba(191,75,138,0.1)) !important; }
      .gh-group-linux-arch:hover { background-color: var(--color-sponsors-muted, rgba(191,75,138,0.15)) !important; }
    .gh-group-linux-arch a[href*="/releases/download/"], .gh-group-linux-arch a[href*="/archive/"] { color: var(--color-sponsors-emphasis, #bf4b8a) !important; }

      .gh-group-linux-appimage { border-left: 4px solid #20c997 !important; background-color: rgba(32, 201, 151, 0.1) !important; }
      .gh-group-linux-appimage:hover { background-color: rgba(32, 201, 151, 0.15) !important; }
    .gh-group-linux-appimage a[href*="/releases/download/"], .gh-group-linux-appimage a[href*="/archive/"] { color: #20c997 !important; }

      .gh-group-linux-flatpak { border-left: 4px solid #0abda0 !important; background-color: rgba(10, 189, 160, 0.1) !important; }
      .gh-group-linux-flatpak:hover { background-color: rgba(10, 189, 160, 0.15) !important; }
    .gh-group-linux-flatpak a[href*="/releases/download/"], .gh-group-linux-flatpak a[href*="/archive/"] { color: #0abda0 !important; }

      .gh-group-linux-other { border-left: 4px solid var(--color-attention-emphasis, #9e6a03) !important; background-color: var(--color-attention-subtle, rgba(210,153,34,0.1)) !important; }
      .gh-group-linux-other:hover { background-color: var(--color-attention-muted, rgba(210,153,34,0.15)) !important; }
    .gh-group-linux-other a[href*="/releases/download/"], .gh-group-linux-other a[href*="/archive/"] { color: var(--color-attention-emphasis, #9e6a03) !important; }

      .gh-group-other { border-left: 4px solid transparent !important; }

            /* 平台标签颜色与分组主色完全一致（镂空） */
            .gh-platform-tag {
                background-color: transparent !important;
            }
            .gh-platform-tag.gh-tag-win {
                color: var(--color-accent-emphasis, #1f6feb) !important;
                border-color: var(--color-accent-emphasis, #1f6feb) !important;
            }
            .gh-platform-tag.gh-tag-mac {
                color: var(--color-done-emphasis, #8957e5) !important;
                border-color: var(--color-done-emphasis, #8957e5) !important;
            }
            .gh-platform-tag.gh-tag-mobile {
                color: #e3b341 !important;
                border-color: #e3b341 !important;
            }
            .gh-platform-tag.gh-tag-linux-rpm {
                color: var(--color-danger-emphasis, #f85149) !important;
                border-color: var(--color-danger-emphasis, #f85149) !important;
            }
            .gh-platform-tag.gh-tag-linux-deb {
                color: var(--color-severe-emphasis, #db6d28) !important;
                border-color: var(--color-severe-emphasis, #db6d28) !important;
            }
            .gh-platform-tag.gh-tag-linux-arch {
                color: var(--color-sponsors-emphasis, #bf4b8a) !important;
                border-color: var(--color-sponsors-emphasis, #bf4b8a) !important;
            }
            .gh-platform-tag.gh-tag-linux-appimage {
                color: #20c997 !important;
                border-color: #20c997 !important;
            }
            .gh-platform-tag.gh-tag-linux-flatpak {
                color: #0abda0 !important;
                border-color: #0abda0 !important;
            }
            .gh-platform-tag.gh-tag-linux-other {
                color: var(--color-attention-emphasis, #9e6a03) !important;
                border-color: var(--color-attention-emphasis, #9e6a03) !important;
            }

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

      /* 控件独立换行,平台标签不放进窄屏隐藏的 SHA 区域 */
      .gh-assets-controls { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 0 4px 12px; vertical-align: middle; max-width: 100%; }
      .gh-assets-controls > * { margin-left: 0 !important; }
      .gh-assets-summary { display: flex !important; flex-wrap: wrap; align-items: center; }
      .gh-asset-info { flex-wrap: wrap; gap: 4px 0; }
      .gh-meta-container { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
      @media (max-width: 768px) {
        .gh-meta-container { margin-top: 4px; }
        .gh-assets-controls { margin-left: 0; flex-basis: 100%; }
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
        width: 40px; height: 40px; border-radius: 50%; border: none;
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
        { value: 'unknown', label: '系统未知' },
    ];

    const ARCH_OPTIONS = [
        { value: 'x86_64', label: 'x64' },
        { value: 'arm64', label: 'arm64' },
        { value: 'x86', label: 'x86' },
        { value: 'arm32', label: 'arm32' },
        { value: 'unknown', label: '架构未知' },
    ];

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
        if (/\.(sig|asc|sha\d+|md5|pem|blockmap)$/.test(name)) return { id: 'meta', showTag: false };
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
        if (groupId === 'android' || groupId === 'ios') return 'gh-group-mobile';
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
        if (groupId === 'android' || groupId === 'ios') return 'gh-tag-mobile';
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

    function applyRowStyle(row) {
        Array.from(row.classList).filter(c => c.startsWith('gh-group-')).forEach(c => row.classList.remove(c));
        row.classList.add(getGroupClass(row._groupInfo.id));
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
                    appendFoldout(parentList, groupRows, 'gh-meta-files-wrapper', '签名 / 校验文件', openGroups.has(id));
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

            // 阻止点击下拉框时折叠/展开 details
            select.addEventListener('click', (e) => e.stopPropagation());
            select.addEventListener('mousedown', (e) => e.stopPropagation());

            select.addEventListener('change', () => {
                _selectedOS = select.value;
                // 手动切换系统时采用目标平台默认架构,不当作设备检测结果。
                if (_selectedOS === 'android') _selectedArch = 'arm64';
                else if (['windows', 'mac', 'linux'].includes(_selectedOS)) _selectedArch = 'x86_64';
                document.querySelectorAll('.gh-os-select').forEach(s => { s.value = _selectedOS; });
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
            archSelect.title = '浏览器可能隐藏真实架构;显示未知时请手动选择';
            populateArchOptions(archSelect);

            // 阻止点击下拉框时折叠/展开 details
            archSelect.addEventListener('click', (e) => e.stopPropagation());
            archSelect.addEventListener('mousedown', (e) => e.stopPropagation());

            archSelect.addEventListener('change', () => {
                _selectedArch = archSelect.value;
                // 同步所有架构下拉框的选中状态
                document.querySelectorAll('.gh-arch-select').forEach(s => { s.value = _selectedArch; });
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