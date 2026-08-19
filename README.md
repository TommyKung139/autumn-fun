# 2026 秋郊．第二梯 行程查詢系統

給同仁查詢自己（或其他同仁）8/29 第二梯秋郊行程的內部小網站：輸入員工編號即可看到集合車站、午宴桌次、下午／晚上行程、遊覽車、高鐵車廂座位與發車時間（如已排定）與攜眷資訊；另有「行程介紹」頁面（當日完整行程時間表、島語午宴地點、座位圖、餐檯位置、洲際棒球場位置說明）；梯長／福委另有一個「資料編輯後台」（`/edit.html`）可即時調整同仁的行程資料，不需要重新部署網站。

為保護同仁隱私，本網站**沒有**開放瀏覽/搜尋全體出團名單的功能——只能用「自己知道的員工編號」一筆一筆查，不能用姓名反查別人是誰、部門有誰參加等。

這是一個**靜態網頁 + Vercel Serverless Functions** 的小專案。資料存放在 **Firebase Firestore**（可即時編輯、即時反映在查詢頁），若尚未設定 Firebase，網站會自動退回使用內建的 `data/employees.json` 唯讀資料（此時 `/edit.html` 的編輯功能無法儲存到雲端，僅能在本機測試模式下寫入暫存檔）。`/api` 底下的程式碼只用 Node.js 內建模組 + `firebase-admin`，部署到 Vercel 非常單純。

## 個資與存取保護說明

- 原始 Excel 中的身分證字號、生日、手機號碼、緊急聯絡人電話等個資**完全沒有**放進這個網站的資料檔（`data/employees.json` 及 Firestore 中的資料），只保留行程相關欄位（姓名、處別部門、集合車站、行程選擇、遊覽車、桌次、攜眷人數與行程選擇等）。
- 網站有兩層通關密碼保護：
  - `SITE_PASSWORD`：一般同仁查詢用（唯讀），所有頁面與 API 都需要先登入取得的 token 才能存取，避免公開網址被搜尋引擎或外部人士任意瀏覽。
  - `EDITOR_PASSWORD`：梯長／福委在 `/edit.html` 編輯資料用，權限比一般查詢密碼高，請只給需要調整資料的少數人。
- 這兩組密碼都是「共用一組」，不是個人帳密，請透過活動群組另行公告，不要寫在網頁上或公開頻道。

## 專案結構

```
├── index.html      首頁：輸入員工編號查詢行程（含高鐵發車時間）
├── info.html       行程介紹：當日完整行程時間表、島語午宴地點、座位圖、洲際棒球場位置
├── edit.html        資料編輯後台（梯長／福委專用，需 EDITOR_PASSWORD）
├── login.html      一般查詢通關密碼登入頁
├── styles.css / app.js   共用樣式與前端小工具（登入狀態、API 呼叫）
├── api/
│   ├── login.js          驗證一般查詢密碼、發出 viewer token
│   ├── editor-login.js   驗證編輯密碼、發出 editor token
│   ├── verify.js         驗證 token 是否有效，回傳角色（viewer／editor）
│   ├── lookup.js         依員工編號查詢單人行程（含高鐵時刻）
│   ├── employee-update.js 編輯後台儲存變更用（需 editor token）
│   └── reference.js      回傳行程時間表／場地／座位圖等參考資料
├── lib/
│   ├── auth.js       token 簽發與驗證（HMAC，不需資料庫），支援 viewer／editor 兩種角色
│   ├── firestore.js  資料存取層：有設定 Firebase 環境變數時讀寫真實 Firestore，
│   │                 沒有設定時自動退回本機 JSON 檔（data/employees.local.json，僅本機測試用）
│   └── schedule.js   依「行程說明」總表（data/reference.json 的 day_schedule）換算每個人
│                      高鐵去程／回程的實際發車時間
├── data/
│   ├── employees.json   第二梯 265 位同仁行程資料（已去除個資欄位；也是 Firestore 的初始匯入來源）
│   └── reference.json   行程時間表、場地資訊與島語座位圖版面資料
└── scripts/
    ├── build_employees.py   從 Excel 產生 data/employees.json（供之後更新資料用，部署網站不需要它）
    ├── build_table_layout.py / build_combined_layout.py   座位圖版面資料的產生流程
    ├── sync_layout_codes.py 讓座位圖上的桌號與「分桌表」的桌號完全一致（見下方「桌號對齊」）
    ├── audit_extraction.py  比對 Excel 與 data/employees.json，列出所有不一致（唯讀，不會改資料）
    └── seed_firestore.js    把 data/employees.json 匯入／同步到 Firestore（見下方說明）
```

## 資料正確性與稽核

`scripts/audit_extraction.py` 會獨立重新從 Excel 推導每一位同仁的每一個欄位，再跟現有的
`data/employees.json` 逐欄比對，把所有差異與「在分車／分桌／高鐵表裡出現、但對不到任何報名同仁的名字」
全部列出來。資料有疑慮時先跑這支，不會動到任何資料：

```bash
SRC_XLSX=/path/to/2026秋郊報名表_第二梯_數平經策作資0818.xlsx python3 scripts/audit_extraction.py
```

姓名比對是這份資料最容易出錯的地方（分車表／分桌表／高鐵表都只寫姓名，要反查回報名表）。
`build_employees.py` 針對以下四種狀況都有處理，每一種都曾造成過實際的指派錯誤：

1. **同名同仁**：有兩位同仁都叫陳怡君（經策／數據營運部、數平／數位平台部）。改用表頭的處別
   （經策／數平／作資）判斷，處別仍無法區分時（例如一台車同時載兩個處），再用下午／晚間行程選擇比對。
2. **報名表自己就帶括號的姓名**：兩位林芝萱在報名表上就寫成「林芝萱(Chih)」與「林芝萱 (Boa)」。
   比對時先試「完整姓名精確比對」，才不會把括號剝掉後兩個人都對不到。
3. **眷屬列**：座位表裡的眷屬會寫成「王小明(眷)」「王小明（眷屬）」「王小明眷屬」等各種寫法，
   全部要排除，否則眷屬的高鐵座位會蓋掉同仁本人的座位。
4. **異體字**：同一個人在不同分頁被寫成莊若艷／莊若豔。比對前會做 NFKC 正規化、去除空白，並把已知的
   異體字對折合併。

另外，高鐵座位表裡有少數儲存格落在任何一個車次區塊之外（沒有車次、沒有座位英文字母），
那是表單裡的殘留內容而非真正的座位，`build_employees.py` 會略過它們。

### 桌號對齊

「分桌表」（同仁實際被分到哪一桌）與「分桌座位圖請參考」（畫平面圖用）對同一組桌子的寫法不一樣，
例如前者寫 `A12A & A13`、`C8、C9`，後者寫 `A12 A13`、`C8 C9`。同仁在行程頁看到的是「分桌表」的寫法，
所以座位圖也必須用同一組字串，否則在地圖上會找不到自己的桌次。`scripts/sync_layout_codes.py`
負責把座位圖的桌號、人數、科別對齊到「分桌表」：

```bash
SRC_XLSX=/path/to/workbook.xlsx python3 scripts/sync_layout_codes.py
```

座位圖的高亮比對本身也改成「以單一桌號為單位」比對（`A12A & A13` 會拆成 `A12A`、`A13` 兩個桌號，
只要其中一個對得上就高亮），因此即使日後兩份表的寫法又不一致，也還是找得到。

## Firebase 設定（讓資料可即時編輯）

若不設定 Firebase，網站仍可正常查詢（讀取內建的 `data/employees.json`），只是 `/edit.html` 的變更無法真正持久化到雲端。要讓編輯即時生效，請照以下步驟設定：

1. 到 [Firebase Console](https://console.firebase.google.com/) 建立一個新專案（或使用現有專案）。
2. 左側選單 → **Build → Firestore Database** → 建立資料庫（正式環境模式即可，地區選 `asia-east1` 或就近地區）。
3. 左上角齒輪 → **專案設定 → 服務帳戶（Service Accounts）** → 點「產生新的私密金鑰」，下載一個 JSON 檔（**這個檔案本身含有機密資訊，不要放到公開的 GitHub repo，也不要傳給不相關的人**）。
4. 從下載的 JSON 檔裡取出三個值，稍後要設成 Vercel 環境變數：
   - `project_id` → 對應 `FIREBASE_PROJECT_ID`
   - `client_email` → 對應 `FIREBASE_CLIENT_EMAIL`
   - `private_key` → 對應 `FIREBASE_PRIVATE_KEY`（這個值本身包含換行字元 `\n`，貼到 Vercel 環境變數欄位時保持原樣含 `\n` 即可，程式會自動轉換）
5. 在專案資料夾安裝 `firebase-admin`（`package.json` 已宣告此相依套件）：
   ```bash
   npm install
   ```
6. 執行匯入腳本，把 `data/employees.json` 的 265 筆資料寫入 Firestore 的 `employees` collection：
   ```bash
   FIREBASE_PROJECT_ID=你的專案ID \
   FIREBASE_CLIENT_EMAIL=你的服務帳戶email \
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n" \
   node scripts/seed_firestore.js
   ```
   這個腳本可以重複執行（例如 Excel 來源資料又更新了一批，重新產生 `data/employees.json` 後可以再跑一次覆蓋 Firestore），但**不會**保留你先前在 `/edit.html` 上做的個別調整——如果已經開放編輯一段時間，重新匯入前請三思，或改成手動在 Firestore Console 調整單筆資料。
7. 到 Vercel 專案 → **Settings → Environment Variables**，新增 `FIREBASE_PROJECT_ID`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_PRIVATE_KEY` 三個變數（同步驟 4 的值），並重新部署（`vercel --prod`）讓變數生效。

設定完成後，`/api/lookup` 與 `/api/employee-update` 會自動改用 Firestore 讀寫，`/edit.html` 儲存的內容會立刻反映在所有人查詢到的結果上，不需要重新部署網站。

## 資料編輯後台（`/edit.html`）

- 網址：`https://你的網址/edit.html`（首頁與行程介紹頁的頁尾也有「梯長／福委後台」連結）。
- 需要輸入 `EDITOR_PASSWORD`（與一般查詢密碼不同）才能登入。
- 登入後可用員工編號搜尋單一同仁，編輯以下欄位並即時儲存：處別／部門／地區／員工類型、餐食、攜眷（是否攜眷＋各年齡層人數）、下午／晚間行程選擇、上午／下午遊覽車、午宴桌次、高鐵去程／回程站、高鐵去程／回程車票（車次／車廂／座位／站別／備註）。
- **姓名、員工編號、梯次、眷屬名單**不開放在此編輯（這些是報名表的原始身分資料，如需更正請直接調整來源 Excel 並重新執行 `scripts/build_employees.py` 與 `scripts/seed_firestore.js`）。
- 高鐵車票區塊：若某人尚未安排該段車票，把「車次」欄位留空即可，儲存時會自動視為「尚未安排」。

## 部署到 Vercel（步驟）

### 方法一：用 Vercel CLI（最快）

1. 安裝 Vercel CLI（若尚未安裝）：
   ```bash
   npm install -g vercel
   ```
2. 進到專案資料夾，安裝相依套件、登入並部署：
   ```bash
   cd ctbc-2026-autumn-outing
   npm install
   vercel login
   vercel
   ```
   第一次會問幾個設定問題，全部用預設值即可（這是靜態＋API 專案，**不需要**設定 Build Command / Output Directory，直接留空或選 "Other"）。
3. 部署完成後，到 [Vercel Dashboard](https://vercel.com/dashboard) 找到這個專案 → **Settings → Environment Variables**，新增：
   - `SITE_PASSWORD`：同仁查詢用的通關密碼（自訂，例如 `ctbc0829`）
   - `EDITOR_PASSWORD`：梯長／福委編輯用的密碼（自訂，需與上面不同）
   - `AUTH_SECRET`：一串隨機字串，用於簽署登入 token（可用 `openssl rand -hex 32` 產生）
   - 若要啟用即時編輯／Firebase，另外加上 `FIREBASE_PROJECT_ID`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_PRIVATE_KEY`（見上方「Firebase 設定」章節；沒設定也能正常查詢，只是不能真正儲存編輯內容）
4. 設定完環境變數後，重新部署一次讓變數生效：
   ```bash
   vercel --prod
   ```
5. 完成！Vercel 會給你一個 `https://xxxx.vercel.app` 網址，這就是可以分享給同仁的查詢網站。

### 方法二：用 GitHub + Vercel 網站介面

1. 把這個資料夾推到一個 GitHub repo（可以設為 Private repo）。
2. 到 [vercel.com/new](https://vercel.com/new)，選擇該 repo → Import。
3. Framework Preset 選 **Other**（不需要 Build Command，Output Directory 留空即可）。
4. 在 **Environment Variables** 區塊加入 `SITE_PASSWORD`、`EDITOR_PASSWORD`、`AUTH_SECRET`，以及選用的 `FIREBASE_*` 三項（同上）。
5. 按 Deploy，完成後即可拿到網址，再依「Firebase 設定」章節的步驟 6 執行一次 `scripts/seed_firestore.js` 匯入資料。

## 本機測試（選用）

`dev-server.js` 是本機測試用的簡易伺服器，**不會**被部署到 Vercel（正式環境由 Vercel 自動用 `/api` 底下的檔案建立 Serverless Functions）。本機測試模式下沒有設定任何 `FIREBASE_*` 環境變數，會自動使用 `data/employees.local.json`（第一次執行時從 `data/employees.json` 複製一份，已加入 `.gitignore`，不會被提交）作為暫存資料庫，可以完整測試查詢與編輯功能，但編輯結果只存在本機、不會同步到雲端。

```bash
node dev-server.js
```

（`SITE_PASSWORD` / `EDITOR_PASSWORD` / `AUTH_SECRET` 有預設測試值，見 `dev-server.js` 開頭；正式環境請務必在 Vercel 環境變數改成自訂值。）

然後瀏覽器打開 `http://localhost:3131/login.html`，用密碼 `testpass` 登入即可測試查詢功能；`http://localhost:3131/edit.html` 用密碼 `editortest` 登入可測試編輯功能。

## 已知限制

- 本系統資料僅涵蓋**第二梯（8/29，經策／數平／作資）**，不含其他梯次同仁的個人行程。
- 遊覽車、午宴桌次、高鐵車廂座位是從 Excel 的分車表／分桌表／高鐵分車表以姓名比對整理而成；少數同名同仁或表單中僅以部門代稱（尚未填入姓名）的座位，可能查不到或需與梯長確認，頁面上會顯示「尚未排定／請洽梯長」。
- 高鐵去程／回程發車時間是依「行程說明」總表（`data/reference.json` 的 `day_schedule`）與每個人的車次／上下車站別自動換算：若已知確切車次，顯示該車次的實際時刻；若車次未知但上車站只被一班車服務，仍能顯示唯一時間；若上車站被多班車服務且車次未知，會列出所有可能車次與時間供參考，並提示「請以現場公告或梯長通知為準」。
- 報名時去程選「台中高鐵站(台中同仁專用)」的同仁不搭去程高鐵，行程頁會改顯示「08:30 台中同仁－公司集合出發」而不是車次時間（台中是所有去程車次的**終點站**，若拿它去比對時刻表，換算出來的其實是列車的抵達時間，不是這些同仁的出發時間）。回程選「自行回家」者則顯示「自行回家（未搭乘團體回程高鐵）」。
- 少數同仁的攜眷資料在 Excel「(彙整)報名表(眷屬)」分頁中查無對應的員工編號（例如員工編號打錯、或該眷屬所屬同仁根本不在第二梯確認名單中），這幾筆屬於原始 Excel 本身的資料缺漏，無法比對到人，執行 `scripts/build_employees.py` 時會印出「unmatched dependent row」清單，可提供給梯長／福委核對源頭資料。
- 高鐵車廂座位資訊僅涵蓋名單中有明確標註姓名的部分（約 4 成），其餘同仁請以現場發放的實體車票 / 梯長通知為準（可透過 `/edit.html` 後續補上）。
- 島語座位圖（`info.html` 的「午宴位置圖」區塊，資料在 `reference.json` 的 `combined_layout`）是依島語洲際店官方公告的實際平面圖重新繪製：餐檯（極、燦、煲、膳、炙、盛、鮮、沁）、服務台、柱、自助飲料、續（甜點）、板前座位、大門入口都照平面圖的相對位置擺放；桌次（A／B／C 區）的精確門牌號碼與所屬部門取自 Excel「分桌座位圖請參考」工作表，同一區內桌與桌的相對前後順序也保留自該工作表，但整區在平面圖中的位置是重新對齊到官方平面圖對應區塊，讓餐檯與桌次能疊在同一張圖上對照。這仍然是排版對照示意，不是逐桌精確到公分的測繪圖，正確位置請以現場動線與工作人員指引為準。像「C8、C9」這種標示代表兩桌併成一桌（C8C9桌），不是兩個分開的位置。
- 地圖較寬（尤其 A 區桌次多，位於平面圖右側），電腦或手機上需要左右滑動才能看到完整內容，這是設計上刻意保留原始平面圖比例的結果，不是排版錯誤。
- 若尚未設定 Firebase（見上方章節），`/edit.html` 在正式部署（Vercel）上的編輯無法持久化保存；請先完成 Firebase 設定再開放編輯後台給梯長／福委使用。
- 若之後 Excel 報名資料整批更動（例如新增／刪除報名人員），需要重新執行 `scripts/build_employees.py` 產生新的 `data/employees.json`，再執行 `scripts/seed_firestore.js` 覆蓋匯入 Firestore；日常小幅調整（桌次、車票、行程選擇等）建議直接用 `/edit.html`，不需要重新整批匯入。

## 修改通關密碼

到 Vercel Dashboard → 專案 → Settings → Environment Variables，修改 `SITE_PASSWORD`（一般查詢）或 `EDITOR_PASSWORD`（編輯後台）的值後按 Redeploy 即可生效（既有同仁已登入的裝置在 token 到期前，約 30 天內仍可繼續使用舊 session，如需立即讓所有人重新輸入新密碼，同時更換 `AUTH_SECRET` 即可讓舊 token 全部失效）。
