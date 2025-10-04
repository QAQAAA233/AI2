# AI 自動化開發控制器 Pro v6.0

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0-green)](https://flask.palletsprojects.com/)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-API-purple)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

AI 自動化開發控制器 Pro 提供模組化、事件導向的 AI 協作環境，結合 Google Gemini、VS Code 自動化與專案記憶系統，協助團隊在單一控制介面內完成開發、測試、監控與回饋分析。這個版本全面重構為七大模組，導入長短期記憶、Token 控管與托管迴圈，並以 ChatGPT 風格的明亮介面呈現對話紀錄與自動化狀態。

---

## 🧱 架構概覽

```
project/
├── main.py                  # 應用入口與 webview 啟動
├── app/
│   ├── config.py            # 設定與資料模型
│   ├── api/routes.py        # Flask API (Blueprint)
│   ├── services/
│   │   ├── ai_service.py    # AI 服務、記憶、Token 管理
│   │   ├── automation_service.py  # VSCode、自動化、截圖
│   │   └── project_service.py     # 專案與對話管理
│   └── utils/helpers.py     # 共用工具函式
├── templates/index.html     # ChatGPT 風格前端 (明亮模式)
├── static/css/style.css     # UI 造型
└── static/js/app.js         # 前端互動邏輯
```

---

## ✨ 亮點功能

### 🤖 AI 模組
- 抽象化 `AIServiceBase`，目前提供 Gemini 實作並保留擴充空間
- 長短期記憶管理（`MemoryManager`）支援摘要與對話輪替
- Token 控管自動提示警示並在達閾值時切換對話
- 內建提示詞管理器快速切換生成情境（程式碼、除錯、UI 評估）

### ⚙️ 自動化模組
- VS Code 控制：`code` 指令或 GUI 蒙版雙模式
- 程式執行監控：即時抓取 stdout/stderr
- 日誌檔案尾隨監控（支援多檔案）
- 螢幕擷取與 UI 解析（含錯誤防護）

### 🗂️ 專案與記憶
- 專案資訊以 JSON 持久化並快取
- 對話紀錄採檔案儲存，每筆訊息包含 ISO 時戳
- 單一 API 即可確保專案與對話存在

### 🖥️ 前端介面
- ChatGPT 風格、明亮主題、即時回饋
- 支援快速開啟 VS Code、執行指令、截圖分析
- Token 與對話資訊即時更新

---

## 📦 安裝

```bash
python -m venv .venv
source .venv/bin/activate  # Windows 使用 .venv\Scripts\activate
pip install -r requirements.txt
```

設定 Gemini API 金鑰：

```bash
export AI_CONTROLLER_API_KEY="your-key"  # Windows 使用 set 指令
```

---

## 🚀 啟動服務

```bash
python main.py
```

系統會啟動 Flask 伺服器於 `http://127.0.0.1:5001`，並自動開啟桌面 WebView。若在無桌面環境執行，可直接瀏覽網址。

---

## 🧩 核心 API

| Method | Path | 說明 |
|--------|------|------|
| `GET`  | `/api/config` | 取得完整設定（JSON） |
| `POST` | `/api/config` | 更新設定（支援巢狀欄位） |
| `POST` | `/api/ai/generate` | 產生 AI 回應並寫入對話記憶 |
| `POST` | `/api/automation/vscode` | 執行 VS Code 控制作業 |
| `POST` | `/api/automation/run` | 於專案目錄中執行指令 |
| `GET`  | `/api/automation/output/<pid>` | 取得執行輸出 |
| `POST` | `/api/automation/log` | 追蹤指定日誌檔案 |
| `GET`  | `/api/automation/screenshot` | 截圖並回傳解析資訊 |
| `GET`  | `/api/health` | 健康檢查 |

---

## 🧠 設定重點

`app/config.py` 內的資料模型涵蓋：
- `AIConfig`：AI 提供者、模型、生成參數、Token 限制
- `AutomationConfig`：托管迴圈上限、逾時、UI 分析開關
- `VSCodeConfig`：`code` 指令或 GUI 蒙版設定
- `MemoryConfig`：長短期記憶與摘要頻率
- `PathConfig`：所有儲存目錄，自動建立

設定可透過 `/api/config` 或直接編輯 `~/.ai_controller_v6/config.json` 進行調整。

---

## 🧪 開發建議

- 推薦以 `pytest` 撰寫服務層單元測試
- `AutomationService` 涉及系統資源，建議以抽象層或 mock 測試
- 介面為前端靜態資源，可使用 `npm` 或 `vite` 另行管理編譯
- 若需擴充 AI 供應商，實作新的 `AIServiceBase` 子類並於 `create_ai_service` 註冊

---

## 📄 授權

專案採用 MIT License，詳情請參閱 [LICENSE](LICENSE)。
