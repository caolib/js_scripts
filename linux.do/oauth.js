// ==UserScript==
// @name         Linux.do 增强
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  在 connect.linux.do 页面检测到「允许」按钮时自动点击；在 linux.do 页面自动点击外链跳转弹窗；支持功能开关
// @author       caolib
// @match        https://connect.linux.do/*
// @match        https://linux.do/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/caolib/js_scripts/main/linux.do/oauth.js
// @downloadURL  https://raw.githubusercontent.com/caolib/js_scripts/main/linux.do/oauth.js
// ==/UserScript==

(function () {
    'use strict';

    // --- 功能开关配置 ---
    const FEATURES = {
        autoApprove:   { key: 'feat_autoApprove',  label: '自动允许 OAuth 授权', default: true },
        autoExternal:  { key: 'feat_autoExternal', label: '自动跳过外链弹窗',     default: true },
    };

    function isEnabled(feature) {
        if (typeof GM_getValue === 'undefined') return FEATURES[feature].default;
        return GM_getValue(FEATURES[feature].key, FEATURES[feature].default);
    }

    function registerMenus() {
        if (typeof GM_registerMenuCommand === 'undefined') return;
        Object.entries(FEATURES).forEach(([featureKey, cfg]) => {
            const update = () => {
                const next = !GM_getValue(cfg.key, cfg.default);
                GM_setValue(cfg.key, next);
                alert(`「${cfg.label}」已${next ? '启用' : '禁用'}，刷新页面生效`);
            };
            const state = isEnabled(featureKey) ? '✅' : '❌';
            GM_registerMenuCommand(`${state} ${cfg.label}`, update);
        });
    }

    registerMenus();

    const isConnectPage = location.hostname === 'connect.linux.do';

    // ========== 授权登录自动允许 ==========
    if (isConnectPage) {
        if (!isEnabled('autoApprove')) return;
        // 更精确：优先匹配 oauth-actions 内的主按钮；兜底匹配 approve 链接
        const targetSelector =
            '.oauth-actions a.btn-pill.btn-pill-primary[href^="/oauth2/approve/"], ' +
            '.oauth-actions a[href^="/oauth2/approve/"], ' +
            'a[href^="/oauth2/approve/"]';

        let clicked = false;

        function tryClickApprove() {
            if (clicked) return true;

            const btn = document.querySelector(targetSelector);
            if (!btn) return false;

            clicked = true;

            // 先触发 click（有些站点会埋点/校验）
            try { btn.click(); } catch (_) { }

            // 再强制跳转到绝对地址，避免 click 被拦
            const href = btn.href || (btn.getAttribute('href') ? new URL(btn.getAttribute('href'), location.origin).href : '');
            if (href) location.assign(href);

            return true;
        }

        // 高频轮询（别用 1ms，浏览器实际也会被 clamp；10ms 更稳更省）
        const interval = setInterval(() => {
            if (tryClickApprove()) clearInterval(interval);
        }, 10);

        // RAF 并行检测
        (function rafCheck() {
            if (!clicked && !tryClickApprove()) requestAnimationFrame(rafCheck);
        })();

        // MutationObserver
        const observer = new MutationObserver(() => {
            if (tryClickApprove()) observer.disconnect();
        });

        if (document.documentElement) {
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }

        // 2 秒后清理
        setTimeout(() => {
            clearInterval(interval);
            observer.disconnect();
        }, 2000);
    }

    // ========== 自动点击外链跳转 ==========
    else {
        if (!isEnabled('autoExternal')) return;
        const modalSelector = '.external-link-modal';
        const btnSelector = '.d-modal__footer .btn-primary';

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        if (node.matches?.(modalSelector) || node.querySelector?.(modalSelector)) {
                            const btn = document.querySelector(btnSelector);
                            if (btn) btn.click();
                            return;
                        }
                    }
                }
            }
        });

        const startObserve = () => {
            observer.observe(document.body, { childList: true, subtree: true });
        };

        if (document.body) startObserve();
        else document.addEventListener('DOMContentLoaded', startObserve, { once: true });
    }
})();
