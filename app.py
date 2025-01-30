"""
Local AI GUI - Flask Application

A web interface for running local LLMs through Ollama.

Features:
- Model selection from predefined list
- Real-time streaming responses
- Health monitoring endpoint
- Model availability checking
- ANSI escape code cleaning for clean output
"""

import re
import shutil
import subprocess
import logging
from flask import Flask, request, render_template, Response, stream_with_context

class Config:
    """Application configuration settings"""
    
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
    DEBUG = False

# Initialize Flask application
app = Flask(__name__)
app.config.from_object(Config)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ANSI escape sequence cleaner
ansi_escape = re.compile(r'\x1B\[[0-?]*[ -/]*[@-~]')

@app.route("/health")
def health_check():
    """Endpoint for system health monitoring
    
    Returns:
        JSON: System health status and Ollama availability
    """
    try:
        subprocess.run(
            [Config.OLLAMA_PATH, "--version"],
            capture_output=True,
            check=True
        )
        return {"status": "healthy", "ollama": "accessible"}, 200
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {"status": "unhealthy", "error": str(e)}, 503

@app.route("/models")
def list_models():
    """Endpoint to list available Ollama models
    
    Returns:
        JSON: List of available models or error message
    """
    try:
        result = subprocess.run(
            [Config.OLLAMA_PATH, "list"],
            capture_output=True,
            text=True,
            check=True
        )
        return {"models": result.stdout.strip().split("\n")}, 200
    except Exception as e:
        logger.error(f"Failed to list models: {str(e)}")
        return {"error": str(e)}, 500

@app.route("/")
def index():
    """Render main chat interface
    
    Returns:
        HTML: Rendered template with available models
    """
    return render_template('index.html', models=Config.AVAILABLE_MODELS)

@app.route("/stream_chat", methods=["POST"])
def stream_chat():
    """Handle streaming chat requests
    
    Returns:
        EventStream: Server-sent events stream with model responses
    """
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "").strip()
    model = data.get("model", "").strip()

    # Validate input
    if not prompt or not model:
        def error_gen():
            yield "data: Missing prompt or model.\n\n"
            yield "data: [DONE]\n\n"
        return Response(error_gen(), mimetype='text/event-stream')

    if model not in Config.AVAILABLE_MODELS:
        def invalid_model_gen():
            yield f"data: Invalid model '{model}'.\n\n"
            yield "data: [DONE]\n\n"
        return Response(invalid_model_gen(), mimetype='text/event-stream')

    def sse_generator():
        try:
            with subprocess.Popen(
                [Config.OLLAMA_PATH, "run", model],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                bufsize=1
            ) as proc:
                if proc.stdin:
                    proc.stdin.write(prompt)
                    proc.stdin.close()

                # Stream and clean output
                for line in proc.stdout:
                    clean_line = ansi_escape.sub('', line)
                    if clean_line.strip():
                        yield f"data: {clean_line}\n\n"

                # Handle errors
                err_output = proc.stderr.read()
                return_code = proc.wait()
                if return_code != 0:
                    err_msg = f"Ollama exited {return_code}.\n{err_output.strip()}"
                    yield f"data: {err_msg}\n\n"

                yield "data: [DONE]\n\n"

        except Exception as e:
            logger.error(f"Stream error: {str(e)}")
            err_msg = f"Exception in stream_chat: {str(e)}"
            yield f"data: {err_msg}\n\n"
            yield "data: [DONE]\n\n"

    return Response(stream_with_context(sse_generator()), mimetype='text/event-stream')

if __name__ == "__main__":
    """Main entry point for the application"""
    logger.info(f"Starting server on {Config.HOST}:{Config.PORT}")
    logger.info(f"Using Ollama path: {Config.OLLAMA_PATH}")
    app.run(
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG,
        threaded=True
    )