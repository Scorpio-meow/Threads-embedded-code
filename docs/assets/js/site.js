// 介紹頁的共用互動：主題切換、導覽選單、捲動顯示、分頁、複製按鈕、程式碼上色與版本資訊。
(() => {
  const root = document.documentElement;
  const { repo, branch } = root.dataset;

  // 其他腳本（互動示範）透過這個物件取得專案原始檔位置，避免各自組網址。
  window.ThreadsSaverSite = Object.freeze({
    branch,
    rawFileUrl: (path) => `https://raw.githubusercontent.com/${repo}/${branch}/${path}`,
    announce
  });

  const liveRegion = createLiveRegion();

  setupThemeToggle();
  setupMenu();
  setupNavState();
  setupReveal();
  document.querySelectorAll('[data-tabs]').forEach(setupTabs);
  setupCopyButtons();
  highlightCode();
  loadManifestFields();

  function createLiveRegion() {
    const region = document.createElement('div');
    region.className = 'sr-only';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
    return region;
  }

  function announce(message) {
    liveRegion.textContent = '';
    requestAnimationFrame(() => {
      liveRegion.textContent = message;
    });
  }

  function setupThemeToggle() {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const effectiveTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
    const sync = () => button.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));

    button.addEventListener('click', () => {
      const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem('theme', next);
      } catch (_) {
        // 無法寫入時只影響下次造訪，這次的切換仍然有效。
      }
      sync();
    });
    systemDark.addEventListener('change', sync);
    sync();
  }

  function setupMenu() {
    const nav = document.querySelector('[data-nav]');
    const toggle = nav?.querySelector('[data-menu-toggle]');
    const menu = nav?.querySelector('[data-menu]');
    if (!toggle || !menu) return;

    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
    const setOpen = (open) => {
      nav.dataset.menuOpen = String(open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
    };

    toggle.addEventListener('click', () => setOpen(!isOpen()));
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (isOpen() && !nav.contains(event.target)) setOpen(false);
    });
    // 切換按鈕在寬螢幕由 CSS 隱藏；它一消失就收起選單，斷點只需要寫在 CSS 裡。
    new ResizeObserver(() => {
      if (isOpen() && toggle.offsetParent === null) setOpen(false);
    }).observe(document.body);
  }

  function setupNavState() {
    const nav = document.querySelector('[data-nav]');
    if (!nav) return;
    const sentinel = document.createElement('div');
    sentinel.className = 'nav-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    document.body.prepend(sentinel);
    new IntersectionObserver(([entry]) => {
      nav.dataset.scrolled = String(!entry.isIntersecting);
    }).observe(sentinel);
  }

  function setupReveal() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -10% 0px' }
    );
    document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
  }

  function setupTabs(container) {
    const tablist = container.querySelector('[role="tablist"]');
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];

    const select = (tab, moveFocus) => {
      tabs.forEach((candidate) => {
        const selected = candidate === tab;
        candidate.setAttribute('aria-selected', String(selected));
        candidate.tabIndex = selected ? 0 : -1;
        document.getElementById(candidate.getAttribute('aria-controls')).hidden = !selected;
      });
      if (moveFocus) tab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (event) => {
        const targets = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
        if (!(event.key in targets)) return;
        event.preventDefault();
        select(tabs[(targets[event.key] + tabs.length) % tabs.length], true);
      });
    });
  }

  function setupCopyButtons() {
    const FEEDBACK_MS = 1800;
    document.querySelectorAll('[data-copy]').forEach((button) => {
      const source = document.getElementById(button.dataset.copy);
      const idleLabel = button.getAttribute('aria-label');
      let resetTimer;

      button.addEventListener('click', async () => {
        clearTimeout(resetTimer);
        try {
          await navigator.clipboard.writeText(source.textContent.trim());
          button.dataset.copied = 'true';
          announce('已複製到剪貼簿');
        } catch (error) {
          button.dataset.copied = 'false';
          announce('瀏覽器不允許存取剪貼簿，請手動選取文字複製');
          console.warn('[site] 複製失敗：', error);
        }
        resetTimer = setTimeout(() => {
          delete button.dataset.copied;
          button.setAttribute('aria-label', idleLabel);
        }, FEEDBACK_MS);
      });
    });
  }

  // 輕量上色：只標出註解、字串、物件鍵、關鍵字與數字，其餘維持原樣。
  function highlightCode() {
    const KEYWORDS = new Set([
      'async', 'await', 'break', 'catch', 'const', 'continue', 'else', 'for', 'function',
      'if', 'in', 'let', 'new', 'of', 'return', 'try', 'typeof', 'var', 'while'
    ]);
    const TOKEN = /(\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b([A-Za-z_]\w*)\b|\b(\d+(?:\.\d+)?)\b/g;

    document.querySelectorAll('code[data-highlight]').forEach((code) => {
      const text = code.textContent;
      const fragment = document.createDocumentFragment();
      let cursor = 0;

      for (const match of text.matchAll(TOKEN)) {
        const [token, comment, string, word, number] = match;
        let tokenClass = '';
        if (comment) tokenClass = 'tok-comment';
        else if (string) tokenClass = /^\s*:/.test(text.slice(match.index + token.length)) ? 'tok-key' : 'tok-string';
        else if (word && KEYWORDS.has(word)) tokenClass = 'tok-keyword';
        else if (number) tokenClass = 'tok-number';
        if (!tokenClass) continue;

        fragment.append(text.slice(cursor, match.index));
        const span = document.createElement('span');
        span.className = tokenClass;
        span.textContent = token;
        fragment.append(span);
        cursor = match.index + token.length;
      }
      fragment.append(text.slice(cursor));
      code.replaceChildren(fragment);
    });
  }

  // 版本號直接讀取 main 分支的 manifest.json，頁面上不另外維護版本字串；讀不到就保持隱藏。
  async function loadManifestFields() {
    const blocks = document.querySelectorAll('[data-manifest-block]');
    if (blocks.length === 0) return;
    try {
      const response = await fetch(window.ThreadsSaverSite.rawFileUrl('manifest.json'));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      document.querySelectorAll('[data-manifest-field]').forEach((field) => {
        const value = manifest[field.dataset.manifestField];
        if (typeof value !== 'string') throw new Error(`manifest.json 缺少 ${field.dataset.manifestField}`);
        field.textContent = value;
      });
      blocks.forEach((block) => {
        block.hidden = false;
      });
    } catch (error) {
      console.warn('[site] 無法讀取 manifest.json，版本資訊保持隱藏：', error);
    }
  }
})();
