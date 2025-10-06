// ==UserScript==
// @name         US Job Sponsorship Alarm / 招聘页面关键词预警
// @namespace    thomastakovich.keyword.alarm
// @version      1.1.0
// @description  Highlight & alert on sponsorship/citizenship/clearance terms. Top-center banner. Auto-reset on job change.（检测限制词，顶部居中提示；切换职位先关闭旧alarm再扫描）
// @match        *://*.linkedin.com/*
// @match        *://*.indeed.com/*
// @match        *://*.glassdoor.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  /*** ----------------------------- Site Detect 站点识别 ------------------------------ ***/
  const host = location.hostname;
  const SITE =
    /(^|\.)(linkedin)\.com$/i.test(host) ? "linkedin" :
    /(^|\.)(indeed)\.com$/i.test(host) ? "indeed" :
    /(^|\.)(glassdoor)\.com$/i.test(host) ? "glassdoor" :
    null;
  if (!SITE) return;

  /*** -------------------------- Content Containers 正文容器 -------------------------- ***/
  const SITE_SELECTORS = {
    linkedin: [
      'div[data-test-id="job-details"]',
      "section.jobs-description",
      "div.jobs-description__container",
      "div.show-more-less-html__markup",
      "div.jobs-description-content__text",
      "div.jobs-box__html-content",
      "div.jobs-details__main-content",
      "div.jobs-search__job-details--container"
    ],
    indeed: [
      "#jobDescriptionText",
      ".jobsearch-jobDescriptionText",
      '[data-testid="jobsearch-JobComponent-description"]',
      "#mosaic-jobContent",
      'div[id^="jobDescriptionText"]'
    ],
    glassdoor: [
      '[class^="TwoColumnLayout_columnRight__"] [data-test="jobDescriptionContent"]',
      '[class^="TwoColumnLayout_columnRight__"] [data-test="jobDescriptionText"]',
      '[class^="TwoColumnLayout_columnRight__"] div.jobDescriptionContent',
      '[class^="TwoColumnLayout_columnRight__"] div.jobDescription',
      '[class^="TwoColumnLayout_columnRight__"]'
    ]
  };

  function findScanContainer() {
    const sels = SITE_SELECTORS[SITE] || [];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return document.body || document.documentElement;
  }

  /*** -------------------------- Keywords 关键词 -------------------------- ***/
  const LS_KEY = `__keyword_alarm_list__:${SITE}`;
  const KEYWORDS_DEFAULT = [
    "sponsorship","sponsor","visa","citizen","citizens",
    "citizenship","clearance","clearence","top secret",
    "ts","sci","ts/sci","ts sci","polygraph","export",
    "dod","be authorized"
  ];
  let KEYWORDS = JSON.parse(localStorage.getItem(LS_KEY) || "null") || KEYWORDS_DEFAULT.slice();

  /*** ------------------------------ Regex 正则 ------------------------------ ***/
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function phraseToPattern(kw) {
    kw = kw.replace(/\bu\.?\s*s\.?\b/gi, "us");
    kw = kw.replace(/ts\s*\/\s*sci/gi, "ts\\s*\\/?\\s*sci");
    const parts = kw.trim().split(/\s+/).map(esc);
    return `(?:\\b${parts.join("\\s+")}\\b)`;
  }
  function buildRegex(list) {
    const patterns = list.map(phraseToPattern);
    return new RegExp(patterns.join("|"), "gi");
  }
  let PATTERN = buildRegex(KEYWORDS);

  /*** --------------------------- Style 样式注入 --------------------------- ***/
  let __kwStyleInjected = false;
  function ensureStyleInjected() {
    if (__kwStyleInjected) return;
    const style = document.createElement("style");
    style.setAttribute("data-kw-alarm-style", "1");
    style.textContent = `
      mark.kw-alarm-mark {
        background: yellow !important;
        color: inherit !important;
        font-weight: 700 !important;
        padding: 0 .15em !important;
        border-radius: .15em !important;
      }
    `;
    document.documentElement.appendChild(style);
    __kwStyleInjected = true;
  }

  /*** ------------------------------- UI 提示条 ------------------------------- ***/
  let bannerEl = null;

  function showBanner(foundMap) {
    const totalHits = [...foundMap.values()].reduce((a, b) => a + b, 0);
    const topList = [...foundMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => `${k} ×${v}`);

    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.id = "kw-alarm-banner";
      document.body.appendChild(bannerEl);
    }

    Object.assign(bannerEl.style, {
      position: "fixed",
      left: "50%",
      top: "16px",
      transform: "translateX(-50%)",
      zIndex: 999999,
      background: "#b00020",
      color: "#fff",
      padding: "12px 16px",
      borderRadius: "12px",
      boxShadow: "0 4px 14px rgba(0,0,0,.25)",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      maxWidth: "70vw",
      lineHeight: "1.4",
      fontSize: "14px",
      textAlign: "left"
    });

    bannerEl.innerHTML = "";

    const rowTop = document.createElement("div");
    rowTop.style.display = "flex";
    rowTop.style.gap = "8px";
    rowTop.style.alignItems = "center";
    rowTop.style.justifyContent = "space-between";

    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.textContent = `⚠️ Found restricted terms: ${totalHits}  /  发现限制类词汇：${totalHits} 处`;

    const btnWrap = document.createElement("div");
    const mkBtn = (txt, tip, onClick, fs = 16) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.title = tip || "";
      Object.assign(b.style, {
        cursor: "pointer", background: "transparent", color: "#fff",
        border: "none", fontSize: `${fs}px`, lineHeight: "18px", marginLeft: "10px"
      });
      b.onclick = onClick;
      return b;
    };
    const gearBtn  = mkBtn("⚙️", "编辑关键词 / Edit keywords", () => editKeywords());
    const closeBtn = mkBtn("×", "关闭", () => hideBanner(), 18);
    btnWrap.appendChild(gearBtn);
    btnWrap.appendChild(closeBtn);

    rowTop.appendChild(title);
    rowTop.appendChild(btnWrap);

    const list = document.createElement("div");
    list.style.marginTop = "6px";
    list.textContent = `Examples 示例：${topList.join(" · ")}`;

    const hint = document.createElement("div");
    hint.style.marginTop = "6px";
    hint.style.opacity = "0.9";
    hint.style.fontSize = "12px";
    hint.textContent = "Highlighted in yellow on page. Click ⚙️ to customize keywords. / 页面已用黄色高亮。点击 ⚙️ 可自定义关键词。";

    bannerEl.appendChild(rowTop);
    bannerEl.appendChild(list);
    bannerEl.appendChild(hint);
  }

  function hideBanner() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }

  function editKeywords() {
    const current = KEYWORDS.join("\n");
    const input = prompt(
      "One keyword/phrase per line (case-insensitive).\n一行一个关键词/短语（不区分大小写）。\n\n" +
      "Tip: phrases support multi-space/line breaks.\n提示：短语允许中间有多个空格或换行。",
      current
    );
    if (input == null) return;
    const arr = input.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (arr.length === 0) {
      alert("Keyword list cannot be empty. 关键词列表不能为空。");
      return;
    }
    KEYWORDS = arr;
    localStorage.setItem(LS_KEY, JSON.stringify(KEYWORDS));
    PATTERN = buildRegex(KEYWORDS);
    forceScanSoon(0);
  }

  /*** ----------------------------- Highlighter 高亮 ----------------------------- ***/
  function cleanupMarks(root) {
    if (!root) return;
    const marks = root.querySelectorAll("mark.kw-alarm-mark");
    for (const m of marks) {
      const parent = m.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    }
  }

  function highlightMatches(root, regex) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const t = node.nodeValue;
          if (!t || !t.trim()) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = p.tagName;
          if (["SCRIPT","STYLE","NOSCRIPT"].includes(tag)) return NodeFilter.FILTER_REJECT;
          if (p.isContentEditable) return NodeFilter.FILTER_REJECT;
          if (p.closest("mark.kw-alarm-mark")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const textNode of nodes) {
      const text = textNode.nodeValue;
      regex.lastIndex = 0;
      if (!regex.test(text)) continue;
      regex.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const [hit] = match;
        const start = match.index;
        const end   = start + hit.length;

        const before = text.slice(lastIndex, start);
        if (before) frag.appendChild(document.createTextNode(before));

        const mark = document.createElement("mark");
        mark.className = "kw-alarm-mark";
        mark.textContent = hit;
        Object.assign(mark.style, {
          padding: "0 .15em",
          borderRadius: ".15em",
          background: "yellow",
          fontWeight: "700"
        });
        frag.appendChild(mark);

        lastIndex = end;
      }
      const after = text.slice(lastIndex);
      if (after) frag.appendChild(document.createTextNode(after));

      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  function countMatches(text, regex) {
    const found = new Map();
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const key = String(m[0]).toLowerCase();
      found.set(key, (found.get(key) || 0) + 1);
      if (found.size > 1000) break;
    }
    return found;
  }

  /*** ------------------------------- Scan 扫描引擎 ------------------------------- ***/
  let lastTextFingerprint = "";
  let scanTimer = null;
  let lastContainerEl = null;
  let lastUrlKey = location.href;

  function fingerprint(str) {
    return `${str.length}|${str.slice(0, 200)}|${str.slice(-200)}`;
  }

  function resetForNavigation() {
    hideBanner();
    if (lastContainerEl) cleanupMarks(lastContainerEl);
    lastTextFingerprint = "";
  }

  function scanNow() {
    const container = findScanContainer();

    if (container && container !== lastContainerEl) {
      resetForNavigation();
      lastContainerEl = container;
    }

    if (!container) return;

    const text = (container.innerText || "").trim();
    const fp = fingerprint(text);

    if (fp === lastTextFingerprint) return;
    lastTextFingerprint = fp;

    const foundMap = countMatches(text, PATTERN);

    cleanupMarks(container);
    ensureStyleInjected();

    if (foundMap.size > 0) {
      highlightMatches(container, PATTERN);
      showBanner(foundMap);
      if (ENABLE_BEEP) beepOnce();
    } else {
      hideBanner();
    }
  }

  function forceScanSoon(delay = 120) {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scanNow, delay);
  }

  /*** ------------------------------ SPA Hooks 单页应用钩子 ------------------------------ ***/
  const mo = new MutationObserver(() => {
    // DOM 变化，稍作节流后扫描
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scanNow, 300);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  const _ps = history.pushState;
  const _rs = history.replaceState;
  history.pushState = function () {
    const r = _ps.apply(this, arguments);
    if (location.href !== lastUrlKey) {
      lastUrlKey = location.href;
      resetForNavigation();
      forceScanSoon(0);
    }
    return r;
  };
  history.replaceState = function () {
    const r = _rs.apply(this, arguments);
    if (location.href !== lastUrlKey) {
      lastUrlKey = location.href;
      resetForNavigation();
      forceScanSoon(0);
    }
    return r;
  };
  window.addEventListener("popstate", () => {
    if (location.href !== lastUrlKey) {
      lastUrlKey = location.href;
      resetForNavigation();
      forceScanSoon(0);
    }
  });

  window.addEventListener("load",   () => forceScanSoon(200));
  window.addEventListener("scroll", () => forceScanSoon(600));
  window.addEventListener("resize", () => forceScanSoon(800));

  /*** ------------------------------ Beep 蜂鸣 ------------------------------ ***/
  let ENABLE_BEEP = false; // 控制台可切换：ENABLE_BEEP=true
  function beepOnce() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 880;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.start(); o.stop(ctx.currentTime + 0.26);
    } catch (_) {}
  }

  /*** ------------------------------ Debug 调试 ------------------------------ ***/
  // 控制台：
  //   ENABLE_BEEP = false;                      // 静音
  //   resetForNavigation(); forceScanSoon(0);   // 手动重置并重扫
})();
