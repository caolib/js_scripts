// ==UserScript==
// @name         Linux.do 增强
// @namespace    http://tampermonkey.net/
// @version      0.6.0
// @description  在 connect.linux.do 页面检测到「允许」按钮时自动点击；在 linux.do 页面自动点击外链跳转弹窗、支持正则屏蔽词过滤帖子、实时预览；支持功能开关
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
    let bwState = { btn: null, panel: null, input: null, list: null, stat: null, pauseToggle: null };

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

    // --- 悬浮按钮位置持久化 + 拖拽 ---
    const BW_BTN_POS_KEY = 'bw_btn_pos';
    const EDGE_THRESHOLD = 80; // 靠边阈值（像素）
    const STUB = 26; // 隐藏时保留的可见尺寸（像素），需小于按钮最小边
    const HIDE_DIRS = ['left', 'right', 'top', 'bottom'];
    function clearHideClasses(btn) {
        HIDE_DIRS.forEach(d => btn.classList.remove(`ld-bw-hide-${d}`));
    }

    function getBtnPos() {
        if (typeof GM_getValue === 'undefined') return null;
        const v = GM_getValue(BW_BTN_POS_KEY, null);
        return v && typeof v.x === 'number' && typeof v.y === 'number' ? v : null;
    }
    function setBtnPos(x, y) {
        if (typeof GM_setValue !== 'undefined') GM_setValue(BW_BTN_POS_KEY, { x, y });
    }
    // 把按钮限制在视口内
    function clampBtnPos(btn, x, y) {
        const maxX = Math.max(0, document.documentElement.clientWidth - btn.offsetWidth);
        const maxY = Math.max(0, document.documentElement.clientHeight - btn.offsetHeight);
        return {
            x: Math.max(0, Math.min(x, maxX)),
            y: Math.max(0, Math.min(y, maxY)),
        };
    }
    function applyBtnPos(btn, x, y) {
        const p = clampBtnPos(btn, x, y);
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
        btn.style.left = p.x + 'px';
        btn.style.top = p.y + 'px';
        checkAndAutoHide(btn);
        return p;
    }

    // 检测是否靠边并应用自动隐藏
    function checkAndAutoHide(btn) {
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const isNearLeft = rect.left < EDGE_THRESHOLD;
        const isNearRight = vw - rect.right < EDGE_THRESHOLD;
        const isNearTop = rect.top < EDGE_THRESHOLD;
        const isNearBottom = vh - rect.bottom < EDGE_THRESHOLD;

        // 优先横向隐藏，其次纵向
        if (isNearLeft || isNearRight) {
            btn.dataset.autoHide = '1';
            btn.dataset.hideDir = isNearLeft ? 'left' : 'right';
        } else if (isNearTop || isNearBottom) {
            btn.dataset.autoHide = '1';
            btn.dataset.hideDir = isNearTop ? 'top' : 'bottom';
        } else {
            btn.dataset.autoHide = '0';
            btn.dataset.hideDir = '';
        }

        // 如果面板未打开且不在悬停状态，应用隐藏
        if (!isPanelOpen() && !btn.matches(':hover')) {
            applyAutoHide(btn);
        }
    }

    // 应用自动隐藏效果
    function applyAutoHide(btn) {
        if (!btn || btn.dataset.autoHide !== '1') {
            btn.style.transform = '';
            clearHideClasses(btn);
            return;
        }
        const dir = btn.dataset.hideDir;
        clearHideClasses(btn);
        if (dir === 'left') {
            btn.classList.add('ld-bw-hide-left');
            btn.style.transform = `translateX(-${Math.max(0, btn.offsetWidth - STUB)}px)`;
        } else if (dir === 'right') {
            btn.classList.add('ld-bw-hide-right');
            btn.style.transform = `translateX(${Math.max(0, btn.offsetWidth - STUB)}px)`;
        } else if (dir === 'top') {
            btn.classList.add('ld-bw-hide-top');
            btn.style.transform = `translateY(-${Math.max(0, btn.offsetHeight - STUB)}px)`;
        } else if (dir === 'bottom') {
            btn.classList.add('ld-bw-hide-bottom');
            btn.style.transform = `translateY(${Math.max(0, btn.offsetHeight - STUB)}px)`;
        } else {
            btn.style.transform = '';
        }
    }

    // 展开按钮：清 transform 和隐藏类，恢复正常「🚫 N」顺序
    function expandButton(btn) {
        if (!btn) return;
        btn.style.transform = '';
        clearHideClasses(btn);
    }

    // 拖拽：移动超过阈值(4px)算拖拽，不触发点击；松手保存位置
    function makeDraggable(btn, onClick) {
        let dragging = false, moved = false, startX = 0, startY = 0, offX = 0, offY = 0;

        btn.addEventListener('mousedown', (e) => {
            dragging = true;
            moved = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = btn.getBoundingClientRect();
            offX = e.clientX - rect.left;
            offY = e.clientY - rect.top;
            btn.style.cursor = 'grabbing';
            expandButton(btn); // 拖拽时展开
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            if (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4) moved = true;
            if (!moved) return;
            applyBtnPos(btn, e.clientX - offX, e.clientY - offY);
            if (isPanelOpen()) positionPanel();
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            btn.style.cursor = 'grab';
            if (moved) {
                // 松手时保存最终位置并检查自动隐藏
                const p = clampBtnPos(btn, parseFloat(btn.style.left) || 0, parseFloat(btn.style.top) || 0);
                setBtnPos(p.x, p.y);
                checkAndAutoHide(btn);
            }
        });

        // click 在 mouseup 之后触发：若是拖拽收尾则吞掉本次点击
        btn.addEventListener('click', () => {
            if (moved) { moved = false; return; }
            onClick();
        });

        // 鼠标进入时展开按钮
        btn.addEventListener('mouseenter', () => {
            expandButton(btn);
        });

        // 鼠标离开时，如果面板未打开则自动隐藏
        btn.addEventListener('mouseleave', () => {
            if (!isPanelOpen()) {
                applyAutoHide(btn);
            }
        });

        // 窗口缩放时把按钮拉回视口
        window.addEventListener('resize', () => {
            if (btn.style.left) applyBtnPos(btn, parseFloat(btn.style.left), parseFloat(btn.style.top));
            else checkAndAutoHide(btn); // 默认右下角定位，无需重算坐标，仅重判隐藏
            if (isPanelOpen()) positionPanel();
        });
    }

    // 面板跟随按钮定位：优先弹在按钮上方，空间不足转下方，横向夹在视口内
    function positionPanel() {
        const btn = bwState.btn, panel = bwState.panel;
        if (!btn || !panel) return;
        const gap = 8;
        const r = btn.getBoundingClientRect();
        const pw = panel.offsetWidth || 300;
        const ph = panel.offsetHeight || 200;
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;

        // 横向：默认与按钮左对齐，溢出右侧则右对齐到视口边，再不行夹中
        let x = r.left;
        if (x + pw > vw - gap) x = r.right - pw;
        if (x < gap) x = gap;
        x = Math.min(x, Math.max(gap, vw - pw - gap));

        // 纵向：按钮上方优先，不够再放下方，都不够就贴顶
        let y;
        if (r.top - gap - ph >= gap) {
            y = r.top - gap - ph;            // 上方
        } else if (r.bottom + gap + ph <= vh - gap) {
            y = r.bottom + gap;              // 下方
        } else {
            y = gap;                          // 贴顶
        }

        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
    }

    function isPanelOpen() {
        return bwState.panel && bwState.panel.style.display === 'block';
    }

    // 关闭面板：隐藏 + 重新收起按钮（若靠边）
    function closeBwPanel() {
        const { panel, btn } = bwState;
        if (!panel) return;
        panel.style.display = 'none';
        if (btn) applyAutoHide(btn);
    }

    // 取一行帖子的可匹配文本：标题 + 分类 + 标签
    function getTopicText(tr) {
        const title = tr.querySelector('.main-link a.title')?.textContent || '';
        const cat = tr.querySelector('.badge-category__name')?.textContent || '';
        const tags = Array.from(tr.querySelectorAll('.discourse-tag'))
            .map(a => a.textContent || '').join(' ');
        return `${title} ${cat} ${tags}`;
    }

    let bwTimer = null;
    function scheduleApply() {
        clearTimeout(bwTimer);
        bwTimer = setTimeout(applyBlockFilter, 80);
    }

    function applyBlockFilter() {
        const enabled = isBlockEnabled();
        const rawWords = enabled
            ? getBlockWords().map(w => w.trim()).filter(Boolean)
            : [];
        const matchers = [];
        if (enabled) {
            rawWords.forEach(w => {
                const re = compileRegex(w);
                if (re) matchers.push(re);
            });
        }
        document.querySelectorAll('tr.topic-list-item').forEach(tr => {
            const full = getTopicText(tr);
            const hit = matchers.some(re => re.test(full));
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
        if (!bwState.btn) return;
        const hidden = document.querySelectorAll('tr[data-blocked-words]').length;
        const num = bwState.btn.querySelector('.bw-num');
        if (num) num.textContent = String(hidden);
        else bwState.btn.textContent = `🚫 ${hidden}`;
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
            #ld-bw-btn { position: fixed; right: 16px; bottom: 16px; z-index: 100000;
                background:#2b2b2b; color:#e8e8e8; border:1px solid #444; border-radius:999px;
                padding:8px 14px; font-size:13px; cursor:grab; box-shadow:0 2px 8px rgba(0,0,0,.4);
                user-select:none; transition: transform 0.3s ease;
                display:flex; align-items:center; justify-content:center; gap:5px;
                overflow:hidden; white-space:nowrap; min-width:30px; }
            #ld-bw-btn:hover { background:#333; }
            /* 隐藏时让数字落在保留的可见侧 */
            #ld-bw-btn.ld-bw-hide-left { justify-content:flex-end; }
            #ld-bw-btn.ld-bw-hide-right { flex-direction:row-reverse; justify-content:flex-start; }
            #ld-bw-panel { position: fixed; z-index: 100001;
                width: 300px; display: none; overflow: hidden;
                background:#1e1e1e; color:#e8e8e8; border:1px solid #3a3a3a; border-radius:10px;
                box-shadow:0 6px 24px rgba(0,0,0,.5); font-size:13px; }
            #ld-bw-panel .ld-bw-head { display:flex; align-items:center; gap:10px;
                padding:10px 12px; border-bottom:1px solid #3a3a3a; font-weight:600; color:#e8e8e8; }
            #ld-bw-panel .ld-bw-title { margin-right:auto; }
            #ld-bw-panel .ld-bw-pause-label { display:flex; align-items:center; gap:4px; cursor:pointer;
                font-weight:400; font-size:12px; color:#bbb; }
            #ld-bw-panel .ld-bw-body { padding:10px 12px; }
            #ld-bw-panel .ld-bw-add { display:flex; gap:6px; margin-bottom:8px; align-items:stretch; }
            #ld-bw-panel .ld-bw-dot { flex:0 0 auto; padding:6px 9px; font-family:Consolas,monospace; font-size:12px;
                background:#1f2d3a; color:#9cdcfe; border:1px solid #2a5a7a; }
            #ld-bw-panel input[type=text] { flex:1; min-width:0; padding:6px 8px;
                border:1px solid #3a3a3a; border-radius:6px;
                background:#2b2b2b; color:#e8e8e8; }
            #ld-bw-panel input[type=text]::placeholder { color:#888; }
            #ld-bw-panel .ld-bw-submit { background:#0088cc; color:#fff; border-color:#0088cc; }
            #ld-bw-panel button { cursor:pointer; border:1px solid #3a3a3a;
                background:#2b2b2b; color:#e8e8e8; border-radius:6px; padding:6px 10px; }
            #ld-bw-chips { display:flex; flex-wrap:wrap; gap:6px; }
            #ld-bw-chips .chip { display:inline-flex; align-items:center; gap:4px; padding:3px 8px;
                background:#3a3a3a; color:#e8e8e8; border-radius:999px; }
            #ld-bw-chips .chip-close { cursor:pointer; opacity:.6; color:#e8e8e8; }
            #ld-bw-chips .chip-close:hover { opacity:1; }
            #ld-bw-chips .chip-label { cursor:pointer; }
            #ld-bw-chips .chip-label:hover { color:#9cdcfe; }
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
            #ld-bw-panel .ld-bw-sample-add { display:flex; gap:6px; margin-top:6px; }
            #ld-bw-panel .ld-bw-sample-add input { flex:1; min-width:0; padding:5px 8px; font-size:12px;
                border:1px solid #3a3a3a; border-radius:6px; background:#262626; color:#e8e8e8; }
            #ld-bw-panel .ld-bw-sample-add input::placeholder { color:#777; }
            #ld-bw-panel .ld-bw-sample-add button { flex:0 0 auto; padding:5px 10px; font-size:13px; }
            #ld-bw-panel .ld-bw-add .ld-bw-dot { flex:0 0 auto; padding:6px 9px; font-family:Consolas,monospace;
                background:#1f2d3a; color:#9cdcfe; border-color:#2a4a5a; }
            #ld-bw-panel .ld-bw-add .ld-bw-kw { flex:0 0 auto; padding:6px 8px; font-family:Consolas,monospace;
                font-size:11px; background:#1f3a2d; color:#9cdc9c; border-color:#2a5a3a; }
            #ld-bw-panel input[type=text].invalid { border-color:#c0392b; box-shadow:0 0 0 1px #c0392b inset; }
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

        const btn = document.createElement('div');
        btn.id = 'ld-bw-btn';
        btn.innerHTML = '<span class="bw-ico">🚫</span><span class="bw-num">0</span>';
        btn.title = '屏蔽词管理（可拖动）';

        const panel = document.createElement('div');
        panel.id = 'ld-bw-panel';
        panel.innerHTML = `
            <div class="ld-bw-head">
                <span class="ld-bw-title">屏蔽词管理</span>
                <label class="ld-bw-pause-label"><input type="checkbox" class="ld-bw-pause" /> 启用屏蔽</label>
                <span class="ld-bw-close" style="cursor:pointer;font-weight:400;">✕</span>
            </div>
            <div class="ld-bw-body">
                <div class="ld-bw-add">
                    <input type="text" placeholder="输入关键词或正则，如 哈哈" />
                    <button type="button" class="ld-bw-dot" title="在光标处插入 .* ">.*</button>
                    <button type="button" class="ld-bw-submit">添加</button>
                </div>
                <div class="ld-bw-preview"></div>
                <div id="ld-bw-chips"></div>
            </div>
        `;
        document.body.appendChild(btn);
        document.body.appendChild(panel);

        // 恢复上次位置 + 绑定拖拽
        const savedPos = getBtnPos();
        if (savedPos) applyBtnPos(btn, savedPos.x, savedPos.y);
        makeDraggable(btn, toggleBwPanel);

        const input = panel.querySelector('input[type=text]');
        const submitBtn = panel.querySelector('.ld-bw-submit');
        const dotBtn = panel.querySelector('.ld-bw-dot');
        const chips = panel.querySelector('#ld-bw-chips');
        const preview = panel.querySelector('.ld-bw-preview');
        const pauseToggle = panel.querySelector('.ld-bw-pause');
        const closeBtn = panel.querySelector('.ld-bw-close');

        bwState = { btn, panel, input, list: chips, preview, pauseToggle };
        buildPreviewBox(preview);
        updatePreview();

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

        // 点击面板与按钮之外的区域，自动关闭面板
        document.addEventListener('mousedown', (e) => {
            if (!isPanelOpen()) return;
            const t = e.target;
            if (panel.contains(t) || btn.contains(t)) return;
            closeBwPanel();
        });

        pauseToggle.checked = isBlockEnabled();
        pauseToggle.addEventListener('change', () => {
            setBlockEnabled(pauseToggle.checked);
            applyBlockFilter();
        });

        renderBwChips();

        // 首次加载后判定隐藏（默认右下角本就靠边，需正确收起）
        requestAnimationFrame(() => checkAndAutoHide(btn));
    }

    function toggleBwPanel() {
        if (!bwState.panel) return;
        if (bwState.panel.style.display === 'block') {
            closeBwPanel();
        } else {
            expandButton(bwState.btn); // 打开面板时展开按钮
            positionPanel();
            bwState.panel.style.display = 'block';
        }
    }
    function showBlockPanel() {
        if (bwState.panel) {
            expandButton(bwState.btn); // 打开面板时展开按钮
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
