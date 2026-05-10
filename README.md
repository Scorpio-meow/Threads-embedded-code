# Threads 程式碼儲存器 (Threads Code Saver)

> 一個 Manifest V3 瀏覽器擴充功能，專門從 [Threads](https://www.threads.com/) 貼文自動擷取、儲存與管理可嵌入的 embed code。

***

## 功能亮點

### 自動擷取
- 監聽 Threads「取得內嵌程式碼」對話框觸發
- 自動解析並儲存：貼文連結、作者、發文時間、內文、程式碼區塊與 embed code
- 失效貼文自動辨識（重新導向、404、fallback summary）

### 資料管理
| 功能 | 說明 |
|------|------|
| 搜尋 | 依內文、作者、標籤、程式碼內容、embed code 全文檢索 |
| 排序 | 儲存時間 / 發文時間 / 作者 / 程式碼數量 |
| 篩選 | 依作者、標籤、未更新時間、失效狀態 |
| 批次操作 | 批次重新生成 embed code、更新時間與內文 |

### 複製與匯出
- 一鍵複製單篇 embed code
- **Embed Only JS**：僅含可直接嵌入的 `blockquote` 陣列
- **Full Data JS**：含 `embedCode`、`postLink`、`author`、`content`、`timestamp`、`timestampTitle`、`savedAt`、`tags`、`status` 及失效資訊

### 匯入與備份
- 支援 `.json`（陣列格式或 `{ savedArticles: [...] }` 結構）
- 支援 `.js`（`posts = [...]` 格式）
- 匯入時可選擇**合併**或**覆寫**現有資料

***

## 專案結構

```
threads-embedded-code/
├── manifest.json    # Manifest V3 設定、權限宣告
├── content.js       # 注入 Threads 頁面，監聽 embed 觸發並擷取貼文內容
├── popup.html       # 彈出視窗 UI 結構
├── popup.js         # 主要業務邏輯：清單渲染、搜尋、篩選、匯出匯入、批次更新
├── styles.css       # 注入 Threads 頁面的輔助樣式（儲存提示等）
└── favicon.png      # 擴充功能圖示（128×128）
```

***

## 安裝方式

1. 下載或 Clone 此專案到本機：
   ```bash
   git clone https://github.com/Scorpio-meow/threads-embedded-code.git
   ```

2. 開啟瀏覽器擴充功能頁面：
   - **Google Chrome**：`chrome://extensions/`
   - **Microsoft Edge**：`edge://extensions/`
   - **Brave / Opera**：同 Chrome 路徑

3. 啟用右上角的 **開發人員模式**。

4. 點擊 **載入未封裝項目**，選擇剛剛 Clone 的 `threads-embedded-code` 資料夾。

5. 安裝完成後，建議將擴充功能**釘選到工具列**以便快速存取。

***

## 使用方式

1. **儲存貼文**  
   在 Threads 上對任意貼文點選「⋯」→「取得內嵌程式碼」，擴充功能自動擷取並儲存。

2. **管理資料**  
   點擊工具列的擴充功能圖示，在彈出面板中搜尋、篩選、排序、刪除或批次操作。

3. **更新內容**  
   點選「更新資料」重新訪問 Threads 貼文，刷新發文時間、內文並自動標記失效貼文。

4. **重新生成 embed code**  
   當 Threads 更新嵌入結構時，可對單篇、已選取或全部貼文重新生成 embed code。

5. **匯出 / 匯入**  
   在面板內選擇匯出格式（embed only 或 full data），或從 `.json` / `.js` 匯入備份，支援合併或覆寫。

***

## 開發注意事項

- **DOM 依賴**：`content.js` 依賴 Threads 目前的 DOM class 結構；若 Threads 更新版面，擷取邏輯需同步調整。
- **效能考量**：批次更新透過 `chrome.scripting.executeScript` 逐一讀取貼文，資料量大時會增加瀏覽器負載，建議分批操作。
- **Fallback 過濾**：`content.js` 與 `popup.js` 均含 fallback 文本過濾邏輯，防止 Threads 介面輔助文字被誤判為貼文內容。
- **版本**：目前為 `v1.2.0`，使用 Manifest V3 規範。

***

## 匯出格式說明

### Embed Only JS
```js
const posts = [
  { embedCode: '<blockquote class="text-post-media" ...' },
  ...
];
```

### Full Data JS
```js
const posts = [
  {
    embedCode: '...',
    postLink: 'https://www.threads.com/@user/post/xxx',
    author: '@username',
    content: '貼文內文...',
    timestamp: '2025-01-01T00:00:00Z',
    timestampTitle: '2025年1月1日',
    savedAt: '2025-01-02T00:00:00Z',
    tags: ['tag1', 'tag2'],
    status: 'active'  // 或 'invalid'
  },
  ...
];
```

***

> **免責聲明**：本擴充功能為非官方工具，與 Meta / Threads 無任何隸屬關係。Threads 的 DOM 結構隨時可能改變，導致擷取功能暫時失效，請留意版本更新。