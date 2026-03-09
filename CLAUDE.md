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
- `KNOCK_WINDOW = 5`：敲頭投票窗口（秒）
- `MIN_PLAYERS = 2`：最少幾人才能開始
- `MAX_SENTENCE = 40`：句子最大字元數
- `MAX_RANDOM_PLAYERS = 8`：隨機房間最多人數
- `MAX_ROOMS = 50`：伺服器最大房間數（超過回傳「流量超載」）

## 已修改紀錄
1. `KNOCK_WINDOW` 從 5 秒改為 8 秒，後來改回 5 秒
2. 修正計時器因伺服器/客戶端時鐘誤差顯示多 1 秒（加上 `Math.min` 限制）
3. 手機用戶按 Enter 不會直接進入遊戲（偵測 `userAgent`）
4. 「再玩一局」按鈕改為回到等待室，不自動開始（新增 `goBackToRoom()`）
5. Logo 加上連結，點擊開新分頁前往 `fromnineon.com`
6. 加入 Google Analytics（`G-XS6YX0NE59`）追蹤 `game.fromnineon.com`
7. 長句子 UX 修正：句子選擇器改橫向捲動、分享卡動態字體大小
8. 移除隨機房間 30 秒自動倒數，改由玩家手動按開始
9. 隨機房間滿員/伺服器超載時顯示錯誤訊息（`流量超載中，請稍等再加入！`）
10. 計時器倒數 ≤5 秒時：外圈變紅色、脈動動畫、數字變大變紅
11. 手機輸入框自動 `scrollIntoView`，避免鍵盤遮住輸入框
12. 敲頭秒數從 8 秒改回 5 秒（前後端同步）
13. 修正觀戰玩家仍能投票敲頭的 bug（`btnDisabled` 加入 `isSpectating`）
14. 斷線後自動重連：`socket.on('connect')` 時若有 `myName + myRoomId` 自動 rejoin
15. 新增 `pendingMove = null` 在 `turnStart`（防禦性清除過期暫存）
16. 新增完整 GA 事件追蹤（見下方 GA Event 清單）

## Google Analytics
- `fromnineon.com`：`G-K318HMNR62`（在 `/Users/yen/Project/fromnineon/index.html`）
- `game.fromnineon.com`：`G-XS6YX0NE59`（在 `public/index.html`）
- 兩個串流都在同一個 GA 帳號（`ritayen123`）下管理

## GA 查看方式
- GA 後台 → 報表 → 即時總覽 → 新增比較 → 主機名稱 → `game.fromnineon.com`
- 兩個網站流量預設合併顯示，需用主機名稱篩選才能分開看

## GA 事件清單（`track()` helper wraps `gtag`）

| Event | 觸發時機 | 主要參數 |
|---|---|---|
| `session_start` | 頁面載入 | `is_mobile`, `referrer` |
| `mode_select` | 切換隨機/私人房 | `mode` |
| `join_attempt` | 按進入遊戲 | `mode` |
| `join_success` | 成功加入房間 | `mode`, `is_pending` |
| `join_fail` | 加入失敗 | `reason` (overload/server_full/other) |
| `private_room_created` | 建立新私人房 | — |
| `private_room_joined` | 加入現有私人房 | — |
| `lobby_wait_duration` | 遊戲開始時 | `seconds_waited`, `mode` |
| `game_start` | 遊戲開始 | `player_count`, `start_word` |
| `answer_submit` | 送出字 | `insert_position_pct` (0=最前, 100=最後) |
| `knock_vote` | 按敲頭 | — |
| `eliminated` | 自己被淘汰 | `reason` (timeout/knocked) |
| `game_over` | 遊戲結束 | `is_winner`, `player_count`, `sentence_length`, `total_moves` |
| `share_click` | 開分享視窗 / 分享 IG | `method` (open_modal/instagram) |
| `play_again` | 按再玩一局 | — |
| `spectate_start` | 選擇繼續觀戰 | — |
| `leave_room` | 離開房間 | `game_state` |
| `disconnect` | 非主動斷線 | `game_state`, `reason` |
| `reconnect_success` | 重連成功 | `game_state` |
| `room_code_copy` | 複製房間代碼 | — |
| `reaction_sent` | 送出 emoji 反應 | `emoji` |

## 注意事項
- Railway 免費方案每月 $5 美元用量，用完會停止服務
- 測試房間 ID：`9999`（有機器人甲乙丙，真人加入自動開始）
- 前端有些數值是硬寫的，修改 server.js 常數時要同步確認 index.html
- `isNewRoom` 由 server 的 `joined` event 傳給前端（房間剛建立且沒有其他玩家時為 true）
- 自動重連依賴 `myName`（`doJoin` 時存）+ `myRoomId`（`joined` 時存）；主動離開時清除這兩個變數
