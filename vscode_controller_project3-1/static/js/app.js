const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const messageTemplate = document.getElementById("message-template").content;
const chatMessages = document.getElementById("chat-messages");
const sendButton = document.getElementById("send-button");
const promptInput = document.getElementById("prompt-input");
const projectInput = document.getElementById("project-name");
const projectLoadButton = document.getElementById("project-load");
const projectStatus = document.getElementById("project-status");
const tokenInfo = document.getElementById("token-info");
const conversationIdLabel = document.getElementById("conversation-id");
const lastUpdateLabel = document.getElementById("last-update");
const openVSCodeButton = document.getElementById("btn-open-vscode");
const runCommandButton = document.getElementById("btn-run-command");
const screenshotButton = document.getElementById("btn-screenshot");
const commandInput = document.getElementById("command-input");

const state = {
  project: "default",
  conversationId: null,
  sending: false,
};

function updateStatus(message) {
  projectStatus.textContent = message;
}

function appendMessage(role, content, timestamp = new Date().toISOString()) {
  const node = messageTemplate.cloneNode(true);
  const article = node.querySelector(".message");
  if (role === "user") {
    article.classList.add("user");
    article.querySelector(".avatar").textContent = "我";
  } else {
    article.querySelector(".avatar").textContent = "AI";
  }
  node.querySelector(".role").textContent = role === "user" ? "使用者" : "助手";
  node.querySelector(".timestamp").textContent = new Date(timestamp).toLocaleString();
  node.querySelector(".content").textContent = content;
  chatMessages.appendChild(node);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function ensureProject() {
  const name = projectInput.value.trim() || "default";
  state.project = name;
  updateStatus(`已載入專案：${name}`);
  return name;
}

async function sendPrompt() {
  if (state.sending) return;
  const prompt = promptInput.value.trim();
  if (!prompt) return;
  await ensureProject();
  appendMessage("user", prompt);
  lastUpdateLabel.textContent = "最後更新：傳送中...";
  state.sending = true;
  sendButton.disabled = true;
  sendButton.textContent = "處理中...";

  try {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: state.project,
        conversation_id: state.conversationId,
        prompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI 請求失敗 (${response.status})`);
    }

    const data = await response.json();
    appendMessage("assistant", data.text);
    tokenInfo.textContent = `Tokens: ${data.token_count}`;
    state.conversationId = data.conversation_id;
    conversationIdLabel.textContent = `對話：${state.conversationId}`;
    lastUpdateLabel.textContent = `最後更新：${new Date().toLocaleTimeString()}`;
  } catch (error) {
    appendMessage("assistant", `⚠️ 發生錯誤：${error.message}`);
  } finally {
    state.sending = false;
    sendButton.disabled = false;
    sendButton.textContent = "送出";
    promptInput.value = "";
  }
}

async function openVSCode() {
  await ensureProject();
  const response = await fetch("/api/automation/vscode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "open", target: state.project }),
  });
  const result = await response.json();
  updateStatus(result.success ? "已指示開啟 VSCode" : "無法開啟 VSCode，請確認設定");
}

async function runCommand() {
  await ensureProject();
  const command = commandInput.value.trim();
  if (!command) {
    updateStatus("請輸入要執行的指令");
    return;
  }
  const response = await fetch("/api/automation/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: command.split(" "), project: state.project }),
  });
  const result = await response.json();
  updateStatus(`已啟動程序，PID: ${result.pid}`);
}

async function captureScreenshot() {
  const response = await fetch("/api/automation/screenshot");
  if (!response.ok) {
    updateStatus("截圖失敗，請查看伺服器日誌");
    return;
  }
  const result = await response.json();
  appendMessage(
    "assistant",
    `📸 截圖完成：${result.path}\n解析度：${result.resolution}`,
  );
}

sendButton.addEventListener("click", sendPrompt);
promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    sendPrompt();
  }
});
projectLoadButton.addEventListener("click", ensureProject);
openVSCodeButton.addEventListener("click", openVSCode);
runCommandButton.addEventListener("click", runCommand);
screenshotButton.addEventListener("click", captureScreenshot);

appendMessage(
  "assistant",
  "歡迎使用 AI 自動化開發控制器！請先建立專案後輸入需求，我會協助您完成任務。"
);
