# 廖家暗棋 v0.5

網頁版暗棋，**免安裝**，用瀏覽器即可遊玩：雙人對戰、對戰 AI、線上對戰。

---

## 免安裝遊玩方式

### 方式一：直接打開網址（推薦）

把專案放到網路上，之後只要在手機或電腦瀏覽器打開連結即可，無需安裝任何軟體。

**免費上傳方式：**

1. **Netlify（最簡單）**  
   - 打開 [app.netlify.com/drop](https://app.netlify.com/drop)  
   - 把整個 `Banqi` 資料夾拖進去  
   - 會得到一個網址，例如：`https://xxxx.netlify.app`  
   - 把網址傳給家人，用瀏覽器打開即可玩  

2. **GitHub Pages**  
   - 把專案推上 GitHub  
   - 到倉庫 **Settings → Pages**，Source 選 **main**（或你的預設分支），資料夾選 **/ (root)**  
   - 儲存後會得到網址：`https://你的帳號.github.io/倉庫名稱/`  
   - 若倉庫名為 `Banqi`，且 Pages 設在根目錄，請用：`https://你的帳號.github.io/Banqi/`（結尾要有 `/`）  

3. **Vercel**  
   - 到 [vercel.com](https://vercel.com) 用 GitHub 登入，匯入專案  
   - 根目錄選放 `index.html` 的那一層（即 Banqi 資料夾）  
   - 部署後會得到一個 `.vercel.app` 網址  

### 方式二：本機用瀏覽器打開

- **雙人 / AI**：直接雙擊 `index.html` 用瀏覽器打開即可。  
- **線上對戰**：需透過「網址」存取（例如用上面的 Netlify / GitHub Pages），或在本機用簡易伺服器（見下方）開啟，否則 Firebase 可能無法正常運作。

**本機簡易伺服器（可選）：**

```bash
# 在 Banqi 資料夾裡執行（二選一）
npx --yes serve .
# 或
python3 -m http.server 8080
```

再用瀏覽器打開 `http://localhost:3000` 或 `http://localhost:8080`。

---

## 線上對戰設定（選用）

若要使用「線上對戰」：

1. 在 [Firebase Console](https://console.firebase.google.com) 建立專案並啟用 **Realtime Database**（建立資料庫）。  
2. 複製 `firebase-config.js.example` 為 `firebase-config.js`，填入你的 API 金鑰等設定（記得包含 `databaseURL`）。  
3. 將遊戲部署到 **HTTPS 網址**（如 Netlify / GitHub Pages），同一網址給雙方打開，一人「建立遊戲」、一人「加入遊戲」輸入 6 位代碼即可。

**不要把 `firebase-config.js` 推上公開的 GitHub**：此檔已加入 `.gitignore`。若用 GitHub Pages 部署且不想在 repo 裡放 API 金鑰，請用下方「用 GitHub Actions 注入設定」。

### 用 GitHub Actions 注入設定（推薦，公開 repo）

這樣做可以讓「線上對戰」在 GitHub Pages 上正常運作，又不會把 API 金鑰寫進 repo。照下面步驟做一次即可。

---

**步驟一：準備好你的 Firebase 設定內容**

1. 在你電腦的 Banqi 資料夾裡，用文字編輯器打開 **`firebase-config.js`**（若沒有，先複製 `firebase-config.js.example` 並改名，再填入 Firebase Console 給的 apiKey、databaseURL 等）。  
2. 用滑鼠**全選**整份檔案內容（從第一行 `window.firebaseConfig = {` 到最後一行 `};`）。  
3. **複製**（Ctrl+C / Cmd+C）。  
4. 先貼到記事本或備忘錄看一下，確認是完整的一整段程式碼、沒有少頭少尾，再關掉（不用存檔）。這份內容待會要貼到 GitHub。

---

**步驟二：在 GitHub 新增 Secret**

1. 用瀏覽器打開你的 **GitHub 倉庫**（例如 `https://github.com/你的帳號/banqi`）。  
2. 點上方的 **Settings**（設定）。  
3. 左側選 **Secrets and variables** → **Actions**。  
4. 點 **New repository secret**（新增倉庫秘密）。  
5. **Name（名稱）** 一定要填：`FIREBASE_CONFIG`（一個字都不能錯，全大寫、底線在中間）。  
6. **Secret（秘密）** 欄位裡，貼上你剛剛複製的「整份 firebase-config.js 內容」。  
7. 點 **Add secret**（新增秘密）。  
8. 完成後，在列表中應該會看到 **FIREBASE_CONFIG**（值不會顯示，只會顯示名稱）。

---

**步驟三：讓 GitHub 用 Actions 部署（只做一次）**

1. 同一個倉庫，左側點 **Pages**。  
2. 在 **Build and deployment** 底下，**Source** 選 **GitHub Actions**（不要選 Deploy from a branch）。  
3. 不用再按其他東西，這樣就設好了。

---

**步驟四：觸發一次部署**

1. 點倉庫上方的 **Actions**。  
2. 左側選 **Deploy to GitHub Pages**。  
3. 右邊點 **Run workflow** → 再點綠色的 **Run workflow**。  
4. 等約一分鐘，左側會出現一筆新的執行記錄，點進去看到綠勾就代表成功。  
5. 到 **Settings → Pages** 看一下網址（例如 `https://你的帳號.github.io/banqi/`），用瀏覽器打開，試一次「線上對戰」→「建立遊戲」。若仍出現「請先設定 Firebase…」，對該頁面做 **強制重新整理**（Ctrl+Shift+R 或 Cmd+Shift+R），再試一次。

---

**之後**：每次你 push 到 `main`，GitHub 會自動用你存的 `FIREBASE_CONFIG` 產生 `firebase-config.js` 並部署，repo 裡不會出現你的金鑰。

若你**沒有**設定 `FIREBASE_CONFIG`，部署時會用範例檔，線上對戰會顯示「請先設定 Firebase…」，就要回頭做步驟一、二、四。

**若你曾把 `firebase-config.js` 推上過 GitHub**：在倉庫用 `git rm --cached firebase-config.js` 並 commit，之後此檔就不會再被追蹤。若擔心外流，可到 Firebase Console 專案設定裡重新產生 Web API 金鑰，再更新本機的 `firebase-config.js` 與 GitHub 的 **FIREBASE_CONFIG** secret。

---

## 檔案說明

| 檔案 | 說明 |
|------|------|
| `index.html` | 主頁面 |
| `game.js` | 遊戲邏輯 |
| `style.css` | 樣式 |
| `firebase-config.js` | Firebase 設定（本機自建，**不提交到 Git**；或由 Actions 從 secret 產生） |
| `firebase-config.js.example` | Firebase 設定範例 |

---

**總結：** 不需安裝任何程式，用瀏覽器打開連結即可玩；要跟家人連線時，把部署後的網址傳給對方即可。
