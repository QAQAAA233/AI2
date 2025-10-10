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
let attachMemoryBundle = true;
let allProjects = [];
let modelConfig = null;
let sidebarCollapsed = false;
let MODEL_LIMITS = {};
let currentMemoryState = null;
let memoryStateByProject = {};
let selectedMemoryProjectPath = null;

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

    renderMemoryPanel();
    updateMemoryBundleStatus();
    const memoryMenuItem = document.getElementById('memoryMenuItem');
    if (memoryMenuItem && attachMemoryBundle) {
        memoryMenuItem.classList.add('active');
    }
    
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

function toggleAttachMemoryBundle() {
    attachMemoryBundle = !attachMemoryBundle;
    const menuItem = document.getElementById('memoryMenuItem');
    if (menuItem) {
        if (attachMemoryBundle) {
            menuItem.classList.add('active');
            showNotification('已啟用自動附帶上一輪長短期記憶、專案目標與改進建議', 'success');
        } else {
            menuItem.classList.remove('active');
            showNotification('已關閉自動附帶記憶與改進建議', 'info');
        }
    }
    updateMemoryBundleStatus();
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
    document.getElementById('resultsContainer').style.display = 'block';

    const attachmentsForDisplay = uploadedFiles.map(file => ({
        name: file.name,
        type: file.type,
        size: file.size
    }));

    const userMessageElement = addMessage({
        role: 'user',
        content: prompt,
        files: attachmentsForDisplay
    });

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
                attach_terminal: attachTerminal,
                include_memory_bundle: attachMemoryBundle
            })
        });

        const result = await response.json();

        if (result.request_terminal_output && userMessageElement) {
            setMessageTerminal(userMessageElement, result.request_terminal_output, 'user');
        }

        if (result.success) {
            addMessage({
                role: 'assistant',
                content: result.output,
                usageMetadata: result.usage_metadata,
                terminalOutput: result.terminal_output,
                files: result.generated_attachments || []
            });

            if (result.memory_state) {
                setCurrentMemoryState(result.memory_state);
            } else if (currentProjectDir) {
                updateMemoryCache(currentProjectDir, currentMemoryState);
                renderMemoryPanel();
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
                }
            }

            showNotification(result.is_iteration ? '專案迭代成功!' : '專案創建成功!', 'success');
            
            loadProjectsList();
            uploadedFiles = [];
            updateFilesPreview();
            updateAttachedFilesDisplay();
        } else {
            addMessage({
                role: 'assistant',
                content: `✕ 執行失敗：${result.error || result.output}`
            });
            showNotification(`執行失敗：${result.error}`, 'error');
        }
    } catch (error) {
        addMessage({
            role: 'assistant',
            content: `✕ 連接錯誤：${error}`
        });
        showNotification(`連接錯誤：${error}`, 'error');
    } finally {
        hideLoading();
    }
}

function getAttachmentIcon(file) {
    const name = (file?.name || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';

    if (["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp"].includes(ext)) return '🖼️';
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return '🎞️';
    if (["mp3", "wav", "flac", "aac"].includes(ext)) return '🎵';
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return '🗜️';
    if (["pdf"].includes(ext)) return '📕';
    if (["py", "js", "ts", "java", "cpp", "c", "go", "rs", "rb", "php", "swift", "kt", "sql", "sh"].includes(ext)) return '💻';
    if (["html", "css", "json", "md", "txt", "yml", "yaml", "xml", "csv"].includes(ext)) return '📄';
    return '📎';
}

function formatFileSize(size) {
    if (typeof size !== 'number' || isNaN(size) || size <= 0) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentStatusLabel(status) {
    if (!status) return '';
    const normalized = String(status).toLowerCase();
    if (normalized === 'created') return '新建';
    if (normalized === 'updated') return '更新';
    if (normalized === 'unchanged') return '未變更';
    return status;
}

function setMessageTerminal(messageElement, terminalText, role = 'user') {
    if (!messageElement) return;

    const existingSection = messageElement.querySelector('.terminal-output-section');
    if (!terminalText || !terminalText.trim()) {
        if (existingSection) existingSection.remove();
        return;
    }

    const section = existingSection || document.createElement('div');
    section.className = 'terminal-output-section';

    let header = section.querySelector('.terminal-header');
    if (!header) {
        header = document.createElement('div');
        header.className = 'terminal-header';
        section.appendChild(header);
    } else {
        header.innerHTML = '';
    }

    const title = document.createElement('span');
    title.className = 'terminal-title';
    title.textContent = role === 'assistant' ? '程式執行輸出' : 'Terminal 輸出';
    header.appendChild(title);

    let body = section.querySelector('.terminal-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'terminal-body selectable';
        section.appendChild(body);
    }
    body.textContent = terminalText.trim();

    if (!existingSection) {
        messageElement.appendChild(section);
    }
}

function addMessage({
    role,
    content,
    usageMetadata = null,
    terminalOutput = null,
    files = [],
    metadata = null,
    timestamp = null
}) {
    const container = document.getElementById('resultsContainer');
    if (!container) return null;

    const message = document.createElement('div');
    message.className = `result-message ${role} selectable`;
    message.dataset.role = role;
    if (timestamp) {
        message.dataset.timestamp = timestamp;
    }

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

    if (files && files.length) {
        const attachmentsSection = document.createElement('div');
        attachmentsSection.className = 'message-attachments';

        const attachmentsHeader = document.createElement('div');
        attachmentsHeader.className = 'attachments-header';
        attachmentsHeader.textContent = `附加檔案 (${files.length})`;
        attachmentsSection.appendChild(attachmentsHeader);

        const attachmentsList = document.createElement('div');
        attachmentsList.className = 'attachments-list';

        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'attachment-item';

            const icon = document.createElement('span');
            icon.className = 'attachment-icon';
            icon.textContent = getAttachmentIcon(file);

            const name = document.createElement('span');
            name.className = 'attachment-name';
            name.textContent = file?.name || '未命名檔案';
            if (file?.description) {
                name.title = `${file.name}｜${file.description}`;
            }

            const statusText = getAttachmentStatusLabel(file?.status);
            let statusBadge = null;
            if (statusText) {
                statusBadge = document.createElement('span');
                const statusClass = typeof file?.status === 'string' ? file.status.toLowerCase() : '';
                statusBadge.className = `attachment-status${statusClass ? ` status-${statusClass}` : ''}`;
                statusBadge.textContent = statusText;
            }

            const sizeLabel = document.createElement('span');
            sizeLabel.className = 'attachment-size';
            sizeLabel.textContent = formatFileSize(file?.size);

            item.appendChild(icon);
            item.appendChild(name);
            if (statusBadge) {
                item.appendChild(statusBadge);
            }
            if (sizeLabel.textContent) {
                item.appendChild(sizeLabel);
            }

            attachmentsList.appendChild(item);
        });

        attachmentsSection.appendChild(attachmentsList);
        message.appendChild(attachmentsSection);
    }

    if (terminalOutput && terminalOutput.trim()) {
        setMessageTerminal(message, terminalOutput, role);
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

    container.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth' });
    return message;
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
            selectedMemoryProjectPath = currentProjectDir;

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
            document.getElementById('resultsContainer').style.display = 'block';
            document.getElementById('resultsContainer').innerHTML = '';

            setCurrentMemoryState(null);

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
            selectedMemoryProjectPath = currentProjectDir;
            
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

                setCurrentMemoryState(null);
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
            allProjects = Array.isArray(result.projects) ? result.projects : [];
            allProjects.forEach(project => {
                if (!project || !project.path) return;
                const payload = Object.prototype.hasOwnProperty.call(project, 'memory_state')
                    ? project.memory_state
                    : memoryStateByProject[project.path] || null;
                updateMemoryCache(project.path, payload);
            });

            if (currentProjectDir && typeof memoryStateByProject[currentProjectDir] === 'undefined') {
                updateMemoryCache(currentProjectDir, currentMemoryState);
            }

            if (!selectedMemoryProjectPath && allProjects.length > 0) {
                selectedMemoryProjectPath = allProjects[0].path;
            }

            renderMemoryPanel();
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
    selectedMemoryProjectPath = project.path;

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
    document.getElementById('resultsContainer').style.display = 'block';
    document.getElementById('resultsContainer').innerHTML = '';
    
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

            setCurrentMemoryState(result.memory_state || null);

            if (result.conversation && result.conversation.messages) {
                const container = document.getElementById('resultsContainer');
                if (container) {
                    container.innerHTML = '';

                    for (const msg of result.conversation.messages) {
                        addMessage({
                            role: msg.role,
                            content: msg.content,
                            usageMetadata: msg.usage_metadata,
                            terminalOutput: msg.terminal_output,
                            files: msg.files || [],
                            metadata: msg.metadata || null,
                            timestamp: msg.timestamp
                        });
                    }
                }
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

// ============================================
// 記憶面板顯示
// ============================================
function updateMemoryBundleStatus() {
    const statusEl = document.getElementById('memoryBundleStatus');
    if (!statusEl) return;
    statusEl.textContent = attachMemoryBundle ? '自動附帶上一輪記憶：開啟' : '自動附帶上一輪記憶：關閉';
    statusEl.classList.toggle('disabled', !attachMemoryBundle);
}

function updateMemoryCache(projectPath, state) {
    if (!projectPath) return;
    memoryStateByProject[projectPath] = state ? JSON.parse(JSON.stringify(state)) : null;
}

function getProjectNameForMemory(projectPath, memory) {
    if (!projectPath) {
        return '未選擇專案';
    }
    const project = (allProjects || []).find(p => p.path === projectPath);
    if (project && project.name) {
        return project.name;
    }
    if (currentProjectDir === projectPath && currentProject && currentProject.name) {
        return currentProject.name;
    }
    if (memory && (memory.project_name || memory['project_name'])) {
        return memory.project_name || memory['project_name'];
    }
    const parts = projectPath.split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : projectPath;
}

function getMemoryScore(memory) {
    if (!memory) return '--';
    const raw = memory.score ?? memory['評分'];
    if (typeof raw === 'number' && !Number.isNaN(raw)) {
        return raw;
    }
    if (typeof raw === 'string' && raw.trim()) {
        return raw.trim();
    }
    return '--';
}

function renderMemoryGoals(container, goals) {
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(goals) || goals.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'memory-empty-text';
        empty.textContent = '尚未建立專案目標';
        container.appendChild(empty);
        return;
    }

    goals.forEach(goal => {
        const item = document.createElement('div');
        const rawCurrent = goal['是否為當前任務'] ?? goal.current ?? false;
        const isCurrent = typeof rawCurrent === 'string'
            ? ['true', '1', 'yes', 'y'].includes(rawCurrent.toLowerCase())
            : Boolean(rawCurrent);
        item.className = `memory-goal-item${isCurrent ? ' current' : ''}`;

        const step = goal['步驟'] ?? goal.step ?? '';
        const task = goal['任務'] ?? goal.task ?? '';
        const status = goal['狀態'] ?? goal.status ?? '未設定狀態';

        const title = document.createElement('div');
        title.className = 'memory-goal-title';
        title.textContent = step ? `步驟 ${step}: ${task}` : (task || '未設定任務');

        const statusEl = document.createElement('div');
        statusEl.className = 'memory-goal-status';
        statusEl.textContent = status;

        item.appendChild(title);
        item.appendChild(statusEl);
        container.appendChild(item);
    });
}

function renderMemoryDetail(projectPath) {
    const scoreEl = document.getElementById('memoryDetailScore');
    const nameEl = document.getElementById('memoryDetailProjectName');
    const updatedEl = document.getElementById('memoryDetailUpdated');
    const evaluationEl = document.getElementById('memoryDetailEvaluation');
    const deductionEl = document.getElementById('memoryDetailDeduction');
    const improvementEl = document.getElementById('memoryDetailImprovement');
    const summaryEl = document.getElementById('memoryDetailSummary');
    const stmEl = document.getElementById('memoryDetailSTM');
    const ltmEl = document.getElementById('memoryDetailLTM');
    const goalsEl = document.getElementById('memoryDetailGoals');

    const memory = projectPath ? memoryStateByProject[projectPath] : null;
    const thinking = memory ? (memory['核心記憶模塊'] || memory.thinking_module || {}) : {};

    if (nameEl) {
        nameEl.textContent = getProjectNameForMemory(projectPath, memory);
    }

    if (scoreEl) {
        scoreEl.textContent = getMemoryScore(memory);
    }

    if (updatedEl) {
        const updatedText = memory && memory.updated_at
            ? `更新時間：${new Date(memory.updated_at).toLocaleString('zh-TW')}`
            : '尚未更新';
        updatedEl.textContent = updatedText;
    }

    if (evaluationEl) {
        evaluationEl.textContent = memory ? (memory.evaluation || memory['內容評價'] || '尚未產生評估資料') : '尚未產生評估資料';
    }

    if (deductionEl) {
        deductionEl.textContent = memory ? (memory.deduction_reason || memory['扣分原因'] || '無') : '無';
    }

    if (improvementEl) {
        improvementEl.textContent = memory ? (memory.improvement || memory['改進建議'] || '尚未提供改進建議') : '尚未提供改進建議';
    }

    if (summaryEl) {
        summaryEl.textContent = thinking['專案總結'] || '尚未建立專案摘要';
    }

    if (stmEl) {
        stmEl.textContent = thinking['短期記憶'] || thinking['短期記憶 (STM)'] || '尚無短期記憶';
    }

    if (ltmEl) {
        ltmEl.textContent = thinking['長期記憶'] || thinking['長期記憶 (LTM)'] || '尚無長期記憶';
    }

    renderMemoryGoals(goalsEl, thinking['專案目標']);
}

function renderMemoryPanel() {
    const panel = document.getElementById('memoryPanel');
    const listEl = document.getElementById('memoryProjectsList');
    if (!panel || !listEl) return;

    const entries = [];
    const seen = new Set();

    if (Array.isArray(allProjects)) {
        allProjects.forEach(project => {
            if (!project || !project.path) return;
            const cached = memoryStateByProject[project.path];
            const payload = project.memory_state ?? cached ?? null;
            updateMemoryCache(project.path, payload);
            seen.add(project.path);
            entries.push({
                path: project.path,
                name: project.name || getProjectNameForMemory(project.path, payload),
                memory: memoryStateByProject[project.path]
            });
        });
    }

    Object.keys(memoryStateByProject || {}).forEach(path => {
        if (seen.has(path)) return;
        seen.add(path);
        entries.push({
            path,
            name: getProjectNameForMemory(path, memoryStateByProject[path]),
            memory: memoryStateByProject[path]
        });
    });

    if (currentProjectDir && !seen.has(currentProjectDir)) {
        entries.unshift({
            path: currentProjectDir,
            name: getProjectNameForMemory(currentProjectDir, currentMemoryState),
            memory: currentMemoryState
        });
        seen.add(currentProjectDir);
    }

    if (!selectedMemoryProjectPath || !entries.some(entry => entry.path === selectedMemoryProjectPath)) {
        selectedMemoryProjectPath = entries.length > 0 ? entries[0].path : null;
    }

    if (entries.length === 0) {
        panel.classList.add('memory-empty');
        listEl.innerHTML = '<div class="memory-empty-text">尚未載入任何專案記憶</div>';
    } else {
        panel.classList.remove('memory-empty');
        listEl.innerHTML = '';
        entries.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'memory-project-item';
            if (entry.path === selectedMemoryProjectPath) {
                item.classList.add('active');
            }

            const header = document.createElement('div');
            header.className = 'memory-project-item-header';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'memory-project-name';
            nameSpan.textContent = entry.name;
            nameSpan.title = entry.name;

            const scoreSpan = document.createElement('span');
            scoreSpan.className = 'memory-project-score';
            scoreSpan.textContent = getMemoryScore(entry.memory);

            header.appendChild(nameSpan);
            header.appendChild(scoreSpan);
            item.appendChild(header);

            const body = document.createElement('div');
            body.className = 'memory-project-item-body';

            const tipSpan = document.createElement('span');
            const improvement = entry.memory ? (entry.memory['改進建議'] || entry.memory.improvement || '') : '';
            const improvementText = improvement && typeof improvement === 'string' ? improvement.trim() : '';
            tipSpan.className = 'memory-project-tip' + (improvementText ? '' : ' muted');
            tipSpan.textContent = improvementText || '尚無改進建議';

            body.appendChild(tipSpan);
            item.appendChild(body);

            item.onclick = () => {
                selectedMemoryProjectPath = entry.path;
                renderMemoryPanel();
            };

            listEl.appendChild(item);
        });
    }

    renderMemoryDetail(selectedMemoryProjectPath);

    const toggleIcon = document.getElementById('memoryPanelToggleIcon');
    if (toggleIcon && !panel.classList.contains('collapsed')) {
        toggleIcon.textContent = '⮜';
    }
}

function setCurrentMemoryState(state) {
    currentMemoryState = state || null;
    if (currentProjectDir) {
        updateMemoryCache(currentProjectDir, currentMemoryState);
    }
    renderMemoryPanel();
}

function toggleMemoryPanel() {
    const panel = document.getElementById('memoryPanel');
    const toggle = document.getElementById('memoryPanelToggleIcon');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    if (toggle) {
        toggle.textContent = panel.classList.contains('collapsed') ? '⮞' : '⮜';
    }
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
            delete memoryStateByProject[projectPath];
            if (selectedMemoryProjectPath === projectPath) {
                selectedMemoryProjectPath = null;
            }
            renderMemoryPanel();

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
    document.getElementById('resultsContainer').style.display = 'none';
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('projectStructureSection').style.display = 'none';
    document.getElementById('homeBtn').style.display = 'none';

    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });

    updateFilesPreview();
    updateAttachedFilesDisplay();

    selectedMemoryProjectPath = allProjects.length > 0 ? allProjects[0].path : null;
    setCurrentMemoryState(null);

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