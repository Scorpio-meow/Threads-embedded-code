// 在 Worker 裡執行擴充功能自己的清洗函式。
// content.js 只有在 window 與 document 都存在時才會啟動頁面監聽，所以在這裡載入只會定義函式。
// 名稱不能和 content.js 的函式宣告相同，否則載入時會出現重複宣告錯誤。
let cleanText;
let isNoiseLine;

self.addEventListener('message', async ({ data }) => {
  if (data.type === 'load') {
    try {
      const ruleCount = await loadContentScript(data.url);
      self.postMessage({ type: 'ready', ruleCount });
    } catch (error) {
      self.postMessage({ type: 'error', message: error.message });
    }
    return;
  }
  if (data.type === 'clean') {
    self.postMessage({ type: 'result', id: data.id, ...analyse(data.text) });
  }
});

async function loadContentScript(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const source = await response.text();
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    importScripts(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  cleanText = self.cleanExtractedPostContent;
  isNoiseLine = self.isLikelyThreadsFallbackDescription;
  if (typeof cleanText !== 'function' || typeof isNoiseLine !== 'function') {
    throw new Error('content.js 裡找不到 cleanExtractedPostContent 或 isLikelyThreadsFallbackDescription');
  }

  // 用一個不會命中任何規則的字元探測，每條規則都會被測試一次，次數就是規則數。
  return traceRegexTests(() => isNoiseLine('\u0000')).tests.length;
}

// 暫時包住 RegExp.prototype.test，記下這次呼叫測試過哪些規則、哪一條命中。
function traceRegexTests(run) {
  const nativeTest = RegExp.prototype.test;
  const tests = [];
  RegExp.prototype.test = function (input) {
    const matched = nativeTest.call(this, input);
    tests.push({ pattern: String(this), matched });
    return matched;
  };
  try {
    return { value: run(), tests };
  } finally {
    RegExp.prototype.test = nativeTest;
  }
}

// 清洗只會刪除整行，或截掉整段文字最前、最後的計數與翻譯按鈕。
// 因此依序對照原始行與輸出行，就能標出每一行的去留。
function analyse(text) {
  const output = cleanText(text);
  const normalize = (line) => line.replace(/\s+/g, ' ').trim();
  const survivors = output.split('\n').map(normalize).filter(Boolean);
  let next = 0;

  const lines = text.split('\n').map((raw) => {
    const line = normalize(raw);
    if (!line) return { state: 'blank', text: raw };

    const survivor = survivors[next];
    if (survivor !== undefined) {
      if (line === survivor) {
        next += 1;
        return { state: 'kept', text: raw };
      }
      const headTrimmed = next === 0 && line.endsWith(survivor);
      const tailTrimmed = next === survivors.length - 1 && line.startsWith(survivor);
      if (headTrimmed || tailTrimmed) {
        next += 1;
        return { state: 'trimmed', text: raw };
      }
    }

    const trace = traceRegexTests(() => isNoiseLine(line));
    const hit = trace.value ? trace.tests.find((test) => test.matched) : undefined;
    return {
      state: 'removed',
      text: raw,
      reason: hit ? { kind: 'rule', pattern: hit.pattern } : { kind: 'pipeline' }
    };
  });

  return { output, lines };
}
