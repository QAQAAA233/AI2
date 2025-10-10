"""
AI 自動化開發控制器 Pro v5.4 - 完整改進版
改進項目：
1. 修復對話遷移後路徑不一致問題
2. 修復 Token 統計消失問題
3. 清理臨時對話檔案
4. 優化對話記錄結構
"""

import sys
import os
import subprocess
import threading
import time
import re
import json
import platform
import logging
import queue
import uuid
from collections import Counter
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, asdict, field
from enum import Enum

# Web framework imports
from flask import Flask, render_template, jsonify, request, send_file
import webview

# AI and automation imports
import google.generativeai as genai
from google.generativeai.types import GenerationConfig, HarmCategory, HarmBlockThreshold
import pywinctl as pwc
import pyautogui
import pyperclip

# Screen capture imports
import mss
import mss.tools
from PIL import Image
import io
import base64

# Optional Google Cloud Auth support
try:
    import google.auth
    HAS_GOOGLE_AUTH = True
except ImportError:
    HAS_GOOGLE_AUTH = False

# ============================================
# 配置和常量
# ============================================

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
HOST = '127.0.0.1'
PORT = 5001

CONFIG_DIR = Path.home() / '.ai_controller_v5'
CONFIG_FILE = CONFIG_DIR / 'config.json'
SCREENSHOT_DIR = CONFIG_DIR / 'screenshots'
LOG_DIR = CONFIG_DIR / 'logs'
PROJECTS_DIR = CONFIG_DIR / 'projects'
CONVERSATIONS_DIR = CONFIG_DIR / 'conversations'
PROJECT_LIST_FILE = CONFIG_DIR / 'project_list.json'

# 確保所有目錄都存在，並處理錯誤
def ensure_directories():
    """確保所有必要的目錄都存在"""
    directories = [CONFIG_DIR, SCREENSHOT_DIR, LOG_DIR, PROJECTS_DIR, CONVERSATIONS_DIR]
    
    for directory in directories:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            logger.info(f"目錄已準備: {directory}")
        except Exception as e:
            logger.error(f"無法創建目錄 {directory}: {e}")
            logger.error(f"請檢查權限或手動創建目錄")
            raise RuntimeError(f"無法創建必要的目錄: {directory}")

# 在模塊載入時立即確保目錄存在
try:
    ensure_directories()
except Exception as e:
    logger.critical(f"初始化失敗: {e}")
    logger.critical("請確保您有足夠的權限創建配置目錄")

# ============================================
# 數據模型
# ============================================

class ResponseMode(Enum):
    """AI 回應模式"""
    JSON = "json"

@dataclass
class ThinkingConfig:
    """思考配置"""
    thinking_budget: int = -1

@dataclass
class FileOutput:
    """單個檔案輸出結構"""
    filename: str
    filetype: str
    code: str
    opens_window: bool = False
    window_title: Optional[str] = None
    install_requirements: Optional[List[str]] = None
    dependencies: Optional[List[str]] = None
    description: Optional[str] = None
    run_command: Optional[str] = None
    is_web_app: bool = False
    can_open_standalone: bool = False
    server_address: Optional[str] = None
    web_title: Optional[str] = None
    file_operation: Optional[str] = None

@dataclass
class ProjectOutput:
    """專案輸出結構(支持多檔案)"""
    project_name: str
    description: str
    files: List[FileOutput]
    main_file: Optional[str] = None
    setup_instructions: Optional[List[str]] = None
    run_instructions: Optional[List[str]] = None

@dataclass
class AIConfig:
    """AI 配置數據模型"""
    connection_method: str = "api_key"
    gemini_api_key: str = ""
    model_name: str = "gemini-2.5-pro"
    system_instruction: str = ""
    generation_params: Dict[str, Any] = None
    thinking_config: Dict[str, Any] = None
    safety_settings: Dict[str, str] = None
    automation_settings: Dict[str, Any] = None

    def __post_init__(self):
        if self.generation_params is None:
            self.generation_params = {
                "temperature": 0.7,
                "top_p": 0.95,
                "top_k": 64,
                "max_output_tokens": 8192,
                "candidate_count": 1,
                "stop_sequences": [],
                "response_mime_type": "application/json"
            }
        if self.thinking_config is None:
            self.thinking_config = {
                "thinking_budget": -1
            }
        if self.safety_settings is None:
            self.safety_settings = {
                "HARM_CATEGORY_HARASSMENT": "BLOCK_MEDIUM_AND_ABOVE",
                "HARM_CATEGORY_HATE_SPEECH": "BLOCK_MEDIUM_AND_ABOVE",
                "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_MEDIUM_AND_ABOVE",
                "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_MEDIUM_AND_ABOVE"
            }
        if self.automation_settings is None:
            self.automation_settings = {
                "auto_error_fix": False,
                "auto_optimize": False,
                "auto_test": False,
                "monitor_interval": 5
            }

@dataclass
class ConversationMessage:
    """對話消息 - 修改版，正確保存 usage_metadata"""
    role: str
    content: str
    timestamp: str
    files: Optional[List[Dict]] = None
    metadata: Optional[Dict] = None
    terminal_output: Optional[str] = None
    usage_metadata: Optional[Dict] = None  # ⭐ 新增：直接保存 token 統計

@dataclass
@dataclass
class ConversationSession:
    """單一對話視窗(短期記憶)"""
    session_id: str
    title: str
    created_at: str
    updated_at: str
    messages: List[ConversationMessage] = field(default_factory=list)
    token_count: int = 0
    summary: Optional[str] = None
    keywords: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ProjectConversation:
    """專案對話歷史"""
    project_dir: str
    project_name: str
    messages: List[ConversationMessage] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    sessions: List[ConversationSession] = field(default_factory=list)
    active_session_id: Optional[str] = None

@dataclass
class LongTermMemoryRecord:
    """長期記憶紀錄"""
    session_id: str
    summary: str
    keywords: List[str] = field(default_factory=list)
    important_actions: List[str] = field(default_factory=list)
    related_files: List[str] = field(default_factory=list)
    token_count: int = 0
    created_at: str = ""
    updated_at: str = ""

@dataclass
class LongTermMemory:
    """長期記憶資料結構"""
    project_dir: str
    project_name: str
    records: List[LongTermMemoryRecord] = field(default_factory=list)
    schema_version: str = "1.0"

@dataclass
class ProcessResult:
    """處理結果數據模型"""
    success: bool
    output: str = ""
    files_created: List[str] = field(default_factory=list)
    files_updated: List[str] = field(default_factory=list)
    project_data: Optional[ProjectOutput] = None
    ai_response: str = ""
    ai_response_json: Optional[Dict] = None
    installation_logs: List[str] = field(default_factory=list)
    error: str = ""
    screenshots: List[str] = field(default_factory=list)
    is_iteration: bool = False
    usage_metadata: Optional[Dict] = None
    terminal_output: str = ""
    session_context: Optional[Dict[str, Any]] = None

# ============================================
# JSON Schema 定義 - 繁體中文化
# ============================================

def get_json_schema():
    """獲取 Gemini API 的 JSON Schema"""
    return {
        "type": "object",
        "properties": {
            "project_name": {"type": "string", "description": "專案名稱"},
            "description": {"type": "string", "description": "專案描述"},
            "main_file": {"type": "string", "description": "主要執行檔案"},
            "setup_instructions": {"type": "array", "items": {"type": "string"}, "description": "設置指令"},
            "run_instructions": {"type": "array", "items": {"type": "string"}, "description": "執行指令"},
            "files": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "filename": {"type": "string", "description": "檔案名稱(含副檔名)"},
                        "filetype": {
                            "type": "string",
                            "enum": ["python", "javascript", "html", "css", "typescript", "java", "cpp", "c", "go", "rust", "ruby", "php", "swift", "kotlin", "sql", "shell", "yaml", "json", "xml", "markdown", "text"],
                            "description": "檔案類型"
                        },
                        "code": {"type": "string", "description": "完整程式碼內容"},
                        "opens_window": {"type": "boolean", "description": "是否會開啟視窗"},
                        "window_title": {"type": ["string", "null"], "description": "視窗標題(如果有)"},
                        "install_requirements": {"type": "array", "items": {"type": "string"}, "description": "安裝需求(如 pip install package)"},
                        "dependencies": {"type": "array", "items": {"type": "string"}, "description": "相依套件"},
                        "description": {"type": "string", "description": "檔案描述"},
                        "run_command": {"type": ["string", "null"], "description": "執行命令"},
                        "is_web_app": {"type": "boolean", "description": "是否為網頁應用"},
                        "can_open_standalone": {"type": "boolean", "description": "主程式是否能自動開啟獨立瀏覽器視窗"},
                        "server_address": {"type": ["string", "null"], "description": "伺服器地址(如 http://localhost:5000)"},
                        "web_title": {"type": ["string", "null"], "description": "網頁標題"}
                    },
                    "required": ["filename", "filetype", "code", "opens_window"]
                }
            }
        },
        "required": ["project_name", "description", "files"]
    }

def get_json_system_instruction():
    """獲取 JSON 模式的系統指令 - 繁體中文版 + Flask修復"""
    return """你是一位專業的程式碼助手,能夠生成完整、可運行的專案程式碼。

回應時,你必須輸出一個符合以下結構的有效 JSON 物件:
{
    "project_name": "描述性的專案名稱",
    "description": "專案功能的簡要描述",
    "main_file": "main.py",
    "setup_instructions": ["pip install package1", "pip install package2"],
    "run_instructions": ["python main.py", "開啟瀏覽器前往 http://localhost:5000"],
    "files": [
        {
            "filename": "main.py",
            "filetype": "python",
            "code": "import flask\\n\\napp = flask.Flask(__name__)\\n\\n@app.route('/')\\ndef home():\\n    return 'Hello World'\\n\\nif __name__ == '__main__':\\n    app.run(host='0.0.0.0', port=5000)",
            "opens_window": false,
            "window_title": null,
            "install_requirements": ["pip install flask"],
            "dependencies": ["flask"],
            "description": "主應用程式檔案",
            "run_command": "python main.py",
            "is_web_app": true,
            "can_open_standalone": false,
            "server_address": "http://localhost:5000",
            "web_title": "我的網頁應用"
        }
    ]
}

重要格式要則:
1. "code" 欄位必須包含正確格式化的程式碼,使用真實的換行符號和縮排
2. 在 code 字串中使用實際的換行字元 (\\n) 和 Tab 字元 (\\t),不是文字上的 \\n 字串
3. 程式碼必須是有效的 JSON 字串 - 正確跳脫引號
4. 確保程式碼中的縮排正確保留
5. 程式碼的每一行應該在 JSON 字串中獨立成行

**CRITICAL Flask/Web Server 要則:**
1. **絕對禁止使用 debug=True** - 這會導致在 subprocess 中運行時崩潰
2. Flask 應用必須使用:`app.run(host='0.0.0.0', port=5000)` (不帶 debug 參數)
3. Node.js/Express 應用也不要使用開發模式的熱重載
4. 如果需要開發便利性,可以在代碼註釋中說明手動運行時可加 debug=True

網頁應用要則:
1. 對於 HTML 檔案或伺服器應用程式(Flask、Node.js 等),設定 "is_web_app": true
2. 只有在你的程式碼包含自動開啟瀏覽器功能時,才設定 "can_open_standalone": true:
   - Python: 使用 webbrowser.open() 或 Flask 加上 app.run(port=5000) + webbrowser
   - Node.js: 使用 'open' 套件或類似工具
   - HTML: 如果是可以直接開啟的獨立 HTML
3. 如果 "can_open_standalone" 為 false 但 "is_web_app" 為 true,請提供:
   - "server_address": 應用程式將運行的 URL(例如:"http://localhost:5000")
   - "web_title": 網頁的標題
4. 對於獨立的 HTML 檔案,將 opens_window 和 is_web_app 都設為 true
5. 對於伺服器應用程式,控制器將處理開啟獨立瀏覽器視窗

重要要則:
1. 始終生成完整、可運行的程式碼 - 不要使用佔位符或省略號
2. 對於 GUI 應用程式(pygame/tkinter),設定視窗標題以匹配專案名稱
3. 對於網頁應用,確保 HTML 有適當的 <title> 標籤
4. 包含所有必要的匯入和錯誤處理
5. 正確指定檔案類型(python、javascript、html 等)
6. 對於 GUI 應用程式或獨立 HTML 檔案,將 opens_window 設為 true
7. 在 install_requirements 中列出所有套件安裝命令
8. 為每個檔案提供清晰的描述
9. 對於多檔案專案,確保檔案正確連結

支持的檔案類型:
python, javascript, html, css, typescript, java, cpp, c, go, rust, ruby, php, swift, kotlin, sql, shell, yaml, json, xml, markdown, text

記住:
- 只輸出有效的 JSON,不要有額外的文字或 markdown 格式
- 確保程式碼正確格式化,縮排正確
- 在程式碼字串中使用真實的換行符號,而不是 \\n 文字
- 對於網頁應用,仔細考慮獨立瀏覽器視窗的能力
- **Flask/Web 伺服器絕對不要使用 debug=True**

對於 HTML + 後端專案的特別注意事項:
1. 確保後端伺服器(Flask/Node.js)正確配置 CORS 和靜態檔案服務
2. HTML 檔案應該正確引用後端 API 端點
3. 提供完整的前後端連接測試程式碼
4. 在 run_instructions 中明確說明:
   - 先啟動後端伺服器
   - 後端服務地址
   - 前端如何訪問
5. 對於需要同時運行前後端的專案:
   - 後端檔案設定 is_web_app: true, can_open_standalone: false
   - 提供準確的 server_address 和 web_title
   - 確保後端程式碼包含適當的路由和 CORS 設定
   - **後端絕對不要使用 debug=True**
6. 測試程式碼應該驗證:
   - 後端伺服器啟動成功
   - API 端點可訪問
   - 前後端數據交互正常

Terminal 輸出和除錯資訊:
1. 所有重要的執行步驟都應該有 print() 或 console.log() 輸出
2. 包含適當的錯誤處理和錯誤訊息輸出
3. 啟動時輸出服務地址和狀態資訊
4. 對於網頁應用,輸出 "伺服器運行於: http://localhost:PORT"
"""

# ============================================
# 配置管理模塊
# ============================================

class ConfigManager:
    """配置文件管理器 - 改進版,增強錯誤處理"""
    
    @staticmethod
    def ensure_config_dir():
        """確保配置目錄存在"""
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            return True
        except Exception as e:
            logger.error(f"無法創建配置目錄 {CONFIG_DIR}: {e}")
            return False
    
    @staticmethod
    def load() -> AIConfig:
        """讀取配置文件"""
        if not ConfigManager.ensure_config_dir():
            logger.warning("配置目錄創建失敗,使用默認配置")
            return AIConfig()
        
        if not CONFIG_FILE.exists():
            logger.info("配置文件不存在,創建默認配置")
            default_config = AIConfig()
            ConfigManager.save(default_config)
            return default_config
        
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return AIConfig(**data)
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"讀取配置文件失敗: {e}")
            logger.info("返回默認配置")
            return AIConfig()
    
    @staticmethod
    def save(config: AIConfig) -> bool:
        """儲存配置文件"""
        try:
            if not ConfigManager.ensure_config_dir():
                raise IOError("無法創建配置目錄")
            
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(asdict(config), f, indent=4, ensure_ascii=False)
            logger.info("配置文件已儲存")
            return True
        except IOError as e:
            logger.error(f"儲存配置文件失敗: {e}")
            return False

# ============================================
# 對話歷史管理 - 修復版
# ============================================

class MemorySummarizer:
    """簡易摘要與關鍵字分析工具"""

    @staticmethod
    def estimate_tokens(text: str) -> int:
        if not text:
            return 0
        # 以平均 4 個字元 ≈ 1 個 token 的粗略估算
        return max(1, int(len(text) / 4))

    @staticmethod
    def summarize_messages(messages: List[ConversationMessage], max_items: int = 6) -> str:
        if not messages:
            return ""

        selected = messages[-max_items:]
        parts = []
        for msg in selected:
            role_label = "使用者" if msg.role == 'user' else "AI"
            snippet = re.sub(r"\s+", " ", msg.content.strip())
            if len(snippet) > 160:
                snippet = snippet[:160] + "..."
            parts.append(f"{role_label}: {snippet}")
        return "\n".join(parts)

    @staticmethod
    def extract_keywords(messages: List[ConversationMessage], top_k: int = 6) -> List[str]:
        if not messages:
            return []

        text = " ".join(msg.content for msg in messages if msg.content)
        tokens = re.findall(r"[A-Za-z0-9\u4e00-\u9fff]{2,}", text)
        filtered = [t.lower() for t in tokens if len(t) > 1]
        if not filtered:
            return []

        counts = Counter(filtered)
        most_common = [word for word, _ in counts.most_common(top_k)]
        return most_common


class LongTermMemoryManager:
    """長期記憶管理器"""

    @staticmethod
    def get_memory_file(project_dir: str) -> Path:
        import hashlib
        project_hash = hashlib.md5(project_dir.encode()).hexdigest()
        return CONVERSATIONS_DIR / f"memory_{project_hash}.json"

    @staticmethod
    def load_memory(project_dir: str, project_name: str = "") -> LongTermMemory:
        memory_file = LongTermMemoryManager.get_memory_file(project_dir)
        if not memory_file.exists():
            return LongTermMemory(
                project_dir=project_dir,
                project_name=project_name or Path(project_dir).name,
                records=[],
                schema_version="1.0"
            )

        try:
            with open(memory_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                records = []
                for item in data.get('records', []):
                    records.append(LongTermMemoryRecord(
                        session_id=item.get('session_id', ''),
                        summary=item.get('summary', ''),
                        keywords=item.get('keywords', []),
                        important_actions=item.get('important_actions', []),
                        related_files=item.get('related_files', []),
                        token_count=item.get('token_count', 0),
                        created_at=item.get('created_at', ''),
                        updated_at=item.get('updated_at', '')
                    ))

                return LongTermMemory(
                    project_dir=data.get('project_dir', project_dir),
                    project_name=data.get('project_name', project_name or Path(project_dir).name),
                    records=records,
                    schema_version=data.get('schema_version', '1.0')
                )
        except Exception as e:
            logger.error(f"載入長期記憶失敗: {e}")
            return LongTermMemory(
                project_dir=project_dir,
                project_name=project_name or Path(project_dir).name
            )

    @staticmethod
    def save_memory(memory: LongTermMemory) -> None:
        memory_file = LongTermMemoryManager.get_memory_file(memory.project_dir)
        data = {
            'project_dir': memory.project_dir,
            'project_name': memory.project_name,
            'schema_version': memory.schema_version,
            'records': [
                {
                    'session_id': record.session_id,
                    'summary': record.summary,
                    'keywords': record.keywords,
                    'important_actions': record.important_actions,
                    'related_files': record.related_files,
                    'token_count': record.token_count,
                    'created_at': record.created_at,
                    'updated_at': record.updated_at
                }
                for record in memory.records
            ]
        }

        with open(memory_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    @staticmethod
    def upsert_record(project_dir: str, project_name: str, session: ConversationSession) -> LongTermMemoryRecord:
        memory = LongTermMemoryManager.load_memory(project_dir, project_name)
        now = datetime.now().isoformat()
        existing = next((r for r in memory.records if r.session_id == session.session_id), None)

        summary = session.summary or MemorySummarizer.summarize_messages(session.messages)
        keywords = session.keywords or MemorySummarizer.extract_keywords(session.messages)

        if existing:
            existing.summary = summary
            existing.keywords = keywords
            existing.token_count = session.token_count
            existing.updated_at = now
        else:
            existing = LongTermMemoryRecord(
                session_id=session.session_id,
                summary=summary,
                keywords=keywords,
                token_count=session.token_count,
                created_at=session.created_at,
                updated_at=now
            )
            memory.records.append(existing)

        LongTermMemoryManager.save_memory(memory)
        return existing

    @staticmethod
    def delete_memory(project_dir: str) -> bool:
        memory_file = LongTermMemoryManager.get_memory_file(project_dir)
        if memory_file.exists():
            try:
                memory_file.unlink()
                return True
            except Exception as e:
                logger.error(f"刪除長期記憶失敗: {e}")
        return False


class ConversationManager:
    """對話歷史管理器 - 修復 token 統計保存問題 + 長短期記憶"""

    TOKEN_THRESHOLD = 6000
    SUMMARY_THRESHOLD = 4000
    
    @staticmethod
    def get_conversation_file(project_dir: str) -> Path:
        """獲取專案對話檔案路徑"""
        import hashlib
        project_hash = hashlib.md5(project_dir.encode()).hexdigest()
        return CONVERSATIONS_DIR / f"conv_{project_hash}.json"
    
    @staticmethod
    def load_conversation(project_dir: str) -> ProjectConversation:
        """載入專案對話歷史 - 支援多視窗與 usage_metadata"""
        conv_file = ConversationManager.get_conversation_file(project_dir)

        if not conv_file.exists():
            project_name = Path(project_dir).name
            session_id = ConversationManager._generate_session_id()
            session = ConversationSession(
                session_id=session_id,
                title="視窗 1",
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat()
            )
            conv = ProjectConversation(
                project_dir=project_dir,
                project_name=project_name,
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat(),
                sessions=[session],
                active_session_id=session_id
            )
            return conv

        try:
            with open(conv_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                base_messages = []
                for msg_data in data.get('messages', []):
                    usage_metadata = msg_data.get('usage_metadata')
                    if not usage_metadata and msg_data.get('metadata'):
                        usage_metadata = msg_data['metadata'].get('usage_metadata')

                    base_messages.append(ConversationMessage(
                        role=msg_data['role'],
                        content=msg_data['content'],
                        timestamp=msg_data['timestamp'],
                        files=msg_data.get('files'),
                        metadata=msg_data.get('metadata'),
                        terminal_output=msg_data.get('terminal_output'),
                        usage_metadata=usage_metadata
                    ))

                sessions = []
                sessions_data = data.get('sessions', [])
                if sessions_data:
                    for idx, session_data in enumerate(sessions_data, start=1):
                        session_messages = []
                        for msg_data in session_data.get('messages', []):
                            usage_metadata = msg_data.get('usage_metadata')
                            if not usage_metadata and msg_data.get('metadata'):
                                usage_metadata = msg_data['metadata'].get('usage_metadata')

                            session_messages.append(ConversationMessage(
                                role=msg_data['role'],
                                content=msg_data['content'],
                                timestamp=msg_data['timestamp'],
                                files=msg_data.get('files'),
                                metadata=msg_data.get('metadata'),
                                terminal_output=msg_data.get('terminal_output'),
                                usage_metadata=usage_metadata
                            ))

                        token_count = session_data.get('token_count')
                        if token_count is None:
                            token_count = ConversationManager._count_tokens(session_messages)

                        sessions.append(ConversationSession(
                            session_id=session_data.get('session_id', ConversationManager._generate_session_id()),
                            title=session_data.get('title', f"視窗 {idx}"),
                            created_at=session_data.get('created_at', data.get('created_at', datetime.now().isoformat())),
                            updated_at=session_data.get('updated_at', data.get('updated_at', datetime.now().isoformat())),
                            messages=session_messages,
                            token_count=token_count,
                            summary=session_data.get('summary'),
                            keywords=session_data.get('keywords', []),
                            metadata=session_data.get('metadata', {})
                        ))
                else:
                    session_id = ConversationManager._generate_session_id()
                    sessions.append(ConversationSession(
                        session_id=session_id,
                        title="視窗 1",
                        created_at=data.get('created_at', datetime.now().isoformat()),
                        updated_at=data.get('updated_at', datetime.now().isoformat()),
                        messages=base_messages.copy(),
                        token_count=ConversationManager._count_tokens(base_messages)
                    ))

                active_session_id = data.get('active_session_id')
                if not active_session_id and sessions:
                    active_session_id = sessions[-1].session_id

                conversation = ProjectConversation(
                    project_dir=data.get('project_dir', project_dir),
                    project_name=data.get('project_name', Path(project_dir).name),
                    messages=base_messages,
                    created_at=data.get('created_at', datetime.now().isoformat()),
                    updated_at=data.get('updated_at', datetime.now().isoformat()),
                    sessions=sessions,
                    active_session_id=active_session_id
                )

                active_session = ConversationManager._get_active_session(conversation)
                if active_session:
                    conversation.messages = active_session.messages

                return conversation
        except Exception as e:
            logger.error(f"載入對話歷史失敗: {e}")
            session_id = ConversationManager._generate_session_id()
            return ProjectConversation(
                project_dir=project_dir,
                project_name=Path(project_dir).name,
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat(),
                sessions=[ConversationSession(
                    session_id=session_id,
                    title="視窗 1",
                    created_at=datetime.now().isoformat(),
                    updated_at=datetime.now().isoformat()
                )],
                active_session_id=session_id
            )

    @staticmethod
    def save_conversation(conversation: ProjectConversation) -> bool:
        """儲存對話歷史 - 正確序列化 usage_metadata 與視窗結構"""
        try:
            conv_file = ConversationManager.get_conversation_file(conversation.project_dir)
            conversation.updated_at = datetime.now().isoformat()

            active_session = ConversationManager._get_active_session(conversation)
            if active_session:
                conversation.messages = active_session.messages

            messages_data = [
                {
                    'role': msg.role,
                    'content': msg.content,
                    'timestamp': msg.timestamp,
                    'files': msg.files,
                    'metadata': msg.metadata,
                    'terminal_output': msg.terminal_output,
                    'usage_metadata': msg.usage_metadata
                }
                for msg in conversation.messages
            ]

            sessions_data = []
            for session in conversation.sessions:
                session_messages = [
                    {
                        'role': msg.role,
                        'content': msg.content,
                        'timestamp': msg.timestamp,
                        'files': msg.files,
                        'metadata': msg.metadata,
                        'terminal_output': msg.terminal_output,
                        'usage_metadata': msg.usage_metadata
                    }
                    for msg in session.messages
                ]

                sessions_data.append({
                    'session_id': session.session_id,
                    'title': session.title,
                    'created_at': session.created_at,
                    'updated_at': session.updated_at,
                    'token_count': session.token_count,
                    'summary': session.summary,
                    'keywords': session.keywords,
                    'metadata': session.metadata,
                    'messages': session_messages
                })

            data = {
                'project_dir': conversation.project_dir,
                'project_name': conversation.project_name,
                'messages': messages_data,
                'created_at': conversation.created_at,
                'updated_at': conversation.updated_at,
                'sessions': sessions_data,
                'active_session_id': conversation.active_session_id
            }

            with open(conv_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            logger.info(f"對話歷史已儲存: {conversation.project_name}")
            return True
        except Exception as e:
            logger.error(f"儲存對話歷史失敗: {e}")
            return False
    
    @staticmethod
    def add_message(project_dir: str, role: str, content: str, files: Optional[List[Dict]] = None,
                   metadata: Optional[Dict] = None, terminal_output: Optional[str] = None,
                   usage_metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """添加消息到對話歷史 - 支持 usage_metadata 與視窗切換"""
        conversation = ConversationManager.load_conversation(project_dir)

        message_tokens = MemorySummarizer.estimate_tokens(content)
        session, session_changed = ConversationManager._ensure_active_session(conversation, message_tokens)

        message = ConversationMessage(
            role=role,
            content=content,
            timestamp=datetime.now().isoformat(),
            files=files,
            metadata=metadata,
            terminal_output=terminal_output,
            usage_metadata=usage_metadata
        )

        session.messages.append(message)
        session.token_count += message_tokens
        session.updated_at = message.timestamp

        if role == 'assistant':
            session.summary = MemorySummarizer.summarize_messages(session.messages)
            session.keywords = MemorySummarizer.extract_keywords(session.messages)

        conversation.active_session_id = session.session_id
        conversation.messages = session.messages

        ConversationManager.save_conversation(conversation)

        serialized = ConversationManager.serialize_conversation(conversation)
        serialized['session_changed'] = session_changed
        serialized['last_message_role'] = role
        return serialized

    @staticmethod
    def delete_conversation_file(project_dir: str) -> bool:
        """刪除對話檔案 - 用於清理臨時對話"""
        try:
            conv_file = ConversationManager.get_conversation_file(project_dir)
            if conv_file.exists():
                conv_file.unlink()
                logger.info(f"已刪除對話檔案: {conv_file}")
            LongTermMemoryManager.delete_memory(project_dir)
            return True
        except Exception as e:
            logger.error(f"刪除對話檔案失敗: {e}")
            return False

    @staticmethod
    def serialize_conversation(conversation: ProjectConversation) -> Dict[str, Any]:
        memory = LongTermMemoryManager.load_memory(conversation.project_dir, conversation.project_name)

        sessions_payload = []
        for session in conversation.sessions:
            messages_payload = [
                {
                    'role': msg.role,
                    'content': msg.content,
                    'timestamp': msg.timestamp,
                    'files': msg.files,
                    'metadata': msg.metadata,
                    'terminal_output': msg.terminal_output,
                    'usage_metadata': msg.usage_metadata
                }
                for msg in session.messages
            ]

            summary = session.summary or MemorySummarizer.summarize_messages(session.messages)
            keywords = session.keywords or MemorySummarizer.extract_keywords(session.messages)

            sessions_payload.append({
                'session_id': session.session_id,
                'title': session.title,
                'created_at': session.created_at,
                'updated_at': session.updated_at,
                'token_count': session.token_count,
                'summary': summary,
                'keywords': keywords,
                'metadata': session.metadata,
                'messages': messages_payload
            })

        memory_payload = {
            'project_dir': memory.project_dir,
            'project_name': memory.project_name,
            'schema_version': memory.schema_version,
            'records': [
                {
                    'session_id': record.session_id,
                    'summary': record.summary,
                    'keywords': record.keywords,
                    'important_actions': record.important_actions,
                    'related_files': record.related_files,
                    'token_count': record.token_count,
                    'created_at': record.created_at,
                    'updated_at': record.updated_at
                }
                for record in memory.records
            ]
        }

        return {
            'project_dir': conversation.project_dir,
            'project_name': conversation.project_name,
            'created_at': conversation.created_at,
            'updated_at': conversation.updated_at,
            'sessions': sessions_payload,
            'active_session_id': conversation.active_session_id,
            'long_term_memory': memory_payload
        }

    @staticmethod
    def _generate_session_id() -> str:
        return str(uuid.uuid4())

    @staticmethod
    def _count_tokens(messages: List[ConversationMessage]) -> int:
        return sum(MemorySummarizer.estimate_tokens(msg.content) for msg in messages)

    @staticmethod
    def _get_active_session(conversation: ProjectConversation) -> Optional[ConversationSession]:
        if not conversation.sessions:
            return None
        session_map = {session.session_id: session for session in conversation.sessions}
        if conversation.active_session_id in session_map:
            return session_map[conversation.active_session_id]
        return conversation.sessions[-1]

    @staticmethod
    def _ensure_active_session(conversation: ProjectConversation, incoming_tokens: int) -> Tuple[ConversationSession, bool]:
        session = ConversationManager._get_active_session(conversation)
        session_changed = False

        if not session:
            session = ConversationManager._start_new_session(conversation)
            session_changed = True
        else:
            projected_tokens = session.token_count + incoming_tokens
            if projected_tokens > ConversationManager.TOKEN_THRESHOLD:
                ConversationManager._finalize_session(conversation, session)
                session = ConversationManager._start_new_session(conversation)
                session_changed = True
        return session, session_changed

    @staticmethod
    def _start_new_session(conversation: ProjectConversation) -> ConversationSession:
        index = len(conversation.sessions) + 1
        session_id = ConversationManager._generate_session_id()
        session = ConversationSession(
            session_id=session_id,
            title=f"視窗 {index}",
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
            messages=[],
            token_count=0,
            metadata={'index': index}
        )
        conversation.sessions.append(session)
        conversation.active_session_id = session_id
        return session

    @staticmethod
    def _finalize_session(conversation: ProjectConversation, session: ConversationSession) -> None:
        session.summary = MemorySummarizer.summarize_messages(session.messages)
        session.keywords = MemorySummarizer.extract_keywords(session.messages)
        session.metadata['finalized_at'] = datetime.now().isoformat()
        LongTermMemoryManager.upsert_record(conversation.project_dir, conversation.project_name, session)


# ============================================
# 專案管理模塊
# ============================================

class ProjectManager:
    """專案管理器"""
    
    @staticmethod
    def load_project_info(project_dir: str) -> Optional[Dict]:
        """載入專案資訊"""
        info_file = Path(project_dir) / "PROJECT_INFO.json"
        if not info_file.exists():
            logger.warning(f"找不到 PROJECT_INFO.json: {info_file}")
            return None
        
        try:
            with open(info_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"讀取專案資訊失敗: {e}")
            return None
    
    @staticmethod
    def load_project_files(project_dir: str) -> List[Dict]:
        """載入專案所有檔案內容"""
        project_dir_path = Path(project_dir)
        files_data = []
        
        exclude = {'PROJECT_INFO.json', '__pycache__', '.git', 'node_modules', 'venv', '.vscode'}
        
        for file_path in project_dir_path.rglob('*'):
            if file_path.is_file() and file_path.name not in exclude:
                if any(ex in file_path.parts for ex in exclude):
                    continue
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    rel_path = file_path.relative_to(project_dir_path)
                    files_data.append({
                        'name': str(rel_path),
                        'type': 'text/plain',
                        'content': content
                    })
                    logger.info(f"已載入檔案: {rel_path}")
                except Exception as e:
                    logger.warning(f"無法讀取檔案 {file_path}: {e}")
        
        return files_data
    
    @staticmethod
    def get_project_structure(project_dir: str) -> str:
        """獲取專案結構字符串"""
        project_dir_path = Path(project_dir)
        structure_lines = [f"專案目錄: {project_dir_path.name}\n"]
        
        exclude = {'PROJECT_INFO.json', '__pycache__', '.git', 'node_modules', 'venv', '.vscode'}
        
        def build_tree(directory, prefix=""):
            contents = sorted(directory.iterdir(), key=lambda x: (x.is_file(), x.name))
            for i, path in enumerate(contents):
                if path.name in exclude:
                    continue
                
                is_last = i == len(contents) - 1
                current_prefix = "└── " if is_last else "├── "
                structure_lines.append(f"{prefix}{current_prefix}{path.name}")
                
                if path.is_dir() and path.name not in exclude:
                    next_prefix = prefix + ("    " if is_last else "│   ")
                    build_tree(path, next_prefix)
        
        build_tree(project_dir_path)
        return "\n".join(structure_lines)
    
    @staticmethod
    def add_to_project_list(project_dir: str, project_name: str, description: str = ""):
        """添加專案到列表"""
        try:
            project_list = ProjectManager.get_project_list()
            
            existing = next((p for p in project_list if p['path'] == project_dir), None)
            
            if existing:
                existing['name'] = project_name
                existing['description'] = description
                existing['last_accessed'] = datetime.now().isoformat()
            else:
                project_list.append({
                    'path': project_dir,
                    'name': project_name,
                    'description': description,
                    'created_at': datetime.now().isoformat(),
                    'last_accessed': datetime.now().isoformat()
                })
            
            with open(PROJECT_LIST_FILE, 'w', encoding='utf-8') as f:
                json.dump(project_list, f, indent=2, ensure_ascii=False)
            
            logger.info(f"已添加/更新專案到列表: {project_name}")
            return True
        except Exception as e:
            logger.error(f"添加專案到列表失敗: {e}")
            return False
    
    @staticmethod
    def get_project_list() -> List[Dict]:
        """獲取專案列表"""
        if not PROJECT_LIST_FILE.exists():
            return []
        
        try:
            with open(PROJECT_LIST_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"讀取專案列表失敗: {e}")
            return []
    
    @staticmethod
    def remove_from_project_list(project_dir: str):
        """從列表移除專案"""
        try:
            project_list = ProjectManager.get_project_list()
            project_list = [p for p in project_list if p['path'] != project_dir]
            
            with open(PROJECT_LIST_FILE, 'w', encoding='utf-8') as f:
                json.dump(project_list, f, indent=2, ensure_ascii=False)
            
            logger.info(f"已從列表移除專案: {project_dir}")
            return True
        except Exception as e:
            logger.error(f"移除專案失敗: {e}")
            return False

# ============================================
# Gemini AI 模塊
# ============================================

class GeminiAI:
    """Gemini AI API 管理器"""
    
    @staticmethod
    def configure(config: AIConfig) -> None:
        """配置 Gemini API 連接"""
        if config.connection_method == 'api_key':
            if not config.gemini_api_key:
                raise ValueError("API Key 模式需要提供有效的 API Key")
            genai.configure(api_key=config.gemini_api_key)
            logger.info("已使用 API Key 連接 Gemini")
            
        elif config.connection_method == 'gcloud_auth':
            if not HAS_GOOGLE_AUTH:
                raise ImportError("缺少 google-auth 套件,請執行: pip install google-auth")
            try:
                credentials, project_id = google.auth.default()
                genai.configure(credentials=credentials)
                logger.info(f"已使用 Google Cloud Auth 連接 (專案: {project_id})")
            except google.auth.exceptions.DefaultCredentialsError:
                raise ConnectionError(
                    "找不到 Google Cloud 憑證,請執行: gcloud auth application-default login"
                )
        else:
            raise ValueError(f"不支持的連接模式: {config.connection_method}")
    
    @staticmethod
    def generate_content(prompt: str, config: AIConfig, files: List[Dict] = None, 
                        terminal_output: str = None) -> Tuple[str, Optional[Dict], Optional[Dict]]:
        """呼叫 Gemini API 生成內容(支持檔案和Terminal輸出)"""
        try:
            GeminiAI.configure(config)
            
            gen_params = dict(config.generation_params)
            gen_params["response_mime_type"] = "application/json"
            
            system_instruction = get_json_system_instruction()
            
            gen_config = GenerationConfig(**{
                k: v for k, v in gen_params.items() if v is not None
            })
            
            valid_categories = {
                'HARM_CATEGORY_HARASSMENT',
                'HARM_CATEGORY_HATE_SPEECH', 
                'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                'HARM_CATEGORY_DANGEROUS_CONTENT'
            }
            
            safety_settings = {}
            for category, threshold in config.safety_settings.items():
                if category in valid_categories:
                    try:
                        safety_settings[HarmCategory[category]] = HarmBlockThreshold[threshold]
                    except KeyError:
                        logger.warning(f"跳過無效的安全類別或閾值: {category}={threshold}")
                else:
                    logger.warning(f"跳過不支持的安全類別: {category}")
            
            model_name = f"models/{config.model_name}"
            logger.info(f"使用模型: {model_name}, 模式: JSON")
            
            model_kwargs = {
                "model_name": model_name,
                "safety_settings": safety_settings
            }
            
            if system_instruction:
                model_kwargs["system_instruction"] = system_instruction
            
            model_kwargs["generation_config"] = gen_config
            
            model = genai.GenerativeModel(**model_kwargs)
            
            content_parts = []
            
            if terminal_output:
                terminal_part = f"\n=== 程式執行輸出 (Terminal Output) ===\n{terminal_output}\n=== 輸出結束 ===\n"
                content_parts.append(terminal_part)
                logger.info("已添加Terminal輸出到提示詞")
            
            if files:
                for file_data in files:
                    file_type = file_data.get('type', '')
                    file_content = file_data.get('content', '')
                    file_name = file_data.get('name', '')
                    
                    logger.info(f"處理檔案: {file_name}, 類型: {file_type}")
                    
                    if file_type.startswith('image/'):
                        import base64
                        if ',' in file_content:
                            file_content = file_content.split(',')[1]
                        
                        image_data = base64.b64decode(file_content)
                        
                        image_part = {
                            'mime_type': file_type,
                            'data': base64.b64encode(image_data).decode('utf-8')
                        }
                        content_parts.append(image_part)
                        logger.info(f"已添加圖片: {file_name}")
                        
                    elif file_type == 'application/pdf':
                        import base64
                        if ',' in file_content:
                            file_content = file_content.split(',')[1]
                        
                        pdf_data = base64.b64decode(file_content)
                        
                        pdf_part = {
                            'mime_type': 'application/pdf',
                            'data': base64.b64encode(pdf_data).decode('utf-8')
                        }
                        content_parts.append(pdf_part)
                        logger.info(f"已添加 PDF: {file_name}")
                        
                    elif file_type.startswith('text/') or file_type == 'application/json' or file_type == 'application/xml':
                        try:
                            if file_content.startswith('data:'):
                                import base64
                                if ';base64,' in file_content:
                                    base64_data = file_content.split(';base64,')[1]
                                    missing_padding = len(base64_data) % 4
                                    if missing_padding:
                                        base64_data += '=' * (4 - missing_padding)
                                    text_content = base64.b64decode(base64_data).decode('utf-8', errors='ignore')
                                else:
                                    text_content = file_content.split(',', 1)[1] if ',' in file_content else file_content
                            else:
                                text_content = file_content
                            
                            text_part = f"\n--- 檔案: {file_name} ---\n{text_content}\n--- 檔案結束 ---\n"
                            content_parts.append(text_part)
                            logger.info(f"已添加文本檔案: {file_name}")
                        except Exception as e:
                            logger.error(f"處理文本檔案失敗: {e}")
                            try:
                                text_part = f"\n--- 檔案: {file_name} ---\n{file_content}\n--- 檔案結束 ---\n"
                                content_parts.append(text_part)
                                logger.info(f"使用原始內容添加文本檔案: {file_name}")
                            except:
                                logger.error(f"完全無法處理檔案: {file_name}")
            
            content_parts.append(prompt)
            
            if len(content_parts) == 1:
                response = model.generate_content(prompt, generation_config=gen_config)
            else:
                response = model.generate_content(content_parts, generation_config=gen_config)
            
            response_text = response.text
            
            json_data = None
            try:
                json_data = json.loads(response_text)
                logger.info("成功解析 JSON 回應")
            except json.JSONDecodeError as e:
                logger.warning(f"JSON 解析失敗: {e}")
                try:
                    if '```json' in response_text:
                        response_text = response_text.split('```json')[1].split('```')[0]
                    elif '```' in response_text:
                        response_text = response_text.split('```')[1].split('```')[0]
                    
                    json_data = json.loads(response_text.strip())
                    logger.info("修復後成功解析 JSON")
                except:
                    logger.error("無法解析為JSON,返回原始文本")
            
            usage_metadata = None
            if hasattr(response, 'usage_metadata'):
                um = response.usage_metadata
                usage_metadata = {
                    'prompt_token_count': getattr(um, 'prompt_token_count', 0),
                    'candidates_token_count': getattr(um, 'candidates_token_count', 0),
                    'thoughts_token_count': getattr(um, 'thoughts_token_count', 0),
                    'total_token_count': getattr(um, 'total_token_count', 0)
                }
                logger.info(f"Token使用量: {usage_metadata}")
            
            return response_text, json_data, usage_metadata
            
        except Exception as e:
            logger.error(f"Gemini API 呼叫失敗: {e}")
            raise

# ============================================
# VS Code 自動化控制模塊
# ============================================

class VSCodeController:
    """VS Code 自動化控制器"""
    
    @staticmethod
    def launch_and_open(folder_path: str, filenames: List[str]) -> Dict[str, Any]:
        """啟動 VS Code 並打開指定檔案"""
        result = {
            "success": False,
            "window_found": False,
            "files_opened": [],
            "message": ""
        }
        
        try:
            logger.info(f"正在啟動 VS Code,資料夾: {folder_path}")
            
            if filenames and len(filenames) > 0:
                first_file = Path(folder_path) / filenames[0]
                subprocess.Popen(
                    ['code', folder_path, str(first_file)],
                    shell=(platform.system() == 'Windows')
                )
            else:
                subprocess.Popen(
                    ['code', folder_path],
                    shell=(platform.system() == 'Windows')
                )
            
            folder_name = os.path.basename(os.path.normpath(folder_path))
            vscode_window = None
            timeout = 15
            start_time = time.time()
            
            logger.info(f"尋找包含 '{folder_name}' 的 VS Code 視窗...")
            
            while time.time() - start_time < timeout:
                all_windows = pwc.getAllWindows()
                
                for window in all_windows:
                    if window.title and 'visual studio code' in window.title.lower():
                        if folder_name.lower() in window.title.lower() or \
                           (filenames and any(fn.lower() in window.title.lower() for fn in filenames)):
                            vscode_window = window
                            break
                
                if vscode_window:
                    break
                time.sleep(0.5)
            
            if not vscode_window:
                possible_windows = [w for w in pwc.getAllWindows() if w.title and "Visual Studio Code" in w.title]
                if possible_windows:
                    vscode_window = possible_windows[0]
                    logger.warning("使用找到的第一個 VS Code 視窗")
                else:
                    result["message"] = f"在 {timeout} 秒內找不到 VS Code 視窗"
                    logger.warning(result["message"])
                    return result
            
            result["window_found"] = True
            logger.info(f"找到 VS Code 視窗: {vscode_window.title}")
            
            if vscode_window.isMinimized:
                vscode_window.restore()
            vscode_window.activate()
            time.sleep(1)
            
            if len(filenames) > 1:
                hotkey_ctrl = 'command' if platform.system() == 'Darwin' else 'ctrl'
                
                for filename in filenames[1:3]:
                    time.sleep(0.5)
                    pyautogui.hotkey(hotkey_ctrl, 'p')
                    time.sleep(0.3)
                    
                    pyperclip.copy(filename)
                    pyautogui.hotkey(hotkey_ctrl, 'v')
                    time.sleep(0.2)
                    
                    pyautogui.press('enter')
                    
                    result["files_opened"].append(filename)
                    logger.info(f"已打開檔案: {filename}")
            
            if filenames:
                result["files_opened"].insert(0, filenames[0])
            
            result["success"] = True
            result["message"] = f"成功打開 VS Code 和 {len(result['files_opened'])} 個檔案"
            logger.info(result["message"])
            
        except FileNotFoundError:
            result["message"] = "找不到 'code' 命令,請確保 VS Code 已安裝並加入 PATH"
            logger.error(result["message"])
        except Exception as e:
            result["message"] = f"VS Code 控制失敗: {str(e)}"
            logger.error(result["message"])
        
        return result

# ============================================
# 螢幕擷取模塊
# ============================================

class ScreenCapture:
    """螢幕擷取管理器"""
    
    @staticmethod
    def capture_running_programs(window_titles: List[str] = None, project_name: str = None, 
                                project_json: Dict = None) -> List[Dict[str, str]]:
        """擷取程式視窗 - 使用project_json中的window_titles"""
        screenshots = []
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        all_window_titles = []
        if project_json and 'files' in project_json:
            for file in project_json['files']:
                if file.get('web_title'):
                    all_window_titles.append(file['web_title'])
                if file.get('window_title'):
                    all_window_titles.append(file['window_title'])
        
        if window_titles:
            all_window_titles.extend(window_titles)
        
        all_window_titles = list(set(all_window_titles))
        
        logger.info(f"開始擷取程式視窗,指定標題: {all_window_titles}, 專案: {project_name}")
        
        all_windows = pwc.getAllWindows()
        captured_titles = set()
        found_windows = []
        
        browser_keywords = ['chrome', 'edge', 'firefox', 'safari', 'brave']
        
        project_variants = []
        if project_name:
            project_variants.append(project_name.lower())
            project_variants.append(project_name.replace('_', ' ').lower())
            project_variants.append(' '.join(word.capitalize() for word in project_name.split('_')))
            project_variants.append(project_name.replace('_', '').lower())
            
            logger.info(f"專案名稱變體: {project_variants}")
        
        for window in all_windows:
            if not window.title:
                continue
            
            window_title_lower = window.title.lower()
            should_capture = False
            capture_reason = ""
            
            if project_name and 'visual studio code' in window_title_lower:
                if project_name.lower() in window_title_lower:
                    should_capture = True
                    capture_reason = "VS Code - 專案視窗"
            
            if not should_capture:
                for browser in browser_keywords:
                    if browser in window_title_lower:
                        for keyword in all_window_titles:
                            if keyword.lower() in window_title_lower:
                                should_capture = True
                                capture_reason = f"瀏覽器 - {keyword}"
                                break
                        if should_capture:
                            break
            
            if not should_capture and all_window_titles:
                for target_title in all_window_titles:
                    if target_title.lower() in window_title_lower:
                        should_capture = True
                        capture_reason = f"直接匹配 - {target_title}"
                        break
            
            if not should_capture and project_variants:
                is_vscode = 'visual studio code' in window_title_lower
                is_browser = any(browser in window_title_lower for browser in browser_keywords)
                
                if not is_vscode and not is_browser:
                    for variant in project_variants:
                        if variant in window_title_lower:
                            should_capture = True
                            capture_reason = f"專案匹配 - {variant}"
                            break
            
            if should_capture and window.title not in captured_titles:
                found_windows.append((window, capture_reason))
                captured_titles.add(window.title)
        
        for window, reason in found_windows:
            try:
                if window.isMinimized:
                    window.restore()
                window.activate()
                time.sleep(0.5)
                
                safe_title = window.title[:50].replace(' ', '_').replace('/', '_').replace('\\', '_').replace(':', '')
                filename = f"capture_{safe_title}_{timestamp}.png"
                filepath = SCREENSHOT_DIR / filename
                
                with mss.mss() as sct:
                    monitor = {
                        "top": max(0, window.top),
                        "left": max(0, window.left),
                        "width": min(window.width, 3840),
                        "height": min(window.height, 2160)
                    }
                    
                    sct_img = sct.grab(monitor)
                    mss.tools.to_png(sct_img.rgb, sct_img.size, output=str(filepath))
                
                screenshots.append({
                    "name": f"{window.title} ({reason})",
                    "filename": filename,
                    "path": str(filepath),
                    "width": window.width,
                    "height": window.height,
                    "timestamp": timestamp
                })
                
                logger.info(f"成功擷取視窗: {window.title} - 原因: {reason}")
                
            except Exception as e:
                logger.warning(f"擷取視窗 '{window.title}' 失敗: {e}")
        
        logger.info(f"擷取完成,共 {len(screenshots)} 個視窗")
        if not screenshots and all_window_titles:
            logger.info(f"提示:確保應用程式已在瀏覽器中開啟,且標題包含相關關鍵字: {all_window_titles}")
        
        return screenshots

# ============================================
# 程式碼處理模塊
# ============================================

class CodeProcessor:
    """程式碼解析和處理器"""
    
    @staticmethod
    def parse_json_response(json_data: Dict) -> ProjectOutput:
        """解析 JSON 格式的 AI 回應"""
        try:
            files = []
            for file_data in json_data.get('files', []):
                code = file_data.get('code', '')
                
                if isinstance(code, str):
                    code = code.replace('\\n', '\n')
                    code = code.replace('\\t', '\t')
                    code = code.replace('\\"', '"')
                    code = code.replace("\\'", "'")
                
                files.append(FileOutput(
                    filename=file_data.get('filename', 'untitled.txt'),
                    filetype=file_data.get('filetype', 'text'),
                    code=code,
                    opens_window=file_data.get('opens_window', False),
                    window_title=file_data.get('window_title'),
                    install_requirements=file_data.get('install_requirements'),
                    dependencies=file_data.get('dependencies'),
                    description=file_data.get('description'),
                    run_command=file_data.get('run_command'),
                    is_web_app=file_data.get('is_web_app', False),
                    can_open_standalone=file_data.get('can_open_standalone', False),
                    server_address=file_data.get('server_address'),
                    web_title=file_data.get('web_title')
                ))
            
            return ProjectOutput(
                project_name=json_data.get('project_name', 'untitled_project'),
                description=json_data.get('description', ''),
                files=files,
                main_file=json_data.get('main_file'),
                setup_instructions=json_data.get('setup_instructions'),
                run_instructions=json_data.get('run_instructions')
            )
        
        except Exception as e:
            logger.error(f"解析 JSON 回應失敗: {e}")
            raise
    
    @staticmethod
    def install_packages(install_requirements: List[str]) -> List[str]:
        """安裝套件"""
        logs = []
        
        for requirement in install_requirements:
            if not requirement:
                continue
            
            logger.info(f"執行安裝指令: {requirement}")
            
            parts = requirement.split()
            if parts[0] == 'pip':
                full_command = [sys.executable, "-m"] + parts
            else:
                full_command = parts
            
            try:
                result = subprocess.run(
                    full_command,
                    capture_output=True,
                    text=True,
                    check=True,
                    encoding='utf-8'
                )
                
                log = f"✅ 成功執行: {requirement}\n"
                log += result.stdout
                if result.stderr:
                    log += f"\n⚠️ 警告:\n{result.stderr}"
                
                logs.append(log)
                
            except subprocess.CalledProcessError as e:
                error_msg = f"❌ 安裝失敗: {requirement}\n錯誤: {e.stderr}"
                logger.error(error_msg)
                logs.append(error_msg)
        
        return logs
    
    @staticmethod
    def save_project_files(folder_path: str, project: ProjectOutput, is_iteration: bool = False) -> Tuple[List[str], List[str]]:
        """儲存專案檔案(支持迭代更新)"""
        saved_files = []
        updated_files = []
        project_dir = Path(folder_path)
        
        if not is_iteration:
            project_dir = project_dir / project.project_name
        
        project_dir.mkdir(parents=True, exist_ok=True)
        
        for file in project.files:
            filepath = project_dir / file.filename
            
            filepath.parent.mkdir(parents=True, exist_ok=True)
            
            try:
                file_exists = filepath.exists()
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(file.code)
                
                if file_exists:
                    logger.info(f"已更新檔案: {filepath}")
                    updated_files.append(str(filepath))
                else:
                    logger.info(f"已建立檔案: {filepath}")
                    saved_files.append(str(filepath))
                
            except IOError as e:
                logger.error(f"儲存檔案失敗 {filepath}: {e}")
                raise
        
        info_file = project_dir / "PROJECT_INFO.json"
        with open(info_file, 'w', encoding='utf-8') as f:
            json.dump({
                "project_name": project.project_name,
                "description": project.description,
                "main_file": project.main_file,
                "setup_instructions": project.setup_instructions,
                "run_instructions": project.run_instructions,
                "files": [asdict(file) for file in project.files]
            }, f, indent=2, ensure_ascii=False)
        
        if info_file not in saved_files and info_file not in updated_files:
            saved_files.append(str(info_file))
        
        return saved_files, updated_files

# ============================================
# 程式執行管理 - 改進版,增加Terminal輸出捕獲
# ============================================

class ProgramManager:
    """管理執行中的程式 - 增強版"""
    
    running_programs = {}
    browser_processes = {}  # 新增:追蹤瀏覽器進程
    
    @classmethod
    def add_program(cls, process, filename, folder_path, window_title=None, output_queue=None):
        """添加程式到管理列表"""
        cls.running_programs[process.pid] = {
            'process': process,
            'filename': filename,
            'folder_path': folder_path,
            'window_title': window_title,
            'start_time': datetime.now(),
            'pid': process.pid,
            'output_queue': output_queue,
            'terminal_output': []
        }
        logger.info(f"已添加程式到管理列表: PID {process.pid}, 檔案 {filename}")
    
    @classmethod
    def add_browser_process(cls, process, project_dir: str):
        """添加瀏覽器進程到追蹤"""
        cls.browser_processes[project_dir] = {
            'process': process,
            'pid': process.pid,
            'start_time': datetime.now()
        }
        logger.info(f"已追蹤瀏覽器進程: PID {process.pid} for {project_dir}")
    
    @classmethod
    def close_project_browsers(cls, project_dir: str):
        """關閉專案相關的瀏覽器視窗"""
        if project_dir in cls.browser_processes:
            browser_info = cls.browser_processes[project_dir]
            try:
                process = browser_info['process']
                if process.poll() is None:  # 進程還在運行
                    process.terminate()
                    time.sleep(0.3)
                    if process.poll() is None:
                        process.kill()
                logger.info(f"已關閉舊瀏覽器: PID {browser_info['pid']}")
            except Exception as e:
                logger.warning(f"關閉瀏覽器失敗: {e}")
            finally:
                del cls.browser_processes[project_dir]
    
    @classmethod
    def get_terminal_output(cls, pid: int) -> str:
        """獲取指定程序的Terminal輸出"""
        if pid in cls.running_programs:
            return '\n'.join(cls.running_programs[pid]['terminal_output'])
        return ""
    
    @classmethod
    def get_all_terminal_output(cls) -> str:
        """獲取所有運行程序的Terminal輸出"""
        all_output = []
        for pid, info in cls.running_programs.items():
            if info['terminal_output']:
                all_output.append(f"=== PID {pid} ({info['filename']}) ===")
                all_output.extend(info['terminal_output'])
                all_output.append("")
        return '\n'.join(all_output)
    
    @classmethod
    def update_outputs(cls):
        """更新所有程序的輸出"""
        for pid, info in list(cls.running_programs.items()):
            if info['output_queue']:
                try:
                    while not info['output_queue'].empty():
                        line = info['output_queue'].get_nowait()
                        info['terminal_output'].append(line)
                except queue.Empty:
                    pass
    
    @classmethod
    def check_programs(cls):
        """檢查並更新程式狀態"""
        cls.update_outputs()
        
        to_remove = []
        status = []
        
        for pid, info in cls.running_programs.items():
            poll_result = info['process'].poll()
            if poll_result is None:
                run_time = (datetime.now() - info['start_time']).seconds
                status.append({
                    'pid': pid,
                    'filename': info['filename'],
                    'window_title': info.get('window_title'),
                    'status': 'running',
                    'run_time': run_time,
                    'terminal_output': '\n'.join(info['terminal_output'][-50:])
                })
            else:
                to_remove.append(pid)
                status.append({
                    'pid': pid,
                    'filename': info['filename'],
                    'window_title': info.get('window_title'),
                    'status': 'finished',
                    'exit_code': poll_result,
                    'terminal_output': '\n'.join(info['terminal_output'][-50:])
                })
        
        for pid in to_remove:
            del cls.running_programs[pid]
            logger.info(f"程式已結束並從列表移除: PID {pid}")
        
        return status
    
    @classmethod
    def terminate_all(cls):
        """終止所有執行中的程式"""
        terminated = []
        for pid in list(cls.running_programs.keys()):
            if cls.terminate_program(pid):
                terminated.append(pid)
        return terminated
    
    @classmethod
    def terminate_program(cls, pid):
        """終止指定的程式"""
        if pid in cls.running_programs:
            try:
                cls.running_programs[pid]['process'].terminate()
                time.sleep(0.5)
                if cls.running_programs[pid]['process'].poll() is None:
                    cls.running_programs[pid]['process'].kill()
                del cls.running_programs[pid]
                logger.info(f"已終止程式: PID {pid}")
                return True
            except Exception as e:
                logger.error(f"終止程式失敗: {e}")
                return False
        return False
    
    @classmethod
    def run_file(cls, filepath: str, folder_path: str, file_info: FileOutput = None):
        """執行檔案 - 改進版,捕獲輸出"""
        file_ext = Path(filepath).suffix.lower()
        window_title = file_info.window_title if file_info else None
        
        try:
            if file_info and file_info.is_web_app:
                if file_ext == '.html':
                    cls.open_standalone_browser(f'file:///{filepath}', file_info.web_title or "Web App", folder_path)
                    return None
                    
                elif file_info.can_open_standalone:
                    if file_ext == '.py':
                        process, output_queue = cls._run_python(filepath, folder_path)
                    elif file_ext == '.js':
                        process, output_queue = cls._run_node(filepath, folder_path)
                    else:
                        return None
                        
                else:
                    if file_ext == '.py':
                        process, output_queue = cls._run_python(filepath, folder_path)
                    elif file_ext == '.js':
                        process, output_queue = cls._run_node(filepath, folder_path)
                    else:
                        return None
                    
                    if file_info.server_address:
                        time.sleep(2)
                        cls.open_standalone_browser(file_info.server_address, file_info.web_title or "Web App", folder_path)
                        
                cls.add_program(process, Path(filepath).name, folder_path, window_title, output_queue)
                return process
                
            elif file_ext == '.py':
                process, output_queue = cls._run_python(filepath, folder_path)
                cls.add_program(process, Path(filepath).name, folder_path, window_title, output_queue)
                return process
                
            elif file_ext == '.js':
                process, output_queue = cls._run_node(filepath, folder_path)
                cls.add_program(process, Path(filepath).name, folder_path, window_title, output_queue)
                return process
                
            elif file_ext == '.html':
                import webbrowser
                webbrowser.open(f'file:///{filepath}')
                return None
                
            else:
                logger.warning(f"不支持直接執行的檔案類型: {file_ext}")
                return None
                
        except Exception as e:
            logger.error(f"執行檔案失敗 {filepath}: {e}")
            raise
    
    @classmethod
    def _run_python(cls, filepath: str, folder_path: str) -> Tuple[subprocess.Popen, queue.Queue]:
        """執行 Python 檔案 - 捕獲輸出 + 禁用buffering"""
        output_queue = queue.Queue()
        
        # 設置環境變量禁用Python buffering
        env = os.environ.copy()
        env['PYTHONUNBUFFERED'] = '1'
        
        if platform.system() == 'Windows':
            process = subprocess.Popen(
                [sys.executable, '-u', str(filepath)],  # -u 禁用buffering
                cwd=folder_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NEW_CONSOLE,
                text=True,
                encoding='utf-8',
                bufsize=1,
                env=env
            )
        else:
            if platform.system() == 'Darwin':
                process = subprocess.Popen(
                    ['osascript', '-e', f'tell application "Terminal" to do script "cd {folder_path} && python3 -u {filepath}"'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    bufsize=1,
                    env=env
                )
            else:
                process = subprocess.Popen(
                    ['x-terminal-emulator', '-e', f'cd {folder_path} && python3 -u {filepath}'],
                    cwd=folder_path,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    bufsize=1,
                    env=env
                )
        
        def read_output():
            try:
                for line in iter(process.stdout.readline, ''):
                    if line:
                        output_queue.put(line.strip())
            except:
                pass
        
        threading.Thread(target=read_output, daemon=True).start()
        
        return process, output_queue
    
    @classmethod
    def _run_node(cls, filepath: str, folder_path: str) -> Tuple[subprocess.Popen, queue.Queue]:
        """執行 Node.js 檔案"""
        output_queue = queue.Queue()
        
        process = subprocess.Popen(
            ['node', str(filepath)],
            cwd=folder_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            bufsize=1
        )
        
        def read_output():
            try:
                for line in iter(process.stdout.readline, ''):
                    if line:
                        output_queue.put(line.strip())
            except:
                pass
        
        threading.Thread(target=read_output, daemon=True).start()
        
        return process, output_queue
    
    @classmethod
    def open_standalone_browser(cls, url: str, title: str = "Web App", project_dir: str = None):
        """開啟獨立的瀏覽器視窗(不是新分頁) - 返回進程以便追蹤"""
        # 如果有專案目錄,先關閉舊的瀏覽器
        if project_dir:
            cls.close_project_browsers(project_dir)
        
        browser_process = None
        
        try:
            if platform.system() == 'Windows':
                chrome_paths = [
                    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                    os.path.expanduser(r"~\AppData\Local\Google\Chrome\Application\chrome.exe"),
                ]
                
                edge_paths = [
                    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                ]
                
                for chrome_path in chrome_paths:
                    if os.path.exists(chrome_path):
                        browser_process = subprocess.Popen([
                            chrome_path,
                            '--new-window',
                            f'--app={url}',
                            '--window-size=1200,800',
                            f'--user-data-dir={CONFIG_DIR / "chrome_profile"}',
                        ])
                        logger.info(f"使用 Chrome 獨立視窗模式開啟: {url}")
                        break
                
                if not browser_process:
                    for edge_path in edge_paths:
                        if os.path.exists(edge_path):
                            browser_process = subprocess.Popen([
                                edge_path,
                                '--new-window',
                                f'--app={url}',
                                '--window-size=1200,800',
                                f'--user-data-dir={CONFIG_DIR / "edge_profile"}',
                            ])
                            logger.info(f"使用 Edge 獨立視窗模式開啟: {url}")
                            break
                
                if not browser_process:
                    import webbrowser
                    webbrowser.open_new(url)
                    logger.warning("使用預設瀏覽器開啟新視窗")
                
            elif platform.system() == 'Darwin':
                chrome_app = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                if os.path.exists(chrome_app):
                    browser_process = subprocess.Popen([
                        chrome_app,
                        '--new-window',
                        f'--app={url}',
                        '--window-size=1200,800',
                        f'--user-data-dir={CONFIG_DIR / "chrome_profile"}'
                    ])
                    logger.info(f"使用 Chrome app 模式開啟: {url}")
                else:
                    subprocess.Popen(['open', '-n', '-a', 'Safari', url])
                    logger.info(f"使用 Safari 開啟: {url}")
                    
            else:
                browsers = [
                    ('google-chrome', 'Google Chrome'),
                    ('google-chrome-stable', 'Google Chrome'),
                    ('chromium-browser', 'Chromium'),
                    ('chromium', 'Chromium')
                ]
                
                for browser_cmd, browser_name in browsers:
                    try:
                        result = subprocess.run(['which', browser_cmd], capture_output=True, text=True)
                        if result.returncode == 0:
                            browser_process = subprocess.Popen([
                                browser_cmd,
                                '--new-window',
                                f'--app={url}',
                                '--window-size=1200,800',
                                f'--user-data-dir={CONFIG_DIR / "chrome_profile"}'
                            ])
                            logger.info(f"使用 {browser_name} app 模式開啟: {url}")
                            break
                    except:
                        continue
                
                if not browser_process:
                    import webbrowser
                    webbrowser.open_new(url)
                    logger.warning("使用預設瀏覽器開啟")
            
            # 追蹤瀏覽器進程
            if browser_process and project_dir:
                cls.add_browser_process(browser_process, project_dir)
                
        except Exception as e:
            logger.error(f"開啟獨立瀏覽器失敗: {e}")
            import webbrowser
            webbrowser.open_new(url)
        
        return browser_process

# ============================================
# 主要處理流程 - 修復版
# ============================================

class ProcessManager:
    """主要處理流程管理器 - 修復對話遷移和 token 統計"""
    
    @staticmethod
    def run_automation_process(
        folder_path: str,
        prompt: str,
        config: AIConfig,
        files: List[Dict] = None,
        is_iteration: bool = False,
        attach_screenshot: bool = False,
        attach_terminal: bool = False
    ) -> ProcessResult:
        """執行完整的自動化流程 - 修復版"""

        result = ProcessResult(success=False, is_iteration=is_iteration)
        session_changed_flag = False

        try:
            if is_iteration:
                logger.info("迭代模式:自動載入專案所有檔案")
                project_files = ProjectManager.load_project_files(folder_path)
                
                if not files:
                    files = []
                
                files.extend(project_files)
                logger.info(f"已附加 {len(project_files)} 個專案檔案")
            
            terminal_output = None
            if attach_terminal:
                terminal_output = ProgramManager.get_all_terminal_output()
                if terminal_output:
                    logger.info("已附加Terminal輸出到AI請求")
                    result.terminal_output = terminal_output
            
            # ⭐ 修復:在正確的時機保存用戶消息
            result.session_context = ConversationManager.add_message(
                folder_path,
                'user',
                prompt,
                files=[{'name': f.get('name'), 'type': f.get('type')} for f in (files or [])],
                terminal_output=terminal_output
            )
            if result.session_context:
                session_changed_flag = result.session_context.get('session_changed', False)
            
            if is_iteration and attach_screenshot:
                project_info = ProjectManager.load_project_info(folder_path)
                if project_info:
                    logger.info("迭代模式:檢查是否有運行中的程序")
                    
                    running_programs = ProgramManager.check_programs()
                    
                    if not running_programs or all(p['status'] != 'running' for p in running_programs):
                        logger.info("沒有運行中的程序,啟動主程式")
                        main_file = project_info.get('main_file')
                        if main_file:
                            main_file_path = Path(folder_path) / main_file
                            
                            main_file_info = None
                            for file_data in project_info.get('files', []):
                                if file_data['filename'] == main_file:
                                    main_file_info = FileOutput(**file_data)
                                    break
                            
                            if main_file_info:
                                ProgramManager.run_file(str(main_file_path), folder_path, main_file_info)
                                
                                if main_file_info.is_web_app:
                                    time.sleep(4)
                                else:
                                    time.sleep(3)
                    else:
                        logger.info("已有運行中的程序,直接使用")
                    
                    window_titles = []
                    for file_data in project_info.get('files', []):
                        if file_data.get('web_title'):
                            window_titles.append(file_data['web_title'])
                    
                    screenshots = ScreenCapture.capture_running_programs(
                        window_titles=window_titles,
                        project_name=project_info.get('project_name'),
                        project_json=project_info
                    )
                    
                    screenshot_files = []
                    for screenshot in screenshots:
                        try:
                            with open(screenshot['path'], 'rb') as f:
                                image_data = f.read()
                                base64_data = base64.b64encode(image_data).decode('utf-8')
                                screenshot_files.append({
                                    'name': screenshot['name'],
                                    'type': 'image/png',
                                    'content': f'data:image/png;base64,{base64_data}'
                                })
                        except Exception as e:
                            logger.error(f"讀取截圖失敗: {e}")
                    
                    if not files:
                        files = []
                    files.extend(screenshot_files)
                    
                    result.screenshots = [s['filename'] for s in screenshots]
            
            logger.info("Step 1: 呼叫 Gemini AI...")
            if files:
                logger.info(f"包含 {len(files)} 個檔案")
            if terminal_output:
                logger.info("包含 Terminal 輸出")
            
            ai_response, json_data, usage_metadata = GeminiAI.generate_content(
                prompt, config, files, terminal_output
            )
            result.ai_response = ai_response
            result.ai_response_json = json_data
            result.usage_metadata = usage_metadata
            
            logger.info("Step 2: 解析 AI 回應...")
            try:
                if json_data:
                    logger.info("使用 JSON 模式解析")
                    project = CodeProcessor.parse_json_response(json_data)
                else:
                    logger.info("嘗試從文本中提取 JSON")
                    try:
                        json_start = ai_response.find('{')
                        json_end = ai_response.rfind('}') + 1
                        if json_start >= 0 and json_end > json_start:
                            json_str = ai_response[json_start:json_end]
                            json_str = json_str.replace('\\n', '\n')
                            json_str = json_str.replace('\\t', '\t')
                            potential_json = json.loads(json_str)
                            project = CodeProcessor.parse_json_response(potential_json)
                            result.ai_response_json = potential_json
                            logger.info("成功從文本中提取並解析 JSON")
                        else:
                            raise ValueError("無法從回應中找到有效的JSON結構")
                    except json.JSONDecodeError as e:
                        raise ValueError(f"JSON解析失敗: {e}")
                
                result.project_data = project
                
            except (ValueError, KeyError) as parse_error:
                logger.error(f"解析 AI 回應失敗: {parse_error}")
                result.error = f"解析失敗: {str(parse_error)}"
                
                error_details = f"""
=== ❌ 解析錯誤 ===
{parse_error}

=== 🔍 可能的原因 ===
1. AI 回應格式不正確
2. JSON 結構有誤
3. 程式碼格式化問題

=== 💡 解決建議 ===
1. 嘗試切換到文本模式
2. 調整 AI 模型(建議使用 Gemini 2.5 Pro)
3. 簡化您的需求描述
4. 檢查 API Key 是否有效

=== 🤖 AI 原始回應 ===
請查看下方「AI 回應」區域以檢視完整內容。
"""
                
                result.output = error_details
                
                if "```" in ai_response:
                    result.output += "\n=== 🔍 檢測到程式碼區塊 ===\n您可以手動複製下方 AI 回應中的程式碼。"
                
                # ⭐ 修復:使用正確的路徑保存錯誤消息
                result.session_context = ConversationManager.add_message(
                    folder_path,
                    'assistant',
                    result.output,
                    metadata={'error': True, 'error_type': 'parse_error'}
                )
                if result.session_context:
                    session_changed_flag = session_changed_flag or result.session_context.get('session_changed', False)

                if result.session_context and session_changed_flag:
                    result.session_context['session_changed'] = result.session_context.get('session_changed', False) or session_changed_flag

                return result
            
            if is_iteration:
                logger.info("Step 3: 終止舊程式...")
                terminated = ProgramManager.terminate_all()
                if terminated:
                    logger.info(f"已終止 {len(terminated)} 個程式")
                    time.sleep(1)
            
            logger.info("Step 4: 安裝必要套件...")
            all_requirements = []
            for file in project.files:
                if file.install_requirements:
                    all_requirements.extend(file.install_requirements)
            
            if all_requirements:
                result.installation_logs = CodeProcessor.install_packages(all_requirements)
            
            # Step 5: 儲存專案檔案
            logger.info("Step 5: 儲存專案檔案...")
            saved_files, updated_files = CodeProcessor.save_project_files(folder_path, project, is_iteration)
            result.files_created = saved_files
            result.files_updated = updated_files
            
            # ⭐ 關鍵修復:確定最終的專案目錄
            if is_iteration:
                final_project_dir = folder_path
            else:
                final_project_dir = str(Path(folder_path) / project.project_name)
            
            # ⭐ 關鍵修復:處理對話遷移
            if not is_iteration and folder_path != final_project_dir:
                logger.info("新建專案:遷移對話記錄...")
                temp_conversation = ConversationManager.load_conversation(folder_path)
                if temp_conversation.messages:
                    # 更新專案目錄和名稱
                    temp_conversation.project_dir = final_project_dir
                    temp_conversation.project_name = project.project_name
                    # 保存到新路徑
                    ConversationManager.save_conversation(temp_conversation)
                    logger.info(f"已遷移 {len(temp_conversation.messages)} 條對話記錄")

                    try:
                        memory = LongTermMemoryManager.load_memory(folder_path, project.project_name)
                        if memory.records:
                            memory.project_dir = final_project_dir
                            memory.project_name = project.project_name
                            LongTermMemoryManager.save_memory(memory)
                        LongTermMemoryManager.delete_memory(folder_path)
                    except Exception as memory_error:
                        logger.warning(f"長期記憶遷移失敗: {memory_error}")

                    # ⭐ 清理臨時對話檔案
                    try:
                        ConversationManager.delete_conversation_file(folder_path)
                        logger.info("已清理臨時對話檔案")
                    except Exception as e:
                        logger.warning(f"清理臨時對話檔案失敗: {e}")
            
            logger.info("Step 6: 啟動 VS Code...")
            
            filenames_to_open = [f.filename for f in project.files[:3]]
            vscode_result = VSCodeController.launch_and_open(final_project_dir, filenames_to_open)
            
            logger.info("Step 7: 執行程式...")
            execution_status = "尚未執行"
            execution_detail = ""
            window_titles_to_capture = []
            
            ProjectManager.add_to_project_list(final_project_dir, project.project_name, project.description)
            
            if project.main_file:
                main_file_path = Path(final_project_dir) / project.main_file
                
                main_file_info = None
                for file in project.files:
                    if file.filename == project.main_file:
                        main_file_info = file
                        break
                
                if main_file_info:
                    if is_iteration:
                        time.sleep(1)
                    
                    process = ProgramManager.run_file(
                        str(main_file_path),
                        final_project_dir,
                        main_file_info
                    )
                    
                    if process:
                        time.sleep(1)
                        poll_result = process.poll()
                        
                        if poll_result is None:
                            execution_status = "✅ 程式已在背景成功啟動"
                            execution_detail = f"程序 ID (PID): {process.pid}"
                            
                            if main_file_info.opens_window or main_file_info.is_web_app:
                                for file in project.files:
                                    if file.opens_window and file.window_title:
                                        window_titles_to_capture.append(file.window_title)
                                        logger.info(f"將擷取視窗: {file.window_title}")
                                    elif file.is_web_app and file.web_title:
                                        window_titles_to_capture.append(file.web_title)
                                        logger.info(f"將擷取網頁視窗: {file.web_title}")
                                
                                if main_file_info.is_web_app:
                                    time.sleep(5)
                                else:
                                    time.sleep(3)
                                
                                if window_titles_to_capture:
                                    logger.info("開始自動截圖...")
                                    program_screenshots = ScreenCapture.capture_running_programs(
                                        window_titles_to_capture, 
                                        project.project_name,
                                        result.ai_response_json
                                    )
                                    for screenshot in program_screenshots:
                                        result.screenshots.append(screenshot['filename'])
                                    
                                    if program_screenshots:
                                        execution_detail += f"\n已擷取 {len(program_screenshots)} 個視窗"
                                    else:
                                        execution_detail += "\n注意:視窗可能需要更多時間才能顯示"
                                        
                            if main_file_info.is_web_app:
                                if main_file_info.server_address:
                                    execution_detail += f"\n🌐 網頁地址: {main_file_info.server_address}"
                                if main_file_info.web_title:
                                    execution_detail += f"\n📖 網頁標題: {main_file_info.web_title}"
                                if not main_file_info.can_open_standalone:
                                    execution_detail += "\n✅ 已自動開啟獨立瀏覽器視窗"
                        
                        elif poll_result == 0:
                            terminal_out = ProgramManager.get_terminal_output(process.pid)
                            execution_status = "✅ 程式執行完成"
                            execution_detail = f"輸出:\n{terminal_out}" if terminal_out else "程式已結束"
                            result.terminal_output = terminal_out
                        else:
                            terminal_out = ProgramManager.get_terminal_output(process.pid)
                            execution_status = "⚠️ 程式執行遇到問題"
                            execution_detail = f"錯誤:\n{terminal_out}" if terminal_out else f"退出碼: {poll_result}"
                            result.terminal_output = terminal_out
                    
                    elif main_file_info.is_web_app and Path(main_file_path).suffix.lower() == '.html':
                        execution_status = "✅ 已開啟 HTML 檔案"
                        execution_detail = f"已在獨立瀏覽器視窗中開啟"
                        if main_file_info.web_title:
                            window_titles_to_capture.append(main_file_info.web_title)
                            time.sleep(3)
                            program_screenshots = ScreenCapture.capture_running_programs(
                                window_titles_to_capture, 
                                project.project_name,
                                result.ai_response_json
                            )
                            for screenshot in program_screenshots:
                                result.screenshots.append(screenshot['filename'])
            
            result.output = f"""
=== 🎉 專案{'迭代' if is_iteration else '生成'}成功 ===
📦 專案名稱: {project.project_name}
📝 描述: {project.description}
📂 專案位置: {final_project_dir}
📄 檔案數量: {len(project.files)}
🎯 主檔案: {project.main_file or '無指定'}

=== 📋 檔案列表 ===
"""
            for file in project.files:
                file_icon = "🐍" if file.filetype == "python" else "📄"
                window_info = f" (視窗: {file.window_title})" if file.opens_window and file.window_title else ""
                update_status = " [已更新]" if str(Path(final_project_dir) / file.filename) in updated_files else " [新建]"
                result.output += f"{file_icon} {file.filename}{update_status} - {file.description or file.filetype}{window_info}\n"
            
            result.output += f"""
=== 💻 VS Code 狀態 ===
{'✅ 已開啟' if vscode_result.get('success') else '⚠️ 開啟失敗'}
已開啟檔案: {', '.join(vscode_result.get('files_opened', []))}

=== ⚡ 程式執行狀態 ===
{execution_status}
{execution_detail}
"""
            
            if is_iteration:
                result.output += f"""
=== 🔄 迭代資訊 ===
新建檔案: {len(saved_files)}
更新檔案: {len(updated_files)}
"""
            
            if project.setup_instructions:
                result.output += f"""
=== 🔧 設置指令 ===
{chr(10).join(f"• {inst}" for inst in project.setup_instructions)}
"""
            
            if project.run_instructions:
                result.output += f"""
=== ▶️ 執行指令 ===
{chr(10).join(f"• {inst}" for inst in project.run_instructions)}
"""
            
            if result.installation_logs:
                result.output += f"""
=== 📦 套件安裝日誌 ===
{chr(10).join(result.installation_logs)}
"""
            
            if usage_metadata:
                result.output += f"""
=== 📊 Token 使用量 ===
• 輸入: {usage_metadata.get('prompt_token_count', 0)} tokens
• 輸出: {usage_metadata.get('candidates_token_count', 0)} tokens
• 思考: {usage_metadata.get('thoughts_token_count', 0)} tokens
• 總計: {usage_metadata.get('total_token_count', 0)} tokens
"""
            
            result.output += f"""
=== 💡 操作提示 ===
1. 查看 VS Code 視窗以編輯程式碼
2. 使用「延遲 5 秒後擷取」來擷取運行畫面
3. 查看「執行中的程式」監控程式狀態
4. 如果是圖形程式,應該會看到新視窗出現
5. 查看「監控」中的 Terminal 輸出以了解程式運行狀況
"""
            
            result.success = True
            
            # ⭐ 關鍵修復:使用最終路徑和正確的 usage_metadata 保存AI回應
            result.session_context = ConversationManager.add_message(
                final_project_dir,  # ✅ 使用最終專案路徑
                'assistant',
                result.output,
                metadata={
                    'project_name': project.project_name,
                    'files_count': len(project.files)
                },
                terminal_output=result.terminal_output,
                usage_metadata=usage_metadata  # ⭐ 直接傳遞 usage_metadata
            )
            if result.session_context:
                session_changed_flag = session_changed_flag or result.session_context.get('session_changed', False)

        except Exception as e:
            result.error = str(e)
            logger.error(f"處理流程失敗: {e}")
            import traceback
            logger.error(traceback.format_exc())

            if not result.ai_response:
                result.ai_response = "無法獲取 AI 回應"

            # 錯誤情況下也保存消息
            result.session_context = ConversationManager.add_message(
                folder_path,
                'assistant',
                f"執行失敗: {result.error}",
                metadata={'error': True, 'error_type': 'execution_error'}
            )
            if result.session_context:
                session_changed_flag = session_changed_flag or result.session_context.get('session_changed', False)

        if result.session_context and session_changed_flag:
            result.session_context['session_changed'] = result.session_context.get('session_changed', False) or session_changed_flag

        return result

# ============================================
# Flask 路由
# ============================================

window = None

@app.route('/')
def index():
    """主頁面"""
    return render_template('index.html')

@app.route('/api/config', methods=['GET', 'POST'])
def handle_config():
    """處理配置 API - 改進錯誤處理"""
    if request.method == 'GET':
        try:
            config = ConfigManager.load()
            return jsonify(asdict(config))
        except Exception as e:
            logger.error(f"載入配置時發生錯誤: {e}")
            default_config = AIConfig()
            return jsonify(asdict(default_config))
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            if not data:
                return jsonify({'success': False, 'error': '無效的請求數據'}), 400
            
            config = AIConfig(**data)
            success = ConfigManager.save(config)
            
            if success:
                return jsonify({'success': True, 'message': '配置已儲存'})
            else:
                return jsonify({'success': False, 'error': '儲存失敗,請檢查權限'}), 500
        except Exception as e:
            logger.error(f"保存配置時發生錯誤: {e}")
            return jsonify({'success': False, 'error': f'保存失敗: {str(e)}'}), 500

@app.route('/select-folder', methods=['GET'])
def select_folder():
    """選擇資料夾"""
    global window
    
    if not window:
        return jsonify({'success': False, 'error': 'Webview 視窗不存在'}), 500
    
    try:
        result = window.create_file_dialog(webview.FOLDER_DIALOG)
        path = result[0] if result else None
        
        if path:
            logger.info(f"選擇了資料夾: {path}")
            return jsonify({'success': True, 'path': path})
        else:
            return jsonify({'success': False, 'error': '未選擇資料夾'})
            
    except Exception as e:
        logger.error(f"選擇資料夾失敗: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/load-project', methods=['POST'])
def load_project():
    """載入現有專案"""
    try:
        data = request.get_json()
        project_dir = data.get('project_dir')
        
        if not project_dir or not Path(project_dir).exists():
            return jsonify({
                'success': False,
                'error': '專案目錄不存在'
            }), 400
        
        project_info = ProjectManager.load_project_info(project_dir)
        if not project_info:
            return jsonify({
                'success': False,
                'error': '找不到 PROJECT_INFO.json 檔案'
            }), 404
        
        project_files = ProjectManager.load_project_files(project_dir)
        project_structure = ProjectManager.get_project_structure(project_dir)
        conversation = ConversationManager.load_conversation(project_dir)
        serialized_conversation = ConversationManager.serialize_conversation(conversation)

        return jsonify({
            'success': True,
            'project_info': project_info,
            'project_files': project_files,
            'project_structure': project_structure,
            'files_count': len(project_files),
            'conversation': serialized_conversation
        })
        
    except Exception as e:
        logger.error(f"載入專案時發生錯誤: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/conversation/<path:project_dir>', methods=['GET'])
def get_conversation(project_dir):
    """獲取專案對話歷史"""
    try:
        conversation = ConversationManager.load_conversation(project_dir)
        serialized = ConversationManager.serialize_conversation(conversation)

        return jsonify({
            'success': True,
            'conversation': serialized
        })
    except Exception as e:
        logger.error(f"獲取對話歷史失敗: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/projects', methods=['GET'])
def get_projects():
    """獲取專案列表"""
    try:
        projects = ProjectManager.get_project_list()
        projects.sort(key=lambda x: x.get('last_accessed', ''), reverse=True)
        return jsonify({
            'success': True,
            'projects': projects
        })
    except Exception as e:
        logger.error(f"獲取專案列表失敗: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/projects/<path:project_path>', methods=['DELETE'])
def delete_project(project_path):
    """從列表移除專案"""
    try:
        success = ProjectManager.remove_from_project_list(project_path)
        if success:
            return jsonify({
                'success': True,
                'message': '專案已從列表移除',
                'deleted_path': project_path
            })
        else:
            return jsonify({
                'success': False,
                'error': '移除失敗'
            }), 500
    except Exception as e:
        logger.error(f"刪除專案失敗: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/run-process', methods=['POST'])
def run_process():
    """執行自動化流程(支持檔案上傳和迭代)"""
    try:
        data = request.get_json()
        
        folder_path = data.get('folder_path')
        prompt = data.get('prompt')
        config_data = data.get('config', {})
        files = data.get('files', [])
        is_iteration = data.get('is_iteration', False)
        attach_screenshot = data.get('attach_screenshot', False)
        attach_terminal = data.get('attach_terminal', False)
        
        if not all([folder_path, prompt]):
            return jsonify({
                'success': False,
                'error': '缺少必要參數(資料夾路徑或 AI 指令)',
                'ai_response': ''
            }), 400
        
        config = AIConfig(**{k: v for k, v in config_data.items() if k != 'response_mode'})
        
        result = ProcessManager.run_automation_process(
            folder_path,
            prompt,
            config,
            files,
            is_iteration,
            attach_screenshot,
            attach_terminal
        )
        
        response_data = {
            'success': result.success,
            'output': result.output,
            'files_created': result.files_created,
            'files_updated': result.files_updated,
            'ai_response': result.ai_response or '無 AI 回應',
            'ai_response_json': result.ai_response_json,
            'installation_logs': result.installation_logs,
            'error': result.error,
            'screenshots': result.screenshots,
            'is_iteration': result.is_iteration,
            'usage_metadata': result.usage_metadata,
            'terminal_output': result.terminal_output,
            'session_context': result.session_context
        }
        
        if result.project_data:
            response_data['project'] = {
                'name': result.project_data.project_name,
                'description': result.project_data.description,
                'files_count': len(result.project_data.files),
                'main_file': result.project_data.main_file,
                'has_gui': any(f.opens_window for f in result.project_data.files)
            }
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"執行流程時發生錯誤: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        return jsonify({
            'success': False,
            'error': str(e),
            'ai_response': '執行過程中發生未預期的錯誤',
            'output': f'系統錯誤: {str(e)}'
        }), 500

@app.route('/capture-screenshots', methods=['POST'])
def capture_screenshots():
    """擷取螢幕畫面 - 改進版,使用project_json"""
    try:
        data = request.get_json() or {}
        capture_mode = data.get('mode', 'programs')
        window_titles = data.get('window_titles', [])
        project_name = data.get('project_name')
        project_json = data.get('project_json')
        
        screenshots = []
        
        if capture_mode == 'monitors':
            logger.info("跳過螢幕擷取模式")
            
        elif capture_mode == 'programs':
            if window_titles or project_name or project_json:
                time.sleep(2)
                program_screenshots = ScreenCapture.capture_running_programs(
                    window_titles, 
                    project_name,
                    project_json
                )
                screenshots.extend(program_screenshots)
            else:
                logger.warning("沒有指定視窗標題或專案名稱")
                
        elif capture_mode == 'all':
            logger.info("不建議使用 'all' 模式")
            if window_titles or project_name or project_json:
                time.sleep(2)
                program_screenshots = ScreenCapture.capture_running_programs(
                    window_titles,
                    project_name,
                    project_json
                )
                screenshots.extend(program_screenshots)
        
        logger.info(f"擷取完成,共 {len(screenshots)} 張截圖,模式: {capture_mode}")
        
        return jsonify({
            'success': True,
            'screenshots': screenshots,
            'count': len(screenshots)
        })
        
    except Exception as e:
        logger.error(f"擷取螢幕失敗: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/screenshot/<filename>')
def serve_screenshot(filename):
    """提供螢幕截圖"""
    filepath = SCREENSHOT_DIR / filename
    if filepath.exists():
        return send_file(
            filepath, 
            mimetype='image/png',
            as_attachment=False,
            download_name=filename
        )
    else:
        return "Screenshot not found", 404

@app.route('/running-programs', methods=['GET'])
def get_running_programs():
    """獲取運行中的程式列表 - 包含Terminal輸出"""
    try:
        status = ProgramManager.check_programs()
        return jsonify({
            'success': True,
            'programs': status,
            'count': len(status)
        })
    except Exception as e:
        logger.error(f"獲取程式狀態失敗: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/terminate-program/<int:pid>', methods=['POST'])
def terminate_program(pid):
    """終止指定的程式"""
    try:
        success = ProgramManager.terminate_program(pid)
        if success:
            return jsonify({
                'success': True,
                'message': f'程式 PID {pid} 已終止'
            })
        else:
            return jsonify({
                'success': False,
                'error': f'找不到 PID {pid} 的程式'
            }), 404
    except Exception as e:
        logger.error(f"終止程式失敗: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================
# 主程式入口
# ============================================

def run_flask():
    """運行 Flask 伺服器"""
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False)

def main():
    """主程式入口"""
    logger.info("=== AI 自動化開發控制器 Pro v5.4 啟動 ===")
    logger.info(f"配置目錄: {CONFIG_DIR}")
    logger.info(f"截圖目錄: {SCREENSHOT_DIR}")
    logger.info(f"日誌目錄: {LOG_DIR}")
    logger.info(f"專案目錄: {PROJECTS_DIR}")
    logger.info(f"對話目錄: {CONVERSATIONS_DIR}")
    
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()
    
    time.sleep(1)
    
    global window
    window = webview.create_window(
        'AI 自動化開發控制器 Pro v5.4',
        f'http://{HOST}:{PORT}',
        width=1400,
        height=1000,
        resizable=True,
        on_top=False
    )
    
    logger.info("正在啟動圖形界面...")
    webview.start()

if __name__ == '__main__':
    main()