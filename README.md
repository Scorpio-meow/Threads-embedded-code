# Threads 程式碼儲存器 (Threads Code Saver)

「Threads 程式碼儲存器」是一個瀏覽器擴充功能，專門用來從 [Threads](https://www.threads.com/) 貼文中擷取、儲存與管理可分享的內嵌內容。它會在你開啟 Threads 的 embed 對話框時，自動讀取貼文連結、作者、時間、內文、程式碼區塊與 embed code，並在彈出視窗中提供搜尋、篩選、排序、匯出與匯入。

## ✨ 功能亮點

* **自動擷取 Threads 資料**：當 Threads 顯示「取得內嵌程式碼」或相關對話框時，擴充功能會自動保存貼文資訊、作者、發文時間、程式碼內容與 embed code。
* **完整的資料管理介面**：
  * **搜尋**：可依內文、作者、標籤、程式碼內容與 embed code 搜尋。
  * **排序**：支援依儲存時間、發文時間、作者與程式碼數量排序。
  * **篩選**：可依作者、標籤、未更新時間或失效貼文狀態篩選。
  * **批次操作**：可針對全部或已選取的文章批次重新生成 embed code、更新時間與內容。
* **複製與匯出**：
  * **複製單筆 embed code**：一鍵複製單篇 Threads 貼文的內嵌程式碼。
  * **匯出 embed code**：輸出精簡版 JS 檔，只保留可直接嵌入的 blockquote。
  * **匯出完整資料**：輸出含作者、內文、時間、標籤與狀態的完整 JS 資料。
* **匯入與備份**：
  * 支援匯入 `.json` 或 `.js`。
  * JSON 可是陣列格式，或 `{ savedArticles: [...] }` 格式。
  * JS 可匯入 `posts = [...]` 的匯出檔，並支援合併或覆寫現有資料。
* **失效貼文處理**：重新更新時會自動辨識導向失效、找不到貼文或 fallback summary，並將貼文標記為失效。

## 📁 專案結構

* `manifest.json`：Manifest V3 設定檔，宣告權限與內容腳本。
* `content.js`：注入 Threads 頁面，負責監聽 embed 觸發、擷取貼文內容、作者與時間。
* `popup.html` / `popup.js`：彈出視窗 UI 與主要邏輯，包含清單渲染、搜尋、篩選、匯出、匯入與批次更新。
* `styles.css`：Threads 頁面上的注入樣式，例如儲存提示與輔助 UI。
* `favicon.png`：擴充功能圖示。

## 🚀 安裝方式

1. 將這個資料夾下載或複製到本機。
2. 開啟瀏覽器擴充功能頁面：
   * Google Chrome：`chrome://extensions/`
   * Microsoft Edge：`edge://extensions/`
3. 開啟 **開發人員模式**。
4. 點擊 **載入未封裝項目**，選擇 `threads-embedded-code` 資料夾。
5. 安裝完成後，建議把擴充功能釘選到工具列。

## 💡 使用方式

1. **儲存貼文**：在 Threads 上開啟含有程式碼的貼文，點選 Threads 原生的「取得內嵌程式碼」或類似選項，擴充功能會自動擷取並儲存資料。
2. **管理資料**：點擊瀏覽器右上角的擴充功能圖示，開啟管理面板後可搜尋、篩選、排序、刪除與批次操作。
3. **更新內容**：使用「更新資料」可重新訪問 Threads 貼文，更新發文時間與內文，並自動標記失效貼文。
4. **重新生成 embed code**：當 Threads 的嵌入結構改變時，可對單篇、已選取或全部貼文重新生成 embed code。
5. **匯出 / 匯入**：可將資料匯出成 JS 檔備份，或從 JSON / JS 檔匯入，選擇合併或取代既有資料。

## 📦 匯出格式

* **embed only JS**：輸出 `const posts = [...]`，內容只保留可直接嵌入的 blockquote。
* **full data JS**：輸出 `const posts = [...]`，每筆包含 `embedCode`、`postLink`、`author`、`content`、`timestamp`、`timestampTitle`、`savedAt`、`tags`、`status` 與失效資訊。

## 🛠 開發注意事項

* 本擴充功能依賴 Threads 的 DOM 與 class 結構；如果 Threads 更新版面，`content.js` 中的擷取邏輯可能需要同步調整。
* 更新資料時會透過 `chrome.scripting.executeScript` 與背景分頁逐一讀取貼文，批次資料量大時會增加瀏覽器負載。
* `content.js` 與 `popup.js` 都包含對 fallback 文本的過濾邏輯，避免把 Threads 介面的輔助文字誤判為貼文內容。