/**
 * Local AI GUI - Client-Side Application
 *
 * Handles user interactions, multiple chats, streaming responses from the Flask endpoint,
 * and markdown rendering using Marked.js and syntax highlighting via Highlight.js.
 */

// Utility Function to generate a UUID for chat IDs
function generateUUID() {
  var d = new Date().getTime();
  var d2 = (performance && performance.now && (performance.now() * 1000)) || 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16;
    if (d > 0) {
      r = (d + r) % 16 | 0;
      d = Math.floor(d / 16);
    } else {
      r = (d2 + r) % 16 | 0;
      d2 = Math.floor(d2 / 16);
    }
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Global state in the browser
let chats = {}; // { chat_id: { name: "Chat Title", messages: [ { question, answer }, ... ] } }
let currentChatId = ""; // The id of the currently active chat
let selectedModel = null;

// DOM references
const chatWindow = document.getElementById('chatWindow');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const chatList = document.getElementById('chatList');
const modelSelect = document.getElementById('modelSelect');
const newChatBtn = document.getElementById('newChatBtn');

// Event listeners
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', handleTextareaKeyDown);
modelSelect.addEventListener('change', () => {
  selectedModel = modelSelect.value;
});
newChatBtn.addEventListener('click', createNewChat);

// Initialize default settings on page load
window.addEventListener('DOMContentLoaded', () => {
  if (modelSelect && modelSelect.options.length > 0) {
    selectedModel = modelSelect.value;
  }
  // Create a default chat if none exists
  if (!currentChatId) {
    createNewChat("Chat 1");
  }
});

// Chat management functions
function createNewChat(defaultName) {
  const chatName = defaultName || prompt("Enter a name for the new chat:");
  if (!chatName) return;

  const chatId = generateUUID();
  chats[chatId] = {
    name: chatName,
    messages: []
  };
  currentChatId = chatId;
  renderChatList();
  renderMessages();
}

function renderChatList() {
  chatList.innerHTML = "";
  Object.keys(chats).forEach(chatId => {
    const chat = chats[chatId];
    const li = document.createElement('li');

    const chatNameSpan = document.createElement('span');
    chatNameSpan.textContent = chat.name;
    chatNameSpan.style.cursor = 'pointer';
    chatNameSpan.style.flex = '1';
    chatNameSpan.onclick = () => {
      currentChatId = chatId;
      renderMessages();
    };

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.marginLeft = '10px';
    resetBtn.onclick = async () => {
      try {
        const response = await fetch('/reset_chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId })
        });
        const result = await response.json();
        if (response.ok) {
          chats[chatId].messages = [];
          renderMessages();
        } else {
          alert(result.error || 'Failed to reset chat.');
        }
      } catch (err) {
        console.error('Error resetting chat:', err);
        alert('Failed to reset chat.');
      }
    };

    li.appendChild(chatNameSpan);
    li.appendChild(resetBtn);
    chatList.appendChild(li);
  });
}

function renderMessages() {
  chatWindow.innerHTML = "";
  if (!chats[currentChatId]) return;
  chats[currentChatId].messages.forEach(qa => {
    addMessageToChat({ type: 'user', content: qa.question });
    addMessageToChat({ type: 'assistant', content: qa.answer });
  });
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Keyboard input handling
function handleTextareaKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// Main send and streaming logic
async function sendMessage() {
  const prompt = userInput.value.trim();
  if (!prompt) return;
  if (!selectedModel) {
    alert('Please select a model first');
    return;
  }
  // Add user message to current chat
  if (!chats[currentChatId]) {
    chats[currentChatId] = { name: "Unnamed Chat", messages: [] };
  }
  chats[currentChatId].messages.push({ question: prompt, answer: "" });
  addMessageToChat({ type: 'user', content: prompt });
  userInput.value = '';
  const { contentElement, rawPre } = createAssistantMessageElements();

  try {
    const response = await fetch('/stream_chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: selectedModel, chat_id: currentChatId })
    });
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    await processStreamResponse(response, contentElement, rawPre);
  } catch (err) {
    console.error('Stream error:', err);
    const errorMsg = `Error: ${err.message}`;
    contentElement.innerHTML += `<br><em>${escapeHtml(errorMsg)}</em>`;
    if (chats[currentChatId] && chats[currentChatId].messages.length > 0) {
      chats[currentChatId].messages[chats[currentChatId].messages.length - 1].answer = errorMsg;
    }
  } finally {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
}

// Chat UI helpers
function addMessageToChat({ type, content }) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  const p = document.createElement('p');
  if (type === 'assistant') {
    // Render markdown using Marked.js
    p.innerHTML = marked.parse(content);
  } else {
    p.textContent = content;
  }
  messageDiv.appendChild(p);
  chatWindow.appendChild(messageDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function createAssistantMessageElements() {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message assistant formatted-content';
  const contentDiv = document.createElement('div');
  contentDiv.innerHTML = `<span class="stream-content"></span><span class="streaming">|</span>`;
  const rawContainer = document.createElement('div');
  rawContainer.className = 'raw-container';
  const rawPre = document.createElement('pre');
  rawContainer.appendChild(rawPre);
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'toggle-raw-btn';
  toggleBtn.textContent = 'Show raw output';
  toggleBtn.addEventListener('click', () => {
    if (rawContainer.style.display === 'none' || rawContainer.style.display === '') {
      rawContainer.style.display = 'block';
      toggleBtn.textContent = 'Hide raw output';
    } else {
      rawContainer.style.display = 'none';
      toggleBtn.textContent = 'Show raw output';
    }
  });
  rawContainer.style.display = 'none';
  msgDiv.appendChild(contentDiv);
  msgDiv.appendChild(toggleBtn);
  msgDiv.appendChild(rawContainer);
  chatWindow.appendChild(msgDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return {
    contentElement: contentDiv.querySelector('.stream-content'),
    rawPre
  };
}

// Process streaming server response line by line
async function processStreamResponse(response, contentElement, rawPre) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let partialChunk = '';
  let rawText = '';
  const chatIndex = chats[currentChatId].messages.length - 1;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    partialChunk += chunk;
    const lines = partialChunk.split(/\r?\n/);
    partialChunk = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      if (line.startsWith('data: ')) {
        const data = line.replace('data: ', '').trim();
        if (data === '[DONE]') {
          const cursor = document.querySelector('.streaming');
          if (cursor) cursor.remove();
          break;
        }
        rawText += data + '\n';
        rawPre.textContent = rawText;
        if (chats[currentChatId] && chats[currentChatId].messages[chatIndex]) {
          chats[currentChatId].messages[chatIndex].answer += data + '\n';
        }
        // Update rendered markdown using Marked.js
        contentElement.innerHTML = marked.parse(chats[currentChatId].messages[chatIndex].answer);
        if (typeof hljs !== 'undefined') {
          hljs.highlightAll();
        }
        chatWindow.scrollTop = chatWindow.scrollHeight;
      }
    }
  }
  const cursor = document.querySelector('.streaming');
  if (cursor) cursor.remove();
}

// Utility function to escape HTML
function escapeHtml(unsafe) {
  return unsafe.replace(/[&<"'>]/g, function (match) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return map[match];
  });
}