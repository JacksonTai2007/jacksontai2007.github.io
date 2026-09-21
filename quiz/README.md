# 題庫練習 `/quiz/`

零建置、純靜態的題庫練習頁，手機與電腦皆可用。線上位址：<https://jacksontai2007.github.io/quiz/>

## 功能

- **順序練習**：按題號作答，自動記住進度，下次打開接著練
- **隨機練習**：打亂題序
- **智能複習**：依「錯過幾次、多久沒碰、有沒有做過」排優先序，每輪 20 題
- **錯題本**：只練做錯的題，連續答對 2 次自動移出
- **收藏夾**：練習標記過的題
- **模擬考試**：隨機抽 10 / 20 / 50 / 100 題，可限時，作答時不判分，交卷後統一評分、記入錯題本，保留最近成績
- **背題模式**：直接顯示答案快速過一遍
- **瀏覽 / 搜尋**：全部題目列表，關鍵字或題號搜尋，可按錯題 / 收藏 / 未做篩選
- 答題卡（手機底部抽屜、電腦右側常駐）、即時對錯反饋、作答歷史、正確率、連續天數
- 手機左右滑動換題；電腦鍵盤 `A/B/C`、`1/2/3`、`←/→`、`Enter`、`F` 收藏、`G` 答題卡、`?` 說明
- 設定：答對自動下一題、選項亂序、字號、動畫開關（跟隨系統減少動態）、深淺色（與博客共用）
- 進度只存在本機瀏覽器（localStorage），可匯出 / 匯入 JSON 換裝置接續，可重置
- 可匯入自訂題庫 JSON，可加到主畫面當 App 使用（manifest）

動畫全部由 [GSAP](https://gsap.com)（`vendor/gsap/`，3.15，自託管）驅動，寫法遵循
[greensock/gsap-skills](https://github.com/greensock/gsap-skills)：timeline 串接畫面切換、Flip 做列表篩選過渡、
Observer 做手勢、ScrollTo 捲動、SplitText 標題揭示、DrawSVG 成績環、`gsap.matchMedia()` 處理 reduced-motion 與手機 / 桌面差異。

## 目錄

```
quiz/
  index.html            頁面骨架
  quiz.css              紙墨主題（與博客同一套 token）
  quiz.js               全部邏輯（模式、記錄、動效）
  data/index.json       題庫清單
  data/diplomacy-17.json 第十七屆澳門青少年外交知識競賽推廣賽題目（100 題）
  tools/pdf2json.py     把同格式 PDF 轉成題庫 JSON（需要 pip install pymupdf）
  vendor/gsap/          GSAP 3.15 與外掛（Standard "no charge" license）
  manifest.webmanifest / icon-*.png
```

## 新增題庫

1. 準備題庫 JSON（或用下面的腳本從 PDF 轉）：

   ```json
   {
     "id": "my-bank",
     "title": "題庫名稱",
     "short": "短名",
     "description": "一句話說明",
     "questions": [
       { "id": 1, "stem": "題幹，空格用 ____ 表示", "options": ["選項 A", "選項 B", "選項 C"], "answer": 1, "explain": "可選的解析" }
     ]
   }
   ```

   `answer` 是 0 起算的索引（也接受 `"B"` 這種字母）。

2. 放到 `quiz/data/`，並在 `quiz/data/index.json` 的 `banks` 加一筆 `{ "id", "file", "title", "short", "count" }`。
   首頁出現多於一個題庫時會顯示下拉選單，也可用 `?bank=<id>` 直接開。

   不想改檔案的話，也可以在頁面「設定 → 匯入題庫 JSON」直接匯入（只存在該瀏覽器）。

### 從 PDF 轉換

PDF 需符合「`1、題幹`／`A. 選項`／正確選項末尾標 `*`」的格式（本屆推廣賽題目就是這種）：

```bash
pip install pymupdf
python tools/pdf2json.py 題目.pdf -o data/my-bank.json --id my-bank --title "題庫名稱" --short "短名"
```

腳本會剔除頁眉頁腳、合併 PDF 換行、把空格佔位統一成 `____`，並檢查每題恰好一個正確答案。

## 本地預覽

```bash
python -m http.server 8000
# 開 http://127.0.0.1:8000/quiz/
```
