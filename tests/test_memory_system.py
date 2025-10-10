"""記憶系統單元測試"""
import importlib.util
import sys
import types
from pathlib import Path


def 建立模組替身():
    """建立必要的模組替身以便匯入 app 模組"""
    if 'flask' not in sys.modules:
        flask_stub = types.ModuleType('flask')

        class 假Flask:
            def __init__(self, *args, **kwargs):
                self.routes = {}

            def route(self, *args, **kwargs):
                def 裝飾器(func):
                    return func

                return 裝飾器

            def run(self, *args, **kwargs):
                return None

        def 假render_template(*args, **kwargs):
            return ''

        def 假jsonify(*args, **kwargs):
            return dict(*args, **kwargs) if args else kwargs

        class 假Request:
            def __init__(self):
                self.method = 'GET'

            def get_json(self, *args, **kwargs):
                return {}

        def 假send_file(*args, **kwargs):
            return ('', 200)

        flask_stub.Flask = 假Flask
        flask_stub.render_template = 假render_template
        flask_stub.jsonify = 假jsonify
        flask_stub.request = 假Request()
        flask_stub.send_file = 假send_file
        sys.modules['flask'] = flask_stub

    if 'webview' not in sys.modules:
        webview_stub = types.ModuleType('webview')
        webview_stub.FOLDER_DIALOG = 0

        class 假視窗:
            def __init__(self):
                self.path = None

            def create_file_dialog(self, *args, **kwargs):
                return []

        def 建立視窗(*args, **kwargs):
            return 假視窗()

        webview_stub.create_window = 建立視窗
        webview_stub.start = lambda *args, **kwargs: None
        sys.modules['webview'] = webview_stub

    if 'google' not in sys.modules:
        google_stub = types.ModuleType('google')
        sys.modules['google'] = google_stub
    else:
        google_stub = sys.modules['google']

    if 'google.generativeai' not in sys.modules:
        genai_stub = types.ModuleType('google.generativeai')

        class 假模型:
            def __init__(self, *args, **kwargs):
                pass

            def generate_content(self, *args, **kwargs):
                class 假回應:
                    text = ''

                    def __init__(self):
                        self.candidates = []

                    def to_dict(self):
                        return {}

                return 假回應()

        genai_stub.configure = lambda *args, **kwargs: None
        genai_stub.GenerativeModel = 假模型
        sys.modules['google.generativeai'] = genai_stub
        google_stub.generativeai = genai_stub
    else:
        genai_stub = sys.modules['google.generativeai']

    if 'google.generativeai.types' not in sys.modules:
        types_stub = types.ModuleType('google.generativeai.types')

        class 假物件:
            def __init__(self, *args, **kwargs):
                pass

        types_stub.GenerationConfig = 假物件
        types_stub.HarmCategory = 假物件
        types_stub.HarmBlockThreshold = 假物件
        sys.modules['google.generativeai.types'] = types_stub
        genai_stub.types = types_stub

    if 'pywinctl' not in sys.modules:
        pwc_stub = types.ModuleType('pywinctl')
        pwc_stub.getAllWindows = lambda: []
        sys.modules['pywinctl'] = pwc_stub

    if 'pyautogui' not in sys.modules:
        pyautogui_stub = types.ModuleType('pyautogui')
        pyautogui_stub.hotkey = lambda *args, **kwargs: None
        pyautogui_stub.press = lambda *args, **kwargs: None
        sys.modules['pyautogui'] = pyautogui_stub

    if 'pyperclip' not in sys.modules:
        pyperclip_stub = types.ModuleType('pyperclip')
        pyperclip_stub.copy = lambda *args, **kwargs: None
        pyperclip_stub.paste = lambda: ''
        sys.modules['pyperclip'] = pyperclip_stub

    if 'mss.tools' not in sys.modules:
        mss_tools_stub = types.ModuleType('mss.tools')
        mss_tools_stub.to_png = lambda *args, **kwargs: None
        sys.modules['mss.tools'] = mss_tools_stub

    if 'mss' not in sys.modules:
        mss_stub = types.ModuleType('mss')

        class 假MSS:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def shots(self, *args, **kwargs):
                return []

        mss_stub.mss = lambda *args, **kwargs: 假MSS()
        mss_stub.tools = sys.modules['mss.tools']
        sys.modules['mss'] = mss_stub

    if 'PIL.Image' not in sys.modules:
        pil_image_stub = types.ModuleType('PIL.Image')
        pil_image_stub.frombytes = lambda *args, **kwargs: None
        sys.modules['PIL.Image'] = pil_image_stub

    if 'PIL' not in sys.modules:
        pil_stub = types.ModuleType('PIL')
        pil_stub.Image = sys.modules['PIL.Image']
        sys.modules['PIL'] = pil_stub


建立模組替身()

APP_PATH = Path(__file__).resolve().parents[1] / 'vscode_controller_project3-1' / 'app.py'
APP_SPEC = importlib.util.spec_from_file_location('ai_controller_app', APP_PATH)
app_module = importlib.util.module_from_spec(APP_SPEC)
APP_SPEC.loader.exec_module(app_module)  # type: ignore[attr-defined]

MemoryState = app_module.MemoryState
MemoryManager = app_module.MemoryManager

import unittest


class 記憶系統測試(unittest.TestCase):
    """驗證記憶資料的正規化與提示內容"""

    def test_to_payload_正規化(self):
        """測試 MemoryState.to_payload 是否將目標與欄位正規化"""
        state = MemoryState(
            project_dir='/tmp/demo',
            project_name='記憶測試專案',
            score=88,
            evaluation='本輪回應品質優良，符合需求。',
            deduction_reason='無',
            improvement='可加入更多單元測試以提高穩定度。',
            thinking_module={
                '專案總結': '已完成核心介面佈局與狀態管理。',
                '短期記憶': '剛整合前端記憶面板與附件狀態。',
                '長期記憶': '需持續確保多專案記憶一致性。',
                '專案目標': [
                    {'步驟': '1', '任務': '完成界面', '狀態': '已完成', '是否為當前任務': 'true'},
                    {'步驟': 2, '任務': '撰寫測試', '狀態': '進行中', '是否為當前任務': True}
                ]
            }
        )

        payload = state.to_payload()

        self.assertEqual(payload['評分'], 88)
        self.assertEqual(payload['扣分原因'], '無')
        self.assertEqual(payload['核心記憶模塊']['專案總結'], '已完成核心介面佈局與狀態管理。')
        self.assertTrue(payload['核心記憶模塊']['專案目標'][0]['是否為當前任務'])
        self.assertIsInstance(payload['核心記憶模塊']['專案目標'][0]['步驟'], int)

    def test_parse_from_json_轉換(self):
        """測試 MemoryManager.parse_from_json 是否能處理 JSON 格式"""
        json_data = {
            '評分': '92',
            '內容評價': '回應結構清晰且符合規則。',
            '扣分原因': '',
            '改進建議': '可補充測試與截圖。',
            '核心記憶模塊': {
                '專案總結': '已完成記憶系統主流程。',
                '短期記憶 (STM)': '尚未補齊測試覆蓋率。',
                '長期記憶 (LTM)': '需確保所有輸出皆為繁體中文。',
                '專案目標': [
                    {'step': '1', 'task': '建立後端 API', 'status': '已完成', 'current': 'false'},
                    {'step': '2', 'task': '補齊前端互動', 'status': '進行中', 'current': 'true'},
                    {'步驟': 3, '任務': '撰寫測試', '狀態': '未開始', '是否為當前任務': False},
                    {'步驟': 4, '任務': '準備文件', '狀態': '未開始', '是否為當前任務': False}
                ]
            }
        }

        state = MemoryManager.parse_from_json('/tmp/demo', '記憶測試專案', json_data)

        self.assertIsNotNone(state)
        assert state is not None
        self.assertEqual(state.score, 92)
        self.assertEqual(state.deduction_reason, '無')
        self.assertEqual(len(state.thinking_module['專案目標']), 4)
        self.assertTrue(state.thinking_module['專案目標'][1]['是否為當前任務'])
        self.assertEqual(state.thinking_module['短期記憶'], '尚未補齊測試覆蓋率。')

    def test_build_prompt_context_輸出(self):
        """測試 MemoryManager.build_prompt_context 是否包含關鍵資訊"""
        state = MemoryState(
            project_dir='/tmp/demo',
            project_name='記憶測試專案',
            score=75,
            evaluation='功能基本完成但尚可優化。',
            deduction_reason='未提供截圖。',
            improvement='下輪補充視覺證據與壓力測試。',
            thinking_module={
                '專案總結': '記憶面板已可折疊並同步資料。',
                '短期記憶': '剛新增附件狀態徽章。',
                '長期記憶': '強調記憶與提示皆須繁體中文。',
                '專案目標': [
                    {'步驟': 1, '任務': '完成版面', '狀態': '已完成', '是否為當前任務': False},
                    {'步驟': 2, '任務': '新增測試', '狀態': '進行中', '是否為當前任務': True},
                    {'步驟': 3, '任務': '整合 CI', '狀態': '未開始', '是否為當前任務': False},
                    {'步驟': 4, '任務': '撰寫文件', '狀態': '未開始', '是否為當前任務': False}
                ]
            }
        )

        context = MemoryManager.build_prompt_context(state.to_payload())

        self.assertIn('評分: 75', context)
        self.assertIn('內容評價: 功能基本完成但尚可優化。', context)
        self.assertIn('扣分原因: 未提供截圖。', context)
        self.assertIn('改進建議: 下輪補充視覺證據與壓力測試。', context)
        self.assertIn('專案總結: 記憶面板已可折疊並同步資料。', context)


if __name__ == '__main__':
    unittest.main()
