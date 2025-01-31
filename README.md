# RUN AI Locally (GUI)

![Python Version](https://img.shields.io/badge/python-3.7%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A simple Flask-based web GUI that enables local AI (LLMs) inference using [ollama](https://github.com/ollama/ollama) for model serving. This project is currently in **Alpha** phase and open to any contributions. Created by [@qusaismael](https://x.com/qusaismael).

If you'd like to support this project, consider donating via PayPal: [![Donate](https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif)](https://paypal.me/l8rontop)

![image](https://github.com/user-attachments/assets/9f4b13aa-fa0b-495b-a44f-bc88610ea0f8)


---

## Table of Contents
- [Features](#features)
- [System Requirements & Recommendations](#system-requirements--recommendations)
- [Installation](#installation)
- [Usage](#usage)
- [Security Notice](#security-notice)
- [Troubleshooting](#troubleshooting)
- [Project Status](#project-status)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)
- [References](#references)

---

## Features
- **Multiple Model Support**: Easily switch between different local LLM models (e.g., `deepseek-r1`, `qwen2.5`, `codellama`, etc.)
- **Streaming Responses**: See tokens appear in real time using server-sent events (SSE)
- **Markdown and Code Block Rendering**: Code blocks with syntax highlighting and copy-to-clipboard
- **Raw Output Toggle**: Debug with raw text output visibility
- **Cross-Platform**: Works on Windows, Linux, and macOS
- **Keyboard Shortcuts**:
  - **Shift+Enter**: New line
  - **Enter**: Send message

---

## System Requirements & Recommendations

- **Python 3.7+**  
  Required for Flask compatibility

- **pip/venv**  
  For dependency management and environment isolation

- **ollama**  
  [Installation required](https://github.com/ollama/ollama#installation)  
  Verify installation:
  ```bash
  ollama --version

- **Hardware**:
  - **Minimum**: 8GB RAM (for smaller models)
  - **Recommended**: 16GB+ RAM + NVIDIA GPU (for larger models)
  - **Disk Space**: 10GB+ for model storage

---

## Installation

1. **Clone Repository**
   ```bash
   git clone https://github.com/qusaismael/localllm.git
   cd localllm
   ```

2. **Setup Virtual Environment**
   ```bash
   # Linux/macOS
   python3 -m venv venv
   source venv/bin/activate

   # Windows
   python -m venv venv
   venv\Scripts\activate
   ```

3. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Ollama**
   - Ensure Ollama is running:
     ```bash
     ollama serve
     ```
   - Download models first:
     ```bash
     ollama pull deepseek-r1:14b
     ```

---

## Usage

1. **Start Server**
   ```bash
   python app.py
   ```
   Access at `http://localhost:5000`

2. **First-Time Setup**
   - Select model from available options
   - If models aren't listed, ensure they're downloaded via Ollama

3. **Basic Operations**
   - Type prompt & press Enter to send
   - Toggle raw output for debugging
   - Copy code blocks with one click

---

## Security Notice

⚠️ **Important Security Considerations**:
- Default binding: `0.0.0.0` (accessible on your network)
- Not recommended for public internet exposure
- No authentication layer implemented
- Use firewall rules to restrict access if needed

---

## Troubleshooting

**Common Issues**:

1. **"Model not found" error**
   ```bash
   ollama pull <model-name>
   ```

2. **Port conflict**
   Modify `PORT` variable in `app.py`

3. **Slow responses**
   - Try smaller models first
   - Check system resource usage
   - Ensure GPU acceleration is enabled if available

4. **Windows path issues**
   Update `OLLAMA_PATH` in `app.py` to your installation path

---

## Project Status

**Alpha Release**  
Current version: 0.1.0

Known Limitations:
- No conversation history
- Basic error handling
- Limited model configuration

---

## Roadmap

- [ ] Conversation history support
- [ ] Model download UI
- [ ] Docker support
- [ ] System resource monitoring

---

## Contributing

**Welcome!** Please follow these steps:

1. Fork repository
2. Create feature branch
3. Submit PR with description

**Development Setup**:
```bash
pip install -r requirements-dev.txt
pre-commit install
```

**Guidelines**:
- Follow PEP8 style
- Add tests for new features
- Update documentation accordingly

---

## License

MIT License - See [LICENSE](LICENSE) for details

---

## Acknowledgments

- Built with [Flask](https://flask.palletsprojects.com/)
- LLM backend by [Ollama](https://ollama.ai)
- Inspired by the Open Source AI community

---

## References

- [Ollama Documentation](https://github.com/ollama/ollama)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [CUDA Installation Guide](https://developer.nvidia.com/cuda-downloads)

---

**Created by [@qusaismael](https://x.com/qusaismael)**  
**Open Source • Contributions Welcome!**
