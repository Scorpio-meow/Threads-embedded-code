# Threads 程式碼儲存器

> **目前版本：v2.0.5** | Manifest V3 | 純前端、零依賴

Threads 程式碼儲存器是一個基於 Manifest V3 標準設計的瀏覽器擴充功能，專門用於從 Threads 貼文中自動擷取、儲存、管理與匯出可嵌入的程式碼與貼文資料。

本專案完全運行於瀏覽器前端，所有資料皆安全地儲存在本機的 `chrome.storage.local` 中，無需依賴任何後端服務、外部資料庫或額外的 API 金鑰。

---

## 目錄

- [主要功能特性](#主要功能特性)
- [技術棧](#技術棧)
- [開發前置條件](#開發前置條件)
- [開發與安裝指引](#開發與安裝指引)
- [專案目錄結構](#專案目錄結構)
- [系統架構與工作流程](#系統架構與工作流程)
- [資料儲存 Schema](#資料儲存-schema)
- [核心技術邏輯與演算法](#核心技術邏輯與演算法)
- [使用者介面詳細說明](#使用者介面詳細說明)
- [匯入與匯出規範](#匯入與匯出規範)
- [權限與隱私聲明](#權限與隱私聲明)
- [疑難排解與常見問題](#疑難排解與常見問題)
- [免責聲明](#免責聲明)

---

## 主要功能特性

### 自動攔截與儲存

- 監控 Threads 貼文的「取得內嵌程式碼」對話框流程，在使用者複製內嵌程式碼的同時，自動完成資料擷取與儲存。
- 使用 `MutationObserver` 持續監聽 DOM 變更，並搭配每 5 秒週期性的定時掃描，確保可靠地偵測嵌入按鈕。
- 支援直接偵測已開啟的嵌入對話框（`processOpenEmbedDialogs`），即使使用者未透過擴充功能監聽的按鈕開啟對話框，亦可自動儲存。

### 安全的擴充功能存取層

- 使用 `safeStorageGet` 與 `safeStorageSet` 封裝函數存取 `chrome.storage.local`，自動偵測擴充功能是否仍然存活（`isExtensionAlive`）。
- 當擴充功能被重新載入導致 Context Invalidated 時，優雅地忽略讀寫操作而非拋出未捕獲例外，提升使用者體驗。

### 後設資料清理過濾

- 智慧識別並過濾作者簡介、粉絲數、串文數（如「X 位粉絲 • Y 則串文」）以及平台的引導用語，避免無效或垃圾資訊污染貼文內文。
- 過濾規則覆蓋超過 20 種 Threads 平台的 UI 雜訊模式，包含繁體中文與英文版介面文字。
- 新增「僅含圖片」偵測（`isLikelyImageOnlyDescription`）：自動辨識 `Photo by ... on ...` 等純圖片貼文描述，避免無實質文字的圖片貼文被誤存。

### 多維度欄位提取

自動分析貼文並提取以下資訊：

| 欄位 | 說明 |
|------|------|
| 貼文內文 | 已剔除後設資料與無效字串的純文字內容 |
| 作者帳號 | 發文者的 `@username` 與個人檔案連結 |
| 精確發文時間 | ISO 8601 格式的 `datetime` 與人類可讀的 `title` 時間標題 |
| 標籤群組 | 自動產生的標籤陣列（含官方標籤、Hashtag、技術關鍵字匹配） |
| 程式碼區塊 | 內含之程式碼區塊及推測語言 |
| 嵌入程式碼 | 原始 Blockquote HTML 內嵌碼 |

### 本機去重更新

以貼文唯一連結（`postLink`）為主鍵，若重複儲存同篇貼文，系統會自動以最新狀態覆蓋更新，而非重複新增。

### 回覆邊界偵測

在非單篇貼文頁面（如首頁動態或個人主頁），擴充功能會偵測「回覆...」邊界元素，僅擷取原始貼文內文，自動排除該貼文底下的回覆內容，確保提取結果的精確度。

### Popup 與 Dashboard 雙介面

- **工具列彈出面板（`popup.html`）**：提供快速檢視、全文搜尋、多重排序、篩選（全部/按作者/按標籤/無發文時間/失效貼文）、多選批次操作、三種匯出格式、匯入、背景更新與清除的便捷入口。
- **全頁儀表板（`dashboard.html`）**：提供完整的側邊欄佈局，含全文搜尋、排序與篩選控制群組、快速統計面板（已儲存篇數/失效連結數/作者總數/標籤總數）、熱門標籤雲、作者貼文統計雲、備份與維護操作區，以及主內容區的批次操作列與貼文卡片列表。

### 作者與標籤統計雲

- 儀表板新增「作者貼文計數統計（Authors Cloud）」與「熱門標籤雲（Tags Cloud）」，自動統計儲存資料中排名前 15 名的作者與標籤。
- 以微型徽章（Badge）呈現，標註貼文計數（例如 `@username (5)` 或 `#JavaScript (3)`）。
- 支援點擊切換：點擊徽章會將篩選條件鎖定到該作者或標籤；再次點擊則取消篩選。
- 當篩選條件變更時，統計雲會同步更新高亮狀態（`active` class）。

### 自訂 Modal 對話框

儀表板中所有破壞性操作（刪除、批次刪除、清空資料庫、重新生成、更新資料、匯入選擇模式）皆透過自訂的 Modal 對話框（確認模態框與匯入模態框）進行二次確認，取代原生 `confirm()`/`alert()`，提供更一致的操作體驗。

### 批次操作支援

- **全選/反選**：支援「全選目前頁面」核取方塊，以及 indeterminate 半選狀態。
- **批次複製 Embed**：將所選貼文的嵌入程式碼（剔除 script 標籤）合併複製到剪貼簿。
- **批次刪除**：一次刪除多篇選取的貼文，搭配自訂 Modal 確認。
- 未選取任何文章時，批次操作按鈕自動以低透明度與禁止互動狀態呈現。

### 無行內樣式與嚴格 CSP 相容

全面移除網頁中的行內樣式（Inline Styles），改由獨立的外部 CSS 檔案（`dashboard.css` 與 `popup.css`）統一控制。完美相容於瀏覽器嚴格的 Content Security Policy (CSP) 規範，避免任何潛在的安全限制與代碼品質警告。

### 背景併發更新機制

- 採用併發上限為 3 的非同步任務隊列，在背景開啟隱藏分頁對 Threads 貼文進行重新讀取。
- 自動修正發文時間、更新內文、同步標籤，並偵測貼文是否失效。
- Popup 與 Dashboard 皆各自實作獨立的 `fetchPostInfoViaTab`、`extractPostInfoFromPage`、`waitForTabLoad` 等函數，邏輯一致但互不耦合。
- 支援「選取文章更新」與「全部更新」兩種模式。

### 失效狀態智慧標記

當背景更新發現貼文被刪除、帳號設為私密、網址重新導向或頁面僅剩 fallback 摘要時，會自動標記貼文為失效：

| 失效原因 | 觸發條件 |
|----------|----------|
| `redirected` | 載入後 URL 中的貼文 ID 與原始連結不符（使用 `isSameThreadsPostLink` 比對） |
| `post-not-found` | 超過 4 秒仍找不到貼文的 `[data-pressable-container]` 容器元素 |
| `fallback-summary` | 頁面僅剩 Threads 預設引導摘要，無實際貼文內容 |

恢復機制：若下次更新偵測到貼文恢復正常，會自動調用 `clearArticleExpiredStatus` 清除失效標記並恢復為 `active` 狀態。

### URL 安全處理

所有對外連結與分頁操作皆透過 `sanitizeUrl` 函數驗證，確保 URL 協定僅為 `http:` 或 `https:`，過濾任何不安全的 URL 來源（如 `javascript:` 等協定）。

### 彈性匯出與匯入

- 提供三種 JavaScript 陣列格式（`const posts = [...]`）的匯出選項：簡易嵌入碼匯出、精選貼文資料匯出、以及完整版資料匯出。
- 支援匯入 JSON 或任何由擴充功能產生的 JS 陣列檔案，並可自由選擇合併（去重）或覆寫現有本機資料庫。
- 儀表板使用自訂匯入 Modal 呈現合併/覆寫選項；Popup 使用 `confirm()` 對話框。

---

## 技術棧

- **核心語言**：JavaScript (ES6+)、HTML5、CSS3
- **擴充功能規範**：Chrome Extension Manifest V3
- **核心瀏覽器 API**：
  - `chrome.storage.local`：本機結構化資料持久化儲存。
  - `chrome.tabs`：背景開啟與管理分頁，進行非同步資料更新。
  - `chrome.scripting`：向動態分頁注入擷取指令。
- **第三方依賴**：無。本專案為原生 Vanilla JS 實作，無任何打包與編譯依賴。

---

## 開發前置條件

- 支持 Manifest V3 規範的 Chromium 核心瀏覽器（如 Google Chrome、Microsoft Edge、Brave、Opera 等）。
- 本專案在開發與執行時不需安裝任何編譯套件。若您有開發輔助指令或本機測試指令的需求，推薦使用 Bun 作為套件與命令管理器（例如以 `bun run` 取代 `npm run`）。

---

## 開發與安裝指引

### 1. 取得專案原始碼

```bash
git clone https://github.com/Scorpio-meow/threads-embedded-code.git
cd threads-embedded-code
```

### 2. 在瀏覽器中載入擴充功能

1. 開啟您的 Chromium 核心瀏覽器，導覽至擴充功能管理頁面（如 `chrome://extensions/` 或 `edge://extensions/`）。
2. 在頁面右上角開啟 **開發人員模式** 開關。
3. 點擊左上角的 **載入未封裝項目** 按鈕。
4. 選擇本專案的根目錄資料夾（即包含 `manifest.json` 的資料夾）。
5. 載入成功後，建議在瀏覽器工具列中將「Threads 程式碼儲存器」釘選，以利快速操作。

### 3. 開發偵錯與重新載入

- 當您修改了 `content.js`、`popup.js` 或 `dashboard.js` 等任何檔案後，請回到瀏覽器的擴充功能管理頁面，點擊該擴充功能卡片右下角的 **重新載入** 按鈕。
- 重新載入後，請重新整理已開啟的 Threads 網頁分頁，以確保最新的腳本成功注入並執行。

---

## 專案目錄結構

```text
threads-embedded-code/
├── manifest.json      # 擴充功能設定檔，定義權限、腳本注入規則與入口
├── content.js         # 注入至 Threads 網頁的 Content Script，負責 DOM 監聽與初次擷取
├── styles.css         # 注入至 Threads 網頁的樣式檔，用於顯示提示通知
├── popup.html         # 瀏覽器工具列彈出視窗的 UI 結構
├── popup.css          # 彈出視窗的樣式表
├── popup.js           # 彈出視窗的控制邏輯，處理快速檢索、資料備份與背景更新
├── dashboard.html     # 全頁儀表板的 UI 結構（側邊欄 + 主內容區 + Modal 對話框）
├── dashboard.css      # 儀表板的樣式表
├── dashboard.js       # 儀表板的控制邏輯，處理資料分析、統計面板、標籤雲、批次維護與背景同步
├── favicon.png        # 擴充功能圖示
└── README.md          # 專案技術說明文件
```

---

## 系統架構與工作流程

```mermaid
flowchart TD
    subgraph Threads Page
        A[Threads 貼文 DOM] -->|使用者點擊取得內嵌程式碼| B[Embed Dialog]
        C[content.js MutationObserver] -->|偵測 Dialog 開啟| B
        B -->|擷取 HTML/Metadata| D[資料清理與分析演算法]
    end

    subgraph Chrome Extension Storage
        D -->|寫入/更新| E[(chrome.storage.local)]
    end

    subgraph User Interface
        E -->|讀取| F[popup.html / popup.js]
        E -->|讀取| G[dashboard.html / dashboard.js]
        G -->|計算| G1[統計面板 / 標籤雲 / 作者雲]
    end

    subgraph Background Process
        F -->|更新觸發| H[chrome.tabs.create]
        G -->|批次更新觸發| H
        H -->|背景開啟貼文頁面| I[Threads 背景分頁]
        I -->|等待載入完成| J[chrome.scripting.executeScript]
        J -->|注入抓取邏輯| K[提取最新資料/驗證導向]
        K -->|更新/標記失效| E
    end
```

### content.js 攔截流程

1. 當 Threads 頁面載入時，`content.js` 會先檢查 `window.__threadsSaverInitialized` 旗標避免重複初始化。初始化時建立 `MutationObserver` 持續監聽 `document.body`，並啟動每 5 秒一次的定時掃描（`setInterval`）。
2. 掃描時會透過 `findEmbedCodeTriggers` 函數搜尋所有可見的「取得內嵌程式碼」或「Embed Code」按鈕。按鈕識別支援以下互動元素的選擇器：`button`、`[role="button"]`、`[role="menuitem"]`、`[role="menuitemcheckbox"]`、`[role="option"]`、`a`、`[tabindex]:not([tabindex="-1"])`。
3. 為每個未處理的按鈕附加 `click` 事件監聽器。點擊後延遲 1000 毫秒等待對話框渲染完成。
4. 自動定位最新的 `role="dialog"` 元素，從其內部的唯讀輸入欄位（`input[readonly]` 或 `textarea[readonly]`）中，以分數權重演算法選出最佳的嵌入 HTML 區塊（優先選擇含 `data-text-post-permalink` 屬性、`<blockquote>` 標籤與 `threads.com` 網域的內容）。
5. 同時自貼文容器 DOM 中往上檢索貼文內文、發文者帳號、頭像、精確時間（`time[datetime]`），並將其彙整寫入本機儲存空間。
6. 同步執行 `processOpenEmbedDialogs`，偵測頁面上已開啟但尚未處理的嵌入對話框，確保不遺漏任何嵌入碼。

---

## 資料儲存 Schema

本擴充功能將所有貼文儲存在本機儲存空間的 `savedArticles` 鍵值中。其資料結構為一個物件陣列，單筆文章的 Schema 定義如下：

```typescript
interface SavedArticle {
  // 唯一識別碼，格式為 embed_[時間戳記]_[隨機字串] 或 code_[時間戳記]_[隨機字串]
  id: string;

  // 貼文的唯一 URL 連結，作為去重與更新的主鍵
  postLink: string;

  // 從 Threads 官方複製的完整內嵌 HTML 程式碼
  embedCode: string;

  // 貼文的原始發布時間 (ISO 8601 格式)
  timestamp: string;

  // 發布時間的標題顯示（如「2026年5月29日 上午10:00」，從 DOM 元素之 title 屬性取得）
  timestampTitle: string;

  // 此文章儲存至本機資料庫的時間 (ISO 8601 格式)
  savedAt: string;

  // 貼文的純文字內容（已剔除後設資料與無效字串）
  content: string;

  // 發文者的帳號（如 @username）
  author: string;

  // 發文者個人主頁的 URL
  authorUrl: string;

  // 自動擷取與推導出的標籤陣列，用於分類與過濾
  tags: string[];

  // 解析出的程式碼區塊陣列
  codeBlocks: CodeBlock[];

  // 程式碼區塊的總數量
  codeCount: number;

  // 貼文目前的存活狀態。active: 正常; expired: 失效
  status: 'active' | 'expired';

  // 貼文最後一次被背景更新的時間
  lastUpdated?: string;

  // 若貼文失效，記錄其失效的 ISO 時間
  expiredAt?: string;

  // 失效原因。redirected: 被重新導向; post-not-found: 找不到貼文; fallback-summary: 僅剩引導頁
  expiredReason?: 'redirected' | 'post-not-found' | 'fallback-summary';

  // 最後一次檢測失效時間
  expiredCheckedAt?: string;

  // 最後一次更新時間戳記的系統時間
  timestampUpdatedAt?: string;

  // 若為匯入的資料，標記匯入來源
  importedFrom?: 'full-data-file' | 'js-embed-file';
}

interface CodeBlock {
  // 程式碼來源類型。markdown_block: 圍欄語法; html_tag: pre/code標籤; monospace: monospace樣式; inline: 行內代碼
  type: 'markdown_block' | 'html_tag' | 'monospace' | 'inline';

  // 程式碼純文字內容
  code: string;

  // 推測的程式語言名稱（如 javascript, python 等），若無法識別則為 unknown
  language: string;

  // 程式碼在該貼文中的順序索引 (從 1 開始)
  index: number;

  // 若為行內代碼，記錄行內代碼的總數量
  count?: number;
}
```

---

## 核心技術邏輯與演算法

### 1. 貼文內容擷取與後設資料過濾

在 Threads 平台上，網頁 DOM 經常包含許多干擾元素。為了精確取得貼文內文，擴充功能實作了以下多層過濾機制：

**目標選擇器**：

- 優先抓取 `span[class*="xo1l8bm"][dir="auto"] > span` 與 `span[class*="xi7mnp6"][dir="auto"] > span`，以涵蓋 Threads 的正文內容。
- 在單篇貼文頁面，優先以 `[data-pagelet="threads_post_page_0"]` 為搜尋根節點，縮小抓取範圍。

**排除過濾鏈**：

1. 排除非 `[data-pressable-container]` 內的 span 元素。
2. 排除位於 `button`、`[role="button"]` 內的文字。
3. 排除 `h1` 標題與 `[aria-label="直欄標題"]` 內的文字。
4. 排除符合 `isLikelyThreadsFallbackDescription` 規則的 UI 雜訊文字。

**後設資料過濾器（`isLikelyThreadsFallbackDescription`）**：利用正規表達式陣列排除非貼文正文之文字：

- 瀏覽次數統計：如 `\d[\d,.]*\s*(?:萬|千)?次?瀏覽`
- 粉絲與串文統計：如 `\d[\d,.]*\s*位粉絲\s*•\s*\d[\d,.]*\s*則串文`
- 平台引導與回覆提示語：如「查看 @... 參與的最新對話」、「尚無回覆」、「為你推薦」、「個人檔案」、「分享」、「讚」、「聯邦宇宙」、「洞察報告」、「已儲存」、「追蹤中」、「附帶原始貼文的回覆內容」等。

**圖片貼文偵測（`isLikelyImageOnlyDescription`）**：

- 偵測 `Photo by ... on ...` 模式的純圖片貼文描述。
- 偵測多行但每行平均長度不足 12 字元的短摘要。
- 若貼文容器包含 `img[src*="cdninstagram"]` 或 `video` 元素且無法提取文字，則視為純媒體貼文。

**Fallback 擷取**：若 DOM 中無法提取內容，會嘗試從 `meta[property="og:description"]` 擷取，但同樣會過濾掉「加入 Threads 即可分享意見」等預設平台引導字樣。

### 2. 嵌入碼提取與權重排名

從對話框中提取嵌入碼時，擴充功能會掃描所有 `input[readonly]` 與 `textarea[readonly]` 元素的值，並以分數權重機制選出最佳候選：

| 特徵 | 加權分數 |
|------|----------|
| 含 `data-text-post-permalink=` | +1000 |
| 含 `<blockquote` | +500 |
| 含 `threads.com` | +100 |
| 文字長度 | +length |

最終選取分數最高的輸入值作為該貼文的嵌入程式碼。

### 3. 程式碼區塊識別演算法

擴充功能會透過四種管道識別貼文中的程式碼：

- **Markdown 圍欄語法**：使用正規表達式 `` /```(\w*)\n([\s\S]*?)```/g `` 擷取，並自動提取語言標籤。
- **DOM 程式碼標籤**：透過 `querySelectorAll('pre, code')` 檢索貼文內部的實體標籤（長度需超過 5 字元）。
- **monospace 樣式**：檢索帶有 `style*="monospace"` 屬性的 DOM 元素，去重後加入。
- **行內程式碼**：透過正規表達式 `` /`([^`\n]{2,})`/g `` 提取行內程式碼，並將其合併為一個類型為 `inline` 的區塊。
- **語言自動偵測（`detectLanguage`）**：利用特徵關鍵字檢測程式碼所屬語言（支援 javascript、python、java、cpp、csharp、html、css、sql、bash、json）。

### 4. 標籤推導機制

標籤的來源包含以下途徑：

- **官方標籤元素**：尋找 `a[href*="serp_type=tags"]` 或 `a[href*="tag_id="]` 等連結，解析其 URL 查詢參數中的標籤字串。
- **Hashtag 偵測**：使用正規表達式 `/#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g` 解析內文中的雜湊標籤。
- **技術關鍵字匹配**：掃描貼文內文是否包含常用技術詞彙（JavaScript, Python, Java, C++, C#, HTML, CSS, SQL, TypeScript, React, Vue, Angular）。
- **NFC 標準化去重**：所有提取出的標籤皆會通過 `.normalize('NFC')` 處理，並進行 `Set` 去重，避免因 Unicode 組合字元導致相同標籤被視為相異項目。

### 5. 貼文 ID 比對與 URL 驗證

- `extractThreadsPostIdFromLink`：從 URL 中提取 `/post/[postId]` 中的 postId，先移除查詢參數再進行匹配。
- `isSameThreadsPostLink`：比較兩個 URL 中提取的 postId 是否一致，用於背景更新時驗證頁面跳轉後是否仍為同一篇貼文。
- `sanitizeUrl`：驗證 URL 協定安全性，僅允許 `http:` 與 `https:`，無效或危險 URL 回傳 `#`。

### 6. 背景分頁併發更新機制

為了克服瀏覽器 CORS 限制並獲取精確的 Threads 發文時間與內文，專案設計了本機背景分頁更新邏輯：

- **併發控制**：最大併發數限制為 3（`maxConcurrency = 3`），使用 Worker Pool 模式，避免短時間內開啟過多分頁。
- **生命週期管理**：
  1. 調用 `chrome.tabs.create({ url, active: false })` 靜默開啟分頁。
  2. 監聽 `chrome.tabs.onUpdated`，當分頁狀態變為 `complete` 時繼續執行。若超過 8000 毫秒未完成則自動超時放行。
  3. 比對跳轉後的 URL（使用 `isSameThreadsPostLink`）。若貼文 ID 不符，判定為 `redirected` 失效狀態。
  4. 使用 `chrome.scripting.executeScript` 向分頁注入 `extractPostInfoFromPage` 函數。注入的函數會以 150 毫秒為間隔、最多 4000 毫秒的輪詢方式等待貼文元素出現。
  5. 時間戳來源優先順序：`time[datetime]` DOM 元素 > `meta[property="article:published_time"]` > `script[type="application/ld+json"]` 中的 `datePublished`。
  6. 擷取完成後，自動調用 `chrome.tabs.remove` 關閉分頁，並將最新數據回寫至 `chrome.storage.local`。
  7. 若更新成功且貼文先前為失效狀態，自動調用 `clearArticleExpiredStatus` 清除失效標記。

---

## 使用者介面詳細說明

### Popup 面板（popup.html）

| 區域 | 功能 |
|------|------|
| 標題列 | 「已儲存的程式碼」標題 + 儀表板按鈕 + 文章計數 |
| 搜尋列 | 即時全文搜尋（內文、作者、標籤、程式碼、嵌入碼） |
| 控制列 | 全選/清除選取 + 排序（4 種維度 x 升降） + 篩選（5 種類型 + 動態數值下拉） |
| 操作按鈕 | 匯出(3 種) / 匯入 / 更新資料 / 清除全部 |
| 貼文卡片 | 核取方塊 + 作者 + 雙時間（發文/儲存） + 內文預覽 + 失效徽章 + 嵌入碼預覽 + 標籤列 + 程式碼區塊 + 操作按鈕（查看原文/複製內嵌程式碼/刪除） |

### 全頁儀表板（dashboard.html）

| 區域 | 功能 |
|------|------|
| 頂部導航列 | Threads Logo + 標題 + 控制面板徽章 + 全域統計（已儲存/失效連結） + Threads 外部連結 |
| 側邊欄 - 全文搜尋 | 帶搜尋圖示的即時搜尋 |
| 側邊欄 - 整理與篩選 | 排序下拉 + 篩選類型下拉 + 篩選數值下拉 |
| 側邊欄 - 快速統計 | 作者總數 + 標籤總數 + 常用標籤雲 + 作者貼文統計雲 |
| 側邊欄 - 備份與維護 | 匯出(3 種) + 匯入 + 更新貼文資料 + 清除全部資料 |
| 批次操作列 | 全選核取方塊 + 選取計數 + 批次複製 Embed + 批次刪除 |
| 主內容區 | 貼文卡片列表（含核取方塊、展開/收起長文、標籤點擊篩選、嵌入碼折疊區） |
| 確認 Modal | 標題 + 訊息 + 取消/確定按鈕 |
| 匯入 Modal | 說明文字 + 合併資料（推薦）卡片 + 完全覆寫卡片 + 取消按鈕 |
| Toast 通知 | 固定位置的浮動通知，2.5 秒後自動淡出 |

---

## 匯入與匯出規範

擴充功能支援本機資料庫的備份與還原，並提供三種匯出選項，均以 `const posts = [...]` 的 JavaScript 陣列結構匯出，方便外部網頁與精選貼文專案直接引用：

### 1. 簡易版 JS 嵌入碼匯出 (Embed Only)

- **用途**：供外部網頁直接引用嵌入程式碼。
- **格式**：只保留可以直接在 HTML 中渲染的 `blockquote` 嵌入程式碼，並自動剔除重複的 `<script async src="https://www.threads.com/embed.js"></script>` 腳本標籤，且對字串中的單引號與斜線進行轉義。
- **檔案命名**：`threads-embed-codes-[YYYY-MM-DD].js`
- **結構範例**：
  ```javascript
  const posts = [
      '<blockquote class="text-post-media" ...> ... </blockquote>',
      '<blockquote class="text-post-media" ...> ... </blockquote>'
  ];
  ```

### 2. 精選貼文資料 JS 匯出 (Featured Data)

- **用途**：專為精選貼文展示網頁（例如 Threads-Featured-Posts）設計，過濾了不必要的元數據。
- **格式**：匯出特定欄位組成的物件陣列，其中的 `embedCode` 已剔除 `script` 標籤，且 `author` 已移除帳號首字的 `@` 符號以方便識別。
- **檔案命名**：`threads-featured-data-[YYYY-MM-DD].js`
- **結構範例**：
  ```javascript
  const posts = [
      {
          "embedCode": "<blockquote class=\"text-post-media\" ...> ... </blockquote>",
          "postLink": "https://www.threads.net/@username/post/postId",
          "author": "username",
          "content": "貼文純文字內容",
          "tags": ["Tag1", "Tag2"]
      }
  ];
  ```

### 3. 完整版資料 JS 匯出 (Full Data)

- **用途**：用於本機資料庫完整備份、還原或跨裝置同步。
- **格式**：匯出包含 `SavedArticle` Schema 中定義的所有欄位（包括發布時間、本機儲存時間、失效狀態及原因等），其中的 `embedCode` 已剔除 `script` 標籤，且 `author` 保留 `@` 符號。
- **檔案命名**：`threads-full-data-[YYYY-MM-DD].js`
- **結構範例**：
  ```javascript
  const posts = [
      {
          "embedCode": "<blockquote class=\"text-post-media\" ...> ... </blockquote>",
          "postLink": "https://www.threads.net/@username/post/postId",
          "author": "@username",
          "content": "貼文純文字內容",
          "timestamp": "2026-06-21T09:00:00.000Z",
          "timestampTitle": "2026年6月21日 上午9:00",
          "savedAt": "2026-06-21T09:12:00.000Z",
          "tags": ["Tag1", "Tag2"],
          "status": "active",
          "expiredAt": "",
          "expiredReason": "",
          "expiredCheckedAt": ""
      }
  ];
  ```

### 4. 智慧匯入與合併邏輯

匯入資料時，系統支援選取 `.json` 檔案或上述三種 JavaScript 檔案（自動偵測 `const posts` 變數並加以解析）：

- **合併模式 (Merge)**：比對 `postLink`，若該貼文已存在於本機資料庫則自動跳過，僅匯入新的貼文。
- **覆寫模式 (Overwrite)**：清空目前本機的 `savedArticles` 內容，並以匯入檔案中的資料完全取代。
- **自動修復**：若匯入的資料中 `embedCode` 缺少 `<script ...>` 標籤，系統在匯入本機資料庫時會自動在末尾補上，確保在擴充功能介面中仍能正常預覽與生成。
- **多重解析策略**：匯入解析器會依序嘗試 `JSON.parse` > `new Function()` 動態執行 > 正規表達式字串提取，確保各種格式的 JS 檔案皆可成功匯入。

---

## 權限與隱私聲明

本擴充功能在 `manifest.json` 中要求了最低限度的必要權限，以維護使用者隱私：

| 權限 | 用途 |
|------|------|
| `storage` | 僅用於讀寫本機瀏覽器沙盒內的 `chrome.storage.local` 資料庫 |
| `tabs` | 僅用於在背景開啟更新貼文所需的分頁 |
| `scripting` | 僅用於向背景開啟的本專案分頁注入內容提取腳本 |
| `host_permissions` | 限制僅能存取 `https://www.threads.com/*` 與 `https://threads.com/*` |

本擴充功能**不會**將您的任何貼文資料、程式碼內容、個人瀏覽紀錄或帳號資訊上傳至任何第三方伺服器。所有運算與儲存皆在您的個人本機電腦中完成。

---

## 疑難排解與常見問題

### Q：點擊取得內嵌程式碼後，為什麼沒有彈出儲存成功的提示？

- 請確認您的瀏覽器是否已正確登入 Threads 帳號。
- 請確認目前瀏覽的網址是否為標準的 `threads.com` 或 `www.threads.com` 貼文頁面。
- 有時因為網頁動態載入延遲，您可以嘗試重新整理 Threads 頁面，或在擴充功能管理頁面中將此擴充功能重新載入。
- 若控制台出現 `Extension context invalidated` 警告，代表擴充功能已被重新載入，請重新整理 Threads 頁面即可。

### Q：為什麼許多貼文在點擊更新後被標記為「失效貼文」？

- 這代表該貼文在 Threads 平台上可能已經被原作者刪除、封鎖，或者該作者的帳號已被設定為不對外公開的私密帳號。
- 另外，若您的網路連線不穩定，導致背景分頁載入超時（超過 8 秒），系統亦可能因為無法獲取資料而將其暫時視為無法存取的狀態。
- 若貼文實際上仍然存在，下次更新時系統會自動恢復其 `active` 狀態並清除失效標記。

### Q：Threads 平台改版後，擴充功能無法正常擷取內文或程式碼？

- 本擴充功能高度依賴 Threads 目前網頁結構的 CSS 選擇器與 class 特徵。
- 若 Threads 官方進行了 DOM 結構微調或 class 名稱混淆，請檢視 `content.js` 與 `dashboard.js` 中的相關選擇器定義，並進行相應更新。
- 目前使用的關鍵選擇器包括：`span[class*="xo1l8bm"]`、`span[class*="xi7mnp6"]`、`[data-pressable-container]`、`[data-pagelet="threads_post_page_0"]`。

### Q：儲存空間已滿怎麼辦？

- `chrome.storage.local` 預設有 10MB 的儲存上限。
- 建議定期透過「匯出完整資料」備份資料後，使用「清除全部資料」或「批次刪除」功能清理不再需要的貼文。
- 當系統偵測到 `QUOTA` 相關錯誤時，會自動提示使用者清理舊文章。

---

## 免責聲明

本擴充功能為第三方獨立開發之開源工具，與 Meta 或 Threads 官方無任何關聯、授權或隸屬關係。Threads 平台的網頁結構、API 與使用規範可能隨時變更，若因平台改版導致擷取功能暫時失效，需等待維護者更新選擇器規則。使用者須自行承擔使用本工具之相關風險。