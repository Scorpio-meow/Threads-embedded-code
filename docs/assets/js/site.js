(() => {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const { repo, branch } = root.dataset;
  const textSegmenter = new Intl.Segmenter('zh-TW', { granularity: 'grapheme' });
  window.ThreadsSaverSite = Object.freeze({
    branch,
    rawFileUrl: (path) => `https://raw.githubusercontent.com/${repo}/${branch}/${path}`,
    announce,
    streamText
  });
  const liveRegion = createLiveRegion();
  syncThemedImages();
  systemDark.addEventListener('change', syncThemedImages);
  setupThemeToggle();
  setupDemoVideos();
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
  function streamText(target, text) {
    const spoken = document.createElement('span');
    spoken.className = 'sr-only';
    spoken.textContent = text;
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    let index = 0;
    for (const { segment } of textSegmenter.segment(text)) {
      const char = document.createElement('span');
      char.className = 'stream-char';
      char.style.setProperty('--char-index', index++);
      char.textContent = segment;
      visual.append(char);
    }
    target.replaceChildren(spoken, visual);
  }
  function syncThemedImages() {
    const theme = root.dataset.theme;
    const media = theme === 'dark' ? 'all' : theme === 'light' ? 'not all' : '(prefers-color-scheme: dark)';
    const dark = theme ? theme === 'dark' : systemDark.matches;
    document.querySelectorAll('source[data-dark-source]').forEach((source) => {
      if (source.media !== media) source.media = media;
    });
    document.querySelectorAll('video[data-dark-poster]').forEach((video) => {
      const poster = dark ? video.dataset.darkPoster : video.dataset.lightPoster;
      if (video.getAttribute('poster') !== poster) video.poster = poster;
      const wanted = video.querySelector(dark ? 'source[data-dark-source]' : 'source:not([data-dark-source])').src;
      if (!video.currentSrc || video.currentSrc === wanted) return;
      const resume = !video.paused;
      video.load();
      if (resume) video.play().catch(() => { });
    });
  }
  function setupDemoVideos() {
    document.querySelectorAll('[data-demo-video]').forEach((video) => {
      const toggle = video.parentElement.querySelector('[data-video-toggle]');
      const label = toggle.querySelector('[data-video-toggle-label]');
      const icon = toggle.querySelector('use');
      let visible = false;
      let userPaused = false;
      const render = () => {
        const playing = !video.paused;
        label.textContent = playing ? '暫停示範' : '播放示範';
        icon.setAttribute('href', `assets/icons.svg#${playing ? 'i-pause' : 'i-play'}`);
      };
      const autoplay = () => {
        if (visible && !userPaused && !reduceMotion.matches) video.play().catch(() => { });
        else if (!visible || reduceMotion.matches) video.pause();
      };
      toggle.addEventListener('click', () => {
        userPaused = !video.paused;
        if (userPaused) video.pause();
        else video.play().catch(() => { });
      });
      video.addEventListener('play', render);
      video.addEventListener('pause', render);
      reduceMotion.addEventListener('change', autoplay);
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        autoplay();
      }).observe(video);
      toggle.hidden = false;
      render();
    });
  }
  function setupThemeToggle() {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    const effectiveTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
    const sync = () => button.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
    button.addEventListener('click', () => {
      const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem('theme', next);
      } catch (_) { }
      syncThemedImages();
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
    new ResizeObserver(() => {
      if (isOpen() && toggle.offsetParent === null) setOpen(false);
    }).observe(document.body);
  }
  function setupNavState() {
    const nav = document.querySelector('[data-nav]');
    if (!nav) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      const below = document.elementFromPoint(1, nav.getBoundingClientRect().bottom + 1);
      const chapter = below?.closest('[data-chapter]')?.dataset.chapter;
      if (chapter) nav.dataset.chapter = chapter;
      else delete nav.dataset.chapter;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    sync();
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
    const vertical = tablist.getAttribute('aria-orientation') === 'vertical';
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
    const select = (tab, moveFocus) => {
      if (tab.getAttribute('aria-selected') === 'true') {
        if (moveFocus) tab.focus();
        return;
      }
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
      if ('tabsHover' in container.dataset) {
        tab.addEventListener('pointerenter', () => {
          if (canHover.matches) select(tab, false);
        });
      }
      tab.addEventListener('keydown', (event) => {
        const next = vertical ? 'ArrowDown' : 'ArrowRight';
        const previous = vertical ? 'ArrowUp' : 'ArrowLeft';
        const targets = { [next]: index + 1, [previous]: index - 1, Home: 0, End: tabs.length - 1 };
        if (!(event.key in targets)) return;
        event.preventDefault();
        select(tabs[(targets[event.key] + tabs.length) % tabs.length], true);
      });
    });
  }
  function setupCopyButtons() {
    const FEEDBACK_MS = 2500;
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