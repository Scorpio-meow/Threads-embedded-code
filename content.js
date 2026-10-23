if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (!window.__threadsSaverInitialized) {
    window.__threadsSaverInitialized = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } else {
    init();
  }
}
function isExtensionAlive() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  } catch (_) {
    return false;
  }
}
async function safeStorageGet(keys) {
  if (!isExtensionAlive()) return {};
  try {
    return await chrome.storage.local.get(keys);
  } catch (err) {
    if (String(err).includes('Extension context invalidated')) {
      console.warn('[Threadkeep] 擴充功能內容被重新載入，忽略本次讀取');
      return {};
    }
    throw err;
  }
}
async function safeStorageSet(obj) {
  if (!isExtensionAlive()) return;
  try {
    await chrome.storage.local.set(obj);
  } catch (err) {
    if (String(err).includes('Extension context invalidated')) {
      console.warn('[Threadkeep] 擴充功能內容被重新載入，忽略本次寫入');
      return;
    }
    throw err;
  }
}
function getExtensionParentOrigin() {
  if (!isExtensionAlive()) return '';
  try {
    const parentOrigin = location.ancestorOrigins && location.ancestorOrigins[0];
    if (parentOrigin && new URL(parentOrigin).host === chrome.runtime.id) {
      return parentOrigin;
    }
  } catch (_) { }
  return '';
}
function handleEmbedFrameResize() {
  const parentOrigin = getExtensionParentOrigin();
  if (!parentOrigin) return;
  if (location.pathname.includes('/embed') && !document.querySelector('.Embed, [class*="EmbedContainer"]')) {
    window.parent.postMessage({ type: 'THREADS_EMBED_ERROR' }, parentOrigin);
    return;
  }
  const findEmbedElement = () => document.querySelector('.Embed') ||
    document.querySelector('div[class*="Embed"]') ||
    document.querySelector('div[id^="u_0_0_"] > div') ||
    document.querySelector('div[id^="u_"] > div') ||
    document.querySelector('div[id^="u_0_0_"]');
  const getCardHeight = () => {
    const embedEl = findEmbedElement();
    if (embedEl) {
      const rect = embedEl.getBoundingClientRect();
      const h = Math.ceil(rect.height || embedEl.offsetHeight || 0);
      if (h > 50) {
        return h;
      }
    }
    const firstChild = document.body ? document.body.firstElementChild : null;
    if (firstChild) {
      const rect = firstChild.getBoundingClientRect();
      const h = Math.ceil(rect.height || firstChild.offsetHeight || 0);
      if (h > 50) {
        return h;
      }
    }
    return 0;
  };
  let lastReportedHeight = 0;
  let notifyScheduled = false;
  const observedElements = new WeakSet();
  const ro = new ResizeObserver(() => {
    scheduleNotify();
  });
  const observeCardElements = () => {
    [findEmbedElement(), document.body ? document.body.firstElementChild : null].forEach((el) => {
      if (el && !observedElements.has(el)) {
        observedElements.add(el);
        ro.observe(el);
      }
    });
  };
  const notify = () => {
    notifyScheduled = false;
    observeCardElements();
    const h = getCardHeight();
    if (h > 50 && h !== lastReportedHeight) {
      lastReportedHeight = h;
      window.parent.postMessage({
        type: 'THREADS_EMBED_RESIZE',
        height: h
      }, parentOrigin);
    }
  };
  const scheduleNotify = () => {
    if (notifyScheduled) {
      return;
    }
    notifyScheduled = true;
    requestAnimationFrame(notify);
  };
  scheduleNotify();
  if (document.body) {
    const mo = new MutationObserver(scheduleNotify);
    mo.observe(document.body, { childList: true, subtree: true });
  }
}
function init() {
  if (location.pathname.includes('/embed') || window.self !== window.top) {
    handleEmbedFrameResize();
    return;
  }
  if (!document.body) {
    console.warn('[Threadkeep] document.body 不存在，延遲初始化');
    setTimeout(init, 500);
    return;
  }
  if (window.__threadsSaverListening) {
    return;
  }
  window.__threadsSaverListening = true;
  document.addEventListener('click', handleEmbedTriggerClick, true);
  const observer = new MutationObserver(scheduleEmbedDialogCheck);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  scheduleEmbedDialogCheck();
  void trackThemePreference();
}
async function trackThemePreference() {
  const result = await safeStorageGet([THEME_PREFERENCE_KEY]);
  window.__threadsSaverThemePreference = result[THEME_PREFERENCE_KEY];
  if (!isExtensionAlive()) return;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && THEME_PREFERENCE_KEY in changes) {
      window.__threadsSaverThemePreference = changes[THEME_PREFERENCE_KEY].newValue;
    }
  });
}
function isSinglePostPage() {
  const path = window.location.pathname;
  return path.includes('/post/') || /^\/t\/[^\/]+/.test(path);
}
function extractContentFromDOM(container) {
  const pagelet0 = container.querySelector('[data-pagelet="threads_post_page_0"]');
  const postPage0 = pagelet0 && pagelet0.textContent.trim() ? pagelet0 : null;
  const searchRoot = postPage0 || container;
  let rawContainers = Array.from(
    searchRoot.querySelectorAll(
      'span[class*="xo1l8bm"][dir="auto"], ' +
      'span[class*="xi7mnp6"][dir="auto"], ' +
      'div[class*="x1iorvi4"][dir="auto"]'
    )
  );
  if (rawContainers.length === 0) {
    rawContainers = Array.from(
      searchRoot.querySelectorAll(
        'div[data-pagelet="threads_post_page_0"] div[dir="auto"], ' +
        'div[dir="auto"]'
      )
    );
  }
  const candidateContainers = rawContainers.filter(el => {
    if (el.closest('h1') || el.closest('h2') || el.closest('h3') || el.closest('[aria-label="直欄標題"]')) return false;
    if (el.closest('button') || el.closest('[role="button"]')) return false;
    if (el.closest('[contenteditable="true"]')) return false;
    if (el.closest('time') || el.querySelector('time')) return false;
    if (el.closest('a[href*="/post/"]') || el.closest('a[href*="/t/"]') || el.querySelector('a[href*="/post/"]') || el.querySelector('a[href*="/t/"]')) return false;
    if (el.closest('a[href*="/@"]')) return false;
    if (el.closest('a[href*="/search"]')) return false;
    if (el.closest('picture') || el.closest('video') || el.closest('canvas') || el.closest('[aria-roledescription="slide"]') || el.querySelector('img:not([aria-hidden="true"]), video, picture, canvas')) return false;
    if (el.closest('.x6s0dn4.xmixu3c.x78zum5.xsag5q8.x1y1aw1k')) return false;
    if (!postPage0 && !el.closest('[data-pressable-container]')) return false;
    let parent = el.parentElement;
    while (parent && parent !== searchRoot) {
      const text = parent.textContent;
      if (text.includes('在貼文中提及') && text.includes('@meta.ai') && text.includes('即可在這裡獲得解答')) {
        return false;
      }
      parent = parent.parentElement;
    }
    return true;
  });
  const replyBoundary = !postPage0
    ? candidateContainers.find(el => /^回覆.+[…\.]{1,3}$/.test(el.textContent.trim()))
    : null;
  const beforeReply = replyBoundary
    ? candidateContainers.filter(el =>
      el.compareDocumentPosition(replyBoundary) & Node.DOCUMENT_POSITION_FOLLOWING
    )
    : candidateContainers;
  const topContainers = beforeReply.filter(el =>
    !beforeReply.some(other => other !== el && other.contains(el))
  );
  const candidates = topContainers
    .map(el => {
      const clone = el.cloneNode(true);
      const childButtons = clone.querySelectorAll('button, [role="button"]');
      for (const btn of childButtons) {
        const btnText = (btn.innerText || btn.textContent || '').trim();
        if (
          isLikelyThreadsFallbackDescription(btnText) ||
          /^(?:查看|隱藏)?翻譯$/i.test(btnText) ||
          /^(?:See|Hide)?\s*translation$/i.test(btnText) ||
          /^查看原文$/i.test(btnText)
        ) {
          btn.remove();
        }
      }
      return (clone.innerText || clone.textContent || '').trim();
    })
    .map(text => cleanExtractedPostContent(text))
    .filter(text => text && !isLikelyThreadsFallbackDescription(text))
    .filter((text, index, array) => array.indexOf(text) === index);
  return cleanExtractedPostContent(candidates.join('\n\n'));
}
function cleanExtractedPostContent(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let cleaned = rawText
    .replace(/[\u00a0\u2000-\u200b\u2028\u2029]/g, ' ')
    .replace(/(?:[\r\n\s])*\b\d+\s*[\r\n\s]*[\/／]\s*[\r\n\s]*\d+\b(?:\s*[•·]\s*[\u4e00-\u9fa5\w]+)?\s*$/g, '')
    .replace(/^\s*\b\d+\s*[\r\n\s]*[\/／]\s*[\r\n\s]*\d+\b(?:\s*[•·]\s*[\u4e00-\u9fa5\w]+)?(?:[\r\n\s])*/g, '')
    .replace(/(?:[\r\n\s])*(?:查看|隱藏)?翻譯\s*$/g, '')
    .replace(/(?:[\r\n\s])*(?:See|Hide)?\s*translation\s*$/gi, '')
    .replace(/(?:[\r\n\s])*查看原文\s*$/g, '')
    .trim();
  const lines = cleaned.split(/\r?\n/);
  const filteredLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1] !== '') {
        filteredLines.push('');
      }
      continue;
    }
    if (isLikelyThreadsFallbackDescription(line)) {
      continue;
    }
    if (/^[\/／]$/.test(line)) {
      if (filteredLines.length > 0 && /^\d+$/.test(filteredLines[filteredLines.length - 1].trim())) {
        filteredLines.pop();
      }
      if (i + 1 < lines.length && /^\d+$/.test(lines[i + 1].trim())) {
        i++;
      }
      continue;
    }
    filteredLines.push(lines[i]);
  }
  while (filteredLines.length > 0 && filteredLines[filteredLines.length - 1] === '') {
    filteredLines.pop();
  }
  while (filteredLines.length > 0 && filteredLines[0] === '') {
    filteredLines.shift();
  }
  return filteredLines.join('\n');
}
function isLikelyThreadsFallbackDescription(text) {
  const normalizedText = String(text).replace(/\s+/g, ' ').trim();
  return [
    /\d[\d,.]*\s*(?:萬|千)?次?瀏覽/i,
    /^回覆[\s\S]*[…\.]{1,3}$/i,
    /^尚無回覆$/i,
    /^查看動態$/i,
    /^更多$/i,
    /^返回$/i,
    /^直欄標題$/i,
    /^附加影音內容$/i,
    /^新增 GIF$/i,
    /^展開撰寫工具$/i,
    /^分享$/i,
    /^轉發$/i,
    /^讚$/i,
    /^為你推薦$/,
    /^新串文$/,
    /^搜尋$/,
    /^動態$/,
    /^個人檔案$/,
    /^聯邦宇宙$/,
    /^洞察報告$/,
    /^已儲存$/,
    /^追蹤中$/,
    /^追蹤$/,
    /^已追蹤$/,
    /^(?:已釘選|Pinned)$/i,
    /^(?:作者|Author)$/i,
    /^[·•]$/,
    /^(?:查看|隱藏)?翻譯$/i,
    /^(?:See|Hide)?\s*translation$/i,
    /^查看原文$/i,
    /^附帶原始貼文的回覆內容$/,
    /\d[\d,.]*\s*位粉絲\s*•\s*\d[\d,.]*\s*則串文/i,
    /\d[\d,.]*\s*followers\s*•\s*\d[\d,.]*\s*threads/i,
    /查看\s*@.+\s*參與的最新對話/i,
    /See\s*what\s*@.+\s*is\s*saying\s*on\s*Threads/i,
    /在貼文中提及\s*@meta\.ai\s*，即可在這裡獲得解答/i,
    /^\d+\s*(?:秒|分|分鐘|小時|天|週|年|s|m|h|d|w|y)(?:前)?$/i,
    /^\d{1,2}\s*月\s*\d{1,2}\s*日$/i,
    /^\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日$/i,
    /^[A-Z][a-z]{2}\s+\d{1,2}(?:,\s*\d{4})?$/i,
    /^(?:剛剛|昨天|前天|yesterday|just now)$/i,
    /^\d+\s*[\/／]\s*\d+(?:\s*[•·]\s*[\u4e00-\u9fa5\w]+)?$/i,
    /^\d+\s*(?:of|之)\s*\d+$/i,
    /^(?:圖片|相片|photo|image)\s*\d+\s*[\/／,，共of\s]+\d+(?:\s*張)?$/i
  ].some(pattern => pattern.test(normalizedText));
}
function extractContentFromMeta() {
  const metaDescription = document.querySelector('meta[property="og:description"]');
  if (metaDescription) {
    const content = metaDescription.getAttribute('content') || '';
    if (
      content &&
      !content.includes('加入 Threads 即可分享意見') &&
      !isLikelyThreadsFallbackDescription(content) &&
      !isLikelyImageOnlyDescription(content)
    ) {
      return content;
    }
  }
  return '';
}
function isLikelyImageOnlyDescription(text) {
  if (!text) return false;
  if (/^Photo by .+ on .+\./i.test(text.trim())) return true;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const avgLen = lines.reduce((a, b) => a + b.length, 0) / lines.length;
  return lines.length >= 2 && avgLen < 12;
}
function extractPostContent(container) {
  const isPostPage = isSinglePostPage();
  if (isPostPage) {
    let content = extractContentFromDOM(container);
    if (!content) {
      const hasMedia = !!(
        container?.querySelector('img[src*="cdninstagram"]') ||
        container?.querySelector('video')
      );
      if (hasMedia) return '';
      content = extractContentFromMeta();
    }
    return content;
  } else {
    return extractContentFromDOM(container);
  }
}
const EMBED_TRIGGER_SELECTORS = [
  'button',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="option"]',
  'a',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');
const EMBED_TRIGGER_PATTERNS = [
  /取得.*內嵌/i,
  /取得.*嵌入/i,
  /內嵌程式碼/i,
  /嵌入程式碼/i,
  /Get\s+embed\s+code/i,
  /Embed\s+code/i,
  /^Embed$/i,
  /\bEmbed\b/i
];
function getElementLabelText(element) {
  if (!element) {
    return '';
  }
  const pieces = [];
  const ariaLabel = element.getAttribute('aria-label');
  const title = element.getAttribute('title');
  const value = typeof element.value === 'string' ? element.value : '';
  const text = element.innerText || element.textContent || '';
  [ariaLabel, title, value, text].forEach((piece) => {
    if (piece && String(piece).trim()) {
      pieces.push(String(piece).trim());
    }
  });
  return pieces.join(' ').replace(/\s+/g, ' ').trim();
}
function isEmbedTriggerElement(element) {
  const labelText = getElementLabelText(element);
  if (!labelText) {
    return false;
  }
  return EMBED_TRIGGER_PATTERNS.some((pattern) => pattern.test(labelText));
}
function findPostElementFromPostLink(postLink) {
  if (!postLink || typeof postLink !== 'string') return null;
  const cleanLink = postLink.split(/[?#]/)[0].replace(/\/+$/, '');
  const match = cleanLink.match(/(?:\/|^)(?:post|t)\/([a-zA-Z0-9_-]+)/i);
  if (!match) return null;
  const postId = match[1];
  const links = Array.from(
    document.querySelectorAll(`a[href*="/post/${postId}"], a[href*="/t/${postId}"]`)
  );
  for (const link of links) {
    const pressable = link.closest('[data-pressable-container]') ||
      link.closest('article') ||
      link.closest('div[data-pagelet]') ||
      link.closest('div[tabindex="-1"]');
    if (pressable) return pressable;
  }
  const timeEl = document.querySelector('time[datetime]');
  if (timeEl) {
    const pressable = timeEl.closest('[data-pressable-container]') ||
      timeEl.closest('article') ||
      timeEl.closest('div[data-pagelet]') ||
      timeEl.closest('div[tabindex="-1"]');
    if (pressable) return pressable;
  }
  return null;
}
function extractPostLinkFromEmbedCode(embedCode) {
  if (!embedCode) {
    return '';
  }
  const permalinkMatch = embedCode.match(/data-text-post-permalink="([^"]+)"/i);
  if (permalinkMatch) {
    return permalinkMatch[1];
  }
  const urlMatch = embedCode.match(/https?:\/\/(?:www\.)?threads\.com\/@[^"'\s<]+\/post\/[^"'\s<]+/i);
  return urlMatch ? urlMatch[0] : '';
}
function extractAuthorNameFromPostLink(postLink) {
  if (!postLink) {
    return '';
  }
  const authorMatch = postLink.match(/^https?:\/\/(?:www\.)?threads\.com\/@([^\/?#]+)\/post\//i);
  return authorMatch ? authorMatch[1] : '';
}
function findAuthorLinkInPost(postElement) {
  if (!postElement) {
    return null;
  }
  const candidates = Array.from(postElement.querySelectorAll('a[href*="/@"], [role="link"][href*="/@"]'))
    .filter((link) => {
      const href = (link.getAttribute('href') || link.href || '').split('?')[0];
      return href.includes('/@') && !href.includes('/post/');
    });
  if (candidates.length === 0) {
    return null;
  }
  const labelCandidates = candidates.filter((link) => {
    const labelText = getElementLabelText(link);
    return labelText && !/串文|瀏覽|view|views?/i.test(labelText);
  });
  const preferredCandidates = labelCandidates.length > 0 ? labelCandidates : candidates;
  return preferredCandidates.find((link) => getElementLabelText(link)) || preferredCandidates[0] || null;
}
function extractAuthorFromPost(postElement, postLink) {
  const authorLink = findAuthorLinkInPost(postElement);
  const author = authorLink ? getElementLabelText(authorLink) : '';
  return author || extractAuthorNameFromPostLink(postLink);
}
function extractPostTimestampFromElement(postElement) {
  const timeElement = postElement?.querySelector('time[datetime]');
  if (!timeElement) {
    return {
      timestamp: '',
      timestampTitle: ''
    };
  }
  return {
    timestamp: timeElement.getAttribute('datetime') || '',
    timestampTitle: timeElement.getAttribute('title') || ''
  };
}
function extractEmbedCodeFromDialog(dialog) {
  if (!dialog) {
    return '';
  }
  const inputs = Array.from(dialog.querySelectorAll('input[readonly], textarea[readonly]'));
  let bestValue = '';
  let bestScore = -1;
  for (const input of inputs) {
    const rawValue = typeof input.value === 'string' ? input.value : (input.getAttribute('value') || input.textContent || '');
    const value = rawValue.trim();
    if (!value) {
      continue;
    }
    let score = value.length;
    if (/data-text-post-permalink=/i.test(value)) {
      score += 1000;
    }
    if (/<blockquote/i.test(value)) {
      score += 500;
    }
    if (/threads\.com/i.test(value)) {
      score += 100;
    }
    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }
  return bestValue;
}
async function saveArticleFromEmbedDialog(dialog, context = {}) {
  const embedCode = extractEmbedCodeFromDialog(dialog);
  if (!embedCode) {
    console.warn('[Threadkeep] 對話框中沒有可讀取的內嵌程式碼');
    showNotification('找不到可儲存的內嵌程式碼', { type: 'error' });
    return;
  }
  const postLink = extractPostLinkFromEmbedCode(embedCode) || context.postLink || context.postElement?.querySelector('a[href*="/post/"], a[href*="/t/"]')?.href || '';
  if (!postLink) {
    console.error('[Threadkeep] 無法從內嵌程式碼提取貼文連結');
    showNotification('無法取得貼文連結', { type: 'error' });
    return;
  }
  const postElement = context.postElement || findPostElementFromPostLink(postLink);
  const finalContent = (context.preContent || (postElement ? extractPostContent(postElement) : '') || extractContentFromMeta() || '').trim();
  let finalAuthor = (context.preAuthor || '').trim();
  if (!finalAuthor && postElement) {
    finalAuthor = extractAuthorFromPost(postElement, postLink);
  }
  if (!finalAuthor) {
    finalAuthor = extractAuthorNameFromPostLink(postLink);
  }
  const timestampData = extractPostTimestampFromElement(postElement);
  const articleData = {
    id: `embed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    postLink,
    embedCode,
    timestamp: timestampData.timestamp || new Date().toISOString(),
    timestampTitle: timestampData.timestampTitle || '',
    savedAt: new Date().toISOString(),
    content: finalContent,
    author: finalAuthor || '未知作者',
    tags: extractTags(finalContent, postElement)
  };
  await saveArticle(articleData, null);
}
async function processOpenEmbedDialogs() {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
  if (dialogs.length === 0) {
    return;
  }
  for (const dialog of dialogs) {
    if (dialog.dataset.threadsSaverSaved === 'true' || dialog.dataset.threadsSaverSaving === 'true') {
      continue;
    }
    const embedCode = extractEmbedCodeFromDialog(dialog);
    if (!embedCode) {
      continue;
    }
    dialog.dataset.threadsSaverSaving = 'true';
    const postLink = extractPostLinkFromEmbedCode(embedCode);
    const postElement = postLink
      ? findPostElementFromPostLink(postLink)
      : dialog.closest('[data-pressable-container]') ||
      dialog.closest('article') ||
      dialog.closest('[role="article"]');
    const preContent = postElement ? extractPostContent(postElement) : '';
    const preAuthor = postElement ? extractAuthorFromPost(postElement, postLink) : '';
    try {
      await saveArticleFromEmbedDialog(dialog, {
        postElement,
        postLink,
        preContent,
        preAuthor
      });
      dialog.dataset.threadsSaverSaved = 'true';
    } finally {
      delete dialog.dataset.threadsSaverSaving;
    }
  }
}
function scheduleEmbedDialogCheck() {
  if (window.__threadsSaverDialogCheckScheduled) {
    return;
  }
  window.__threadsSaverDialogCheckScheduled = true;
  requestAnimationFrame(() => {
    window.__threadsSaverDialogCheckScheduled = false;
    void processOpenEmbedDialogs();
  });
}
const EMBED_DIALOG_POLL_MS = 250;
const EMBED_DIALOG_TIMEOUT_MS = 8000;
const THREADS_ERROR_TEXT_MAX_LENGTH = 300;
const THREADS_ERROR_PATTERNS = [
  /發生錯誤.*技術錯誤/,
  /Something went wrong/i
];
function isThreadsErrorNode(node) {
  const element = node instanceof Element ? node : node.parentElement;
  if (!element || element.closest('.threads-save-notification, [data-pressable-container]') || element.querySelector('[data-pressable-container]')) {
    return false;
  }
  const text = (node.textContent || '').trim();
  return text.length > 0 &&
    text.length <= THREADS_ERROR_TEXT_MAX_LENGTH &&
    THREADS_ERROR_PATTERNS.some(pattern => pattern.test(text));
}
function handleEmbedTriggerClick(e) {
  const embedButton = e.target instanceof Element ? e.target.closest(EMBED_TRIGGER_SELECTORS) : null;
  if (!embedButton || !isEmbedTriggerElement(embedButton)) {
    return;
  }
  let preContent = '';
  let preAuthor = '';
  const postElement =
    embedButton.closest('[data-pressable-container]') ||
    embedButton.closest('[data-pagelet="threads_post_page_0"]') ||
    embedButton.closest('article') ||
    embedButton.closest('[role="article"]');
  if (postElement) {
    preContent = extractPostContent(postElement);
    const authorLink = postElement.querySelector('a[role="link"][href*="/@"]');
    if (authorLink) {
      preAuthor = authorLink.innerText || '';
    }
  }
  const existingDialogs = new Set(document.querySelectorAll('[role="dialog"]'));
  const startedAt = Date.now();
  let sawDialog = false;
  let threadsErrorShown = false;
  const errorObserver = new MutationObserver((records) => {
    if (threadsErrorShown) return;
    threadsErrorShown = records.some(record => Array.from(record.addedNodes).some(isThreadsErrorNode));
  });
  errorObserver.observe(document.body, { childList: true, subtree: true });
  let poll = null;
  const stopWaiting = () => {
    clearInterval(poll);
    errorObserver.disconnect();
  };
  poll = setInterval(async () => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(d => !existingDialogs.has(d));
    if (dialogs.length > 0) {
      sawDialog = true;
    }
    if (dialogs.some(d => d.dataset.threadsSaverSaved === 'true' || d.dataset.threadsSaverSaving === 'true')) {
      stopWaiting();
      return;
    }
    const dialog = [...dialogs].reverse().find(d => extractEmbedCodeFromDialog(d));
    if (dialog) {
      stopWaiting();
      dialog.dataset.threadsSaverSaving = 'true';
      try {
        await saveArticleFromEmbedDialog(dialog, {
          postElement,
          preContent,
          preAuthor
        });
        dialog.dataset.threadsSaverSaved = 'true';
      } finally {
        delete dialog.dataset.threadsSaverSaving;
      }
      return;
    }
    if (threadsErrorShown) {
      stopWaiting();
      console.warn('[Threadkeep] Threads 顯示錯誤訊息，沒有產生內嵌程式碼');
      showNotification('Threads 回報錯誤，請稍後再試', { type: 'error' });
      return;
    }
    if (Date.now() - startedAt < EMBED_DIALOG_TIMEOUT_MS) {
      return;
    }
    stopWaiting();
    if (dialogs.length > 0) {
      console.warn('[Threadkeep] 對話框中沒有可讀取的內嵌程式碼');
      showNotification('找不到可儲存的內嵌程式碼', { type: 'error' });
    } else if (!sawDialog) {
      console.error('[Threadkeep] 找不到對話框');
      showNotification('找不到內嵌程式碼對話框', { type: 'error' });
    }
  }, EMBED_DIALOG_POLL_MS);
}
function extractTags(text, container = null) {
  const tags = [];
  if (container) {
    try {
      const tagElements = container.querySelectorAll('a[href*="serp_type=tags"], a[href*="tag_id="]');
      tagElements.forEach(el => {
        let tagVal = '';
        const href = el.getAttribute('href');
        if (href) {
          try {
            const url = new URL(href, 'https://www.threads.net');
            const q = url.searchParams.get('q');
            if (q) {
              tagVal = q.trim();
            }
          } catch (e) { }
        }
        if (!tagVal) {
          tagVal = el.textContent.trim();
        }
        if (tagVal) {
          const cleanTag = tagVal.replace(/^#/, '').trim();
          if (cleanTag) {
            tags.push(cleanTag);
          }
        }
      });
    } catch (err) {
      console.warn('[Threadkeep] 從 DOM 抓取 tags 失敗:', err);
    }
  }
  const textWithoutUrls = String(text || '').replace(/(?:https?:\/\/|www\.)\S+/gi, ' ');
  const hashtagRegex = /(?<![\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}\p{M}_&\/])[#\uff03](?![\ufe0f\u20e3])([\p{L}\p{M}\p{N}_]*\p{L}[\p{L}\p{M}\p{N}_]*)/gu;
  let match;
  while ((match = hashtagRegex.exec(textWithoutUrls)) !== null) {
    tags.push(match[1]);
  }
  const seenTags = new Set();
  return tags
    .map(t => t.normalize('NFC'))
    .filter(t => {
      const key = t.toLowerCase();
      if (seenTags.has(key)) return false;
      seenTags.add(key);
      return true;
    });
}
async function recordEmbeddable(storageKey, postLink) {
  const embedPath = getThreadsEmbedPath(postLink);
  if (!embedPath) return;
  const embeddable = await checkEmbeddable(location.origin + embedPath);
  try {
    const stored = await safeStorageGet([storageKey]);
    const article = stored[storageKey];
    if (article && applyEmbeddableResult(article, embeddable)) {
      await safeStorageSet({ [storageKey]: article });
    }
  } catch (error) {
    console.warn('[Threadkeep] 記錄內嵌檢查結果失敗:', error);
  }
}
async function saveArticle(articleData, button) {
  try {
    if (isExtensionAlive()) {
      try {
        await migrateLegacyArticles();
      } catch (migrateError) {
        console.warn('[Threadkeep] 舊資料搬移失敗，本篇仍會單獨儲存:', migrateError);
      }
    }
    const storageKey = getArticleStorageKey(articleData);
    const result = await safeStorageGet([storageKey]);
    const isExisting = storageKey in result;
    if (isExisting) {
      await safeStorageSet({ [storageKey]: { ...pickEmbeddableFields(result[storageKey]), ...articleData } });
      console.info('[Threadkeep] 已更新', storageKey);
      if (button) {
        button.classList.add('saved');
      }
      showNotification('內嵌程式碼已更新');
    } else {
      await safeStorageSet({ [storageKey]: articleData });
      console.info('[Threadkeep] 已儲存', storageKey);
      if (button) {
        button.classList.add('saved');
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19l13-13-1.4-1.4L9 16.2z" fill="#0095f6" opacity="0.3"/>
          </svg>
        `;
      }
      showNotification('內嵌程式碼已儲存');
    }
    void recordEmbeddable(storageKey, articleData.postLink);
  } catch (error) {
    console.error('[Threadkeep] 儲存失敗:', error);
    if (error.message && (error.message.includes('QUOTA') || error.message.includes('quota'))) {
      showNotification('儲存空間已滿!請開啟擴充功能清理舊貼文', { type: 'error' });
    } else if (error.message && error.message.includes('Extension context invalidated')) {
      showNotification('擴充功能已失效,請重新載入頁面', { type: 'error' });
    } else {
      showNotification('儲存失敗: ' + (error.message || '請稍後再試'), { type: 'error' });
    }
  }
}
const NOTIFICATION_DURATION_MS = 4000;
const NOTIFICATION_ERROR_DURATION_MS = 6000;
const NOTIFICATION_MS_PER_CHAR = 120;
const notificationSegmenter = new Intl.Segmenter('zh-TW', { granularity: 'grapheme' });
function appendStreamedNotificationText(target, text) {
  const spoken = document.createElement('span');
  spoken.className = 'threads-save-notification__sr';
  spoken.textContent = text;
  const visual = document.createElement('span');
  visual.setAttribute('aria-hidden', 'true');
  let index = 0;
  for (const { segment } of notificationSegmenter.segment(text)) {
    const char = document.createElement('span');
    char.className = 'threads-save-notification__char';
    char.style.setProperty('--char-index', index++);
    char.textContent = segment;
    visual.appendChild(char);
  }
  target.append(spoken, visual);
}
function showNotification(message, options = {}) {
  const isError = options.type === 'error';
  const notification = document.createElement('div');
  notification.className = isError
    ? 'threads-save-notification threads-save-notification--error'
    : 'threads-save-notification';
  notification.setAttribute('role', isError ? 'alert' : 'status');
  notification.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  const themePreference = window.__threadsSaverThemePreference;
  if (themePreference === 'light' || themePreference === 'dark') {
    notification.dataset.theme = themePreference;
  }
  appendStreamedNotificationText(notification, message);
  document.body.appendChild(notification);
  const baseDuration = isError ? NOTIFICATION_ERROR_DURATION_MS : NOTIFICATION_DURATION_MS;
  let remaining = options.duration || Math.max(baseDuration, message.length * NOTIFICATION_MS_PER_CHAR);
  let startedAt = 0;
  let timer = null;
  let leaving = false;
  const leave = () => {
    leaving = true;
    notification.classList.add('is-leaving');
    setTimeout(() => notification.remove(), 300);
  };
  const resume = () => {
    if (leaving || timer) return;
    startedAt = Date.now();
    timer = setTimeout(leave, remaining);
  };
  notification.addEventListener('mouseenter', () => {
    if (leaving || !timer) return;
    clearTimeout(timer);
    timer = null;
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  });
  notification.addEventListener('mouseleave', resume);
  resume();
}