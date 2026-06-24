let allArticles = [];
let filteredArticles = [];
let currentSort = 'savedAt-desc';
let selectedArticleIds = new Set();
let currentFilter = 'all';
let currentFilterValue = '';
function refreshEmbedCode(articleId) {
  const article = allArticles.find(a => a.id === articleId);
  if (!article || !article.postLink) {
    console.error('[Popup] 找不到文章或文章連結:', articleId);
    showToast('找不到文章連結');
    return false;
  }
  console.log('[Popup] 重新生成嵌入代碼:', article.postLink);
  showToast('正在重新生成...');
  const newEmbedCode = buildThreadsEmbedCode(article.postLink);
  if (!newEmbedCode) {
    console.error('[Popup] 無法生成嵌入代碼');
    showToast('生成失敗');
    return false;
  }
  article.embedCode = newEmbedCode;
  article.lastUpdated = new Date().toISOString();
  chrome.storage.local.set({ savedArticles: allArticles }).then(() => {
    filteredArticles = allArticles.filter(a =>
      filteredArticles.some(fa => fa.id === a.id)
    );
    renderArticles();
    showToast('嵌入代碼已重新生成');
  });
  return true;
}
function refreshAllEmbedCodes() {
  const targetArticles = selectedArticleIds.size > 0
    ? allArticles.filter(a => selectedArticleIds.has(a.id))
    : allArticles;
  if (targetArticles.length === 0) {
    showToast('沒有文章可以重新生成');
    return;
  }
  const selectionText = selectedArticleIds.size > 0 ? '選取的' : '全部';
  if (!confirm(`確定要重新生成${selectionText} ${targetArticles.length} 篇文章的嵌入代碼嗎？`)) {
    return;
  }
  showToast(`正在重新生成 ${targetArticles.length} 篇文章...`);
  let successCount = 0;
  let failCount = 0;
  targetArticles.forEach(article => {
    if (!article.postLink) {
      failCount++;
      return;
    }
    const newEmbedCode = buildThreadsEmbedCode(article.postLink);
    if (newEmbedCode) {
      article.embedCode = newEmbedCode;
      article.lastUpdated = new Date().toISOString();
      successCount++;
    } else {
      failCount++;
    }
  });
  chrome.storage.local.set({ savedArticles: allArticles }).then(() => {
    filteredArticles = [...allArticles];
    sortArticles();
    renderArticles();
    showToast(`完成！成功: ${successCount}, 失敗: ${failCount}`);
  });
}
async function updateAllTimestamps() {
  const baseArticles = selectedArticleIds.size > 0
    ? allArticles.filter(a => selectedArticleIds.has(a.id))
    : allArticles;
  if (baseArticles.length === 0) {
    showToast('沒有文章可以更新');
    return;
  }
  const articlesNeedingUpdate = baseArticles.filter(a => a.postLink);
  if (articlesNeedingUpdate.length === 0) {
    showToast('沒有有效的文章連結');
    return;
  }
  const selectionText = selectedArticleIds.size > 0 ? '選取的' : '';
  if (!confirm(`確定要更新${selectionText} ${articlesNeedingUpdate.length} 篇文章的時間和內文嗎？\n\n這會開啟分頁逐一訪問每篇文章，可能需要一些時間。\n分頁會在完成後自動關閉。`)) {
    return;
  }
  showToast(`開始更新 ${articlesNeedingUpdate.length} 篇文章...`);
  let successCount = 0;
  let failCount = 0;
  let currentIndex = 0;
  const maxConcurrency = 3;
  const tasks = [...articlesNeedingUpdate];
  const runWorker = async () => {
    while (tasks.length > 0) {
      const article = tasks.shift();
      if (!article) break;
      let localIndex = 0;
      try {
        const postInfo = await fetchPostInfoViaTab(article.postLink);
        currentIndex++;
        localIndex = currentIndex;
        if (postInfo) {
          if (postInfo.status === 'expired') {
            markArticleAsExpired(article, postInfo.reason);
            failCount++;
            console.warn(`[Popup] 更新結果看起來是失效頁面，略過 (${localIndex}/${articlesNeedingUpdate.length}):`, article.postLink, postInfo);
          } else {
            clearArticleExpiredStatus(article);
            if (postInfo.datetime) {
              article.timestamp = postInfo.datetime;
              article.timestampTitle = postInfo.title || '';
            }
            if (typeof postInfo.content === 'string' && !postInfo.content.includes('加入 Threads 即可分享意見')) {
              article.content = postInfo.content;
            }
            if (Array.isArray(postInfo.tags)) {
              article.tags = postInfo.tags;
            }
            article.timestampUpdatedAt = new Date().toISOString();
            successCount++;
            console.log(`[Popup] 更新成功 (${localIndex}/${articlesNeedingUpdate.length}):`, article.postLink, postInfo);
          }
        } else {
          failCount++;
          console.log(`[Popup] 更新失敗 (${localIndex}/${articlesNeedingUpdate.length}):`, article.postLink);
        }
      } catch (err) {
        failCount++;
        console.error(`[Popup] 更新錯誤 (${localIndex}/${articlesNeedingUpdate.length}):`, article.postLink, err);
      }
      showToast(`進度: ${localIndex}/${articlesNeedingUpdate.length} (成功: ${successCount})`);
    }
  };
  const workers = [];
  for (let i = 0; i < Math.min(maxConcurrency, articlesNeedingUpdate.length); i++) {
    workers.push(runWorker());
  }
  await Promise.all(workers);
  await chrome.storage.local.set({ savedArticles: allArticles });
  filteredArticles = [...allArticles];
  sortArticles();
  renderArticles();
  showToast(`更新完成！成功: ${successCount}, 失敗: ${failCount}`);
}
async function fetchPostInfoViaTab(postLink) {
  let tab = null;
  try {
    const safeUrl = sanitizeUrl(postLink);
    if (safeUrl === '#') {
      console.warn('[Popup] fetchPostTimestampViaTab: 略過不安全的連結', postLink);
      return null;
    }
    tab = await chrome.tabs.create({
      url: safeUrl,
      active: false
    });
    await waitForTabLoad(tab.id);
    const loadedTab = await chrome.tabs.get(tab.id);
    if (!isSameThreadsPostLink(safeUrl, loadedTab?.url || '')) {
      console.warn('[Popup] 頁面已導向非原始貼文，視為失效頁面:', {
        requested: safeUrl,
        actual: loadedTab?.url || ''
      });
      await chrome.tabs.remove(tab.id);
      tab = null;
      return {
        status: 'expired',
        reason: 'redirected'
      };
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPostInfoFromPage,
      args: [safeUrl]
    });
    await chrome.tabs.remove(tab.id);
    tab = null;
    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
    return null;
  } catch (err) {
    console.error('[Popup] fetchPostTimestampViaTab 錯誤:', err);
    if (tab && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {
      }
    }
    return null;
  }
}
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 8000);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
async function extractPostInfoFromPage(requestedPostLink = '') {
  function createExpiredPostResult(reason) {
    return {
      status: 'expired',
      reason,
      datetime: '',
      title: '',
      content: ''
    };
  }
  function findPostElementFromPostLink(postLink) {
    const match = postLink.match(/\/post\/([^\/\?]+)/i);
    if (!match) return null;
    const postId = match[1];
    const links = Array.from(
      document.querySelectorAll(`a[href*="/post/${postId}"]`)
    );
    for (const link of links) {
      const pressable = link.closest('[data-pressable-container]');
      if (pressable) return pressable;
    }
    const timeEl = document.querySelector('time[datetime]');
    if (timeEl) {
      const pressable = timeEl.closest('[data-pressable-container]');
      if (pressable) return pressable;
    }
    return null;
  }
  return new Promise((resolve) => {
    const maxWaitMs = 4000;
    const startTime = Date.now();
    const check = () => {
      const requestedPostElement = requestedPostLink ? findPostElementFromPostLink(requestedPostLink) : null;
      if (requestedPostLink && !requestedPostElement) {
        return false;
      }
      const sourceRoot = requestedPostElement || document;
      let datetime = null;
      let title = '';
      let content = '';
      const timeElement = requestedPostElement?.querySelector('time[datetime]') || null;
      if (timeElement) {
        datetime = timeElement.getAttribute('datetime');
        title = timeElement.getAttribute('title') || '';
      }
      if (!datetime) {
        const metaTime = document.querySelector('meta[property="article:published_time"]');
        if (metaTime) {
          datetime = metaTime.getAttribute('content');
        }
      }
      if (!datetime) {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          try {
            const jsonData = JSON.parse(script.textContent);
            if (jsonData.datePublished) {
              datetime = jsonData.datePublished;
              break;
            }
          } catch (e) {
          }
        }
      }
      if (!content) {
        const contentSpans = sourceRoot.querySelectorAll('span[class*="xo1l8bm"][dir="auto"] > span');
        if (contentSpans.length > 0) {
          content = Array.from(contentSpans)
            .filter(span => !span.closest('h1'))
            .filter(span => !span.closest('button'))
            .filter(span => !span.closest('[role="button"]'))
            .filter(span => !span.closest('[contenteditable="true"]'))
            .map(span => (span.innerText || span.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(text => text && !isLikelyThreadsFallbackDescription(text))
            .filter((text, index, array) => array.indexOf(text) === index)
            .join('\n');
        }
      }
      if (!content) {
        const xi7Spans = sourceRoot.querySelectorAll('span[class*="xi7mnp6"][dir="auto"] > span');
        if (xi7Spans.length > 0) {
          content = Array.from(xi7Spans)
            .filter(span => !span.closest('h1'))
            .filter(span => !span.closest('button'))
            .filter(span => !span.closest('[role="button"]'))
            .filter(span => !span.closest('[contenteditable="true"]'))
            .map(span => (span.innerText || span.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(text => text && !isLikelyThreadsFallbackDescription(text))
            .filter((text, index, array) => array.indexOf(text) === index)
            .join('\n');
        }
      }
      if (!content) {
        const metaDescription = document.querySelector('meta[property="og:description"]');
        if (metaDescription) {
          const metaContent = metaDescription.getAttribute('content') || '';
          if (metaContent && !metaContent.includes('加入 Threads 即可分享意見') && !isLikelyThreadsFallbackDescription(metaContent)) {
            content = metaContent;
          }
        }
      }
      if (requestedPostLink && isLikelyThreadsFallbackDescription([title, content].filter(Boolean).join(' '))) {
        resolve(createExpiredPostResult('fallback-summary'));
        return true;
      }
      if (datetime || content) {
        let tags = [];
        try {
          const tagElements = sourceRoot.querySelectorAll('a[href*="serp_type=tags"], a[href*="tag_id="]');
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
        } catch (err) { }
        if (content) {
          const hashtagRegex = /#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g;
          let match;
          while ((match = hashtagRegex.exec(content)) !== null) {
            tags.push(match[1]);
          }
          const languages = ['JavaScript', 'Python', 'Java', 'C\\+\\+', 'C#', 'HTML', 'CSS', 'SQL', 'TypeScript', 'React', 'Vue', 'Angular'];
          languages.forEach(lang => {
            const pattern = lang.includes('\\') ? lang : `\\b${lang}\\b`;
            if (new RegExp(pattern, 'i').test(content)) {
              tags.push(lang.replace(/\\\+/g, '+'));
            }
          });
        }
        tags = [...new Set(tags.map(t => t.normalize('NFC')))];
        resolve({
          status: 'active',
          datetime,
          title,
          content,
          tags
        });
        return true;
      }
      return false;
    };
    if (check()) return;
    const interval = setInterval(() => {
      if (check() || (Date.now() - startTime > maxWaitMs)) {
        clearInterval(interval);
        if (Date.now() - startTime > maxWaitMs) {
          const requestedPostElement = requestedPostLink ? findPostElementFromPostLink(requestedPostLink) : null;
          if (requestedPostLink && !requestedPostElement) {
            resolve(createExpiredPostResult('post-not-found'));
          } else {
            resolve(null);
          }
        }
      }
    }, 150);
  });
}
function buildThreadsEmbedCode(postLink) {
  if (!postLink) return '';
  const match = postLink.match(/\/post\/([^\/\?]+)/);
  const postId = match ? match[1] : '';
  return (
    `<blockquote class="text-post-media" data-text-post-permalink="${postLink}" data-text-post-version="0" id="ig-tp-${postId}" style=" background:#FFF; border-width: 1px; border-style: solid; border-color: #00000026; border-radius: 16px; max-width:650px; margin: 1px; min-width:270px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);"> <a href="${postLink}" style=" background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%; font-family: -apple-system, BlinkMacSystemFont, sans-serif;" target="_blank"> <div style=" padding: 40px; display: flex; flex-direction: column; align-items: center;"><div style=" display:block; height:32px; width:32px; padding-bottom:20px;"> <svg aria-label="Threads" height="32px" role="img" viewBox="0 0 192 192" width="32px" xmlns="http://www.w3.org/2000/svg"> <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" /></svg></div><div style=" font-size: 15px; line-height: 21px; color: #000000; font-weight: 600; "> 在 Threads 查看</div></div></a></blockquote>\n` +
    `<script async src="https://www.threads.com/embed.js"></script>`
  );
}
function sanitizeUrl(rawUrl, base = 'https://www.threads.com') {
  if (!rawUrl || typeof rawUrl !== 'string') return '#';
  try {
    const url = new URL(rawUrl, base);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return '#';
    }
    return url.href;
  } catch (err) {
    return '#';
  }
}
function extractThreadsPostIdFromLink(link) {
  if (!link || typeof link !== 'string') {
    return '';
  }
  const normalizedLink = link.split('?')[0];
  const match = normalizedLink.match(/\/post\/([^\/]+)$/i) || link.match(/\/post\/([^\/?]+)/i);
  return match ? match[1] : '';
}
function isSameThreadsPostLink(expectedLink, actualLink) {
  const expectedPostId = extractThreadsPostIdFromLink(expectedLink);
  const actualPostId = extractThreadsPostIdFromLink(actualLink);
  return !!expectedPostId && !!actualPostId && expectedPostId === actualPostId;
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
    /^附帶原始貼文的回覆內容$/,
    /\d[\d,.]*\s*位粉絲\s*•\s*\d[\d,.]*\s*則串文/i,
    /\d[\d,.]*\s*followers\s*•\s*\d[\d,.]*\s*threads/i,
    /查看\s*@.+\s*參與的最新對話/i,
    /See\s*what\s*@.+\s*is\s*saying\s*on\s*Threads/i,
  ].some(pattern => pattern.test(normalizedText));
}
function isExpiredArticle(article) {
  return article?.status === 'expired' || !!article?.expiredAt || !!article?.expiredReason;
}
function markArticleAsExpired(article, reason) {
  article.status = 'expired';
  article.expiredAt = article.expiredAt || new Date().toISOString();
  article.expiredReason = reason || article.expiredReason || 'unknown';
  article.expiredCheckedAt = new Date().toISOString();
}
function clearArticleExpiredStatus(article) {
  article.status = 'active';
  delete article.expiredAt;
  delete article.expiredReason;
  delete article.expiredCheckedAt;
}
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    await loadArticles();
    setupEventListeners();
  });
}
async function loadArticles() {
  const result = await chrome.storage.local.get(['savedArticles']);
  allArticles = result.savedArticles || [];
  filteredArticles = [...allArticles];
  sortArticles();
  renderArticles();
  updateFilterValueOptions();
}
function setupEventListeners() {
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'dashboard.html' });
    });
  }
  document.getElementById('searchInput').addEventListener('input', (e) => {
    applyFilters();
  });
  const filterSelect = document.getElementById('filterSelect');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      currentFilterValue = '';
      updateFilterValueOptions();
      applyFilters();
    });
  }
  const filterValueSelect = document.getElementById('filterValueSelect');
  if (filterValueSelect) {
    filterValueSelect.addEventListener('change', (e) => {
      currentFilterValue = e.target.value;
      applyFilters();
    });
  }
  document.getElementById('exportBtn').addEventListener('click', exportAllEmbedCodes);
  const exportFeaturedBtn = document.getElementById('exportFeaturedBtn');
  if (exportFeaturedBtn) {
    exportFeaturedBtn.addEventListener('click', exportFeaturedData);
  }
  const exportFullBtn = document.getElementById('exportFullBtn');
  if (exportFullBtn) {
    exportFullBtn.addEventListener('click', exportFullData);
  }
  document.getElementById('importBtn').addEventListener('click', async () => {
    const existingInput = document.getElementById('importFileInput');
    if (existingInput) {
      existingInput.click();
      return;
    }
    const chooseFile = confirm('要從檔案匯入？按「確定」選擇檔案，按「取消」貼上內容');
    if (chooseFile) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.js,.json';
      input.style.display = 'none';
      input.id = 'importFileInput';
      input.addEventListener('change', async (event) => {
        try {
          await handleImportFile(event);
        } finally {
          setTimeout(() => {
            if (input && input.parentNode) input.parentNode.removeChild(input);
          }, 200);
        }
      });
      document.body.appendChild(input);
      input.click();
    } else {
      const text = prompt('請貼上匯入內容 (JS/JSON)：');
      if (!text) {
        showToast('未貼上內容');
        return;
      }
      try {
        const imported = parseJsEmbedFile(text);
        if (!imported || imported.length === 0) {
          showToast('未辨識到任何匯入項目');
          return;
        }
        const importMode = confirm(
          `找到 ${imported.length} 筆資料。
\n按「確定」合併到現有資料（跳過重複項目）
按「取消」取代所有現有資料`
        );
        const result = await chrome.storage.local.get(['savedArticles']);
        let savedArticles = result.savedArticles || [];
        if (importMode) {
          const existingLinks = new Set(savedArticles.map(a => a.postLink));
          const newArticles = imported.filter(a => !existingLinks.has(a.postLink));
          if (newArticles.length === 0) {
            showToast('所有項目都已存在，無需匯入');
          } else {
            savedArticles = [...savedArticles, ...newArticles];
            await chrome.storage.local.set({ savedArticles });
            allArticles = savedArticles;
            filteredArticles = [...allArticles];
            sortArticles();
            renderArticles();
            showToast(`已匯入 ${newArticles.length} 筆新資料（跳過 ${imported.length - newArticles.length} 筆重複）`);
          }
        } else {
          savedArticles = imported;
          await chrome.storage.local.set({ savedArticles });
          allArticles = savedArticles;
          filteredArticles = [...allArticles];
          sortArticles();
          renderArticles();
          showToast(`已匯入 ${imported.length} 筆資料（取代原有資料）`);
        }
      } catch (err) {
        console.error('[Popup] paste import error', err);
        showToast('貼上匯入失敗: ' + (err.message || '未知錯誤'));
      }
    }
  });
  const importFileInput = document.getElementById('importFileInput');
  if (importFileInput) {
    importFileInput.addEventListener('change', handleImportFile);
  }
  const updateTimestampsBtn = document.getElementById('updateTimestampsBtn');
  if (updateTimestampsBtn) {
    updateTimestampsBtn.addEventListener('click', updateAllTimestamps);
  }
  document.getElementById('clearBtn').addEventListener('click', clearAllArticles);
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    sortArticles();
    renderArticles();
  });
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      toggleSelectAll(e.target.checked);
    });
  }
  const clearSelectionBtn = document.getElementById('clearSelectionBtn');
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', clearSelection);
  }
  updateFilterValueOptions();
}
function applyFilters() {
  const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase();
  filteredArticles = allArticles.filter(article => {
    if (!matchesFilter(article)) {
      return false;
    }
    if (searchTerm) {
      const contentMatch = (article.content || '').toLowerCase().includes(searchTerm);
      const authorMatch = (article.author || '').toLowerCase().includes(searchTerm);
      const tagsMatch = (article.tags || []).some(tag => (tag || '').toLowerCase().includes(searchTerm));
      const codeMatch = (article.codeBlocks || []).some(block =>
        (block.code || '').toLowerCase().includes(searchTerm) ||
        (block.language || '').toLowerCase().includes(searchTerm)
      );
      const embedMatch = (article.embedCode || '').toLowerCase().includes(searchTerm);
      return contentMatch || authorMatch || tagsMatch || codeMatch || embedMatch;
    }
    return true;
  });
  sortArticles();
  renderArticles();
}
function matchesFilter(article) {
  switch (currentFilter) {
    case 'all':
      return true;
    case 'author':
      if (!currentFilterValue) return true;
      return (article.author || '').toLowerCase() === currentFilterValue.toLowerCase();
    case 'tag':
      if (!currentFilterValue) return true;
      return (article.tags || []).some(tag =>
        (tag || '').toLowerCase() === currentFilterValue.toLowerCase()
      );
    case 'noTimestamp':
      if (!article.timestamp) return true;
      if (!article.timestampTitle) {
        const timestamp = new Date(article.timestamp).getTime();
        const savedAt = new Date(article.savedAt).getTime();
        if (Math.abs(timestamp - savedAt) < 60000) return true;
      }
      return false;
    case 'expired':
      return isExpiredArticle(article);
    default:
      return true;
  }
}
function updateFilterValueOptions() {
  const filterValueContainer = document.getElementById('filterValueContainer');
  const filterValueSelect = document.getElementById('filterValueSelect');
  if (!filterValueContainer || !filterValueSelect) return;
  filterValueSelect.innerHTML = '<option value="">全部</option>';
  let values = [];
  switch (currentFilter) {
    case 'author':
      values = [...new Set(allArticles.map(a => a.author).filter(Boolean))];
      values.sort((a, b) => a.localeCompare(b, 'zh-TW'));
      break;
    case 'tag':
      values = [...new Set(allArticles.flatMap(a => a.tags || []).filter(Boolean))];
      values.sort((a, b) => a.localeCompare(b, 'zh-TW'));
      break;
    default:
      filterValueContainer.style.display = 'none';
      return;
  }
  if (values.length > 0) {
    filterValueContainer.style.display = 'flex';
    values.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      filterValueSelect.appendChild(option);
    });
  } else {
    filterValueContainer.style.display = 'none';
  }
}
function sortArticles() {
  const [field, order] = currentSort.split('-');
  filteredArticles.sort((a, b) => {
    let valueA, valueB;
    const parseDate = (dateStr) => {
      if (!dateStr) return 0;
      const parsed = new Date(dateStr).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };
    switch (field) {
      case 'savedAt':
        valueA = parseDate(a.savedAt);
        valueB = parseDate(b.savedAt);
        break;
      case 'timestamp':
        valueA = parseDate(a.timestamp);
        valueB = parseDate(b.timestamp);
        break;
      case 'author':
        valueA = (a.author || '').toLowerCase();
        valueB = (b.author || '').toLowerCase();
        break;
      case 'codeCount':
        valueA = a.codeCount ?? (a.codeBlocks || []).length;
        valueB = b.codeCount ?? (b.codeBlocks || []).length;
        break;
      default:
        valueA = parseDate(a.savedAt);
        valueB = parseDate(b.savedAt);
    }
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      const comparison = valueA.localeCompare(valueB, 'zh-TW');
      return order === 'asc' ? comparison : -comparison;
    }
    if (order === 'asc') {
      return valueA - valueB;
    } else {
      return valueB - valueA;
    }
  });
}
function renderArticles() {
  const container = document.getElementById('articlesContainer');
  const countElement = document.getElementById('articleCount');
  countElement.textContent = `${filteredArticles.length} 篇`;
  if (filteredArticles.length === 0) {
    container.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.innerHTML = '<path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>';
    empty.appendChild(svg);
    const msg = document.createElement('p');
    msg.textContent = allArticles.length === 0 ? '尚未儲存任何程式碼' : '找不到符合的程式碼';
    empty.appendChild(msg);
    if (allArticles.length === 0) {
      const help = document.createElement('p');
      help.className = 'empty-help';
      help.textContent = '在 Threads 含程式碼的文章旁點擊儲存按鈕';
      empty.appendChild(help);
    }
    container.appendChild(empty);
    return;
  }
  container.innerHTML = '';
  filteredArticles.forEach(article => {
    const card = document.createElement('div');
    card.className = 'article-card';
    if (selectedArticleIds.has(article.id)) {
      card.classList.add('selected');
    }
    card.dataset.id = article.id;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'article-checkbox';
    checkbox.checked = selectedArticleIds.has(article.id);
    checkbox.dataset.articleId = article.id;
    card.appendChild(checkbox);
    const header = document.createElement('div');
    header.className = 'article-header';
    const authorEl = document.createElement('div');
    authorEl.className = 'author';
    authorEl.textContent = article.author || '';
    const timeInfo = document.createElement('div');
    timeInfo.className = 'time-info';
    const timePost = document.createElement('div');
    timePost.className = 'time';
    timePost.title = article.timestampTitle || article.timestamp || '';
    timePost.textContent = '發文：' + (article.timestampTitle ? article.timestampTitle : formatTime(article.timestamp));
    const timeSaved = document.createElement('div');
    timeSaved.className = 'time';
    timeSaved.title = article.savedAt || '';
    timeSaved.textContent = '儲存：' + formatTime(article.savedAt);
    timeInfo.appendChild(timePost);
    timeInfo.appendChild(timeSaved);
    header.appendChild(authorEl);
    header.appendChild(timeInfo);
    card.appendChild(header);
    const contentEl = document.createElement('div');
    contentEl.className = 'article-content';
    const contentText = (article.content || '').substring(0, 200);
    contentEl.textContent = contentText + ((article.content || '').length > 200 ? '...' : '');
    card.appendChild(contentEl);
    if (isExpiredArticle(article)) {
      const statusBadge = document.createElement('span');
      statusBadge.className = 'tag';
      statusBadge.textContent = '失效貼文';
      statusBadge.title = article.expiredReason ? `原因：${article.expiredReason}` : '已歸類為失效貼文';
      statusBadge.style.background = 'rgba(255, 48, 64, 0.12)';
      statusBadge.style.color = 'var(--danger-color)';
      statusBadge.style.marginTop = '0';
      card.appendChild(statusBadge);
    }
    if (article.embedCode) {
      const embedWrapper = document.createElement('div');
      embedWrapper.className = 'embed-snippet';
      const pre = document.createElement('pre');
      pre.style.margin = '0';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.overflowWrap = 'anywhere';
      pre.style.wordBreak = 'break-word';
      pre.style.maxWidth = '100%';
      pre.style.boxSizing = 'border-box';
      pre.style.overflowX = 'auto';
      const code = document.createElement('code');
      const embedText = (article.embedCode || '').substring(0, 300) + ((article.embedCode || '').length > 300 ? '\n...' : '');
      code.textContent = embedText;
      pre.appendChild(code);
      embedWrapper.appendChild(pre);
      card.appendChild(embedWrapper);
    }
    if (article.tags && article.tags.length > 0) {
      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'tags';
      article.tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag';
        tagEl.textContent = '#' + (tag || '');
        tagsContainer.appendChild(tagEl);
      });
      card.appendChild(tagsContainer);
    }
    if (article.codeBlocks && article.codeBlocks.length > 0) {
      const blocksContainer = document.createElement('div');
      blocksContainer.className = 'code-blocks';
      article.codeBlocks.forEach((block, idx) => {
        const blockEl = document.createElement('div');
        blockEl.className = 'code-block';
        const headerEl = document.createElement('div');
        headerEl.className = 'code-header';
        const langSpan = document.createElement('span');
        langSpan.className = 'code-language';
        langSpan.textContent = block.language || '';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.setAttribute('data-article-id', article.id);
        copyBtn.setAttribute('data-index', String(idx));
        copyBtn.textContent = '複製';
        headerEl.appendChild(langSpan);
        headerEl.appendChild(copyBtn);
        const blockContent = document.createElement('div');
        blockContent.className = 'code-content';
        const blockPre = document.createElement('pre');
        blockPre.style.margin = '0';
        const blockCode = document.createElement('code');
        const codeText = (block.code || '').substring(0, 500) + ((block.code || '').length > 500 ? '\n...' : '');
        blockCode.textContent = codeText;
        blockPre.appendChild(blockCode);
        blockContent.appendChild(blockPre);
        blockEl.appendChild(headerEl);
        blockEl.appendChild(blockContent);
        blocksContainer.appendChild(blockEl);
      });
      card.appendChild(blocksContainer);
    }
    const actions = document.createElement('div');
    actions.className = 'article-actions';
    const link = document.createElement('a');
    link.className = 'action-btn';
    link.href = sanitizeUrl(article.postLink || '#');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '查看原文';
    actions.appendChild(link);
    if (article.embedCode) {
      const copyEmbedBtn = document.createElement('button');
      copyEmbedBtn.className = 'action-btn copy-embed-btn';
      copyEmbedBtn.setAttribute('data-article-id', article.id);
      copyEmbedBtn.textContent = '複製內嵌程式碼';
      actions.appendChild(copyEmbedBtn);
    }
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn delete-article-btn';
    deleteBtn.setAttribute('data-article-id', article.id);
    deleteBtn.textContent = '刪除';
    actions.appendChild(deleteBtn);
    card.appendChild(actions);
    container.appendChild(card);
  });
  container.querySelectorAll('.copy-embed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const articleId = btn.dataset.articleId;
      copyEmbed(articleId);
    });
  });
  container.querySelectorAll('.refresh-embed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const articleId = btn.dataset.articleId;
      refreshEmbedCode(articleId);
    });
  });
  container.querySelectorAll('.delete-article-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const articleId = btn.dataset.articleId;
      deleteArticle(articleId);
    });
  });
  container.querySelectorAll('.code-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const articleId = btn.dataset.articleId;
      const index = parseInt(btn.dataset.index);
      copyCodeBlock(articleId, index);
    });
  });
  container.querySelectorAll('.article-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const articleId = e.target.dataset.articleId;
      const card = e.target.closest('.article-card');
      if (e.target.checked) {
        selectedArticleIds.add(articleId);
        card.classList.add('selected');
      } else {
        selectedArticleIds.delete(articleId);
        card.classList.remove('selected');
      }
      updateSelectionUI();
    });
  });
  updateSelectionUI();
}
function updateSelectionUI() {
  const countElement = document.getElementById('articleCount');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const selectionInfo = document.getElementById('selectionInfo');
  if (selectedArticleIds.size > 0) {
    countElement.textContent = `${filteredArticles.length} 篇 (已選 ${selectedArticleIds.size})`;
    if (selectionInfo) {
      selectionInfo.textContent = `已選取 ${selectedArticleIds.size} 篇`;
      selectionInfo.style.display = 'inline';
    }
  } else {
    countElement.textContent = `${filteredArticles.length} 篇`;
    if (selectionInfo) {
      selectionInfo.style.display = 'none';
    }
  }
  if (selectAllCheckbox && filteredArticles.length > 0) {
    const allSelected = filteredArticles.every(a => selectedArticleIds.has(a.id));
    const someSelected = filteredArticles.some(a => selectedArticleIds.has(a.id));
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = someSelected && !allSelected;
  }
}
function toggleSelectAll(checked) {
  if (checked) {
    filteredArticles.forEach(a => selectedArticleIds.add(a.id));
  } else {
    filteredArticles.forEach(a => selectedArticleIds.delete(a.id));
  }
  renderArticles();
}
function clearSelection() {
  selectedArticleIds.clear();
  renderArticles();
}
function formatTime(isoString) {
  if (!isoString) return '未知';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '未知';
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return '剛剛';
  if (diffMins < 60) return `${diffMins} 分鐘前`;
  if (diffHours < 24) return `${diffHours} 小時前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
async function deleteArticle(articleId) {
  console.log('[Popup] deleteArticle called with ID:', articleId);
  if (!confirm('確定要刪除這篇文章嗎?')) return;
  allArticles = allArticles.filter(article => article.id !== articleId);
  await chrome.storage.local.set({ savedArticles: allArticles });
  filteredArticles = filteredArticles.filter(article => article.id !== articleId);
  renderArticles();
  showToast('已刪除');
}
if (typeof window !== 'undefined') {
  window.copyArticle = async function (articleId) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return;
    const textToCopy = `${article.author}\n\n${article.content}\n\n來源: ${article.postLink}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast('已複製到剪貼簿');
    } catch (err) {
      console.error('複製失敗:', err);
    }
  };
}
async function copyCodeBlock(articleId, blockIndex) {
  console.log('[Popup] copyCodeBlock called:', articleId, blockIndex);
  const article = allArticles.find(a => a.id === articleId);
  if (!article || !article.codeBlocks || !article.codeBlocks[blockIndex]) return;
  const codeBlock = article.codeBlocks[blockIndex];
  try {
    await navigator.clipboard.writeText(codeBlock.code);
    showToast('已複製程式碼');
  } catch (err) {
    console.error('複製程式碼失敗:', err);
    showToast('複製失敗');
  }
}
if (typeof window !== 'undefined') {
  window.copyAllCode = async function (articleId) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article || !article.codeBlocks || article.codeBlocks.length === 0) return;
    const allCode = article.codeBlocks.map((block, idx) =>
      `// --- ${block.language.toUpperCase()} (Block ${idx + 1}) ---\n${block.code}`
    ).join('\n\n');
    const textToCopy = `${article.author}\n${article.postLink}\n\n${allCode}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast(`已複製 ${article.codeBlocks.length} 個程式碼區塊`);
    } catch (err) {
      console.error('複製失敗:', err);
    }
  };
}
async function copyEmbed(articleId) {
  console.log('[Popup] copyEmbed called with ID:', articleId);
  const article = allArticles.find(a => a.id === articleId);
  console.log('[Popup] Found article:', article ? 'Yes' : 'No');
  console.log('[Popup] Has embedCode:', article?.embedCode ? 'Yes' : 'No');
  if (!article || !article.embedCode) {
    showToast('找不到內嵌程式碼');
    return;
  }
  try {
    await navigator.clipboard.writeText(article.embedCode);
    console.log('[Popup] 複製成功');
    showToast('已複製內嵌程式碼');
  } catch (err) {
    console.error('[Popup] 複製失敗:', err);
    showToast('複製失敗: ' + err.message);
  }
}
async function exportAllEmbedCodes() {
  if (filteredArticles.length === 0) {
    showToast('沒有內嵌程式碼可以匯出');
    return;
  }
  const articlesWithEmbed = filteredArticles.filter(a => a.embedCode);
  if (articlesWithEmbed.length === 0) {
    showToast('沒有內嵌程式碼可以匯出');
    return;
  }
  const postsArray = articlesWithEmbed.map((article) => {
    let blockquoteOnly = article.embedCode;
    let previous;
    do {
      previous = blockquoteOnly;
      blockquoteOnly = blockquoteOnly.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, '');
    } while (blockquoteOnly !== previous);
    blockquoteOnly = blockquoteOnly.trim();
    const escapedCode = blockquoteOnly
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
    return `    '${escapedCode}'`;
  }).join(',\n');
  const jsContent = `const posts = [\n${postsArray}\n];`;
  const blob = new Blob([jsContent], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `threads-embed-codes-${new Date().toISOString().split('T')[0]}.js`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`已匯出 ${articlesWithEmbed.length} 個內嵌程式碼`);
}
async function exportFeaturedData() {
  if (filteredArticles.length === 0) {
    showToast('沒有資料可以匯出');
    return;
  }
  const exportData = filteredArticles.map((article) => {
    let blockquoteOnly = article.embedCode || '';
    let previous;
    do {
      previous = blockquoteOnly;
      blockquoteOnly = blockquoteOnly.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, '');
    } while (blockquoteOnly !== previous);
    blockquoteOnly = blockquoteOnly.trim();
    let author = article.author || '';
    if (author.startsWith('@')) {
      author = author.substring(1);
    }
    return {
      embedCode: blockquoteOnly,
      postLink: article.postLink || '',
      author: author,
      content: article.content || '',
      tags: article.tags || []
    };
  });
  const jsContent = `const posts = ${JSON.stringify(exportData, null, 4)};`;
  const blob = new Blob([jsContent], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `threads-featured-data-${new Date().toISOString().split('T')[0]}.js`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`已匯出 ${exportData.length} 筆精選格式資料`);
}
async function exportFullData() {
  if (filteredArticles.length === 0) {
    showToast('沒有資料可以匯出');
    return;
  }
  const exportData = filteredArticles.map((article) => {
    let blockquoteOnly = article.embedCode || '';
    let previous;
    do {
      previous = blockquoteOnly;
      blockquoteOnly = blockquoteOnly.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, '');
    } while (blockquoteOnly !== previous);
    blockquoteOnly = blockquoteOnly.trim();
    return {
      embedCode: blockquoteOnly,
      postLink: article.postLink || '',
      author: article.author || '',
      content: article.content || '',
      timestamp: article.timestamp || '',
      timestampTitle: article.timestampTitle || '',
      savedAt: article.savedAt || '',
      tags: article.tags || [],
      status: article.status || '',
      expiredAt: article.expiredAt || '',
      expiredReason: article.expiredReason || '',
      expiredCheckedAt: article.expiredCheckedAt || ''
    };
  });
  const jsContent = `const posts = ${JSON.stringify(exportData, null, 4)};`;
  const blob = new Blob([jsContent], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `threads-full-data-${new Date().toISOString().split('T')[0]}.js`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`已匯出 ${exportData.length} 筆完整資料`);
}
async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  try {
    const content = await file.text();
    let importedArticles = [];
    if (file.name.endsWith('.json')) {
      const jsonData = JSON.parse(content);
      if (Array.isArray(jsonData)) {
        importedArticles = jsonData;
      } else if (jsonData.savedArticles && Array.isArray(jsonData.savedArticles)) {
        importedArticles = jsonData.savedArticles;
      } else {
        throw new Error('無效的 JSON 格式');
      }
    } else {
      importedArticles = parseJsEmbedFile(content);
    }
    if (importedArticles.length === 0) {
      showToast('檔案中沒有可匯入的資料');
      return;
    }
    const importMode = confirm(
      `找到 ${importedArticles.length} 筆資料。\n\n` +
      `按「確定」合併到現有資料（跳過重複項目）\n` +
      `按「取消」取代所有現有資料`
    );
    if (importMode) {
      const existingLinks = new Set(allArticles.map(a => a.postLink));
      const newArticles = importedArticles.filter(a => !existingLinks.has(a.postLink));
      if (newArticles.length === 0) {
        showToast('所有項目都已存在，無需匯入');
        return;
      }
      allArticles = [...allArticles, ...newArticles];
      showToast(`已匯入 ${newArticles.length} 筆新資料（跳過 ${importedArticles.length - newArticles.length} 筆重複）`);
    } else {
      allArticles = importedArticles;
      showToast(`已匯入 ${importedArticles.length} 筆資料（取代原有資料）`);
    }
    await chrome.storage.local.set({ savedArticles: allArticles });
    filteredArticles = [...allArticles];
    renderArticles();
  } catch (err) {
    console.error('[Popup] 匯入失敗:', err);
    showToast('匯入失敗：' + (err.message || '檔案格式錯誤'));
  } finally {
    try {
      const target = event && event.target;
      if (target && target.id === 'importFileInput' && target.parentNode) {
        target.parentNode.removeChild(target);
      }
    } catch (e) { }
  }
}
function parseJsEmbedFile(content) {
  const articles = [];
  const jsonArrayMatch = content.match(/(?:const\s+)?posts\s*=\s*(\[[\s\S]*\])/);
  if (jsonArrayMatch) {
    try {
      const jsonStr = jsonArrayMatch[1].trim();
      let jsonData = null;
      try {
        jsonData = JSON.parse(jsonStr);
      } catch (jsonErr) {
        try {
          jsonData = new Function(`return ${jsonStr};`)();
        } catch (fnErr) {
          console.error('[Popup] parseJsEmbedFile new Function 錯誤:', fnErr);
        }
      }
      if (Array.isArray(jsonData) && jsonData.length > 0) {
        if (jsonData[0].timestamp !== undefined || jsonData[0].postLink !== undefined) {
          console.log('[Popup] 識別為完整資料格式');
          return jsonData.map(item => {
            let fullEmbedCode = item.embedCode || '';
            if (fullEmbedCode && !fullEmbedCode.includes('<script')) {
              fullEmbedCode = fullEmbedCode + '\n<script async src="https://www.threads.com/embed.js"></script>';
            }
            return {
              id: item.id || `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              content: item.content || '',
              codeBlocks: item.codeBlocks || [],
              codeCount: item.codeCount || 0,
              author: item.author || '',
              authorUrl: item.authorUrl || '',
              postLink: item.postLink || '',
              embedCode: fullEmbedCode,
              timestamp: item.timestamp || '',
              timestampTitle: item.timestampTitle || '',
              tags: item.tags || [],
              savedAt: item.savedAt || new Date().toISOString(),
              status: item.status || '',
              expiredAt: item.expiredAt || '',
              expiredReason: item.expiredReason || '',
              expiredCheckedAt: item.expiredCheckedAt || '',
              importedFrom: 'full-data-file'
            };
          });
        }
      }
    } catch (e) {
      console.log('[Popup] 不是 JSON 格式，嘗試解析簡易格式', e);
    }
  }
  const arrayMatch = content.match(/(?:const\s+)?posts\s*=\s*\[([\s\S]*?)\];/);
  if (arrayMatch) {
    const arrayContent = arrayMatch[1];
    const embedCodeRegex = /'((?:[^'\\]|\\.)*)'/g;
    let match;
    while ((match = embedCodeRegex.exec(arrayContent)) !== null) {
      let embedCode = match[1];
      embedCode = embedCode
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
      const linkMatch = embedCode.match(/data-text-post-permalink="([^"]+)"/);
      const postLink = linkMatch ? linkMatch[1] : '';
      if (postLink) {
        const usernameMatch = postLink.match(/threads\.(?:com)\/@([^\/]+)/);
        const username = usernameMatch ? `@${usernameMatch[1]}` : '匯入的文章';
        const fullEmbedCode = embedCode + '\n<script async src="https://www.threads.com/embed.js"></script>';
        articles.push({
          id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          content: '',
          codeBlocks: [],
          codeCount: 0,
          author: username,
          authorUrl: usernameMatch ? `https://www.threads.com/@${usernameMatch[1]}` : '',
          postLink: postLink,
          embedCode: fullEmbedCode,
          timestamp: new Date().toISOString(),
          tags: [],
          savedAt: new Date().toISOString(),
          importedFrom: 'js-embed-file'
        });
      }
    }
  }
  return articles;
}
async function clearAllArticles() {
  if (allArticles.length === 0) {
    alert('沒有文章可以清除');
    return;
  }
  if (!confirm(`確定要清除全部 ${allArticles.length} 篇文章嗎？此操作無法復原！`)) {
    return;
  }
  await chrome.storage.local.set({ savedArticles: [] });
  allArticles = [];
  filteredArticles = [];
  renderArticles();
  showToast('已清除所有文章');
}
function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: #000;
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 2000);
}