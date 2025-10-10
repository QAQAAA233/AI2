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
let conversationMemory = null;
let latestMemorySnapshot = null;

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
    clearMemoryPanel();
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

    const memoryWindow = document.getElementById('memoryWindow');
    if (memoryWindow) {
        memoryWindow.addEventListener('click', (event) => {
            if (event.target === memoryWindow) {
                closeMemoryWindow();
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

    const attachmentsForMessage = uploadedFiles.map(file => ({
        name: file.name,
        type: file.type,
        size: file.size
    }));

    addMessage('user', prompt, null, null, attachmentsForMessage, {
        timestamp: new Date().toISOString()
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
                attach_terminal: attachTerminal
            })
        });

        const result = await response.json();

        if (result.success) {
            addMessage('assistant', result.output, result.usage_metadata, result.terminal_output, null, {
                timestamp: new Date().toISOString()
            });

            if ('memory' in result) {
                if (result.memory) {
                    updateMemoryPanel(result.memory);
                } else {
                    clearMemoryPanel();
                }
            }

            if (result.new_memory_snapshot) {
                showMemoryWindow(result.new_memory_snapshot);
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
            addMessage('assistant', `✕ 執行失敗：${result.error || result.output}`, null, result.terminal_output, null, {
                timestamp: new Date().toISOString()
            });
            showNotification(`執行失敗：${result.error}`, 'error');

            if ('memory' in result) {
                if (result.memory) {
                    updateMemoryPanel(result.memory);
                } else {
                    clearMemoryPanel();
                }
            }

            loadProjectsList();
        }
    } catch (error) {
        addMessage('assistant', `✕ 連接錯誤：${error}`, null, null, null, {
            timestamp: new Date().toISOString()
        });
        showNotification(`連接錯誤：${error}`, 'error');
    } finally {
        hideLoading();
    }
}

function addMessage(role, content, usageMetadata = null, terminalOutput = null, files = null, options = {}) {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    const message = document.createElement('div');
    message.className = `result-message ${role} selectable`;

    const header = document.createElement('div');
    header.className = 'message-header';

    const headerMain = document.createElement('div');
    headerMain.className = 'message-header-main';

    const avatar = document.createElement('div');
    avatar.className = `avatar ${role}`;
    avatar.textContent = role === 'user' ? 'U' : 'AI';

    const roleLabel = document.createElement('span');
    roleLabel.textContent = role === 'user' ? '您' : 'AI 助手';
    roleLabel.style.fontWeight = '500';

    headerMain.appendChild(avatar);
    headerMain.appendChild(roleLabel);
    header.appendChild(headerMain);

    const timestampValue = options.timestamp || new Date().toISOString();
    if (timestampValue) {
        const timeLabel = document.createElement('span');
        timeLabel.className = 'message-timestamp';
        timeLabel.textContent = formatTimestamp(timestampValue);
        header.appendChild(timeLabel);
    }

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content selectable';
    messageContent.textContent = content || '';

    message.appendChild(header);
    message.appendChild(messageContent);

    const attachmentSection = renderAttachments(files);
    if (attachmentSection) {
        message.appendChild(attachmentSection);
    }

    if (terminalOutput && terminalOutput.trim()) {
        const terminalSection = document.createElement('div');
        terminalSection.className = 'terminal-output-section';
        const terminalHeader = document.createElement('div');
        terminalHeader.className = 'terminal-header';
        const terminalTitle = document.createElement('span');
        terminalTitle.className = 'terminal-title';
        terminalTitle.textContent = role === 'user' ? 'Terminal 輸出 (提交時)' : 'Terminal 輸出';
        terminalHeader.appendChild(terminalTitle);

        const terminalBody = document.createElement('div');
        terminalBody.className = 'terminal-body selectable';
        terminalBody.textContent = terminalOutput;

        terminalSection.appendChild(terminalHeader);
        terminalSection.appendChild(terminalBody);
        message.appendChild(terminalSection);
    }

    // Token使用統計只顯示在AI回應中
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
            document.getElementById('resultsContainer').style.display = 'block';
            document.getElementById('resultsContainer').innerHTML = '';
            clearMemoryPanel();

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

            clearMemoryPanel();

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
            
            if (result.conversation && result.conversation.messages) {
                const container = document.getElementById('resultsContainer');
                if (container) {
                    container.innerHTML = '';

                    for (const msg of result.conversation.messages) {
                        addMessage(msg.role, msg.content, msg.usage_metadata, msg.terminal_output, msg.files, {
                            timestamp: msg.timestamp
                        });
                    }
                }
            }

            if (result.conversation.memory) {
                updateMemoryPanel(result.conversation.memory);
            } else {
                clearMemoryPanel();
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
    document.getElementById('resultsContainer').style.display = 'none';
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('projectStructureSection').style.display = 'none';
    document.getElementById('homeBtn').style.display = 'none';
    clearMemoryPanel();

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

// ============================================
// 共用工具函式
// ============================================

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return timestamp;
    }
    return date.toLocaleString('zh-TW', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function createAttachmentIcon(typeOrName) {
    const value = (typeOrName || '').toLowerCase();
    if (!value) return '📎';
    if (value.includes('image') || value.match(/\.(png|jpg|jpeg|gif|svg)$/)) return '🖼️';
    if (value.includes('pdf') || value.endsWith('.pdf')) return '📄';
    if (value.includes('zip') || value.includes('rar') || value.endsWith('.zip')) return '🗜️';
    if (value.includes('code') || value.match(/\.(py|js|ts|html|css|json|sql|java|cpp|md)$/)) return '💻';
    if (value.includes('text') || value.endsWith('.txt')) return '📝';
    return '📎';
}

function renderAttachments(files) {
    if (!Array.isArray(files) || files.length === 0) {
        return null;
    }

    const container = document.createElement('div');
    container.className = 'attachment-section';

    const title = document.createElement('div');
    title.className = 'attachment-title';
    title.textContent = `附加檔案 (${files.length})`;
    container.appendChild(title);

    const list = document.createElement('div');
    list.className = 'attachment-list';

    files.forEach(file => {
        if (!file) return;
        const item = document.createElement('div');
        item.className = 'attachment-item';

        const icon = document.createElement('span');
        icon.className = 'attachment-icon';
        icon.textContent = createAttachmentIcon(file.type || file.name || file.mime);

        const name = document.createElement('span');
        name.className = 'attachment-name';
        name.textContent = file.name || '未命名檔案';

        item.appendChild(icon);
        item.appendChild(name);

        if (file.size) {
            const size = document.createElement('span');
            size.className = 'attachment-size';
            const kb = Math.max(1, Math.round(file.size / 1024));
            size.textContent = `${kb} KB`;
            item.appendChild(size);
        }

        list.appendChild(item);
    });

    container.appendChild(list);
    return container;
}

function clearMemoryPanel() {
    conversationMemory = null;
    latestMemorySnapshot = null;

    const panel = document.getElementById('memoryPanel');
    const longList = document.getElementById('longTermMemoryList');
    const shortList = document.getElementById('shortTermMemoryList');
    const stats = document.getElementById('memoryStats');

    if (panel) {
        panel.style.display = 'none';
        panel.classList.remove('memory-alert');
    }
    if (stats) {
        stats.textContent = '';
    }
    if (longList) {
        longList.innerHTML = '';
        longList.classList.add('empty');
        longList.textContent = '尚無長期記憶摘要';
    }
    if (shortList) {
        shortList.innerHTML = '';
        shortList.classList.add('empty');
        shortList.textContent = '尚無短期記憶';
    }
}

function updateMemoryPanel(memory) {
    const panel = document.getElementById('memoryPanel');
    const stats = document.getElementById('memoryStats');
    const longList = document.getElementById('longTermMemoryList');
    const shortList = document.getElementById('shortTermMemoryList');

    if (!panel || !stats || !longList || !shortList) return;

    if (!memory) {
        clearMemoryPanel();
        return;
    }

    conversationMemory = memory;

    panel.style.display = 'block';
    if (memory.total_tokens >= memory.summary_threshold) {
        panel.classList.add('memory-alert');
    } else {
        panel.classList.remove('memory-alert');
    }

    stats.textContent = `累積 Token 約 ${memory.total_tokens || 0} / 閾值 ${memory.summary_threshold || 0}`;

    longList.innerHTML = '';
    shortList.innerHTML = '';

    if (memory.long_term && memory.long_term.length) {
        longList.classList.remove('empty');
        memory.long_term.forEach((snapshot, index) => {
            const item = document.createElement('div');
            item.className = 'memory-item';

            const header = document.createElement('div');
            header.className = 'memory-item-header';

            const title = document.createElement('span');
            title.className = 'memory-item-title';
            title.textContent = `摘要 #${index + 1}`;

            const meta = document.createElement('span');
            meta.className = 'memory-item-meta';
            meta.textContent = formatTimestamp(snapshot.created_at);

            header.appendChild(title);
            header.appendChild(meta);

            const body = document.createElement('div');
            body.className = 'memory-item-body';
            body.textContent = snapshot.summary_text || '';

            const footer = document.createElement('div');
            footer.className = 'memory-item-footer';
            footer.textContent = `覆蓋 ${snapshot.message_count || 0} 則訊息 / 約 ${snapshot.token_count || 0} tokens`;

            item.appendChild(header);
            item.appendChild(body);
            item.appendChild(footer);

            if (snapshot.keywords && snapshot.keywords.length) {
                const keywordWrap = document.createElement('div');
                keywordWrap.className = 'memory-keywords';
                snapshot.keywords.forEach(keyword => {
                    const tag = document.createElement('span');
                    tag.className = 'memory-keyword';
                    tag.textContent = keyword;
                    keywordWrap.appendChild(tag);
                });
                item.appendChild(keywordWrap);
            }

            longList.appendChild(item);
        });
    } else {
        longList.classList.add('empty');
        longList.textContent = '尚無長期記憶摘要';
    }

    if (memory.short_term && memory.short_term.length) {
        shortList.classList.remove('empty');
        memory.short_term.forEach(msg => {
            const item = document.createElement('div');
            item.className = 'short-term-item';

            const role = document.createElement('div');
            role.className = 'short-term-item-role';
            role.textContent = msg.role === 'user' ? '使用者' : 'AI';

            const content = document.createElement('div');
            content.className = 'short-term-item-content';
            content.textContent = (msg.content_preview || '').trim();

            const time = document.createElement('div');
            time.className = 'short-term-item-time';
            time.textContent = formatTimestamp(msg.timestamp);

            item.appendChild(role);
            item.appendChild(content);
            item.appendChild(time);

            if (msg.token_count) {
                const tokenInfo = document.createElement('div');
                tokenInfo.className = 'short-term-item-tokens';
                tokenInfo.textContent = `約 ${msg.token_count} tokens`;
                item.appendChild(tokenInfo);
            }

            shortList.appendChild(item);
        });
    } else {
        shortList.classList.add('empty');
        shortList.textContent = '尚無短期記憶';
    }
}

function showMemoryWindow(snapshot) {
    const windowEl = document.getElementById('memoryWindow');
    const summaryEl = document.getElementById('memoryWindowSummary');
    const keywordsEl = document.getElementById('memoryWindowKeywords');
    const tokensEl = document.getElementById('memoryWindowTokens');

    if (!snapshot || !windowEl || !summaryEl || !keywordsEl || !tokensEl) return;

    if (latestMemorySnapshot && latestMemorySnapshot.summary_id === snapshot.summary_id) {
        return;
    }

    latestMemorySnapshot = snapshot;

    summaryEl.textContent = snapshot.summary_text || '';
    tokensEl.textContent = `本次摘要覆蓋約 ${snapshot.token_count || 0} tokens，包含 ${snapshot.message_count || 0} 則訊息。`;

    keywordsEl.innerHTML = '';
    if (snapshot.keywords && snapshot.keywords.length) {
        snapshot.keywords.forEach(keyword => {
            const tag = document.createElement('span');
            tag.className = 'memory-window-keyword';
            tag.textContent = keyword;
            keywordsEl.appendChild(tag);
        });
    } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'memory-window-keyword';
        placeholder.textContent = '無特定關鍵字';
        keywordsEl.appendChild(placeholder);
    }

    windowEl.classList.add('active');
    showNotification('已建立新的長期記憶摘要', 'info');
}

function closeMemoryWindow() {
    const windowEl = document.getElementById('memoryWindow');
    if (windowEl) {
        windowEl.classList.remove('active');
    }
}