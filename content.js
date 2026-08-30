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
    showNotification('找不到可儲存的內嵌程式碼');
    return;
  }
  const postLink = extractPostLinkFromEmbedCode(embedCode) || context.postLink || context.postElement?.querySelector('a[href*="/post/"], a[href*="/t/"]')?.href || '';
  if (!postLink) {
    console.error('[Threads Saver] 無法從內嵌程式碼提取貼文連結');
    showNotification('無法取得貼文連結');
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
    tags: extractTags(finalContent, postElement),
    codeBlocks: []
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
          showNotification('找不到內嵌程式碼對話框');
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
function extractArticleData(articleElement) {
  let textContent = extractPostContent(articleElement);
  console.log('[Threads Saver] 抓取到的內文:', textContent);
  const codeBlocks = extractCodeBlocks(articleElement, textContent);
  const postLink = articleElement.querySelector('a[href*="/post/"], a[href*="/t/"]')?.href || window.location.href;
  const authorData = extractAuthorDataFromPost(articleElement, postLink);
  const embedCode = buildThreadsEmbedCode(postLink);
  console.log('[Threads Saver] 使用本地生成的嵌入代碼（可稍後手動更新）');
  const timeElement = articleElement.querySelector('time');
  const timestamp = timeElement?.getAttribute('datetime') || new Date().toISOString();
  const timestampTitle = timeElement?.getAttribute('title') || '';
  const tags = extractTags(textContent, articleElement);
  return {
    id: `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    content: textContent.trim(),
    codeBlocks,
    codeCount: codeBlocks.length,
    author: authorData.author.trim() || '未知作者',
    authorUrl: authorData.authorUrl,
    postLink,
    embedCode,
    timestamp,
    timestampTitle,
    tags,
    savedAt: new Date().toISOString()
  };
}
function buildThreadsEmbedCode(postLink) {
  if (!postLink) return '';
  const match = postLink.match(/\/(post|t)\/([^\/\?]+)/);
  const postId = match ? match[2] : '';
  return (
    `<blockquote class="text-post-media" data-text-post-permalink="${postLink}" data-text-post-version="0" id="ig-tp-${postId}" style=" background:#FFF; border-width: 1px; border-style: solid; border-color: #00000026; border-radius: 16px; max-width:650px; margin: 1px; min-width:270px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);"> <a href="${postLink}" style=" background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%; font-family: -apple-system, BlinkMacSystemFont, sans-serif;" target="_blank"> <div style=" padding: 40px; display: flex; flex-direction: column; align-items: center;"><div style=" display:block; height:32px; width:32px; padding-bottom:20px;"> <svg aria-label="Threads" height="32px" role="img" viewBox="0 0 192 192" width="32px" xmlns="http://www.w3.org/2000/svg"> <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" /></svg></div><div style=" font-size: 15px; line-height: 21px; color: #000000; font-weight: 600; "> 在 Threads 查看</div></div></a></blockquote>\n` +
    `<script async src="https://www.threads.com/embed.js"></script>`
  );
}
function extractCodeBlocks(articleElement, textContent) {
  const codeBlocks = [];
  const preElements = articleElement.querySelectorAll('pre, code');
  preElements.forEach((element, index) => {
    const code = element.textContent.trim();
    if (code.length > 5) {
      codeBlocks.push({
        type: 'html_tag',
        code,
        language: detectLanguage(code),
        index: index + 1
      });
    }
  });
  const markdownCodeRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = markdownCodeRegex.exec(textContent)) !== null) {
    codeBlocks.push({
      type: 'markdown_block',
      code: match[2].trim(),
      language: match[1] || detectLanguage(match[2]),
      index: codeBlocks.length + 1
    });
  }
  const inlineCodeRegex = /`([^`\n]{2,})`/g;
  const inlineCodes = [];
  while ((match = inlineCodeRegex.exec(textContent)) !== null) {
    inlineCodes.push(match[1]);
  }
  if (inlineCodes.length > 0) {
    codeBlocks.push({
      type: 'inline',
      code: inlineCodes.join('\n'),
      language: 'mixed',
      count: inlineCodes.length,
      index: codeBlocks.length + 1
    });
  }
  const monoElements = articleElement.querySelectorAll('[style*="monospace"]');
  monoElements.forEach((element, index) => {
    const code = element.textContent.trim();
    if (code.length > 5 && !codeBlocks.some(block => block.code === code)) {
      codeBlocks.push({
        type: 'monospace',
        code,
        language: detectLanguage(code),
        index: codeBlocks.length + 1
      });
    }
  });
  return codeBlocks;
}
function detectLanguage(code) {
  const patterns = {
    javascript: /\b(const|let|var|function|=>|console\.log|async|await)\b/,
    python: /\b(def|import|from|class|if __name__|print\(|lambda)\b/,
    java: /\b(public|private|class|void|static|extends|implements)\b/,
    cpp: /\b(#include|iostream|std::|cout|cin|namespace)\b/,
    csharp: /\b(using|namespace|public|private|class|void|string)\b/,
    html: /<\/?[a-z][\s\S]*>/i,
    css: /\{[^}]*:[^}]*\}/,
    sql: /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE)\b/i,
    bash: /\b(echo|export|cd|ls|grep|awk|sed)\b/,
    json: /^\s*[\{\[].*[\}\]]\s*$/,
  };
  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(code)) {
      return lang;
    }
  }
  return 'unknown';
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
          } catch (e) {
            // 忽略解析 URL 錯誤
          }
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
      contentLength: articleData.content?.length,
      codeBlocksCount: articleData.codeBlocks?.length
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
      showNotification('儲存空間已滿!請開啟擴充功能清理舊文章');
    } else if (error.message && error.message.includes('Extension context invalidated')) {
      console.error('[Threads Saver] 錯誤原因: 擴充功能已失效');
      showNotification('擴充功能已失效,請重新載入頁面');
    } else {
      console.error('[Threads Saver] 錯誤原因: 未知');
      showNotification('儲存失敗: ' + (error.message || '請稍後再試'));
    }
  }
}
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'threads-save-notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}