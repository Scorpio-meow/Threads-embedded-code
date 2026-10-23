const ARTICLE_KEY_PREFIX = 'post:';
const LEGACY_ARTICLES_KEY = 'savedArticles';
const ARTICLE_UPDATE_FIELDS = ['timestamp', 'timestampTitle', 'content', 'tags', 'status', 'expiredAt', 'expiredReason', 'expiredCheckedAt', 'timestampUpdatedAt', 'embeddable', 'embeddableCheckedAt'];
const THEME_PREFERENCE_KEY = 'themePreference';
const EMBED_CHECK_TIMEOUT_MS = 10000;
function getThreadsEmbedPath(postLink) {
  if (!postLink || typeof postLink !== 'string') return '';
  const cleanLink = postLink.split('?')[0].replace(/\/+$/, '');
  const userPostMatch = cleanLink.match(/(?:threads\.net|threads\.com)\/@([^\/]+)\/post\/([^\/\?]+)/i);
  if (userPostMatch) {
    return `/@${encodeURIComponent(userPostMatch[1])}/post/${encodeURIComponent(userPostMatch[2])}/embed`;
  }
  const tMatch = cleanLink.match(/(?:threads\.net|threads\.com)\/t\/([^\/\?]+)/i);
  if (tMatch) {
    return `/t/${encodeURIComponent(tMatch[1])}/embed`;
  }
  return '';
}
async function checkEmbeddable(embedUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(embedUrl, { credentials: 'omit', cache: 'no-store', signal: controller.signal });
    if (response.status === 500) return false;
    if (response.ok && (await response.text()).includes('class="Embed"')) return true;
  } catch (_) { } finally {
    clearTimeout(timer);
  }
  return null;
}
function applyEmbeddableResult(article, embeddable) {
  if (typeof embeddable !== 'boolean') return false;
  article.embeddable = embeddable;
  article.embeddableCheckedAt = new Date().toISOString();
  return true;
}
function pickEmbeddableFields(article) {
  if (typeof article.embeddable !== 'boolean') return {};
  return { embeddable: article.embeddable, embeddableCheckedAt: article.embeddableCheckedAt || '' };
}
function getTagGroups(articles) {
  const groups = new Map();
  articles.forEach((article) => {
    const seenKeys = new Set();
    (article.tags || []).forEach((tag) => {
      if (!tag) return;
      const key = String(tag).toLowerCase();
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      if (!groups.has(key)) {
        groups.set(key, { key, count: 0, spellings: new Map() });
      }
      const group = groups.get(key);
      group.count++;
      group.spellings.set(tag, (group.spellings.get(tag) || 0) + 1);
    });
  });
  return [...groups.values()].map((group) => {
    let label = '';
    let labelCount = 0;
    group.spellings.forEach((count, spelling) => {
      if (count > labelCount) {
        label = spelling;
        labelCount = count;
      }
    });
    return { key: group.key, label, count: group.count };
  });
}
function getArticleStorageKey(article) {
  const cleanLink = typeof article.postLink === 'string' ? article.postLink.split(/[?#]/)[0].replace(/\/+$/, '') : '';
  const match = cleanLink.match(/(?:\/|^)(?:post|t)\/([a-zA-Z0-9_-]+)/i);
  return ARTICLE_KEY_PREFIX + (match ? match[1] : `id:${article.id}`);
}
function isArticleStorageKey(key) {
  return key.startsWith(ARTICLE_KEY_PREFIX);
}
function toArticleRecords(articles) {
  const records = {};
  articles.forEach((article) => {
    const key = getArticleStorageKey(article);
    if (!(key in records)) {
      records[key] = article;
    }
  });
  return records;
}
function sortArticlesBySavedAt(articles) {
  const savedTime = (article) => {
    const parsed = new Date(article.savedAt || '').getTime();
    return isNaN(parsed) ? 0 : parsed;
  };
  return articles
    .map((article) => ({ article, time: savedTime(article) }))
    .sort((a, b) => b.time - a.time)
    .map((entry) => entry.article);
}
async function migrateLegacyArticles() {
  const result = await chrome.storage.local.get([LEGACY_ARTICLES_KEY]);
  const legacyArticles = result[LEGACY_ARTICLES_KEY];
  if (!Array.isArray(legacyArticles)) return;
  const records = toArticleRecords(legacyArticles);
  const keys = Object.keys(records);
  if (keys.length > 0) {
    const existing = await chrome.storage.local.get(keys);
    const missing = {};
    keys.forEach((key) => {
      if (!(key in existing)) {
        missing[key] = records[key];
      }
    });
    if (Object.keys(missing).length > 0) {
      await chrome.storage.local.set(missing);
    }
    const written = await chrome.storage.local.get(keys);
    const absentCount = keys.filter((key) => !(key in written)).length;
    if (absentCount > 0) {
      throw new Error(`搬移後仍缺少 ${absentCount} 篇貼文，已保留舊資料`);
    }
  }
  await chrome.storage.local.remove(LEGACY_ARTICLES_KEY);
  console.log(`[Threadkeep] 已將 ${legacyArticles.length} 筆舊資料搬移為 ${keys.length} 篇（合併 ${legacyArticles.length - keys.length} 筆重複）`);
}
async function loadArticleRecords() {
  await migrateLegacyArticles();
  const items = await chrome.storage.local.get(null);
  return sortArticlesBySavedAt(Object.keys(items).filter(isArticleStorageKey).map((key) => items[key]));
}
async function saveArticleRecords(articles) {
  if (articles.length === 0) return;
  await chrome.storage.local.set(toArticleRecords(articles));
}
async function removeArticleRecords(articles) {
  const keys = [...new Set(articles.map(getArticleStorageKey))];
  if (keys.length === 0) return;
  await chrome.storage.local.remove(keys);
}
async function replaceAllArticleRecords(currentArticles, nextArticles) {
  const records = toArticleRecords(nextArticles);
  if (Object.keys(records).length > 0) {
    await chrome.storage.local.set(records);
  }
  const staleKeys = [...new Set(currentArticles.map(getArticleStorageKey))].filter((key) => !(key in records));
  if (staleKeys.length > 0) {
    await chrome.storage.local.remove(staleKeys);
  }
  return sortArticlesBySavedAt(Object.values(records));
}
async function mergeArticleUpdates(articles) {
  const records = toArticleRecords(articles);
  const keys = Object.keys(records);
  if (keys.length === 0) return;
  const stored = await chrome.storage.local.get(keys);
  const updates = {};
  keys.forEach((key) => {
    if (!(key in stored)) return;
    const merged = { ...stored[key] };
    ARTICLE_UPDATE_FIELDS.forEach((field) => {
      if (field in records[key]) {
        merged[field] = records[key][field];
      } else {
        delete merged[field];
      }
    });
    updates[key] = merged;
  });
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}
function applyStoredArticleChanges(currentArticles, changes) {
  const changedKeys = Object.keys(changes).filter(isArticleStorageKey);
  if (changedKeys.length === 0) {
    return { articles: currentArticles, changed: false };
  }
  const byKey = new Map(currentArticles.map((article) => [getArticleStorageKey(article), article]));
  let changed = false;
  changedKeys.forEach((key) => {
    const { newValue } = changes[key];
    const current = byKey.get(key);
    if (newValue === undefined) {
      if (current) {
        byKey.delete(key);
        changed = true;
      }
    } else if (!current || JSON.stringify(current) !== JSON.stringify(newValue)) {
      byKey.set(key, newValue);
      changed = true;
    }
  });
  return { articles: changed ? sortArticlesBySavedAt([...byKey.values()]) : currentArticles, changed };
}