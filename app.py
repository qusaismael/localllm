import sqlite3
import json
import urllib.request
import urllib.error
import subprocess
import platform
import os
import threading
import shutil
from datetime import datetime
from uuid import uuid4
from flask import Flask, request, jsonify, render_template, Response, g

app = Flask(__name__)
app.config['DATABASE'] = 'chats.db'

# Store for tracking model download progress
model_pull_progress = {}

# Database

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(app.config['DATABASE'])
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db:
        db.close()

def get_db_connection():
    """Get a new database connection (for use outside request context)"""
    conn = sqlite3.connect(app.config['DATABASE'])
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    db = get_db()
    db.executescript('''
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT DEFAULT 'New chat',
            model TEXT,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT,
            role TEXT,
            content TEXT,
            created_at TEXT,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        INSERT OR IGNORE INTO settings (key, value) VALUES ('ollama_url', 'http://localhost:11434');
    ''')
    db.commit()

with app.app_context():
    init_db()

# Settings

def get_setting(key, default=None):
    db = get_db()
    row = db.execute('SELECT value FROM settings WHERE key = ?', (key,)).fetchone()
    return row['value'] if row else default

def set_setting(key, value):
    db = get_db()
    db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, value))
    db.commit()

# Ollama

DEFAULT_OLLAMA_URL = 'http://localhost:11434'

# Cache the URL to avoid repeated DB lookups
_cached_ollama_url = None

def get_ollama_url():
    """Get Ollama URL - works both inside and outside request context"""
    global _cached_ollama_url
    
    # Try to get from request context first
    try:
        from flask import has_request_context
        if has_request_context():
            url = get_setting('ollama_url', None)
            if url and url.strip() and url.startswith('http'):
                _cached_ollama_url = url
                return url
    except:
        pass
    
    # Try cached value
    if _cached_ollama_url and _cached_ollama_url.startswith('http'):
        return _cached_ollama_url
    
    # Try direct DB query outside of request context
    try:
        conn = sqlite3.connect(app.config['DATABASE'])
        cursor = conn.execute('SELECT value FROM settings WHERE key = ?', ('ollama_url',))
        row = cursor.fetchone()
        conn.close()
        if row and row[0] and row[0].strip() and row[0].startswith('http'):
            _cached_ollama_url = row[0]
            return row[0]
    except:
        pass
    
    # Default fallback - also cache it
    _cached_ollama_url = DEFAULT_OLLAMA_URL
    return DEFAULT_OLLAMA_URL

def clear_url_cache():
    """Clear the cached URL (call after settings change)"""
    global _cached_ollama_url
    _cached_ollama_url = None

def ollama_request(endpoint, method='GET', data=None, stream=False, timeout=30):
    base_url = get_ollama_url()
    url = f"{base_url}{endpoint}"
    
    req = urllib.request.Request(url, method=method)
    req.add_header('Content-Type', 'application/json')
    
    body = json.dumps(data).encode() if data else None
    
    if stream:
        return urllib.request.urlopen(req, body, timeout=300)
    
    with urllib.request.urlopen(req, body, timeout=timeout) as resp:
        return json.loads(resp.read().decode())

def find_ollama_path():
    """Find the ollama executable path"""
    # Check common locations
    common_paths = [
        '/usr/local/bin/ollama',
        '/usr/bin/ollama',
        os.path.expanduser('~/.local/bin/ollama'),
        '/opt/ollama/ollama',
    ]
    
    # First check if it's in PATH
    ollama_in_path = shutil.which('ollama')
    if ollama_in_path:
        return ollama_in_path
    
    # Check common locations
    for path in common_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    
    return None

def check_ollama_installed():
    """Check if Ollama is installed on the system"""
    ollama_path = find_ollama_path()
    
    if ollama_path:
        try:
            result = subprocess.run([ollama_path, '--version'], 
                                  capture_output=True, text=True, timeout=5)
            version_output = result.stdout.strip() or result.stderr.strip()
            # Parse version - could be "ollama version 0.1.32" or just "0.1.32"
            version = version_output.replace('ollama version', '').strip()
            if not version or version == '':
                version = 'installed'
            return {'installed': True, 'version': version, 'path': ollama_path}
        except Exception as e:
            return {'installed': True, 'version': 'installed', 'path': ollama_path}
    
    return {'installed': False, 'version': None, 'path': None}

def check_ollama_running():
    """Check if Ollama server is running by making HTTP request"""
    url = get_ollama_url()
    try:
        req = urllib.request.Request(f"{url}/", method='GET')
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except urllib.error.URLError as e:
        print(f"Ollama check failed ({url}): {e}")
        return False
    except Exception as e:
        print(f"Ollama check error ({url}): {e}")
        return False

def get_installed_models():
    """Get list of installed models via API"""
    try:
        data = ollama_request('/api/tags', timeout=5)
        return [m['name'] for m in data.get('models', [])]
    except:
        return []

def start_ollama_server():
    """Attempt to start Ollama server"""
    ollama_info = check_ollama_installed()
    if not ollama_info['installed']:
        return False
    
    ollama_path = ollama_info.get('path') or 'ollama'
    
    try:
        # Start ollama serve in background
        if platform.system() == 'Windows':
            subprocess.Popen([ollama_path, 'serve'], 
                           creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.Popen([ollama_path, 'serve'], 
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           start_new_session=True)
        return True
    except Exception as e:
        print(f"Failed to start Ollama: {e}")
        return False

# Routes

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/settings', methods=['GET', 'POST'])
def settings():
    if request.method == 'POST':
        data = request.get_json()
        if 'ollama_url' in data:
            url = data['ollama_url'].rstrip('/')
            set_setting('ollama_url', url)
            clear_url_cache()  # Clear cached URL when changed
        if 'setup_complete' in data:
            set_setting('setup_complete', 'true' if data['setup_complete'] else 'false')
        return jsonify({'ok': True})
    
    return jsonify({
        'ollama_url': get_setting('ollama_url', 'http://localhost:11434'),
        'setup_complete': get_setting('setup_complete', 'false') == 'true'
    })

@app.route('/api/health')
def health():
    if check_ollama_running():
        return jsonify({'status': 'connected'})
    return jsonify({'status': 'disconnected'}), 503

@app.route('/api/debug')
def debug():
    """Debug endpoint to check what's happening"""
    ollama_url = get_ollama_url()
    is_running = check_ollama_running()
    models = get_installed_models() if is_running else []
    ollama_info = check_ollama_installed()
    
    # Try direct connection test
    connection_error = None
    try:
        req = urllib.request.Request(f"{ollama_url}/", method='GET')
        with urllib.request.urlopen(req, timeout=5) as resp:
            connection_test = f"OK (status {resp.status})"
    except Exception as e:
        connection_test = f"FAILED: {str(e)}"
        connection_error = str(e)
    
    return jsonify({
        'ollama_url': ollama_url,
        'is_running': is_running,
        'connection_test': connection_test,
        'connection_error': connection_error,
        'models': models,
        'ollama_installed': ollama_info['installed'],
        'ollama_version': ollama_info['version'],
        'ollama_path': ollama_info.get('path'),
        'platform': platform.system()
    })

@app.route('/api/system/status')
def system_status():
    """Get complete system status for setup wizard"""
    ollama_info = check_ollama_installed()
    is_running = check_ollama_running()
    
    models = []
    if is_running:
        models = get_installed_models()
    
    # Auto-mark setup complete if everything is ready
    setup_complete = get_setting('setup_complete', 'false') == 'true'
    if is_running and len(models) > 0:
        setup_complete = True
        set_setting('setup_complete', 'true')
    
    return jsonify({
        'ollama_installed': ollama_info['installed'],
        'ollama_version': ollama_info['version'],
        'ollama_path': ollama_info.get('path'),
        'ollama_running': is_running,
        'models': models,
        'platform': platform.system().lower(),
        'setup_complete': setup_complete
    })

@app.route('/api/ollama/start', methods=['POST'])
def start_ollama():
    """Start Ollama server"""
    if not check_ollama_installed()['installed']:
        return jsonify({'error': 'Ollama is not installed'}), 400
    
    if check_ollama_running():
        return jsonify({'ok': True, 'message': 'Already running'})
    
    if start_ollama_server():
        # Wait a bit and check if it started
        import time
        for _ in range(15):
            time.sleep(1)
            if check_ollama_running():
                return jsonify({'ok': True, 'message': 'Started successfully'})
        return jsonify({'error': 'Failed to start - timeout. Try running "ollama serve" manually.'}), 500
    
    return jsonify({'error': 'Failed to start Ollama. Try running "ollama serve" manually.'}), 500

@app.route('/api/models')
def models():
    try:
        data = ollama_request('/api/tags')
        return jsonify([m['name'] for m in data.get('models', [])])
    except Exception as e:
        return jsonify([])  # Return empty array instead of error

@app.route('/api/models/available')
def available_models():
    """Return a curated list of recommended models for beginners"""
    recommended = [
        {
            'name': 'llama3.2:3b',
            'display_name': 'Llama 3.2 (3B)',
            'size': '2.0 GB',
            'description': 'Fast and efficient. Great for everyday tasks.',
            'category': 'recommended',
            'speed': 'fast'
        },
        {
            'name': 'llama3.2:1b',
            'display_name': 'Llama 3.2 (1B)',
            'size': '1.3 GB',
            'description': 'Lightweight and quick. Perfect for basic conversations.',
            'category': 'recommended',
            'speed': 'fastest'
        },
        {
            'name': 'llama3.1:8b',
            'display_name': 'Llama 3.1 (8B)',
            'size': '4.7 GB',
            'description': 'Balanced performance. Good for most use cases.',
            'category': 'popular',
            'speed': 'medium'
        },
        {
            'name': 'mistral:7b',
            'display_name': 'Mistral (7B)',
            'size': '4.1 GB',
            'description': 'Excellent reasoning and coding abilities.',
            'category': 'popular',
            'speed': 'medium'
        },
        {
            'name': 'gemma2:2b',
            'display_name': 'Gemma 2 (2B)',
            'size': '1.6 GB',
            'description': 'Google\'s efficient model. Quick responses.',
            'category': 'recommended',
            'speed': 'fast'
        },
        {
            'name': 'phi3:mini',
            'display_name': 'Phi-3 Mini',
            'size': '2.3 GB',
            'description': 'Microsoft\'s compact powerhouse.',
            'category': 'popular',
            'speed': 'fast'
        },
        {
            'name': 'qwen2.5:3b',
            'display_name': 'Qwen 2.5 (3B)',
            'size': '1.9 GB',
            'description': 'Great multilingual support.',
            'category': 'popular',
            'speed': 'fast'
        },
        {
            'name': 'codellama:7b',
            'display_name': 'Code Llama (7B)',
            'size': '3.8 GB',
            'description': 'Specialized for coding tasks.',
            'category': 'coding',
            'speed': 'medium'
        },
        {
            'name': 'deepseek-coder:6.7b',
            'display_name': 'DeepSeek Coder (6.7B)',
            'size': '3.8 GB',
            'description': 'Excellent code generation and explanation.',
            'category': 'coding',
            'speed': 'medium'
        },
        {
            'name': 'llava:7b',
            'display_name': 'LLaVA (7B)',
            'size': '4.5 GB',
            'description': 'Can understand images! Vision + language.',
            'category': 'vision',
            'speed': 'medium'
        }
    ]
    
    return jsonify(recommended)

@app.route('/api/models/pull', methods=['POST'])
def pull_model():
    """Pull/download a model from Ollama"""
    data = request.get_json()
    model_name = data.get('model')
    
    if not model_name:
        return jsonify({'error': 'Model name required'}), 400
    
    # Check if Ollama is running - try a direct request
    ollama_url = get_ollama_url()
    try:
        test_req = urllib.request.Request(f"{ollama_url}/api/tags", method='GET')
        test_req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(test_req, timeout=5) as resp:
            pass  # Just checking connectivity
    except urllib.error.URLError as e:
        return jsonify({'error': f'Cannot connect to Ollama at {ollama_url}. Make sure Ollama is running (ollama serve).'}), 400
    except Exception as e:
        return jsonify({'error': f'Connection error: {str(e)}'}), 400
    
    # Initialize progress tracking
    pull_id = str(uuid4())
    model_pull_progress[pull_id] = {
        'model': model_name,
        'status': 'starting',
        'progress': 0,
        'completed': False,
        'error': None
    }
    
    def pull_in_background(pull_id, model_name):
        try:
            resp = ollama_request('/api/pull', 'POST', {'name': model_name, 'stream': True}, stream=True)
            
            for line in resp:
                if line:
                    try:
                        chunk = json.loads(line.decode())
                        status = chunk.get('status', '')
                        
                        if 'total' in chunk and 'completed' in chunk:
                            total = chunk['total']
                            completed = chunk['completed']
                            if total > 0:
                                model_pull_progress[pull_id]['progress'] = int((completed / total) * 100)
                        
                        model_pull_progress[pull_id]['status'] = status
                        
                        if status == 'success' or chunk.get('done', False):
                            model_pull_progress[pull_id]['completed'] = True
                            model_pull_progress[pull_id]['progress'] = 100
                            break
                    except json.JSONDecodeError:
                        pass
            
            # Final check
            model_pull_progress[pull_id]['completed'] = True
            model_pull_progress[pull_id]['progress'] = 100
                        
        except Exception as e:
            model_pull_progress[pull_id]['error'] = str(e)
            model_pull_progress[pull_id]['status'] = 'error'
    
    # Start background thread
    thread = threading.Thread(target=pull_in_background, args=(pull_id, model_name))
    thread.daemon = True
    thread.start()
    
    return jsonify({'pull_id': pull_id, 'model': model_name})

@app.route('/api/models/pull/<pull_id>/status')
def pull_status(pull_id):
    """Get the status of a model pull operation"""
    if pull_id not in model_pull_progress:
        return jsonify({'error': 'Pull ID not found'}), 404
    
    return jsonify(model_pull_progress[pull_id])

@app.route('/api/models/<path:model_name>', methods=['DELETE'])
def delete_model(model_name):
    """Delete a model"""
    try:
        ollama_request('/api/delete', 'DELETE', {'name': model_name})
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/conversations')
def list_conversations():
    db = get_db()
    rows = db.execute('''
        SELECT c.*, 
            (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
        FROM conversations c 
        ORDER BY updated_at DESC
    ''').fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/conversations', methods=['POST'])
def create_conversation():
    db = get_db()
    conv_id = str(uuid4())
    now = datetime.now().isoformat()
    data = request.get_json() or {}
    
    db.execute(
        'INSERT INTO conversations (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        (conv_id, data.get('title', 'New chat'), data.get('model'), now, now)
    )
    db.commit()
    return jsonify({'id': conv_id})

@app.route('/api/conversations/<conv_id>')
def get_conversation(conv_id):
    db = get_db()
    conv = db.execute('SELECT * FROM conversations WHERE id = ?', (conv_id,)).fetchone()
    if not conv:
        return jsonify({'error': 'Not found'}), 404
    
    messages = db.execute(
        'SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at',
        (conv_id,)
    ).fetchall()
    
    return jsonify({
        **dict(conv),
        'messages': [dict(m) for m in messages]
    })

@app.route('/api/conversations/<conv_id>', methods=['PATCH'])
def update_conversation(conv_id):
    db = get_db()
    data = request.get_json()
    
    if 'title' in data:
        db.execute('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
                   (data['title'], datetime.now().isoformat(), conv_id))
        db.commit()
    
    return jsonify({'ok': True})

@app.route('/api/conversations/<conv_id>', methods=['DELETE'])
def delete_conversation(conv_id):
    db = get_db()
    db.execute('DELETE FROM messages WHERE conversation_id = ?', (conv_id,))
    db.execute('DELETE FROM conversations WHERE id = ?', (conv_id,))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/conversations/<conv_id>/messages')
def get_messages(conv_id):
    db = get_db()
    messages = db.execute(
        'SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at',
        (conv_id,)
    ).fetchall()
    return jsonify([dict(m) for m in messages])

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    conv_id = data.get('conversation_id')
    message = data.get('message', '').strip()
    model = data.get('model')
    
    if not all([conv_id, message, model]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    db = get_db()
    now = datetime.now().isoformat()
    
    db.execute(
        'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)',
        (conv_id, 'user', message, now)
    )
    db.execute('UPDATE conversations SET model = ?, updated_at = ? WHERE id = ?', (model, now, conv_id))
    db.commit()
    
    history = db.execute(
        'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at',
        (conv_id,)
    ).fetchall()
    
    # Build messages array for chat API
    messages_list = []
    for msg in history:
        messages_list.append({
            'role': msg['role'],
            'content': msg['content']
        })
    
    # Store values we need in the generator
    db_path = app.config['DATABASE']
    ollama_url = get_ollama_url()
    
    def generate():
        full_response = []
        stats = {}
        start_time = datetime.now()
        
        try:
            # Make request to Ollama
            url = f"{ollama_url}/api/chat"
            req = urllib.request.Request(url, method='POST')
            req.add_header('Content-Type', 'application/json')
            body = json.dumps({
                'model': model, 
                'messages': messages_list, 
                'stream': True
            }).encode()
            
            resp = urllib.request.urlopen(req, body, timeout=300)
            
            for line in resp:
                if line:
                    chunk = json.loads(line.decode())
                    if 'message' in chunk and 'content' in chunk['message']:
                        text = chunk['message']['content']
                        full_response.append(text)
                        yield f"data: {json.dumps({'text': text})}\n\n"
                    
                    if chunk.get('done'):
                        # Extract stats from the final chunk
                        stats = {
                            'total_duration': chunk.get('total_duration', 0),
                            'load_duration': chunk.get('load_duration', 0),
                            'prompt_eval_count': chunk.get('prompt_eval_count', 0),
                            'prompt_eval_duration': chunk.get('prompt_eval_duration', 0),
                            'eval_count': chunk.get('eval_count', 0),
                            'eval_duration': chunk.get('eval_duration', 0),
                        }
                        break
            
            # Calculate derived stats
            eval_duration_sec = stats.get('eval_duration', 0) / 1e9  # nanoseconds to seconds
            eval_count = stats.get('eval_count', 0)
            tokens_per_sec = eval_count / eval_duration_sec if eval_duration_sec > 0 else 0
            total_duration_sec = stats.get('total_duration', 0) / 1e9
            
            # Calculate actual elapsed time as fallback
            elapsed = (datetime.now() - start_time).total_seconds()
            if total_duration_sec == 0:
                total_duration_sec = elapsed
            
            final_stats = {
                'tokens': eval_count,
                'tokens_per_sec': round(tokens_per_sec, 1),
                'duration': round(total_duration_sec, 2),
                'prompt_tokens': stats.get('prompt_eval_count', 0),
            }
            
            # Save to database using a fresh connection
            complete = ''.join(full_response)
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)',
                    (conv_id, 'assistant', complete, datetime.now().isoformat())
                )
                
                # Auto-title for first message
                msg_count = conn.execute(
                    'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?', 
                    (conv_id,)
                ).fetchone()['cnt']
                
                if msg_count == 2:  # User + Assistant
                    title = message[:50] + ('...' if len(message) > 50 else '')
                    conn.execute('UPDATE conversations SET title = ? WHERE id = ?', (title, conv_id))
                
                conn.commit()
            finally:
                conn.close()
            
            yield f"data: {json.dumps({'done': True, 'stats': final_stats})}\n\n"
            
        except urllib.error.URLError as e:
            yield f"data: {json.dumps({'error': 'Cannot connect to Ollama. Make sure it is running.'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache', 
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive'
    })

@app.route('/api/search')
def search():
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify([])
    
    db = get_db()
    results = db.execute('''
        SELECT m.conversation_id, m.content, m.role, c.title
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.content LIKE ?
        ORDER BY m.created_at DESC
        LIMIT 20
    ''', (f'%{q}%',)).fetchall()
    
    return jsonify([dict(r) for r in results])

@app.route('/api/export/<conv_id>')
def export_conversation(conv_id):
    db = get_db()
    conv = db.execute('SELECT * FROM conversations WHERE id = ?', (conv_id,)).fetchone()
    if not conv:
        return jsonify({'error': 'Not found'}), 404
    
    messages = db.execute(
        'SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at',
        (conv_id,)
    ).fetchall()
    
    md = f"# {conv['title']}\n\n"
    md += f"*Exported: {datetime.now().strftime('%Y-%m-%d %H:%M')}*\n\n---\n\n"
    
    for msg in messages:
        role = '**You**' if msg['role'] == 'user' else '**Assistant**'
        md += f"{role}\n\n{msg['content']}\n\n---\n\n"
    
    return Response(md, mimetype='text/markdown', headers={
        'Content-Disposition': f'attachment; filename="{conv["title"][:30]}.md"'
    })

if __name__ == '__main__':
    print('Server running at http://localhost:5000')
    app.run(host='127.0.0.1', port=5000, debug=True)
