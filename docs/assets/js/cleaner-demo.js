// 「只留下作者寫的字」互動示範：把輸入交給 Worker 執行 content.js 的清洗函式，再畫出逐行比對。
(() => {
  const root = document.querySelector('[data-demo]');
  if (!root) return;

  const INPUT_DEBOUNCE_MS = 160;
  const site = window.ThreadsSaverSite;

  const input = root.querySelector('[data-demo-input]');
  const statusText = root.querySelector('[data-demo-status]');
  const diffList = root.querySelector('[data-demo-diff]');
  const outputCode = root.querySelector('[data-demo-output]');
  const summary = root.querySelector('[data-demo-summary]');
  const errorBox = root.querySelector('[data-demo-error]');
  const errorText = root.querySelector('[data-demo-error-text]');
  const retryButton = root.querySelector('[data-demo-retry]');
  const sampleButtons = [...root.querySelectorAll('[data-demo-sample]')];
  const samples = new Map(
    [...document.querySelectorAll('[data-demo-sample-text]')].map((element) => [
      element.dataset.demoSampleText,
      element.textContent
    ])
  );

  let worker = null;
  let latestRequest = 0;
  let debounceTimer = null;

  sampleButtons.forEach((button) => {
    button.addEventListener('click', () => showSample(button.dataset.demoSample));
  });
  input.addEventListener('input', () => {
    markSample(null);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(requestClean, INPUT_DEBOUNCE_MS);
  });
  retryButton.addEventListener('click', start);

  showSample(sampleButtons.find((button) => button.getAttribute('aria-pressed') === 'true').dataset.demoSample);
  start();

  function showSample(name) {
    input.value = samples.get(name);
    markSample(name);
    requestClean();
  }

  function markSample(name) {
    sampleButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.demoSample === name));
    });
  }

  function setState(state, message) {
    root.dataset.state = state;
    statusText.textContent = message;
    errorBox.hidden = state !== 'error';
  }

  function start() {
    worker?.terminate();
    setState('loading', '正在從 GitHub 載入 content.js');
    summary.textContent = '';
    worker = new Worker(root.dataset.worker);
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', (event) => fail(event.message));
    worker.postMessage({ type: 'load', url: site.rawFileUrl('content.js') });
  }

  function fail(message) {
    errorText.textContent = `無法載入 content.js（${message}）。請確認網路連線後重試。`;
    setState('error', '載入失敗');
    summary.textContent = '';
  }

  function handleMessage({ data }) {
    if (data.type === 'ready') {
      setState('ready', `已載入 ${site.branch} 分支的 content.js，共 ${data.ruleCount} 條單行過濾規則`);
      requestClean();
    } else if (data.type === 'result' && data.id === latestRequest) {
      render(data);
    } else if (data.type === 'error') {
      fail(data.message);
    }
  }

  function requestClean() {
    if (root.dataset.state !== 'ready') return;
    latestRequest += 1;
    worker.postMessage({ type: 'clean', id: latestRequest, text: input.value });
  }

  function render({ output, lines }) {
    const fragment = document.createDocumentFragment();
    let kept = 0;
    let removed = 0;

    lines.forEach((line) => {
      const item = document.createElement('li');
      item.className = `diff__line diff__line--${line.state}`;
      if (line.state === 'blank') {
        item.setAttribute('aria-hidden', 'true');
        fragment.append(item);
        return;
      }

      const mark = document.createElement('span');
      mark.className = 'diff__mark';
      mark.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'sr-only';
      const text = document.createElement('span');
      text.className = 'diff__text';
      text.textContent = line.text;
      item.append(mark, label, text);

      if (line.state === 'removed') {
        removed += 1;
        mark.textContent = '-';
        label.textContent = '已移除：';
        const reason = document.createElement('code');
        reason.className = 'diff__rule';
        if (line.reason.kind === 'rule') {
          reason.textContent = line.reason.pattern;
          reason.title = `命中規則 ${line.reason.pattern}`;
        } else {
          reason.textContent = '前後置清理';
          reason.title = '由 cleanExtractedPostContent 的前後置清理移除，而非單行規則';
        }
        item.append(reason);
      } else {
        kept += 1;
        mark.textContent = line.state === 'trimmed' ? '~' : '';
        label.textContent = line.state === 'trimmed' ? '保留，但截掉頭尾雜訊：' : '保留：';
      }
      fragment.append(item);
    });

    diffList.replaceChildren(fragment);
    outputCode.textContent = output;
    summary.textContent = `保留 ${kept} 行，移除 ${removed} 行`;
  }
})();
