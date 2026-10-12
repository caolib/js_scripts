// ==UserScript==
// @name         AxonHub 增强（顶栏导航 / 置顶 / 自动刷新）
// @namespace    https://github.com/caolib
// @version      1.4.4
// @description  1) 顶栏添加「渠道 / 模型 / 请求」快捷导航（样式与侧边栏一致、随路由高亮）；2) 渠道列表（/channels）和模型列表（/models）操作列添加置顶按钮，状态持久化保存；3) 请求日志页（/project/requests）自动开启自动刷新（下拉里选 5s 间隔）
// @author       caolib
// @include      /^https?:\/\/[^\s\/]*:(8090|18090)(\/|$)/
// @include      https://hub.iikun.de5.net/*
// @run-at       document-idle
// @grant        none
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 作用范围：不再限制端口，交给 @include ----------
  // 原先这里有一道 PORTS 白名单（只允许 8090 / 18090），但 @include 里的域名
  // （如 hub.iikun.de5.net）走的是标准端口 443，会被这道白名单直接掐掉，
  // 表现就是「脚本已启用但界面毫无变化」。改为不限制端口，作用范围交给 @include。

  // ---------- SPA 路由变化广播（pushState / replaceState / popstate / hashchange） ----------
  const ROUTE_EVENT = 'axonhub-route-change';
  function emitRouteChange() {
    window.dispatchEvent(new Event(ROUTE_EVENT));
  }
  function patchHistoryMethod(name) {
    const original = history[name];
    history[name] = function (...args) {
      const result = original.apply(this, args);
      emitRouteChange();
      return result;
    };
  }
  patchHistoryMethod('pushState');
  patchHistoryMethod('replaceState');
  window.addEventListener('popstate', emitRouteChange);
  window.addEventListener('hashchange', emitRouteChange);

  // ---------- 置顶：页面配置（按路径自动切换） ----------
  const PAGES = [
    {
      test: (path) => path === '/channels',
      storageKey: 'axonhub_pinned_channels',
      // 渠道页：tbody 全部是数据行（表头在 thead）
      isDataRow: (row) => row.children.length > 1,
      // 标识：行内第一个有文本的链接（渠道名列）
      keyOf: (row) => {
        for (const a of row.querySelectorAll('td a')) {
          const t = a.textContent.trim();
          if (t) return t;
        }
        return null;
      },
    },
    {
      test: (path) => path === '/models',
      storageKey: 'axonhub_pinned_models',
      // 模型页：模型行多列；开发者组头行只有 1 个 td，跳过
      isDataRow: (row) => row.children.length > 3,
      // 标识：第 5 列为模型 ID（唯一），退回第 4 列（名称）
      keyOf: (row) => {
        for (const i of [4, 3]) {
          const td = row.children[i];
          if (td) {
            const t = td.textContent.trim();
            if (t) return t;
          }
        }
        return null;
      },
    },
  ];

  function detectPage() {
    const path = location.pathname.replace(/\/+$/, '');
    return PAGES.find((p) => p.test(path)) || null;
  }

  // ---------- 置顶数据（两个页面分开存储） ----------
  let currentKey = null;
  let pinned = [];
  function loadPinned(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  }

  function isPinned(row, cfg) {
    const k = cfg.keyOf(row);
    return !!k && pinned.includes(k);
  }

  // ---------- 排序：置顶行移到最前，其余保持原相对顺序 ----------
  function reorder(cfg) {
    const tbody = document.querySelector('table tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.children).filter((el) => el.tagName === 'TR');
    if (rows.length === 0) return;
    const isTop = (r) => cfg.isDataRow(r) && isPinned(r, cfg);
    const sorted = [...rows.filter(isTop), ...rows.filter((r) => !isTop(r))];
    // 顺序无变化时不动 DOM，避免和 React / MutationObserver 打架
    if (rows.some((r, i) => r !== sorted[i])) {
      try {
        sorted.forEach((r) => tbody.appendChild(r));
      } catch {
        // 移动 React 管理的节点极小概率与其渲染冲突，忽略即可，下次刷新会重试
      }
    }
  }

  // ---------- 置顶按钮 ----------
  function createPinButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.ahPin = '1';
    Object.assign(btn.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '2rem',
      height: '2rem',
      marginRight: '0.25rem',
      borderRadius: '0.375rem',
      border: '1px solid rgba(127,127,127,.35)',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: '0.85rem',
      lineHeight: '1',
      padding: '0',
      transition: 'background .15s, opacity .15s',
    });
    btn.addEventListener('mouseenter', () => (btn.style.background = 'rgba(127,127,127,.15)'));
    btn.addEventListener('mouseleave', () => (btn.style.background = 'transparent'));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cfg = detectPage();
      const row = btn.closest('tr');
      const k = row && cfg && cfg.keyOf(row);
      if (!k || !currentKey) return;
      if (pinned.includes(k)) {
        pinned = pinned.filter((x) => x !== k);
      } else {
        pinned.push(k);
      }
      localStorage.setItem(currentKey, JSON.stringify(pinned));
      refresh();
    });
    return btn;
  }

  // 仅在内容变化时写入 DOM，否则会不断触发 MutationObserver 造成死循环
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }
  function setTitle(el, title) {
    if (el.title !== title) el.title = title;
  }
  function setOpacity(el, value) {
    if (el.style.opacity !== value) el.style.opacity = value;
  }

  function refresh() {
    try {
      const cfg = detectPage();
      if (!cfg) return;
      if (cfg.storageKey !== currentKey) {
        currentKey = cfg.storageKey;
        pinned = loadPinned(currentKey);
      }

      document.querySelectorAll('table tbody tr').forEach((row) => {
        if (!cfg.isDataRow(row)) return;
        const k = cfg.keyOf(row);
        if (!k) return;
        const actionsTd = row.querySelector('td:last-child');
        if (!actionsTd) return;
        // 操作按钮包在 flex 容器 div 里，按钮要插进容器内才能同行显示
        const container = actionsTd.querySelector('div') || actionsTd;

        let btn = actionsTd.querySelector('button[data-ah-pin]');
        if (!btn) {
          btn = createPinButton();
        }
        if (btn.parentElement !== container) {
          container.insertBefore(btn, container.firstChild);
        }
        const active = pinned.includes(k);
        setText(btn, '📌');
        setTitle(btn, active ? '取消置顶' : '置顶');
        setOpacity(btn, active ? '1' : '0.45');
      });
      reorder(cfg);
    } catch {
      // 任何异常都不允许中断观察器循环，下一次变更会自动重试
    }
  }

  // ---------- 顶栏快捷导航（渠道 / 模型 / 请求） ----------
  const HEADER_NAV = [
    { href: '/channels', label: '渠道' },
    { href: '/models', label: '模型' },
    { href: '/project/requests', label: '请求' },
  ];

  // 侧边栏菜单项没渲染出来时的兜底样式（照抄侧边栏按钮的类名）
  const NAV_FALLBACK_CLS =
    'flex items-center gap-2 overflow-hidden rounded-2xl p-2 text-sm transition-all ' +
    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ' +
    'data-[active=true]:bg-primary data-[active=true]:font-medium data-[active=true]:text-primary-foreground';

  function isNavActive(href) {
    const p = location.pathname.replace(/\/+$/, '') || '/';
    return p === href || p.startsWith(href + '/');
  }

  // 侧边栏里同路径的菜单项（排除顶栏里我们自己克隆出来的节点）
  function findSidebarLink(href) {
    const nav = document.querySelector('[data-ah-header-nav]');
    return (
      Array.from(document.querySelectorAll('[data-slot="sidebar-menu-button"]')).find(
        (a) => a.getAttribute('href') === href && (!nav || !nav.contains(a))
      ) || null
    );
  }

  function onNavClick(e) {
    // 点侧边栏里同路径的链接，交给 React Router 做 SPA 跳转（不整页刷新）
    const href = e.currentTarget.getAttribute('href');
    const target = findSidebarLink(href);
    if (target && target !== e.currentTarget) {
      e.preventDefault();
      target.click();
    }
  }

  function createNavItem(item) {
    const src = findSidebarLink(item.href);
    let a;
    if (src) {
      // 直接克隆侧边栏节点，图标、配色、圆角与侧边栏完全一致
      a = src.cloneNode(true);
      // 去掉侧边栏专用标记，避免被上面的 findSidebarLink 当成侧边栏节点
      a.removeAttribute('data-slot');
      a.removeAttribute('data-sidebar');
      a.removeAttribute('data-size');
      a.removeAttribute('data-state');
    } else {
      a = document.createElement('a');
      a.className = NAV_FALLBACK_CLS;
      const span = document.createElement('span');
      span.textContent = item.label;
      a.appendChild(span);
    }
    a.removeAttribute('id');
    a.removeAttribute('data-status');
    a.setAttribute('href', item.href);
    a.setAttribute('data-ah-nav', item.href);
    a.addEventListener('click', onNavClick);

    // 顶栏比侧边栏窄：行高压到 32px（和顶栏其它按钮一致），
    // 内边距/圆角/图标同步收窄。用内联样式覆盖克隆来的侧边栏类名，配色类名保持不变。
    Object.assign(a.style, {
      height: '32px',
      padding: '0 10px',
      gap: '6px',
      borderRadius: '8px',
    });
    const svg = a.querySelector('svg');
    if (svg) {
      Object.assign(svg.style, { width: '16px', height: '16px', flexShrink: '0' });
    }
    return a;
  }

  function ensureHeaderNav() {
    try {
      const header = document.querySelector('header');
      const bar = header && header.firstElementChild;
      if (!bar) return;

      let wrap = bar.querySelector('[data-ah-header-nav]');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.setAttribute('data-ah-header-nav', '1');
        // 绝对定位挂在顶栏正中间，不受左侧分组宽度影响
        wrap.className = 'absolute left-1/2 -translate-x-1/2 flex items-center gap-1';
        bar.appendChild(wrap);
      }

      HEADER_NAV.forEach((item, i) => {
        let a = wrap.querySelector('[data-ah-nav="' + item.href + '"]');
        if (!a) a = createNavItem(item);
        if (wrap.children[i] !== a) wrap.insertBefore(a, wrap.children[i] || null);

        // 当前路由高亮，和侧边栏 data-active=true 的橙色实心块一致
        const active = isNavActive(item.href);
        const val = active ? 'true' : 'false';
        if (a.getAttribute('data-active') !== val) a.setAttribute('data-active', val);
        if (active) {
          if (a.getAttribute('aria-current') !== 'page') a.setAttribute('aria-current', 'page');
        } else if (a.hasAttribute('aria-current')) {
          a.removeAttribute('aria-current');
        }
      });
    } catch {
      // 顶栏结构变化时静默跳过，下次 DOM 变更会重试
    }
  }

  // ---------- 请求日志自动刷新 ----------
  // AxonHub 的自动刷新控件（src/components/auto-refresh-control.tsx）不是开关，而是
  // 「刷新」按钮 + 一个 Radix DropdownMenu，菜单里选 5s/10s/30s/60s（没有 3s）。
  // 选中值存在 localStorage，关闭时写字符串 'closed'，key 见 src/features/requests/index.tsx。
  const AUTO_REFRESH_PATH = '/project/requests';
  const AR_STORAGE_KEY = 'requests-auto-refresh-interval-ms';
  // 最短可用间隔就是 5s，没有 3s；写 3s 会导致菜单里找不到对应选项
  const AR_DEFAULT_INTERVAL = '5000';
  const AR_TRIGGER_SEL = '[data-testid="auto-refresh-trigger"]';
  const AR_BUTTON_SEL = '[data-testid="manual-refresh-button"]';
  const AR_MENU_TIMEOUT = 3000;

  let arObserver = null;
  let arObserverTimer = null;
  let arRouteTimer = null;
  let arMenuTimer = null;
  let arLastUrl = location.href;

  function isRequestsPage() {
    return (
      location.pathname === AUTO_REFRESH_PATH || location.pathname.startsWith(AUTO_REFRESH_PATH + '/')
    );
  }

  // 目标间隔：localStorage 里没写过就用默认值；显式写成 closed 说明用户主动关了，不碰；
  // 历史上误存过 3s 这类 AxonHub 不支持的间隔，统一抬到最小的 5s
  function arTargetInterval() {
    try {
      const stored = localStorage.getItem(AR_STORAGE_KEY);
      if (stored === null) return AR_DEFAULT_INTERVAL;
      if (stored === 'closed') return null;
      const n = Number(stored);
      if (!Number.isFinite(n) || n < Number(AR_DEFAULT_INTERVAL)) return AR_DEFAULT_INTERVAL;
      return stored;
    } catch {
      return AR_DEFAULT_INTERVAL;
    }
  }

  function arCloseMenu() {
    clearTimeout(arMenuTimer);
    arMenuTimer = null;
    document.querySelector('[data-testid="auto-refresh-menu"]')?.remove();
  }

  // 菜单打开后点击目标项；Radix 的菜单项走 click，直接 dispatch 即可
  function arClickOption(value) {
    let item = document.querySelector(`[data-testid="auto-refresh-option-${value}"]`);
    if (!item) {
      // 目标间隔在菜单里不存在（比如历史遗留的 3s），退而求其次选最小的可用间隔；
      // 只挑纯数字的选项，避免误点到「关闭」
      const opts = Array.from(document.querySelectorAll('[data-testid^="auto-refresh-option-"]')).filter((el) =>
        /^\d+$/.test((el.getAttribute('data-testid') || '').replace('auto-refresh-option-', ''))
      );
      if (opts.length) {
        const num = (el) => Number((el.getAttribute('data-testid') || '').replace(/\D+/g, '')) || Infinity;
        opts.sort((a, b) => num(a) - num(b));
        item = opts[0];
      }
    }
    if (!item) return false;
    arCloseMenu();
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  // 按钮文案就是当前状态：关闭时是「刷新」，开启时是「5s」这类间隔
  function arIsEnabled() {
    const btn = document.querySelector(AR_BUTTON_SEL);
    if (!btn) return null;
    return /^\d+s$/.test((btn.textContent || '').trim());
  }

  function enableAutoRefresh() {
    if (!isRequestsPage()) {
      return false;
    }

    const target = arTargetInterval();
    if (target === null) {
      // 用户主动关闭过，不再自动开启
      return true;
    }

    // 已经开着（按钮显示 5s 这类文案）就收工，不重复点
    if (arIsEnabled() === true) return true;

    const trigger = document.querySelector(AR_TRIGGER_SEL);
    if (!trigger) return false;

    // 万一上一次菜单没关干净
    arCloseMenu();
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    // 菜单是 portal 异步渲染的，下一帧再点选项
    arMenuTimer = setTimeout(() => {
      if (!arClickOption(target)) arCloseMenu();
    }, 120);
    return true;
  }

  function arDisconnectObserver() {
    if (arObserver) {
      arObserver.disconnect();
      arObserver = null;
    }
    if (arObserverTimer) {
      clearTimeout(arObserverTimer);
      arObserverTimer = null;
    }
  }

  // 控件出现前一直等 DOM 变化；开启一次后就断开，之后用户手动关掉不再抢回来
  function arTryEnable() {
    arDisconnectObserver();

    if (!isRequestsPage()) return;
    if (enableAutoRefresh()) return;

    if (!document.body) {
      arRouteTimer = setTimeout(arTryEnable, 50);
      return;
    }

    arObserver = new MutationObserver(() => {
      if (enableAutoRefresh()) {
        arDisconnectObserver();
      }
    });
    arObserver.observe(document.body, { childList: true, subtree: true });
    arObserverTimer = setTimeout(arDisconnectObserver, 10000);
  }

  function arSchedule() {
    clearTimeout(arRouteTimer);
    arRouteTimer = setTimeout(arTryEnable, 0);
  }

  function onAutoRefreshRouteChange() {
    if (location.href === arLastUrl) {
      return;
    }
    arLastUrl = location.href;
    if (isRequestsPage()) {
      arSchedule();
    } else {
      arDisconnectObserver();
    }
  }

  function initAutoRefresh() {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', arSchedule, { once: true });
    } else {
      arSchedule();
    }
  }

  window.addEventListener(ROUTE_EVENT, onAutoRefreshRouteChange);
  // 顶栏高亮不等 MutationObserver 的防抖，路由一变就刷
  window.addEventListener(ROUTE_EVENT, ensureHeaderNav);

  // ---------- 监听 React 重渲染（翻页、开关切换、筛选、SPA 路由切换等） ----------
  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      refresh();
      ensureHeaderNav();
    }, 100);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  refresh();
  ensureHeaderNav();
  initAutoRefresh();
})();
