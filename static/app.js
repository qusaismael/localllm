/**
 * Local AI GUI - Client-Side Application
 * 
 * Handles user interactions, markdown formatting, and streaming responses
 */

// Global state
let selectedModel = null;

// DOM Elements
const chatWindow = document.getElementById('chatWindow');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

// Event Listeners
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', handleTextareaKeyDown);

// Model Selection Handler
function selectModel(modelName) {
    selectedModel = modelName;
    addMessageToChat({
        type: 'assistant',
        content: `Model selected: ${modelName}`,
        isSystem: true
    });
}

// Keyboard Input Handling
function handleTextareaKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Main Message Sending Logic
async function sendMessage() {
    const prompt = userInput.value.trim();
    if (!prompt || !selectedModel) {
        if (!selectedModel) alert('Please select a model first');
        return;
    }

    // Add user message to chat
    addMessageToChat({
        type: 'user',
        content: prompt
    });

    // Clear input
    userInput.value = '';

    try {
        // Create assistant message container
        const { messageElement, contentElement, rawPre } = createAssistantMessageElements();
        
        // Stream response from server
        const response = await fetch('/stream_chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model: selectedModel })
        });

        if (!response.ok) {
            throw new Error(response.statusText);
        }

        // Process streaming response
        await processStreamResponse(response, contentElement, rawPre);
        
    } catch (err) {
        handleStreamError(err);
    }
}

// Chat Message Management
function addMessageToChat({ type, content, isSystem = false }) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type} ${isSystem ? 'system' : ''}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = isSystem ? escapeHtml(content) : formatMarkdown(escapeHtml(content));
    
    messageDiv.appendChild(contentDiv);
    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function createAssistantMessageElements() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant formatted-content';

    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = '<span class="stream-content"></span><span class="streaming">|</span>';

    const rawContainer = document.createElement('div');
    rawContainer.className = 'raw-container';
    const rawPre = document.createElement('pre');
    rawContainer.appendChild(rawPre);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-raw-btn';
    toggleBtn.textContent = 'Show raw output';
    toggleBtn.addEventListener('click', () => toggleRawOutput(rawContainer, toggleBtn));

    messageDiv.append(contentDiv, toggleBtn, rawContainer);
    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    return {
        messageElement: messageDiv,
        contentElement: contentDiv.querySelector('.stream-content'),
        rawPre
    };
}

// Stream Processing
async function processStreamResponse(response, contentElement, rawPre) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let partialChunk = '';
    let rawText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        partialChunk += chunk;

        const lines = partialChunk.split(/(\r?\n)/);
        partialChunk = lines.pop();

        for (const line of lines.filter(l => l.trim())) {
            if (line.startsWith('data: ')) {
                const data = line.replace('data: ', '').trim();
                if (data === '[DONE]') break;

                rawText += data + '\n';
                rawPre.textContent = rawText;

                contentElement.innerHTML = formatMarkdown(escapeHtml(rawText));
                chatWindow.scrollTop = chatWindow.scrollHeight;
            }
        }
    }

    // Remove streaming cursor
    document.querySelector('.streaming')?.remove();
}

// Error Handling
function handleStreamError(err) {
    console.error('Stream error:', err);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message error';
    errorDiv.textContent = `Error: ${err.message}`;
    chatWindow.appendChild(errorDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Markdown Formatting
function formatMarkdown(text) {
    return text
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`((.|\n)*?)`/g, '<code>$1</code>')
        .replace(/```([\s\S]*?)```/g, (_, code) => `
            <div class="code-block">
                <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(code)}')">
                    Copy Code
                </button>
                <pre><code>${escapeHtml(code)}</code></pre>
            </div>
        `)
        .replace(/^- (.*)/gm, '<ul><li>$1</li></ul>');
}

// Utility Functions
function toggleRawOutput(container, button) {
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
    button.textContent = container.style.display === 'none' 
        ? 'Show raw output' 
        : 'Hide raw output';
}

function escapeHtml(unsafe) {
    return unsafe?.replace(/[&<"'>]/g, match => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[match])) || '';
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(
        () => alert('Code copied to clipboard!'),
        () => alert('Failed to copy code')
    );
}