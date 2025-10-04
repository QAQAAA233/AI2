# AI 自動化開發控制器 Pro v4.0

[![Python](https://img.shields.io/badge/Python-3.8%2B-blue)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-2.3.3-green)](https://flask.palletsprojects.com/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5%20Pro-purple)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

## 🚀 專案簡介

AI 自動化開發控制器 Pro 是一個整合了 Google Gemini AI 與 VS Code 自動化控制的智能開發助手。透過獨立桌面視窗提供友善的操作介面，能夠自動生成程式碼、管理專案檔案、監控執行狀態，並支援多種檔案格式的上傳與處理。

### 🎯 核心功能

- **🤖 AI 程式碼生成**：使用 Gemini 2.5 Pro 生成完整、可執行的專案程式碼
- **📎 檔案上傳支援**：支援圖片、PDF、文本檔案的上傳與 AI 分析
- **🔧 VS Code 整合**：自動開啟 VS Code 並載入生成的專案檔案
- **📸 智能螢幕擷取**：自動偵測並擷取程式視窗與網頁應用
- **📦 專案管理**：完整的多檔案專案結構支援
- **🌐 網頁應用支援**：自動開啟獨立瀏覽器視窗展示網頁應用
- **📋 JSON 結構化輸出**：所有 AI 回應採用 JSON 格式，確保資料結構完整性

## ✨ v4.0 新功能

### 🆕 主要更新

1. **檔案上傳功能**
   - 支援拖曳上傳或點擊選擇
   - 多檔案同時上傳
   - 即時檔案預覽（圖片）
   - 支援格式：圖片（JPG/PNG/GIF）、PDF、文本檔案（TXT/MD/JSON/XML/CSV）

2. **增強的 AI 能力**
   - 圖片分析與描述
   - PDF 內容提取與理解
   - 基於上傳檔案生成對應程式碼
   - 多檔案整合處理

3. **完全 JSON 模式**
   - 移除純文本模式
   - 確保所有輸出結構化
   - 提升程式碼生成準確性

4. **改進的視窗擷取**
   - 智能視窗標題匹配
   - 支援中文視窗標題
   - 瀏覽器 APP 模式支援

## 📋 系統需求

### 基本需求
- **作業系統**：Windows 10/11、macOS 10.14+、Linux (Ubuntu 20.04+)
- **Python**：3.8 或更高版本
- **記憶體**：至少 4GB RAM
- **儲存空間**：至少 1GB 可用空間

### 必要軟體
- **Visual Studio Code**：需將 `code` 命令加入系統 PATH
- **網頁瀏覽器**：Chrome、Edge、Firefox 或 Safari
- **Gemini API Key**：從 [Google AI Studio](https://aistudio.google.com/app/apikey) 獲取

## 🔧 安裝指南

### 步驟 1：克隆專案

```bash
git clone https://github.com/your-repo/ai-controller-pro.git
cd ai-controller-pro
```

### 步驟 2：建立虛擬環境

```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### 步驟 3：安裝依賴套件

```bash
pip install -r requirements.txt
```

### 步驟 4：設定 API 連接

#### 方法 A：使用 API Key（推薦）
1. 訪問 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 生成新的 API Key
3. 在應用程式設定中輸入 Key

#### 方法 B：使用 Google Cloud Auth
```bash
# 安裝 gcloud CLI 後執行
pip install google-auth
gcloud auth application-default login
```

## 🎮 使用指南

### 啟動應用程式

```bash
python app.py
```

應用程式將在 `http://127.0.0.1:5001` 啟動，並自動開啟桌面視窗。

### 基本操作流程

#### 1. 📁 選擇專案資料夾
點擊「瀏覽」按鈕選擇您要儲存生成程式碼的目錄。

#### 2. 📎 上傳檔案（可選）
- **拖曳檔案**：直接拖曳檔案到上傳區域
- **點擊選擇**：點擊上傳區域選擇檔案
- **支援格式**：
  - 圖片：JPG, PNG, GIF, BMP, WebP
  - 文件：PDF
  - 文本：TXT, MD, JSON, XML, CSV

#### 3. 💡 輸入 AI 指令
在文字框中描述您的需求，例如：
```
創建一個待辦事項應用程式，包含：
- 新增、刪除、標記完成功能
- 美觀的使用者介面
- 資料持久化
- 使用 Flask 作為後端
```

#### 4. ⚡ 執行自動化
點擊「執行 AI 自動化」按鈕，系統將：
1. 呼叫 Gemini AI 分析需求和檔案
2. 生成完整的專案程式碼
3. 自動安裝所需套件
4. 建立專案檔案結構
5. 開啟 VS Code 載入專案
6. 執行主程式（如果有）
7. 開啟瀏覽器展示網頁應用（如果有）

#### 5. 📸 擷取畫面
- **立即擷取**：擷取當前所有相關視窗
- **延遲擷取**：等待 5 秒後擷取（適合等待程式完全載入）

## 💡 使用範例

### 範例 1：基於圖片生成網頁

```
上傳：產品圖片.jpg
指令：根據這張產品圖片，創建一個產品展示網頁，包含：
      - 響應式設計
      - 產品描述區域
      - 購買按鈕
      - 現代化的視覺效果
```

### 範例 2：PDF 文件轉互動應用

```
上傳：課程大綱.pdf
指令：將這個 PDF 課程大綱轉換為互動式學習平台，包含：
      - 章節導航
      - 進度追蹤
      - 測驗功能
      - 筆記功能
```

### 範例 3：多檔案整合

```
上傳：logo.png, colors.json, content.txt
指令：使用上傳的 logo、顏色配置和內容，創建公司官網：
      - 單頁式設計
      - 動畫效果
      - 聯絡表單
      - 響應式布局
```

### 範例 4：純程式碼生成（無檔案）

```
指令：創建一個即時聊天應用，使用 WebSocket，包含：
      - 用戶暱稱
      - 聊天室功能
      - 表情符號支援
      - 訊息時間戳記
```

## 📂 專案結構

```
ai-controller-pro/
│
├── app.py                    # 主程式（後端）
├── requirements.txt          # Python 套件依賴
├── README.md                # 本文件
│
├── templates/
│   └── index.html           # 前端界面（v4.0 檔案支援版）
│
└── ~/.ai_controller_v3/     # 配置和資料目錄（自動創建）
    ├── config.json          # 使用者配置
    ├── screenshots/         # 螢幕截圖
    ├── logs/               # 執行日誌
    └── projects/           # 生成的專案
```

## 🔌 API 參考

### `/run-process` - 執行自動化流程

**請求方法**: POST

**請求參數**:
```json
{
  "folder_path": "專案資料夾路徑",
  "prompt": "AI 指令",
  "config": {
    "connection_method": "api_key",
    "gemini_api_key": "your-api-key",
    "model_name": "gemini-2.5-pro",
    "generation_params": {...}
  },
  "files": [
    {
      "name": "檔案名稱",
      "type": "檔案類型",
      "size": 檔案大小,
      "content": "base64編碼內容"
    }
  ]
}
```

**回應格式**:
```json
{
  "success": true,
  "output": "執行結果",
  "files_created": ["檔案列表"],
  "ai_response": "AI 原始回應",
  "ai_response_json": {
    "project_name": "專案名稱",
    "files": [...]
  },
  "project": {
    "name": "專案名稱",
    "description": "專案描述",
    "files_count": 5
  }
}
```

## ⚙️ 進階配置

### Gemini 模型參數

| 參數 | 預設值 | 範圍 | 說明 |
|-----|--------|------|------|
| Temperature | 0.7 | 0-2 | 控制輸出的隨機性 |
| Top-P | 0.95 | 0-1 | 核心採樣參數 |
| Top-K | 64 | 1-100 | 候選詞彙數量 |
| Max Tokens | 8192 | 1-8192 | 最大輸出長度 |

### 支援的檔案類型

| 類型 | 副檔名 | MIME Type |
|-----|--------|-----------|
| 圖片 | .jpg, .png, .gif | image/* |
| PDF | .pdf | application/pdf |
| 文本 | .txt | text/plain |
| Markdown | .md | text/markdown |
| JSON | .json | application/json |
| XML | .xml | text/xml |
| CSV | .csv | text/csv |

## 🔍 故障排除

### 問題：找不到 VS Code

**解決方案**：
```bash
# Windows - 將 VS Code 加入 PATH
setx PATH "%PATH%;C:\Program Files\Microsoft VS Code\bin"

# macOS/Linux
export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"
```

### 問題：Gemini API 錯誤

**可能原因**：
- API Key 無效或過期
- 超過配額限制
- 網路連接問題

**解決方案**：
1. 檢查 API Key 是否正確
2. 確認配額使用狀況
3. 檢查網路連接

### 問題：截圖無法擷取網頁應用

**解決方案**：
1. 確保網頁應用已完全載入
2. 使用「延遲 5 秒後擷取」功能
3. 檢查瀏覽器是否以獨立視窗模式開啟

### 問題：檔案上傳失敗

**可能原因**：
- 檔案過大（建議 < 10MB）
- 不支援的檔案格式
- 檔案損壞

**解決方案**：
1. 壓縮大型圖片
2. 確認檔案格式正確
3. 嘗試重新上傳

## 🛡️ 安全性考量

1. **API Key 保護**
   - API Key 僅儲存在本地配置檔案
   - 不會上傳或分享至外部服務

2. **檔案處理**
   - 上傳的檔案僅在本地處理
   - 執行完成後可選擇清除暫存檔案

3. **程式碼執行**
   - 生成的程式碼在隔離環境中執行
   - 包含超時機制防止無限循環

## 🤝 貢獻指南

歡迎提交 Issue 和 Pull Request！

1. Fork 專案
2. 創建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

## 🔄 版本歷史

### v4.0.0 (2025-09-29)
- ✨ 新增檔案上傳支援（圖片、PDF、文本）
- 🔧 完全移除純文本模式，統一使用 JSON
- 🎯 改進視窗擷取邏輯
- 📱 優化前端介面設計

### v3.0.0 (2024-09-27)
- 📋 JSON 結構化輸出
- 🌐 網頁應用自動開啟
- 🔍 智能視窗偵測

### v2.0.0 (2024-09-26)
- 📸 螢幕擷取功能
- 🎨 全新 UI 設計
- 📦 模組化架構

### v1.0.0 (2024-09-23)
- 🚀 初始版本發布
- 🤖 基本 AI 整合
- 💻 VS Code 控制

---

**注意事項**：
- 本專案為教育和研究目的開發
- AI 生成的程式碼建議進行人工審查
- 請遵守相關法律法規使用本工具

💡 **提示**：如遇到任何問題，請先查看故障排除章節，或在 GitHub Issues 中搜尋相關問題。