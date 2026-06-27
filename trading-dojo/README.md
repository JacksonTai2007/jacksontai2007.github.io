# Trading Dojo 📈

一個離線可用、可安裝到手機的**價格行為練習場**（PWA）。看 K 線圖，預測接下來幾根會漲還是跌，按 **做多 Long / 做空 Short**，系統揭曉走勢、結算虛擬損益，並追蹤你的勝率、連勝與資金曲線。

> 純練習用途：行情由隨機演算法即時生成，與真實市場無關，不構成投資建議。

## 功能

- 🕯️ Canvas 繪製的 K 線圖，最後一根之後的走勢被隱藏
- ▲▼ Long / Short 二選一預測，逐根揭曉 + 損益結算動畫
- 📊 勝率、連勝 / 最佳連勝、交易數、虛擬資金（存在 `localStorage`）
- 🎚️ 三種難度（波動率 / 揭曉根數不同）
- 📱 PWA：可「加入主畫面」，離線也能玩
- 🔒 無後端、無追蹤，資料只留在你自己的裝置

## 檔案

| 檔案 | 用途 |
|------|------|
| `index.html` | 整個 App（內嵌 CSS / JS，單檔運行） |
| `manifest.json` | PWA 設定（名稱、圖示、`scope` 為相對路徑） |
| `sw.js` | Service Worker，快取 App Shell 供離線使用 |
| `icons/` | 192 / 512 一般圖示 + 512 maskable 圖示 |

## 本機預覽

PWA 需要透過 HTTP（不是 `file://`）才能註冊 Service Worker：

```bash
# 在這個資料夾的上一層執行
python3 -m http.server 8099
# 然後開 http://localhost:8099/trading-dojo/
```

## 部署到 GitHub Pages

本資料夾位於 `jacksontai2007.github.io` 倉庫底下，啟用 Pages 後即可透過子路徑存取：

1. 倉庫 **Settings → Pages**
2. Source 選 **Deploy from a branch**，Branch 選 `main` / `(root)`，Save
3. 等幾分鐘，網址為 **`https://jacksontai2007.github.io/trading-dojo/`**
4. 手機 Chrome 開啟 → 選單 → 「安裝應用 / 加入主畫面」即可

因為 `manifest.json`、`sw.js` 與圖示全部使用**相對路徑**，放在子路徑下也能正常安裝與離線運作。
