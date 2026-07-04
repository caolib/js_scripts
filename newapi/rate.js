// ==UserScript==
// @name         NewAPI 模型广场显示成功率数值
// @namespace    https://github.com/caolib
// @version      1.0.1
// @description  在 NewAPI /pricing 模型广场卡片上直接显示成功率数值，替代默认的信号格图标
// @author       caolib
// @match        *://*/pricing*
// @match        *://*/*/pricing*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 仅处理带「成功率」title 的状态容器，无则不注入，避免误伤非 NewAPI 的 /pricing 页
  const done = new WeakSet();
  let titleStyleInjected = false;

  function ensureTitleStyle() {
    if (titleStyleInjected) return;
    const style = document.createElement('style');
    style.textContent = [
      'div.rounded-xl h1,',
      'div.rounded-xl h2,',
      'div.rounded-xl h3,',
      'div.rounded-xl [class*="model"] {',
      '  font-size: 0.875rem !important;',
      '  line-height: 1.2 !important;',
      '  white-space: normal !important;',
      '  overflow: visible !important;',
      '  text-overflow: clip !important;',
      '  word-break: break-word;',
      '  overflow-wrap: anywhere;',
      '}',
      'div.rounded-xl .truncate {',
      '  white-space: normal !important;',
      '  overflow: visible !important;',
      '  text-overflow: clip !important;',
      '}',
      'div.rounded-xl button[data-rate-detail-icon-only="1"] {',
      '  font-size: 0 !important;',
      '  line-height: 0 !important;',
      '  gap: 0 !important;',
      '  padding-left: 0.375rem !important;',
      '  padding-right: 0.375rem !important;',
      '}',
      'div.rounded-xl button[data-rate-detail-icon-only="1"] svg {',
      '  font-size: initial !important;',
      '  line-height: initial !important;',
      '}',
    ].join('');
    document.head.appendChild(style);
    titleStyleInjected = true;
  }

  function compactDetailButton(container) {
    const card = container && container.closest ? container.closest('div.rounded-xl') : null;
    if (!card) return;

    const detailButton = [...card.querySelectorAll('button, a, [role="button"]')].find((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return text === '详情';
    });
    if (!detailButton) return;

    detailButton.dataset.rateDetailIconOnly = '1';
    detailButton.setAttribute('aria-label', '详情');
  }

  function render(container) {
    if (done.has(container)) return;
    const m = (container.getAttribute('title') || '').match(/成功率[:：]\s*([\d.]+)\s*%?/);
    if (!m) return;
    const value = m[1] + '%';
    const iconRow = container.querySelector('.flex.h-4.items-center');
    if (!iconRow) return;

    // 复用站点自身的状态色：最长那根柱子（h-3）的 bg-* 转成 text-*，语义与原信号格一致
    let color = '';
    for (const bar of iconRow.querySelectorAll('span')) {
      if (/h-3(\D|$)/.test(bar.className)) {
        color = ([...bar.classList].find((c) => c.startsWith('bg-')) || '').replace('bg-', 'text-');
        break;
      }
    }
    if (!color) {
      // ponytail: 兜底阈值着色，仅在站点未给出 h-3 指示色时使用
      const n = parseFloat(m[1]);
      color = n >= 99 ? 'text-emerald-500' : n >= 95 ? 'text-amber-500' : 'text-red-500';
    }

    iconRow.outerHTML =
      '<div class="flex h-4 items-center justify-end">' +
      '<span class="font-mono text-[10px] font-semibold leading-4 ' + color + '">' + value + '</span>' +
      '</div>';
    compactDetailButton(container);
    done.add(container);
  }

  function scan(root) {
    ensureTitleStyle();
    (root || document).querySelectorAll('div[title^="成功率"]').forEach(render);
  }

  // SPA 动态渲染卡片，监听新增节点
  const mo = new MutationObserver((muts) => {
    for (const mut of muts) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches('div[title^="成功率"]')) render(node);
        scan(node);
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  scan();
})();
