# AI 自動化開發控制器 v6.0

[![Python](https://img.shields.io/badge/Python-3.10+-blue)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0-green)](https://flask.palletsprojects.com/)
[![Gemini](https://img.shields.io/badge/Gemini-2025-purple)](https://ai.google.dev/)

全新模組化的 AI 自動化開發控制器，採用 2025 年最新的 Flask + Vite 風格前後端分離實踐。專案提供 ChatGPT 明亮主題的對話介面、AI 托管模式、VS Code 控制、程式執行監控與記憶系統。

## ✨ 亮點功能

- **模組化後端架構**：`services/`、`api/`、`utils/` 多層設計，易於維護與擴充
- **Gemini AI 整合**：支援長短期記憶、Token 監控、托管模式與自動分析
- **VS Code 自動化**：指令或 GUI 蒙版控制、程式執行監控、日誌追蹤與截圖
- **專案/對話管理**：Project 與 Conversation 服務統一管理資料與歷史
- **ChatGPT 明亮 UI**：前端採 Inter 字體、雙欄面板與即時狀態檢視

## 🗂️ 專案結構

```
.
├── api/
│   └── routes.py           # Flask Blueprint 與 REST API
├── config.py               # 設定與資料模型
├── main.py                 # 應用程式入口
├── services/
│   ├── ai_service.py       # AI 記憶、Token、分析
│   ├── automation_service.py# VS Code、自動化、截圖
│   └── project_service.py  # 專案與對話管理
├── static/
│   ├── css/style.css       # ChatGPT 風格明亮主題
│   └── js/app.js           # 前端互動邏輯
├── templates/index.html    # 單頁應用入口
└── utils/common.py         # 通用工具
```

## ⚙️ 安裝與啟動

```bash
python -m venv .venv
source .venv/bin/activate  # Windows 使用 .venv\Scripts\activate
pip install -r requirements.txt
export GEMINI_API_KEY="your-key"  # Windows 使用 set 指令
python main.py --host 127.0.0.1 --port 5001
```

瀏覽器開啟 `http://127.0.0.1:5001` 即可使用明亮 ChatGPT 風格介面。

## 🚀 核心工作流程

1. **選擇或建立專案**：側邊欄列出專案，支援一鍵建立
2. **建立對話**：每個專案維護多個對話與記憶
3. **AI 互動**：輸入需求，由 Gemini 產出代碼與分析
4. **托管模式**：AI 自主迭代、執行指令、收集日誌與截圖
5. **狀態檢視**：右側看板顯示自動化輸出與 Token 使用狀況

## 🧠 AI 模組

- **MemoryManager**：短期 deque + 長期摘要，支援跨迭代記憶
- **TokenManager**：監控 tokens、超限自動切換對話
- **PromptManager**：統一維護系統提示詞模板
- **Autopilot**：AI 回應 + 自動化回饋 + 二次分析的迴圈

## 🔄 自動化模組

- **VSCodeController**：`code` 指令或 GUI 蒙版操作
- **ProgramMonitor**：子程序啟動、輸出即時抓取
- **LogMonitor**：多檔案增量讀取
- **ScreenshotAnalyzer**：指定視窗擷取並轉 base64

## 📚 API 一覽

| Method | Path | 說明 |
| ------ | ---- | ---- |
| GET | `/api/config` | 讀取系統設定 |
| POST | `/api/config` | 更新設定 |
| POST | `/api/project/create` | 建立專案 |
| GET | `/api/project/list` | 專案列表 |
| POST | `/api/conversation/start` | 建立對話 |
| POST | `/api/ai/generate` | 單次 AI 回應 |
| POST | `/api/ai/autopilot` | 托管模式 |

## 🛡️ 安全與最佳實踐

- API Key 儲存於本地 `~/.ai_controller_v6/config.json`
- Token 使用與記憶可視化，確保對話長度受控
- 自動化作業前採用日誌與截圖蒐集，利於除錯

## 🤝 貢獻

歡迎透過 Issue 或 PR 提交改善建議。請遵循模組化原則與測試覆蓋要求。

---

> 本專案為教育與研究用途，請確保合法使用 Gemini API 與自動化功能。
