// ==UserScript==
// @name         AI侧边栏导航(居中灵活)
// @namespace    https://github.com/Dr-Zhao1980/Tools/new/main
// @version      1.2.0
// @description  为 ChatGPT 与 Gemini 生成右侧目录：仿 Copilot 分屏模式（自动挤压页面不遮挡）、支持拖拽宽度、关闭按钮、搜索高亮、快速跳转。
// @match        https://chatgpt.com/*
// @match        https://gemini.google.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @author       Dr_Zhao
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  /***********************
   * 配置 & 持久化
   ***********************/
  const LS_KEY = 'tm_outline_pro_right_v1';
  const DEFAULTS = {
    width: 320,
    collapsed: false,
    maxTitleLength: 90,
    rebuildDebounceMs: 350,
    scrollBehavior: 'smooth',
    scrollOffset: 24,
  };

  const store = {
    get() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
      } catch {
        return { ...DEFAULTS };
      }
    },
    set(patch) {
      const cur = store.get();
      const next = { ...cur, ...patch };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    }
  };

  let CONFIG = store.get();

  /***********************
   * 工具
   ***********************/
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function truncate(str, n) {
    const s = (str || '').replace(/\s+/g, ' ').trim();
    return s.length <= n ? s : (s.slice(0, n - 1) + '…');
  }

  function countLines(text) {
    return (text || '').split(/\r\n|\r|\n/).length;
  }

  function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.height > 0 && rect.width > 0;
  }

  function getPlatform() {
    const h = location.hostname;
    if (h === 'chatgpt.com') return 'chatgpt';
    if (h === 'gemini.google.com') return 'gemini';
    return 'unknown';
  }

  function findConversationRoot() {
    return document.querySelector('main')
      || document.querySelector('[role="main"]')
      || document.body
      || document.documentElement;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, String(v));
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function appendHighlightedText(parent, text, tokens) {
    const src = (text || '');
    const ts = (tokens || []).map(t => (t || '').trim()).filter(Boolean);
    if (!ts.length) {
      parent.appendChild(document.createTextNode(src));
      return;
    }
    const escaped = ts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
    if (!escaped.length) {
      parent.appendChild(document.createTextNode(src));
      return;
    }
    const re = new RegExp(`(${escaped.join('|')})`, 'ig');
    let last = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const idx = m.index;
      if (idx > last) parent.appendChild(document.createTextNode(src.slice(last, idx)));
      const mark = document.createElement('mark');
      mark.style.background = 'rgba(255,255,255,0.22)';
      mark.style.color = '#fff';
      mark.style.borderRadius = '6px';
      mark.style.padding = '0 3px';
      mark.textContent = m[0];
      parent.appendChild(mark);
      last = idx + m[0].length;
      if (re.lastIndex === idx) re.lastIndex++;
    }
    if (last < src.length) parent.appendChild(document.createTextNode(src.slice(last)));
  }

  /***********************
   * Adapter
   ***********************/
  const ADAPTERS = {
    chatgpt: {
      root: () => findConversationRoot(),
      extractQuestions() {
        const root = this.root();
        const msgEls = Array.from(root.querySelectorAll('[data-message-author-role="user"]')).filter(isElementVisible);
        const roleResults = msgEls.map(msgEl => {
          const startEl = msgEl.querySelector('.whitespace-pre-wrap') || msgEl;
          const fullText = (startEl.textContent || '').trim();
          return fullText ? { el: msgEl, startEl, fullText } : null;
        }).filter(Boolean);

        if (roleResults.length) return roleResults;

        const textEls = Array.from(root.querySelectorAll('.whitespace-pre-wrap')).filter(isElementVisible);
        return textEls.map(textEl => {
          const fullText = (textEl.textContent || '').trim();
          return fullText ? { el: textEl, startEl: textEl, fullText } : null;
        }).filter(Boolean);
      },
      getStartEl(item) {
        return item.startEl || item.el.querySelector('.whitespace-pre-wrap') || item.el;
      },
    },
    gemini: {
      root: () => findConversationRoot(),
      extractQuestions() {
        const root = this.root();
        let textEls = Array.from(root.querySelectorAll('.query-text.gds-body-l')).filter(isElementVisible);
        if (!textEls.length) {
          textEls = Array.from(root.querySelectorAll('.query-text, [class*="query-text"]')).filter(isElementVisible);
        }
        return textEls.map(textEl => {
          const fullText = (textEl.textContent || '').trim();
          if (!fullText) return null;
          const container = textEl.closest('[role="listitem"]') || textEl.closest('article') || textEl.closest('div') || textEl;
          return { el: container, startEl: textEl, fullText };
        }).filter(Boolean);
      },
      getStartEl(item) {
        return item.startEl || item.el;
      },
    },
  };

  function getAdapter() {
    return ADAPTERS[getPlatform()] || null;
  }

  /***********************
   * 样式
   ***********************/
  function mountStyle() {
    const styleId = 'tm-outline-pro-style';
    document.getElementById(styleId)?.remove();

    const width = clamp(CONFIG.width, 220, 520);
    const collapsedW = 0; // 收起时完全隐藏内容区，只留小条？或者直接宽度为0？这里做成只留头部宽度的模式
    // 为了美观，收起模式我们设定一个固定的小宽度
    const collapsedWidthCSS = '44px';

    GM_addStyle(`
      #${styleId} {}

      /* 根容器：右侧固定 */
      #tm-outline-pro {
        position: fixed; right: 0; top: 0; height: 100vh; width: ${width}px;
        z-index: 2147483647;
        background: rgba(20,20,20,.95); color: #fff;
        border-left: 1px solid rgba(255,255,255,.12); /* 左侧边框 */
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        display: flex; flex-direction: column; backdrop-filter: blur(8px);
        transition: width 0.2s ease;
        box-shadow: -4px 0 20px rgba(0,0,0,0.2);
      }
      #tm-outline-pro.tm-collapsed { width: ${collapsedWidthCSS}; }

      /* 头部 */
      #tm-outline-pro .tm-header {
        display: flex; align-items: center; gap: 6px; padding: 10px 6px;
        border-bottom: 1px solid rgba(255,255,255,.10);
        user-select: none; flex-shrink: 0;
      }
      #tm-outline-pro .tm-title {
        font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden;
        text-overflow: ellipsis; flex: 1; padding-left: 4px;
      }
      #tm-outline-pro.tm-collapsed .tm-title { display: none; }

      #tm-outline-pro .tm-btn {
        border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.06); color: #fff;
        border-radius: 8px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
        cursor: pointer; font-size: 14px; padding: 0; flex-shrink: 0;
      }
      #tm-outline-pro .tm-btn:hover { background: rgba(255,255,255,.15); }
      #tm-outline-pro .tm-btn.tm-btn-close:hover { background: rgba(220, 50, 50, 0.8); border-color: transparent; }

      /* 内容区 */
      #tm-outline-pro .tm-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; flex: 1; }
      #tm-outline-pro.tm-collapsed .tm-body { display: none; }

      #tm-outline-pro input.tm-search {
        width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid rgba(255,255,255,.15);
        padding: 8px 10px; background: rgba(255,255,255,.06); color: #fff; outline: none; font-size: 12px;
      }
      #tm-outline-pro .tm-list { overflow: auto; flex: 1; padding-right: 4px; }

      /* 滚动条美化 */
      #tm-outline-pro .tm-list::-webkit-scrollbar { width: 4px; }
      #tm-outline-pro .tm-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }

      #tm-outline-pro .tm-item {
        display: grid; grid-template-columns: 24px 1fr; gap: 8px; padding: 8px; border-radius: 8px; cursor: pointer;
        border: 1px solid transparent; line-height: 1.4; font-size: 12px;
      }
      #tm-outline-pro .tm-item:hover { background: rgba(255,255,255,.08); }
      #tm-outline-pro .tm-item.tm-active { background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.1); }
      #tm-outline-pro .tm-index { opacity: .6; text-align: right; font-variant-numeric: tabular-nums; font-size: 11px; padding-top: 1px;}
      #tm-outline-pro .tm-text { word-break: break-word; opacity: .95; }
      #tm-outline-pro .tm-meta { margin-top: 4px; font-size: 10px; opacity: .5; display: flex; gap: 10px; }

      /* 底部 */
      #tm-outline-pro .tm-footer {
        padding: 10px; border-top: 1px solid rgba(255,255,255,.10); display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0;
      }
      #tm-outline-pro.tm-collapsed .tm-footer { display: none; }
      #tm-outline-pro .tm-footer .tm-btn { width: auto; padding: 0 10px; font-size: 11px; flex: 1; }

      /* 拖拽条：位于左侧 */
      #tm-outline-pro .tm-resizer {
        position: absolute; left: -6px; top: 0; width: 12px; height: 100%; cursor: ew-resize; z-index: 10;
      }
      /* 视觉提示线 */
      #tm-outline-pro .tm-resizer::after {
        content: ""; position: absolute; left: 6px; top: 0; width: 1px; height: 100%;
        background: transparent; transition: background 0.2s;
      }
      #tm-outline-pro .tm-resizer:hover::after { background: rgba(255,255,255,.3); }

      /* === 核心：页面分屏适应 (Squeeze) === */
      /* 给 body 加右内边距，利用 Flex 布局的自适应特性 */
      body.tm-outline-pro-on {
        padding-right: ${width}px !important;
        transition: padding-right 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
        box-sizing: border-box; /* 确保 padding 计入总宽 */
      }

      body.tm-outline-pro-on.tm-outline-pro-collapsed {
        padding-right: ${collapsedWidthCSS} !important;
      }

      /* 闪烁高亮 */
      .tm-outline-flash {
        outline: 2px solid rgba(255,255,255,.65) !important; border-radius: 6px;
        animation: tmOutlineFlash 1.2s ease-in-out 1;
      }
      @keyframes tmOutlineFlash { 0%{outline-color:rgba(255,255,255,.85)} 100%{outline-color:rgba(255,255,255,0)} }

      /* 右键菜单 */
      #tm-outline-menu {
        position: fixed; z-index: 2147483647; background: rgba(30,30,30,.98);
        border: 1px solid rgba(255,255,255,.15); border-radius: 8px; min-width: 160px; padding: 4px; display: none;
        box-shadow: 0 4px 12px rgba(0,0,0,.4); color: #fff; backdrop-filter: blur(10px);
      }
      #tm-outline-menu .m-item {
        padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; color: #eee;
      }
      #tm-outline-menu .m-item:hover { background: rgba(255,255,255,.15); color: #fff; }
    `);

    const ph = document.createElement('div');
    ph.id = styleId;
    ph.style.display = 'none';
    document.documentElement.appendChild(ph);
  }

  /***********************
   * 状态
   ***********************/
  const state = {
    items: [],
    collapsed: CONFIG.collapsed,
    activeId: null,
    searchTokens: [],
    closed: false, // 是否被用户完全关闭
  };

  function applyModeClasses() {
    if (state.closed) {
        document.body.classList.remove('tm-outline-pro-on', 'tm-outline-pro-collapsed');
        return;
    }
    document.body.classList.add('tm-outline-pro-on');
    document.body.classList.toggle('tm-outline-pro-collapsed', state.collapsed);
  }

  /***********************
   * UI 构建
   ***********************/
  function ensureRootInDom() {
    if (state.closed) return;
    const root = document.getElementById('tm-outline-pro');
    if (!root) return;
    if (!document.body) return;
    if (!document.body.contains(root)) document.body.appendChild(root);
  }

  function createRoot() {
    if (state.closed) return null;

    let root = document.getElementById('tm-outline-pro');
    if (root) {
      ensureRootInDom();
      return root;
    }

    mountStyle();

    root = el('div', { id: 'tm-outline-pro' });

    const header = el('div', { class: 'tm-header' });

    // 按钮组
    const btnToggle = el('button', { class: 'tm-btn', 'data-act': 'toggle', title: '折叠/展开 (Alt+O)', text: '☰' });
    const btnRefresh = el('button', { class: 'tm-btn', 'data-act': 'refresh', title: '刷新目录', text: '↻' });
    const btnClose = el('button', { class: 'tm-btn tm-btn-close', 'data-act': 'close', title: '关闭插件', text: '✕' });

    const title = el('div', { class: 'tm-title', text: '提问目录' });
    const resizer = el('div', { class: 'tm-resizer', title: '拖拽调整宽度' });

    header.append(btnToggle, btnRefresh, title, btnClose, resizer);

    const body = el('div', { class: 'tm-body' });
    const search = el('input', { class: 'tm-search', placeholder: '搜索...' });
    const list = el('div', { class: 'tm-list' });
    body.append(search, list);

    const footer = el('div', { class: 'tm-footer' });
    const btnPrev = el('button', { class: 'tm-btn', 'data-act': 'prev', title: 'Alt+↑', text: '↑' });
    const btnNext = el('button', { class: 'tm-btn', 'data-act': 'next', title: 'Alt+↓', text: '↓' });
    const btnTop = el('button', { class: 'tm-btn', 'data-act': 'top', text: 'Top' });
    footer.append(btnPrev, btnNext, btnTop);

    root.append(header, body, footer);

    (document.body || document.documentElement).appendChild(root);

    applyModeClasses();
    root.classList.toggle('tm-collapsed', state.collapsed);

    // 事件委托
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'toggle') toggleCollapsed();
      if (act === 'refresh') rebuild();
      if (act === 'close') closeSidebar(); // 新增关闭
      if (act === 'prev') { jumpRelative(-1); }
      if (act === 'next') { jumpRelative(1); }
      if (act === 'top') { jumpToFirstQuestion(); }
    });

    search.addEventListener('input', () => {
      const v = search.value.trim().toLowerCase();
      state.searchTokens = v ? v.split(/\s+/).filter(Boolean) : [];
      renderList();
    });

    setupResizer(root);
    ensureContextMenu();

    const guard = new MutationObserver(() => ensureRootInDom());
    guard.observe(document.documentElement, { childList: true, subtree: true });

    return root;
  }

  function toggleCollapsed() {
    state.collapsed = !state.collapsed;
    CONFIG = store.set({ collapsed: state.collapsed });

    const root = document.getElementById('tm-outline-pro');
    if (root) root.classList.toggle('tm-collapsed', state.collapsed);

    // 更新 Body Padding
    applyModeClasses();
  }

  function closeSidebar() {
    if (!confirm('确定要关闭提问目录吗？\n(刷新页面后可重新加载)')) return;
    state.closed = true;
    const root = document.getElementById('tm-outline-pro');
    if (root) root.remove();
    // 移除 body 上的 squeeze 效果
    document.body.classList.remove('tm-outline-pro-on', 'tm-outline-pro-collapsed');
    // 移除样式标签
    document.getElementById('tm-outline-pro-style')?.remove();
  }

  function setupResizer(root) {
    const resizer = root.querySelector('.tm-resizer');
    let dragging = false;
    let startX = 0;
    let startW = 0;

    const onMove = (e) => {
      if (!dragging) return;
      // 右侧拖拽：往左拖动(dx < 0)是增加宽度
      const dx = startX - e.clientX;
      CONFIG = store.set({ width: clamp(startW + dx, 220, 600) });
      mountStyle(); // 重新生成样式以更新 padding
      applyModeClasses(); // 确保 body class 对应
    };

    const onUp = () => {
      dragging = false;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    resizer.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      startW = CONFIG.width;
      document.body.style.cursor = 'ew-resize';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  /***********************
   * 右键菜单
   ***********************/
  function ensureContextMenu() {
    let menu = document.getElementById('tm-outline-menu');
    if (menu) return menu;

    menu = document.createElement('div');
    menu.id = 'tm-outline-menu';

    const mi1 = document.createElement('div');
    mi1.className = 'm-item';
    mi1.setAttribute('data-act', 'copy');
    mi1.textContent = '复制内容';

    const mi2 = document.createElement('div');
    mi2.className = 'm-item';
    mi2.setAttribute('data-act', 'copylink');
    mi2.textContent = '复制链接';

    menu.append(mi1, mi2);
    (document.body || document.documentElement).appendChild(menu);

    document.addEventListener('click', hideMenu);
    window.addEventListener('scroll', hideMenu, { passive: true });

    menu.addEventListener('click', async (e) => {
      const item = e.target.closest('.m-item');
      if (!item) return;
      const act = item.getAttribute('data-act');
      const id = menu.getAttribute('data-id');
      const target = state.items.find(x => x.id === id);
      if (!target) return;

      if (act === 'copy') await navigator.clipboard.writeText(target.fullText || target.title || '');
      if (act === 'copylink') {
        const url = new URL(location.href);
        url.hash = `tmq=${encodeURIComponent(id)}`;
        await navigator.clipboard.writeText(url.toString());
      }
      hideMenu();
    });

    return menu;
  }

  function showMenu(x, y, id) {
    const menu = ensureContextMenu();
    menu.setAttribute('data-id', id);
    // 防止菜单溢出屏幕右侧
    const w = 160;
    const finalX = (x + w > window.innerWidth) ? (x - w) : x;
    menu.style.left = `${finalX}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
  }

  function hideMenu() {
    const menu = document.getElementById('tm-outline-menu');
    if (menu) menu.style.display = 'none';
  }

  /***********************
   * 列表渲染
   ***********************/
  function getFilteredItems() {
    const tokens = state.searchTokens;
    if (!tokens.length) return state.items;
    return state.items.filter(x => {
      const hay = (x.fullText || x.title).toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
  }

  function renderList() {
    const root = createRoot();
    if (!root) return;
    const list = root.querySelector('.tm-list');
    const items = getFilteredItems();
    const tokens = state.searchTokens;

    clearNode(list);

    for (let i = 0; i < items.length; i++) {
      const x = items[i];

      const item = document.createElement('div');
      item.className = `tm-item ${x.id === state.activeId ? 'tm-active' : ''}`;
      item.setAttribute('data-id', x.id);
      item.title = x.fullText || '';

      const idx = document.createElement('div');
      idx.className = 'tm-index';
      idx.textContent = String(i + 1);

      const main = document.createElement('div');
      main.className = 'tm-main';

      const text = document.createElement('div');
      text.className = 'tm-text';
      appendHighlightedText(text, x.title, tokens);

      const meta = document.createElement('div');
      meta.className = 'tm-meta';
      const span = document.createElement('span');
      span.textContent = `${x.chars}字`;
      meta.appendChild(span);

      main.append(text, meta);
      item.append(idx, main);

      item.addEventListener('click', () => jumpTo(x.id));
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY, x.id);
      });

      list.appendChild(item);
    }
  }

  function setActive(id) {
    state.activeId = id;
    renderList();
  }

  /***********************
   * 核心功能：跳转
   ***********************/
  function ensureAnchorId(el0, idx) {
    if (!el0) return `tmq-${idx}`;
    let id = el0.getAttribute('data-tm-qid');
    if (!id) {
      id = `tmq-${Date.now()}-${idx}`;
      el0.setAttribute('data-tm-qid', id);
    }
    return id;
  }

  function jumpTo(id) {
    const item = state.items.find(x => x.id === id);
    if (!item?.el) return;

    const url = new URL(location.href);
    url.hash = `tmq=${encodeURIComponent(id)}`;
    history.replaceState(null, '', url.toString());

    const adapter = getAdapter();
    const startEl = adapter ? adapter.getStartEl(item) : (item.startEl || item.el);

    startEl.scrollIntoView({
      behavior: CONFIG.scrollBehavior,
      block: 'start',
      inline: 'nearest',
    });

    if (CONFIG.scrollOffset) {
      setTimeout(() => { try { window.scrollBy(0, -CONFIG.scrollOffset); } catch {} }, 0);
    }

    setActive(id);

    item.el.classList.add('tm-outline-flash');
    setTimeout(() => item.el.classList.remove('tm-outline-flash'), 1300);
  }

  function jumpRelative(delta) {
    const visible = getFilteredItems();
    if (!visible.length) return;
    let idx = visible.findIndex(x => x.id === state.activeId);
    if (idx === -1) idx = 0;
    idx = clamp(idx + delta, 0, visible.length - 1);
    jumpTo(visible[idx].id);
  }

  function jumpToFirstQuestion() {
    const first = state.items[0];
    if (first) jumpTo(first.id);
  }

  /***********************
   * 数据重建
   ***********************/
  function rebuild() {
    if (state.closed) return;
    createRoot();

    const adapter = getAdapter();
    if (!adapter) return;

    const extracted = adapter.extractQuestions();
    state.items = extracted.map((x, idx) => {
      const id = ensureAnchorId(x.el, idx);
      const title = truncate(x.fullText, CONFIG.maxTitleLength);
      return {
        id,
        title,
        fullText: x.fullText,
        el: x.el,
        startEl: x.startEl,
        chars: x.fullText.length,
      };
    });

    if (!state.activeId || !state.items.some(x => x.id === state.activeId)) {
      state.activeId = state.items[0]?.id || null;
    }

    renderList();
    autoJumpFromHash();
  }

  const rebuildDebounced = debounce(rebuild, CONFIG.rebuildDebounceMs);

  /***********************
   * 杂项
   ***********************/
  let hashJumped = false;
  function autoJumpFromHash() {
    if (hashJumped) return;
    const m = location.hash.match(/tmq=([^&]+)/);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    if (state.items.some(x => x.id === id)) {
      hashJumped = true;
      setTimeout(() => jumpTo(id), 250);
    }
  }

  function setupMutationObserver() {
    const root = findConversationRoot();
    const mo = new MutationObserver(() => rebuildDebounced());
    mo.observe(root, { childList: true, subtree: true });
  }

  function setupScrollTracking() {
    window.addEventListener('scroll', debounce(() => {
      if (!state.items.length || state.closed) return;
      const centerY = window.innerHeight * 0.35;
      let best = null;
      let bestDist = Infinity;
      for (const item of state.items) {
        const rect = item.el.getBoundingClientRect();
        const dist = Math.abs(rect.top - centerY);
        if (rect.bottom > 0 && rect.top < window.innerHeight && dist < bestDist) {
          bestDist = dist;
          best = item;
        }
      }
      if (best && best.id !== state.activeId) setActive(best.id);
    }, 120), { passive: true });
  }

  function setupSpaHook() {
    const _push = history.pushState;
    const _replace = history.replaceState;
    const onRouteChange = () => {
      setTimeout(() => {
        rebuild();
      }, 650);
    };
    history.pushState = function () { _push.apply(this, arguments); onRouteChange(); };
    history.replaceState = function () { _replace.apply(this, arguments); onRouteChange(); };
    window.addEventListener('popstate', onRouteChange);
  }

  function setupHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (state.closed) return;
      if (!e.altKey) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); jumpRelative(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); jumpRelative(1); }
      else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const input = document.querySelector('#tm-outline-pro .tm-search');
        input?.focus();
      } else if (e.key.toLowerCase() === 'o') {
        e.preventDefault(); toggleCollapsed();
      }
    });
  }

  async function init() {
    if (!getAdapter()) return;
    for (let i = 0; i < 60; i++) {
      if (findConversationRoot()) break;
      await sleep(200);
    }
    rebuild();
    setupMutationObserver();
    setupScrollTracking();
    setupSpaHook();
    setupHotkeys();
  }

  init();
})();
# 注：本脚本从 @arschlochnop (Modified)大佬的代码改动之后来，源地址为 https://greasyfork.org/en/scripts/562020/
