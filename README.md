# 2026 秋郊．第二梯 行程查詢系統

給同仁查詢自己（或其他同仁）8/29 第二梯秋郊行程的內部小網站：輸入員工編號即可看到集合車站、午宴桌次、下午／晚上行程、遊覽車、高鐵車廂座位（如已排定）與攜眷資訊；另有「出團名單」可依姓名／部門搜尋確認參加人員，以及「場地介紹」頁面（島語午宴地點與座位圖、洲際棒球場位置說明）。

這是一個**純靜態網頁 + Vercel Serverless Functions** 的小專案，沒有資料庫、不需要 `npm install` 任何額外套件即可執行（`/api` 內只用了 Node.js 內建模組），部署到 Vercel 非常單純。

## 個資與存取保護說明

- 原始 Excel 中的身分證字號、生日、手機號碼、緊急聯絡人電話等個資**完全沒有**放進這個網站的資料檔（`data/employees.json`），只保留行程相關欄位（姓名、處別部門、集合車站、行程選擇、遊覽車、桌次、攜眷人數與行程選擇等）。
- 網站有一層共用通關密碼保護（見下方環境變數 `SITE_PASSWORD`），所有頁面與 API 都需要先登入取得的 token 才能存取，避免公開網址被搜尋引擎或外部人士任意瀏覽。
- 密碼是「全體同仁共用一組」，不是個人帳密，請透過活動群組／梯長另行公告，不要寫在網頁上或公開頻道。

## 專案結構

```
├── index.html      首頁：輸入員工編號查詢行程
├── roster.html     出團名單（依姓名／部門搜尋）
├── info.html       場地介紹（島語午宴地點、座位圖、洲際棒球場位置）
├── login.html      通關密碼登入頁
├── styles.css / app.js   共用樣式與前端小工具（登入狀態、API 呼叫）
├── api/
│   ├── login.js      驗證通關密碼、發出 token
│   ├── verify.js      驗證 token 是否有效
│   ├── lookup.js      依員工編號查詢單人行程
│   ├── roster.js      回傳出團名單（不含敏感欄位）
│   └── reference.js   回傳場地／座位圖等參考資料
├── lib/auth.js     token 簽發與驗證（HMAC，不需資料庫）
├── data/
│   ├── employees.json   第二梯 265 位同仁行程資料（已去除個資欄位）
│   └── reference.json   場地資訊與島語座位圖版面資料
└── scripts/         資料是怎麼從 Excel 整理出來的（供之後更新資料用，部署網站不需要它）
```

## 部署到 Vercel（步驟）

### 方法一：用 Vercel CLI（最快）

1. 安裝 Vercel CLI（若尚未安裝）：
   ```bash
   npm install -g vercel
   ```
2. 進到專案資料夾，登入並部署：
   ```bash
   cd ctbc-2026-autumn-outing
   vercel login
   vercel
   ```
   第一次會問幾個設定問題，全部用預設值即可（這是純靜態＋API 專案，**不需要**設定 Build Command / Output Directory，直接留空或選 "Other"）。
3. 部署完成後，到 [Vercel Dashboard](https://vercel.com/dashboard) 找到這個專案 → **Settings → Environment Variables**，新增：
   - `SITE_PASSWORD`：同仁登入用的通關密碼（自訂，例如 `ctbc0829`）
   - `AUTH_SECRET`：一串隨機字串，用於簽署登入 token（可用 `openssl rand -hex 32` 產生）
4. 設定完環境變數後，重新部署一次讓變數生效：
   ```bash
   vercel --prod
   ```
5. 完成！Vercel 會給你一個 `https://xxxx.vercel.app` 網址，這就是可以分享給同仁的查詢網站。

### 方法二：用 GitHub + Vercel 網站介面

1. 把這個資料夾推到一個 GitHub repo（可以設為 Private repo）。
2. 到 [vercel.com/new](https://vercel.com/new)，選擇該 repo → Import。
3. Framework Preset 選 **Other**（不需要 Build Command，Output Directory 留空即可）。
4. 在 **Environment Variables** 區塊加入 `SITE_PASSWORD` 與 `AUTH_SECRET`（同上）。
5. 按 Deploy，完成後即可拿到網址。

## 本機測試（選用）

不需要 `npm install`，直接用 Node 內建模組跑一個簡易測試伺服器：

```bash
SITE_PASSWORD=test AUTH_SECRET=test-secret node dev-server.js
```

然後瀏覽器打開 `http://localhost:3131/login.html`，用密碼 `test` 登入即可測試全部功能。`dev-server.js` 只是本機測試用，**不會**被部署到 Vercel（正式環境由 Vercel 自動用 `/api` 底下的檔案建立 Serverless Functions）。

## 已知限制

- 本系統資料僅涵蓋**第二梯（8/29，經策／數平／作資）**，不含其他梯次同仁的個人行程。
- 遊覽車、午宴桌次、高鐵車廂座位是從 Excel 的分車表／分桌表／高鐵分車表以姓名比對整理而成；少數同名同仁或表單中僅以部門代稱（尚未填入姓名）的座位，可能查不到或需與梯長確認，頁面上會顯示「尚未排定／請洽梯長」。
- 高鐵車廂座位資訊僅涵蓋名單中有明確標註姓名的部分（約 4 成），其餘同仁請以現場發放的實體車票 / 梯長通知為準。
- 島語座位圖（`info.html` 的「座位圖」區塊）是依 Excel「分桌座位圖請參考」工作表的桌次相對位置整理而成，用色塊＋桌號呈現各桌大致所在方位，非精確到公分的現場平面圖，僅供同仁快速找到自己桌次的大概位置。
- 如果之後 Excel 資料有更新（例如報名人數變動、桌次調整），需要重新整理 `data/employees.json`（可參考 `scripts/build_employees.py` 的邏輯），目前這一步是手動的，沒有做成自動同步。

## 修改通關密碼

到 Vercel Dashboard → 專案 → Settings → Environment Variables，修改 `SITE_PASSWORD` 的值後按 Redeploy 即可生效（既有同仁已登入的裝置在 token 到期前，約 30 天內仍可繼續使用舊 session，如需立即讓所有人重新輸入新密碼，同時更換 `AUTH_SECRET` 即可讓舊 token 全部失效）。
