# My own GPT (Enterprise Grade)

使用 Next.js 15、Vercel AI SDK 與 Supabase 實作的個人 ChatGPT 網頁。

## 專案摘要

這是一個以「可實際使用」為目標的 ChatGPT 類網頁，不只是基本聊天介面，而是包含模型切換、system prompt 管理、參數控制、串流輸出、短期記憶、對話歷史與程式碼 diff 檢視等完整流程。

本專案設計重點：

- 在使用體驗上，維持操作簡潔（常用參數與模板可以快速套用）
- 在工程實作上，將模型呼叫放在伺服器端，避免 API Key 外洩
- 在資料面上，透過 Supabase 儲存聊天與訊息，並用 RLS 保障資料隔離
- 在效能面上，針對對話區重繪與 code highlight 做不閃爍優化
- 在可維運面上，保留清楚的檔案分工與可驗證的建置流程

## 作業要求對照

本專案已涵蓋下列作業需求：

- 可挑選 LLM 模型
- 可自訂 system prompt
- 可自訂常用 API 參數
- 支援 Streaming
- 支援交談短期記憶
- 程式碼可上傳 GitHub
- API Key 與環境變數以伺服器端保護

## 目前已實作功能

### 聊天核心

- 模型切換（受白名單限制）
- Streaming 回覆
- Stop 中斷生成
- Retry Last 重試上一筆請求
- 可上傳格式：`.c`, `.cpp`, `.h`, `.hpp`, `.py`, `.js`, `.ts`, `.tsx`, `.txt`, `.md`, `.json`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`

### 參數與提示詞

- 可調參數：Temperature、Top P、Max Tokens、Short Memory Turns
- 參數預設：Fast、Balanced、Deep
- System Prompt 自訂與模板套用
- 可新增自訂 System Prompt Template（本機保存）
- 可刪除自訂 Template

### 記憶與歷史

- 短期記憶以最近 N turns 裁切（伺服器端夾限，避免 token 爆量）
- Recent Chats：搜尋、切換、Rename、Pin、Delete、Reset Current Chat
- 對話可匯出 JSON

### Artifacts 與 Diff

- 自動抽取 assistant 回覆中的 code block
- Auto Diff：自動比對前一個可比較版本
- Manual Base：手動指定任一 artifact 當 diff 基準
- 支援展開視窗（Expand）與全螢幕閱讀

### 體驗優化

- 訊息區與 code block 已做不閃爍優化（memo 與高亮快取）
- 常見錯誤改為可讀訊息（例如 API key 缺失、rate limit、timeout）

## 技術

- Next.js 15（App Router + TypeScript）
- Vercel AI SDK + OpenAI-compatible Qwen provider
- Supabase（Auth / Postgres / Realtime）
- Tailwind CSS
- react-markdown + shiki
- react-diff-viewer-continued
- Framer Motion
- pdf-parse（伺服器端 PDF 文字抽取）

## 系統架構

### 分層架構

1. 前端 UI 層
- Chat 互動介面、參數控制、模板管理、Artifacts Diff 與 Expand 閱讀
- 主要檔案：`components/chat/chat-interface.tsx`、`components/chat/code-block.tsx`

2. 應用邏輯層
- Server Actions 負責聊天資料 CRUD（建立、重命名、釘選、刪除、清空）
- 主要檔案：`app/actions/chat-actions.ts`

3. 模型服務層
- API Route 統一處理模型請求、Streaming、檔案解析、短期記憶裁切與參數夾限
- 主要檔案：`app/api/chat/route.ts`

4. 資料儲存層
- Supabase Postgres（profiles/chats/messages）+ RLS + Realtime
- 主要檔案：`supabase/schema.sql`

### 請求資料流

1. 使用者在前端輸入訊息並設定模型/參數
2. 前端送到 `app/api/chat/route.ts`（multipart 或 json）
3. API Route 進行：
- 模型白名單檢查
- 參數合法化與夾限
- 短期記憶裁切（memory turns）
- 檔案內容解析與上下文注入
4. 透過 AI SDK 呼叫模型並串流回傳
5. 前端渲染訊息，同步透過 Server Actions 寫入 Supabase
6. Recent Chats 與歷史訊息由 Supabase 查詢並更新畫面

## 環境變數設定

1. 複製 `.env.example` 為 `.env.local`
2. 填入真實金鑰與設定

必要環境變數：

- DASHSCOPE_API_KEY
- DASHSCOPE_BASE_URL
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ALLOWED_MODELS
- NEXT_PUBLIC_ALLOWED_MODELS
- NEXT_PUBLIC_DEFAULT_MODEL
- MAX_TURNS

安全守則：

- 不要提交 `.env.local` 到版本控制
- 不要在前端暴露任何 secret
- 模型請求統一走 `app/api/chat/route.ts`

## Supabase 設定

1. 在 Supabase Dashboard 啟用 Auth（Email/Password）
2. 若需 OAuth，設定對應 Provider（GitHub/Google）
3. 設定 callback URL：`http://localhost:3000/auth/callback`
4. 到 SQL Editor 執行 `supabase/schema.sql`

資料表與安全會建立：

- profiles
- chats
- messages
- indexes、triggers
- RLS policies
- realtime publication

## 安裝與啟動

1. `npm install`
2. `npm run dev`
3. 開啟 `http://localhost:3000`

## 使用流程

1. 登入後進入聊天頁
2. 在左欄 Chat list & Control：
3. 選模型
4. 選或調整參數（Fast / Balanced / Deep 或手動）
5. 設定 system prompt（模板或自訂）
6. 點擊 Save as Template 可新增自訂模板
7. 在模板下拉選單可套用 Built-in 與 Custom Templates
8. 選到自訂模板後可用 Delete Selected 刪除
9. 在下方輸入框送出訊息（Ctrl/Cmd + Enter 可送出）
10. 需要時可上傳檔案作為上下文
11. 右欄 Artifacts 可檢視 code block、做 diff、展開大視窗

## 建置檢查

- `npm run build`

## 核心檔案

- `app/api/chat/route.ts`
- `app/actions/chat-actions.ts`
- `components/chat/chat-interface.tsx`
- `components/chat/code-block.tsx`
- `lib/utils/export.ts`
- `supabase/schema.sql`

## 補充說明

- 所有模型呼叫都在伺服器端執行
- 對話歷史儲存在 Supabase 並透過 Server Actions 讀寫
- PDF 會在伺服器端解析並分塊後注入上下文
