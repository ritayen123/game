# 接字遊戲專案筆記

## 專案說明
多人即時網頁遊戲，玩家輪流在句子中插入一個中文字，可敲頭投票淘汰對手。

- 網址：https://game.fromnineon.com
- 後端：Node.js + Express + Socket.io（`server.js`）
- 前端：`public/index.html`（單一大型 HTML 檔案）

## 部署架構
- **平台**：Railway（`fromnineongame.up.railway.app`）
- **GitHub repo**：`https://github.com/ritayen123/game`（`ritayen123` 帳號）
- **DNS**：GoDaddy 管理，`game.fromnineon.com` CNAME → `fromnineongame.up.railway.app`
- **部署方式**：git push 到 GitHub main branch，Railway 自動部署

## 部署指令
```bash
git add .
git commit -m "說明"
git push
```

## 遊戲常數（server.js）
- `TURN_TIME = 15`：每輪答題秒數
- `KNOCK_WINDOW = 8`：敲頭投票窗口（秒）
- `MIN_PLAYERS = 2`：最少幾人才能開始
- `MAX_SENTENCE = 40`：句子最大字元數
- `MAX_RANDOM_PLAYERS = 8`：隨機房間最多人數

## 已修改紀錄
1. `KNOCK_WINDOW` 從 5 秒改為 8 秒
2. 修正前端計時器硬寫的 `5`（`index.html:2388`）改為 `8`
3. 修正計時器因伺服器/客戶端時鐘誤差顯示多 1 秒的問題（加上 `Math.min(totalSeconds, ...)` 限制）
4. 手機用戶按 Enter 不會直接進入遊戲（偵測 `userAgent` 判斷手機）
5. 「再玩一局」按鈕改為回到等待室，不自動開始遊戲（新增 `goBackToRoom()` 函式）
6. Logo 加上連結，點擊開新分頁前往 `fromnineon.com`
7. 加入 Google Analytics（`G-XS6YX0NE59`）追蹤 `game.fromnineon.com` 流量，與 `fromnineon.com` 同一個 GA 帳號下的獨立串流

## Google Analytics
- `fromnineon.com`：`G-K318HMNR62`（在 `/Users/yen/Project/fromnineon/index.html`）
- `game.fromnineon.com`：`G-XS6YX0NE59`（在 `public/index.html`）
- 兩個串流都在同一個 GA 帳號（`ritayen123`）下管理

## 注意事項
- Railway 免費方案每月 $5 美元用量，用完會停止服務
- 測試房間 ID：`9999`（有機器人甲乙丙，真人加入自動開始）
- 前端有些數值是硬寫的，修改 server.js 常數時要同步確認 index.html
