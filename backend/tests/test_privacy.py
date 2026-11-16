import pytest
from fastapi.testclient import TestClient
import main

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('SESSION_SECRET', 'test-session-secret-' + 'a' * 40)
    return TestClient(main.app)

def headers(client):
    return {'Authorization': 'Bearer ' + client.post('/sessions').json()['token']}

def test_missing_and_forged_session_are_rejected(client):
    assert client.post('/ask', json={'question': 'Hello'}).status_code == 401
    token = client.post('/sessions').json()['token']
    assert client.post('/ask', json={'question': 'Hello'}, headers={'Authorization': 'Bearer ' + token + 'x'}).status_code == 401

def test_invalid_pdf_and_oversized_upload(client, monkeypatch):
    auth = headers(client)
    assert client.post('/upload-pdf', headers=auth, files={'files': ('x.pdf', b'not a pdf')}).status_code == 400
    monkeypatch.setattr(main, 'MAX_FILE_BYTES', 10)
    assert client.post('/upload-pdf', headers=auth, files={'files': ('x.pdf', b'%PDF-' + b'x'*20)}).status_code == 413

def test_sessions_cannot_retrieve_each_others_documents(client, monkeypatch):
    first, second = headers(client), headers(client)
    owner = first['Authorization'].split(' ')[1].split('.')[0]
    class Store:
        def delete(self, **kwargs): pass
        def get(self, where, include):
            return {'ids': ['one'] if where == {'session': owner} else []}
        def query(self, **kwargs):
            assert kwargs['where'] == {'session': owner}
            return {'documents': [['private document']], 'metadatas': [[{'source': 'safe.pdf', 'page': 1}]]}
    monkeypatch.setattr(main, 'get_collection', lambda: Store())
    monkeypatch.setattr(main, 'get_embeddings', lambda: type('Embed', (), {'embed_query': lambda self,q: [0.1]})())
    monkeypatch.setattr(main, 'generate', lambda *a, **k: type('Answer', (), {'text': 'private answer'})())
    assert client.post('/ask', headers=first, json={'question': 'Q'}).json()['answer'] == 'private answer'
    result = client.post('/ask', headers=second, json={'question': 'Q'}).json()
    assert result['sources'] == []
    assert 'private' not in result['answer']
    stream = client.post('/ask-stream', headers=second, json={'question': 'Q'})
    assert 'private' not in stream.text and 'done' in stream.text

def test_retrieval_errors_do_not_become_general_knowledge_answers(client, monkeypatch):
    def broken(): raise RuntimeError('private-provider-detail')
    monkeypatch.setattr(main, 'get_collection', broken)
    response = client.post('/ask', headers=headers(client), json={'question': 'Q'})
    assert response.status_code == 502
    assert 'private-provider-detail' not in response.text

def test_upload_sanitizes_names_and_scopes_metadata(client, monkeypatch):
    captured = {}
    class Store:
        def delete(self, **kwargs): pass
        def get(self, **kwargs): return {'ids': []}
        def add(self, **kwargs): captured.update(kwargs)
    monkeypatch.setattr(main, 'get_collection', lambda: Store())
    monkeypatch.setattr(main, 'extract_chunks', lambda data,name: [('text', {'source': name, 'page': 1})])
    monkeypatch.setattr(main, 'get_embeddings', lambda: type('Embed', (), {'embed_documents': lambda self,docs: [[.1]]})())
    auth = headers(client)
    response = client.post('/upload-pdf', headers=auth, files={'files': ('../../secret.pdf', b'%PDF-test')})
    assert response.status_code == 200
    assert captured['metadatas'][0]['source'] == 'secret.pdf'
    assert captured['metadatas'][0]['session'] == auth['Authorization'].split(' ')[1].split('.')[0]

def test_expired_session(client, monkeypatch):
    auth = headers(client)
    now = main.time.time()
    monkeypatch.setattr(main.time, 'time', lambda: now + main.SESSION_SECONDS + 10)
    assert client.post('/ask', headers=auth, json={'question': 'Q'}).status_code == 401

def test_real_chroma_collection_enforces_session_filter(client, monkeypatch, tmp_path):
    import chromadb
    collection = chromadb.PersistentClient(path=str(tmp_path)).get_or_create_collection('test_sessions')
    first, second = headers(client), headers(client)
    owner = first['Authorization'].split(' ')[1].split('.')[0]
    collection.add(ids=['private'], documents=['only session one'], embeddings=[[1.0, 0.0]],
        metadatas=[{'session': owner, 'source': 'a.pdf', 'page': 1, 'expires_at': int(main.time.time())+300}])
    monkeypatch.setattr(main, 'get_collection', lambda: collection)
    monkeypatch.setattr(main, 'get_embeddings', lambda: type('Embed', (), {'embed_query': lambda self,q: [1.0,0.0]})())
    context, sources = main.retrieve_context('Q', owner)
    assert context == 'only session one' and sources[0]['page'] == 1
    other = second['Authorization'].split(' ')[1].split('.')[0]
    assert main.retrieve_context('Q', other) == ('', [])
