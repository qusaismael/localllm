# Local AI

A simple web interface for chatting with local LLMs through Ollama.

## Setup

1. Install [Ollama](https://ollama.com) and pull a model:
   ```
   ollama pull llama3.2
   ```

2. Run the app:
   ```
   pip install flask
   python app.py
   ```

3. Open http://localhost:5000

## Features

- Persistent chat history (stored locally in SQLite)
- Search across conversations
- Export to markdown
- Change Ollama URL from settings (for remote instances)
- Works with any Ollama model

## Configuration

By default connects to Ollama at `localhost:11434`. Change this in Settings if running Ollama elsewhere.

## License

MIT
