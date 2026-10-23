# 貢獻指南

感謝你願意協助改進「Threadkeep」！這份文件說明如何回報問題、提出建議，以及送出 Pull Request 前需要知道的事。

參與本專案即表示你同意遵守[貢獻者行為準則](./CODE_OF_CONDUCT.md)。

## 目錄

- [回報問題](#回報問題)
- [提出功能建議](#提出功能建議)
- [開發環境](#開發環境)
- [架構規範](#架構規範)
- [手動測試清單](#手動測試清單)
- [文件同步](#文件同步)
- [Commit 訊息](#commit-訊息)
- [送出 Pull Request](#送出-pull-request)
- [授權](#授權)

## 回報問題

請到 [Issues](https://github.com/Scorpio-meow/Threadkeep/issues/new/choose) 選擇對應的範本：

| 範本 | 適用情境 |
| :--- | :--- |
| 擷取結果不正確 | 沒有出現儲存提示、內文夾雜 UI 雜訊、換行被壓平、發文時間或作者抓錯、被誤判為失效貼文。通常是 Threads 改版造成。 |
| 功能異常 | Popup、控制面板、即時預覽、更新佇列、匯入匯出等介面操作出錯。 |
| 無障礙問題 | 無法用鍵盤或輔助技術操作、對比不足、焦點遺失等，詳見[無障礙聲明](./ACCESSIBILITY.md)。 |
| 功能建議 | 新功能或既有功能的改善。 |

回報前請注意：

- **安全漏洞不要開公開 Issue**，請依[安全政策](./SECURITY.md)私下回報。
- 先搜尋是否已有相同的 Issue，並確認使用的是 `main` 分支的最新版本（版本號見 `chrome://extensions/` 或 [manifest.json](./manifest.json)）。
- 只附上**公開貼文**的網址。完整備份檔含有你收藏的所有貼文，請只貼出與問題相關的那一筆，並移除不想公開的內容。
- 擷取問題請盡量附上 Threads 的介面語言與頁面類型（動態牆、貼文頁、個人檔案頁），過濾規則會因語言而不同。

## 提出功能建議

本專案刻意維持零依賴、零建置、資料只存在瀏覽器本機的設計。較大的功能（新增權限、新的對外連線、改變儲存格式）請先開 Issue 討論，確認方向後再動手，以免做了白工。

## 開發環境

不需要安裝 Node.js、套件或任何建置工具，只要一個支援 Manifest V3 的 Chromium 瀏覽器（Chrome、Edge、Brave 等，版本 88 以上）。

1. Fork 並複製專案：
   ```bash
   git clone https://github.com/<你的帳號>/Threadkeep.git
   ```
2. 開啟 `chrome://extensions/`（Edge 為 `edge://extensions/`），打開右上角的「開發人員模式」。
3. 點「載入未封裝項目」，選擇專案根目錄（包含 `manifest.json` 的資料夾）。

修改後要讓變更生效：

| 修改的檔案 | 生效方式 |
| :--- | :--- |
| `manifest.json` | 在擴充功能頁按「重新載入」 |
| `content.js`、`styles.css` | 在擴充功能頁按「重新載入」，**再重新整理 Threads 分頁**，否則舊的腳本仍在執行 |
| `article-store.js` | 在擴充功能頁按「重新載入」、重新整理 Threads 分頁，並重新開啟 Popup 與控制面板（三處都會載入它） |
| `theme.js` | 重新開啟 Popup，並重新整理控制面板分頁 |
| `popup.*` | 關閉後重新開啟 Popup |
| `dashboard.*` | 重新整理控制面板分頁 |

偵錯時：Popup 可在面板上按右鍵選「檢查」開啟開發者工具；`content.js` 的訊息出現在 Threads 分頁的主控台；控制面板直接在該分頁按 `F12`。

## 架構規範

完整說明見 README 的[開發注意事項與架構規範](./README.md#開發注意事項與架構規範)，重點如下：

- **零外部依賴**：不引入 npm 執行期套件、外部 CDN 腳本或框架。
- **嚴格 CSP**：HTML 與注入腳本禁止行內樣式（`style="..."`）與行內事件（`onclick="..."`），事件一律用 `addEventListener` 綁定。
- **不使用原生對話框**：`confirm()`、`alert()`、`prompt()` 一律改用頁內 Modal。Popup 失焦時原生對話框會連同 Popup 一起關閉並回傳預設值，容易誤觸破壞性操作。
- **安全渲染**：貼文內文、作者、標籤等來自網頁的字串一律以 `textContent` 或 `escapeHtml` 輸出，連結與 iframe 來源經過 `sanitizeUrl`；`postMessage` 必須驗證來源網域。
- **無障礙**：新 Modal 需有 `role="dialog"`、`aria-modal="true"`、焦點鎖定與焦點還原；可點擊元素用 `button`，點擊區域至少 24×24px（現有勾選框尚未達到，見 ACCESSIBILITY.md 的已知限制）；停用狀態用 `disabled` 屬性，不要只靠 `pointer-events: none`。
- **螢幕閱讀器與焦點**：卡片上重複出現的控制項（勾選框、刪除等），`aria-label` 要用 `getArticleLabel` 帶上是哪一篇；重畫清單或卡片時，用 `captureCardFocus`／`restoreCardFocus` 保留焦點，不要讓焦點掉回 `body`；搜尋、篩選這類只改變畫面的結果，用 `announce()` 寫進 `#liveStatus`。對話框內會出現的元件不要用 `transition: all`：遮罩切換 `visibility` 時，子元素若也轉場 `visibility`，開啟後的第一個畫面仍是隱藏狀態，初始聚焦會失敗。
- **顏色與焦點樣式**：新增顏色時，在樣式表 `:root` 定義 CSS 變數，並在 `@media (prefers-color-scheme: dark)` 與 `:root[data-theme="dark"]` 兩個區塊都補上深色值（只補前者時，在「外觀」選單手動選「深色」不會生效），文字對比兩種模式都至少 4.5:1；只靠背景色區分的狀態（例如選取、目前的分頁），要在 `@media (forced-colors: active)` 區塊用系統顏色補上邊框。按鈕、連結與勾選框的焦點一律用 `outline: 2px solid var(--focus-color)` 加上 `outline-offset`；搜尋框、下拉選單與文字區這類輸入框不加 `outline`，改用 `box-shadow: var(--field-focus-ring)` 的雙環（內圈 2px 實色、對比至少 3:1），並在 `forced-colors` 區塊補上 `outline`，因為高對比模式會移除陰影。兩種都要確認沒有被 `overflow` 裁切。
- **分層與字重**：區塊與元件不畫邊框，靠 `--bg`、`--surface`、`--fill` 這幾階相差 1%–3% 明度的底色分層，不用純黑 `#000`（陰影也用 `rgb(28 28 26 / …)` 或 `rgb(11 11 10 / …)`）。需要在高對比模式下現形的元件保留 `border: 1px solid transparent`。字重一律寫 `var(--fw-regular)` 到 `var(--fw-heavy)`，深色模式會自動減 40；介面字型用可變字型（Manrope、Noto Sans TC、Fira Code），減 40 後才不會被吸附回整百字重。
- **權限最小化**：新增 `permissions` 或 `host_permissions` 前請先在 Issue 說明理由。

修改 `content.js` 的清洗函式（`cleanExtractedPostContent`、`isLikelyThreadsFallbackDescription`）時另外注意：

- 擷取邏輯只有 `content.js` 一份。`dashboard.js` 的 `extractPostInfoFromPage` 注入背景分頁後，直接呼叫該分頁上 `content.js` 的 `findPostElementFromPostLink`、`extractPostContent` 與 `extractTags`；重新命名或改變這三個函式的參數時，要一併修改 `extractPostInfoFromPage`。
- `content.js` 會注入所有 threads.com 框架，包括其他網站上的 Threads 內嵌 iframe。對父視窗送訊息一律先用 `getExtensionParentOrigin()` 確認父視窗是本擴充功能，並把它回傳的來源當成 `postMessage` 的目標，不要用 `'*'`；訊息只放型別與高度，不要放使用者資料，新訊息沿用 `THREADS_EMBED_` 前綴。
- [GitHub Pages 介紹頁](https://scorpio-meow.github.io/Threadkeep/)的互動示範會直接從 `main` 分支載入 `content.js` 並呼叫這兩個函式。重新命名或移除會讓示範失效，請一併修改 `docs/assets/js/cleaner-worker.js`。

## 手動測試清單

本專案目前沒有自動化測試，送出 PR 前請依改動範圍手動驗證：

- **擷取**：在動態牆、貼文頁與個人檔案頁各點一次「取得內嵌程式碼」，確認出現儲存提示，內文保留換行且不含 UI 雜訊；`/post/` 與 `/t/` 兩種網址都要能存。
- **Popup**：搜尋、6 種篩選、6 種排序、單篇刪除與復原、複製內嵌碼、匯入（選檔與貼上）、三種匯出。
- **控制面板**：統計與標籤雲、作者雲篩選、批次勾選與半選狀態、批次刪除與復原、即時預覽（鍵盤 `ESC` 與左右方向鍵、載入逾時與重新載入，以及 Threads 不提供內嵌的貼文會顯示中文錯誤提示而不是 Meta 的錯誤頁）。
- **更新貼文資料**：暫停、繼續、取消；勾選與未勾選時的更新範圍；失效貼文的標記與恢復；更新後匯出完整備份，只開放登入者觀看的貼文應有 `"embeddable": false`，一般貼文為 `true`。
- **匯入匯出**：合併與完全覆寫（含二次確認），匯出的檔案能再次匯入。
- **鍵盤與動態**：只用鍵盤完成上述操作，並在系統開啟「減少動態效果」時確認轉場動畫停用。點標籤徽章、刪除、按「復原」之後，焦點要留在附近的控制項，不會跳回頁首。
- **外觀模式**：在控制面板的「外觀」選單分別選跟隨系統、淺色、深色，並切換作業系統的淺色／深色設定，確認 Popup、控制面板與 Threads 頁面的通知都跟著改變；在 Windows 開啟高對比模式，確認焦點外框、勾選框與選取狀態看得到。
- **提示**：滑鼠移到提示上時倒數暫停；用鍵盤把焦點移到「復原」按鈕時，提示不會消失。按「複製內嵌程式碼」後，按鈕原地顯示「已複製」，2.5 秒後淡回原本的文字。

## 文件同步

- 新增或修改儲存欄位時，同步更新 README 的[資料模型與儲存 Schema](./README.md#資料模型與儲存-schema)、[llms.txt](./llms.txt)（英文）與匯入匯出模組。
- 使用者看得到的行為改變，請同步更新 README 對應段落；若介紹頁（`docs/index.html`）有提到，也一併修改。
- 過濾規則的數量（目前為 44 條）寫在 README 與 llms.txt 裡，增減規則時請一起更新。
- 版本號與 [CHANGELOG.md](./CHANGELOG.md) 由維護者在發版時整理，PR 不需要修改 `manifest.json` 的 `version`，但請在 PR 說明中寫出這次變更對使用者的影響。

## Commit 訊息

沿用 [Conventional Commits](https://www.conventionalcommits.org/zh-hant/v1.0.0/) 格式，說明以繁體中文撰寫：

```
<type>(<scope>): <說明>
```

- 常用 type：`feat`（新功能）、`fix`（修正）、`refactor`（重構）、`docs`（文件）、`chore`（雜項）。
- scope 可省略，常見的有 `extractor`、`dashboard`、`ui`、`css`、`security`、`filter`、`embed`。
- 例：`fix(extractor): 修復貼文內含翻譯按鈕時無法正常提取內文的問題`

## 送出 Pull Request

1. 從 `main` 建立分支，一個 PR 只處理一件事。
2. 依上方清單手動測試，並更新相關文件。
3. 送出 PR 時填寫範本，介面變更請附上修改前後的截圖。
4. 維護者審查後可能會請你調整，合併方式由維護者決定。

## 授權

送出貢獻即表示你同意該貢獻以本專案的 [MIT 授權條款](./LICENSE)釋出。
