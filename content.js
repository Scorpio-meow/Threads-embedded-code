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
      console.warn('[Threads Saver] 擴充功能內容被重新載入，忽略本次讀取');
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
      console.warn('[Threads Saver] 擴充功能內容被重新載入，忽略本次寫入');
      return;
    }
    throw err;
  }
}
function handleEmbedFrameResize() {
  const getCardHeight = () => {
    const embedEl = document.querySelector('.Embed') ||
      document.querySelector('div[class*="Embed"]') ||
      document.querySelector('div[id^="u_0_0_"] > div') ||
      document.querySelector('div[id^="u_"] > div') ||
      document.querySelector('div[id^="u_0_0_"]');
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
  const notify = () => {
    const h = getCardHeight();
    if (h > 50) {
      window.parent.postMessage({
        type: 'THREADS_EMBED_RESIZE',
        height: h
      }, '*');
    }
  };
  let ro = null;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(() => {
      notify();
    });
  }
  const attachMediaListeners = () => {
    document.querySelectorAll('img, video, canvas, picture').forEach(media => {
      if (!media.__threadsObserved) {
        media.__threadsObserved = true;
        if (ro) {
          try { ro.observe(media); } catch (_) { }
        }
        media.addEventListener('load', notify);
        media.addEventListener('loadeddata', notify);
        media.addEventListener('error', notify);
      }
    });
  };
  notify();
  if (ro) {
    const embedEl = document.querySelector('.Embed') || document.querySelector('div[id^="u_0_0_"]') || (document.body ? document.body.firstElementChild : null);
    if (embedEl) ro.observe(embedEl);
  }
  attachMediaListeners();
  const mo = new MutationObserver(() => {
    const embedEl = document.querySelector('.Embed') || document.querySelector('div[id^="u_0_0_"]');
    if (ro && embedEl) {
      try { ro.observe(embedEl); } catch (_) { }
    }
    attachMediaListeners();
    notify();
  });
  if (document.body) {
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
  }
  window.addEventListener('load', () => {
    attachMediaListeners();
    notify();
  });
  [50, 150, 300, 600, 1000, 1500, 2500, 4000].forEach(delay => setTimeout(() => {
    attachMediaListeners();
    notify();
  }, delay));
}
function init() {
  if (location.pathname.includes('/embed') || window.self !== window.top) {
    handleEmbedFrameResize();
    return;
  }
  console.log('[Threads Saver] 插件初始化');
  if (!document.body) {
    console.warn('[Threads Saver] document.body 不存在，延遲初始化');
    setTimeout(init, 500);
    return;
  }
  const observer = new MutationObserver((mutations) => {
    addSaveButtons();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  setTimeout(() => {
    addSaveButtons();
  }, 1000);
  window.__threadsSaverIntervalId = window.__threadsSaverIntervalId || setInterval(() => {
    addSaveButtons();
  }, 5000);
}
function isSinglePostPage() {
  const path = window.location.pathname;
  return path.includes('/post/') || /^\/t\/[^\/]+/.test(path);
}
function extractContentFromDOM(container) {
  const postPage0 = container.querySelector('[data-pagelet="threads_post_page_0"]');
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
    if (el.closest('picture') || el.closest('video') || el.closest('canvas') || el.closest('[aria-roledescription="slide"]') || el.querySelector('img, video, picture, canvas')) return false;
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
function isElementVisible(element) {
  if (!element) {
    return false;
  }
  const rects = element.getClientRects();
  if (!rects || rects.length === 0) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}
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
function findEmbedCodeTriggers() {
  const candidates = Array.from(document.querySelectorAll(EMBED_TRIGGER_SELECTORS));
  return candidates.filter((element) => isElementVisible(element) && isEmbedTriggerElement(element));
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
function extractAuthorUrlFromPostLink(postLink) {
  if (!postLink) {
    return '';
  }
  const authorMatch = postLink.match(/^(https?:\/\/(?:www\.)?threads\.com\/@[^\/?#]+)\/post\//i);
  return authorMatch ? authorMatch[1] : '';
}
function extractAuthorNameFromPostLink(postLink) {
  const authorUrl = extractAuthorUrlFromPostLink(postLink);
  const authorMatch = authorUrl.match(/\/@([^\/?#]+)$/i);
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
function extractAuthorDataFromPost(postElement, postLink) {
  const authorLink = findAuthorLinkInPost(postElement);
  let author = authorLink ? getElementLabelText(authorLink) : '';
  let authorUrl = authorLink?.href || '';
  if (!authorUrl) {
    authorUrl = extractAuthorUrlFromPostLink(postLink);
  }
  if (!author) {
    author = extractAuthorNameFromPostLink(postLink);
  }
  return {
    author,
    authorUrl
  };
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
    console.warn('[Threads Saver] 對話框中沒有可讀取的內嵌程式碼');
    showNotification('找不到可儲存的內嵌程式碼', { type: 'error' });
    return;
  }
  const postLink = extractPostLinkFromEmbedCode(embedCode) || context.postLink || context.postElement?.querySelector('a[href*="/post/"], a[href*="/t/"]')?.href || '';
  if (!postLink) {
    console.error('[Threads Saver] 無法從內嵌程式碼提取貼文連結');
    showNotification('無法取得貼文連結', { type: 'error' });
    return;
  }
  const postElement = context.postElement || findPostElementFromPostLink(postLink);
  const finalContent = (context.preContent || (postElement ? extractPostContent(postElement) : '') || extractContentFromMeta() || '').trim();
  let finalAuthor = (context.preAuthor || '').trim();
  let finalAuthorUrl = (context.preAuthorUrl || '').trim();
  if ((!finalAuthor || !finalAuthorUrl) && postElement) {
    const authorData = extractAuthorDataFromPost(postElement, postLink);
    finalAuthor = finalAuthor || authorData.author;
    finalAuthorUrl = finalAuthorUrl || authorData.authorUrl;
  }
  if (!finalAuthorUrl) {
    finalAuthorUrl = extractAuthorUrlFromPostLink(postLink);
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
    authorUrl: finalAuthorUrl,
    tags: extractTags(finalContent, postElement)
  };
  console.log('[Threads Saver] 準備儲存嵌入對話框內容:', articleData.postLink);
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
      dialog.closest('[role="article"]'); const preContent = postElement ? extractPostContent(postElement) : '';
    let preAuthor = '';
    let preAuthorUrl = '';
    if (postElement) {
      const authorData = extractAuthorDataFromPost(postElement, postLink);
      preAuthor = authorData.author;
      preAuthorUrl = authorData.authorUrl;
    }
    console.log('[Threads Saver] 偵測到可直接讀取的內嵌對話框');
    try {
      await saveArticleFromEmbedDialog(dialog, {
        postElement,
        postLink,
        preAuthor,
        preAuthorUrl
      });
      dialog.dataset.threadsSaverSaved = 'true';
    } finally {
      delete dialog.dataset.threadsSaverSaving;
    }
  }
}
function addSaveButtons() {
  const embedButtons = findEmbedCodeTriggers();
  if (window.__threadsSaverLastTriggerCount !== embedButtons.length) {
    window.__threadsSaverLastTriggerCount = embedButtons.length;
    console.log(`[Threads Saver] 找到 ${embedButtons.length} 個「取得內嵌程式碼」按鈕`);
    console.log('[Threads Saver] 準備處理', embedButtons.length, '個嵌入按鈕');
    if (embedButtons.length === 0) {
      console.log('[Threads Saver] 目前尚未偵測到可附加的觸發項，會持續監看內嵌對話框');
    }
  }
  embedButtons.forEach((embedButton, index) => {
    if (embedButton.dataset.threadsSaverAttached) {
      console.log(`[Threads Saver] 按鈕 ${index + 1} 已處理過,跳過`);
      return;
    }
    console.log(`[Threads Saver] 處理按鈕 ${index + 1}`);
    embedButton.dataset.threadsSaverAttached = 'true';
    embedButton.addEventListener('click', async (e) => {
      console.log('[Threads Saver] 偵測到「取得內嵌程式碼」被點擊');
      let preContent = '';
      let preAuthor = '';
      let preAuthorUrl = '';
      const postElement =
        embedButton.closest('[data-pressable-container]') ||
        embedButton.closest('[data-pagelet="threads_post_page_0"]') ||
        embedButton.closest('article') ||
        embedButton.closest('[role="article"]');
      if (postElement) {
        console.log('[Threads Saver] 點擊前找到貼文容器元素');
        preContent = extractPostContent(postElement);
        if (preContent) {
          console.log('[Threads Saver] 提取到內容:', preContent.substring(0, 50));
        }
        const authorLink = postElement.querySelector('a[role="link"][href*="/@"]');
        if (authorLink) {
          preAuthor = authorLink.innerText || '';
          preAuthorUrl = authorLink.href || '';
          console.log('[Threads Saver] 點擊前提取到作者:', preAuthor);
        }
      } else {
        console.log('[Threads Saver] 點擊前未找到貼文容器元素');
      }
      setTimeout(async () => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        if (dialogs.length === 0) {
          console.error('[Threads Saver] 找不到對話框');
          showNotification('找不到內嵌程式碼對話框', { type: 'error' });
          return;
        }
        const dialog = dialogs[dialogs.length - 1];
        console.log('[Threads Saver] 找到', dialogs.length, '個對話框,使用最新的一個');
        if (dialog.dataset.threadsSaverSaved === 'true' || dialog.dataset.threadsSaverSaving === 'true') {
          console.log('[Threads Saver] 對話框已處理過,跳過');
          return;
        }
        dialog.dataset.threadsSaverSaving = 'true';
        try {
          await saveArticleFromEmbedDialog(dialog, {
            postElement,
            preAuthor,
            preAuthorUrl
          });
          dialog.dataset.threadsSaverSaved = 'true';
        } finally {
          delete dialog.dataset.threadsSaverSaving;
        }
      }, 1000);
    }, true);
    console.log('[Threads Saver] 已附加監聽器到「取得內嵌程式碼」按鈕');
  });
  void processOpenEmbedDialogs();
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
      console.warn('[Threads Saver] 從 DOM 抓取 tags 失敗:', err);
    }
  }
  const hashtagRegex = /#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g;
  let match;
  while ((match = hashtagRegex.exec(text)) !== null) {
    tags.push(match[1]);
  }
  const languages = ['JavaScript', 'Python', 'Java', 'C\\+\\+', 'C#', 'HTML', 'CSS', 'SQL', 'TypeScript', 'React', 'Vue', 'Angular'];
  languages.forEach(lang => {
    const pattern = lang.includes('\\') ? lang : `\\b${lang}\\b`;
    if (new RegExp(pattern, 'i').test(text)) {
      tags.push(lang.replace(/\\\+/g, '+'));
    }
  });
  return [...new Set(tags.map(t => t.normalize('NFC')))];
}
async function saveArticle(articleData, button) {
  try {
    console.log('[Threads Saver] ========== 開始儲存流程 ==========');
    console.log('[Threads Saver] 文章資料:', {
      postLink: articleData.postLink,
      author: articleData.author,
      contentLength: articleData.content?.length
    });
    const result = await safeStorageGet(['savedArticles']);
    const savedArticles = result.savedArticles || [];
    console.log('[Threads Saver] 目前已儲存文章數:', savedArticles.length);
    console.log('[Threads Saver] 準備儲存的文章連結:', articleData.postLink);
    const existingIndex = savedArticles.findIndex(
      article => article.postLink === articleData.postLink
    );
    console.log('[Threads Saver] 檢查重複結果:', existingIndex !== -1 ? `已存在於索引 ${existingIndex}` : '新文章');
    if (existingIndex !== -1) {
      console.log('[Threads Saver] 文章已存在於索引', existingIndex, ',將更新');
      savedArticles[existingIndex] = articleData;
      console.log('[Threads Saver] 開始寫入更新...');
      await safeStorageSet({ savedArticles });
      console.log('[Threads Saver] 更新成功!');
      if (button) {
        button.classList.add('saved');
      }
      showNotification('內嵌程式碼已更新');
    } else {
      console.log('[Threads Saver] 新文章,將新增到列表');
      console.log('[Threads Saver] 新增前文章數:', savedArticles.length);
      savedArticles.unshift(articleData);
      console.log('[Threads Saver] 新增後文章數:', savedArticles.length);
      console.log('[Threads Saver] 開始寫入儲存...');
      try {
        await safeStorageSet({ savedArticles });
        console.log('[Threads Saver] 儲存成功!現在總共有', savedArticles.length, '篇文章');
      } catch (saveError) {
        console.error('[Threads Saver] 寫入失敗:', saveError);
        throw saveError;
      }
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
  } catch (error) {
    console.error('[Threads Saver] ========== 儲存失敗 ==========');
    console.error('[Threads Saver] 錯誤類型:', error.name);
    console.error('[Threads Saver] 錯誤訊息:', error.message);
    console.error('[Threads Saver] 完整錯誤:', error);
    if (error.message && (error.message.includes('QUOTA') || error.message.includes('quota'))) {
      console.error('[Threads Saver] 錯誤原因: 儲存空間配額已滿');
      showNotification('儲存空間已滿!請開啟擴充功能清理舊文章', { type: 'error' });
    } else if (error.message && error.message.includes('Extension context invalidated')) {
      console.error('[Threads Saver] 錯誤原因: 擴充功能已失效');
      showNotification('擴充功能已失效,請重新載入頁面', { type: 'error' });
    } else {
      console.error('[Threads Saver] 錯誤原因: 未知');
      showNotification('儲存失敗: ' + (error.message || '請稍後再試'), { type: 'error' });
    }
  }
}
function showNotification(message, options = {}) {
  const isError = options.type === 'error';
  const notification = document.createElement('div');
  notification.className = isError
    ? 'threads-save-notification threads-save-notification--error'
    : 'threads-save-notification';
  notification.setAttribute('role', isError ? 'alert' : 'status');
  notification.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  notification.textContent = message;
  document.body.appendChild(notification);
  const duration = options.duration || (isError ? 6000 : 2500);
  setTimeout(() => {
    notification.classList.add('is-leaving');
    setTimeout(() => notification.remove(), 300);
  }, duration);
}