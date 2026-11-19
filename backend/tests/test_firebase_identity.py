import time

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import firebase_identity
import main


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv('DOCMIND_DB_PATH', str(tmp_path / 'accounts.sqlite3'))
    monkeypatch.setenv('DOCMIND_FIREBASE_PROJECT_ID', 'docmind-test')
    return TestClient(main.app)


def claims(uid, provider, **identity):
    return {
        'iss': 'https://securetoken.google.com/docmind-test',
        'sub': uid,
        'auth_time': int(time.time()) - 5,
        'firebase': {'sign_in_provider': provider},
        **identity,
    }


def test_google_accounts_get_separate_workspaces_and_return_to_the_same_workspace(client, monkeypatch):
    def verify(token, project_id):
        assert project_id == 'docmind-test'
        return claims(token, 'google.com', email=f'{token}@example.com', email_verified=True)

    monkeypatch.setattr(firebase_identity, 'verify_token', verify)
    first = client.post('/auth/firebase', json={'id_token': 'first'}).json()
    second = client.post('/auth/firebase', json={'id_token': 'second'}).json()
    assert first['profile']['email'] == 'first@example.com'
    assert first['profile']['id'] != second['profile']['id']
    snapshot = {'revision': 0, 'chats': [{'id': 'private', 'title': 'Private chat'}]}
    assert client.post('/chats', headers={'Authorization': f"Bearer {first['token']}"}, json=snapshot).status_code == 200

    again = client.post('/auth/firebase', json={'id_token': 'first'}).json()
    assert again['profile'] == first['profile']
    assert client.get('/chats', headers={'Authorization': f"Bearer {again['token']}"}).json()['chats'] == snapshot['chats']
    assert client.get('/chats', headers={'Authorization': f"Bearer {second['token']}"}).json()['chats'] == []


def test_google_cannot_take_over_existing_email_account(client, monkeypatch):
    credentials = {'email': 'me@example.com', 'password': 'existing-test-password'}
    assert client.post('/auth/register', json=credentials).status_code == 200
    monkeypatch.setattr(firebase_identity, 'verify_token',
                        lambda *a, **k: claims('uid', 'google.com', email=credentials['email'], email_verified=True))
    assert client.post('/auth/firebase', json={'id_token': 'google-token'}).status_code == 409
    assert client.post('/auth/login', json=credentials).status_code == 200


@pytest.mark.parametrize('overrides', [
    {'iss': 'https://securetoken.google.com/other-project'},
    {'auth_time': 0},
    {'email_verified': False},
    {'firebase': {'sign_in_provider': 'password'}},
    {'firebase': {'sign_in_provider': 'phone'}, 'phone_number': '+919000000001'},
    {'firebase': {'sign_in_provider': 'google.com', 'tenant': 'other-tenant'}},
])
def test_claims_must_match_the_project_and_verified_provider(monkeypatch, overrides):
    decoded = claims('uid', 'google.com', email='me@example.com', email_verified=True) | overrides
    monkeypatch.setattr(firebase_identity, 'verify_token', lambda *a, **k: decoded)
    with pytest.raises(HTTPException) as error:
        firebase_identity.verified_identity('token', 'docmind-test')
    assert error.value.status_code == 401


def test_provider_is_disabled_without_configuration_and_rejects_forged_tokens(client, monkeypatch):
    assert client.post('/auth/firebase', json={'id_token': 'forged'}).status_code == 401
    monkeypatch.delenv('DOCMIND_FIREBASE_PROJECT_ID')
    assert client.post('/auth/firebase', json={'id_token': 'forged'}).status_code == 503


def test_only_the_public_render_service_defaults_to_the_production_project(client, monkeypatch):
    monkeypatch.delenv('DOCMIND_FIREBASE_PROJECT_ID')
    monkeypatch.setenv('RENDER_EXTERNAL_HOSTNAME', 'docmind-preview.onrender.com')
    assert client.post('/auth/firebase', json={'id_token': 'forged'}).status_code == 503

    def verify(token, project_id):
        assert project_id == 'dockmind-4780f'
        return claims('uid', 'google.com', email='me@example.com', email_verified=True,
                      iss='https://securetoken.google.com/dockmind-4780f')

    monkeypatch.setattr(firebase_identity, 'verify_token', verify)
    monkeypatch.setenv('RENDER_EXTERNAL_HOSTNAME', 'docmind-12ms.onrender.com')
    assert client.post('/auth/firebase', json={'id_token': 'verified'}).status_code == 200
