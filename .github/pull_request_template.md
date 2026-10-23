## 變更內容

<!-- 這個 PR 改了什麼、為什麼要改。介面變更請附上修改前後的截圖。 -->

## 相關 Issue

<!-- 例如 Closes #123；沒有可留白 -->

## 對使用者的影響

<!-- 寫給 Changelog 用：使用者會看到什麼不同。純內部重構可寫「無」。 -->

## 測試方式

- 瀏覽器與版本：
- 手動測試的項目（參考 [CONTRIBUTING.md 的手動測試清單](https://github.com/Scorpio-meow/Threadkeep/blob/main/CONTRIBUTING.md#手動測試清單)）：

## 檢查清單

- [ ] 沒有引入 npm 套件、外部 CDN 腳本或框架
- [ ] 沒有行內樣式（`style="..."`）或行內事件（`onclick="..."`），事件以 `addEventListener` 綁定
- [ ] 沒有使用 `confirm()`、`alert()`、`prompt()`
- [ ] 來自網頁的字串以 `textContent` 或 `escapeHtml` 輸出，連結與 iframe 來源經過 `sanitizeUrl`
- [ ] 新增的 Modal 有 `role="dialog"`、`aria-modal="true"`、焦點鎖定與焦點還原，且能只用鍵盤操作
- [ ] 沒有新增權限；若有，已在上方說明理由
- [ ] 修改過濾規則時，`content.js` 與 `dashboard.js` 的 `extractPostInfoFromPage` 已同步
- [ ] 修改儲存欄位時，README 的 Schema、`llms.txt` 與匯入匯出模組已同步
- [ ] 使用者看得到的行為改變已同步到 README（以及介紹頁 `docs/index.html`，如有提到）
