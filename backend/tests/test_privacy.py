from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event

import pytest
from fastapi.testclient import TestClient
import main
import accounts

@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv('DOCMIND_DB_PATH', str(tmp_path / 'accounts.sqlite3'))
    return TestClient(main.app)

PASSWORD = 'a-strong-test-password'


def account(client, email='first@example.com', route='register'):
    response = client.post(f'/auth/{route}', json={'email': email, 'password': PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()


def headers(client, email='first@example.com'):
    return {'Authorization': 'Bearer ' + account(client, email)['token']}

def test_missing_and_forged_session_are_rejected(client):
    assert client.post('/ask', json={'question': 'Hello'}).status_code == 401
    token = client.post('/sessions').json()['token']
    assert client.post('/ask', json={'question': 'Hello'}, headers={'Authorization': 'Bearer ' + token + 'x'}).status_code == 401


def test_concurrent_logins_keep_chat_histories_separate(client):
    emails = [f'user-{i}@example.com' for i in range(8)]
    registered = [account(client, email) for email in emails]
    start = Barrier(len(emails))
    saved = Barrier(len(emails))

    def use_workspace(email):
        start.wait(timeout=10)
        auth = {'Authorization': 'Bearer ' + account(client, email, route='login')['token']}
        snapshot = {'revision': 0, 'chats': [{'id': 'same-chat-id', 'title': email, 'messages': []}]}
        assert client.post('/chats', headers=auth, json=snapshot).status_code == 200
        saved.wait(timeout=15)
        result = client.get('/chats', headers=auth)
        assert result.json() == {'revision': 1, 'chats': snapshot['chats']}
        assert result.headers['Cache-Control'] == 'no-store'
        assert client.post('/auth/logout', headers=auth).status_code == 200
        assert client.get('/chats', headers=auth).status_code == 401

    with ThreadPoolExecutor(max_workers=len(emails)) as pool:
        list(pool.map(use_workspace, emails))
    for email, user in zip(emails, registered):
        auth = {'Authorization': 'Bearer ' + user['token']}
        assert client.get('/auth/me', headers=auth).json()['email'] == email


def test_inflight_streams_leave_capacity_for_login(client, monkeypatch):
    start = Barrier(5)
    release = Event()
    guest = {'Authorization': 'Bearer ' + client.post('/sessions').json()['token']}
    account(client)

    def generate(*args, **kwargs):
        start.wait(timeout=10)
        assert release.wait(timeout=15)
        yield type('Answer', (), {'text': 'Sample answer'})()

    monkeypatch.setattr(main, 'generate', generate)
    question = {'question': 'When does the library open?'}

    with ThreadPoolExecutor(max_workers=4) as pool:
        streams = [pool.submit(client.post, '/ask-stream', headers=guest, json=question) for _ in range(4)]
        try:
            start.wait(timeout=10)
            rejected = client.post('/ask', headers=guest, json=question)
            assert rejected.status_code == 503
            assert rejected.headers['Retry-After'] == '5'
            assert account(client, route='login')['profile']['role'] == 'user'
        finally:
            release.set()
        for stream in streams:
            assert 'Sample answer' in stream.result(timeout=5).text

    monkeypatch.setattr(main, 'generate', lambda *a, **k: type('Answer', (), {'text': 'Sample answer'})())
    assert client.post('/ask', headers=guest, json=question).status_code == 200


def test_invalid_credentials_are_not_echoed(client):
    response = client.post('/auth/login', json={'email': 'user@example.com', 'password': 'secret'})
    assert response.status_code == 422
    assert 'secret' not in response.text
    assert response.headers['Cache-Control'] == 'no-store'

def test_invalid_pdf_and_oversized_upload(client, monkeypatch):
    auth = headers(client)
    assert client.post('/upload-pdf', headers=auth, files={'files': ('x.pdf', b'not a pdf')}).status_code == 400
    monkeypatch.setattr(main, 'MAX_FILE_BYTES', 10)
    assert client.post('/upload-pdf', headers=auth, files={'files': ('x.pdf', b'%PDF-' + b'x'*20)}).status_code == 413

def test_sessions_cannot_retrieve_each_others_documents(client, monkeypatch):
    first, second = headers(client), headers(client, 'second@example.com')
    owner = client.get('/auth/me', headers=first).json()['id']
    class Store:
        def delete(self, **kwargs): pass
        def get(self, where, include):
            return {'ids': ['one'] if where == {'owner': owner} else []}
        def query(self, **kwargs):
            assert kwargs['where'] == {'owner': owner}
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
    assert captured['metadatas'][0]['owner'] == client.get('/auth/me', headers=auth).json()['id']

def test_expired_session(client, monkeypatch):
    auth = headers(client)
    now = accounts.time.time()
    monkeypatch.setattr(accounts.time, 'time', lambda: now + 8 * 86400)
    assert client.post('/ask', headers=auth, json={'question': 'Q'}).status_code == 401

def test_real_chroma_collection_enforces_session_filter(client, monkeypatch, tmp_path):
    chromadb = pytest.importorskip('chromadb')
    collection = chromadb.PersistentClient(path=str(tmp_path)).get_or_create_collection('test_sessions')
    first, second = headers(client), headers(client, 'second@example.com')
    owner = client.get('/auth/me', headers=first).json()['id']
    collection.add(ids=['private'], documents=['only session one'], embeddings=[[1.0, 0.0]],
        metadatas=[{'owner': owner, 'source': 'a.pdf', 'page': 1}])
    monkeypatch.setattr(main, 'get_collection', lambda: collection)
    monkeypatch.setattr(main, 'get_embeddings', lambda: type('Embed', (), {'embed_query': lambda self,q: [1.0,0.0]})())
    context, sources = main.retrieve_context('Q', owner)
    assert context == '[a.pdf, page 1]\nonly session one' and sources[0]['page'] == 1
    other = client.get('/auth/me', headers=second).json()['id']
    assert main.retrieve_context('Q', other) == ('', [])


def test_guest_cannot_upload_or_access_account_data(client, monkeypatch):
    guest = {'Authorization': 'Bearer ' + client.post('/sessions').json()['token']}
    for path in ['/chats', '/documents', '/admin/users']:
        assert client.get(path, headers=guest).status_code == 403
    assert client.post('/upload-pdf', headers=guest, files={'files': ('a.pdf', b'%PDF-a')}).status_code == 403

    def private_collection():
        raise AssertionError('Guest must never access private document storage.')

    monkeypatch.setattr(main, 'get_collection', private_collection)
    monkeypatch.setattr(main, 'generate', lambda *a, **k: type('Answer', (), {'text': 'Sample answer'})())
    for _ in range(5):
        response = client.post('/ask', headers=guest, json={'question': 'When is the library open?'})
        assert response.json()['sources'][0]['source'] == 'Sample library guide'
    assert client.post('/ask-stream', headers=guest, json={'question': 'One more'}).status_code == 429


def test_chat_history_is_private_and_persists_on_login(client):
    first, second = headers(client), headers(client, 'second@example.com')
    snapshot = {'revision': 0, 'chats': [{'id': 'thread', 'title': 'Private chat', 'messages': []}]}
    assert client.post('/chats', headers=first, json=snapshot).json() == {'revision': 1}
    assert client.post('/chats', headers=first, json=snapshot).status_code == 409
    assert client.get('/chats', headers=second).json() == {'revision': 0, 'chats': []}
    assert client.post('/auth/logout', headers=first).status_code == 200
    assert client.get('/chats', headers=first).status_code == 401
    again = {'Authorization': 'Bearer ' + account(client, route='login')['token']}
    assert client.get('/chats', headers=again).json()['chats'] == snapshot['chats']


def test_only_admin_can_see_account_and_guest_counts(client):
    regular = headers(client)
    client.post('/sessions')
    assert client.get('/admin/users', headers=regular).status_code == 403
    accounts.create_admin('admin@example.com', PASSWORD)
    admin = {'Authorization': 'Bearer ' + account(client, 'admin@example.com', 'login')['token']}
    stats = client.get('/admin/users', headers=admin).json()
    assert (stats['registered'], stats['active_24h'], stats['guest_sessions']) == (2, 2, 1)
    assert {user['email'] for user in stats['users']} == {'admin@example.com', 'first@example.com'}
    assert all(set(user) == {'id', 'email', 'is_admin', 'created_at', 'last_seen', 'plan'} for user in stats['users'])
    assert client.get('/chats', headers=admin).json()['chats'] == []


def test_pro_request_requires_admin_activation_and_expires(client, monkeypatch):
    user = headers(client)
    user_id = client.get('/auth/me', headers=user).json()['id']
    endpoint = f'/admin/users/{user_id}/activate-pro'
    assert client.get('/plans').json()['plans']['pro']['price_inr'] == 600
    assert client.post('/account/upgrade-request', headers=user).json()['tier'] == 'free'
    assert client.post(endpoint, headers=user).status_code == 403

    accounts.create_admin('admin@example.com', PASSWORD)
    admin = {'Authorization': 'Bearer ' + account(client, 'admin@example.com', 'login')['token']}
    upgraded = client.post(endpoint, headers=admin).json()
    assert upgraded['tier'] == 'pro'
    assert upgraded['requested_at'] is None
    assert client.post(endpoint, headers=admin).status_code == 409
    assert client.get('/auth/me', headers=user).json()['plan'] == upgraded

    monkeypatch.setattr(accounts.time, 'time', lambda: upgraded['paid_until'])
    renewed_session = {'Authorization': 'Bearer ' + account(client, route='login')['token']}
    assert client.get('/auth/me', headers=renewed_session).json()['plan']['tier'] == 'free'


def test_free_question_limit_and_pro_increase(client, monkeypatch):
    user = headers(client)
    monkeypatch.setattr(main, 'retrieve_context', lambda *args: ('', []))
    for _ in range(10):
        assert client.post('/ask', headers=user, json={'question': 'Q'}).status_code == 200
    assert client.post('/ask-stream', headers=user, json={'question': 'Q'}).status_code == 429
    user_id = client.get('/auth/me', headers=user).json()['id']
    client.post('/account/upgrade-request', headers=user)
    accounts.create_admin('admin@example.com', PASSWORD)
    admin = {'Authorization': 'Bearer ' + account(client, 'admin@example.com', 'login')['token']}
    assert client.post(f'/admin/users/{user_id}/activate-pro', headers=admin).status_code == 200
    assert client.post('/ask-stream', headers=user, json={'question': 'Q'}).status_code == 200


def test_upload_quota_counts_each_pdf_in_a_batch(client):
    user = headers(client)
    user_id = client.get('/auth/me', headers=user).json()['id']
    session = {'owner': user_id, 'paid_until': 0, 'requested_at': None}
    accounts.limit_uploads(session, 3)
    with pytest.raises(accounts.HTTPException) as exc:
        accounts.limit_uploads(session, 1)
    assert exc.value.status_code == 429
