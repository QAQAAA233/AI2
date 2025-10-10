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
let conversationInsights = null;
let lastUserMessageElement = null;
let cachedTokenThreshold = 120000;
let tokenThresholdTriggered = false;
let tokenUsageSnapshot = {
    prompt_token_count: 0,
    candidates_token_count: 0,
    thoughts_token_count: 0,
    total_token_count: 0
};
let conversationRefreshTimer = null;

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
        const autoSettings = config.automation_settings || {};
        cachedTokenThreshold = parseInt(autoSettings.token_reset_threshold || 120000);
        tokenThresholdTriggered = false;
        tokenUsageSnapshot = {
            prompt_token_count: 0,
            candidates_token_count: 0,
            thoughts_token_count: 0,
            total_token_count: 0
        };
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

    const submittedFiles = uploadedFiles.map(file => ({
        name: file.name,
        type: file.type || 'text/plain'
    }));

    lastUserMessageElement = addMessage('user', prompt, null, null, submittedFiles);

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
            addMessage(
                'assistant',
                result.output,
                result.usage_metadata,
                result.terminal_output,
                result.message_attachments,
                result.memory_snapshot,
                result.message_metadata
            );

            if (result.user_terminal_snapshot) {
                patchMessageWithTerminal(lastUserMessageElement, result.user_terminal_snapshot);
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
            updateConversationInsights(result.memory_snapshot);
            checkTokenThreshold(result.memory_snapshot?.token_usage);

            if (currentProjectDir) {
                scheduleConversationRefresh();
            }

            uploadedFiles = [];
            updateFilesPreview();
            updateAttachedFilesDisplay();
            lastUserMessageElement = null;
        } else {
            addMessage('assistant', `✕ 執行失敗：${result.error || result.output}`);
            showNotification(`執行失敗：${result.error}`, 'error');
            lastUserMessageElement = null;

            if (currentProjectDir) {
                scheduleConversationRefresh(2000);
            }
        }
    } catch (error) {
        addMessage('assistant', `✕ 連接錯誤：${error}`);
        showNotification(`連接錯誤：${error}`, 'error');
        lastUserMessageElement = null;

        if (currentProjectDir) {
            scheduleConversationRefresh(2000);
        }
    } finally {
        hideLoading();
    }
}

function addMessage(role, content, usageMetadata = null, terminalOutput = null, files = null, metaSnapshot = null, metadata = null, options = {}) {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

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

    const messageText = document.createElement('pre');
    messageText.className = 'message-text';
    messageText.textContent = content || '';

    messageContent.appendChild(messageText);

    message.appendChild(header);
    message.appendChild(messageContent);

    const normalizedFiles = normalizeFilesForDisplay(files, metadata);
    if (normalizedFiles.length > 0) {
        const attachmentsBlock = document.createElement('div');
        attachmentsBlock.className = 'message-attachments';

        const title = document.createElement('div');
        title.className = 'attachment-title';
        title.textContent = `附件 (${normalizedFiles.length})`;

        const list = document.createElement('div');
        list.className = 'attachment-list';

        normalizedFiles.forEach(file => {
            const item = document.createElement('div');
            item.className = 'attachment-item';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'attachment-icon';
            iconSpan.textContent = getFileIcon(file.name);

            const infoWrap = document.createElement('div');
            infoWrap.className = 'attachment-info';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'attachment-name';
            nameSpan.textContent = file.name;
            infoWrap.appendChild(nameSpan);

            if (file.label) {
                const badge = document.createElement('span');
                badge.className = 'attachment-badge';
                badge.textContent = file.label;
                infoWrap.appendChild(badge);
            }

            if (file.note) {
                const noteSpan = document.createElement('span');
                noteSpan.className = 'attachment-note';
                noteSpan.textContent = file.note;
                infoWrap.appendChild(noteSpan);
            }

            item.appendChild(iconSpan);
            item.appendChild(infoWrap);

            if (file.url) {
                item.classList.add('attachment-clickable');
                item.addEventListener('click', () => {
                    window.open(file.url, '_blank', 'noopener');
                });
            }

            list.appendChild(item);
        });

        attachmentsBlock.appendChild(title);
        attachmentsBlock.appendChild(list);
        message.appendChild(attachmentsBlock);
    }

    if (terminalOutput && terminalOutput.trim()) {
        const terminalSection = document.createElement('div');
        terminalSection.className = 'terminal-output-section';

        const headerEl = document.createElement('div');
        headerEl.className = 'terminal-header';
        const titleEl = document.createElement('span');
        titleEl.className = 'terminal-title';
        titleEl.textContent = 'Terminal 輸出';
        headerEl.appendChild(titleEl);

        const body = document.createElement('div');
        body.className = 'terminal-body selectable';
        body.textContent = terminalOutput;

        terminalSection.appendChild(headerEl);
        terminalSection.appendChild(body);
        message.appendChild(terminalSection);
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

    if (metaSnapshot && metaSnapshot.quality_score != null && role === 'assistant') {
        const badge = document.createElement('div');
        badge.className = 'token-chip';
        badge.innerHTML = `<strong>評分</strong>${metaSnapshot.quality_score} / ${metaSnapshot.quality_feedback || '未提供說明'}`;
        message.appendChild(badge);
    }

    container.appendChild(message);
    if (options.scroll !== false) {
        message.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    return message;
}

function normalizeFilesForDisplay(files, metadata) {
    const normalized = [];
    const seen = new Set();

    const pushFile = (file, fallback = {}) => {
        if (!file) return;
        if (typeof file === 'string') {
            pushFile({ name: file }, fallback);
            return;
        }
        const name = file.name || file.filename || file.path || file.filepath || '';
        if (!name) return;
        const label = file.label || file.status || fallback.label || '';
        const note = file.note || file.description || fallback.note || '';
        const key = `${name}|${label}|${note}`;
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push({
            name,
            type: file.type || file.filetype || fallback.type || 'text/plain',
            label,
            note,
            url: file.url || file.href || fallback.url || null
        });
    };

    if (Array.isArray(files)) {
        files.forEach(file => pushFile(file));
    }

    if (metadata && typeof metadata === 'object') {
        const metadataSources = [
            { key: 'attachments', fallback: {} },
            { key: 'files', fallback: {} },
            { key: 'files_created', fallback: { label: '新增檔案' } },
            { key: 'files_updated', fallback: { label: '更新檔案' } },
            { key: 'generated_files', fallback: { label: '產出檔案' } },
            { key: 'updated_files', fallback: { label: '更新檔案' } }
        ];

        metadataSources.forEach(({ key, fallback }) => {
            const value = metadata[key];
            if (Array.isArray(value)) {
                value.forEach(item => pushFile(item, fallback));
            }
        });

        if (Array.isArray(metadata.screenshots)) {
            metadata.screenshots.forEach(item => {
                if (typeof item === 'string') {
                    pushFile({ name: item, type: 'image/png', label: '截圖', url: `/screenshot/${item}` });
                } else if (item && typeof item === 'object') {
                    pushFile({
                        name: item.name || item.filename,
                        type: item.type || 'image/png',
                        label: item.label || '截圖',
                        url: item.url || item.href || `/screenshot/${item.name || item.filename}`
                    });
                }
            });
        }
    }

    return normalized;
}

function getFileIcon(filename) {
    if (!filename) return '📄';
    const parts = filename.split('.');
    const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
    const iconMap = {
        py: '🐍',
        js: '🟨',
        ts: '🟦',
        json: '🗂️',
        html: '🌐',
        css: '🎨',
        md: '📝',
        txt: '📄',
        png: '🖼️',
        jpg: '🖼️',
        jpeg: '🖼️',
        svg: '🖼️',
        pdf: '📕',
        yml: '⚙️',
        yaml: '⚙️',
        sh: '💻'
    };
    return iconMap[ext] || '📄';
}

function patchMessageWithTerminal(messageElement, terminalOutput) {
    if (!messageElement || !terminalOutput || !terminalOutput.trim()) return;
    let terminalSection = messageElement.querySelector('.terminal-output-section');
    if (!terminalSection) {
        terminalSection = document.createElement('div');
        terminalSection.className = 'terminal-output-section';

        const headerEl = document.createElement('div');
        headerEl.className = 'terminal-header';
        const titleEl = document.createElement('span');
        titleEl.className = 'terminal-title';
        titleEl.textContent = 'Terminal 輸出';
        headerEl.appendChild(titleEl);

        const body = document.createElement('div');
        body.className = 'terminal-body selectable';
        body.textContent = terminalOutput;

        terminalSection.appendChild(headerEl);
        terminalSection.appendChild(body);
        messageElement.appendChild(terminalSection);
    } else {
        const body = terminalSection.querySelector('.terminal-body');
        if (body) {
            body.textContent = terminalOutput;
        }
    }
}

function renderConversationHistory(conversation) {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    container.innerHTML = '';

    const messages = conversation?.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
        lastUserMessageElement = null;
        return;
    }

    messages.forEach((msg, index) => {
        const metaSnapshot = msg?.metadata?.meta || null;
        addMessage(
            msg.role,
            msg.content,
            msg.usage_metadata,
            msg.terminal_output,
            msg.files,
            metaSnapshot,
            msg.metadata,
            { scroll: index === messages.length - 1 }
        );
    });

    lastUserMessageElement = null;
}

function cancelConversationRefreshTimer() {
    if (conversationRefreshTimer) {
        clearTimeout(conversationRefreshTimer);
        conversationRefreshTimer = null;
    }
}

function scheduleConversationRefresh(delay = 1500) {
    cancelConversationRefreshTimer();
    conversationRefreshTimer = setTimeout(() => {
        refreshConversationFromServer();
    }, Math.max(0, delay));
}

async function refreshConversationFromServer() {
    if (!currentProjectDir) {
        cancelConversationRefreshTimer();
        return;
    }

    try {
        const response = await fetch(`/conversation/${encodeURIComponent(currentProjectDir)}`);
        const result = await response.json();

        if (result.success) {
            renderConversationHistory(result.conversation);
            updateConversationInsights(result.conversation);
            checkTokenThreshold(result.conversation?.token_usage, { skipAuto: true });
        }
    } catch (error) {
        console.error('同步對話失敗:', error);
    } finally {
        conversationRefreshTimer = null;
    }
}

function renderMemoryList(elementId, items, type = 'stm') {
    const listEl = document.getElementById(elementId);
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!items || items.length === 0) {
        const empty = document.createElement('li');
        empty.textContent = '尚無紀錄。';
        listEl.appendChild(empty);
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');

        if (type === 'stm') {
            const roleLabel = item.role === 'user' ? '使用者' : '助手';
            li.textContent = `${roleLabel}：${item.content || ''}`;
        } else {
            if (item.tags && item.tags.length) {
                const tagsRow = document.createElement('div');
                item.tags.slice(0, 3).forEach(tag => {
                    const span = document.createElement('span');
                    span.className = 'memory-tag';
                    span.textContent = tag;
                    tagsRow.appendChild(span);
                });
                li.appendChild(tagsRow);
            }

            const detail = document.createElement('div');
            detail.textContent = item.detail || item.title || '無內容';
            li.appendChild(detail);
        }

        listEl.appendChild(li);
    });
}

function renderTokenUsageFooter(tokenUsage) {
    const footer = document.getElementById('tokenUsageFooter');
    if (!footer) return;

    footer.innerHTML = '';
    const usage = tokenUsage || {};
    const entries = [
        { label: '輸入', value: usage.prompt_token_count || 0 },
        { label: '輸出', value: usage.candidates_token_count || 0 },
        { label: '思考', value: usage.thoughts_token_count || 0 },
        { label: '總計', value: usage.total_token_count || 0 }
    ];

    entries.forEach(entry => {
        const chip = document.createElement('div');
        chip.className = 'token-chip';
        chip.innerHTML = `<strong>${entry.label}</strong>${entry.value.toLocaleString()}`;
        footer.appendChild(chip);
    });
}

function getQualityScoreColor(score) {
    if (Number.isNaN(score)) return '#9ca3af';
    if (score >= 90) return '#0ea5e9';
    if (score >= 75) return '#10a37f';
    if (score >= 60) return '#f97316';
    return '#ef4444';
}

function updateConversationInsights(insights) {
    const container = document.getElementById('conversationInsights');
    const banner = document.getElementById('tokenThresholdBanner');

    if (!container) return;

    if (!insights) {
        conversationInsights = null;
        container.style.display = 'none';
        if (banner) banner.classList.remove('active');
        tokenUsageSnapshot = {
            prompt_token_count: 0,
            candidates_token_count: 0,
            thoughts_token_count: 0,
            total_token_count: 0
        };
        const bannerText = document.getElementById('tokenBannerText');
        if (bannerText) {
            bannerText.textContent = '對話 token 尚未超出閾值。';
        }
        return;
    }

    conversationInsights = insights;
    container.style.display = 'block';

    const summaryEl = document.getElementById('insightSummary');
    if (summaryEl) {
        summaryEl.textContent = insights.summary || '尚未產生摘要。';
    }

    const badge = document.getElementById('qualityScoreBadge');
    if (badge) {
        if (insights.quality_score != null) {
            badge.textContent = insights.quality_score;
            badge.style.background = getQualityScoreColor(Number(insights.quality_score));
        } else {
            badge.textContent = '--';
            badge.style.background = '#9ca3af';
        }
    }

    const feedbackEl = document.getElementById('qualityFeedbackText');
    if (feedbackEl) {
        feedbackEl.textContent = insights.quality_feedback || '尚未產生評語。';
    }

    const notesEl = document.getElementById('memoryNotesText');
    if (notesEl) {
        if (insights.memory_notes) {
            notesEl.style.display = 'block';
            notesEl.textContent = insights.memory_notes;
        } else {
            notesEl.style.display = 'none';
            notesEl.textContent = '';
        }
    }

    renderMemoryList('stmList', insights.short_term_memory, 'stm');
    renderMemoryList('ltmList', insights.long_term_memory, 'ltm');
    renderTokenUsageFooter(insights.token_usage);

    tokenUsageSnapshot = {
        prompt_token_count: insights.token_usage?.prompt_token_count || 0,
        candidates_token_count: insights.token_usage?.candidates_token_count || 0,
        thoughts_token_count: insights.token_usage?.thoughts_token_count || 0,
        total_token_count: insights.token_usage?.total_token_count || 0
    };

    const bannerText = document.getElementById('tokenBannerText');
    if (bannerText) {
        bannerText.textContent = `當前累積 ${tokenUsageSnapshot.total_token_count.toLocaleString()} tokens / 閾值 ${cachedTokenThreshold.toLocaleString()} tokens`;
    }
}

function checkTokenThreshold(tokenUsage, options = {}) {
    const { skipAuto = false } = options;
    const banner = document.getElementById('tokenThresholdBanner');

    if (!tokenUsage) {
        if (banner) banner.classList.remove('active');
        tokenThresholdTriggered = false;
        return;
    }

    const total = parseInt(tokenUsage.total_token_count || 0, 10);

    if (banner) {
        if (total >= cachedTokenThreshold) {
            banner.classList.add('active');
        } else {
            banner.classList.remove('active');
        }
    }

    if (total < cachedTokenThreshold) {
        tokenThresholdTriggered = false;
        return;
    }

    if (!tokenThresholdTriggered && !skipAuto) {
        tokenThresholdTriggered = true;
        showTokenOverflowWarning(total);
    } else if (!tokenThresholdTriggered && skipAuto) {
        tokenThresholdTriggered = true;
        const text = document.getElementById('tokenBannerText');
        if (text) {
            text.textContent = `對話累積 ${total.toLocaleString()} tokens，已超過設定閾值 ${cachedTokenThreshold.toLocaleString()} tokens。`;
        }
    } else {
        const text = document.getElementById('tokenBannerText');
        if (text) {
            text.textContent = `對話累積 ${total.toLocaleString()} tokens，已超過設定閾值 ${cachedTokenThreshold.toLocaleString()} tokens。`;
        }
    }
}

function showTokenOverflowWarning(totalTokens) {
    const banner = document.getElementById('tokenThresholdBanner');
    if (banner) {
        banner.classList.add('active');
    }

    const text = document.getElementById('tokenBannerText');
    if (text) {
        const safeTotal = Number(totalTokens) || 0;
        text.textContent = `對話累積 ${safeTotal.toLocaleString()} tokens，已超過設定閾值 ${cachedTokenThreshold.toLocaleString()} tokens，建議重整對話。`;
    }

    tokenThresholdTriggered = true;
    spawnTokenHelperWindow(totalTokens, true);
}

function spawnTokenHelperWindow(totalTokens, auto = false) {
    try {
        const helperWindow = window.open('', '_blank');
        if (!helperWindow) {
            if (auto) {
                showNotification('瀏覽器阻擋了自動視窗，請允許快顯或手動點擊提醒按鈕。', 'warning');
            }
            return;
        }

        const summary = conversationInsights?.summary || '尚未產生摘要。';
        const qualityScore = conversationInsights?.quality_score ?? '--';
        const qualityFeedback = conversationInsights?.quality_feedback || '尚未產生評語。';
        const stmItems = conversationInsights?.short_term_memory || [];
        const ltmItems = conversationInsights?.long_term_memory || [];
        const safeTotal = Number(totalTokens) || 0;

        helperWindow.document.write(`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>Token 閾值整理視窗</title>
<style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #f7f7f8; color: #111827; }
    h1 { margin-top: 0; font-size: 20px; }
    section { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    ul { padding-left: 18px; }
    li { margin-bottom: 6px; line-height: 1.6; }
    .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; font-weight: 600; }
    .score { background: ${getQualityScoreColor(Number(qualityScore))}; color: #fff; }
    .meta { font-size: 13px; color: #4b5563; }
</style>
</head>
<body>
<h1>Token 閾值提醒</h1>
<section>
    <div class="badge score">品質評分：${qualityScore}</div>
    <p class="meta">累積 Tokens：${safeTotal.toLocaleString()} / 閾值 ${cachedTokenThreshold.toLocaleString()}</p>
    <p>${qualityFeedback}</p>
</section>
<section>
    <h2>摘要</h2>
    <p>${summary}</p>
</section>
<section>
    <h2>短期記憶</h2>
    <ul>
        ${stmItems.map(item => `<li>${item.role === 'user' ? '使用者' : '助手'}：${item.content || ''}</li>`).join('') || '<li>尚無紀錄。</li>'}
    </ul>
</section>
<section>
    <h2>長期記憶要點</h2>
    <ul>
        ${ltmItems.map(item => `<li>${item.detail || item.title || ''}</li>`).join('') || '<li>尚無紀錄。</li>'}
    </ul>
</section>
<section>
    <h2>建議行動</h2>
    <ul>
        <li>在主視窗中建立新對話以避免上下文過長。</li>
        <li>參考上述摘要與記憶，撰寫新的指令或需求。</li>
        <li>如果需要，可調整 Token 閾值設定以符合工作流程。</li>
    </ul>
</section>
</body>
</html>`);
        helperWindow.document.close();
    } catch (error) {
        console.warn('無法開啟 Token 提醒視窗:', error);
    }
}

function openTokenHelperWindow() {
    if (!conversationInsights) {
        showNotification('目前尚未產生可整理的對話記憶。', 'info');
        return;
    }
    spawnTokenHelperWindow(tokenUsageSnapshot.total_token_count, false);
}

function dismissTokenBanner() {
    const banner = document.getElementById('tokenThresholdBanner');
    if (banner) {
        banner.classList.remove('active');
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
            cancelConversationRefreshTimer();
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
            cancelConversationRefreshTimer();
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
    cancelConversationRefreshTimer();
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
            
            renderConversationHistory(result.conversation);

            updateConversationInsights(result.conversation);
            checkTokenThreshold(result.conversation?.token_usage, { skipAuto: true });

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

    cancelConversationRefreshTimer();
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

    updateConversationInsights(null);
    dismissTokenBanner();
    tokenUsageSnapshot = {
        prompt_token_count: 0,
        candidates_token_count: 0,
        thoughts_token_count: 0,
        total_token_count: 0
    };
    tokenThresholdTriggered = false;

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

        const automationSettings = config.automation_settings || {};
        const tokenField = document.getElementById('tokenThreshold');
        const monitorField = document.getElementById('monitorInterval');
        if (tokenField) tokenField.value = automationSettings.token_reset_threshold || 120000;
        if (monitorField) monitorField.value = automationSettings.monitor_interval || 5;

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
                monitor_interval: parseInt(document.getElementById('monitorInterval').value) || 5,
                token_reset_threshold: parseInt(document.getElementById('tokenThreshold').value) || 120000
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