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
let projectMemories = {};
let latestProjectMemory = null;
let memoryPanelCollapsed = true;
let previewMemoryPath = null;

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
// 對話與記憶面板控制
// ============================================
function showConversationArea() {
    const area = document.getElementById('conversationArea');
    const results = document.getElementById('resultsContainer');
    if (area) area.style.display = 'flex';
    if (results) results.style.display = 'block';
}

function hideConversationArea(clear = false) {
    const area = document.getElementById('conversationArea');
    const results = document.getElementById('resultsContainer');
    if (results) {
        results.style.display = 'none';
        if (clear) {
            results.innerHTML = '';
        }
    }
    if (area) {
        area.style.display = 'none';
    }
}

function storeProjectMemory(projectPath, evaluation) {
    if (!projectPath || !evaluation) return;

    projectMemories[projectPath] = evaluation;

    if (projectPath === currentProjectDir) {
        latestProjectMemory = evaluation;
    }

    if (!previewMemoryPath) {
        previewMemoryPath = projectPath;
    }

    if (previewMemoryPath === projectPath) {
        renderMemoryPanel(evaluation, projectPath);
    } else {
        renderMemoryProjects();
    }
}

function applyStoredMemory(projectPath) {
    if (!projectPath) return;

    const memory = projectMemories[projectPath] || null;
    if (projectPath === currentProjectDir) {
        latestProjectMemory = memory;
    }

    if (!previewMemoryPath) {
        previewMemoryPath = projectPath;
    }

    if (previewMemoryPath === projectPath) {
        renderMemoryPanel(memory, projectPath);
    } else {
        renderMemoryProjects();
    }
}

function resolveMemoryField(source, keys) {
    if (!source) return null;
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(source, key) && source[key]) {
            return source[key];
        }
    }
    return null;
}

function normalizeGoalFlag(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        return ['true', '1', 'yes', 'y', '是', '當前', '目前'].includes(value.trim().toLowerCase());
    }
    return false;
}

function renderMemoryPanel(memory, sourcePath = null) {
    const panel = document.getElementById('memoryPanel');
    const scoreEl = document.getElementById('memoryScore');
    const feedbackEl = document.getElementById('memoryFeedback');
    const deductionEl = document.getElementById('memoryDeduction');
    const adviceEl = document.getElementById('memoryAdvice');
    const summaryEl = document.getElementById('memorySummary');
    const stmEl = document.getElementById('memorySTM');
    const ltmEl = document.getElementById('memoryLTM');
    const goalsContainer = document.getElementById('memoryGoals');
    const emptyState = document.getElementById('memoryEmpty');
    const evaluationSection = document.getElementById('memoryEvaluationSection');
    const coreSection = document.getElementById('memoryCoreSection');
    const projectLabel = document.getElementById('memoryPanelProject');

    if (!panel || !scoreEl || !feedbackEl || !deductionEl || !adviceEl || !summaryEl || !stmEl || !ltmEl || !goalsContainer || !emptyState || !evaluationSection || !coreSection || !projectLabel) {
        return;
    }

    if (sourcePath) {
        previewMemoryPath = sourcePath;
    } else if (!previewMemoryPath && currentProjectDir) {
        previewMemoryPath = currentProjectDir;
    }

    const activePath = previewMemoryPath;
    let activeMemory = memory;

    if ((!activeMemory || Object.keys(activeMemory || {}).length === 0) && activePath && projectMemories[activePath]) {
        activeMemory = projectMemories[activePath];
    }

    if (activePath) {
        const projectInfo = allProjects.find(project => project.path === activePath);
        if (projectInfo && projectInfo.name) {
            projectLabel.textContent = projectInfo.name;
        } else {
            const pathParts = activePath.split(/[\\/]/).filter(Boolean);
            projectLabel.textContent = pathParts[pathParts.length - 1] || '未命名專案';
        }
    } else {
        projectLabel.textContent = '尚未選擇專案';
    }

    if (activeMemory && Object.keys(activeMemory).length > 0) {
        const scoreValue = typeof activeMemory['評分'] === 'number' ? `${activeMemory['評分']} 分` : (activeMemory['評分'] || '--');
        scoreEl.textContent = scoreValue;
        feedbackEl.textContent = activeMemory['內容評價'] || '尚未提供內容評價。';
        deductionEl.textContent = `扣分原因：${activeMemory['扣分原因'] || '無'}`;
        adviceEl.textContent = `改進建議：${activeMemory['改進建議'] || '無'}`;

        const core = activeMemory['核心記憶模塊'] || {};
        summaryEl.textContent = resolveMemoryField(core, ['專案總結']) || '尚未提供專案總結。';
        stmEl.textContent = resolveMemoryField(core, ['短期記憶', '短期記憶 (STM)', '短期記憶( STM )', '短期記憶(STM)']) || '尚未提供短期記憶。';
        ltmEl.textContent = resolveMemoryField(core, ['長期記憶', '長期記憶 (LTM)', '長期記憶( LTM )', '長期記憶(LTM)']) || '尚未提供長期記憶。';

        goalsContainer.innerHTML = '';
        const goals = Array.isArray(core['專案目標']) ? core['專案目標'] : [];
        if (goals.length > 0) {
            goals.forEach(goal => {
                const goalItem = document.createElement('div');
                goalItem.className = 'memory-goal-item';
                if (normalizeGoalFlag(goal?.['是否為當前任務'])) {
                    goalItem.classList.add('active');
                }

                const step = document.createElement('span');
                step.className = 'memory-goal-step';
                const stepValue = goal?.['步驟'] != null ? goal['步驟'] : '?';
                step.textContent = `步驟 ${stepValue}`;

                const task = document.createElement('div');
                task.className = 'memory-goal-task';
                task.textContent = goal?.['任務'] || '未設定任務內容';

                const status = document.createElement('span');
                status.className = 'memory-goal-status';
                status.textContent = goal?.['狀態'] || '未開始';

                goalItem.appendChild(step);
                goalItem.appendChild(task);
                goalItem.appendChild(status);
                goalsContainer.appendChild(goalItem);
            });
        } else {
            const emptyGoal = document.createElement('div');
            emptyGoal.className = 'memory-goal-empty';
            emptyGoal.textContent = '尚未設定專案目標。';
            goalsContainer.appendChild(emptyGoal);
        }

        emptyState.style.display = 'none';
        evaluationSection.style.display = 'block';
        coreSection.style.display = 'block';
        panel.classList.remove('memory-empty-state');
    } else {
        scoreEl.textContent = '--';
        feedbackEl.textContent = '尚未產生評分資訊。';
        deductionEl.textContent = '扣分原因：--';
        adviceEl.textContent = '改進建議：--';
        summaryEl.textContent = '--';
        stmEl.textContent = '--';
        ltmEl.textContent = '--';
        goalsContainer.innerHTML = '<div class="memory-goal-empty">尚未設定專案目標。</div>';
        emptyState.style.display = 'flex';
        evaluationSection.style.display = 'none';
        coreSection.style.display = 'none';
        panel.classList.add('memory-empty-state');
    }

    if (memoryPanelCollapsed) {
        panel.classList.add('collapsed');
    } else {
        panel.classList.remove('collapsed');
    }

    updateMemoryToggleIcon();
    renderMemoryProjects();
}

function renderMemoryProjects() {
    const section = document.getElementById('memoryProjectsSection');
    const list = document.getElementById('memoryProjectList');
    if (!section || !list) return;

    const entries = Object.entries(projectMemories).filter(([, value]) => value && Object.keys(value).length > 0);

    if (entries.length === 0) {
        section.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    section.style.display = 'flex';
    list.innerHTML = '';

    const orderedPaths = [];
    if (Array.isArray(allProjects) && allProjects.length > 0) {
        allProjects.forEach(project => {
            if (projectMemories[project.path]) {
                orderedPaths.push(project.path);
            }
        });
    }
    entries.forEach(([path]) => {
        if (!orderedPaths.includes(path)) {
            orderedPaths.push(path);
        }
    });

    orderedPaths.forEach(path => {
        const evaluation = projectMemories[path];
        if (!evaluation) return;

        const item = document.createElement('div');
        item.className = 'memory-project-item';
        if (path === previewMemoryPath) {
            item.classList.add('active');
        }

        const header = document.createElement('div');
        header.className = 'memory-project-item-header';

        const info = document.createElement('div');
        info.className = 'memory-project-info';

        const title = document.createElement('div');
        title.className = 'memory-project-item-title';
        const projectInfo = allProjects.find(project => project.path === path);
        const projectName = projectInfo?.name || (path ? path.split(/[\\/]/).pop() : '未命名專案');
        title.textContent = projectName;

        const desc = document.createElement('div');
        desc.className = 'memory-project-item-desc';
        desc.textContent = projectInfo?.description || '無描述';

        info.appendChild(title);
        info.appendChild(desc);

        const score = document.createElement('div');
        score.className = 'memory-project-item-score';
        const rawScore = evaluation['評分'];
        score.textContent = typeof rawScore === 'number' ? `${rawScore} 分` : (rawScore || '--');

        header.appendChild(info);
        header.appendChild(score);

        const summary = document.createElement('div');
        summary.className = 'memory-project-item-summary';
        summary.textContent = evaluation['內容評價'] || '尚未提供內容評價。';

        const actions = document.createElement('div');
        actions.className = 'memory-project-item-actions';

        const previewBtn = document.createElement('button');
        previewBtn.className = 'memory-project-preview-btn';
        previewBtn.textContent = '檢視記憶';
        previewBtn.onclick = (event) => {
            event.stopPropagation();
            previewMemoryForProject(path);
        };

        actions.appendChild(previewBtn);

        if (path === currentProjectDir) {
            const badge = document.createElement('span');
            badge.className = 'memory-project-current';
            badge.textContent = '目前專案';
            actions.appendChild(badge);
        } else {
            const switchBtn = document.createElement('button');
            switchBtn.className = 'memory-project-switch-btn';
            switchBtn.textContent = '切換專案';
            switchBtn.onclick = (event) => {
                event.stopPropagation();
                const projectObj = allProjects.find(project => project.path === path);
                if (projectObj) {
                    selectProject(projectObj);
                } else {
                    showNotification('專案列表中找不到此專案', 'warning');
                }
            };
            actions.appendChild(switchBtn);
        }

        item.appendChild(header);
        item.appendChild(summary);
        item.appendChild(actions);

        item.onclick = () => previewMemoryForProject(path);

        list.appendChild(item);
    });
}

function previewMemoryForProject(path) {
    if (!path) return;
    const memory = projectMemories[path];
    if (!memory) {
        showNotification('此專案尚未生成記憶資料', 'info');
        return;
    }

    renderMemoryPanel(memory, path);
}

function toggleMemoryPanel() {
    const panel = document.getElementById('memoryPanel');
    if (!panel) return;
    memoryPanelCollapsed = !memoryPanelCollapsed;
    if (memoryPanelCollapsed) {
        panel.classList.add('collapsed');
    } else {
        panel.classList.remove('collapsed');
    }
    updateMemoryToggleIcon();
}

function updateMemoryToggleIcon() {
    const icon = document.getElementById('memoryToggleIcon');
    if (!icon) return;
    icon.textContent = memoryPanelCollapsed ? '◀' : '▶';
}

function insertPreviousMemory() {
    togglePlusMenu();

    if (!currentProjectDir) {
        showNotification('請先選擇或創建專案後再插入記憶', 'warning');
        return;
    }

    if (!latestProjectMemory) {
        showNotification('目前沒有上一輪的記憶資料可以插入', 'warning');
        return;
    }

    const input = document.getElementById('mainInput');
    if (!input) return;

    const memoryText = buildMemoryInsertText(latestProjectMemory);
    const hasContent = input.value.trim().length > 0;
    input.value = hasContent ? `${input.value.trimEnd()}\n\n${memoryText}\n` : `${memoryText}\n`;
    autoResize(input);
    updateSubmitButton();
    showNotification('已插入上一輪記憶與建議', 'success');
}

function buildMemoryInsertText(memory) {
    const lines = [];
    const scoreValue = typeof memory['評分'] === 'number' ? `${memory['評分']} 分` : (memory['評分'] || '未提供');
    lines.push(`上一輪評分：${scoreValue}`);
    lines.push(`扣分原因：${memory['扣分原因'] || '無'}`);
    lines.push(`上一輪改進建議：${memory['改進建議'] || '無'}`);

    const core = memory['核心記憶模塊'] || {};
    lines.push('【上一輪記憶摘要】');
    lines.push(`專案總結：${resolveMemoryField(core, ['專案總結']) || '無'}`);
    lines.push(`短期記憶：${resolveMemoryField(core, ['短期記憶', '短期記憶 (STM)', '短期記憶( STM )', '短期記憶(STM)']) || '無'}`);
    lines.push(`長期記憶：${resolveMemoryField(core, ['長期記憶', '長期記憶 (LTM)', '長期記憶( LTM )', '長期記憶(LTM)']) || '無'}`);

    lines.push('【專案目標】');
    const goals = Array.isArray(core['專案目標']) ? core['專案目標'] : [];
    if (goals.length > 0) {
        goals.forEach(goal => {
            const step = goal && goal['步驟'] != null ? goal['步驟'] : '?';
            const task = goal && goal['任務'] ? goal['任務'] : '未設定任務';
            const status = goal && goal['狀態'] ? goal['狀態'] : '未開始';
            const focus = normalizeGoalFlag(goal?.['是否為當前任務']) ? '（當前重點）' : '';
            lines.push(`步驟 ${step}: ${task} - 狀態：${status}${focus}`);
        });
    } else {
        lines.push('尚未設定專案目標。');
    }

    return lines.join('\n');
}

function getFileIcon(filename = '') {
    const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
    const imageExt = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp'];
    if (ext === 'py') return '🐍';
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return '🟨';
    if (['html', 'htm'].includes(ext)) return '🌐';
    if (ext === 'css') return '🎨';
    if (ext === 'json') return '🗂️';
    if (['md', 'txt', 'rtf'].includes(ext)) return '📝';
    if (['yml', 'yaml'].includes(ext)) return '📘';
    if (['pdf'].includes(ext)) return '📕';
    if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
    if (imageExt.includes(ext)) return '🖼️';
    return '📎';
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

    const messageFiles = uploadedFiles.map(file => ({
        name: file.name,
        type: file.type || 'text/plain'
    }));

    const userMessageElement = addMessage('user', prompt, null, null, messageFiles);

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
            if (userMessageElement && result.user_terminal_output) {
                appendTerminalOutputToMessage(userMessageElement, result.user_terminal_output, 'user');
            }
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
                    previewMemoryPath = currentProjectDir;
                    renderMemoryPanel(projectMemories[currentProjectDir] || null, currentProjectDir);
                    renderMemoryProjects();
                }
            }

            addMessage('assistant', result.output, result.usage_metadata, result.terminal_output, null, result.evaluation);

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
    }
}

function addMessage(role, content, usageMetadata = null, terminalOutput = null, files = null, evaluation = null) {
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

    if (Array.isArray(files) && files.length > 0) {
        const attachmentsSection = document.createElement('div');
        attachmentsSection.className = 'attachments-section';

        const title = document.createElement('div');
        title.className = 'attachments-title';
        title.textContent = '附加檔案';
        attachmentsSection.appendChild(title);

        const list = document.createElement('div');
        list.className = 'attachments-list';

        files.forEach(file => {
            if (!file) return;
            const chip = document.createElement('div');
            chip.className = 'attachment-chip';

            const icon = document.createElement('span');
            icon.className = 'attachment-icon';
            const fileName = file.name || file.filename || '未命名檔案';
            const fileType = file.type || file.filetype || '';
            icon.textContent = getFileIcon(fileName);

            const name = document.createElement('span');
            name.className = 'attachment-name';
            name.textContent = fileName;

            chip.title = fileType ? `${fileName} (${fileType})` : fileName;

            chip.appendChild(icon);
            chip.appendChild(name);
            list.appendChild(chip);
        });

        attachmentsSection.appendChild(list);
        message.appendChild(attachmentsSection);
    }

    appendTerminalOutputToMessage(message, terminalOutput, role);

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

    if (role === 'assistant' && evaluation) {
        const evaluationPreview = document.createElement('div');
        evaluationPreview.className = 'evaluation-preview';

        const scoreValue = typeof evaluation['評分'] === 'number'
            ? `${evaluation['評分']} 分`
            : (evaluation['評分'] || '--');

        const score = document.createElement('div');
        score.className = 'evaluation-score';
        score.textContent = scoreValue;

        const summary = document.createElement('div');
        summary.className = 'evaluation-summary';
        summary.textContent = evaluation['內容評價'] || '尚無評語';

        evaluationPreview.appendChild(score);
        evaluationPreview.appendChild(summary);
        message.appendChild(evaluationPreview);
    }

    container.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth' });

    if (role === 'assistant' && evaluation && currentProjectDir) {
        storeProjectMemory(currentProjectDir, evaluation);
    }

    return message;
}

function appendTerminalOutputToMessage(messageElement, terminalOutput, role = 'assistant') {
    if (!messageElement || !terminalOutput || !terminalOutput.trim()) {
        return;
    }

    let section = messageElement.querySelector('.terminal-output-section');
    const titleText = role === 'user' ? 'Terminal 輸出 (已附加)' : 'Terminal 輸出';

    if (!section) {
        section = document.createElement('div');
        section.className = 'terminal-output-section';

        const header = document.createElement('div');
        header.className = 'terminal-header';

        const title = document.createElement('span');
        title.className = 'terminal-title';
        header.appendChild(title);

        const body = document.createElement('div');
        body.className = 'terminal-body selectable';

        section.appendChild(header);
        section.appendChild(body);
        messageElement.appendChild(section);
    }

    const titleElement = section.querySelector('.terminal-title');
    if (titleElement) {
        titleElement.textContent = titleText;
    }

    const bodyElement = section.querySelector('.terminal-body');
    if (bodyElement) {
        bodyElement.textContent = terminalOutput;
    }
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
            document.getElementById('resultsContainer').innerHTML = '';
            latestProjectMemory = null;
            memoryPanelCollapsed = true;
            previewMemoryPath = currentProjectDir;
            renderMemoryPanel(null, currentProjectDir);
            renderMemoryProjects();

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
                document.getElementById('resultsContainer').style.display = 'block';
                previewMemoryPath = currentProjectDir;
                applyStoredMemory(currentProjectDir);

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
            result.projects.forEach(project => {
                if (project.latest_evaluation) {
                    projectMemories[project.path] = project.latest_evaluation;
                }
            });
            displayProjectsList(allProjects);
            renderMemoryProjects();

            if (previewMemoryPath && projectMemories[previewMemoryPath]) {
                renderMemoryPanel(projectMemories[previewMemoryPath], previewMemoryPath);
            } else if (currentProjectDir && projectMemories[currentProjectDir]) {
                renderMemoryPanel(projectMemories[currentProjectDir], currentProjectDir);
            }
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
        item.dataset.path = project.path;

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
        
        item.onclick = () => selectProject(project, item);
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

async function selectProject(project, sourceElement = null) {
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
    
    const projectItems = document.querySelectorAll('.project-item');
    let matchedElement = sourceElement;
    projectItems.forEach(item => {
        item.classList.remove('active');
        if (!matchedElement && item.dataset && item.dataset.path === project.path) {
            matchedElement = item;
        }
    });
    if (matchedElement) {
        matchedElement.classList.add('active');
    }

    document.getElementById('emptyState').style.display = 'none';
    showConversationArea();
    document.getElementById('resultsContainer').innerHTML = '';
    previewMemoryPath = project.path;
    applyStoredMemory(project.path);

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
            showConversationArea();

            if (result.conversation && result.conversation.messages) {
                const container = document.getElementById('resultsContainer');
                if (container) {
                    container.innerHTML = '';

                    let evaluationFound = false;
                    for (const msg of result.conversation.messages) {
                        const evaluation = msg.metadata && msg.metadata.evaluation ? msg.metadata.evaluation : null;
                        if (evaluation) {
                            evaluationFound = true;
                        }
                        addMessage(msg.role, msg.content, msg.usage_metadata, msg.terminal_output, msg.files, evaluation);
                    }

                    if (result.latest_evaluation && !evaluationFound) {
                        storeProjectMemory(projectDir, result.latest_evaluation);
                    } else if (!evaluationFound) {
                        applyStoredMemory(projectDir);
                    }
                }
            } else if (result.latest_evaluation) {
                storeProjectMemory(projectDir, result.latest_evaluation);
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
            delete projectMemories[projectPath];
            if (previewMemoryPath === projectPath) {
                previewMemoryPath = currentProjectDir || null;
            }
            if (previewMemoryPath && projectMemories[previewMemoryPath]) {
                renderMemoryPanel(projectMemories[previewMemoryPath], previewMemoryPath);
            } else {
                renderMemoryPanel(currentProjectDir ? projectMemories[currentProjectDir] || null : null, currentProjectDir || null);
            }
            renderMemoryProjects();

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
    latestProjectMemory = null;
    memoryPanelCollapsed = true;
    previewMemoryPath = null;

    document.getElementById('currentProjectDisplay').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
    hideConversationArea(true);
    renderMemoryPanel(null, null);
    renderMemoryProjects();
    document.getElementById('projectStructureSection').style.display = 'none';
    document.getElementById('homeBtn').style.display = 'none';

    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });
    
    updateFilesPreview();
    updateAttachedFilesDisplay();
    
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