// ==UserScript==
// @name         NewAPI 模型广场显示成功率数值
// @namespace    https://github.com/caolib
// @version      1.0.2
// @description  在 NewAPI /pricing 模型广场卡片上直接显示成功率数值，替代默认的信号格图标
// @author       caolib
// @match        *://*/pricing*
// @match        *://*/*/pricing*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 开启后，模型卡片没有「成功率」信息或成功率过低就隐藏。
  let hideCardsBySuccessRate = true;
  const MODEL_CARD_SELECTOR = 'main div.rounded-xl';
  const MIN_SUCCESS_RATE = 70;

  // 仅处理带「成功率」title 的状态容器，无则不注入，避免误伤非 NewAPI 的 /pricing 页
  const done = new WeakSet();
  let titleStyleInjected = false;

  function getSuccessRate(container) {
    return (container.getAttribute('title') || '').match(/成功率[:：]\s*([\d.]+)\s*%?/);
  }

  function getModelCards(root) {
    const scope = root || document;
    const cards = [];

    if (scope.closest) {
      const card = scope.closest(MODEL_CARD_SELECTOR);
      if (card) cards.push(card);
    }
    if (scope.matches && scope.matches(MODEL_CARD_SELECTOR)) cards.push(scope);
    scope.querySelectorAll(MODEL_CARD_SELECTOR).forEach((card) => cards.push(card));

    return [...new Set(cards)].filter((card) => card.querySelector('h3'));
  }

  function getCardSuccessRate(card) {
    const match = [...card.querySelectorAll('div[title^="成功率"]')].map(getSuccessRate).find(Boolean);
    return match ? parseFloat(match[1]) : null;
  }

  function getSuccessRateColor(successRate) {
    if (successRate >= 90) return 'color:#10b981';
    if (successRate >= 80) return 'color:#eab308';
    return 'color:#ef4444';
  }

  function updateToggleButton(button) {
    button.textContent = hideCardsBySuccessRate ? '成功率≥70%' : '显示全部';
    button.setAttribute('aria-pressed', hideCardsBySuccessRate ? 'true' : 'false');
    button.className = hideCardsBySuccessRate
      ? 'inline-flex h-8 items-center justify-center rounded-lg border bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors'
      : 'inline-flex h-8 items-center justify-center rounded-lg border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground';
  }

  function ensureToggleButton() {
    if (document.querySelector('[data-rate-success-filter-toggle="1"]')) return;

    const standardButton = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === '标准');
    const modeGroup = standardButton && standardButton.parentElement;
    if (!modeGroup || ![...modeGroup.querySelectorAll('button')].some((button) => button.textContent.trim() === '充值')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.rateSuccessFilterToggle = '1';
    updateToggleButton(button);
    button.addEventListener('click', () => {
      hideCardsBySuccessRate = !hideCardsBySuccessRate;
      updateToggleButton(button);
      hideCardsWithoutSuccessRate(document);
    });
    modeGroup.parentElement.insertBefore(button, modeGroup);
  }

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
    const m = getSuccessRate(container);
    if (!m) return;
    const value = m[1] + '%';
    const iconRow = container.querySelector('.flex.h-4.items-center');
    if (!iconRow) return;
    const color = getSuccessRateColor(parseFloat(m[1]));

    iconRow.outerHTML =
      '<div class="flex h-4 items-center justify-end">' +
      '<span class="font-mono text-[10px] font-semibold leading-4" style="' + color + '">' + value + '</span>' +
      '</div>';
    compactDetailButton(container);
    done.add(container);
  }

  function hideCardsWithoutSuccessRate(root) {
    if (!hideCardsBySuccessRate) {
      getModelCards(root).forEach((card) => {
        if (card.dataset.rateHiddenWithoutSuccessRate === '1') {
          card.style.display = '';
          delete card.dataset.rateHiddenWithoutSuccessRate;
        }
      });
      return;
    }
    if (!document.querySelector(`${MODEL_CARD_SELECTOR} div[title^="成功率"]`)) return;

    getModelCards(root).forEach((card) => {
      const successRate = getCardSuccessRate(card);
      if (successRate !== null && successRate >= MIN_SUCCESS_RATE) {
        if (card.dataset.rateHiddenWithoutSuccessRate === '1') {
          card.style.display = '';
          delete card.dataset.rateHiddenWithoutSuccessRate;
        }
        return;
      }

      card.style.display = 'none';
      card.dataset.rateHiddenWithoutSuccessRate = '1';
    });
  }

  function scan(root) {
    ensureTitleStyle();
    ensureToggleButton();
    (root || document).querySelectorAll('div[title^="成功率"]').forEach(render);
    hideCardsWithoutSuccessRate(document);
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
