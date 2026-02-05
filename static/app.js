const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State
let currentConversation = null;
let isStreaming = false;
let systemStatus = null;
let availableModels = [];
let currentSetupStep = 1;
let selectedModel = null;
let currentPullId = null;

// Elements
const elements = {
  // Setup wizard
  setupWizard: $('#setupWizard'),
  mainApp: $('#mainApp'),
  statusResults: $('#statusResults'),
  statusInstalled: $('#statusInstalled'),
  statusRunning: $('#statusRunning'),
  statusModels: $('#statusModels'),
  installInstructions: $('#installInstructions'),
  installAlready: $('#installAlready'),
  modelGrid: $('#modelGrid'),
  downloadProgress: $('#downloadProgress'),
  
  // Main app
  conversationList: $('#conversationList'),
  messages: $('#messages'),
  emptyState: $('#emptyState'),
  messageInput: $('#messageInput'),
  sendBtn: $('#sendBtn'),
  chatForm: $('#chatForm'),
  modelSelect: $('#modelSelect'),
  chatTitle: $('#chatTitle'),
  connectionStatus: $('#connectionStatus'),
  searchInput: $('#searchInput'),
  settingsModal: $('#settingsModal'),
  ollamaUrl: $('#ollamaUrl'),
  sidebar: $('.sidebar'),
  settingsStatus: $('#settingsStatus'),
  
  // Model manager
  modelModal: $('#modelModal'),
  installedModelsList: $('#installedModelsList'),
  availableModelsList: $('#availableModelsList'),
  
  // Toast
  toastContainer: $('#toastContainer'),
};

// ===== UTILITIES =====

async function api(endpoint, options = {}) {
  try {
    const res = await fetch(`/api${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    return res.json();
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;
  
  elements.toastContainer.appendChild(toast);
  
  toast.querySelector('.toast-close').onclick = () => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  };
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

// ===== SETUP WIZARD =====

async function checkSystemStatus() {
  try {
    systemStatus = await api('/system/status');
    return systemStatus;
  } catch (err) {
    console.error('Failed to check system status:', err);
    return null;
  }
}

function updateSetupStep(step) {
  currentSetupStep = step;
  
  // Update progress indicators
  $$('.progress-step').forEach((el, i) => {
    const stepNum = i + 1;
    el.classList.remove('active', 'completed');
    if (stepNum === step) el.classList.add('active');
    else if (stepNum < step) el.classList.add('completed');
  });
  
  // Show correct step content
  $$('.setup-step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === step);
  });
}

function renderStatusResults(status) {
  const statusCard = $('.status-card');
  if (statusCard) statusCard.style.display = 'none';
  elements.statusResults.style.display = 'flex';
  
  // Ollama installed
  const installedEl = elements.statusInstalled;
  installedEl.className = `status-item ${status.ollama_installed ? 'success' : 'error'}`;
  installedEl.querySelector('.status-icon').textContent = status.ollama_installed ? '✓' : '✗';
  
  let versionText = 'Not installed';
  if (status.ollama_installed) {
    versionText = status.ollama_version && status.ollama_version !== 'installed' 
      ? `Version ${status.ollama_version}` 
      : 'Installed';
  }
  installedEl.querySelector('.status-text').textContent = versionText;
  
  // Ollama running
  const runningEl = elements.statusRunning;
  runningEl.className = `status-item ${status.ollama_running ? 'success' : (status.ollama_installed ? 'warning' : 'error')}`;
  runningEl.querySelector('.status-icon').textContent = status.ollama_running ? '✓' : (status.ollama_installed ? '!' : '✗');
  runningEl.querySelector('.status-text').textContent = status.ollama_running 
    ? 'Running and ready' 
    : (status.ollama_installed ? 'Not running (we can start it)' : 'Requires Ollama');
  
  // Models
  const modelsEl = elements.statusModels;
  const hasModels = status.models && status.models.length > 0;
  modelsEl.className = `status-item ${hasModels ? 'success' : 'warning'}`;
  modelsEl.querySelector('.status-icon').textContent = hasModels ? '✓' : '!';
  modelsEl.querySelector('.status-text').textContent = hasModels 
    ? `${status.models.length} model${status.models.length > 1 ? 's' : ''}: ${status.models.slice(0, 3).join(', ')}${status.models.length > 3 ? '...' : ''}` 
    : 'No models downloaded yet';
  
  // Update step 1 button
  const step1Next = $('#step1Next');
  step1Next.disabled = false;
  
  // Update button text based on state
  if (status.ollama_running && hasModels) {
    step1Next.textContent = 'Start Chatting →';
  } else if (status.ollama_running && !hasModels) {
    step1Next.textContent = 'Download a Model →';
  } else if (status.ollama_installed && !status.ollama_running) {
    step1Next.textContent = 'Start Ollama →';
  } else {
    step1Next.textContent = 'Install Ollama →';
  }
}

function renderInstallInstructions(platform) {
  const instructions = {
    darwin: `
      <div class="install-step">
        <div class="install-step-num">1</div>
        <div class="install-step-content">
          <h4>Download Ollama</h4>
          <p>Click the link below to download Ollama for Mac:</p>
          <a href="https://ollama.com/download/mac" target="_blank" class="install-link">
            Download Ollama for Mac
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
      </div>
      <div class="install-step">
        <div class="install-step-num">2</div>
        <div class="install-step-content">
          <h4>Install the app</h4>
          <p>Open the downloaded file and drag Ollama to your Applications folder.</p>
        </div>
      </div>
      <div class="install-step">
        <div class="install-step-num">3</div>
        <div class="install-step-content">
          <h4>Launch Ollama</h4>
          <p>Open Ollama from your Applications. It will appear in your menu bar.</p>
        </div>
      </div>
    `,
    linux: `
      <div class="install-step">
        <div class="install-step-num">1</div>
        <div class="install-step-content">
          <h4>Open Terminal</h4>
          <p>Press <kbd>Ctrl+Alt+T</kbd> to open a terminal window.</p>
        </div>
      </div>
      <div class="install-step">
        <div class="install-step-num">2</div>
        <div class="install-step-content">
          <h4>Run the install command</h4>
          <p>Copy and paste this command into your terminal:</p>
          <div class="install-cmd">
            <code>curl -fsSL https://ollama.com/install.sh | sh</code>
            <button class="copy-btn" onclick="copyToClipboard('curl -fsSL https://ollama.com/install.sh | sh')">Copy</button>
          </div>
        </div>
      </div>
      <div class="install-step">
        <div class="install-step-num">3</div>
        <div class="install-step-content">
          <h4>Start Ollama</h4>
          <p>After installation, run this to start the server:</p>
          <div class="install-cmd">
            <code>ollama serve</code>
            <button class="copy-btn" onclick="copyToClipboard('ollama serve')">Copy</button>
          </div>
          <p style="margin-top: 8px; font-size: 13px; color: var(--text-muted);">Keep this terminal open while using Local AI.</p>
        </div>
      </div>
    `,
    windows: `
      <div class="install-step">
        <div class="install-step-num">1</div>
        <div class="install-step-content">
          <h4>Download Ollama</h4>
          <p>Click the link below to download Ollama for Windows:</p>
          <a href="https://ollama.com/download/windows" target="_blank" class="install-link">
            Download Ollama for Windows
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
      </div>
      <div class="install-step">
        <div class="install-step-num">2</div>
        <div class="install-step-content">
          <h4>Run the installer</h4>
          <p>Open the downloaded file and follow the installation wizard.</p>
        </div>
      </div>
      <div class="install-step">
        <div class="install-step-num">3</div>
        <div class="install-step-content">
          <h4>Launch Ollama</h4>
          <p>Ollama will start automatically after installation. Look for it in your system tray.</p>
        </div>
      </div>
    `
  };
  
  elements.installInstructions.innerHTML = instructions[platform] || instructions.linux;
}

window.copyToClipboard = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  });
};

async function loadAvailableModels() {
  try {
    availableModels = await api('/models/available');
    renderModelGrid('recommended');
  } catch (err) {
    console.error('Failed to load models:', err);
  }
}

function renderModelGrid(category) {
  const filtered = availableModels.filter(m => m.category === category);
  
  // Check which models are already installed
  const installedModels = systemStatus?.models || [];
  const installedSet = new Set(installedModels.map(m => m.split(':')[0]));
  
  elements.modelGrid.innerHTML = filtered.map(model => {
    const speedBars = model.speed === 'fastest' ? 3 : model.speed === 'fast' ? 2 : 1;
    const modelBase = model.name.split(':')[0];
    const isInstalled = installedModels.includes(model.name) || installedSet.has(modelBase);
    
    return `
      <div class="model-card ${selectedModel === model.name ? 'selected' : ''} ${isInstalled ? 'installed' : ''}" data-model="${model.name}">
        <div class="model-radio"></div>
        <div class="model-info">
          <div class="model-name">
            ${escapeHtml(model.display_name)}
            <span class="model-size">${model.size}</span>
            ${isInstalled ? '<span class="model-installed-badge">✓ Installed</span>' : ''}
          </div>
          <div class="model-desc">${escapeHtml(model.description)}</div>
          <div class="model-speed">
            <span class="speed-indicator">
              ${Array(3).fill(0).map((_, i) => `<div class="speed-bar ${i < speedBars ? 'active' : ''}"></div>`).join('')}
            </span>
            <span>${model.speed === 'fastest' ? 'Fastest' : model.speed === 'fast' ? 'Fast' : 'Moderate'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  elements.modelGrid.querySelectorAll('.model-card').forEach(card => {
    card.onclick = () => {
      elements.modelGrid.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedModel = card.dataset.model;
      updateDownloadButton();
    };
  });
}

function updateDownloadButton() {
  const btn = $('#step3Download');
  if (selectedModel) {
    const model = availableModels.find(m => m.name === selectedModel);
    const installedModels = systemStatus?.models || [];
    const isInstalled = installedModels.some(m => m === selectedModel || m.startsWith(selectedModel.split(':')[0]));
    
    if (isInstalled) {
      btn.textContent = `Continue with ${model?.display_name || selectedModel}`;
    } else {
      btn.textContent = `Download ${model?.display_name || selectedModel}`;
    }
    btn.disabled = false;
  } else {
    btn.textContent = 'Select a model to continue';
    btn.disabled = true;
  }
}

async function downloadModel(modelName) {
  // Check if already installed
  const installedModels = systemStatus?.models || [];
  const isInstalled = installedModels.some(m => m === modelName || m.startsWith(modelName.split(':')[0]));
  
  if (isInstalled) {
    // Skip download, go to ready step
    updateSetupStep(4);
    return;
  }
  
  try {
    const result = await api('/models/pull', {
      method: 'POST',
      body: { model: modelName }
    });
    
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    
    if (result.pull_id) {
      currentPullId = result.pull_id;
      showDownloadProgress(modelName);
      pollDownloadProgress();
    }
  } catch (err) {
    showToast('Failed to start download', 'error');
  }
}

function showDownloadProgress(modelName) {
  const model = availableModels.find(m => m.name === modelName);
  elements.downloadProgress.style.display = 'block';
  elements.downloadProgress.querySelector('.download-model-name').textContent = model?.display_name || modelName;
  elements.downloadProgress.querySelector('.download-percent').textContent = '0%';
  elements.downloadProgress.querySelector('.download-fill').style.width = '0%';
  elements.downloadProgress.querySelector('.download-status').textContent = 'Starting download...';
  
  $('#step3Download').disabled = true;
  $('#step3Download').textContent = 'Downloading...';
  $('#step3Back').disabled = true;
}

async function pollDownloadProgress() {
  if (!currentPullId) return;
  
  try {
    const status = await api(`/models/pull/${currentPullId}/status`);
    
    elements.downloadProgress.querySelector('.download-percent').textContent = `${status.progress}%`;
    elements.downloadProgress.querySelector('.download-fill').style.width = `${status.progress}%`;
    elements.downloadProgress.querySelector('.download-status').textContent = status.status || 'Downloading...';
    
    if (status.completed) {
      showToast('Model downloaded successfully!', 'success');
      currentPullId = null;
      
      // Refresh system status to get updated models
      systemStatus = await checkSystemStatus();
      
      setTimeout(() => {
        updateSetupStep(4);
      }, 1000);
    } else if (status.error) {
      showToast(`Download failed: ${status.error}`, 'error');
      currentPullId = null;
      $('#step3Download').disabled = false;
      $('#step3Back').disabled = false;
      updateDownloadButton();
    } else {
      setTimeout(pollDownloadProgress, 1000);
    }
  } catch (err) {
    setTimeout(pollDownloadProgress, 2000);
  }
}

async function initSetupWizard() {
  updateSetupStep(1);
  
  // Check system status
  const status = await checkSystemStatus();
  
  if (status) {
    renderStatusResults(status);
    
    // Pre-fill install instructions
    renderInstallInstructions(status.platform);
    
    // If Ollama is installed, update step 2
    if (status.ollama_installed) {
      elements.installInstructions.style.display = 'none';
      elements.installAlready.style.display = 'block';
      $('#step2Check').style.display = 'none';
      $('#step2Skip').style.display = 'inline-flex';
    }
    
    // Load available models for step 3
    loadAvailableModels();
  }
}

function finishSetup() {
  elements.setupWizard.classList.add('hidden');
  elements.mainApp.style.display = 'flex';
  
  // Save setup complete
  api('/settings', {
    method: 'POST',
    body: { setup_complete: true }
  });
  
  // Initialize main app
  initMainApp();
}

// Setup wizard event handlers
$('#step1Next').onclick = async () => {
  if (!systemStatus) {
    systemStatus = await checkSystemStatus();
  }
  
  // If everything is ready, go to main app
  if (systemStatus.ollama_running && systemStatus.models && systemStatus.models.length > 0) {
    finishSetup();
    return;
  }
  
  if (!systemStatus.ollama_installed) {
    updateSetupStep(2);
  } else if (!systemStatus.ollama_running) {
    // Try to start Ollama
    showToast('Starting Ollama...', 'info');
    $('#step1Next').disabled = true;
    $('#step1Next').textContent = 'Starting...';
    
    try {
      const result = await api('/ollama/start', { method: 'POST' });
      if (result.ok) {
        showToast('Ollama started!', 'success');
        systemStatus.ollama_running = true;
        
        // Refresh status to get models
        systemStatus = await checkSystemStatus();
        
        if (systemStatus.models && systemStatus.models.length > 0) {
          finishSetup();
        } else {
          updateSetupStep(3);
        }
      } else {
        showToast(result.error || 'Could not start Ollama', 'error');
        updateSetupStep(2);
      }
    } catch (err) {
      showToast('Could not start Ollama automatically. Please start it manually.', 'error');
      updateSetupStep(2);
    }
    
    $('#step1Next').disabled = false;
    renderStatusResults(systemStatus);
  } else if (!systemStatus.models || systemStatus.models.length === 0) {
    updateSetupStep(3);
  } else {
    finishSetup();
  }
};

$('#step2Back').onclick = () => updateSetupStep(1);

$('#step2Check').onclick = async () => {
  showToast('Checking...', 'info');
  systemStatus = await checkSystemStatus();
  
  if (systemStatus.ollama_installed) {
    elements.installInstructions.style.display = 'none';
    elements.installAlready.style.display = 'block';
    $('#step2Check').style.display = 'none';
    $('#step2Skip').style.display = 'inline-flex';
    showToast('Ollama detected!', 'success');
    
    // Try to start if not running
    if (!systemStatus.ollama_running) {
      try {
        await api('/ollama/start', { method: 'POST' });
        systemStatus = await checkSystemStatus();
      } catch (err) {
        // Ignore
      }
    }
  } else {
    showToast('Ollama not found. Please complete the installation.', 'error');
  }
};

$('#step2Skip').onclick = async () => {
  // Refresh status
  systemStatus = await checkSystemStatus();
  
  if (systemStatus.models && systemStatus.models.length > 0) {
    finishSetup();
  } else {
    updateSetupStep(3);
  }
};

$('#step3Back').onclick = () => updateSetupStep(2);

$('#step3Download').onclick = () => {
  if (selectedModel) {
    downloadModel(selectedModel);
  }
};

$('#startChatting').onclick = finishSetup;

// Category buttons in setup
$$('.setup-step .category-btn').forEach(btn => {
  btn.onclick = () => {
    btn.parentElement.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderModelGrid(btn.dataset.category);
  };
});

// ===== MAIN APP =====

async function loadModels() {
  try {
    const models = await api('/models');
    if (Array.isArray(models) && models.length > 0) {
      elements.modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
      elements.modelSelect.onclick = null;
    } else {
      elements.modelSelect.innerHTML = '<option value="">No models — click to download</option>';
      elements.modelSelect.onclick = () => openModelManager();
    }
  } catch (err) {
    elements.modelSelect.innerHTML = '<option value="">Click to manage models</option>';
    elements.modelSelect.onclick = () => openModelManager();
  }
}

async function checkConnection() {
  try {
    const { status } = await api('/health');
    const isConnected = status === 'connected';
    
    elements.connectionStatus.className = `connection ${status}`;
    elements.connectionStatus.querySelector('.text').textContent = 
      isConnected ? 'Connected to Ollama' : 'Disconnected';
    
    if (elements.settingsStatus) {
      elements.settingsStatus.className = `setting-status ${status}`;
      elements.settingsStatus.querySelector('.status-text').textContent = 
        isConnected ? 'Connected' : 'Not connected';
    }
    
    return isConnected;
  } catch {
    elements.connectionStatus.className = 'connection disconnected';
    elements.connectionStatus.querySelector('.text').textContent = 'Disconnected';
    return false;
  }
}

async function loadConversations() {
  try {
    const conversations = await api('/conversations');
    
    if (!conversations || !conversations.length) {
      elements.conversationList.innerHTML = `
        <div class="no-conversations">
          No conversations yet.<br>Start a new chat!
        </div>
      `;
      return;
    }
    
    elements.conversationList.innerHTML = conversations.map(c => `
      <div class="conv-item ${currentConversation?.id === c.id ? 'active' : ''}" data-id="${c.id}">
        <svg class="conv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <span class="conv-title">${escapeHtml(c.title)}</span>
      </div>
    `).join('');
    
    elements.conversationList.querySelectorAll('.conv-item').forEach(el => {
      el.onclick = () => loadConversation(el.dataset.id);
    });
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
}

async function loadConversation(id) {
  try {
    const conv = await api(`/conversations/${id}`);
    currentConversation = conv;
    
    elements.chatTitle.textContent = conv.title;
    
    if (conv.model && elements.modelSelect.querySelector(`option[value="${conv.model}"]`)) {
      elements.modelSelect.value = conv.model;
    }
    
    renderMessages(conv.messages);
    loadConversations();
    closeSidebar();
  } catch (err) {
    showToast('Failed to load conversation', 'error');
  }
}

function renderMessages(messages) {
  if (!messages?.length) {
    elements.messages.innerHTML = '';
    elements.messages.appendChild(elements.emptyState);
    elements.emptyState.style.display = '';
    return;
  }
  
  elements.emptyState.style.display = 'none';
  elements.messages.innerHTML = messages.map((m, i) => createMessageHtml(m.role, m.content, null, i)).join('');
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function createMessageHtml(role, content, stats = null, messageIndex = null) {
  const avatar = role === 'user' ? 'You' : 'AI';
  const label = role === 'user' ? 'You' : 'Assistant';
  const idx = messageIndex !== null ? messageIndex : Date.now();
  
  const actionsHtml = `
    <div class="message-actions">
      <button class="msg-action-btn copy-btn" data-tooltip="Copy" onclick="copyMessageContent(this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      </button>
      ${role === 'assistant' ? `
        <button class="msg-action-btn regenerate" data-tooltip="Regenerate" onclick="regenerateMessage(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      ` : ''}
    </div>
  `;
  
  let statsHtml = '';
  if (stats && role === 'assistant') {
    const speedClass = stats.tokens_per_sec >= 30 ? 'fast' : stats.tokens_per_sec >= 15 ? 'medium' : 'slow';
    statsHtml = `
      <div class="message-stats">
        <div class="stat-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          <span class="stat-value">${stats.tokens_per_sec}</span>
          <span class="stat-label">tok/s</span>
        </div>
        <div class="stat-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <span class="stat-value">${stats.duration}s</span>
        </div>
        <div class="stat-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <span class="stat-value">${stats.tokens}</span>
          <span class="stat-label">tokens</span>
        </div>
      </div>
    `;
  }
  
  const footerClass = stats ? 'message-footer has-stats' : 'message-footer';
  
  return `
    <div class="message ${role}" data-index="${idx}">
      <div class="message-header">
        <div class="message-avatar">${avatar}</div>
        <span class="message-role">${label}</span>
      </div>
      <div class="message-content">${formatContent(content)}</div>
      <div class="${footerClass}">
        ${statsHtml}
        ${actionsHtml}
      </div>
    </div>
  `;
}

// Copy message content
window.copyMessageContent = function(btn) {
  const message = btn.closest('.message');
  const content = message.querySelector('.message-content').innerText;
  
  navigator.clipboard.writeText(content).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;
    
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      `;
    }, 2000);
    
    showToast('Copied to clipboard!', 'success');
  });
};

// Regenerate last response
window.regenerateMessage = async function(btn) {
  if (isStreaming || !currentConversation) return;
  
  const model = elements.modelSelect.value;
  if (!model) {
    showToast('Please select a model first', 'error');
    return;
  }
  
  // Get all messages and find the last user message
  const messages = elements.messages.querySelectorAll('.message');
  let lastUserMessage = null;
  
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].classList.contains('user')) {
      lastUserMessage = messages[i].querySelector('.message-content').innerText;
      break;
    }
  }
  
  if (!lastUserMessage) {
    showToast('No message to regenerate', 'error');
    return;
  }
  
  // Remove the last assistant message from the UI
  const lastAssistant = elements.messages.querySelector('.message.assistant:last-of-type');
  if (lastAssistant) {
    lastAssistant.remove();
  }
  
  // Delete last assistant message from DB and resend
  try {
    // For now, we'll just send the same message again
    // The backend will handle creating a new response
    elements.messageInput.value = lastUserMessage;
    
    // Remove the user message too since sendMessage will re-add it
    const lastUser = elements.messages.querySelector('.message.user:last-of-type');
    if (lastUser) {
      lastUser.remove();
    }
    
    await sendMessage();
  } catch (err) {
    showToast('Failed to regenerate', 'error');
  }
};

function formatContent(text) {
  if (!text) return '';
  
  let html = escapeHtml(text);
  
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Italics
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  
  return `<p>${html}</p>`;
}

async function createConversation() {
  const model = elements.modelSelect.value;
  if (!model) {
    showToast('Please select a model first', 'error');
    return;
  }
  
  try {
    const { id } = await api('/conversations', { 
      method: 'POST', 
      body: { model } 
    });
    await loadConversation(id);
  } catch (err) {
    showToast('Failed to create conversation', 'error');
  }
}

async function sendMessage() {
  const message = elements.messageInput.value.trim();
  const model = elements.modelSelect.value;
  
  if (!message || !model || isStreaming) return;
  
  if (!currentConversation) {
    await createConversation();
    if (!currentConversation) return; // Failed to create
  }
  
  elements.messageInput.value = '';
  elements.sendBtn.disabled = true;
  autoResize(elements.messageInput);
  
  elements.emptyState.style.display = 'none';
  elements.messages.innerHTML += createMessageHtml('user', message);
  
  const assistantDiv = document.createElement('div');
  assistantDiv.className = 'message assistant';
  assistantDiv.innerHTML = `
    <div class="message-header">
      <div class="message-avatar">AI</div>
      <span class="message-role">Assistant</span>
    </div>
    <div class="message-content"><span class="streaming-cursor"></span></div>
    <div class="message-footer">
      <div class="message-stats"></div>
      <div class="message-actions">
        <button class="msg-action-btn copy-btn" data-tooltip="Copy" onclick="copyMessageContent(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        </button>
        <button class="msg-action-btn regenerate" data-tooltip="Regenerate" onclick="regenerateMessage(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  elements.messages.appendChild(assistantDiv);
  elements.messages.scrollTop = elements.messages.scrollHeight;
  
  isStreaming = true;
  let fullResponse = '';
  
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: currentConversation.id,
        message,
        model,
      }),
    });
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const contentEl = assistantDiv.querySelector('.message-content');
    const statsEl = assistantDiv.querySelector('.message-stats');
    const footerEl = assistantDiv.querySelector('.message-footer');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        
        try {
          const data = JSON.parse(line.slice(6));
          
          if (data.error) {
            contentEl.innerHTML = `<p style="color: var(--danger);">${escapeHtml(data.error)}</p>`;
            break;
          }
          
          if (data.text) {
            fullResponse += data.text;
            contentEl.innerHTML = formatContent(fullResponse) + '<span class="streaming-cursor"></span>';
            elements.messages.scrollTop = elements.messages.scrollHeight;
          }
          
          if (data.done) {
            contentEl.innerHTML = formatContent(fullResponse);
            
            // Display stats if available
            if (data.stats) {
              const stats = data.stats;
              const speedClass = stats.tokens_per_sec >= 30 ? 'fast' : stats.tokens_per_sec >= 15 ? 'medium' : 'slow';
              
              statsEl.innerHTML = `
                <div class="stat-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  <span class="stat-value">${stats.tokens_per_sec}</span>
                  <span class="stat-label">tok/s</span>
                </div>
                <div class="stat-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                  <span class="stat-value">${stats.duration}s</span>
                </div>
                <div class="stat-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  <span class="stat-value">${stats.tokens}</span>
                  <span class="stat-label">tokens</span>
                </div>
              `;
              footerEl.classList.add('has-stats');
            }
            
            loadConversations();
          }
        } catch {}
      }
    }
  } catch (err) {
    assistantDiv.querySelector('.message-content').innerHTML = 
      `<p style="color: var(--danger);">Failed to connect. Is Ollama running?</p>`;
  }
  
  isStreaming = false;
  updateSendButton();
}

function updateSendButton() {
  const hasMessage = elements.messageInput.value.trim().length > 0;
  const hasModel = elements.modelSelect.value !== '';
  elements.sendBtn.disabled = !hasMessage || !hasModel || isStreaming;
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

async function deleteConversation() {
  if (!currentConversation) return;
  if (!confirm('Delete this conversation?')) return;
  
  try {
    await api(`/conversations/${currentConversation.id}`, { method: 'DELETE' });
    currentConversation = null;
    elements.chatTitle.textContent = 'New chat';
    renderMessages([]);
    loadConversations();
    showToast('Conversation deleted', 'success');
  } catch (err) {
    showToast('Failed to delete conversation', 'error');
  }
}

async function renameConversation() {
  if (!currentConversation) return;
  
  const title = prompt('Rename conversation:', currentConversation.title);
  if (!title) return;
  
  try {
    await api(`/conversations/${currentConversation.id}`, {
      method: 'PATCH',
      body: { title },
    });
    
    currentConversation.title = title;
    elements.chatTitle.textContent = title;
    loadConversations();
  } catch (err) {
    showToast('Failed to rename conversation', 'error');
  }
}

async function exportConversation() {
  if (!currentConversation) return;
  window.location.href = `/api/export/${currentConversation.id}`;
}

// Settings
async function loadSettings() {
  try {
    const settings = await api('/settings');
    elements.ollamaUrl.value = settings.ollama_url || '';
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function saveSettings() {
  try {
    await api('/settings', {
      method: 'POST',
      body: { ollama_url: elements.ollamaUrl.value },
    });
    
    closeModal('settingsModal');
    checkConnection();
    loadModels();
    showToast('Settings saved', 'success');
  } catch (err) {
    showToast('Failed to save settings', 'error');
  }
}

function openModal(modalId) {
  $(`#${modalId}`).classList.add('open');
  if (modalId === 'settingsModal') {
    loadSettings();
    checkConnection();
  }
}

function closeModal(modalId) {
  $(`#${modalId}`).classList.remove('open');
}

function closeSidebar() {
  elements.sidebar.classList.remove('open');
}

// Model Manager
async function openModelManager() {
  openModal('modelModal');
  await loadInstalledModels();
  await loadAvailableModelsForManager();
}

async function loadInstalledModels() {
  try {
    const models = await api('/models');
    
    if (!Array.isArray(models) || models.length === 0) {
      elements.installedModelsList.innerHTML = `
        <div class="no-models">
          <p>No models installed yet.</p>
          <p>Switch to "Download New" to get started!</p>
        </div>
      `;
      return;
    }
    
    elements.installedModelsList.innerHTML = models.map(model => `
      <div class="installed-model-item" data-model="${model}">
        <div class="model-icon">🤖</div>
        <div class="model-details">
          <div class="model-name">${escapeHtml(model)}</div>
          <div class="model-meta">Local model</div>
        </div>
        <button class="btn-delete-model" title="Delete model">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    `).join('');
    
    // Add delete handlers
    elements.installedModelsList.querySelectorAll('.btn-delete-model').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const modelName = btn.closest('.installed-model-item').dataset.model;
        if (confirm(`Delete model "${modelName}"? This cannot be undone.`)) {
          try {
            await api(`/models/${encodeURIComponent(modelName)}`, { method: 'DELETE' });
            showToast('Model deleted', 'success');
            loadInstalledModels();
            loadModels();
          } catch (err) {
            showToast('Failed to delete model', 'error');
          }
        }
      };
    });
  } catch (err) {
    console.error('Failed to load installed models:', err);
  }
}

async function loadAvailableModelsForManager() {
  try {
    const models = await api('/models/available');
    const installed = await api('/models');
    const installedSet = new Set(Array.isArray(installed) ? installed : []);
    
    renderAvailableModelsForManager(models, installedSet, 'recommended');
    
    // Category handlers
    $$('#availableModelsTab .category-btn').forEach(btn => {
      btn.onclick = () => {
        $$('#availableModelsTab .category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderAvailableModelsForManager(models, installedSet, btn.dataset.category);
      };
    });
  } catch (err) {
    console.error('Failed to load available models:', err);
  }
}

function renderAvailableModelsForManager(models, installedSet, category) {
  const filtered = models.filter(m => m.category === category);
  
  // Check if model base name is installed
  const isModelInstalled = (modelName) => {
    if (installedSet.has(modelName)) return true;
    const baseName = modelName.split(':')[0];
    for (const installed of installedSet) {
      if (installed.startsWith(baseName)) return true;
    }
    return false;
  };
  
  elements.availableModelsList.innerHTML = filtered.map(model => {
    const isInstalled = isModelInstalled(model.name);
    return `
      <div class="available-model-item ${isInstalled ? 'installed' : ''}" data-model="${model.name}">
        <div class="model-details">
          <div class="model-name">
            ${escapeHtml(model.display_name)}
            ${isInstalled ? '<span class="badge">Installed</span>' : ''}
          </div>
          <div class="model-desc">${escapeHtml(model.description)}</div>
        </div>
        <span class="model-size">${model.size}</span>
        ${isInstalled ? '' : `<button class="btn-download">Download</button>`}
      </div>
    `;
  }).join('');
  
  // Add download handlers
  elements.availableModelsList.querySelectorAll('.btn-download').forEach(btn => {
    btn.onclick = async () => {
      const item = btn.closest('.available-model-item');
      const modelName = item.dataset.model;
      
      btn.textContent = 'Downloading...';
      btn.disabled = true;
      item.classList.add('downloading');
      
      try {
        const result = await api('/models/pull', {
          method: 'POST',
          body: { model: modelName }
        });
        
        if (result.error) {
          btn.textContent = 'Download';
          btn.disabled = false;
          item.classList.remove('downloading');
          showToast(result.error, 'error');
          return;
        }
        
        if (result.pull_id) {
          pollModelDownload(result.pull_id, btn, item);
        }
      } catch (err) {
        btn.textContent = 'Download';
        btn.disabled = false;
        item.classList.remove('downloading');
        showToast('Failed to start download', 'error');
      }
    };
  });
}

async function pollModelDownload(pullId, btn, item) {
  try {
    const status = await api(`/models/pull/${pullId}/status`);
    
    if (status.progress) {
      btn.textContent = `${status.progress}%`;
    }
    
    if (status.completed) {
      showToast('Model downloaded successfully!', 'success');
      loadInstalledModels();
      loadModels();
      
      // Update button
      btn.remove();
      item.classList.remove('downloading');
      item.classList.add('installed');
      item.querySelector('.model-name').innerHTML += '<span class="badge">Installed</span>';
    } else if (status.error) {
      btn.textContent = 'Download';
      btn.disabled = false;
      item.classList.remove('downloading');
      showToast(`Download failed: ${status.error}`, 'error');
    } else {
      setTimeout(() => pollModelDownload(pullId, btn, item), 1000);
    }
  } catch (err) {
    setTimeout(() => pollModelDownload(pullId, btn, item), 2000);
  }
}

// Search
async function search(query) {
  if (query.length < 2) {
    loadConversations();
    return;
  }
  
  try {
    const results = await api(`/search?q=${encodeURIComponent(query)}`);
    
    if (!results.length) {
      elements.conversationList.innerHTML = `
        <div class="no-conversations">No results found</div>
      `;
      return;
    }
    
    const grouped = {};
    results.forEach(r => {
      if (!grouped[r.conversation_id]) {
        grouped[r.conversation_id] = { title: r.title, results: [] };
      }
      grouped[r.conversation_id].results.push(r);
    });
    
    elements.conversationList.innerHTML = Object.entries(grouped).map(([id, data]) => `
      <div class="search-result" data-id="${id}">
        <div class="search-result-title">${escapeHtml(data.title)}</div>
        <div class="search-result-preview">${escapeHtml(data.results[0].content.slice(0, 100))}</div>
      </div>
    `).join('');
    
    elements.conversationList.querySelectorAll('.search-result').forEach(el => {
      el.onclick = () => {
        elements.searchInput.value = '';
        loadConversation(el.dataset.id);
      };
    });
  } catch (err) {
    console.error('Search failed:', err);
  }
}

// Quick prompts
$$('.quick-prompt').forEach(btn => {
  btn.onclick = () => {
    elements.messageInput.value = btn.dataset.prompt;
    elements.messageInput.focus();
    autoResize(elements.messageInput);
    updateSendButton();
  };
});

// Event listeners
let searchTimeout;
elements.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => search(e.target.value), 300);
});

elements.messageInput.addEventListener('input', () => {
  updateSendButton();
  autoResize(elements.messageInput);
});

elements.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

elements.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage();
});

$('#newChat').onclick = createConversation;
$('#deleteChat').onclick = deleteConversation;
$('#editTitle').onclick = renameConversation;
$('#exportChat').onclick = exportConversation;
$('#openSettings').onclick = () => openModal('settingsModal');
$('#closeSettings').onclick = () => closeModal('settingsModal');
$('#cancelSettings').onclick = () => closeModal('settingsModal');
$('#saveSettings').onclick = saveSettings;
$('#mobileMenu').onclick = () => elements.sidebar.classList.toggle('open');
$('#manageModels').onclick = openModelManager;
$('#closeModelModal').onclick = () => closeModal('modelModal');

$('#restartOllama').onclick = async () => {
  showToast('Starting Ollama...', 'info');
  try {
    const result = await api('/ollama/start', { method: 'POST' });
    if (result.ok) {
      showToast('Ollama started!', 'success');
      checkConnection();
      loadModels();
    } else {
      showToast(result.error || 'Failed to start Ollama', 'error');
    }
  } catch (err) {
    showToast('Failed to start Ollama', 'error');
  }
};

$('#runSetupAgain').onclick = () => {
  closeModal('settingsModal');
  elements.mainApp.style.display = 'none';
  elements.setupWizard.classList.remove('hidden');
  initSetupWizard();
};

// Modal tabs
$$('.model-tab').forEach(tab => {
  tab.onclick = () => {
    $$('.model-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    $$('.model-tab-content').forEach(c => c.classList.remove('active'));
    $(`#${tab.dataset.tab}ModelsTab`).classList.add('active');
  };
});

// Close modals on backdrop click
$$('.modal-backdrop').forEach(backdrop => {
  backdrop.onclick = () => {
    backdrop.closest('.modal').classList.remove('open');
  };
});

elements.modelSelect.addEventListener('change', updateSendButton);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $$('.modal.open').forEach(m => m.classList.remove('open'));
    closeSidebar();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    createConversation();
  }
});

// Initialize
async function initMainApp() {
  await loadModels();
  await loadConversations();
  await checkConnection();
  setInterval(checkConnection, 30000);
}

// Start the app
(async function() {
  const status = await checkSystemStatus();
  
  // If Ollama is running and has models, go straight to main app
  if (status && status.ollama_running && status.models && status.models.length > 0) {
    elements.setupWizard.classList.add('hidden');
    elements.mainApp.style.display = 'flex';
    initMainApp();
  } else {
    // Show setup wizard
    initSetupWizard();
  }
})();
