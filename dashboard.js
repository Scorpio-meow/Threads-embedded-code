let allArticles = [];
let filteredArticles = [];
let currentSort = 'savedAt-desc';
let selectedArticleIds = new Set();
let currentFilter = 'all';
let currentFilterValue = '';
let isUpdatingTimestamps = false;
let isUpdatePaused = false;
let cancelUpdateRequested = false;
let confirmModalResolve = null;
let importModalResolve = null;
document.addEventListener('DOMContentLoaded', async () => {
  await loadArticles();
  setupEventListeners();
  setupModalListeners();
});
async function loadArticles() {
  const result = await chrome.storage.local.get(['savedArticles']);
  allArticles = result.savedArticles || [];
  filteredArticles = [...allArticles];
  calculateStatistics();
  sortArticles();
  renderArticles();
  updateFilterValueOptions();
  renderTagsCloud();
  renderAuthorsCloud();
}
function calculateStatistics() {
  const total = allArticles.length;
  const expired = allArticles.filter(a => isExpiredArticle(a)).length;
  const authors = new Set(allArticles.map(a => a.author).filter(Boolean));
  const uniqueAuthors = authors.size;
  const tags = new Set(allArticles.flatMap(a => a.tags || []).filter(Boolean));
  const uniqueTags = tags.size;
  document.getElementById('totalSavedCount').textContent = total;
  document.getElementById('totalExpiredCount').textContent = expired;
  document.getElementById('uniqueAuthorsCount').textContent = uniqueAuthors;
  document.getElementById('uniqueTagsCount').textContent = uniqueTags;
  if (expired > 0) {
    document.getElementById('totalExpiredCount').classList.add('danger-text');
  } else {
    document.getElementById('totalExpiredCount').classList.remove('danger-text');
  }
}
function renderTagsCloud() {
  const cloudContainer = document.getElementById('tagsCloud');
  if (!cloudContainer) return;
  cloudContainer.innerHTML = '';
  const tagCounts = {};
  allArticles.flatMap(a => a.tags || []).filter(Boolean).forEach(tag => {
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  });
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  if (sortedTags.length === 0) {
    cloudContainer.innerHTML = '<span style="font-size: 12px; color: var(--text-secondary);">暫無標籤</span>';
    return;
  }
  sortedTags.forEach(([tag, count]) => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    if (currentFilter === 'tag' && currentFilterValue === tag) {
      badge.classList.add('active');
    }
    badge.textContent = `#${tag} (${count})`;
    badge.addEventListener('click', () => {
      if (currentFilter === 'tag' && currentFilterValue === tag) {
        currentFilter = 'all';
        currentFilterValue = '';
        document.getElementById('filterSelect').value = 'all';
      } else {
        currentFilter = 'tag';
        currentFilterValue = tag;
        document.getElementById('filterSelect').value = 'tag';
      }
      updateFilterValueOptions();
      const filterValSelect = document.getElementById('filterValueSelect');
      if (filterValSelect) filterValSelect.value = currentFilterValue;
      applyFilters();
    });
    cloudContainer.appendChild(badge);
  });
}
function renderAuthorsCloud() {
  const cloudContainer = document.getElementById('authorsCloud');
  if (!cloudContainer) return;
  cloudContainer.innerHTML = '';
  const authorCounts = {};
  allArticles.map(a => a.author).filter(Boolean).forEach(author => {
    authorCounts[author] = (authorCounts[author] || 0) + 1;
  });
  const sortedAuthors = Object.entries(authorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  if (sortedAuthors.length === 0) {
    cloudContainer.innerHTML = '<span style="font-size: 12px; color: var(--text-secondary);">暫無作者</span>';
    return;
  }
  sortedAuthors.forEach(([author, count]) => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    if (currentFilter === 'author' && currentFilterValue === author) {
      badge.classList.add('active');
    }
    badge.textContent = `${author} (${count})`;
    badge.addEventListener('click', () => {
      if (currentFilter === 'author' && currentFilterValue === author) {
        currentFilter = 'all';
        currentFilterValue = '';
        document.getElementById('filterSelect').value = 'all';
      } else {
        currentFilter = 'author';
        currentFilterValue = author;
        document.getElementById('filterSelect').value = 'author';
      }
      updateFilterValueOptions();
      const filterValSelect = document.getElementById('filterValueSelect');
      if (filterValSelect) filterValSelect.value = currentFilterValue;
      applyFilters();
    });
    cloudContainer.appendChild(badge);
  });
}
function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', () => {
    applyFilters();
  });
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    sortArticles();
    renderArticles();
  });
  const filterSelect = document.getElementById('filterSelect');
  filterSelect.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    currentFilterValue = '';
    updateFilterValueOptions();
    applyFilters();
  });
  const filterValueSelect = document.getElementById('filterValueSelect');
  filterValueSelect.addEventListener('change', (e) => {
    currentFilterValue = e.target.value;
    applyFilters();
  });
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  selectAllCheckbox.addEventListener('change', (e) => {
    toggleSelectAll(e.target.checked);
  });
  document.getElementById('exportBtn').addEventListener('click', exportAllEmbedCodes);
  document.getElementById('exportFeaturedBtn').addEventListener('click', exportFeaturedData);
  document.getElementById('exportFullBtn').addEventListener('click', exportFullData);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleImportFile);
  document.getElementById('updateTimestampsBtn').addEventListener('click', updateAllTimestamps);
  document.getElementById('pauseUpdateBtn')?.addEventListener('click', () => {
    if (!isUpdatingTimestamps) return;
    isUpdatePaused = !isUpdatePaused;
    const pauseBtn = document.getElementById('pauseUpdateBtn');
    const updateStatusBadge = document.getElementById('updateStatusBadge');
    if (isUpdatePaused) {
      if (pauseBtn) {
        pauseBtn.textContent = '繼續';
        pauseBtn.classList.remove('btn-primary');
        pauseBtn.classList.add('btn-warning');
      }
      if (updateStatusBadge) {
        updateStatusBadge.textContent = '已暫停';
        updateStatusBadge.classList.add('paused');
      }
      showToast('貼文更新已暫停');
    } else {
      if (pauseBtn) {
        pauseBtn.textContent = '暫停';
        pauseBtn.classList.remove('btn-warning');
        pauseBtn.classList.add('btn-primary');
      }
      if (updateStatusBadge) {
        updateStatusBadge.textContent = '執行中';
        updateStatusBadge.classList.remove('paused');
      }
      showToast('繼續執行更新');
    }
  });
  document.getElementById('cancelUpdateBtn')?.addEventListener('click', () => {
    if (!isUpdatingTimestamps) return;
    cancelUpdateRequested = true;
    isUpdatePaused = false;
    const cancelBtn = document.getElementById('cancelUpdateBtn');
    if (cancelBtn) cancelBtn.disabled = true;
    const updateStatusBadge = document.getElementById('updateStatusBadge');
    if (updateStatusBadge) updateStatusBadge.textContent = '停止中...';
    showToast('正在停止更新作業...');
  });
  document.getElementById('clearBtn').addEventListener('click', clearAllArticles);
  document.getElementById('batchCopyEmbedBtn').addEventListener('click', batchCopyEmbedCodes);
  document.getElementById('batchDeleteBtn').addEventListener('click', batchDeleteArticles);
}
function setupModalListeners() {
  document.getElementById('modalCloseBtn').addEventListener('click', () => {
    closeConfirmModal(false);
  });
  document.getElementById('modalCancelBtn').addEventListener('click', () => {
    closeConfirmModal(false);
  });
  document.getElementById('modalConfirmBtn').addEventListener('click', () => {
    closeConfirmModal(true);
  });
  document.getElementById('importModalCloseBtn').addEventListener('click', () => {
    closeImportModal(null);
  });
  document.getElementById('importModalCancelBtn').addEventListener('click', () => {
    closeImportModal(null);
  });
  document.getElementById('importModeMerge').addEventListener('click', () => {
    closeImportModal('merge');
  });
  document.getElementById('importModeOverwrite').addEventListener('click', () => {
    closeImportModal('overwrite');
  });
}
function showConfirm(title, message) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMessage').textContent = message;
  document.getElementById('confirmModal').classList.add('active');
  return new Promise((resolve) => {
    confirmModalResolve = resolve;
  });
}
function closeConfirmModal(result) {
  document.getElementById('confirmModal').classList.remove('active');
  if (confirmModalResolve) {
    confirmModalResolve(result);
    confirmModalResolve = null;
  }
}
function showImportModal(count) {
  document.getElementById('importModalMessage').textContent = `偵測到檔案中含有 ${count} 筆文章資料。請選擇匯入模式：`;
  document.getElementById('importModal').classList.add('active');
  return new Promise((resolve) => {
    importModalResolve = resolve;
  });
}
function closeImportModal(mode) {
  document.getElementById('importModal').classList.remove('active');
  if (importModalResolve) {
    importModalResolve(mode);
    importModalResolve = null;
  }
}
function updateFilterValueOptions() {
  const container = document.getElementById('filterValueContainer');
  const select = document.getElementById('filterValueSelect');
  if (!container || !select) return;
  select.innerHTML = '<option value="">全部</option>';
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
      container.style.display = 'none';
      return;
  }
  if (values.length > 0) {
    container.style.display = 'flex';
    values.forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      if (val === currentFilterValue) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  } else {
    container.style.display = 'none';
  }
}
function applyFilters() {
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  filteredArticles = allArticles.filter(article => {
    if (!matchesFilter(article)) return false;
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
  renderTagsCloud();
  renderAuthorsCloud();
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
function sortArticles() {
  const [field, order] = currentSort.split('-');
  filteredArticles.sort((a, b) => {
    let valA, valB;
    const parseDate = (dStr) => {
      if (!dStr) return 0;
      const parsed = new Date(dStr).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };
    switch (field) {
      case 'savedAt':
        valA = parseDate(a.savedAt);
        valB = parseDate(b.savedAt);
        break;
      case 'timestamp':
        valA = parseDate(a.timestamp);
        valB = parseDate(b.timestamp);
        break;
      case 'author':
        valA = (a.author || '').toLowerCase();
        valB = (b.author || '').toLowerCase();
        break;
      case 'codeCount':
        valA = a.codeCount ?? (a.codeBlocks || []).length;
        valB = b.codeCount ?? (b.codeBlocks || []).length;
        break;
      default:
        valA = parseDate(a.savedAt);
        valB = parseDate(b.savedAt);
    }
    if (typeof valA === 'string' && typeof valB === 'string') {
      const cmp = valA.localeCompare(valB, 'zh-TW');
      return order === 'asc' ? cmp : -cmp;
    }
    return order === 'asc' ? valA - valB : valB - valA;
  });
}
function renderArticles() {
  const container = document.getElementById('articlesContainer');
  if (!container) return;
  container.innerHTML = '';
  if (filteredArticles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
      <p class="empty-title">${allArticles.length === 0 ? '尚未儲存任何程式碼' : '找不到符合的貼文'}</p>
      <p class="empty-description">${allArticles.length === 0 ? '請在 Threads 上有程式碼的貼文旁，點選「取得內嵌程式碼」，擴充功能會自動儲存至此面板。' : '請嘗試更換篩選條件或搜尋關鍵字。'}</p>
    `;
    container.appendChild(empty);
    updateSelectionUI();
    return;
  }
  filteredArticles.forEach(article => {
    const card = document.createElement('div');
    card.className = 'article-card';
    if (selectedArticleIds.has(article.id)) {
      card.classList.add('selected');
    }
    card.dataset.id = article.id;
    const chkLabel = document.createElement('label');
    chkLabel.className = 'checkbox-container card-checkbox';
    const chkInput = document.createElement('input');
    chkInput.type = 'checkbox';
    chkInput.className = 'article-checkbox';
    chkInput.checked = selectedArticleIds.has(article.id);
    chkInput.dataset.articleId = article.id;
    const chkMark = document.createElement('span');
    chkMark.className = 'checkmark';
    chkLabel.appendChild(chkInput);
    chkLabel.appendChild(chkMark);
    card.appendChild(chkLabel);
    const wrapper = document.createElement('div');
    wrapper.className = 'card-content-wrapper';
    const header = document.createElement('div');
    header.className = 'card-header';
    const authorEl = document.createElement('span');
    authorEl.className = 'author';
    authorEl.textContent = article.author || '未填寫作者';
    const timeInfo = document.createElement('div');
    timeInfo.className = 'time-info';
    const timePost = document.createElement('div');
    timePost.title = article.timestampTitle || article.timestamp || '';
    timePost.textContent = '發文：' + (article.timestampTitle ? article.timestampTitle : formatTime(article.timestamp));
    const timeSaved = document.createElement('div');
    timeSaved.title = article.savedAt || '';
    timeSaved.textContent = '儲存：' + formatTime(article.savedAt);
    timeInfo.appendChild(timePost);
    timeInfo.appendChild(timeSaved);
    header.appendChild(authorEl);
    header.appendChild(timeInfo);
    wrapper.appendChild(header);
    const bodyEl = document.createElement('div');
    bodyEl.className = 'card-body';
    const rawContent = article.content || '';
    if (rawContent.length > 150) {
      const shortText = rawContent.substring(0, 150);
      const spanText = document.createElement('span');
      spanText.className = 'text-chunk';
      spanText.textContent = shortText + '...';
      bodyEl.appendChild(spanText);
      const expandBtn = document.createElement('button');
      expandBtn.className = 'expand-text-btn';
      expandBtn.textContent = '展開';
      expandBtn.addEventListener('click', () => {
        if (expandBtn.textContent === '展開') {
          spanText.textContent = rawContent;
          expandBtn.textContent = '收起';
        } else {
          spanText.textContent = shortText + '...';
          expandBtn.textContent = '展開';
        }
      });
      bodyEl.appendChild(expandBtn);
    } else {
      bodyEl.textContent = rawContent || '無內文說明';
    }
    wrapper.appendChild(bodyEl);
    if (isExpiredArticle(article)) {
      const badge = document.createElement('div');
      badge.className = 'status-badge expired';
      badge.textContent = `已失效 (${article.expiredReason || '無法解析'})`;
      wrapper.appendChild(badge);
    }
    if (article.tags && article.tags.length > 0) {
      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'card-tags';
      article.tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'card-tag';
        tagEl.textContent = '#' + tag;
        tagEl.addEventListener('click', (e) => {
          e.stopPropagation();
          currentFilter = 'tag';
          currentFilterValue = tag;
          document.getElementById('filterSelect').value = 'tag';
          updateFilterValueOptions();
          const filterValSelect = document.getElementById('filterValueSelect');
          if (filterValSelect) filterValSelect.value = tag;
          applyFilters();
        });
        tagsContainer.appendChild(tagEl);
      });
      wrapper.appendChild(tagsContainer);
    }
    if (article.embedCode) {
      const embedSec = document.createElement('div');
      embedSec.className = 'embed-section';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'embed-toggle';
      toggleBtn.innerHTML = `
        <span>內嵌 JavaScript 原始碼</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      `;
      const embedContent = document.createElement('div');
      embedContent.className = 'embed-content';
      const preEl = document.createElement('pre');
      preEl.textContent = article.embedCode;
      embedContent.appendChild(preEl);
      toggleBtn.addEventListener('click', () => {
        toggleBtn.classList.toggle('active');
        embedContent.classList.toggle('active');
      });
      embedSec.appendChild(toggleBtn);
      embedSec.appendChild(embedContent);
      wrapper.appendChild(embedSec);
    }
    if (article.codeBlocks && article.codeBlocks.length > 0) {
      const blocksContainer = document.createElement('div');
      blocksContainer.className = 'code-blocks';
      article.codeBlocks.forEach((block, index) => {
        const blockEl = document.createElement('div');
        blockEl.className = 'code-block';
        const blockHeader = document.createElement('div');
        blockHeader.className = 'code-header';
        const langLabel = document.createElement('span');
        langLabel.className = 'code-lang';
        langLabel.textContent = block.language || 'code';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.textContent = '複製程式碼';
        copyBtn.addEventListener('click', () => {
          copyTextToClipboard(block.code, '程式碼已複製');
        });
        blockHeader.appendChild(langLabel);
        blockHeader.appendChild(copyBtn);
        const blockContent = document.createElement('div');
        blockContent.className = 'code-content';
        const blockPre = document.createElement('pre');
        const blockCode = document.createElement('code');
        blockCode.textContent = block.code || '';
        blockPre.appendChild(blockCode);
        blockContent.appendChild(blockPre);
        blockEl.appendChild(blockHeader);
        blockEl.appendChild(blockContent);
        blocksContainer.appendChild(blockEl);
      });
      wrapper.appendChild(blocksContainer);
    }
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const viewBtn = document.createElement('a');
    viewBtn.className = 'card-action-btn primary';
    viewBtn.href = sanitizeUrl(article.postLink || '#');
    viewBtn.target = '_blank';
    viewBtn.rel = 'noopener noreferrer';
    viewBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      查看原文
    `;
    actions.appendChild(viewBtn);
    if (article.embedCode) {
      const copyEmbedBtn = document.createElement('button');
      copyEmbedBtn.className = 'card-action-btn';
      copyEmbedBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        複製內嵌代碼
      `;
      copyEmbedBtn.addEventListener('click', () => {
        copyTextToClipboard(article.embedCode, '內嵌代碼已複製');
      });
      actions.appendChild(copyEmbedBtn);
    }
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-action-btn danger';
    deleteBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      刪除
    `;
    deleteBtn.addEventListener('click', () => {
      deleteArticle(article.id);
    });
    actions.appendChild(deleteBtn);
    wrapper.appendChild(actions);
    card.appendChild(wrapper);
    container.appendChild(card);
  });
  container.querySelectorAll('.article-checkbox').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const id = e.target.dataset.articleId;
      const card = e.target.closest('.article-card');
      if (e.target.checked) {
        selectedArticleIds.add(id);
        card.classList.add('selected');
      } else {
        selectedArticleIds.delete(id);
        card.classList.remove('selected');
      }
      updateSelectionUI();
    });
  });
  updateSelectionUI();
}
function updateSelectionUI() {
  const selectAll = document.getElementById('selectAllCheckbox');
  const batchActions = document.getElementById('batchActionsContainer');
  const selInfo = document.getElementById('selectionInfo');
  if (selectedArticleIds.size > 0) {
    selInfo.textContent = `已選取 ${selectedArticleIds.size} 篇`;
    selInfo.style.display = 'inline';
    batchActions.style.opacity = '1';
    batchActions.style.pointerEvents = 'auto';
  } else {
    selInfo.style.display = 'none';
    batchActions.style.opacity = '0.5';
    batchActions.style.pointerEvents = 'none';
  }
  if (selectAll && filteredArticles.length > 0) {
    const allChecked = filteredArticles.every(a => selectedArticleIds.has(a.id));
    const someChecked = filteredArticles.some(a => selectedArticleIds.has(a.id));
    selectAll.checked = allChecked;
    selectAll.indeterminate = someChecked && !allChecked;
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
async function copyTextToClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch (err) {
    console.error('複製失敗:', err);
    showToast('複製失敗，瀏覽器權限受限');
  }
}
function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 2500);
}
async function refreshEmbedCode(articleId) {
  const article = allArticles.find(a => a.id === articleId);
  if (!article || !article.postLink) {
    showToast('找不到文章連結');
    return;
  }
  showToast('正在重新生成嵌入代碼...');
  const newEmbed = buildThreadsEmbedCode(article.postLink);
  if (!newEmbed) {
    showToast('生成失敗');
    return;
  }
  article.embedCode = newEmbed;
  article.lastUpdated = new Date().toISOString();
  await chrome.storage.local.set({ savedArticles: allArticles });
  showToast('嵌入代碼已重新生成');
  calculateStatistics();
  renderArticles();
}
async function batchRegenEmbedCodes() {
  const targets = allArticles.filter(a => selectedArticleIds.has(a.id) && a.postLink);
  if (targets.length === 0) return;
  const confirmed = await showConfirm(
    '批次重新生成確認',
    `您確定要為已選取的 ${targets.length} 篇文章重新生成內嵌程式碼嗎？`
  );
  if (!confirmed) return;
  showToast(`正在重新生成 ${targets.length} 篇文章的嵌入代碼...`);
  let successCount = 0;
  targets.forEach(article => {
    const newEmbed = buildThreadsEmbedCode(article.postLink);
    if (newEmbed) {
      article.embedCode = newEmbed;
      article.lastUpdated = new Date().toISOString();
      successCount++;
    }
  });
  await chrome.storage.local.set({ savedArticles: allArticles });
  selectedArticleIds.clear();
  calculateStatistics();
  renderArticles();
  showToast(`完成！成功重新生成 ${successCount} 篇`);
}
async function batchCopyEmbedCodes() {
  const targets = allArticles.filter(a => selectedArticleIds.has(a.id) && a.embedCode);
  if (targets.length === 0) {
    showToast('選取文章中不包含任何內嵌程式碼');
    return;
  }
  const codes = targets.map(article => {
    let blockquoteOnly = article.embedCode;
    let previous;
    do {
      previous = blockquoteOnly;
      blockquoteOnly = blockquoteOnly.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, '');
    } while (blockquoteOnly !== previous);
    blockquoteOnly = blockquoteOnly.trim();
    return blockquoteOnly;
  }).join('\n\n');
  await copyTextToClipboard(codes, `已批次複製 ${targets.length} 篇內嵌程式碼`);
}
async function deleteArticle(articleId) {
  const article = allArticles.find(a => a.id === articleId);
  const authorName = article ? article.author : '此貼文';
  const confirmed = await showConfirm(
    '刪除貼文確認',
    `您確定要刪除由 ${authorName} 發布的儲存程式碼嗎？此動作將無法還原。`
  );
  if (!confirmed) return;
  allArticles = allArticles.filter(a => a.id !== articleId);
  await chrome.storage.local.set({ savedArticles: allArticles });
  selectedArticleIds.delete(articleId);
  applyFilters();
  calculateStatistics();
  showToast('已刪除貼文');
}
async function batchDeleteArticles() {
  if (selectedArticleIds.size === 0) return;
  const count = selectedArticleIds.size;
  const confirmed = await showConfirm(
    '批次刪除確認',
    `您確定要完全刪除已選取的 ${count} 篇文章嗎？此動作將無法還原！`
  );
  if (!confirmed) return;
  allArticles = allArticles.filter(a => !selectedArticleIds.has(a.id));
  await chrome.storage.local.set({ savedArticles: allArticles });
  selectedArticleIds.clear();
  applyFilters();
  calculateStatistics();
  showToast(`已批次刪除 ${count} 篇文章`);
}
async function clearAllArticles() {
  if (allArticles.length === 0) {
    showToast('目前無任何文章資料');
    return;
  }
  const confirmed = await showConfirm(
    '清除全部資料',
    `【警告】您確定要清除目前儲存的所有 ${allArticles.length} 篇資料嗎？此操作將會完全清空擴充功能資料庫，且無法還原！`
  );
  if (!confirmed) return;
  allArticles = [];
  filteredArticles = [];
  selectedArticleIds.clear();
  await chrome.storage.local.set({ savedArticles: [] });
  applyFilters();
  calculateStatistics();
  showToast('資料庫已清空');
}
async function refreshAllEmbedCodes() {
  const confirmed = await showConfirm(
    '重新生成全部',
    `您確定要為目前已儲存的 ${allArticles.length} 篇貼文重新生成嵌入程式碼嗎？`
  );
  if (!confirmed) return;
  showToast('正在重新生成全部嵌入代碼...');
  let successCount = 0;
  allArticles.forEach(article => {
    if (article.postLink) {
      const newEmbed = buildThreadsEmbedCode(article.postLink);
      if (newEmbed) {
        article.embedCode = newEmbed;
        article.lastUpdated = new Date().toISOString();
        successCount++;
      }
    }
  });
  await chrome.storage.local.set({ savedArticles: allArticles });
  renderArticles();
  showToast(`完成！成功重新生成 ${successCount} 篇`);
}
async function updateAllTimestamps() {
  const updateBtn = document.getElementById('updateTimestampsBtn');
  const updateControlsContainer = document.getElementById('updateControlsContainer');
  const updateProgressText = document.getElementById('updateProgressText');
  const updateProgressFill = document.getElementById('updateProgressFill');
  const updateStatusBadge = document.getElementById('updateStatusBadge');
  const pauseUpdateBtn = document.getElementById('pauseUpdateBtn');
  const cancelUpdateBtn = document.getElementById('cancelUpdateBtn');
  const updatingStatItem = document.getElementById('updatingStatItem');
  const updatingProgressCount = document.getElementById('updatingProgressCount');
  if (isUpdatingTimestamps) {
    showToast('更新作業已在進行中');
    return;
  }
  const baseArticles = selectedArticleIds.size > 0
    ? filteredArticles.filter(a => selectedArticleIds.has(a.id))
    : filteredArticles;
  if (baseArticles.length === 0) {
    showToast('沒有文章可以更新');
    return;
  }
  const articlesNeedingUpdate = baseArticles.filter(a => a.postLink);
  if (articlesNeedingUpdate.length === 0) {
    showToast('沒有有效的文章連結');
    return;
  }
  const isBatch = selectedArticleIds.size > 0;
  const confirmed = await showConfirm(
    '更新貼文資料',
    `確定要更新${isBatch ? '已選取的' : '全部'} ${articlesNeedingUpdate.length} 篇文章的精確發文時間和內文嗎？\n\n系統將重用單一背景分頁依序快速抓取 Threads 貼文，可能需要一些時間。抓取完畢後分頁將自動關閉。`
  );
  if (!confirmed) return;
  isUpdatingTimestamps = true;
  isUpdatePaused = false;
  cancelUpdateRequested = false;
  if (updateBtn) updateBtn.classList.add('is-hidden');
  if (updateControlsContainer) updateControlsContainer.classList.remove('is-hidden');
  if (pauseUpdateBtn) {
    pauseUpdateBtn.textContent = '暫停';
    pauseUpdateBtn.classList.remove('btn-warning');
    pauseUpdateBtn.classList.add('btn-primary');
    pauseUpdateBtn.disabled = false;
  }
  if (cancelUpdateBtn) cancelUpdateBtn.disabled = false;
  if (updateStatusBadge) {
    updateStatusBadge.textContent = '執行中';
    updateStatusBadge.classList.remove('paused');
  }
  if (updateProgressText) updateProgressText.textContent = `更新中 (0/${articlesNeedingUpdate.length})`;
  if (updateProgressFill) updateProgressFill.style.width = '0%';
  if (updatingStatItem) updatingStatItem.classList.remove('is-hidden');
  if (updatingProgressCount) updatingProgressCount.textContent = `0/${articlesNeedingUpdate.length}`;
  showToast(`正在背景更新資料... (0/${articlesNeedingUpdate.length})`);
  let successCount = 0;
  let failCount = 0;
  let currentIndex = 0;
  let workerTab = null;
  async function getOrCreateWorkerTab() {
    if (workerTab && workerTab.id) {
      try {
        const tab = await chrome.tabs.get(workerTab.id);
        if (tab) return workerTab.id;
      } catch (e) {
        workerTab = null;
      }
    }
    try {
      workerTab = await chrome.tabs.create({
        url: 'about:blank',
        active: false
      });
      return workerTab.id;
    } catch (e) {
      console.error('[Dashboard] 建立背景分頁失敗:', e);
      return null;
    }
  }
  async function closeWorkerTab() {
    if (workerTab && workerTab.id) {
      try {
        await chrome.tabs.remove(workerTab.id);
      } catch (e) { }
      workerTab = null;
    }
  }
  try {
    for (const article of articlesNeedingUpdate) {
      if (cancelUpdateRequested) {
        console.log('[Dashboard] 使用者取消批次更新');
        break;
      }
      while (isUpdatePaused && !cancelUpdateRequested) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      if (cancelUpdateRequested) {
        console.log('[Dashboard] 使用者取消批次更新');
        break;
      }
      currentIndex++;
      const progressPct = Math.round((currentIndex / articlesNeedingUpdate.length) * 100);
      if (updateProgressText) {
        updateProgressText.textContent = `更新中 (${currentIndex}/${articlesNeedingUpdate.length})`;
      }
      if (updateProgressFill) {
        updateProgressFill.style.width = `${progressPct}%`;
      }
      if (updatingProgressCount) {
        updatingProgressCount.textContent = `${currentIndex}/${articlesNeedingUpdate.length}`;
      }
      try {
        const tabId = await getOrCreateWorkerTab();
        if (!tabId) {
          failCount++;
          continue;
        }
        const postInfo = await fetchPostInfoWithReusableTab(tabId, article.postLink);
        if (postInfo) {
          if (postInfo.status === 'expired') {
            markArticleAsExpired(article, postInfo.reason);
            failCount++;
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
          }
        } else {
          await closeWorkerTab();
          failCount++;
        }
      } catch (err) {
        console.error('[Dashboard] 擷取錯誤:', err);
        await closeWorkerTab();
        failCount++;
      }
      await chrome.storage.local.set({ savedArticles: allArticles });
      calculateStatistics();
      renderTagsCloud();
      renderAuthorsCloud();
      updateFilterValueOptions();
      applyFilters();
      if (!isUpdatePaused) {
        showToast(`更新進度: ${currentIndex}/${articlesNeedingUpdate.length} (成功: ${successCount})`);
      }
    }
  } finally {
    await closeWorkerTab();
    isUpdatingTimestamps = false;
    isUpdatePaused = false;
    cancelUpdateRequested = false;
    if (updateControlsContainer) updateControlsContainer.classList.add('is-hidden');
    if (updateBtn) updateBtn.classList.remove('is-hidden');
    if (updatingStatItem) updatingStatItem.classList.add('is-hidden');
    selectedArticleIds.clear();
    calculateStatistics();
    renderTagsCloud();
    renderAuthorsCloud();
    updateFilterValueOptions();
    applyFilters();
    if (currentIndex < articlesNeedingUpdate.length && cancelUpdateRequested) {
      showToast(`更新已中途停止！已處理: ${currentIndex}/${articlesNeedingUpdate.length} (成功: ${successCount}, 失敗/失效: ${failCount})`);
    } else {
      showToast(`資料更新完成！成功: ${successCount}, 失敗/失效: ${failCount}`);
    }
  }
}
async function fetchPostInfoWithReusableTab(tabId, postLink) {
  try {
    const safeUrl = sanitizeUrl(postLink);
    if (safeUrl === '#') return null;
    await chrome.tabs.update(tabId, { url: safeUrl });
    await waitForTabNavigation(tabId, 4500);
    const loadedTab = await chrome.tabs.get(tabId);
    if (!isSameThreadsPostLink(safeUrl, loadedTab?.url || '')) {
      return {
        status: 'expired',
        reason: 'redirected'
      };
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: extractPostInfoFromPage,
      args: [safeUrl]
    });
    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
    return null;
  } catch (err) {
    console.error('[Dashboard] fetchPostInfoWithReusableTab 錯誤:', err);
    return null;
  }
}
function waitForTabNavigation(tabId, timeoutMs = 4500) {
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(false);
      }
    }, timeoutMs);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(true);
        }
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
    const match = postLink.match(/\/(post|t)\/([^\/\?]+)/i);
    if (!match) return null;
    const postId = match[2];
    const links = Array.from(document.querySelectorAll(`a[href*="/post/${postId}"], a[href*="/t/${postId}"]`));
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
  return new Promise((resolve) => {
    const maxWaitMs = 3500;
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
          } catch (e) { }
        }
      }
      if (!content) {
        let rawContainers = Array.from(
          sourceRoot.querySelectorAll(
            'span[class*="xo1l8bm"][dir="auto"], ' +
            'span[class*="xi7mnp6"][dir="auto"], ' +
            'div[class*="x1iorvi4"][dir="auto"]'
          )
        );
        if (rawContainers.length === 0) {
          rawContainers = Array.from(
            sourceRoot.querySelectorAll(
              'div[data-pagelet="threads_post_page_0"] div[dir="auto"], ' +
              'div[dir="auto"]'
            )
          );
        }
        const candidateContainers = rawContainers.filter(container => {
          if (container.closest('h1') || container.closest('h2') || container.closest('h3') || container.closest('[aria-label="直欄標題"]')) return false;
          if (container.closest('button') || container.closest('[role="button"]') || container.querySelector('button') || container.querySelector('[role="button"]')) return false;
          if (container.closest('[contenteditable="true"]')) return false;
          if (container.closest('time') || container.querySelector('time')) return false;
          if (container.closest('a[href*="/post/"]') || container.closest('a[href*="/t/"]') || container.querySelector('a[href*="/post/"]') || container.querySelector('a[href*="/t/"]')) return false;
          if (container.closest('a[href*="/@"]')) return false;
          if (container.closest('picture') || container.closest('video') || container.closest('canvas') || container.closest('[aria-roledescription="slide"]') || container.querySelector('img, video, picture, canvas')) return false;
          if (container.closest('.x6s0dn4.xmixu3c.x78zum5.xsag5q8.x1y1aw1k')) return false;
          let parent = container.parentElement;
          while (parent && parent !== sourceRoot) {
            const text = parent.textContent;
            if (text.includes('在貼文中提及') && text.includes('@meta.ai') && text.includes('即可在這裡獲得解答')) {
              return false;
            }
            parent = parent.parentElement;
          }
          return true;
        });
        const topContainers = candidateContainers.filter(el =>
          !candidateContainers.some(other => other !== el && other.contains(el))
        );
        const extractedTexts = topContainers
          .map(el => (el.innerText || el.textContent || '').trim())
          .map(text => cleanExtractedPostContent(text))
          .filter(text => text && !isLikelyThreadsFallbackDescription(text))
          .filter((text, index, array) => array.indexOf(text) === index);
        if (extractedTexts.length > 0) {
          content = cleanExtractedPostContent(extractedTexts.join('\n\n'));
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
      if (requestedPostLink && [title, content].filter(Boolean).some(text => isLikelyThreadsFallbackDescription(text))) {
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
    }, 80);
  });
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
function sanitizeUrl(rawUrl, base = 'https://www.threads.com') {
  if (!rawUrl || typeof rawUrl !== 'string') return '#';
  try {
    const url = new URL(rawUrl, base);
    if (!['http:', 'https:'].includes(url.protocol)) return '#';
    return url.href;
  } catch (err) {
    return '#';
  }
}
function extractThreadsPostIdFromLink(link) {
  if (!link || typeof link !== 'string') return '';
  const normalizedLink = link.split('?')[0];
  const match = normalizedLink.match(/\/(post|t)\/([^\/]+)$/i) || link.match(/\/(post|t)\/([^\/?]+)/i);
  return match ? match[2] : '';
}
function isSameThreadsPostLink(expectedLink, actualLink) {
  const expectedPostId = extractThreadsPostIdFromLink(expectedLink);
  const actualPostId = extractThreadsPostIdFromLink(actualLink);
  return !!expectedPostId && !!actualPostId && expectedPostId === actualPostId;
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
  downloadFile(jsContent, `threads-embed-codes-${new Date().toISOString().split('T')[0]}.js`, 'text/javascript');
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
  downloadFile(jsContent, `threads-featured-data-${new Date().toISOString().split('T')[0]}.js`, 'text/javascript');
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
  downloadFile(jsContent, `threads-full-data-${new Date().toISOString().split('T')[0]}.js`, 'text/javascript');
  showToast(`已匯出 ${exportData.length} 筆完整資料`);
}
function downloadFile(content, fileName, contentType) {
  const blob = new Blob([content], { type: `${contentType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
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
    const mode = await showImportModal(importedArticles.length);
    if (!mode) {
      showToast('已取消匯入');
      return;
    }
    if (mode === 'merge') {
      const existingLinks = new Set(allArticles.map(a => a.postLink));
      const newArticles = importedArticles.filter(a => !existingLinks.has(a.postLink));
      if (newArticles.length === 0) {
        showToast('所有項目都已存在，無需匯入');
        return;
      }
      allArticles = [...allArticles, ...newArticles];
      showToast(`已匯入 ${newArticles.length} 筆新資料（跳過 ${importedArticles.length - newArticles.length} 筆重複）`);
    } else if (mode === 'overwrite') {
      allArticles = importedArticles;
      showToast(`已匯入 ${importedArticles.length} 筆資料（取代原有資料）`);
    }
    await chrome.storage.local.set({ savedArticles: allArticles });
    applyFilters();
    calculateStatistics();
  } catch (err) {
    console.error('[Dashboard] 匯入失敗:', err);
    showToast('匯入失敗：' + (err.message || '檔案格式錯誤'));
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
          console.error('[Dashboard] parseJsEmbedFile new Function 錯誤:', fnErr);
        }
      }
      if (Array.isArray(jsonData) && jsonData.length > 0) {
        if (jsonData[0].timestamp !== undefined || jsonData[0].postLink !== undefined) {
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
              expiredCheckedAt: item.expiredCheckedAt || ''
            };
          });
        }
      }
    } catch (e) {
      console.log('[Dashboard] JSON 格式解析失敗，嘗試解析簡易格式', e);
    }
  }
  const arrayMatch = content.match(/(?:const\s+)?posts\s*=\s*\[([\s\S]*?)\];/);
  if (arrayMatch) {
    const arrayContent = arrayMatch[1];
    const embedCodeRegex = /'((?:[^'\\]|\\.)*)'/g;
    let match;
    while ((match = embedCodeRegex.exec(arrayContent)) !== null) {
      let embedCode = match[1];
      embedCode = embedCode.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
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
          savedAt: new Date().toISOString()
        });
      }
    }
  }
  return articles;
}