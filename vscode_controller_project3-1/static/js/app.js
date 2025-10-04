const projectListEl = document.querySelector('#project-list');
const chatHistoryEl = document.querySelector('#chat-history');
const chatForm = document.querySelector('#chat-form');
const promptInput = document.querySelector('#prompt');
const conversationMeta = document.querySelector('#conversation-meta');
const autopilotBtn = document.querySelector('#start-autopilot');
const automationOutput = document.querySelector('#automation-output');
const statusGrid = document.querySelector('#system-status');
const configDialog = document.querySelector('#config-dialog');
const configBtn = document.querySelector('#open-config');
const configApiKeyInput = document.querySelector('#config-api-key');
const configModelInput = document.querySelector('#config-model');
const newConversationBtn = document.querySelector('#new-conversation');

let activeProject = null;
let activeConversation = null;

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'API request failed');
  }
  return await response.json();
}

function renderMessage(role, content) {
  const message = document.createElement('div');
  message.className = `message ${role}`;
  message.innerHTML = `
    <div class="message__avatar">${role === 'assistant' ? 'AI' : '你'}</div>
    <div class="message__bubble">${content.replace(/\n/g, '<br/>')}</div>
  `;
  chatHistoryEl.appendChild(message);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

async function loadProjects() {
  const projects = await fetchJSON('/api/project/list');
  projectListEl.innerHTML = '';
  projects.forEach((project) => {
    const li = document.createElement('li');
    li.textContent = project.name;
    li.dataset.project = project.name;
    li.addEventListener('click', () => selectProject(project.name));
    projectListEl.appendChild(li);
  });
}

async function selectProject(project) {
  activeProject = project;
  activeConversation = null;
  conversationMeta.textContent = `專案：${project}`;
  document.querySelectorAll('#project-list li').forEach((li) => {
    li.classList.toggle('active', li.dataset.project === project);
  });
  const response = await fetchJSON('/api/conversation/start', {
    method: 'POST',
    body: JSON.stringify({ project }),
  });
  activeConversation = response.conversation_id;
  chatHistoryEl.innerHTML = '';
  renderMessage('assistant', '已建立新對話，請描述您的需求。');
}

async function sendPrompt(event) {
  event.preventDefault();
  if (!promptInput.value.trim()) return;
  if (!activeProject) {
    alert('請先選擇或建立專案');
    return;
  }

  const prompt = promptInput.value.trim();
  promptInput.value = '';
  renderMessage('user', prompt);
  renderMessage('assistant', '思考中...');

  try {
    const payload = await fetchJSON('/api/ai/generate', {
      method: 'POST',
      body: JSON.stringify({
        project: activeProject,
        conversation_id: activeConversation,
        prompt,
      }),
    });

    chatHistoryEl.removeChild(chatHistoryEl.lastElementChild);
    renderMessage('assistant', payload.response);
    activeConversation = payload.conversation_id;
    updateStatus(payload.memory);
  } catch (error) {
    chatHistoryEl.removeChild(chatHistoryEl.lastElementChild);
    renderMessage('assistant', `❌ 請求失敗：${error.message}`);
  }
}

function updateStatus(memorySnapshot) {
  statusGrid.innerHTML = '';
  if (!memorySnapshot) return;
  const items = [
    { label: 'Conversation ID', value: memorySnapshot.conversation_id },
    { label: 'Tokens', value: memorySnapshot.token_usage },
  ];
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'status-item';
    div.innerHTML = `<span>${item.label}</span><span>${item.value}</span>`;
    statusGrid.appendChild(div);
  });
}

async function startAutopilot() {
  if (!activeProject || !activeConversation) {
    alert('請先建立對話');
    return;
  }
  const prompt = promptInput.value.trim();
  if (!prompt) {
    alert('請輸入需要托管的任務描述');
    return;
  }

  renderMessage('assistant', '托管模式啟動，AI 正在分析任務...');
  try {
    const result = await fetchJSON('/api/ai/autopilot', {
      method: 'POST',
      body: JSON.stringify({ project: activeProject, prompt }),
    });
    chatHistoryEl.removeChild(chatHistoryEl.lastElementChild);
    result.iterations.forEach((iteration, index) => {
      renderMessage('assistant', `第 ${index + 1} 輪結果：\n${iteration.response}`);
    });
    automationOutput.textContent = JSON.stringify(result.iterations.at(-1)?.automation_feedback || {}, null, 2);
    updateStatus(result.memory);
  } catch (error) {
    chatHistoryEl.removeChild(chatHistoryEl.lastElementChild);
    renderMessage('assistant', `托管失敗：${error.message}`);
  }
}

async function openConfig() {
  const config = await fetchJSON('/api/config');
  configApiKeyInput.value = config.ai?.api_key || '';
  configModelInput.value = config.ai?.model_name || '';
  configDialog.showModal();
}

async function saveConfig(event) {
  event.preventDefault();
  const { value } = event.submitter;
  if (value !== 'save') return;
  await fetchJSON('/api/config', {
    method: 'POST',
    body: JSON.stringify({
      ai: {
        api_key: configApiKeyInput.value,
        model_name: configModelInput.value,
      },
    }),
  });
  configDialog.close();
}

async function createNewConversation() {
  if (!activeProject) {
    const name = prompt('輸入新專案名稱');
    if (!name) return;
    await fetchJSON('/api/project/create', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    await loadProjects();
    await selectProject(name);
  } else {
    await selectProject(activeProject);
  }
}

chatForm.addEventListener('submit', sendPrompt);
autopilotBtn.addEventListener('click', startAutopilot);
configBtn.addEventListener('click', openConfig);
configDialog.addEventListener('close', () => configDialog.returnValue && configDialog.returnValue !== 'save' && configDialog.close());
configDialog.addEventListener('submit', saveConfig);
newConversationBtn.addEventListener('click', createNewConversation);

loadProjects().catch((error) => console.error('載入專案失敗', error));
