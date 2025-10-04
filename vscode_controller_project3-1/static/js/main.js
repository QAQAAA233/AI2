const state = {
  currentProject: null,
  conversationId: null,
  projects: [],
  messages: [],
};

const els = {
  history: document.getElementById("conversationHistory"),
  prompt: document.getElementById("promptInput"),
  send: document.getElementById("sendPrompt"),
  hosting: document.getElementById("runHosting"),
  terminal: document.getElementById("terminalOutput"),
  status: document.getElementById("automationStatus"),
  gallery: document.getElementById("screenshotGallery"),
  projectPanel: document.getElementById("projectPanel"),
  togglePanel: document.getElementById("toggleProjectPanel"),
  projectName: document.getElementById("projectName"),
  createProject: document.getElementById("createProject"),
  projectList: document.getElementById("projectList"),
  modelName: document.getElementById("modelName"),
  apiKey: document.getElementById("apiKey"),
};

async function fetchJSON(url, options = {}) {
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || resp.statusText);
  }
  return resp.json();
}

function formatTimestamp() {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
}

function renderMessage(role, content) {
  const tpl = document.getElementById("messageTemplate");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.classList.add(role);
  node.querySelector(".message__role").textContent = role === "user" ? "使用者" : "AI 助理";
  node.querySelector(".message__time").textContent = formatTimestamp();
  node.querySelector(".message__content").textContent = content;
  els.history.appendChild(node);
  els.history.scrollTop = els.history.scrollHeight;
}

function setStatus(text) {
  els.status.innerHTML = `<p>${text}</p>`;
}

function renderProjects() {
  els.projectList.innerHTML = "";
  state.projects.forEach((proj) => {
    const li = document.createElement("li");
    li.dataset.path = proj.root_path;
    li.innerHTML = `<strong>${proj.name}</strong><span>${proj.root_path}</span>`;
    if (state.currentProject === proj.root_path) li.classList.add("active");
    li.addEventListener("click", () => {
      state.currentProject = proj.root_path;
      state.conversationId = null;
      state.messages = [];
      els.history.innerHTML = "";
      renderProjects();
      setStatus(`已切換至專案：${proj.name}`);
    });
    els.projectList.appendChild(li);
  });
}

async function loadProjects() {
  const data = await fetchJSON("/api/projects");
  state.projects = data.projects;
  renderProjects();
}

async function createProject() {
  const name = els.projectName.value.trim();
  if (!name) return;
  const data = await fetchJSON("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  state.projects.push(data.project);
  state.currentProject = data.project.root_path;
  renderProjects();
  setStatus(`專案 ${name} 已建立`);
}

async function sendPrompt() {
  if (!state.currentProject) {
    setStatus("請先建立或選擇專案");
    return;
  }
  const prompt = els.prompt.value.trim();
  if (!prompt) return;

  renderMessage("user", prompt);
  els.prompt.value = "";
  setStatus("AI 正在生成回應...");

  try {
    const payload = {
      project_dir: state.currentProject,
      prompt,
      conversation_id: state.conversationId,
    };
    const data = await fetchJSON("/api/ai/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.conversationId = data.conversation_id;
    const text = data.response.text || "(無回應內容)";
    renderMessage("assistant", text);
    setStatus("回應已完成");
  } catch (error) {
    renderMessage("assistant", `⚠️ 錯誤：${error.message}`);
    setStatus("發生錯誤，請檢查日誌");
  }
}

async function runHosting() {
  if (!state.currentProject) {
    setStatus("請先選擇專案");
    return;
  }
  setStatus("托管模式啟動，執行示範命令...");
  try {
    const result = await fetchJSON("/api/automation/run", {
      method: "POST",
      body: JSON.stringify({
        command: "python test.py",
        project_dir: state.currentProject,
      }),
    });
    els.terminal.textContent = result.result.terminal_output || "(無輸出)";
    els.gallery.innerHTML = "";
    (result.result.screenshots || []).forEach((shot) => {
      const img = document.createElement("img");
      img.src = `data:image/png;base64,${shot}`;
      els.gallery.appendChild(img);
    });
    setStatus("托管模式示範已完成");
  } catch (error) {
    setStatus(`托管模式失敗：${error.message}`);
  }
}

function bindEvents() {
  els.send.addEventListener("click", sendPrompt);
  els.prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      sendPrompt();
    }
  });
  els.hosting.addEventListener("click", runHosting);
  els.createProject.addEventListener("click", createProject);
  els.togglePanel.addEventListener("click", () => {
    els.projectPanel.classList.toggle("is-open");
  });
}

bindEvents();
loadProjects().catch((error) => {
  console.error(error);
  setStatus("載入專案列表失敗");
});
