import os
import re
import shutil
import subprocess
import logging
import uuid
from flask import Flask, request, render_template, Response, stream_with_context, session, jsonify
from flask_session import Session

# ---------------------------
# Configuration
# ---------------------------
class Config:
    # Use an environment variable for the secret key in production!
    SECRET_KEY = os.environ.get('SECRET_KEY', 'replace-this-with-a-secure-key')
    SESSION_TYPE = 'filesystem'
    DEBUG = os.environ.get('DEBUG', 'False') == 'True'
    
    # Ollama settings
    OLLAMA_PATH = shutil.which("ollama") or "/usr/local/bin/ollama"
    DEFAULT_MODEL = "deepseek-r1:14b"
    
    # Available models (update as needed)
    AVAILABLE_MODELS = [
        "deepseek-r1:14b",
        "deepseek-r1:8b",
        "qwen2.5:latest",
        "codellama:13b",
        "deepseek-r1:7b",
        "deepseek-r1:1.5b",
        "llama3.2:latest"
    ]
    
    # Server configuration
    HOST = "0.0.0.0"  # Use "localhost" for local-only access
    PORT = 5000

# ---------------------------
# Initialize Flask Application
# ---------------------------
app = Flask(__name__)
app.config.from_object(Config)
Session(app)

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if app.config['DEBUG'] else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ANSI escape sequence cleaner (for cleaning LLM output)
ansi_escape = re.compile(r'\x1B\[[0-?]*[ -/]*[@-~]')

# ---------------------------
# Helper Functions
# ---------------------------
def generate_chat_id() -> str:
    """Generate a unique chat identifier using UUID4."""
    return str(uuid.uuid4())

def initialize_chat_history(chat_id: str):
    """Initialize chat history for a new chat."""
    if 'chat_histories' not in session:
        session['chat_histories'] = {}
    session['chat_histories'][chat_id] = []
    session.modified = True  # Mark the session as modified
    logger.debug(f"Initialized chat history for chat_id {chat_id}.")

def append_message(chat_id: str, role: str, content: str):
    """Append a message to the chat history."""
    if 'chat_histories' not in session:
        session['chat_histories'] = {}
    if chat_id not in session['chat_histories']:
        initialize_chat_history(chat_id)
    session['chat_histories'][chat_id].append({"role": role, "content": content})
    session.modified = True  # Ensure session changes are saved
    logger.debug(f"Appended {role} message to chat_id {chat_id}: {content}")

def build_full_prompt(chat_id: str) -> str:
    """Build the full prompt including chat history."""
    full_prompt = ""
    for message in session['chat_histories'].get(chat_id, []):
        role = "Human" if message["role"] == "user" else "Assistant"
        full_prompt += f"{role}: {message['content']}\n"
    logger.debug(f"Full prompt for chat_id {chat_id}:\n{full_prompt}")
    return full_prompt

# ---------------------------
# Routes
# ---------------------------
@app.route("/health", methods=["GET"])
def health_check():
    """Endpoint for system health monitoring."""
    try:
        result = subprocess.run(
            [Config.OLLAMA_PATH, "--version"],
            capture_output=True,
            check=True,
            text=True,
            timeout=5
        )
        logger.debug(f"Ollama version: {result.stdout.strip()}")
        return jsonify({
            "status": "healthy",
            "ollama": "accessible",
            "version": result.stdout.strip()
        }), 200
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({"status": "unhealthy", "error": str(e)}), 503

@app.route("/models", methods=["GET"])
def list_models():
    """Endpoint to list available Ollama models."""
    try:
        result = subprocess.run(
            [Config.OLLAMA_PATH, "list"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10
        )
        models = result.stdout.strip().split("\n")
        logger.debug(f"Available models: {models}")
        return jsonify({"models": models}), 200
    except Exception as e:
        logger.error(f"Failed to list models: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/", methods=["GET"])
def index():
    """Render main chat interface."""
    return render_template('index.html', models=Config.AVAILABLE_MODELS)

@app.route("/stream_chat", methods=["POST"])
def stream_chat():
    """Handle streaming chat requests with conversation context."""
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "").strip()
    model = data.get("model", "").strip()
    chat_id = data.get("chat_id", "").strip()  # Required chat identifier

    if not chat_id:
        return jsonify({"error": "Missing chat_id."}), 400

    # Initialize chat history if not present
    if 'chat_histories' not in session or chat_id not in session['chat_histories']:
        initialize_chat_history(chat_id)
    
    if not prompt or not model:
        def error_gen():
            yield "data: Missing prompt, model, or chat_id.\n\n"
            yield "data: [DONE]\n\n"
        logger.warning("Received request with missing prompt, model, or chat_id.")
        return Response(error_gen(), mimetype='text/event-stream')
    
    if model not in Config.AVAILABLE_MODELS:
        def invalid_model_gen():
            yield f"data: Invalid model '{model}'.\n\n"
            yield "data: [DONE]\n\n"
        logger.warning(f"Received request with invalid model: {model}")
        return Response(invalid_model_gen(), mimetype='text/event-stream')
    
    # Append user prompt to chat history
    append_message(chat_id, "user", prompt)
    
    # Build full conversation prompt
    full_prompt = build_full_prompt(chat_id)
    logger.info(f"Processing chat_id {chat_id} with model {model}.")

    def sse_generator():
        try:
            # Launch the LLM subprocess
            with subprocess.Popen(
                [Config.OLLAMA_PATH, "run", model],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                bufsize=1
            ) as proc:
                if proc.stdin:
                    proc.stdin.write(full_prompt)
                    proc.stdin.close()
                    logger.debug(f"Written prompt to Ollama subprocess for chat_id {chat_id}.")
                
                assistant_response = ""
                # Stream and clean output line by line
                for line in proc.stdout:
                    clean_line = ansi_escape.sub('', line)
                    if clean_line.strip():
                        logger.debug(f"Ollama output for chat_id {chat_id}: {clean_line.strip()}")
                        assistant_response += clean_line
                        yield f"data: {clean_line}\n\n"
                
                # Append assistant's response to chat history
                append_message(chat_id, "assistant", assistant_response.strip())
                
                # Check for any error output
                err_output = proc.stderr.read()
                return_code = proc.wait()
                if return_code != 0:
                    err_msg = f"Ollama exited with code {return_code}.\n{err_output.strip()}"
                    logger.error(f"Ollama error for chat_id {chat_id}: {err_msg}")
                    yield f"data: {err_msg}\n\n"
                
                yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Stream error for chat_id {chat_id}: {str(e)}")
            yield f"data: Exception in stream_chat: {str(e)}\n\n"
            yield "data: [DONE]\n\n"
    
    return Response(stream_with_context(sse_generator()), mimetype='text/event-stream')

@app.route("/reset_chat", methods=["POST"])
def reset_chat():
    """Endpoint to reset a specific chat history."""
    data = request.get_json(silent=True) or {}
    chat_id = data.get("chat_id", "").strip()
    
    if not chat_id:
        return jsonify({"error": "Missing chat_id."}), 400
    
    if 'chat_histories' in session and chat_id in session['chat_histories']:
        del session['chat_histories'][chat_id]
        session.modified = True  # Mark session as modified after deletion
        logger.info(f"Chat history for chat_id {chat_id} has been reset.")
        return jsonify({"status": f"Chat history for {chat_id} reset."}), 200
    else:
        logger.warning(f"No chat history found for chat_id {chat_id}.")
        return jsonify({"error": f"No chat history found for chat_id {chat_id}."}), 404

# ---------------------------
# Main Entry Point
# ---------------------------
if __name__ == "__main__":
    logger.info(f"Starting server on {Config.HOST}:{Config.PORT}")
    logger.info(f"Using Ollama path: {Config.OLLAMA_PATH}")
    app.run(
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG,
        threaded=True
    )