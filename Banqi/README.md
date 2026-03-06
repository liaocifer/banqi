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

1. 在 [Firebase Console](https://console.firebase.google.com) 建立專案並啟用 Firestore。  
2. 複製 `firebase-config.js.example` 為 `firebase-config.js`，填入你的 API 金鑰等設定。  
3. 將遊戲部署到 **HTTPS 網址**（如 Netlify / GitHub Pages），同一網址給雙方打開，一人「建立遊戲」、一人「加入遊戲」輸入 6 位代碼即可。

---

## 檔案說明

| 檔案 | 說明 |
|------|------|
| `index.html` | 主頁面 |
| `game.js` | 遊戲邏輯 |
| `style.css` | 樣式 |
| `firebase-config.js` | Firebase 設定（需自行建立並填入，見上方） |
| `firebase-config.js.example` | Firebase 設定範例 |

---

**總結：** 不需安裝任何程式，用瀏覽器打開連結即可玩；要跟家人連線時，把部署後的網址傳給對方即可。
