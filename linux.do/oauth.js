// ==UserScript==
// @name         Linux.do 增强
// @namespace    http://tampermonkey.net/
// @version      0.8.0
// @description  在 connect.linux.do 页面检测到「允许」按钮时自动点击；在 linux.do 页面自动点击外链跳转弹窗、支持正则屏蔽词过滤帖子（标题/分类独立规则）、实时预览；支持功能开关
// @author       caolib
// @match        https://connect.linux.do/*
// @match        https://linux.do/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // --- 功能开关配置 ---
    const FEATURES = {
        autoApprove: { key: 'feat_autoApprove', label: '自动允许 OAuth 授权', default: true },
        autoExternal: { key: 'feat_autoExternal', label: '自动跳过外链弹窗', default: true },
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

    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('🚫 管理屏蔽词', () => showBlockPanel());
    }

    // ========== 屏蔽词面板（仅 linux.do） ==========
    const WORDS_KEY = 'block_words_list';
    const BW_ENABLED_KEY = 'block_words_enabled';
    const CAT_WORDS_KEY = 'block_cat_words_list';
    const CAT_ENABLED_KEY = 'block_cat_words_enabled';
    let bwState = { trigger: null, panel: null, input: null, list: null, catList: null, stat: null, pauseToggle: null, catPauseToggle: null, activeTab: 'title' };

    function getBlockWords() {
        if (typeof GM_getValue === 'undefined') return [];
        const v = GM_getValue(WORDS_KEY, []);
        return Array.isArray(v) ? v : [];
    }
    function setBlockWords(words) {
        if (typeof GM_setValue !== 'undefined') GM_setValue(WORDS_KEY, words);
    }
    function isBlockEnabled() {
        if (typeof GM_getValue === 'undefined') return true;
        return GM_getValue(BW_ENABLED_KEY, true);
    }
    function setBlockEnabled(v) {
        if (typeof GM_setValue !== 'undefined') GM_setValue(BW_ENABLED_KEY, v);
    }

    // --- 分类屏蔽词 ---
    function getCatBlockWords() {
        if (typeof GM_getValue === 'undefined') return [];
        const v = GM_getValue(CAT_WORDS_KEY, []);
        return Array.isArray(v) ? v : [];
    }
    function setCatBlockWords(words) {
        if (typeof GM_setValue !== 'undefined') GM_setValue(CAT_WORDS_KEY, words);
    }
    function isCatBlockEnabled() {
        if (typeof GM_getValue === 'undefined') return true;
        return GM_getValue(CAT_ENABLED_KEY, true);
    }
    function setCatBlockEnabled(v) {
        if (typeof GM_setValue !== 'undefined') GM_setValue(CAT_ENABLED_KEY, v);
    }

    // 支持 /pattern/flags 写法；非法正则返回 null
    // 默认不区分大小写：纯关键词强制加 i；/.../flags 若未声明 i 也补上
    function compileRegex(word) {
        const m = word.match(/^\/(.+)\/([gimsuy]*)$/);
        try {
            if (m) {
                let flags = m[2];
                if (!flags.includes('i')) flags += 'i';
                return new RegExp(m[1], flags);
            }
            return new RegExp(word, 'i');
        } catch (_) {
            return null;
        }
    }

    // --- 顶部栏徽章入口 ---
    const HEADER_TRIGGER_ID = 'ld-bw-trigger';

    // 把徽章插入顶部栏右上角图标区（.d-header-icons），作为该列表第一项；幂等
    function injectHeaderTrigger(trigger) {
        if (!trigger) return false;
        if (trigger.parentElement) return true; // 已在 DOM 里
        const icons = document.querySelector('.d-header .d-header-icons');
        if (!icons) return false; // 头部未就绪
        // 包一层 <li>，与搜索/头像等图标项结构一致
        let li = trigger.closest('li');
        if (!li) {
            li = document.createElement('li');
            li.className = 'header-dropdown-toggle';
            li.appendChild(trigger);
        }
        if (li.parentElement === icons) return true;
        icons.insertBefore(li, icons.firstChild);
        return true;
    }

    // 面板定位：徽章正下方下拉；溢出右边界则右对齐，再不行夹在视口内
    function positionPanel() {
        const panel = bwState.panel;
        if (!panel) return;
        const trigger = bwState.trigger;
        const gap = 6;
        const header = document.querySelector('.d-header');
        const headerH = header ? header.offsetHeight : 60;
        const vw = document.documentElement.clientWidth;
        const pw = panel.offsetWidth || 300;
        let x;
        if (trigger && trigger.isConnected) {
            const r = trigger.getBoundingClientRect();
            x = r.right - pw; // 默认面板右缘与徽章右缘对齐
        } else {
            x = vw - pw - 16;
        }
        x = Math.max(gap, Math.min(x, vw - pw - gap));
        panel.style.top = headerH + 'px';
        panel.style.left = x + 'px';
    }

    function isPanelOpen() {
        return bwState.panel && bwState.panel.style.display === 'block';
    }

    // 关闭面板
    function closeBwPanel() {
        if (!bwState.panel) return;
        bwState.panel.style.display = 'none';
    }

    // 不再需要 getTopicText——标题与分类分别独立匹配

    let bwTimer = null;
    function scheduleApply() {
        clearTimeout(bwTimer);
        bwTimer = setTimeout(applyBlockFilter, 80);
    }

    function applyBlockFilter() {
        // --- 标题屏蔽 ---
        const titleEnabled = isBlockEnabled();
        const titleRawWords = titleEnabled
            ? getBlockWords().map(w => w.trim()).filter(Boolean)
            : [];
        const titleMatchers = [];
        if (titleEnabled) {
            titleRawWords.forEach(w => {
                const re = compileRegex(w);
                if (re) titleMatchers.push(re);
            });
        }

        // --- 分类屏蔽 ---
        const catEnabled = isCatBlockEnabled();
        const catRawWords = catEnabled
            ? getCatBlockWords().map(w => w.trim()).filter(Boolean)
            : [];
        const catMatchers = [];
        if (catEnabled) {
            catRawWords.forEach(w => {
                const re = compileRegex(w);
                if (re) catMatchers.push(re);
            });
        }

        document.querySelectorAll('tr.topic-list-item').forEach(tr => {
            const title = tr.querySelector('.main-link a.title')?.textContent || '';
            const cat = tr.querySelector('.badge-category__name')?.textContent || '';

            const titleHit = titleMatchers.some(re => re.test(title));
            const catHit = catMatchers.some(re => re.test(cat));
            const hit = titleHit || catHit;

            if (hit) {
                tr.style.display = 'none';
                tr.dataset.blockedWords = '1';
            } else if (tr.dataset.blockedWords) {
                tr.style.display = '';
                delete tr.dataset.blockedWords;
            }
        });
        updateBwStat();
    }

    function updateBwStat() {
        if (!bwState.trigger) return;
        const hidden = document.querySelectorAll('tr[data-blocked-words]').length;
        const num = bwState.trigger.querySelector('.bw-num');
        if (num) num.textContent = String(hidden);
    }

    // --- 实时预览：用输入框草稿匹配示例句子，命中的显示为已屏蔽 ---
    const DEFAULT_SAMPLES = [
        '【求助】这个软件怎么安装',
        '今天军费到位了哈哈赶紧买显卡',
        '分享一个好用的效率工具',
        '广告代发联系微信领福利',
        '新人报道，求各位大佬眼熟',
        '【报告】本周社区活跃度统计',
    ];
    const BW_SAMPLES_KEY = 'bw_preview_samples';
    function getSamples() {
        if (typeof GM_getValue === 'undefined') return DEFAULT_SAMPLES.slice();
        const v = GM_getValue(BW_SAMPLES_KEY, null);
        return Array.isArray(v) && v.length ? v : DEFAULT_SAMPLES.slice();
    }
    function setSamples(arr) {
        if (typeof GM_setValue !== 'undefined') GM_setValue(BW_SAMPLES_KEY, arr);
    }
    function addSample(text) {
        text = String(text).trim();
        if (!text) return false;
        const arr = getSamples();
        if (arr.includes(text)) return false;
        arr.push(text);
        setSamples(arr);
        return true;
    }
    function removeSample(text) {
        const arr = getSamples().filter(s => s !== text);
        setSamples(arr);
    }

    function buildPreviewBox(box) {
        if (!box) return;
        box.innerHTML = '';
        const title = document.createElement('div');
        title.className = 'ld-bw-preview-title';
        title.textContent = '实时预览（输入即匹配，命中变红划线）';
        box.appendChild(title);

        getSamples().forEach(text => {
            const row = document.createElement('div');
            row.className = 'ld-bw-sample';
            row.dataset.text = text;
            const span = document.createElement('span');
            span.textContent = text;
            const del = document.createElement('span');
            del.className = 'ld-bw-sample-del';
            del.textContent = '✕';
            del.title = '删除该示例';
            del.addEventListener('click', () => {
                removeSample(text);
                buildPreviewBox(box);
                updatePreview();
            });
            row.appendChild(span);
            row.appendChild(del);
            box.appendChild(row);
        });

        // 内联添加行
        const addRow = document.createElement('div');
        addRow.className = 'ld-bw-sample-add';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = '添加示例句子（回车确认）';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = '＋';
        addBtn.title = '添加示例';
        const doAdd = () => {
            if (addSample(inp.value)) {
                inp.value = '';
                buildPreviewBox(box);
                updatePreview();
            }
            inp.focus();
        };
        addBtn.addEventListener('click', doAdd);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
        addRow.appendChild(inp);
        addRow.appendChild(addBtn);
        box.appendChild(addRow);
    }

    function updatePreview() {
        const box = bwState.preview, inputEl = bwState.input;
        if (!box || !inputEl) return;
        const raw = inputEl.value.trim();   // 规则就是输入框原始内容
        let valid = true, re = null;
        if (raw) { re = compileRegex(raw); if (!re) valid = false; }
        box.querySelectorAll('.ld-bw-sample').forEach(el => {
            let hit = false;
            const text = el.dataset.text || '';
            if (raw && valid) hit = re.test(text);
            el.classList.toggle('hit', hit);
        });
        if (raw && !valid) {
            inputEl.classList.add('invalid');
        } else {
            inputEl.classList.remove('invalid');
        }
    }

    function injectBwStyles() {
        if (document.getElementById('ld-bw-style')) return;
        const css = `
            #ld-bw-trigger { display:inline-flex; align-items:center; gap:4px;
                padding:6px 10px; font-size:13px; line-height:1; cursor:pointer;
                border:1px solid var(--primary-low,#444); border-radius:999px;
                background:transparent; color:var(--primary,#e8e8e8); }
            .header-dropdown-toggle #ld-bw-trigger { height:100%; }
            .header-dropdown-toggle { display:flex; align-items:center; }
            #ld-bw-trigger:hover { background:var(--primary-low,#333); }
            #ld-bw-trigger .bw-num { font-variant-numeric:tabular-nums; min-width:10px; text-align:center; }
            #ld-bw-panel { position: fixed; z-index: 100001;
                width: 340px; display: none; overflow: hidden;
                background:#1e1e1e; color:#e8e8e8; border:1px solid #3a3a3a;
                border-radius:0 0 10px 10px; border-top:none;
                box-shadow:0 6px 24px rgba(0,0,0,.5); font-size:13px; }
            #ld-bw-panel .ld-bw-head { display:flex; align-items:center; gap:10px;
                padding:10px 12px; border-bottom:1px solid #3a3a3a; font-weight:600; color:#e8e8e8; }
            #ld-bw-panel .ld-bw-title { margin-right:auto; }
            #ld-bw-panel .ld-bw-pause-label { display:flex; align-items:center; gap:4px; cursor:pointer;
                font-weight:400; font-size:12px; color:#bbb; }
            #ld-bw-panel .ld-bw-body { padding:10px 12px; }
            #ld-bw-panel .ld-bw-add { display:flex; gap:6px; margin-bottom:8px; align-items:center; }
            #ld-bw-panel .ld-bw-add input[type=text],
            #ld-bw-panel .ld-bw-add button { height:32px; box-sizing:border-box; line-height:1; }
            #ld-bw-panel .ld-bw-add .ld-bw-dot { flex:0 0 auto; padding:0 9px; font-family:Consolas,monospace; font-size:12px;
                background:#1f2d3a; color:#9cdcfe; border:1px solid #2a5a7a; border-radius:6px; }
            #ld-bw-panel .ld-bw-add input[type=text] { flex:1; min-width:0; padding:0 8px;
                border:1px solid #3a3a3a; border-radius:6px;
                background:#2b2b2b; color:#e8e8e8; }
            #ld-bw-panel input[type=text]::placeholder { color:#888; }
            #ld-bw-panel .ld-bw-submit { background:#0088cc; color:#fff; border-color:#0088cc; }
            #ld-bw-panel button { cursor:pointer; border:1px solid #3a3a3a;
                background:#2b2b2b; color:#e8e8e8; border-radius:6px; padding:0 10px;
                height:32px; box-sizing:border-box; line-height:1; }
            #ld-bw-chips, #ld-bw-cat-chips { display:flex; flex-wrap:wrap; gap:6px; }
            #ld-bw-chips .chip, #ld-bw-cat-chips .chip { display:inline-flex; align-items:center; gap:4px; padding:3px 8px;
                background:#3a3a3a; color:#e8e8e8; border-radius:999px; }
            #ld-bw-chips .chip-close, #ld-bw-cat-chips .chip-close { cursor:pointer; opacity:.6; color:#e8e8e8; }
            #ld-bw-chips .chip-close:hover, #ld-bw-cat-chips .chip-close:hover { opacity:1; }
            #ld-bw-chips .chip-label, #ld-bw-cat-chips .chip-label { cursor:pointer; }
            #ld-bw-chips .chip-label:hover, #ld-bw-cat-chips .chip-label:hover { color:#9cdcfe; }
            #ld-bw-foot { display:flex; align-items:center; justify-content:space-between;
                padding:8px 12px; border-top:1px solid #3a3a3a; font-size:12px; color:#bbb; }
            #ld-bw-panel .ld-bw-toggles { display:flex; gap:12px; }
            #ld-bw-panel .ld-bw-toggles label { display:flex; align-items:center; gap:4px; cursor:pointer; }
            #ld-bw-panel .ld-bw-preview { margin:6px 0; }
            #ld-bw-panel .ld-bw-preview-title { font-size:11px; color:#888; margin-bottom:4px; }
            #ld-bw-panel .ld-bw-sample { display:flex; align-items:center; justify-content:space-between; gap:6px;
                padding:5px 8px; border-radius:6px; margin-bottom:4px;
                font-size:12px; line-height:1.4; color:#ccc; background:#262626; border:1px solid #333;
                transition:background .12s,color .12s,border-color .12s; word-break:break-all; }
            #ld-bw-panel .ld-bw-sample > span:first-child { flex:1; min-width:0; }
            #ld-bw-panel .ld-bw-sample-del { flex:0 0 auto; cursor:pointer; opacity:0; color:#e88; font-size:13px; padding:0 2px; }
            #ld-bw-panel .ld-bw-sample:hover .ld-bw-sample-del { opacity:.7; }
            #ld-bw-panel .ld-bw-sample-del:hover { opacity:1; color:#f55; }
            #ld-bw-panel .ld-bw-sample.hit { color:#888; background:#3a1f1f; border-color:#6b2e2e; text-decoration:line-through; }
            #ld-bw-panel .ld-bw-sample.hit::before { content:'🚫 '; text-decoration:none; }
            #ld-bw-panel .ld-bw-sample-add { display:flex; gap:6px; margin-top:6px; align-items:center; }
            #ld-bw-panel .ld-bw-sample-add input { flex:1; min-width:0; padding:0 8px; font-size:12px;
                border:1px solid #3a3a3a; border-radius:6px; background:#262626; color:#e8e8e8;
                height:32px; box-sizing:border-box; line-height:1; }
            #ld-bw-panel .ld-bw-sample-add input::placeholder { color:#777; }
            #ld-bw-panel .ld-bw-sample-add button { flex:0 0 auto; padding:0 10px; font-size:13px;
                height:32px; box-sizing:border-box; line-height:1; }
            #ld-bw-panel .ld-bw-add .ld-bw-kw { flex:0 0 auto; padding:0 8px; font-family:Consolas,monospace;
                font-size:11px; background:#1f3a2d; color:#9cdc9c; border-color:#2a5a3a; border-radius:6px; }
            #ld-bw-panel input[type=text].invalid { border-color:#c0392b; box-shadow:0 0 0 1px #c0392b inset; }
            #ld-bw-panel .ld-bw-tabs { display:flex; gap:0; border-bottom:1px solid #3a3a3a; }
            #ld-bw-panel .ld-bw-tab { flex:1; padding:8px 0; text-align:center; cursor:pointer;
                background:transparent; color:#888; border:none; border-radius:0;
                border-bottom:2px solid transparent; font-size:13px; font-weight:500; }
            #ld-bw-panel .ld-bw-tab:hover { color:#ccc; }
            #ld-bw-panel .ld-bw-tab.active { color:#e8e8e8; border-bottom-color:#0088cc; }
            #ld-bw-panel .ld-bw-tab-content { display:none; }
            #ld-bw-panel .ld-bw-tab-content.active { display:block; }
        `;
        const style = document.createElement('style');
        style.id = 'ld-bw-style';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    // 点击已有关键字进行编辑：从列表移除并放入输入框；输入框有内容时询问是否替换
    function editWord(word) {
        const inputEl = bwState.input;
        if (!inputEl) return;
        const existing = inputEl.value.trim();
        if (existing && existing !== word) {
            if (!confirm('输入框已有内容，是否用此关键字替换？')) return;
        }
        setBlockWords(getBlockWords().filter(x => x !== word));
        inputEl.value = word;
        inputEl.focus();
        // 光标置于末尾，方便直接追加/修改
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
        renderBwChips();
        applyBlockFilter();
        updatePreview();
    }

    function renderBwChips() {
        if (!bwState.list) return;
        const words = getBlockWords();
        bwState.list.innerHTML = '';
        if (!words.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'color:var(--primary-medium,#999);padding:6px 0;';
            empty.textContent = '暂无屏蔽词';
            bwState.list.appendChild(empty);
        } else {
            words.forEach(w => {
                const chip = document.createElement('span');
                chip.className = 'chip';
                const label = document.createElement('span');
                label.className = 'chip-label';
                label.textContent = w;
                label.title = '点击编辑';
                label.addEventListener('click', () => editWord(w));
                const close = document.createElement('span');
                close.className = 'chip-close';
                close.textContent = '✕';
                close.title = '移除';
                close.addEventListener('click', () => {
                    setBlockWords(getBlockWords().filter(x => x !== w));
                    renderBwChips();
                    applyBlockFilter();
                });
                chip.appendChild(label);
                chip.appendChild(close);
                bwState.list.appendChild(chip);
            });
        }
        updateBwStat();
    }

    function buildBwPanel() {
        injectBwStyles();

        // 顶部栏徽章入口
        const trigger = document.createElement('button');
        trigger.id = HEADER_TRIGGER_ID;
        trigger.type = 'button';
        trigger.title = '屏蔽词管理';
        trigger.innerHTML = '<span class="bw-ico">🚫</span><span class="bw-num">0</span>';

        const panel = document.createElement('div');
        panel.id = 'ld-bw-panel';
        panel.innerHTML = `
            <div class="ld-bw-head">
                <span class="ld-bw-title">屏蔽词管理</span>
                <span class="ld-bw-close" style="cursor:pointer;font-weight:400;">✕</span>
            </div>
            <div class="ld-bw-tabs">
                <div class="ld-bw-tab active" data-tab="title">标题屏蔽</div>
                <div class="ld-bw-tab" data-tab="category">分类屏蔽</div>
            </div>
            <div class="ld-bw-body">
                <div class="ld-bw-tab-content active" data-tab="title">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <label class="ld-bw-pause-label"><input type="checkbox" class="ld-bw-pause" /> 启用标题屏蔽</label>
                    </div>
                    <div class="ld-bw-add">
                        <input type="text" placeholder="输入标题关键词或正则，如 哈哈" />
                        <button type="button" class="ld-bw-dot" title="在光标处插入 .* ">.*</button>
                        <button type="button" class="ld-bw-submit">添加</button>
                    </div>
                    <div class="ld-bw-preview"></div>
                    <div id="ld-bw-chips"></div>
                </div>
                <div class="ld-bw-tab-content" data-tab="category">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <label class="ld-bw-pause-label"><input type="checkbox" class="ld-bw-cat-pause" /> 启用分类屏蔽</label>
                    </div>
                    <div class="ld-bw-add ld-bw-cat-add">
                        <input type="text" placeholder="输入分类名，如 水源" />
                        <button type="button" class="ld-bw-cat-submit">添加</button>
                    </div>
                    <div id="ld-bw-cat-chips"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        const input = panel.querySelector('.ld-bw-tab-content[data-tab="title"] input[type=text]');
        const submitBtn = panel.querySelector('.ld-bw-submit');
        const dotBtn = panel.querySelector('.ld-bw-dot');
        const chips = panel.querySelector('#ld-bw-chips');
        const preview = panel.querySelector('.ld-bw-preview');
        const pauseToggle = panel.querySelector('.ld-bw-pause');
        const closeBtn = panel.querySelector('.ld-bw-close');

        const catInput = panel.querySelector('.ld-bw-cat-add input[type=text]');
        const catSubmitBtn = panel.querySelector('.ld-bw-cat-submit');
        const catChips = panel.querySelector('#ld-bw-cat-chips');
        const catPauseToggle = panel.querySelector('.ld-bw-cat-pause');

        bwState = { trigger, panel, input, list: chips, catList: catChips, preview, pauseToggle, catPauseToggle, activeTab: 'title' };
        buildPreviewBox(preview);
        updatePreview();

        // --- Tab 切换 ---
        panel.querySelectorAll('.ld-bw-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                bwState.activeTab = target;
                panel.querySelectorAll('.ld-bw-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === target));
                panel.querySelectorAll('.ld-bw-tab-content').forEach(c => c.classList.toggle('active', c.dataset.tab === target));
            });
        });

        // --- 分类屏蔽词逻辑 ---
        const addCatWord = () => {
            const val = catInput.value.trim();
            if (!val) return;
            if (!compileRegex(val)) { catInput.classList.add('invalid'); catInput.focus(); return; }
            const words = getCatBlockWords();
            if (!words.includes(val)) {
                words.push(val);
                setCatBlockWords(words);
            }
            catInput.value = '';
            renderCatChips();
            applyBlockFilter();
        };
        catSubmitBtn.addEventListener('click', addCatWord);
        catInput.addEventListener('keydown', e => { if (e.key === 'Enter') addCatWord(); });
        catInput.addEventListener('input', () => catInput.classList.remove('invalid'));

        function editCatWord(word) {
            const existing = catInput.value.trim();
            if (existing && existing !== word) {
                if (!confirm('输入框已有内容，是否用此关键字替换？')) return;
            }
            setCatBlockWords(getCatBlockWords().filter(x => x !== word));
            catInput.value = word;
            catInput.focus();
            catInput.selectionStart = catInput.selectionEnd = catInput.value.length;
            renderCatChips();
            applyBlockFilter();
        }

        catPauseToggle.checked = isCatBlockEnabled();
        catPauseToggle.addEventListener('change', () => {
            setCatBlockEnabled(catPauseToggle.checked);
            applyBlockFilter();
        });

        function renderCatChips() {
            if (!catChips) return;
            const words = getCatBlockWords();
            catChips.innerHTML = '';
            if (!words.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:var(--primary-medium,#999);padding:6px 0;';
                empty.textContent = '暂无分类屏蔽词';
                catChips.appendChild(empty);
            } else {
                words.forEach(w => {
                    const chip = document.createElement('span');
                    chip.className = 'chip';
                    const label = document.createElement('span');
                    label.className = 'chip-label';
                    label.textContent = w;
                    label.title = '点击编辑';
                    label.addEventListener('click', () => editCatWord(w));
                    const close = document.createElement('span');
                    close.className = 'chip-close';
                    close.textContent = '✕';
                    close.title = '移除';
                    close.addEventListener('click', () => {
                        setCatBlockWords(getCatBlockWords().filter(x => x !== w));
                        renderCatChips();
                        applyBlockFilter();
                    });
                    chip.appendChild(label);
                    chip.appendChild(close);
                    catChips.appendChild(chip);
                });
            }
        }
        renderCatChips();

        // 在光标处插入 .*
        dotBtn.addEventListener('click', () => {
            const s = input.selectionStart ?? input.value.length;
            const e = input.selectionEnd ?? input.value.length;
            input.value = input.value.slice(0, s) + '.*' + input.value.slice(e);
            const pos = s + 2;
            input.selectionStart = input.selectionEnd = pos;
            input.focus();
            updatePreview();
        });

        const addWord = () => {
            const val = input.value.trim();
            if (!val) return;
            if (!compileRegex(val)) { input.classList.add('invalid'); input.focus(); return; }
            const words = getBlockWords();
            if (!words.includes(val)) {
                words.push(val);
                setBlockWords(words);
            }
            input.value = '';
            updatePreview();
            renderBwChips();
            applyBlockFilter();
        };
        submitBtn.addEventListener('click', addWord);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') addWord(); });
        input.addEventListener('input', updatePreview);
        closeBtn.addEventListener('click', () => closeBwPanel());

        // 徽章点击 toggle 面板
        trigger.addEventListener('click', () => toggleBwPanel());

        // 点击面板与徽章之外的区域，自动关闭面板
        document.addEventListener('mousedown', (e) => {
            if (!isPanelOpen()) return;
            const t = e.target;
            if (panel.contains(t) || trigger.contains(t)) return;
            closeBwPanel();
        });

        // 窗口缩放时重新定位面板
        window.addEventListener('resize', () => { if (isPanelOpen()) positionPanel(); });

        pauseToggle.checked = isBlockEnabled();
        pauseToggle.addEventListener('change', () => {
            setBlockEnabled(pauseToggle.checked);
            applyBlockFilter();
        });

        renderBwChips();

        // 把徽章插入顶部栏。Discourse 头部异步渲染、路由切换会重建 .d-header，
        // 所以持续监听 body：每次变更都尝试幂等插入（已正确插入则跳过）
        const tryInject = () => injectHeaderTrigger(trigger);
        const ensureInjected = () => { if (!trigger.parentElement) tryInject(); };
        const startObs = () => {
            ensureInjected();
            const obs = new MutationObserver(ensureInjected);
            obs.observe(document.body, { childList: true, subtree: true });
        };
        if (document.body) startObs();
        else document.addEventListener('DOMContentLoaded', startObs, { once: true });
    }

    function toggleBwPanel() {
        if (!bwState.panel) return;
        if (bwState.panel.style.display === 'block') {
            closeBwPanel();
        } else {
            positionPanel();
            bwState.panel.style.display = 'block';
        }
    }
    function showBlockPanel() {
        if (bwState.panel) {
            positionPanel();
            bwState.panel.style.display = 'block';
        }
    }

    function initBlockWords() {
        const start = () => {
            buildBwPanel();
            applyBlockFilter();
            const obs = new MutationObserver(() => scheduleApply());
            obs.observe(document.body, { childList: true, subtree: true });
        };
        if (document.body) start();
        else document.addEventListener('DOMContentLoaded', start, { once: true });
    }

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

    // ========== linux.do 站点增强（屏蔽词 + 外链跳转） ==========
    else {
        // 屏蔽词面板：独立于外链开关
        initBlockWords();

        // ========== 自动点击外链跳转 ==========
        if (isEnabled('autoExternal')) {
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
    }
})();
