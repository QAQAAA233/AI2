// AI 自動化開發控制器 Pro v5.5 - JavaScript

// ============================================
// 全局變量
// ============================================
let currentProject = null;
let uploadedFiles = [];
let isIterationMode = false;
let currentProjectDir = null;
let autoScreenshot = false;
let attachTerminal = false;
let allProjects = [];
let modelConfig = null;
let sidebarCollapsed = false;
let MODEL_LIMITS = {};
let projectMemoryState = {};
let lastMemorySnapshot = null;
let lastUserMessageElement = null;

// ============================================
// Loading Overlay 控制 - 修復版
// ============================================
function showLoading(message = '處理中...') {
    const overlay = document.getElementById('loadingOverlay');
    const messageEl = document.getElementById('loadingMessage');
    
    if (messageEl) {
        messageEl.textContent = message;
    }
    
    if (overlay) {
        overlay.classList.add('active');
        // 確保在最上層
        overlay.style.zIndex = '99999';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// ============================================
// 初始化
// ============================================
window.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadSettings();
    loadProjectsList();
    checkRunningPrograms();
    setInterval(checkRunningPrograms, 5000);
    
    // 點擊外部關閉選單
    document.addEventListener('click', (e) => {
        const plusMenu = document.getElementById('plusMenu');
        const attachBtn = document.getElementById('plusMenuBtn');
        
        if (plusMenu && attachBtn && !plusMenu.contains(e.target) && !attachBtn.contains(e.target)) {
            plusMenu.classList.remove('active');
        }
    });

    // 文件上傳處理
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            showLoading('正在處理檔案...');
            try {
                for (let file of e.target.files) {
                    await processFile(file);
                }
                updateFilesPreview();
                updateAttachedFilesDisplay();
                showNotification(`已上傳 ${e.target.files.length} 個檔案`, 'success');
                e.target.value = '';
            } finally {
                hideLoading();
            }
        });
    }

    updateMemoryMenuState();
});

// ============================================
// 配置載入
// ============================================
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        
        MODEL_LIMITS = {
            'gemini-2.5-pro': { name: 'Gemini 2.5 Pro', inputLimit: 1048576, outputLimit: 65535 },
            'gemini-2.5-flash': { name: 'Gemini 2.5 Flash', inputLimit: 1048576, outputLimit: 65536 },
            'gemini-2.5-flash-lite': { name: 'Gemini 2.5 Flash-Lite', inputLimit: 1048576, outputLimit: 8192 },
            'gemini-1.5-pro': { name: 'Gemini 1.5 Pro', inputLimit: 2097152, outputLimit: 8192 },
            'gemini-1.5-flash': { name: 'Gemini 1.5 Flash', inputLimit: 1048576, outputLimit: 8192 }
        };
        modelConfig = config;
    } catch (error) {
        console.error('載入配置失敗:', error);
    }
}

// ============================================
// 檔案處理
// ============================================
async function processFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        const isTextFile = file.type.startsWith('text/') || 
                           file.type === 'application/json' ||
                           file.type === 'application/xml' ||
                           file.name.match(/\.(py|js|html|css|md|txt|csv|json|xml)$/i);
        
        reader.onload = (e) => {
            uploadedFiles.push({
                name: file.name,
                type: file.type || 'text/plain',
                size: file.size,
                content: e.target.result,
                isText: isTextFile
            });
            resolve();
        };
        
        if (isTextFile) {
            reader.readAsText(file, 'utf-8');
        } else {
            reader.readAsDataURL(file);
        }
    });
}

function updateFilesPreview() {
    const previewArea = document.getElementById('filesPreviewArea');
    const previewList = document.getElementById('previewFilesList');
    
    if (!previewArea || !previewList) return;
    
    if (uploadedFiles.length === 0) {
        previewArea.classList.remove('active');
        return;
    }
    
    previewArea.classList.add('active');
    previewList.innerHTML = '';
    
    uploadedFiles.forEach((file, index) => {
        const chip = document.createElement('div');
        chip.className = 'preview-file-chip';
        chip.innerHTML = `
            <span class="preview-file-name" title="${file.name}">${file.name}</span>
            <button class="preview-remove-btn" onclick="removeFile(${index})">×</button>
        `;
        previewList.appendChild(chip);
    });
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    updateFilesPreview();
    updateAttachedFilesDisplay();
    showNotification('已移除檔案', 'info');
}

function updateAttachedFilesDisplay() {
    const section = document.getElementById('attachedFilesSection');
    const countBadge = document.getElementById('attachedFilesCount');
    const filesList = document.getElementById('attachedFilesList');
    
    if (!section || !countBadge || !filesList) return;
    
    if (uploadedFiles.length === 0) {
        section.style.display = 'none';
        updateProjectPanelVisibility();
        return;
    }
    
    section.style.display = 'block';
    countBadge.textContent = uploadedFiles.length;
    filesList.innerHTML = '';
    
    uploadedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'attached-file-item';
        fileItem.innerHTML = `
            <span class="attached-file-name">${file.name}</span>
            <button class="remove-attached-btn" onclick="removeFile(${index})">×</button>
        `;
        filesList.appendChild(fileItem);
    });
    
    updateProjectPanelVisibility();
}

// ============================================
// UI 控制
// ============================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    
    sidebarCollapsed = !sidebarCollapsed;
    
    if (sidebarCollapsed) {
        sidebar.style.transform = 'translateX(-100%)';
        mainContent.style.marginLeft = '0';
    } else {
        sidebar.style.transform = 'translateX(0)';
        mainContent.style.marginLeft = '260px';
    }
}

function toggleProjectPanel() {
    const content = document.getElementById('projectPanelContent');
    const toggle = document.getElementById('projectPanelToggle');
    
    if (!content || !toggle) return;
    
    if (content.classList.contains('active')) {
        content.classList.remove('active');
        toggle.style.display = 'flex';
    } else {
        content.classList.add('active');
        toggle.style.display = 'none';
        updateProjectPanelVisibility();
    }
}

function updateProjectPanelVisibility() {
    const hasProject = document.getElementById('projectStructureSection')?.style.display !== 'none';
    const hasAttached = uploadedFiles.length > 0;
    const emptyState = document.getElementById('panelEmptyState');
    
    if (emptyState) {
        emptyState.style.display = (hasProject || hasAttached) ? 'none' : 'block';
    }
}

function togglePlusMenu() {
    const menu = document.getElementById('plusMenu');
    const btn = document.getElementById('plusMenuBtn');
    if (menu) menu.classList.toggle('active');
    if (btn) btn.classList.toggle('active');
}

function triggerFileInput() {
    document.getElementById('fileInput')?.click();
    togglePlusMenu();
}

function toggleAutoScreenshot() {
    autoScreenshot = !autoScreenshot;
    const menuItem = document.getElementById('screenshotMenuItem');
    if (menuItem) {
        if (autoScreenshot) {
            menuItem.classList.add('active');
            showNotification('已啟用自動截圖(迭代時)', 'success');
        } else {
            menuItem.classList.remove('active');
            showNotification('已關閉自動截圖', 'info');
        }
    }
    togglePlusMenu();
}

function toggleAttachTerminal() {
    attachTerminal = !attachTerminal;
    const menuItem = document.getElementById('terminalMenuItem');
    if (menuItem) {
        if (attachTerminal) {
            menuItem.classList.add('active');
            showNotification('已啟用附加 Terminal 輸出', 'success');
        } else {
            menuItem.classList.remove('active');
            showNotification('已關閉附加 Terminal 輸出', 'info');
        }
    }
    togglePlusMenu();
}

function showAdvancedSettings() {
    togglePlusMenu();
    showSettingsModal();
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

function updateSubmitButton() {
    const input = document.getElementById('mainInput');
    const btn = document.getElementById('submitBtn');
    
    if (input && btn) {
        if (input.value.trim()) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
}

function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
    }
}

// ============================================
// 核心功能
// ============================================
async function handleSubmit() {
    const input = document.getElementById('mainInput');
    const prompt = input?.value.trim();
    
    if (!prompt) return;

    if (!currentProjectDir) {
        showNotification('請先選擇或創建專案', 'warning');
        createNewProject();
        return;
    }

    document.getElementById('emptyState').style.display = 'none';
    showConversationArea();

    const attachmentsForMessage = uploadedFiles.map(file => ({
        name: file.name,
        type: file.type || 'text/plain'
    }));

    lastUserMessageElement = addMessage('user', prompt, null, null, attachmentsForMessage);

    input.value = '';
    updateSubmitButton();
    autoResize(input);

    showLoading('AI 正在處理您的請求...');

    try {
        const config = await getConfig();

        const response = await fetch('/run-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder_path: currentProjectDir,
                prompt: prompt,
                config: config,
                files: uploadedFiles,
                is_iteration: isIterationMode,
                attach_screenshot: isIterationMode && autoScreenshot,
                attach_terminal: attachTerminal
            })
        });

        const result = await response.json();

        if (result.success) {
            if (lastUserMessageElement && result.terminal_output) {
                appendTerminalOutputSection(lastUserMessageElement, result.terminal_output);
            }

            const assistantMetadata = {};
            if (result.evaluation) {
                assistantMetadata.evaluation_summary = result.evaluation;
            }
            if (result.memory_module) {
                assistantMetadata.memory_module = result.memory_module;
            }
            if (result.improvement_suggestion) {
                assistantMetadata.improvement_suggestion = result.improvement_suggestion;
            }

            addMessage('assistant', result.output, result.usage_metadata, null, null, assistantMetadata);
            
            if (result.project) {
                currentProject = result.project;
                if (result.ai_response_json) {
                    currentProject.json_data = result.ai_response_json;
                    displayProjectStructure(result.ai_response_json.files);
                }
                
                document.getElementById('currentProjectName').textContent = currentProject.name;
                
                if (!isIterationMode) {
                    const newProjectDir = currentProjectDir + '/' + currentProject.name;
                    currentProjectDir = newProjectDir;
                    
                    isIterationMode = true;
                    const badge = document.getElementById('projectModeBadge');
                    if (badge) {
                        badge.textContent = '延續';
                        badge.style.background = '#0ea5e9';
                    }
                }
            }

            showNotification(result.is_iteration ? '專案迭代成功!' : '專案創建成功!', 'success');
            
            loadProjectsList();
            uploadedFiles = [];
            updateFilesPreview();
            updateAttachedFilesDisplay();
        } else {
            addMessage('assistant', `✕ 執行失敗：${result.error || result.output}`);
            showNotification(`執行失敗：${result.error}`, 'error');
        }
    } catch (error) {
        addMessage('assistant', `✕ 連接錯誤：${error}`);
        showNotification(`連接錯誤：${error}`, 'error');
    } finally {
        hideLoading();
        lastUserMessageElement = null;
    }
}

function addMessage(role, content, usageMetadata = null, terminalOutput = null, attachments = null, metadata = null) {
    const container = document.getElementById('resultsContainer');
    if (!container) return null;

    const message = document.createElement('div');
    message.className = `result-message ${role} selectable`;

    const header = document.createElement('div');
    header.className = 'message-header';

    const avatar = document.createElement('div');
    avatar.className = `avatar ${role}`;
    avatar.textContent = role === 'user' ? 'U' : 'AI';

    const roleLabel = document.createElement('span');
    roleLabel.textContent = role === 'user' ? '您' : 'AI 助手';
    roleLabel.style.fontWeight = '500';

    header.appendChild(avatar);
    header.appendChild(roleLabel);

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content selectable';
    messageContent.textContent = content;

    message.appendChild(header);
    message.appendChild(messageContent);

    const normalizedAttachments = normalizeAttachmentsForDisplay(attachments);
    if (normalizedAttachments.length > 0) {
        const attachmentsSection = buildAttachmentsSection(normalizedAttachments);
        message.appendChild(attachmentsSection);
    }

    if (terminalOutput && terminalOutput.trim()) {
        message.appendChild(createTerminalSection(terminalOutput));
    }

    if (role === 'assistant' && usageMetadata && typeof usageMetadata === 'object') {
        const tokenUsage = document.createElement('div');
        tokenUsage.className = 'token-usage';
        tokenUsage.innerHTML = `
            <div class="token-item">
                <span class="token-label">輸入</span>
                <span class="token-value">${usageMetadata.prompt_token_count || 0}</span>
            </div>
            <div class="token-item">
                <span class="token-label">輸出</span>
                <span class="token-value">${usageMetadata.candidates_token_count || 0}</span>
            </div>
            <div class="token-item">
                <span class="token-label">思考</span>
                <span class="token-value">${usageMetadata.thoughts_token_count || 0}</span>
            </div>
            <div class="token-item">
                <span class="token-label">總計</span>
                <span class="token-value">${usageMetadata.total_token_count || 0}</span>
            </div>
        `;
        message.appendChild(tokenUsage);
    }

    if (role === 'assistant') {
        const snapshot = extractMemorySnapshot(metadata);
        if (snapshot) {
            if (currentProjectDir) {
                projectMemoryState[currentProjectDir] = snapshot;
            }
            applyMemorySnapshot(snapshot);
        }
    }

    container.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return message;
}

function normalizeAttachmentsForDisplay(attachments) {
    if (!Array.isArray(attachments)) return [];
    return attachments
        .map(file => ({
            name: file?.name || file?.filename || '',
            type: file?.type || file?.filetype || '未知'
        }))
        .filter(file => file.name);
}

function getAttachmentIcon(filename, mimeType) {
    const lowerName = (filename || '').toLowerCase();
    const type = (mimeType || '').toLowerCase();

    if (type.startsWith('image/') || /\.(png|jpg|jpeg|gif|bmp|svg|webp)$/.test(lowerName)) return '🖼️';
    if (type.includes('pdf') || lowerName.endsWith('.pdf')) return '📄';
    if (type.includes('zip') || type.includes('tar') || /\.(zip|tar|gz|rar|7z)$/.test(lowerName)) return '🗜️';
    if (type.includes('csv') || lowerName.endsWith('.csv')) return '📊';
    if (type.includes('json') || lowerName.endsWith('.json')) return '🧾';
    if (type.includes('xml') || lowerName.endsWith('.xml')) return '🗂️';
    if (/\.(py|js|ts|java|cpp|c|cs|rb|go|rs|php|swift|kt|html|css|sql|sh|ps1)$/.test(lowerName)) return '💻';
    if (/\.(md|txt|rtf)$/.test(lowerName)) return '📝';
    return '📎';
}

function buildAttachmentsSection(attachments) {
    const section = document.createElement('div');
    section.className = 'attachments-section';

    const header = document.createElement('div');
    header.className = 'attachments-header';
    header.textContent = `附加檔案 (${attachments.length})`;

    const list = document.createElement('div');
    list.className = 'attachments-list';

    attachments.forEach(file => {
        const chip = document.createElement('div');
        chip.className = 'attachment-chip';

        const icon = document.createElement('span');
        icon.className = 'attachment-icon';
        icon.textContent = getAttachmentIcon(file.name, file.type);

        const name = document.createElement('span');
        name.textContent = file.name;
        name.title = file.name;

        const type = document.createElement('span');
        type.style.color = 'var(--text-secondary)';
        type.style.fontSize = '11px';
        type.textContent = `(${file.type})`;

        chip.appendChild(icon);
        chip.appendChild(name);
        chip.appendChild(type);
        list.appendChild(chip);
    });

    section.appendChild(header);
    section.appendChild(list);
    return section;
}

function createTerminalSection(terminalOutput) {
    const section = document.createElement('div');
    section.className = 'terminal-output-section';

    const header = document.createElement('div');
    header.className = 'terminal-header';

    const title = document.createElement('span');
    title.className = 'terminal-title';
    title.textContent = 'Terminal 輸出';

    header.appendChild(title);

    const body = document.createElement('div');
    body.className = 'terminal-body selectable';
    body.textContent = terminalOutput;

    section.appendChild(header);
    section.appendChild(body);
    return section;
}

function appendTerminalOutputSection(messageElement, terminalOutput) {
    if (!messageElement || !terminalOutput || !terminalOutput.trim()) return;
    if (messageElement.querySelector('.terminal-output-section')) return;
    const section = createTerminalSection(terminalOutput);
    messageElement.appendChild(section);
}

function extractMemorySnapshot(metadata) {
    if (!metadata || typeof metadata !== 'object') return null;
    const evaluation = metadata.evaluation_summary || metadata.evaluation || null;
    const memoryModule = metadata.memory_module || metadata['核心記憶模塊'] || null;
    const improvement = metadata.improvement_suggestion || (evaluation ? evaluation['改進建議'] : null);

    if (!evaluation && !memoryModule && !improvement) {
        return null;
    }

    return {
        evaluation,
        memory: memoryModule,
        improvement
    };
}

function applyMemorySnapshot(snapshot) {
    const panel = document.getElementById('memorySidePanel');
    if (!panel) return;

    if (!snapshot) {
        panel.classList.add('collapsed');
        setMemoryText('memoryScoreValue', '--');
        setMemoryText('memoryScoreComment', '尚無資料');
        setMemoryText('memoryContentReview', '尚無資料');
        setMemoryText('memoryPenaltyReason', '尚無資料');
        setMemoryText('memoryImprovement', '尚無資料');
        setMemoryText('memorySummary', '尚無資料');
        setMemoryText('memorySTM', '尚無資料');
        setMemoryText('memoryLTM', '尚無資料');
        renderMemoryGoals([]);
        lastMemorySnapshot = null;
        updateMemoryMenuState();
        updateMemoryToggleIcon();
        return;
    }

    panel.classList.remove('collapsed');

    const evaluation = snapshot.evaluation || {};
    const memory = snapshot.memory || {};
    const improvement = snapshot.improvement || evaluation['改進建議'] || '';

    const rawScore = evaluation['評分'];
    const numericScore = rawScore === null || rawScore === undefined || rawScore === '' ? null : Number(rawScore);
    setMemoryText('memoryScoreValue', Number.isFinite(numericScore) ? numericScore : '--');
    setMemoryText('memoryScoreComment', evaluation['內容評價'] || '尚無資料');
    setMemoryText('memoryContentReview', evaluation['內容評價'] || '尚無資料');
    setMemoryText('memoryPenaltyReason', evaluation['扣分原因'] || '無');
    setMemoryText('memoryImprovement', improvement || '尚無資料');

    setMemoryText('memorySummary', memory['專案總結'] || '尚無資料');
    setMemoryText('memorySTM', memory['短期記憶'] || '尚無資料');
    setMemoryText('memoryLTM', memory['長期記憶'] || '尚無資料');
    renderMemoryGoals(Array.isArray(memory['專案目標']) ? memory['專案目標'] : []);

    lastMemorySnapshot = {
        evaluation,
        memory,
        improvement
    };
    updateMemoryMenuState();
    updateMemoryToggleIcon();
}

function setMemoryText(elementId, value) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = (value !== undefined && value !== null && value !== '') ? value : '尚無資料';
}

function renderMemoryGoals(goals) {
    const container = document.getElementById('memoryGoalsList');
    if (!container) return;

    container.innerHTML = '';

    if (!Array.isArray(goals) || goals.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'memory-empty';
        empty.textContent = '尚無專案目標資料';
        container.appendChild(empty);
        return;
    }

    goals.forEach(goal => {
        const item = document.createElement('div');
        item.className = 'memory-goal-item';

        const step = document.createElement('div');
        step.className = 'memory-goal-step';
        step.textContent = `步驟 ${goal['步驟'] ?? '?'}`;

        const content = document.createElement('div');
        content.className = 'memory-goal-content';
        content.textContent = goal['任務'] || '未提供任務描述';

        const status = document.createElement('span');
        status.className = 'memory-goal-status';
        const isCurrent = goal['是否為當前任務'] ? '｜當前任務' : '';
        status.textContent = `${goal['狀態'] || '未知'}${isCurrent}`;

        content.appendChild(document.createElement('br'));
        content.appendChild(status);

        item.appendChild(step);
        item.appendChild(content);
        container.appendChild(item);
    });
}

function updateMemoryMenuState() {
    const menuItem = document.getElementById('memoryMenuItem');
    if (!menuItem) return;
    if (lastMemorySnapshot) {
        menuItem.classList.remove('disabled');
    } else {
        menuItem.classList.add('disabled');
    }
}

function toggleMemoryPanel() {
    const panel = document.getElementById('memorySidePanel');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    updateMemoryToggleIcon();
}

function updateMemoryToggleIcon() {
    const panel = document.getElementById('memorySidePanel');
    const toggle = document.getElementById('memoryPanelToggle');
    if (!panel || !toggle) return;
    const expanded = !panel.classList.contains('collapsed');
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function showConversationArea() {
    const wrapper = document.getElementById('conversationWrapper');
    if (wrapper) {
        wrapper.style.display = 'flex';
        wrapper.classList.add('active');
    }
    const results = document.getElementById('resultsContainer');
    if (results) {
        results.style.display = 'block';
    }
}

function hideConversationArea() {
    const wrapper = document.getElementById('conversationWrapper');
    if (wrapper) {
        wrapper.style.display = 'none';
        wrapper.classList.remove('active');
    }
    const results = document.getElementById('resultsContainer');
    if (results) {
        results.style.display = 'none';
        results.innerHTML = '';
    }
    applyMemorySnapshot(null);
}

function insertPreviousMemory() {
    if (!lastMemorySnapshot) {
        showNotification('目前沒有可插入的記憶資料', 'warning');
        return;
    }

    const input = document.getElementById('mainInput');
    if (!input) return;

    const { evaluation, memory, improvement } = lastMemorySnapshot;
    const lines = [];

    if (evaluation) {
        if (evaluation['評分'] !== undefined) {
            lines.push(`上一輪評分：${evaluation['評分']}`);
        }
        if (evaluation['內容評價']) {
            lines.push(`內容評價：${evaluation['內容評價']}`);
        }
        if (evaluation['扣分原因']) {
            lines.push(`扣分原因：${evaluation['扣分原因']}`);
        }
    }

    if (memory) {
        if (memory['專案總結']) {
            lines.push(`專案總結：${memory['專案總結']}`);
        }
        if (memory['短期記憶']) {
            lines.push(`短期記憶：${memory['短期記憶']}`);
        }
        if (memory['長期記憶']) {
            lines.push(`長期記憶：${memory['長期記憶']}`);
        }

        if (Array.isArray(memory['專案目標']) && memory['專案目標'].length > 0) {
            lines.push('專案目標更新：');
            memory['專案目標'].forEach(goal => {
                const currentMark = goal['是否為當前任務'] ? '（當前任務）' : '';
                lines.push(`- 步驟 ${goal['步驟'] ?? '?'}【${goal['狀態'] || '未標註'}${currentMark}】${goal['任務'] || '未提供描述'}`);
            });
        }
    }

    if (improvement) {
        lines.push(`上一輪改進建議：${improvement}`);
    }

    const memoryText = lines.join('\n');
    input.value = input.value.trim().length > 0 ? `${input.value}\n\n${memoryText}` : memoryText;
    autoResize(input);
    updateSubmitButton();
    showNotification('已插入上一輪記憶摘要', 'success');
}
function useSuggestion(text) {
    const input = document.getElementById('mainInput');
    if (input) {
        input.value = text;
        updateSubmitButton();
    }
    if (!currentProjectDir) {
        createNewProject();
    }
}

// ============================================
// 專案管理
// ============================================
async function createNewProject() {
    showLoading('正在開啟資料夾選擇器...');
    try {
        const response = await fetch('/select-folder');
        const result = await response.json();
        
        if (result.success && result.path) {
            currentProjectDir = result.path;
            isIterationMode = false;
            
            document.getElementById('currentProjectDisplay').style.display = 'block';
            document.getElementById('currentProjectName').textContent = '新專案';
            const badge = document.getElementById('projectModeBadge');
            if (badge) {
                badge.textContent = '新建';
                badge.style.background = '#10a37f';
            }
            
            document.getElementById('homeBtn').style.display = 'flex';
            
            document.querySelectorAll('.project-item').forEach(item => {
                item.classList.remove('active');
            });

            uploadedFiles = [];
            updateFilesPreview();
            updateAttachedFilesDisplay();

            document.getElementById('projectStructureSection').style.display = 'none';
            document.getElementById('emptyState').style.display = 'none';
            showConversationArea();
            const results = document.getElementById('resultsContainer');
            if (results) results.innerHTML = '';
            projectMemoryState[currentProjectDir] = null;
            applyMemorySnapshot(null);

            showNotification('已選擇專案資料夾', 'success');
            document.getElementById('mainInput')?.focus();
        } else {
            showNotification(result.error || '未選擇資料夾', 'warning');
        }
    } catch (error) {
        showNotification(`錯誤: ${error}`, 'error');
    } finally {
        hideLoading();
    }
}

async function selectExistingFolder() {
    showLoading('正在開啟資料夾選擇器...');
    try {
        const response = await fetch('/select-folder');
        const result = await response.json();
        
        if (result.success && result.path) {
            currentProjectDir = result.path;
            isIterationMode = true;
            
            uploadedFiles = [];
            updateFilesPreview();
            updateAttachedFilesDisplay();
            
            const loadResult = await loadExistingProject(result.path);
            
            if (loadResult) {
                document.getElementById('currentProjectDisplay').style.display = 'block';
                document.getElementById('currentProjectName').textContent = currentProject.name;
                const badge = document.getElementById('projectModeBadge');
                if (badge) {
                    badge.textContent = '延續';
                    badge.style.background = '#0ea5e9';
                }
                
                document.getElementById('homeBtn').style.display = 'flex';
                
                document.querySelectorAll('.project-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                document.getElementById('emptyState').style.display = 'none';
                showConversationArea();

                showNotification(`已載入專案: ${currentProject.name}`, 'success');
            } else {
                showNotification('此資料夾不是有效的專案，將作為新專案', 'warning');
                isIterationMode = false;
                document.getElementById('currentProjectDisplay').style.display = 'block';
                document.getElementById('currentProjectName').textContent = '新專案';
                const badge = document.getElementById('projectModeBadge');
                if (badge) {
                    badge.textContent = '新建';
                    badge.style.background = '#10a37f';
                }
                
                document.getElementById('homeBtn').style.display = 'flex';
                document.getElementById('projectStructureSection').style.display = 'none';
            }
            
            document.getElementById('mainInput')?.focus();
        } else {
            showNotification(result.error || '未選擇資料夾', 'warning');
        }
    } catch (error) {
        showNotification(`錯誤: ${error}`, 'error');
    } finally {
        hideLoading();
    }
}

async function loadProjectsList() {
    try {
        const response = await fetch('/api/projects');
        const result = await response.json();
        
        if (result.success) {
            allProjects = result.projects;
            displayProjectsList(allProjects);
        }
    } catch (error) {
        console.error('載入專案列表失敗:', error);
    }
}

function displayProjectsList(projects) {
    const container = document.getElementById('projectsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (projects.length === 0) {
        container.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-tertiary); font-size: 13px;">尚無專案</div>';
        return;
    }
    
    projects.forEach(project => {
        const item = document.createElement('div');
        item.className = 'project-item';
        
        if (currentProjectDir === project.path) {
            item.classList.add('active');
        }
        
        const timeAgo = getTimeAgo(project.last_accessed);
        
        item.innerHTML = `
            <div class="project-item-name">
                <span>${project.name}</span>
                <button class="delete-project-btn" onclick="event.stopPropagation(); deleteProject('${project.path.replace(/\\/g, '\\\\')}')">×</button>
            </div>
            <div class="project-item-desc">${project.description || '無描述'}</div>
            <div class="project-item-time">${timeAgo}</div>
        `;
        
        item.onclick = () => selectProject(project);
        container.appendChild(item);
    });
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return '剛剛';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分鐘前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小時前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return date.toLocaleDateString('zh-TW');
}

async function selectProject(project) {
    currentProjectDir = project.path;
    isIterationMode = true;
    
    document.getElementById('currentProjectDisplay').style.display = 'block';
    document.getElementById('currentProjectName').textContent = project.name;
    const badge = document.getElementById('projectModeBadge');
    if (badge) {
        badge.textContent = '延續';
        badge.style.background = '#0ea5e9';
    }
    
    document.getElementById('homeBtn').style.display = 'flex';
    
    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.closest('.project-item')?.classList.add('active');

    document.getElementById('emptyState').style.display = 'none';
    showConversationArea();
    const results = document.getElementById('resultsContainer');
    if (results) results.innerHTML = '';

    uploadedFiles = [];
    updateFilesPreview();
    updateAttachedFilesDisplay();

    await loadExistingProject(project.path);
    
    showNotification(`已切換到專案: ${project.name}`, 'success');
}

async function loadExistingProject(projectDir) {
    showLoading('正在載入專案...');
    try {
        const response = await fetch('/load-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_dir: projectDir })
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentProject = {
                name: result.project_info.project_name,
                description: result.project_info.description,
                files_count: result.files_count,
                main_file: result.project_info.main_file,
                json_data: {
                    project_name: result.project_info.project_name,
                    description: result.project_info.description,
                    files: result.project_info.files,
                    main_file: result.project_info.main_file
                }
            };
            
            document.getElementById('currentProjectName').textContent = currentProject.name;
            displayProjectStructure(result.project_info.files);
            
            const container = document.getElementById('resultsContainer');
            if (container) {
                container.innerHTML = '';
            }

            showConversationArea();

            let latestSnapshot = null;

            if (result.conversation && Array.isArray(result.conversation.messages)) {
                for (const msg of result.conversation.messages) {
                    addMessage(
                        msg.role,
                        msg.content,
                        msg.usage_metadata,
                        msg.terminal_output,
                        msg.files,
                        msg.metadata
                    );

                    if (msg.role === 'assistant') {
                        const snapshot = extractMemorySnapshot(msg.metadata);
                        if (snapshot) {
                            latestSnapshot = snapshot;
                        }
                    }
                }
            }

            if (latestSnapshot) {
                projectMemoryState[projectDir] = latestSnapshot;
                applyMemorySnapshot(latestSnapshot);
            } else if (projectMemoryState[projectDir]) {
                applyMemorySnapshot(projectMemoryState[projectDir]);
            } else {
                projectMemoryState[projectDir] = null;
                applyMemorySnapshot(null);
            }

            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error('載入專案失敗:', error);
        return false;
    } finally {
        hideLoading();
    }
}

function displayProjectStructure(files) {
    const section = document.getElementById('projectStructureSection');
    const filesList = document.getElementById('projectFilesList');
    const countBadge = document.getElementById('projectFilesCount');
    
    if (!section || !filesList || !countBadge) return;
    
    if (!files || files.length === 0) {
        section.style.display = 'none';
        updateProjectPanelVisibility();
        return;
    }
    
    section.style.display = 'block';
    countBadge.textContent = files.length;
    filesList.innerHTML = '';
    
    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'project-file-item';
        
        const badge = document.createElement('span');
        badge.className = `file-type-badge ${file.filetype || 'text'}`;
        badge.textContent = (file.filetype || 'TEXT').toUpperCase();
        
        const fileInfo = document.createElement('div');
        fileInfo.style.flex = '1';
        fileInfo.style.minWidth = '0';
        
        const fileName = document.createElement('div');
        fileName.className = 'file-name-text';
        fileName.textContent = file.filename;
        
        fileInfo.appendChild(fileName);
        
        if (file.description) {
            const fileDesc = document.createElement('div');
            fileDesc.className = 'file-desc-text';
            fileDesc.textContent = file.description;
            fileInfo.appendChild(fileDesc);
        }
        
        fileItem.appendChild(badge);
        fileItem.appendChild(fileInfo);
        filesList.appendChild(fileItem);
    });
    
    updateProjectPanelVisibility();
}

async function deleteProject(projectPath) {
    if (!confirm('確定要從列表移除此專案嗎？(不會刪除實際檔案)')) {
        return;
    }
    
    showLoading('正在移除專案...');
    
    try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectPath)}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            showNotification('專案已從列表移除', 'success');
            allProjects = allProjects.filter(p => p.path !== projectPath);
            displayProjectsList(allProjects);
            
            if (currentProjectDir === projectPath) {
                resetToHome();
            }
        } else {
            showNotification('移除失敗', 'error');
        }
    } catch (error) {
        showNotification(`錯誤: ${error}`, 'error');
    } finally {
        hideLoading();
    }
}

function resetToHome() {
    if (!confirm('確定要回到初始介面嗎？當前專案選擇將被清除。')) {
        return;
    }
    
    currentProjectDir = null;
    currentProject = null;
    isIterationMode = false;
    uploadedFiles = [];

    document.getElementById('currentProjectDisplay').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
    hideConversationArea();
    document.getElementById('projectStructureSection').style.display = 'none';
    document.getElementById('homeBtn').style.display = 'none';

    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });

    updateFilesPreview();
    updateAttachedFilesDisplay();
    lastMemorySnapshot = null;
    updateMemoryMenuState();

    showNotification('已回到初始介面', 'info');
}

// ============================================
// 設定管理
// ============================================
async function loadSettings() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        
        document.getElementById('apiKey').value = config.gemini_api_key || '';
        document.getElementById('modelName').value = config.model_name || 'gemini-2.5-pro';
        
        const genParams = config.generation_params || {};
        document.getElementById('temperature').value = genParams.temperature || 0.7;
        document.getElementById('topP').value = genParams.top_p || 0.95;
        document.getElementById('topK').value = genParams.top_k || 64;
        document.getElementById('maxOutputTokens').value = genParams.max_output_tokens || 8192;
        
        const thinkingConfig = config.thinking_config || {};
        document.getElementById('thinkingBudget').value = thinkingConfig.thinking_budget || -1;
        
        const safetySettings = config.safety_settings || {};
        document.getElementById('safetyHarassment').value = safetySettings.HARM_CATEGORY_HARASSMENT || 'BLOCK_MEDIUM_AND_ABOVE';
        document.getElementById('safetyHateSpeech').value = safetySettings.HARM_CATEGORY_HATE_SPEECH || 'BLOCK_MEDIUM_AND_ABOVE';
        document.getElementById('safetySexuallyExplicit').value = safetySettings.HARM_CATEGORY_SEXUALLY_EXPLICIT || 'BLOCK_MEDIUM_AND_ABOVE';
        document.getElementById('safetyDangerousContent').value = safetySettings.HARM_CATEGORY_DANGEROUS_CONTENT || 'BLOCK_MEDIUM_AND_ABOVE';
        
        updateSliderValue('thinkingBudget');
        updateSliderValue('temperature');
        updateSliderValue('topP');
        updateSliderValue('topK');
        updateSliderValue('maxOutputTokens');
        
        updateModelLimits();
    } catch (error) {
        console.error('Failed to load settings:', error);
        showNotification('載入設定失敗，使用預設值', 'warning');
    }
}

async function saveSettings() {
    showLoading('正在儲存設定...');
    
    try {
        const config = {
            connection_method: 'api_key',
            gemini_api_key: document.getElementById('apiKey').value,
            model_name: document.getElementById('modelName').value,
            generation_params: {
                temperature: parseFloat(document.getElementById('temperature').value),
                top_p: parseFloat(document.getElementById('topP').value),
                top_k: parseInt(document.getElementById('topK').value),
                max_output_tokens: parseInt(document.getElementById('maxOutputTokens').value),
                candidate_count: 1,
                stop_sequences: [],
                response_mime_type: 'application/json'
            },
            thinking_config: {
                thinking_budget: parseInt(document.getElementById('thinkingBudget').value)
            },
            safety_settings: {
                "HARM_CATEGORY_HARASSMENT": document.getElementById('safetyHarassment').value,
                "HARM_CATEGORY_HATE_SPEECH": document.getElementById('safetyHateSpeech').value,
                "HARM_CATEGORY_SEXUALLY_EXPLICIT": document.getElementById('safetySexuallyExplicit').value,
                "HARM_CATEGORY_DANGEROUS_CONTENT": document.getElementById('safetyDangerousContent').value
            },
            automation_settings: {
                auto_error_fix: false,
                auto_optimize: false,
                auto_test: false,
                monitor_interval: 5
            }
        };

        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        if (response.ok) {
            showNotification('設定已儲存', 'success');
            closeModal('settingsModal');
            
            const limits = MODEL_LIMITS[config.model_name];
            if (limits) {
                document.getElementById('currentModel').textContent = limits.name;
            }
        } else {
            showNotification('儲存失敗', 'error');
        }
    } catch (error) {
        showNotification(`錯誤: ${error}`, 'error');
    } finally {
        hideLoading();
    }
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(inputId + 'ToggleIcon');
    
    if (!input) return;
    
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
}

function updateSliderValue(sliderId) {
    const slider = document.getElementById(sliderId);
    const valueSpan = document.getElementById(sliderId + 'Value');
    
    if (!slider || !valueSpan) return;
    
    let displayValue = slider.value;
    
    if (sliderId === 'thinkingBudget') {
        if (slider.value == -1) {
            displayValue = '動態 (-1)';
        } else if (slider.value == 0) {
            displayValue = '關閉 (0)';
        } else {
            displayValue = slider.value;
        }
    }
    
    valueSpan.textContent = displayValue;
}

function updateModelLimits() {
    const modelName = document.getElementById('modelName')?.value;
    const limits = MODEL_LIMITS[modelName];
    
    if (limits) {
        document.getElementById('modelInfoTitle').textContent = limits.name;
        document.getElementById('modelInfoText').textContent = 
            `輸入上限: ${limits.inputLimit.toLocaleString()} tokens | 輸出上限: ${limits.outputLimit.toLocaleString()} tokens`;
        
        const maxOutputSlider = document.getElementById('maxOutputTokens');
        if (maxOutputSlider) {
            maxOutputSlider.max = limits.outputLimit;
            if (parseInt(maxOutputSlider.value) > limits.outputLimit) {
                maxOutputSlider.value = limits.outputLimit;
                updateSliderValue('maxOutputTokens');
            }
        }
    }
}

async function getConfig() {
    const response = await fetch('/api/config');
    return await response.json();
}

// ============================================
// 截圖和監控
// ============================================
async function captureScreenshotsNow() {
    if (!currentProject) {
        showNotification('請先選擇專案', 'warning');
        return;
    }
    
    showLoading('正在擷取畫面...');

    let windowTitles = [];
    let projectName = currentProject.name;

    if (currentProject.json_data && currentProject.json_data.files) {
        for (const file of currentProject.json_data.files) {
            if (file.web_title) windowTitles.push(file.web_title);
            if (file.window_title) windowTitles.push(file.window_title);
        }
        windowTitles = [...new Set(windowTitles)];
    }

    try {
        const response = await fetch('/capture-screenshots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'programs',
                window_titles: windowTitles,
                project_name: projectName,
                project_json: currentProject?.json_data
            })
        });

        const result = await response.json();

        if (result.success) {
            displayScreenshots(result.screenshots);
            if (result.count > 0) {
                showNotification(`成功擷取 ${result.count} 張截圖`, 'success');
                showMonitorModal();
            } else {
                showNotification('未找到指定視窗，請確認程式已啟動', 'warning');
            }
        }
    } catch (error) {
        showNotification(`錯誤: ${error}`, 'error');
    } finally {
        hideLoading();
    }
}

async function delayedCaptureScreenshots() {
    let countdown = 5;
    const updateCountdown = () => {
        showLoading(`將在 ${countdown} 秒後擷取...`);
        countdown--;

        if (countdown >= 0) {
            setTimeout(updateCountdown, 1000);
        } else {
            captureScreenshotsNow();
        }
    };

    updateCountdown();
}

function displayScreenshots(screenshots) {
    const container = document.getElementById('screenshotPreview');
    if (!container) return;
    
    container.innerHTML = '';

    screenshots.forEach(screenshot => {
        const item = document.createElement('div');
        item.className = 'screenshot-item';
        
        const img = document.createElement('img');
        img.src = `/screenshot/${screenshot.filename}`;
        img.alt = screenshot.name;

        item.appendChild(img);
        container.appendChild(item);
    });
}

async function checkRunningPrograms() {
    try {
        const response = await fetch('/running-programs');
        const result = await response.json();

        const container = document.getElementById('runningPrograms');
        if (!container) return;

        if (result.success && result.programs.length > 0) {
            let html = '';
            result.programs.forEach(prog => {
                const statusIcon = prog.status === 'running' ? '●' : '○';
                const statusText = prog.status === 'running' 
                    ? `運行中 (${prog.run_time}秒)` 
                    : `已結束`;

                html += `
                    <div class="program-card">
                        <div class="program-header">
                            <div class="program-info">
                                <div class="program-status">
                                    ${statusIcon} <strong>PID ${prog.pid}:</strong> ${prog.filename}
                                </div>
                                <div class="program-details">${statusText}</div>
                            </div>
                            ${prog.status === 'running' ? `
                                <button onclick="terminateProgram(${prog.pid})" style="padding: 6px 12px; background: #ef4146; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                    停止
                                </button>
                            ` : ''}
                        </div>
                        ${prog.terminal_output ? `
                            <div class="terminal-output-section" style="margin-top: 8px;">
                                <div class="terminal-header">
                                    <span class="terminal-title">輸出</span>
                                </div>
                                <div class="terminal-body selectable" style="max-height: 150px;">${prog.terminal_output}</div>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div class="empty-programs">暫無運行中的程式</div>';
        }
    } catch (error) {
        console.error('Failed to check programs:', error);
    }
}

async function terminateProgram(pid) {
    if (!confirm(`確定要終止 PID ${pid} 的程式嗎？`)) return;

    try {
        const response = await fetch(`/terminate-program/${pid}`, {
            method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
            showNotification('程式已終止', 'success');
            checkRunningPrograms();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification(`錯誤: ${error}`, 'error');
    }
}

// ============================================
// 模態框控制
// ============================================
function showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('active');
}

function showMonitorModal() {
    const modal = document.getElementById('monitorModal');
    if (modal) modal.classList.add('active');
    checkRunningPrograms();
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// ============================================
// 通知系統
// ============================================
function showNotification(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        'success': '✓',
        'warning': '⚠',
        'error': '✕',
        'info': 'ℹ'
    };

    toast.innerHTML = `
        <span style="font-size: 18px; font-weight: bold;">${icons[type]}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}