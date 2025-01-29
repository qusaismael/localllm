# RUN AI Locally (GUI)

A simple Flask-based web GUI that enables local AI (LLMs) inference using [ollama](https://github.com/jmorganca/ollama) for model serving. This project is currently in **Alpha** phase and open to any contributions. Created by [@qusaismael](https://x.com/qusaismael).

![image](https://github.com/user-attachments/assets/8c0d9b20-43bf-4d14-a916-e9baeaa65f33)

---

## Table of Contents
- [Features](#features)
- [System Requirements & Recommendations](#system-requirements--recommendations)
- [Installation](#installation)
- [Usage](#usage)
- [Project Status](#project-status)
- [Contributing](#contributing)
- [License](#license)
- [References](#references)

---

## Features
- **Multiple Model Support**: Easily switch between different local LLM models (e.g., `deepseek-r1`, `qwen2.5`, `codellama`, etc.).
- **Streaming Responses**: See tokens appear in real time using server-sent events (SSE).
- **Markdown and Code Block Rendering**: Code blocks are properly highlighted, with a copy-to-clipboard feature.
- **Raw Output Toggle**: For advanced debugging, see the raw text output of the model's response.
- **Simple, Clean UI**: A minimalistic interface with a chat-like layout for easy conversation.

---

## System Requirements & Recommendations

- **Python 3.7+**  
  Recommended to ensure compatibility with current Flask and Python libraries.

- **pip / venv** (Python package manager and virtual environment)  
  For clean install and environment isolation.

- **ollama**  
  This code expects an `ollama` binary in your `PATH`, or installed in `/usr/local/bin/ollama`.  
  [Install instructions here](https://github.com/jmorganca/ollama#installation).

- **Memory/GPU Requirements**  
  Depending on the size of the model you plan to run, you may need substantial system memory (RAM) or a GPU that supports local inference:
  - For smaller models like `deepseek-r1:1.5b`, you can run on as little as 8 GB RAM (though 16 GB is recommended).
  - Larger models, such as `llama3.2:latest` or `deepseek-r1:14b`, may require more RAM and a capable GPU for feasible inference speed.

For advanced usage, you might want to check out:
- [GPUs with CUDA Support](https://developer.nvidia.com/cuda-downloads) (for GPU-accelerated inference if your chosen LLM tooling supports it).
- Enough disk space to store the model weights (model size can range from a few GBs to tens of GBs).

---

## Installation

1. **Clone the Repository**  
   ```bash
   git clone https://github.com/qusaismael/localllm.git
   cd localllm
   ```
   
2. **Create and Activate a Virtual Environment** (recommended)  
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Linux/Mac
   # or
   venv\Scripts\activate     # On Windows
   ```

3. **Install Flask**  
   ```bash
   pip install flask
   ```

4. **Check ollama Availability**  
   Make sure `ollama` is installed and in your `PATH`, or update the `ollama_path` variable in the script to match your installation.

---

## Usage

1. **Start the Flask Server**  
   ```bash
   python app.py
   ```
   By default, it will run on `http://127.0.0.1:5000`.

2. **Open in Browser**  
   Go to [http://127.0.0.1:5000](http://127.0.0.1:5000) to see the GUI.

3. **Select a Model**  
   Click on any of the model buttons to load your desired LLM. (Please ensure the model is actually available for `ollama`.)

4. **Enter a Prompt**  
   Type your prompt in the text area and press **Send**.  
   - **SHIFT + ENTER** for a new line within the same prompt.  
   - **ENTER** to submit.

5. **View Responses**  
   - **Formatted**: Renders basic Markdown.  
   - **Raw Output**: Click “Show raw output” to see the chain-of-thought or debug logs.

---

## Project Status

- **Alpha Phase**: The project is functional but in early development.  
- **Frequent Changes**: Expect some changes in the coming days.

---

## Contributing

I warmly welcome contributions from the community!

1. **Fork** the repository.
2. **Create a new branch** for your feature/fix.
3. **Commit and push** to your branch.
4. **Submit a Pull Request** describing your changes.

Before submitting, please ensure:
- Code is well-tested and linted.
- Documentation is updated if needed.

Any ideas, feature requests, or bug reports? Please [open an issue](https://github.com/qusaismael/localllm/issues)!

---

## License

This project is open source, distributed under the [MIT License](./LICENSE). Feel free to modify and distribute, but please give proper attribution.

---

## References

- **ollama**  
   [https://github.com/ollama/ollama](https://github.com/ollama/ollama)


---

**Created by [@qusaismael](https://x.com/qusaismael).**  
**Open Source. Contributions Welcome!**  
