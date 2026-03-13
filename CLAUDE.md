# 加字挑戰專案筆記

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
- `MAX_SENTENCE = 60`：句子最大字元數
- `MAX_RANDOM_PLAYERS = 8`：隨機房間最多人數
- `MAX_ROOMS = 200`：伺服器最大房間數（超過回傳「流量超載」）

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
17. 新增 `logo_click` 事件追蹤點擊 Logo 前往 `fromnineon.com`
18. `MAX_SENTENCE` 從 40 改為 60（用戶反映 40 字太短）
19. 修正長句（>40字）分享卡溢出問題：canvas 改為多行換行繪製，SFS 增加 38px/28px 斷點；結算畫面補 12px 斷點（>50字）
20. 修正重連後計時器進度圈用硬寫值的問題：新增 `serverTurnTime` / `serverKnockWindow` 變數，在 `turnStart` / `answerSubmitted` 時更新，`renderGameState` 改用這兩個變數
21. 修正 bot 句子超過 MAX_SENTENCE 時直接結束遊戲的問題：改為淘汰該 bot（`eliminateCurrentPlayer(roomId, 'timeout')`），遊戲繼續進行
22. 優勝者勝利體驗強化：彩色 confetti 動畫（300 幀/130 粒子）、標題漸層閃光動畫、獎盃搖擺彈跳、頂部橫幅、分享按鈕改為「向朋友炫耀 🎉」並脈動
23. 優勝者分享卡改版：HTML 預覽卡 header 依身份顯示不同文字（優勝者：「🏆 我是第一名！沒人能贏我😎」亮黃底；其他：「韭點開始加字挑戰」原色）；移除重複的 winner-tag div；Canvas 圖片改為 lime 亮綠黃背景＋彩色裝飾點、圓角卡片（22px）、黑底 header；句子加左色條外框；底部加 CTA + `game.fromnineon.com`
24. 全站「接字遊戲」改名為「加字挑戰」（index.html 10 處、manifest.json 3 處、server.js 1 處；fromnineon dashboard.html 2 處）
25. 補齊縮圖圖示：加入 favicon.png(32×32)、icon-192.png(192×192)、icon-512.png(512×512)、og-image.jpg(1200×630)；index.html 補齊 OG/Twitter Card/apple-touch-icon/PWA/msapplication meta tags；manifest.json 更新為三個正確尺寸 PNG 圖示
26. 修正 4 個玩家體驗 bug：(1) gameOver 改用 winnerId 判斷贏家，修正同名玩家贏家畫面錯誤；(2) 斷線玩家補入 eliminationOrder，結算排名顯示「斷線離開」；(3) accepted 事件立即更新 currentSentence，消除 ~1.5s 顯示舊句子；(4) knockVote label 保留錘子圖示
27. 修正 2 個衍生小 bug：knockVote label 更新後補 refreshIcons()（確保錘子 SVG 立即渲染）；leaveRoom 補清除 lobbyInterval（防止離開後計時器繼續背景執行）
28. 載入速度優化：Google Fonts `@import` 改為 `<link preload>` 非阻塞載入；`logo.jpg` 轉 WebP（62KB→7KB，-89%），3 處引用全更新；Lucide/Socket.io 無法加 `defer`（inline script 直接依賴，加了遊戲會壞）
29. 首頁顯示線上人數：server 在 connect/disconnect 時廣播 `onlineCount` 給所有 client；標題下方顯示「· 目前 N 人在線 ·」，人數 < 2 時自動隱藏；計數改用 `io.sockets.sockets.size`（`io.engine.clientsCount` 時序不穩）；新增 `GET /api/online` 端點供 debug 查詢即時人數；修正文字色 teal on teal 不可見問題（改為 `rgba(0,0,0,0.55)`）

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
| `logo_click` | 點擊 Logo 前往主站 | — |

## fromnineon.com 主站優化紀錄（`/Users/yen/Project/fromnineon/index.html`）
1. 表單開啟 CAPTCHA（`_captcha` 從 `false` 改為 `true`）
2. 所有 `target="_blank"` 外部連結加上 `rel="noopener noreferrer"`
3. 合作夥伴 logo（60 張）加上 `loading="lazy"`
4. Footer 文字對比度提升符合 WCAG AA（links: 0.35→0.65，social: 0.3→0.65，copy: 0.2→0.45）
5. 裝飾性 SVG 加上 `aria-hidden="true"`（共 10 個）
6. `<title>` 改為 `韭點開始 | 短影音創作 · 品牌行銷`
7. `og:title` / `twitter:title` 同步更新
8. JSON-LD schema 加入 `ProfessionalService`（LocalBusiness 子類型）+ `address`、`areaServed`、`priceRange`
9. 合作夥伴 logo alt 文字填入各品牌名稱（17–21、28 不明暫留空）
10. 圖片全面轉為 WebP（reel、portrait、team），檔案大小大幅縮減
11. 移除 `vercel.json`（www redirect 造成所有圖片 ERR_TOO_MANY_REDIRECTS）
12. 三個 reel 播放數字統一 `font-size: 16px`
13. 更新 Reel 數據：單支最高 886 萬、三支合計 1,500 萬；重新排序（411萬置中）
14. 服務需求 `<select>` 加上 `required` 屬性、移除未使用的 `animateCount` 死碼
16. `logo.jpg` 轉為 WebP（63KB→7KB，89% 縮減）；所有引用改為 `logo.webp`；hero logo 加 `fetchpriority="high"` 優化 LCP
17. 修正 Accessibility 對比度不足（5 個元素）：
    - `#services .section-title .accent`：lime on teal → 改為黑色
    - `#team .section-label`：lime on green → 改為白色
    - `#team .section-title .accent`：lime on green → 改為白色
    - `#team .section-desc`：`rgba(255,255,255,0.7)` → `0.9`
    - `.footer-copy`：`rgba(255,255,255,0.45)` → `0.55`
18. Hero H1 視覺改為「韭點開始」，SEO 保留「台灣頂尖短影音 · 社群行銷團隊」（用 `.sr-only` span 隱藏於 DOM，Google 可爬取但視覺不顯示）；移除 hero-sub 段落的「韭點開始，」
19. SEO 三大客群關鍵字優化（不改前台顯示）：`<title>` / `og:title` / `twitter:title` 改為「台灣整合行銷外包 · 品牌業配短影音 · 社群代操」；`meta description` / `og:description` / `twitter:description` 加入整合行銷外包、社群代操、活動行銷；`meta keywords` 補齊整合行銷、整合行銷外包、社群代操、活動行銷、活動曝光、行銷公司台灣、KOL合作；JSON-LD FAQPage 從 6 題擴充為 8 題，覆蓋品牌業配/整合行銷/活動行銷三大客群

## PageSpeed 分數（2026-03-12 Lighthouse 桌機版）
- Performance: 55（主因：未壓縮 CSS/JS、網路延遲）
- Accessibility: 96 → 修正後預計 100
- Best Practices: 100
- SEO: 100

## 重導向問題（待處理）
- `fromnineon.com/` → `www.fromnineon.com/` 浪費 1144ms
- 原因：Vercel 把 `www.fromnineon.com` 設為主要 domain
- 修法：Vercel 控制台 → Settings → Domains → 把 `fromnineon.com` 設為 Primary
15. SEO 全面優化（19 項）：
    - `<title>` 改為「韭點開始 | 台灣短影音品牌行銷 · 社群行銷 · Instagram Reels」
    - `meta description` 修正 811→886、加入社群行銷/KOL
    - `canonical` / `og:url` 補尾部斜線與 sitemap 一致
    - 新增 `og:image:alt`
    - OG / Twitter title & description 同步更新
    - JSON-LD：811→886 全修正、加 `foundingDate`/`knowsAbout`、移除重複 `@context`
    - H1 改為含「台灣」「短影音」「社群行銷」關鍵字
    - Hero 副標加入「台灣」「Instagram Reels」
    - H2（Reels / Services）各加入目標關鍵字
    - 9 位團隊照片 alt 全加職稱與關鍵字
    - 6 張不明合作夥伴 logo 空 alt 補備用文字
    - 3 個 Reel 連結加 `aria-label` 關鍵字描述 + `rel="nofollow"`
    - Footer `<h5>` 改 `<h3>`，修正標題層級
    - Google Fonts 改為非阻塞載入（`preload` + `onload`）
    - `robots.txt` 封鎖 `/dashboard.html`
    - `sitemap.xml` changefreq `monthly` → `weekly`

## Analytics Dashboard（`/Users/yen/Project/fromnineon/dashboard.html`）
- 網址：`https://fromnineon.com/dashboard.html`
- 使用 Google OAuth（GIS）直接呼叫 GA4 Data API + GSC API，不需後端
- 三個 tab：🎮 加字挑戰 / 🌐 主站 / 🔍 搜尋
- dashboard.html 改名同步：tab 標籤 + banner 標題
- 主站 hostname filter 使用 OR 同時涵蓋 `fromnineon.com` 和 `www.fromnineon.com`
- 各分頁底部加入資料驅動的「建議改善事項」，依實際數據（分享率、再玩率、斷線率、跳出率、CTR、排名等）動態顯示 warn / info / ok 三種層級的建議卡片
- 遊戲 tab 加入「流量來源」區塊（sessionSource 甜甜圈圖 + 明細表），附 (not set) 說明備註
- token 存入 `localStorage`（`dash_gtoken` / `dash_gtoken_exp`），重整頁面自動還原登入（1 小時內有效）
- 修正切換天數（7/30/90天）後資料不重新載入的 bug（`resetTabData` 補上 `tabLoaded` 重置）

## 注意事項
- Railway 免費方案每月 $5 美元用量，用完會停止服務
- 測試房間 ID：`9999`（有機器人甲乙丙，真人加入自動開始）
- 前端有些數值是硬寫的，修改 server.js 常數時要同步確認 index.html
- `isNewRoom` 由 server 的 `joined` event 傳給前端（房間剛建立且沒有其他玩家時為 true）
- 自動重連依賴 `myName`（`doJoin` 時存）+ `myRoomId`（`joined` 時存）；主動離開時清除這兩個變數
