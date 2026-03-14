// ==UserScript==
// @name         GitHub Release 增强显示
// @namespace    http://tampermonkey.net/
// @version      2.7.4
// @description  github release 所有文件下载量显示；文件安装包分组、添加平台标签；根据用户当前系统排序，推荐最可能安装的文件；将相对时间替换为精确时间（兼容手机与PC端）
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
        replaceTime: { key: 'feat_replaceTime', label: '替换相对时间', default: true },
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

      .gh-group-mac { border-left: 4px solid var(--color-done-emphasis, #8957e5) !important; background-color: var(--color-done-subtle, rgba(137,87,229,0.1)) !important; }
      .gh-group-mac:hover { background-color: var(--color-done-muted, rgba(137,87,229,0.15)) !important; }

      .gh-group-mobile { border-left: 4px solid var(--color-success-emphasis, #238636) !important; background-color: var(--color-success-subtle, rgba(46,160,67,0.1)) !important; }
      .gh-group-mobile:hover { background-color: var(--color-success-muted, rgba(46,160,67,0.15)) !important; }

      .gh-group-linux-rpm { border-left: 4px solid var(--color-danger-emphasis, #f85149) !important; background-color: var(--color-danger-subtle, rgba(248,81,73,0.1)) !important; }
      .gh-group-linux-rpm:hover { background-color: var(--color-danger-muted, rgba(248,81,73,0.15)) !important; }

      .gh-group-linux-deb { border-left: 4px solid var(--color-severe-emphasis, #db6d28) !important; background-color: var(--color-severe-subtle, rgba(219,109,40,0.1)) !important; }
      .gh-group-linux-deb:hover { background-color: var(--color-severe-muted, rgba(219,109,40,0.15)) !important; }

      .gh-group-linux-arch { border-left: 4px solid var(--color-sponsors-emphasis, #bf4b8a) !important; background-color: var(--color-sponsors-subtle, rgba(191,75,138,0.1)) !important; }
      .gh-group-linux-arch:hover { background-color: var(--color-sponsors-muted, rgba(191,75,138,0.15)) !important; }

      .gh-group-linux-appimage { border-left: 4px solid #20c997 !important; background-color: rgba(32, 201, 151, 0.1) !important; }
      .gh-group-linux-appimage:hover { background-color: rgba(32, 201, 151, 0.15) !important; }

      .gh-group-linux-flatpak { border-left: 4px solid #0abda0 !important; background-color: rgba(10, 189, 160, 0.1) !important; }
      .gh-group-linux-flatpak:hover { background-color: rgba(10, 189, 160, 0.15) !important; }

      .gh-group-linux-other { border-left: 4px solid var(--color-attention-emphasis, #9e6a03) !important; background-color: var(--color-attention-subtle, rgba(210,153,34,0.1)) !important; }
      .gh-group-linux-other:hover { background-color: var(--color-attention-muted, rgba(210,153,34,0.15)) !important; }

      .gh-group-other { border-left: 4px solid transparent !important; }

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
      .gh-proxy-dropdown:hover .gh-proxy-dropdown-menu { display: block; }
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

      /* OS 切换下拉框 */
      .gh-os-select {
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
      .gh-os-select:hover {
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

      /* 移动端适配样式 */
      .gh-meta-container { flex-wrap: wrap; gap: 4px; }
      @media (max-width: 768px) {
        .gh-meta-container { margin-top: 4px; }
      }
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
        if (ua.includes('win')) return 'windows';
        if (ua.includes('mac')) return 'mac';
        if (ua.includes('android')) return 'android';
        if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
        if (ua.includes('linux')) return 'linux';
        return 'unknown';
    }

    let _selectedOS = null;
    const _processedDetails = [];

    function getActiveOS() {
        return _selectedOS || getCurrentOS();
    }

    const OS_OPTIONS = [
        { value: 'windows', label: 'Windows' },
        { value: 'mac', label: 'macOS' },
        { value: 'linux', label: 'Linux' },
        { value: 'android', label: 'Android' },
        { value: 'ios', label: 'iOS' },
    ];

    function parseFileGroup(fileName) {
        const name = fileName.toLowerCase();

        if (name.endsWith('.sig') || name.endsWith('.sha256') || name.endsWith('.pem') || name.endsWith('.blockmap')) {
            return { id: 'meta', showTag: false };
        }
        if (name.includes('source') || (name.endsWith('.tar.gz') && !name.endsWith('.app.tar.gz') && !name.includes('linux') && !name.includes('mac') && !name.includes('win'))) {
            return { id: 'source', showTag: false };
        }

        if (name.endsWith('.exe') || name.endsWith('.msi') || name.includes('-win') || name.includes('_win')) {
            return { id: 'windows', name: 'Win', labelClass: 'Label--info', showTag: true };
        }
        if (name.endsWith('.dmg') || name.endsWith('.pkg') || name.endsWith('.app.tar.gz') || name.includes('-mac') || name.includes('_mac') || name.includes('darwin')) {
            return { id: 'mac', name: 'Mac', labelClass: '', showTag: true };
        }

        if (name.endsWith('.apk') || name.endsWith('.aab')) {
            return { id: 'android', name: 'Android', labelClass: 'Label--success', showTag: true };
        }
        if (name.endsWith('.ipa')) {
            return { id: 'ios', name: 'iOS', labelClass: '', showTag: true };
        }

        if (name.endsWith('.deb')) return { id: 'linux-deb', name: 'Debian', labelClass: 'Label--warning', showTag: true };
        if (name.endsWith('.rpm')) return { id: 'linux-rpm', name: 'RedHat', labelClass: 'Label--danger', showTag: true };
        if (name.endsWith('.appimage')) return { id: 'linux-appimage', name: 'AppImage', labelClass: 'Label--info', showTag: true };
        if (name.endsWith('.flatpak')) return { id: 'linux-flatpak', name: 'Flatpak', labelClass: 'Label--info', showTag: true };
        if (name.endsWith('.pacman') || name.endsWith('.pkg.tar.zst')) return { id: 'linux-arch', name: 'Arch', labelClass: 'Label--secondary', showTag: true };
        if (name.includes('-linux') || name.includes('_linux') || name.endsWith('.tar.xz')) return { id: 'linux-other', name: 'Linux', labelClass: 'Label--warning', showTag: true };

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

    function calculateMatchScore(fileName, currentOS, groupId) {
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

        if (name.includes('x64') || name.includes('amd64') || name.includes('x86_64')) innerScore += 50;
        if (name.includes('arm64-v8a') || name.includes('v8a')) innerScore += 30;
        if (name.includes('arm64') || name.includes('aarch64')) innerScore += 20;
        if (name.includes('universal')) innerScore += 15;

        if (name.endsWith('.exe') || name.endsWith('.dmg') || name.endsWith('.appimage') || name.endsWith('.flatpak') || name.endsWith('.apk')) innerScore += 10;
        if (name.endsWith('.zip') || name.endsWith('.7z')) innerScore += 5;

        return groupScore + innerScore;
    }

    function getFileNameFromLink(linkElem) {
        // 优先从 href 提取真实文件名（兼容显示名被重命名的界面）
        const href = linkElem.getAttribute('href');
        if (href) {
            const lastSegment = decodeURIComponent(href.split('/').pop().split('?')[0]);
            if (lastSegment) return lastSegment;
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
                url: `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
                headers: { 'Accept': 'application/vnd.github.v3+json' },
                onload: (response) => {
                    if (response.status === 200) resolve(JSON.parse(response.responseText));
                    else reject(`API 请求失败: ${response.status}`);
                },
                onerror: (err) => reject(err)
            });
        });
    }

    // --- 核心解耦逻辑 ---

    function formatAndSortUI(detailsElem, force) {
        // 【核心修复1】移除了强依赖的 li.Box-row，改为筛选包含下载链接的通用 li 标签
        const validRows = Array.from(detailsElem.querySelectorAll('li')).filter(r => r.querySelector('a[href*="/releases/download/"], a[href*="/archive/"]'));
        if (validRows.length === 0) return;

        const prevCount = parseInt(detailsElem.dataset.validRowCount || '0');
        if (!force && validRows.length === prevCount) return;
        detailsElem.dataset.validRowCount = validRows.length;

        const parentList = validRows[0].parentNode;
        const os = getActiveOS();

        validRows.forEach(row => {
            const nameLink = row.querySelector('a[href*="/releases/download/"], a[href*="/archive/"]');
            let score = -10000;
            let groupInfo = { id: 'other', showTag: false };

            if (nameLink) {
                const fileName = getFileNameFromLink(nameLink);
                const href = nameLink.getAttribute('href') || '';
                groupInfo = href.includes('/archive/') ? { id: 'source', showTag: false } : parseFileGroup(fileName);
                score = calculateMatchScore(fileName, os, groupInfo.id);
            }
            row.dataset.matchScore = score;
            row._groupInfo = groupInfo;
            row._nameLink = nameLink;
        });

        validRows.forEach(row => row.remove());
        // 清除旧的签名文件折叠区
        const oldMetaWrapper = parentList.querySelector('.gh-meta-files-wrapper');
        if (oldMetaWrapper) oldMetaWrapper.remove();

        validRows.sort((a, b) => parseInt(b.dataset.matchScore) - parseInt(a.dataset.matchScore));

        const normalRows = validRows.filter(r => r._groupInfo.id !== 'meta');
        const metaRows = validRows.filter(r => r._groupInfo.id === 'meta');

        const applyRowStyle = (row) => {
            row.style.borderTop = '';
            row.style.borderLeft = '';
            row.style.backgroundColor = '';
            row.className = row.className.replace(/gh-group-\S+/g, '');

            const groupClass = getGroupClass(row._groupInfo.id);
            row.classList.add(groupClass);

            let metaContainer = row.querySelector('.gh-meta-container');
            if (!metaContainer) {
                metaContainer = document.createElement('div');
                metaContainer.className = 'gh-meta-container d-flex flex-items-center flex-shrink-0 mr-3';

                const rightSection = row.querySelector('.col-md-6') || row.querySelector('.flex-auto.flex-justify-end');
                const shaWrapper = rightSection ? rightSection.querySelector('.flex-1') : null;

                if (shaWrapper) {
                    shaWrapper.insertBefore(metaContainer, shaWrapper.firstChild);
                } else if (rightSection) {
                    rightSection.insertBefore(metaContainer, rightSection.firstChild);
                } else {
                    const leftSection = row.querySelector('.col-lg-6');
                    if (leftSection) {
                        leftSection.appendChild(metaContainer);
                    } else {
                        row.appendChild(metaContainer);
                    }
                }
            }

            row.querySelectorAll('.gh-platform-tag').forEach(tag => tag.remove());

            if (row._groupInfo.showTag) {
                const tag = document.createElement('span');
                tag.className = `Label ${row._groupInfo.labelClass} gh-platform-tag mr-2`;
                tag.textContent = row._groupInfo.name;
                metaContainer.appendChild(tag);
            }
        };

        normalRows.forEach((row) => {
            parentList.appendChild(row);
            applyRowStyle(row);
        });

        if (metaRows.length > 0) {
            const wrapper = document.createElement('details');
            wrapper.className = 'gh-meta-files-wrapper';
            const summary = document.createElement('summary');
            summary.textContent = `签名 / 校验文件 (${metaRows.length})`;
            wrapper.appendChild(summary);
            metaRows.forEach(row => {
                wrapper.appendChild(row);
                applyRowStyle(row);
            });
            parentList.appendChild(wrapper);
        }

        // "Show all X assets" 按钮移至底部
        const showAllBtn = Array.from(parentList.children).find(child =>
            !child.querySelector('a[href*="/releases/download/"], a[href*="/archive/"]') &&
            !child.classList.contains('gh-meta-files-wrapper') &&
            /show all/i.test(child.textContent)
        );
        if (showAllBtn) parentList.appendChild(showAllBtn);
    }

    function injectDownloadCounts(detailsElem, assets) {
        if (!assets) return;

        // 【同步修复】使用通用 li 查找
        const validRows = Array.from(detailsElem.querySelectorAll('li')).filter(r => r.querySelector('a[href*="/releases/download/"], a[href*="/archive/"]'));

        validRows.forEach(row => {
            const nameLink = row.querySelector('a[href*="/releases/download/"], a[href*="/archive/"]');
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

                let metaContainer = row.querySelector('.gh-meta-container');
                if (!metaContainer) {
                    metaContainer = document.createElement('div');
                    metaContainer.className = 'gh-meta-container d-flex flex-items-center flex-shrink-0 mr-3';
                    const rightSection = row.querySelector('.col-md-6') || row.querySelector('.flex-auto.flex-justify-end');
                    const shaWrapper = rightSection ? rightSection.querySelector('.flex-1') : null;
                    if (shaWrapper) shaWrapper.insertBefore(metaContainer, shaWrapper.firstChild);
                    else if (rightSection) rightSection.insertBefore(metaContainer, rightSection.firstChild);
                    else row.appendChild(metaContainer);
                }
                metaContainer.appendChild(countSpan);
            }
        });
    }

    function processProxyButtons(detailsElem) {
        const xiuBoxes = detailsElem.querySelectorAll('.XIU2-RS:not([data-dropdown-injected="true"])');
        xiuBoxes.forEach(xiuBox => {
            xiuBox.dataset.dropdownInjected = 'true';

            const links = Array.from(xiuBox.querySelectorAll('a.btn'));
            if (links.length === 0) return;

            xiuBox.style.display = 'flex';
            xiuBox.style.alignItems = 'center';

            const dropdown = document.createElement('div');
            dropdown.className = 'gh-proxy-dropdown';

            const btn = document.createElement('button');
            btn.className = 'Button Button--secondary Button--small';
            btn.innerHTML = `<span class="Button-content"><span class="Button-label">代理下载 ▼</span></span>`;

            const menu = document.createElement('div');
            menu.className = 'gh-proxy-dropdown-menu';

            links.forEach(link => {
                link.className = 'gh-proxy-menu-item';
                link.style.cssText = '';
                menu.appendChild(link);
            });

            dropdown.appendChild(btn);
            dropdown.appendChild(menu);

            xiuBox.innerHTML = '';
            xiuBox.appendChild(dropdown);
        });
    }

    function processReleaseBox(details, repoInfo, tagName) {
        if (details.dataset.boxProcessed === "true") return;
        details.dataset.boxProcessed = "true";
        _processedDetails.push(details);

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

        const summary = details.querySelector('summary');
        const titleSpan = summary ? (summary.querySelector('.d-inline-flex.flex-items-center') || summary) : null;

        // 下载量按钮（点击后不消失，可重复点击刷新）
        if (isEnabled('downloadBtn') && titleSpan && !summary.dataset.btnInjected) {
            summary.dataset.btnInjected = 'true';

            const btn = document.createElement('button');
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
                // 同步所有下拉框的选中状态
                document.querySelectorAll('.gh-os-select').forEach(s => { s.value = _selectedOS; });
                // 强制重新排序所有已处理的 details
                _processedDetails.forEach(d => {
                    d.dataset.validRowCount = '0';
                    if (d.open) formatAndSortUI(d, true);
                });
            });

            titleSpan.appendChild(select);
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
        observer.observe(details, { childList: true, subtree: true });

        details.addEventListener('toggle', () => {
            if (details.open) {
                if (isEnabled('groupAndSort')) formatAndSortUI(details);
                processProxyButtons(details);
            }
        });
    }

    function findTagNameForAssets(detailsElem) {
        const singleTagMatch = window.location.pathname.match(/\/releases\/tag\/([^/?]+)/);
        if (singleTagMatch) return decodeURIComponent(singleTagMatch[1]);

        const container = detailsElem.closest('section, .Box, .js-details-container, div[data-test-selector="release-card"]');
        if (container) {
            const tagLink = container.querySelector('a[href*="/releases/tag/"]');
            if (tagLink) {
                const match = tagLink.getAttribute('href').match(/\/releases\/tag\/([^/?]+)/);
                if (match) return decodeURIComponent(match[1]);
            }
        }
        return null;
    }

    function init() {
        if (isEnabled('replaceTime')) {
            replaceRelativeTimes();
            startTimeObserver();
        }

        if (!/^\/[^\/]+\/[^\/]+\/releases/.test(window.location.pathname)) return;

        injectCSS();

        const repoInfo = getRepoInfo();
        if (!repoInfo) return;

        const detailsElements = document.querySelectorAll('details');
        detailsElements.forEach(details => {
            const summary = details.querySelector('summary');
            if (summary && /Assets/i.test(summary.textContent)) {
                const tagName = findTagNameForAssets(details);
                if (tagName && (isEnabled('groupAndSort') || isEnabled('downloadBtn'))) {
                    processReleaseBox(details, repoInfo, tagName);
                }
            }
        });
    }

    init();
    document.addEventListener('turbo:load', init);
    document.addEventListener('pjax:end', init);

})();