// ==UserScript==
// @name         Linux.do 帖子过滤脚本
// @namespace    http://tampermonkey.net/
// @version      1.5.0
// @description  linuxdo帖子过滤，屏蔽指定用户帖子
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
  "use strict";

  // --- 功能开关配置 ---
  const FEATURES = {
    autoApprove: {
      key: "feat_autoApprove",
      label: "自动允许 OAuth 授权",
      default: false,
    },
    autoExternal: {
      key: "feat_autoExternal",
      label: "自动跳过外链弹窗",
      default: false,
    },
    relativeCreatedAt: {
      key: "feat_relativeCreatedAt",
      label: "显示帖子创建时间",
      default: false,
    },
  };

  function isEnabled(feature) {
    if (typeof GM_getValue === "undefined") return FEATURES[feature].default;
    return GM_getValue(FEATURES[feature].key, FEATURES[feature].default);
  }

  function registerMenus() {
    if (typeof GM_registerMenuCommand === "undefined") return;
    Object.entries(FEATURES).forEach(([featureKey, cfg]) => {
      const update = () => {
        const next = !GM_getValue(cfg.key, cfg.default);
        GM_setValue(cfg.key, next);
        alert(`「${cfg.label}」已${next ? "启用" : "禁用"}，刷新页面生效`);
      };
      const state = isEnabled(featureKey) ? "✅" : "❌";
      GM_registerMenuCommand(`${state} ${cfg.label}`, update);
    });
  }

  registerMenus();

  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("🚫 管理屏蔽词", () => showBlockPanel());
  }

  // ========== 配置导入导出 ==========
  const CONFIG_KEYS = [
    "feat_autoApprove",
    "feat_autoExternal",
    "feat_relativeCreatedAt",
    "block_words_list",
    "block_words_enabled",
    "block_cat_words_list",
    "block_cat_words_enabled",
    "block_users_list",
    "block_users_enabled",
    "bw_preview_samples",
  ];

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  function showImportExportPanel(mode) {
    const existing = document.getElementById("ld-ie-panel");
    if (existing) existing.remove();
    const panel = document.createElement("div");
    panel.id = "ld-ie-panel";
    panel.style.cssText =
      "position:fixed;z-index:200000;top:50%;left:50%;transform:translate(-50%,-50%);width:480px;max-height:80vh;background:#1e1e1e;color:#e8e8e8;border:1px solid #3a3a3a;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.6);font-size:13px;";
    const isImport = mode === "import";
    panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #3a3a3a;font-weight:600;">
                <span>${isImport ? "📥 导入配置" : "📤 导出配置"}</span>
                <span style="cursor:pointer;font-weight:400;opacity:.6;" id="ld-ie-close">✕</span>
            </div>
            <div style="padding:12px 16px;">
                <textarea id="ld-ie-textarea" style="width:100%;height:220px;box-sizing:border-box;padding:8px;background:#2b2b2b;color:#e8e8e8;border:1px solid #3a3a3a;border-radius:6px;font-size:12px;font-family:Consolas,monospace;resize:vertical;" placeholder="${isImport ? "在此粘贴配置 JSON…" : ""}" ${isImport ? "" : "readonly"}></textarea>
                <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
                    ${isImport ? '<button id="ld-ie-import-btn" style="padding:6px 16px;background:#0088cc;color:#fff;border:1px solid #0088cc;border-radius:6px;cursor:pointer;font-size:13px;">导入</button>' : '<button id="ld-ie-copy-btn" style="padding:6px 16px;background:#0088cc;color:#fff;border:1px solid #0088cc;border-radius:6px;cursor:pointer;font-size:13px;">复制到剪贴板</button>'}
                </div>
            </div>
        `;
    document.body.appendChild(panel);
    const overlay = document.createElement("div");
    overlay.id = "ld-ie-overlay";
    overlay.style.cssText =
      "position:fixed;z-index:199999;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);";
    document.body.appendChild(overlay);
    const close = () => {
      panel.remove();
      overlay.remove();
    };
    panel.querySelector("#ld-ie-close").addEventListener("click", close);
    overlay.addEventListener("click", close);

    if (isImport) {
      panel.querySelector("#ld-ie-import-btn").addEventListener("click", () => {
        const textarea = panel.querySelector("#ld-ie-textarea");
        let data;
        try {
          data = JSON.parse(textarea.value);
        } catch (e) {
          alert("JSON 格式无效，请检查粘贴内容");
          return;
        }
        if (typeof GM_setValue === "undefined") {
          alert("不支持 GM_setValue，无法导入");
          close();
          return;
        }
        let imported = 0;
        CONFIG_KEYS.forEach((key) => {
          if (key in data) {
            GM_setValue(key, data[key]);
            imported++;
          }
        });
        alert(`导入成功，已写入 ${imported} 项配置\n刷新页面生效`);
        close();
      });
    } else {
      if (typeof GM_getValue === "undefined") {
        alert("不支持 GM_getValue");
        close();
        return;
      }
      const data = {};
      CONFIG_KEYS.forEach((key) => {
        data[key] = GM_getValue(key, undefined);
      });
      panel.querySelector("#ld-ie-textarea").value = JSON.stringify(
        data,
        null,
        2,
      );
      panel.querySelector("#ld-ie-copy-btn").addEventListener("click", () => {
        const json = panel.querySelector("#ld-ie-textarea").value;
        if (
          typeof navigator.clipboard !== "undefined" &&
          navigator.clipboard.writeText
        ) {
          navigator.clipboard
            .writeText(json)
            .then(() => close())
            .catch(() => {
              fallbackCopy(json);
              close();
            });
        } else {
          fallbackCopy(json);
          close();
        }
      });
    }
  }

  // ========== 屏蔽词面板（仅 linux.do） ==========
  const WORDS_KEY = "block_words_list";
  const BW_ENABLED_KEY = "block_words_enabled";
  const CAT_WORDS_KEY = "block_cat_words_list";
  const CAT_ENABLED_KEY = "block_cat_words_enabled";
  const USER_KEY = "block_users_list";
  const USER_ENABLED_KEY = "block_users_enabled";
  let bwState = {
    trigger: null,
    panel: null,
    input: null,
    list: null,
    catList: null,
    userList: null,
    stat: null,
    pauseToggle: null,
    catPauseToggle: null,
    userPauseToggle: null,
    activeTab: "title",
  };

  function getBlockWords() {
    if (typeof GM_getValue === "undefined") return [];
    const v = GM_getValue(WORDS_KEY, []);
    return Array.isArray(v) ? v : [];
  }
  function setBlockWords(words) {
    if (typeof GM_setValue !== "undefined") GM_setValue(WORDS_KEY, words);
  }
  function isBlockEnabled() {
    if (typeof GM_getValue === "undefined") return true;
    return GM_getValue(BW_ENABLED_KEY, true);
  }
  function setBlockEnabled(v) {
    if (typeof GM_setValue !== "undefined") GM_setValue(BW_ENABLED_KEY, v);
  }

  // --- 分类屏蔽词 ---
  function getCatBlockWords() {
    if (typeof GM_getValue === "undefined") return [];
    const v = GM_getValue(CAT_WORDS_KEY, []);
    return Array.isArray(v) ? v : [];
  }
  function setCatBlockWords(words) {
    if (typeof GM_setValue !== "undefined") GM_setValue(CAT_WORDS_KEY, words);
  }
  function isCatBlockEnabled() {
    if (typeof GM_getValue === "undefined") return true;
    return GM_getValue(CAT_ENABLED_KEY, true);
  }
  function setCatBlockEnabled(v) {
    if (typeof GM_setValue !== "undefined") GM_setValue(CAT_ENABLED_KEY, v);
  }

  // --- 用户屏蔽（精确全匹配，不区分大小写） ---
  function getBlockUsers() {
    if (typeof GM_getValue === "undefined") return [];
    const v = GM_getValue(USER_KEY, []);
    return Array.isArray(v) ? v : [];
  }
  function setBlockUsers(users) {
    if (typeof GM_setValue !== "undefined") GM_setValue(USER_KEY, users);
  }
  function isUserBlockEnabled() {
    if (typeof GM_getValue === "undefined") return true;
    return GM_getValue(USER_ENABLED_KEY, true);
  }
  function setUserBlockEnabled(v) {
    if (typeof GM_setValue !== "undefined") GM_setValue(USER_ENABLED_KEY, v);
  }

  // 支持 /pattern/flags 写法；非法正则返回 null
  // 默认不区分大小写：纯关键词强制加 i；/.../flags 若未声明 i 也补上
  function compileRegex(word) {
    const m = word.match(/^\/(.+)\/([gimsuy]*)$/);
    try {
      if (m) {
        let flags = m[2];
        if (!flags.includes("i")) flags += "i";
        return new RegExp(m[1], flags);
      }
      return new RegExp(word, "i");
    } catch (_) {
      return null;
    }
  }

  // --- 顶部栏徽章入口 ---
  const HEADER_TRIGGER_ID = "ld-bw-trigger";

  // 把徽章插入顶部栏右上角图标区（.d-header-icons），作为该列表第一项；幂等
  function injectHeaderTrigger(trigger) {
    if (!trigger) return false;
    if (trigger.parentElement) return true; // 已在 DOM 里
    const icons = document.querySelector(".d-header .d-header-icons");
    if (!icons) return false; // 头部未就绪
    // 包一层 <li>，与搜索/头像等图标项结构一致
    let li = trigger.closest("li");
    if (!li) {
      li = document.createElement("li");
      li.className = "header-dropdown-toggle";
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
    const header = document.querySelector(".d-header");
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
    panel.style.top = headerH + "px";
    panel.style.left = x + "px";
  }

  function isPanelOpen() {
    return bwState.panel && bwState.panel.style.display === "block";
  }

  // 关闭面板
  function closeBwPanel() {
    if (!bwState.panel) return;
    bwState.panel.style.display = "none";
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
      ? getBlockWords()
          .map((w) => w.trim())
          .filter(Boolean)
      : [];
    const titleMatchers = [];
    if (titleEnabled) {
      titleRawWords.forEach((w) => {
        const re = compileRegex(w);
        if (re) titleMatchers.push(re);
      });
    }

    // --- 分类屏蔽 ---
    const catEnabled = isCatBlockEnabled();
    const catRawWords = catEnabled
      ? getCatBlockWords()
          .map((w) => w.trim())
          .filter(Boolean)
      : [];
    const catMatchers = [];
    if (catEnabled) {
      catRawWords.forEach((w) => {
        const re = compileRegex(w);
        if (re) catMatchers.push(re);
      });
    }

    // --- 用户屏蔽（精确全匹配，不区分大小写） ---
    const userEnabled = isUserBlockEnabled();
    const userBlockList = userEnabled
      ? getBlockUsers()
          .map((u) => u.trim().toLowerCase())
          .filter(Boolean)
      : [];

    document.querySelectorAll("tr.topic-list-item").forEach((tr) => {
      const title = tr.querySelector(".main-link a.title")?.textContent || "";
      const cat = tr.querySelector(".badge-category__name")?.textContent || "";
      const tags = [
        ...tr.querySelectorAll(".discourse-tags .discourse-tag"),
      ].map((t) => t.dataset.tagName || t.textContent.trim());
      const catAndTags = [cat, ...tags].filter(Boolean);
      // 取第一个 a[data-user-card] 即帖子创建人
      const author =
        tr.querySelector("a[data-user-card]")?.dataset.userCard || "";

      const titleHit = titleMatchers.some((re) => re.test(title));
      const catHit = catAndTags.some((text) =>
        catMatchers.some((re) => re.test(text)),
      );
      const userHit = userBlockList.includes(author.toLowerCase());
      const hit = titleHit || catHit || userHit;

      if (hit) {
        tr.style.display = "none";
        if (titleHit) tr.dataset.blockedTitle = "1";
        else delete tr.dataset.blockedTitle;
        if (catHit) tr.dataset.blockedCat = "1";
        else delete tr.dataset.blockedCat;
        if (userHit) tr.dataset.blockedUser = "1";
        else delete tr.dataset.blockedUser;
      } else {
        tr.style.display = "";
        delete tr.dataset.blockedTitle;
        delete tr.dataset.blockedCat;
        delete tr.dataset.blockedUser;
      }
    });
    updateBwStat();
  }

  function updateBwStat() {
    if (!bwState.trigger) return;
    const titleCount = document.querySelectorAll(
      "tr[data-blocked-title]",
    ).length;
    const catCount = document.querySelectorAll("tr[data-blocked-cat]").length;
    const userCount = document.querySelectorAll("tr[data-blocked-user]").length;
    const nums = bwState.trigger.querySelectorAll(".bw-num");
    if (nums[0]) nums[0].textContent = String(titleCount);
    if (nums[1]) nums[1].textContent = String(catCount);
    if (nums[2]) nums[2].textContent = String(userCount);
    bwState.trigger.title = `屏蔽管理 — 标题:${titleCount} 分类/标签:${catCount} 用户:${userCount}`;
  }

  // --- 实时预览：用输入框草稿匹配示例句子，命中的显示为已屏蔽 ---
  const DEFAULT_SAMPLES = [
    "【求助】这个软件怎么安装",
    "分享一个好用的效率工具",
    "天才程序员上线",
    "新人报道",
  ];
  const BW_SAMPLES_KEY = "bw_preview_samples";
  function getSamples() {
    if (typeof GM_getValue === "undefined") return DEFAULT_SAMPLES.slice();
    const v = GM_getValue(BW_SAMPLES_KEY, null);
    return Array.isArray(v) && v.length ? v : DEFAULT_SAMPLES.slice();
  }
  function setSamples(arr) {
    if (typeof GM_setValue !== "undefined") GM_setValue(BW_SAMPLES_KEY, arr);
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
    const arr = getSamples().filter((s) => s !== text);
    setSamples(arr);
  }

  function buildPreviewBox(box) {
    if (!box) return;
    box.innerHTML = "";
    const title = document.createElement("div");
    title.className = "ld-bw-preview-title";
    title.textContent = "实时预览（输入即匹配，命中变红划线）";
    box.appendChild(title);

    getSamples().forEach((text) => {
      const row = document.createElement("div");
      row.className = "ld-bw-sample";
      row.dataset.text = text;
      const span = document.createElement("span");
      span.textContent = text;
      const del = document.createElement("span");
      del.className = "ld-bw-sample-del";
      del.textContent = "✕";
      del.title = "删除该示例";
      del.addEventListener("click", () => {
        removeSample(text);
        buildPreviewBox(box);
        updatePreview();
      });
      row.appendChild(span);
      row.appendChild(del);
      box.appendChild(row);
    });

    // 内联添加行
    const addRow = document.createElement("div");
    addRow.className = "ld-bw-sample-add";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = "添加示例句子（回车确认）";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "＋";
    addBtn.title = "添加示例";
    const doAdd = () => {
      if (addSample(inp.value)) {
        inp.value = "";
        buildPreviewBox(box);
        updatePreview();
      }
      inp.focus();
    };
    addBtn.addEventListener("click", doAdd);
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doAdd();
    });
    addRow.appendChild(inp);
    addRow.appendChild(addBtn);
    box.appendChild(addRow);
  }

  function updatePreview() {
    const box = bwState.preview,
      inputEl = bwState.input;
    if (!box || !inputEl) return;
    const raw = inputEl.value.trim(); // 规则就是输入框原始内容
    let valid = true,
      re = null;
    if (raw) {
      re = compileRegex(raw);
      if (!re) valid = false;
    }
    box.querySelectorAll(".ld-bw-sample").forEach((el) => {
      let hit = false;
      const text = el.dataset.text || "";
      if (raw && valid) hit = re.test(text);
      el.classList.toggle("hit", hit);
    });
    if (raw && !valid) {
      inputEl.classList.add("invalid");
    } else {
      inputEl.classList.remove("invalid");
    }
  }

  function injectBwStyles() {
    if (document.getElementById("ld-bw-style")) return;
    const css = `
            #ld-bw-trigger { display:inline-flex; align-items:center; gap:2px;
                padding:6px 10px; font-size:13px; line-height:1; cursor:pointer;
                border:1px solid var(--primary-low,#444); border-radius:4px;
                background:transparent; color:var(--primary,#e8e8e8); margin-right:8px; }
            .header-dropdown-toggle #ld-bw-trigger { height:100%; }
            .header-dropdown-toggle { display:flex; align-items:center; }
            #ld-bw-trigger:hover { background:var(--primary-low,#333); }
            #ld-bw-trigger .bw-num { font-variant-numeric:tabular-nums; min-width:8px; text-align:center; }
            #ld-bw-trigger .bw-sep { opacity:.4; margin:0 1px; }
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
            #ld-bw-chips, #ld-bw-cat-chips, #ld-bw-user-chips { display:flex; flex-wrap:wrap; gap:6px; }
            #ld-bw-chips .chip, #ld-bw-cat-chips .chip, #ld-bw-user-chips .chip { display:inline-flex; align-items:center; gap:4px; padding:3px 8px;
                background:#3a3a3a; color:#e8e8e8; border-radius:4px; }
            #ld-bw-chips .chip-close, #ld-bw-cat-chips .chip-close, #ld-bw-user-chips .chip-close { cursor:pointer; opacity:.6; color:#e8e8e8; }
            #ld-bw-chips .chip-close:hover, #ld-bw-cat-chips .chip-close:hover, #ld-bw-user-chips .chip-close:hover { opacity:1; }
            #ld-bw-chips .chip-label, #ld-bw-cat-chips .chip-label, #ld-bw-user-chips .chip-label { cursor:pointer; }
            #ld-bw-chips .chip-label:hover, #ld-bw-cat-chips .chip-label:hover, #ld-bw-user-chips .chip-label:hover { color:#9cdcfe; }
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
            #ld-bw-panel .ld-bw-qi-icon { width:1em; height:1em; vertical-align:middle; margin-right:4px; }
            #ld-bw-panel .ld-bw-chip-icon { width:.85em; height:.85em; vertical-align:middle; margin-right:3px; }
            #ld-bw-panel .ld-bw-cat-dropdown { position:relative;
                max-height:180px; overflow-y:auto;
                background:#2b2b2b; border:1px solid #3a3a3a; border-radius:6px; margin-top:4px; }
            #ld-bw-panel .ld-bw-cat-dropdown-item { display:flex; align-items:center; gap:4px;
                padding:5px 10px; cursor:pointer; font-size:12px; color:#ccc; }
            #ld-bw-panel .ld-bw-cat-dropdown-item:hover { background:#3a3a3a; color:#e8e8e8; }
            .ld-created-at { margin-left:4px; color:#45B5AA; font-size:inherit; }
            .ld-created-at::before { content:'/'; margin-right:4px; color:inherit; }
            td.age { min-width:180px; }
            #ld-bw-panel .ld-bw-quick-item.added { opacity:.4; cursor:default; text-decoration:line-through; }
        `;
    const style = document.createElement("style");
    style.id = "ld-bw-style";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // 点击已有关键字进行编辑：从列表移除并放入输入框；输入框有内容时询问是否替换
  function editWord(word) {
    const inputEl = bwState.input;
    if (!inputEl) return;
    const existing = inputEl.value.trim();
    if (existing && existing !== word) {
      if (!confirm("输入框已有内容，是否用此关键字替换？")) return;
    }
    setBlockWords(getBlockWords().filter((x) => x !== word));
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
    bwState.list.innerHTML = "";
    if (!words.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:var(--primary-medium,#999);padding:6px 0;";
      empty.textContent = "暂无屏蔽词";
      bwState.list.appendChild(empty);
    } else {
      words.forEach((w) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        const label = document.createElement("span");
        label.className = "chip-label";
        label.textContent = w;
        label.title = "点击编辑";
        label.addEventListener("click", () => editWord(w));
        const close = document.createElement("span");
        close.className = "chip-close";
        close.textContent = "✕";
        close.title = "移除";
        close.addEventListener("click", () => {
          setBlockWords(getBlockWords().filter((x) => x !== w));
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
    const trigger = document.createElement("button");
    trigger.id = HEADER_TRIGGER_ID;
    trigger.type = "button";
    trigger.title = "屏蔽管理";
    trigger.innerHTML =
      '<span class="bw-num">0</span><span class="bw-sep">/</span><span class="bw-num">0</span><span class="bw-sep">/</span><span class="bw-num">0</span>';

    const panel = document.createElement("div");
    panel.id = "ld-bw-panel";
    panel.innerHTML = `
            <div class="ld-bw-head">
                <span class="ld-bw-title">屏蔽词管理</span>
                <span class="ld-bw-ie-btn" title="导入配置" style="cursor:pointer;font-size:12px;opacity:.7;">导入</span>
                <span class="ld-bw-ie-btn" title="导出配置" style="cursor:pointer;font-size:12px;opacity:.7;">导出</span>
                <span class="ld-bw-reset-btn" title="重置所有设置" style="cursor:pointer;font-size:12px;opacity:.7;color:#e88;">重置</span>
                <span class="ld-bw-close" style="cursor:pointer;font-weight:400;">✕</span>
            </div>
            <div class="ld-bw-tabs">
                <div class="ld-bw-tab active" data-tab="title">标题屏蔽</div>
                <div class="ld-bw-tab" data-tab="category">分类屏蔽</div>
                <div class="ld-bw-tab" data-tab="user">用户屏蔽</div>
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
                        <label class="ld-bw-pause-label"><input type="checkbox" class="ld-bw-cat-pause" /> 启用分类/标签屏蔽</label>
                    </div>
                    <div class="ld-bw-add ld-bw-cat-add">
                        <input type="text" placeholder="输入分类或标签名，如 搞七捻三" />
                        <button type="button" class="ld-bw-cat-submit">添加</button>
                    </div>
                    <div id="ld-bw-cat-chips"></div>
                </div>
                <div class="ld-bw-tab-content" data-tab="user">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <label class="ld-bw-pause-label"><input type="checkbox" class="ld-bw-user-pause" /> 启用用户屏蔽</label>
                    </div>
                    <div class="ld-bw-add ld-bw-user-add">
                        <input type="text" placeholder="输入用户名（精确匹配），如 spam_user" />
                        <button type="button" class="ld-bw-user-submit">添加</button>
                    </div>
                    <div id="ld-bw-user-chips"></div>
                </div>
            </div>
        `;
    document.body.appendChild(panel);

    const input = panel.querySelector(
      '.ld-bw-tab-content[data-tab="title"] input[type=text]',
    );
    const submitBtn = panel.querySelector(".ld-bw-submit");
    const dotBtn = panel.querySelector(".ld-bw-dot");
    const chips = panel.querySelector("#ld-bw-chips");
    const preview = panel.querySelector(".ld-bw-preview");
    const pauseToggle = panel.querySelector(".ld-bw-pause");
    const closeBtn = panel.querySelector(".ld-bw-close");
    const ieBtns = panel.querySelectorAll(".ld-bw-ie-btn");
    if (ieBtns[0])
      ieBtns[0].addEventListener("click", () =>
        showImportExportPanel("import"),
      );
    if (ieBtns[1])
      ieBtns[1].addEventListener("click", () =>
        showImportExportPanel("export"),
      );
    const resetBtn = panel.querySelector(".ld-bw-reset-btn");
    if (resetBtn)
      resetBtn.addEventListener("click", () => {
        if (!confirm("确定重置所有设置？此操作不可撤销")) return;
        CONFIG_KEYS.forEach((key) => {
          const feat = Object.entries(FEATURES).find(([, v]) => v.key === key);
          if (feat) {
            GM_setValue(key, feat[1].default);
            return;
          }
          if (key.includes("_enabled")) GM_setValue(key, true);
          else GM_setValue(key, []);
        });
        alert("已重置，刷新页面生效");
      });

    const catInput = panel.querySelector(".ld-bw-cat-add input[type=text]");
    const catSubmitBtn = panel.querySelector(".ld-bw-cat-submit");
    const catChips = panel.querySelector("#ld-bw-cat-chips");
    const catPauseToggle = panel.querySelector(".ld-bw-cat-pause");
    const catBody = panel.querySelector(
      '.ld-bw-tab-content[data-tab="category"]',
    );

    const userInput = panel.querySelector(".ld-bw-user-add input[type=text]");
    const userSubmitBtn = panel.querySelector(".ld-bw-user-submit");
    const userChips = panel.querySelector("#ld-bw-user-chips");
    const userPauseToggle = panel.querySelector(".ld-bw-user-pause");

    bwState = {
      trigger,
      panel,
      input,
      list: chips,
      catList: catChips,
      userList: userChips,
      preview,
      pauseToggle,
      catPauseToggle,
      userPauseToggle,
      activeTab: "title",
    };
    buildPreviewBox(preview);
    updatePreview();

    // --- Tab 切换 ---
    panel.querySelectorAll(".ld-bw-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;
        bwState.activeTab = target;
        panel
          .querySelectorAll(".ld-bw-tab")
          .forEach((t) =>
            t.classList.toggle("active", t.dataset.tab === target),
          );
        panel
          .querySelectorAll(".ld-bw-tab-content")
          .forEach((c) =>
            c.classList.toggle("active", c.dataset.tab === target),
          );
      });
    });

    // --- 分类屏蔽词逻辑 ---
    const chipIconMeta = {};
    const addCatWord = () => {
      const val = catInput.value.trim();
      if (!val) return;
      if (!compileRegex(val)) {
        catInput.classList.add("invalid");
        catInput.focus();
        return;
      }
      const words = getCatBlockWords();
      if (!words.includes(val)) {
        words.push(val);
        setCatBlockWords(words);
      }
      catInput.value = "";
      renderCatChips();
      applyBlockFilter();
    };
    catSubmitBtn.addEventListener("click", addCatWord);
    catInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addCatWord();
    });
    catInput.addEventListener("input", () => {
      catInput.classList.remove("invalid");
      buildCatDropdown(catInput.value);
    });
    catInput.addEventListener("focus", () => buildCatDropdown(catInput.value));
    catInput.addEventListener("blur", () => setTimeout(hideCatDropdown, 150));

    function editCatWord(word) {
      const existing = catInput.value.trim();
      if (existing && existing !== word) {
        if (!confirm("输入框已有内容，是否用此关键字替换？")) return;
      }
      setCatBlockWords(getCatBlockWords().filter((x) => x !== word));
      catInput.value = word;
      catInput.focus();
      catInput.selectionStart = catInput.selectionEnd = catInput.value.length;
      renderCatChips();
      applyBlockFilter();
    }

    catPauseToggle.checked = isCatBlockEnabled();
    catPauseToggle.addEventListener("change", () => {
      setCatBlockEnabled(catPauseToggle.checked);
      applyBlockFilter();
    });

    function renderCatChips() {
      if (!catChips) return;
      const words = getCatBlockWords();
      catChips.innerHTML = "";
      if (!words.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "color:var(--primary-medium,#999);padding:6px 0;";
        empty.textContent = "暂无分类/标签屏蔽词";
        catChips.appendChild(empty);
      } else {
        words.forEach((w) => {
          const chip = document.createElement("span");
          chip.className = "chip";
          const label = document.createElement("span");
          label.className = "chip-label";
          const meta =
            chipIconMeta[w] || SIDEBAR_ITEMS.find((it) => it.name === w);
          if (meta && meta.icon) {
            label.innerHTML = `<svg class="ld-bw-chip-icon" fill="${meta.color}" width=".85em" height=".85em" aria-hidden="true"><use href="${meta.icon}"></use></svg>${w}`;
          } else {
            label.textContent = w;
          }
          label.title = "点击编辑";
          label.addEventListener("click", () => editCatWord(w));
          const close = document.createElement("span");
          close.className = "chip-close";
          close.textContent = "✕";
          close.title = "移除";
          close.addEventListener("click", () => {
            setCatBlockWords(getCatBlockWords().filter((x) => x !== w));
            renderCatChips();
            applyBlockFilter();
          });
          chip.appendChild(label);
          chip.appendChild(close);
          catChips.appendChild(chip);
        });
      }
    }

    const SIDEBAR_ITEMS = [
      { type: "cat", name: "开发调优", icon: "#code", color: "#32c3c3" },
      { type: "cat", name: "国产替代", icon: "#seedling", color: "#d12c25" },
      {
        type: "cat",
        name: "资源荟萃",
        icon: "#square-share-nodes",
        color: "#12a89d",
      },
      { type: "cat", name: "网盘资源", icon: "#hard-drive", color: "#16b176" },
      { type: "cat", name: "文档共建", icon: "#book", color: "#9cb6c4" },
      { type: "cat", name: "非我莫属", icon: "#briefcase", color: "#a8c6fe" },
      {
        type: "cat",
        name: "读书成诗",
        icon: "#book-open-reader",
        color: "#e0d900",
      },
      { type: "cat", name: "前沿快讯", icon: "#newspaper", color: "#bb8fce" },
      { type: "cat", name: "网络记忆", icon: "#rss", color: "#f7941d" },
      { type: "cat", name: "福利羊毛", icon: "#piggy-bank", color: "#e45735" },
      { type: "cat", name: "搞七捻三", icon: "#droplet", color: "#3ab54a" },
      { type: "cat", name: "虫洞广场", icon: "#hurricane", color: "#ff00f7" },
      { type: "cat", name: "运营反馈", icon: "#comments", color: "#808281" },
      { type: "tag", name: "人工智能", icon: "#brain", color: "#bd93f9" },
      { type: "tag", name: "公告", icon: "#bullhorn", color: "#00aeff" },
      { type: "tag", name: "原创", icon: "#lightbulb", color: "#00aeff" },
      {
        type: "tag",
        name: "快问快答",
        icon: "#circle-question",
        color: "#669d34",
      },
      { type: "tag", name: "抽奖", icon: "#shuffle", color: "#f7941d" },
      { type: "tag", name: "精华神帖", icon: "#thumbs-up", color: "#00aeff" },
      { type: "tag", name: "集中帖", icon: "#people-group", color: "#00aeff" },
    ];

    renderCatChips();

    function buildCatDropdown(query) {
      let dropdown = catBody.querySelector(".ld-bw-cat-dropdown");
      if (dropdown) dropdown.remove();
      const q = query.trim();
      const blocked = getCatBlockWords();
      const matches = SIDEBAR_ITEMS.filter((item) => {
        if (blocked.includes(item.name)) return false;
        if (!q) return true;
        return item.name.includes(q);
      });
      if (!matches.length) return;
      dropdown = document.createElement("div");
      dropdown.className = "ld-bw-cat-dropdown";
      matches.forEach((item) => {
        const row = document.createElement("div");
        row.className =
          "ld-bw-cat-dropdown-item" +
          (item.type === "cat" ? " is-cat" : " is-tag");
        row.innerHTML = `<svg class="ld-bw-qi-icon" fill="${item.color}" width="1em" height="1em" aria-hidden="true"><use href="${item.icon}"></use></svg><span>${item.name}</span>`;
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          const words = getCatBlockWords();
          if (!words.includes(item.name)) {
            words.push(item.name);
            setCatBlockWords(words);
            chipIconMeta[item.name] = { icon: item.icon, color: item.color };
          }
          catInput.value = "";
          renderCatChips();
          applyBlockFilter();
          hideCatDropdown();
        });
        dropdown.appendChild(row);
      });
      catBody.appendChild(dropdown);
    }

    function hideCatDropdown() {
      const dropdown = catBody.querySelector(".ld-bw-cat-dropdown");
      if (dropdown) dropdown.remove();
    }

    // --- 用户屏蔽逻辑（精确全匹配） ---
    const addUser = () => {
      const val = userInput.value.trim();
      if (!val) return;
      const users = getBlockUsers();
      if (!users.includes(val)) {
        users.push(val);
        setBlockUsers(users);
      }
      userInput.value = "";
      renderUserChips();
      applyBlockFilter();
    };
    userSubmitBtn.addEventListener("click", addUser);
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addUser();
    });

    function editUser(name) {
      const existing = userInput.value.trim();
      if (existing && existing !== name) {
        if (!confirm("输入框已有内容，是否用此用户名替换？")) return;
      }
      setBlockUsers(getBlockUsers().filter((x) => x !== name));
      userInput.value = name;
      userInput.focus();
      userInput.selectionStart = userInput.selectionEnd =
        userInput.value.length;
      renderUserChips();
      applyBlockFilter();
    }

    userPauseToggle.checked = isUserBlockEnabled();
    userPauseToggle.addEventListener("change", () => {
      setUserBlockEnabled(userPauseToggle.checked);
      applyBlockFilter();
    });

    function renderUserChips() {
      if (!userChips) return;
      const users = getBlockUsers();
      userChips.innerHTML = "";
      if (!users.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "color:var(--primary-medium,#999);padding:6px 0;";
        empty.textContent = "暂无屏蔽用户";
        userChips.appendChild(empty);
      } else {
        users.forEach((u) => {
          const chip = document.createElement("span");
          chip.className = "chip";
          const label = document.createElement("span");
          label.className = "chip-label";
          label.textContent = u;
          label.title = "点击编辑";
          label.addEventListener("click", () => editUser(u));
          const close = document.createElement("span");
          close.className = "chip-close";
          close.textContent = "✕";
          close.title = "移除";
          close.addEventListener("click", () => {
            setBlockUsers(getBlockUsers().filter((x) => x !== u));
            renderUserChips();
            applyBlockFilter();
          });
          chip.appendChild(label);
          chip.appendChild(close);
          userChips.appendChild(chip);
        });
      }
    }
    renderUserChips();
    dotBtn.addEventListener("click", () => {
      const s = input.selectionStart ?? input.value.length;
      const e = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, s) + ".*" + input.value.slice(e);
      const pos = s + 2;
      input.selectionStart = input.selectionEnd = pos;
      input.focus();
      updatePreview();
    });

    const addWord = () => {
      const val = input.value.trim();
      if (!val) return;
      if (!compileRegex(val)) {
        input.classList.add("invalid");
        input.focus();
        return;
      }
      const words = getBlockWords();
      if (!words.includes(val)) {
        words.push(val);
        setBlockWords(words);
      }
      input.value = "";
      updatePreview();
      renderBwChips();
      applyBlockFilter();
    };
    submitBtn.addEventListener("click", addWord);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addWord();
    });
    input.addEventListener("input", updatePreview);
    closeBtn.addEventListener("click", () => closeBwPanel());

    // 徽章点击 toggle 面板
    trigger.addEventListener("click", () => toggleBwPanel());

    // 点击面板与徽章之外的区域，自动关闭面板
    document.addEventListener("mousedown", (e) => {
      if (!isPanelOpen()) return;
      const t = e.target;
      if (panel.contains(t) || trigger.contains(t)) return;
      closeBwPanel();
    });

    // 窗口缩放时重新定位面板
    window.addEventListener("resize", () => {
      if (isPanelOpen()) positionPanel();
    });

    pauseToggle.checked = isBlockEnabled();
    pauseToggle.addEventListener("change", () => {
      setBlockEnabled(pauseToggle.checked);
      applyBlockFilter();
    });

    renderBwChips();

    // 把徽章插入顶部栏。Discourse 头部异步渲染、路由切换会重建 .d-header，
    // 所以持续监听 body：每次变更都尝试幂等插入（已正确插入则跳过）
    const tryInject = () => injectHeaderTrigger(trigger);
    const ensureInjected = () => {
      if (!trigger.parentElement) tryInject();
    };
    const startObs = () => {
      ensureInjected();
      const obs = new MutationObserver(ensureInjected);
      obs.observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) startObs();
    else
      document.addEventListener("DOMContentLoaded", startObs, { once: true });
  }

  function toggleBwPanel() {
    if (!bwState.panel) return;
    if (bwState.panel.style.display === "block") {
      closeBwPanel();
    } else {
      positionPanel();
      bwState.panel.style.display = "block";
    }
  }
  function showBlockPanel() {
    if (bwState.panel) {
      positionPanel();
      bwState.panel.style.display = "block";
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
    else document.addEventListener("DOMContentLoaded", start, { once: true });
  }

  // ========== 显示帖子创建时间 ==========
  // 在帖子列表的活动时间旁追加创建时间的相对日期显示

  function relativeTime(diffMs) {
    const diff = diffMs;
    if (diff < 0) return "刚刚";
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    if (years >= 1) {
      const d = new Date(Date.now() - diff);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    if (months >= 1) return `${months} 个月前`;
    if (days >= 1) return `${days} 天前`;
    if (hours >= 1) return `${hours} 小时前`;
    if (minutes >= 1) return `${minutes} 分钟前`;
    return "刚刚";
  }

  function parseCreatedAt(title) {
    const cn = title.match(
      /(?:创建日期|Created)[:：]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2}):(\d{2})/,
    );
    if (cn) {
      const ts = new Date(
        parseInt(cn[1]),
        parseInt(cn[2]) - 1,
        parseInt(cn[3]),
        parseInt(cn[4]),
        parseInt(cn[5]),
      ).getTime();
      if (!isNaN(ts)) return ts;
    }
    const en = title.match(
      /(?:Created)[:：]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i,
    );
    if (en) {
      const months = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
      };
      const mo = months[en[1].toLowerCase()];
      let h = parseInt(en[4]);
      const m2 = parseInt(en[5]);
      if (en[6].toLowerCase() === "pm" && h !== 12) h += 12;
      else if (en[6].toLowerCase() === "am" && h === 12) h = 0;
      const ts = new Date(
        parseInt(en[3]),
        mo,
        parseInt(en[2]),
        h,
        m2,
      ).getTime();
      if (!isNaN(ts)) return ts;
    }
    return null;
  }

  function replaceActivityWithCreatedAt() {
    document.querySelectorAll("td.age").forEach((td) => {
      if (td.querySelector(".ld-created-at")) return;
      const title = td.getAttribute("title");
      if (!title) return;
      const ts = parseCreatedAt(title);
      if (ts === null) return;
      const diff = Date.now() - ts;
      if (diff < 0) return;
      const text = relativeTime(diff);
      const anchor = td.querySelector(".post-activity");
      if (!anchor) return;
      const span = document.createElement("span");
      span.className = "ld-created-at";
      span.textContent = text;
      span.title = `创建于 ${new Date(ts).toLocaleString("zh-CN")}`;
      anchor.appendChild(span);
    });
  }

  let createdAtTimer = null;
  function scheduleCreatedAtReplace() {
    clearTimeout(createdAtTimer);
    createdAtTimer = setTimeout(replaceActivityWithCreatedAt, 200);
  }

  let createdAtObserver = null;
  let createdAtInterval = null;
  function initCreatedAtReplace() {
    const start = () => {
      replaceActivityWithCreatedAt();
      createdAtObserver = new MutationObserver(() =>
        scheduleCreatedAtReplace(),
      );
      createdAtObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      createdAtInterval = setInterval(replaceActivityWithCreatedAt, 3000);
    };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
  }

  const isConnectPage = location.hostname === "connect.linux.do";

  // ========== 授权登录自动允许 ==========
  if (isConnectPage) {
    if (!isEnabled("autoApprove")) return;
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
      try {
        btn.click();
      } catch (_) {}

      // 再强制跳转到绝对地址，避免 click 被拦
      const href =
        btn.href ||
        (btn.getAttribute("href")
          ? new URL(btn.getAttribute("href"), location.origin).href
          : "");
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
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    // 2 秒后清理
    setTimeout(() => {
      clearInterval(interval);
      observer.disconnect();
    }, 2000);
  }

  // ========== linux.do 站点增强（屏蔽词 + 外链跳转 + 创建时间 + 用户卡片屏蔽） ==========
  else {
    // 屏蔽词面板：独立于外链开关
    initBlockWords();
    // 显示帖子创建时间（默认关闭）
    if (isEnabled("relativeCreatedAt")) initCreatedAtReplace();

    // ========== 用户卡片屏蔽按钮 ==========
    const injectBlockUserBtn = () => {
      const card = document.querySelector("#user-card.show");
      if (!card || card.querySelector(".ld-card-block-btn")) return;
      const nameLink = card.querySelector('a[href^="/u/"]');
      if (!nameLink) return;
      const href = nameLink.getAttribute("href") || "";
      const username = href.match(/\/u\/([^/]+)/)?.[1];
      if (!username) return;
      const buttonsOutlet = card.querySelector(
        ".user-card-additional-buttons-outlet",
      );
      if (!buttonsOutlet) return;
      const li = document.createElement("li");
      li.className = "user-card-additional-buttons-outlet ld-card-block-btn ember-view";
      const blocked = getBlockUsers()
        .map((u) => u.trim().toLowerCase())
        .filter(Boolean)
        .includes(username.toLowerCase());
      const btn = document.createElement("button");
      btn.className = "btn btn-default btn-sm";
      btn.type = "button";
      btn.style.cssText = blocked
        ? "opacity:.5;cursor:default;text-decoration:line-through;color:#e88;"
        : "color:#e88;";
      btn.textContent = blocked ? "已屏蔽" : "屏蔽该用户";
      if (!blocked) {
        btn.addEventListener("click", () => {
          if (!confirm(`确定屏蔽用户「${username}」？`)) return;
          const users = getBlockUsers();
          if (!users.includes(username)) {
            users.push(username);
            setBlockUsers(users);
          }
          btn.textContent = "已屏蔽";
          btn.style.cssText =
            "opacity:.5;cursor:default;text-decoration:line-through;color:#e88;";
          btn.disabled = true;
          applyBlockFilter();
        });
      } else {
        btn.disabled = true;
      }
      li.appendChild(btn);
      buttonsOutlet.appendChild(li);
    };

    const cardObserver = new MutationObserver(() => {
      const card = document.querySelector("#user-card");
      if (card && card.classList.contains("show")) {
        setTimeout(injectBlockUserBtn, 100);
      }
    });
    const startCardObs = () => {
      cardObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    };
    if (document.body) startCardObs();
    else
      document.addEventListener("DOMContentLoaded", startCardObs, {
        once: true,
      });

    // ========== 自动点击外链跳转 ==========
    if (isEnabled("autoExternal")) {
      const modalSelector = ".external-link-modal";
      const btnSelector = ".d-modal__footer .btn-primary";

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              if (
                node.matches?.(modalSelector) ||
                node.querySelector?.(modalSelector)
              ) {
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
      else
        document.addEventListener("DOMContentLoaded", startObserve, {
          once: true,
        });
    }
  }
})();
