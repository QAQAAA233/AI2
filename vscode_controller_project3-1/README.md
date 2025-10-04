# 🏗️ AI 自動化開發控制器 2025 版

AI 自動化開發控制器提供了一套符合 2025 年最佳實踐的模組化後端與 ChatGPT 亮色系前端體驗。系統結合 Flask API、AI 服務抽象層、VSCode 自動化與專案/對話管理，協助開發者快速建立 AI 代碼托管流程。

## ✨ 亮點特色

- **全新模組化架構**：`config.py`、`services/`、`api/routes.py`、`main.py` 清楚拆分責任，易於維護與測試。
- **AI 服務抽象層**：支援 Gemini，本地 Echo 回退、自動 Token 管控與記憶管理。
- **托管模式迭代引擎**：整合程式執行、日誌監控與 UI 截圖分析，循環執行直到任務完成。
- **專案與對話管理**：支援多專案、對話歷史持久化，保留長短期記憶摘要。
- **全新 ChatGPT 亮色介面**：明亮扁平化設計，支援即時對話與托管結果呈現。

## 🗂️ 專案結構

```text
vscode_controller_project3-1/
├── api/
│   ├── __init__.py
│   └── routes.py                # Flask Blueprint 與 REST API
├── config.py                    # dataclass 設定、錯誤類別
├── main.py                      # 應用入口、服務註冊、日誌設定
├── requirements.txt             # 套件需求
├── services/
│   ├── __init__.py
│   ├── ai_service.py            # AI 抽象層、Gemini 實作、記憶/Token 管理
│   ├── automation_service.py    # VSCode、自動化執行、日誌監控、截圖
│   └── project_service.py       # 專案/對話管理
├── static/
│   ├── css/styles.css           # ChatGPT 亮色系樣式
│   └── js/app.js                # 前端邏輯、API 呼叫
├── templates/index.html         # 主視圖 (Jinja 模板)
├── utils.py                     # 共用工具函數
└── data/、logs/                 # 執行時資料 (啟動時自動建立)
```

## ⚙️ 安裝與啟動

1. **建立虛擬環境並安裝依賴**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows 使用 .venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. **設定環境變數 (選用)**
   ```bash
   export AI_API_KEY="你的 Gemini API Key"
   export AI_MODEL_NAME="gemini-1.5-flash"
   ```
3. **啟動伺服器**
   ```bash
   python main.py
   ```
4. **瀏覽器預覽**：開啟 `http://127.0.0.1:5000` 可見 ChatGPT 亮色對話介面。

> 未設定 AI Key 時，系統會自動使用 Local Echo 模式回應，便於測試。

## 🧠 核心模組說明

### 1. `config.py`
- 透過 `AppConfig` dataclass 管理 AI、VSCode、自動化與路徑設定。
- 提供 `load_config()` / `save_config()`，支援環境變數覆寫。
- 定義 `AIServiceError`、`AutomationError` 等自訂錯誤。

### 2. `services/ai_service.py`
- `AIServiceBase` 抽象類別定義 `generate()` 與 `analyze()`。
- `GeminiService` 整合 Google Generative AI；無 API Key 時自動回退 `LocalEchoService`。
- `MemoryManager` 與 `TokenManager` 提供長短期記憶摘要、Token 門檻控制。
- `PromptManager` 內建 code generation、bug detection、UI 評估提示詞。

### 3. `services/automation_service.py`
- `VSCodeController` 支援 `code` 指令或 GUI 蒙版 (可選)。
- `ProgramMonitor` 監控子程序輸出、日誌更新。
- `ScreenshotAnalyzer` 產生 UI 評估占位資料，可延伸整合實際截圖。
- `AutomationService.run_iteration()` 負責單次托管迭代流程。

### 4. `services/project_service.py`
- `ProjectManager` 建立/載入專案並輸出結構樹。
- `ConversationManager` 管理多對話檔案 (`data/conversations/<project>/<id>.json`)。
- 透過 `Message` dataclass 與 AI 記憶系統共享資料。

### 5. `api/routes.py`
- 提供 `/api/config`、`/api/project/*`、`/api/ai/generate`、`/api/ai/host-mode` 等端點。
- `ai_host_mode` 負責驅動托管迴圈、整合自動化輸出與 AI 分析。
- 全域錯誤處理器輸出一致的 JSON 結構。

### 6. `templates/index.html` + `static/`
- 明亮 ChatGPT 風格，支援即時訊息、專案列表、托管結果卡片。
- `static/js/app.js` 使用 ES modules，封裝 `fetchJSON()`、狀態管理與 UI 更新邏輯。

## 🤖 使用流程

1. **建立/選擇專案**：左側面板輸入資料夾與顯示名稱，系統自動建立結構與會話檔案。
2. **即時對話**：中間聊天室輸入需求，系統呼叫 `/api/ai/generate` 回傳 AI 內容。
3. **托管模式**：右側面板設定初始任務、指令與迭代次數，啟動後顯示每回合分析結果與輸出。
4. **檢視結構**：左下角預覽專案目錄樹，利於追蹤 AI 產出的檔案。

## 🧪 測試建議

- 使用 Local Echo 模式 (`AI_API_KEY` 未設) 驗證 API 與前端流程。
- 為 `services/` 各模組撰寫單元測試，可使用 pytest 搭配假資料。
- 若需整合真實自動化，請於本機安裝 VSCode 並確認 `code` 指令可用。

## 📄 授權

本專案以 MIT License 授權，可自由使用與修改。

---

若需擴充功能（如整合其他模型、接入實際 GUI 自動化或真實截圖分析），可在既有抽象層上擴寫對應服務，維持架構清晰與可測試性。歡迎貢獻！
