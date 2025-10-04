const state = {
  project: null,
  projects: [],
  provider: 'LocalEcho',
  conversations: [],
};

const dom = {
  providerBadge: document.getElementById('provider-badge'),
  projectBadge: document.getElementById('project-badge'),
  projectForm: document.getElementById('project-form'),
  projectList: document.getElementById('project-list'),
  structureView: document.getElementById('structure-view'),
  chatHistory: document.getElementById('chat-history'),
  chatForm: document.getElementById('chat-form'),
  chatPrompt: document.getElementById('chat-prompt'),
  hostForm: document.getElementById('host-form'),
  hostResults: document.getElementById('host-results'),
  refreshHost: document.getElementById('refresh-host'),
  messageTemplate: document.getElementById('message-template'),
  iterationTemplate: document.getElementById('iteration-template'),
};

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!data.success && response.status >= 400) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function updateBadges() {
  dom.providerBadge.textContent = `AI Provider: ${state.provider}`;
  dom.projectBadge.textContent = state.project ? `目前專案：${state.project.name}` : '未選擇專案';
}

function folderNameFromPath(path) {
  const segments = path.split(/[/\\\\]/);
  return segments[segments.length - 1];
}

function appendMessage(role, content) {
  const clone = dom.messageTemplate.content.firstElementChild.cloneNode(true);
  clone.classList.toggle('user', role === 'user');
  clone.querySelector('.avatar').textContent = role === 'assistant' ? 'AI' : 'Me';
  clone.querySelector('.role').textContent = role === 'assistant' ? 'AI 助手' : '使用者';
  clone.querySelector('.time').textContent = new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  });
  clone.querySelector('.content').textContent = content;
  dom.chatHistory.appendChild(clone);
  dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
}

function renderProjects(projects) {
  dom.projectList.innerHTML = '';
  projects.forEach((project) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'project-item';
    item.textContent = project.name;
    if (state.project && state.project.path === project.path) {
      item.classList.add('active');
    }
    item.addEventListener('click', () => selectProject(project));
    dom.projectList.appendChild(item);
  });
}

async function selectProject(project) {
  const folder = folderNameFromPath(project.path);
  const response = await fetchJSON('/api/project/load', {
    method: 'POST',
    body: JSON.stringify({ folder }),
  });
  state.project = response.project;
  updateBadges();
  renderProjects(state.projects);
  const structure = await fetchJSON(`/api/project/structure?folder=${encodeURIComponent(folder)}`);
  dom.structureView.textContent = structure.structure;
}

function renderIteration(result) {
  const clone = dom.iterationTemplate.content.firstElementChild.cloneNode(true);
  clone.querySelector('.iteration-number').textContent = `第 ${result.iteration.iteration} 次迭代`;
  clone.querySelector('.iteration-summary').textContent = result.analysis.summary;
  const details = [
    `AI 回應：\n${result.iteration.ai_response}`,
    `終端輸出：\n${result.iteration.terminal_output}`,
    `日誌：\n${result.iteration.logs}`,
    `自動化分析：\n${JSON.stringify(result.iteration.screenshot, null, 2)}`,
  ].join('\n\n');
  clone.querySelector('.iteration-body').textContent = details;
  dom.hostResults.prepend(clone);
}

async function handleProjectSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());
  const response = await fetchJSON('/api/project/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  state.projects = response.projects || [];
  state.project = response.project;
  appendMessage('assistant', `已建立 / 載入專案：${state.project.name}`);
  updateBadges();
  await loadProjects();
}

async function handleChatSubmit(event) {
  event.preventDefault();
  if (!state.project) {
    alert('請先建立或選擇專案');
    return;
  }
  const prompt = dom.chatPrompt.value.trim();
  if (!prompt) return;
  appendMessage('user', prompt);
  dom.chatPrompt.value = '';
  const response = await fetchJSON('/api/ai/generate', {
    method: 'POST',
    body: JSON.stringify({ project: folderNameFromPath(state.project.path), prompt }),
  });
  appendMessage('assistant', response.response.text);
}

async function handleHostSubmit(event) {
  event.preventDefault();
  if (!state.project) {
    alert('請先建立或選擇專案');
    return;
  }
  dom.hostResults.innerHTML = '';
  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());
  payload.command = payload.command.split(' ').filter(Boolean);
  payload.project = folderNameFromPath(state.project.path);
  payload.max_iterations = Number(payload.max_iterations || 5);
  const response = await fetchJSON('/api/ai/host-mode', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  response.results.forEach(renderIteration);
}

async function loadConfig() {
  const response = await fetchJSON('/api/config');
  state.provider = response.config?.ai_config?.provider ?? 'LocalEcho';
  updateBadges();
}

async function loadProjects() {
  const response = await fetchJSON('/api/project/list', { method: 'GET' });
  state.projects = response.projects || [];
  renderProjects(state.projects);
}

function wireEvents() {
  dom.projectForm.addEventListener('submit', handleProjectSubmit);
  dom.chatForm.addEventListener('submit', handleChatSubmit);
  dom.hostForm.addEventListener('submit', handleHostSubmit);
  dom.refreshHost.addEventListener('click', loadProjects);
}

(async function init() {
  try {
    await loadConfig();
    await loadProjects();
    appendMessage('assistant', '歡迎使用 AI 自動化開發控制器！請先建立專案或選擇既有專案。');
  } catch (error) {
    console.error(error);
    appendMessage('assistant', `初始化失敗：${error.message}`);
  }
  wireEvents();
})();
