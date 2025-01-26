import subprocess
import shutil
import re
import time
from flask import Flask, request, render_template_string, Response, stream_with_context

app = Flask(__name__)

ollama_path = shutil.which("ollama")
if not ollama_path:
    ollama_path = "/usr/local/bin/ollama"

ansi_escape = re.compile(r'\x1B\[[0-?]*[ -/]*[@-~]')

available_models = [
    "deepseek-r1:14b",
    "deepseek-r1:8b",
    "qwen2.5:latest",
    "codellama:13b",
    "deepseek-r1:7b",
    "deepseek-r1:1.5b",
    "llama3.2:latest"
]

html_template = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>RUN AI LOCALLY (GUI)</title>
    <style>
        body {
            background-color: #343541; 
            color: #d1d5db;
            font-family: Arial, sans-serif;
            margin: 0; 
            padding: 0;
        }
        .container {
            width: 80%;
            margin: 20px auto;
            max-width: 800px;
        }
        h1 {
            color: #fff;
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
        }
        .model-buttons {
            text-align: center;
            margin-bottom: 20px;
        }
        .model-buttons button {
            background-color: #4f46e5;
            color: #fff;
            border: none;
            padding: 10px 15px;
            margin: 5px;
            cursor: pointer;
            border-radius: 5px;
        }
        .model-buttons button:hover {
            background-color: #4338ca;
        }
        .chat-window {
            background-color: #444654;
            padding: 15px;
            border-radius: 10px;
            height: 500px;
            overflow-y: auto;
        }
        .message {
            margin-bottom: 15px;
        }
        .message.user {
            text-align: right;
        }
        .message.assistant {
            text-align: left;
        }
        /* Bubble styling */
        .message p {
            background-color: #3c3f4d;
            display: inline-block;
            padding: 10px;
            border-radius: 10px;
            max-width: 80%;
            white-space: pre-wrap;
        }
        /* Code block styling */
        .formatted-content pre, code {
            background: #2b2b2b; 
            color: #f8f8f2;
            border-radius: 5px;
            font-family: "Courier New", Courier, monospace;
        }
        .formatted-content pre {
            padding: 10px; 
            overflow: auto;
            margin-bottom: 10px;
        }
        .code-block {
            position: relative;
            margin-bottom: 1em;
        }
        .copy-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background-color: #4f46e5;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 5px 8px;
            cursor: pointer;
            font-size: 0.8rem;
        }
        .copy-btn:hover {
            background-color: #4338ca;
        }
        .input-area {
            margin-top: 10px;
            display: flex;
        }

        #userInput {
            flex: 1;
            padding: 10px;
            border-radius: 5px;
            border: none;
            font-size: 1em;
            resize: none;
            height: 50px;
            line-height: 1.2em;
            max-height: 200px;
            overflow-y: auto;
        }
        #sendBtn {
            padding: 10px;
            background-color: #4f46e5;
            border: none;
            color: #fff;
            border-radius: 5px;
            margin-left: 10px;
            cursor: pointer;
        }
        #sendBtn:hover {
            background-color: #4338ca;
        }

        .streaming {
            animation: blinkingCursor 1.2s infinite;
        }
        @keyframes blinkingCursor {
            0% { opacity: 0; }
            50% { opacity: 1; }
            100% { opacity: 0; }
        }
        /* Raw-output toggle */
        .raw-container {
            margin-top: 10px;
            display: none;
            background: #2f2f3e;
            padding: 10px;
            border-radius: 4px;
        }
        .raw-container pre {
            max-height: 200px;
            overflow: auto;
            background: #222;
            color: #eee;
            white-space: pre-wrap;
        }
        .toggle-raw-btn {
            background-color: #4f46e5;
            border: none;
            color: #fff;
            padding: 5px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.75rem;
            margin-top: 5px;
        }
        .toggle-raw-btn:hover {
            background-color: #4338ca;
        }
    </style>
</head>
<body>
<div class="container">
    <h1>Local AI GUI</h1>
    <div class="model-buttons">
        {% for m in models %}
        <button onclick="selectModel('{{m}}')">{{m}}</button>
        {% endfor %}
    </div>
    <div class="chat-window" id="chatWindow"></div>
    <div class="input-area">
        <!-- Multi-line text area -->
        <textarea 
            id="userInput" 
            placeholder="Type your message..."
            onkeydown="textareaKeyDown(event)"
        ></textarea>
        <button id="sendBtn" onclick="sendMessage()">Send</button>
    </div>
</div>

<script>
    let selectedModel = null;

    function selectModel(modelName) {
        selectedModel = modelName;
        const chatWindow = document.getElementById('chatWindow');
        chatWindow.innerHTML += 
            '<div class="message assistant"><p>Model selected: ' 
            + escapeHtml(modelName) + '</p></div>';
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // SHIFT+ENTER => new line, ENTER => send
    function textareaKeyDown(e) {
        if (e.key === "Enter") {
            if (!e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        }
    }

    // Escapes user-supplied text so it doesn't render HTML tags
    function escapeHtml(str) {
        if (!str) return "";
        return str
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
    }

    // Basic Markdown formatting
    function formatMarkdown(text) {
        // HEADINGS
        text = text.replace(/^#{1}\s+(.*)$/gm, "<h1>$1</h1>");
        text = text.replace(/^#{2}\s+(.*)$/gm, "<h2>$1</h2>");
        text = text.replace(/^#{3}\s+(.*)$/gm, "<h3>$1</h3>");

        // BOLD
        text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        // ITALIC
        text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");

        // CODE BLOCKS
        text = text.replace(/```([\s\S]*?)```/gm, function(match, codeContent) {
            // Because we already escaped the input, no real HTML can run here
            return `
                <div class="code-block">
                    <button class="copy-btn" onclick="copyToClipboard(\`${codeContent}\`)">Copy code</button>
                    <pre><code>${codeContent}</code></pre>
                </div>
            `;
        });

        // INLINE CODE
        text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

        // Convert single leading "- " to bullet
        text = text.replace(/^\-\s+(.*)$/gm, "<ul><li>$1</li></ul>");

        return text;
    }

    function copyToClipboard(str) {
        navigator.clipboard.writeText(str).then(function() {
            alert("Code copied to clipboard!");
        }, function() {
            alert("Failed to copy code.");
        });
    }

    async function sendMessage() {
        const inputField = document.getElementById('userInput');
        const userText = inputField.value.trim();
        if (!userText) return;
        if (!selectedModel) {
            alert("Please select a model first.");
            return;
        }

        const chatWindow = document.getElementById('chatWindow');
        chatWindow.innerHTML += 
            '<div class="message user"><p>' + escapeHtml(userText) + '</p></div>';
        chatWindow.scrollTop = chatWindow.scrollHeight;
        
        inputField.value = "";

        const assistantMsg = document.createElement("div");
        assistantMsg.classList.add("message", "assistant", "formatted-content");
        
        // We'll build two sections:
        // 1) Normal "formatted" content
        // 2) A hidden "raw" part for chain-of-thought or debugging
        const assistantParagraph = document.createElement("p");
        assistantParagraph.innerHTML = "<span id='streamContent'></span><span class='streaming'>|</span>";

        // Container for raw output
        const rawContainer = document.createElement("div");
        rawContainer.classList.add("raw-container");
        const rawPre = document.createElement("pre");
        rawContainer.appendChild(rawPre);

        // Toggle button to show/hide the raw text
        const toggleBtn = document.createElement("button");
        toggleBtn.classList.add("toggle-raw-btn");
        toggleBtn.innerText = "Show raw output";
        toggleBtn.onclick = () => {
            if (rawContainer.style.display === "none") {
                rawContainer.style.display = "block";
                toggleBtn.innerText = "Hide raw output";
            } else {
                rawContainer.style.display = "none";
                toggleBtn.innerText = "Show raw output";
            }
        };

        assistantMsg.appendChild(assistantParagraph);
        assistantMsg.appendChild(toggleBtn);
        assistantMsg.appendChild(rawContainer);

        chatWindow.appendChild(assistantMsg);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        let rawText = "";

        try {
            // POST to /stream_chat
            const response = await fetch("/stream_chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: userText,
                    model: selectedModel
                })
            });

            if (!response.ok) {
                assistantParagraph.querySelector('.streaming')?.remove();
                assistantParagraph.innerHTML += 
                  "<br><em>Error: " + response.statusText + "</em>";
                return;
            }

            // Read the response body as a stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let partial = "";

            while(true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                const chunk = decoder.decode(value, { stream: true });
                partial += chunk;

                // The server emits lines that start with "data: "
                let lines = partial.split(/\\r?\\n/);
                partial = lines.pop();  // keep incomplete line in partial

                for (let line of lines) {
                    if (line.startsWith("data: ")) {
                        let data = line.slice(6); // remove "data: "
                        if (data === "[DONE]") {
                            assistantParagraph.querySelector('.streaming')?.remove();
                            break;
                        } else {
                            rawText += data + "\\n";
                            rawPre.textContent = rawText;

                            // Escape the chunk so HTML won't render
                            let escapedChunk = escapeHtml(data);
                            let current = assistantParagraph
                                .querySelector('#streamContent').innerHTML;
                            current += escapedChunk + "\\n";
                            assistantParagraph.querySelector('#streamContent').innerHTML 
                                = formatMarkdown(current);
                            chatWindow.scrollTop = chatWindow.scrollHeight;
                        }
                    }
                }
            }

            assistantParagraph.querySelector('.streaming')?.remove();

        } catch (err) {
            console.error("SendMessage error:", err);
            assistantParagraph.innerHTML += 
              "<br><em>Error: " + escapeHtml(String(err)) + "</em>";
        }
    }
</script>
</body>
</html>
"""

@app.route("/")
def index():
    return render_template_string(html_template, models=available_models)

@app.route("/stream_chat", methods=["POST"])
def stream_chat():
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "").strip()
    model = data.get("model", "").strip()

    # Validate inputs
    if not prompt or not model:
        def error_gen():
            yield "data: Missing prompt or model.\n\n"
            yield "data: [DONE]\n\n"
        return Response(error_gen(), mimetype='text/event-stream')

    if model not in available_models:
        def invalid_model_gen():
            yield f"data: Invalid model '{model}'.\n\n"
            yield "data: [DONE]\n\n"
        return Response(invalid_model_gen(), mimetype='text/event-stream')

    def sse_generator():
        try:
            with subprocess.Popen(
                [ollama_path, "run", model],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                bufsize=1
            ) as proc:
                if proc.stdin:
                    proc.stdin.write(prompt)
                    proc.stdin.close()

                for line in proc.stdout:
                    clean_line = ansi_escape.sub('', line)
                    # SSE line
                    if clean_line.strip():
                        yield f"data: {clean_line}\n\n"

                err_output = proc.stderr.read()
                return_code = proc.wait()
                if return_code != 0:
                    err_msg = (f"Ollama exited {return_code}.\n{err_output.strip()}")
                    yield f"data: {err_msg}\n\n"

                yield "data: [DONE]\n\n"

        except Exception as e:
            err_msg = f"Exception in stream_chat: {str(e)}"
            yield f"data: {err_msg}\n\n"
            yield "data: [DONE]\n\n"

    return Response(stream_with_context(sse_generator()), mimetype='text/event-stream')

if __name__ == "__main__":
    app.run(debug=True, threaded=True)
