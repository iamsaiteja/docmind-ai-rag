"""Account, session, chat and usage data for a single DocMind backend."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from fastapi import Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field


PLAN_DAYS = 30
PLANS = {
    'free': {'name': 'Free', 'price_inr': 0, 'questions': 10, 'pdfs': 3, 'files_per_upload': 1, 'chunks': 1000},
    'pro': {'name': 'Pro', 'price_inr': 600, 'questions': 100, 'pdfs': 25, 'files_per_upload': 5, 'chunks': 5000},
}


class Credentials(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=12, max_length=128)


class ChatSnapshot(BaseModel):
    revision: int = Field(ge=0)
    chats: list[dict] = Field(max_length=200)


@contextmanager
def database():
    path = Path(os.getenv('DOCMIND_DB_PATH', 'docmind.sqlite3'))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
                salt TEXT NOT NULL, password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY, owner TEXT NOT NULL,
                user_id TEXT REFERENCES users(id), expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS chats (
                user_id TEXT PRIMARY KEY REFERENCES users(id),
                revision INTEGER NOT NULL, content TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS usage (
                scope TEXT NOT NULL, day INTEGER NOT NULL, count INTEGER NOT NULL,
                PRIMARY KEY (scope, day)
            );
            CREATE TABLE IF NOT EXISTS subscriptions (
                user_id TEXT PRIMARY KEY REFERENCES users(id),
                requested_at INTEGER,
                paid_until INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS totals (
                name TEXT PRIMARY KEY, count INTEGER NOT NULL
            );
        """)
        with db:
            yield db
    finally:
        db.close()


def consume(db, limits, units=1):
    day = int(time.time()) // 86400
    db.execute('BEGIN IMMEDIATE')
    for scope, limit in limits:
        row = db.execute('SELECT count FROM usage WHERE scope=? AND day=?', (scope, day)).fetchone()
        if (row['count'] if row else 0) + units > limit:
            raise HTTPException(429, 'Daily limit reached. Please try again tomorrow.')
        db.execute('INSERT INTO usage VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET count=count+excluded.count', (scope, day, units))
    db.execute('DELETE FROM usage WHERE day < ?', (day - 1,))


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600_000).hex()


def login_email(value):
    email = value.strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise HTTPException(400, 'Enter a valid email address.')
    return email


def start_session(db, user=None):
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    expires = now + (7 * 86400 if user else 86400)
    owner = user['id'] if user else f'guest-{secrets.token_hex(16)}'
    db.execute('DELETE FROM sessions WHERE expires_at <= ?', (now,))
    db.execute('INSERT INTO sessions VALUES (?, ?, ?, ?)',
               (hashlib.sha256(token.encode()).hexdigest(), owner, user['id'] if user else None, expires))
    if user is None:
        db.execute("INSERT INTO totals VALUES ('guest_sessions', 1) ON CONFLICT DO UPDATE SET count=count+1")
    return {'token': token, 'expires_at': expires, 'profile': profile(user)}


def profile(user):
    if user is None:
        return {'role': 'guest'}
    return {'id': user['id'], 'email': user['email'], 'role': 'admin' if user['is_admin'] else 'user'}


def require_session(authorization: str = Header(default='')):
    if not re.fullmatch(r'Bearer [A-Za-z0-9_-]{43}', authorization):
        raise HTTPException(401, 'Sign in or start a guest session.')
    digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
    now = int(time.time())
    with database() as db:
        session = db.execute("""
            SELECT s.*, u.id, u.email, u.is_admin, p.paid_until, p.requested_at FROM sessions s
            LEFT JOIN users u ON s.user_id=u.id
            LEFT JOIN subscriptions p ON p.user_id=u.id
            WHERE token_hash=? AND expires_at>?
        """, (digest, now)).fetchone()
        if session is None:
            raise HTTPException(401, 'Session ended. Please sign in again.')
        if session['user_id']:
            db.execute('UPDATE users SET last_seen=? WHERE id=? AND last_seen<?',
                       (now, session['user_id'], now - 60))
    return session


def require_account(session=Depends(require_session)):
    if session['user_id'] is None:
        raise HTTPException(403, 'Sign in to use this feature.')
    return session


def plan_status(subscription):
    paid_until = (subscription['paid_until'] or 0) if subscription else 0
    return {
        'tier': 'pro' if paid_until > int(time.time()) else 'free',
        'paid_until': paid_until,
        'requested_at': subscription['requested_at'] if subscription else None,
    }


def plan_limits(session):
    return PLANS[plan_status(session)['tier']]


def require_admin(session=Depends(require_account)):
    if not session['is_admin']:
        raise HTTPException(403, 'Admin access required.')
    return session


def limit_questions(session):
    with database() as db:
        if session['user_id']:
            consume(db, [(f"questions:{session['owner']}", plan_limits(session)['questions']), ('account-questions', 1000)])
        else:
            consume(db, [(f"questions:{session['owner']}", 5), ('guest-questions', 150)])


def limit_uploads(session, files):
    with database() as db:
        consume(db, [(f"uploads:{session['owner']}", plan_limits(session)['pdfs']), ('account-uploads', 150)], units=files)


def client_scope(request):
    # Use the peer address supplied by ASGI, never a caller-controlled header.
    address = request.client.host if request.client else 'unknown'
    return hashlib.sha256(address.encode()).hexdigest()


def create_admin(email, password):
    email = login_email(email)
    Credentials(email=email, password=password)
    salt = secrets.token_hex(16)
    with database() as db:
        db.execute('INSERT INTO users VALUES (?, ?, ?, ?, 1, ?, ?)',
                   (secrets.token_hex(16), email, salt, password_hash(password, salt), int(time.time()), 0))


def add_routes(app):
    @app.post('/sessions')
    def guest(request: Request):
        with database() as db:
            consume(db, [(f'guest-start:{client_scope(request)}', 25), ('guest-start', 500)])
            return start_session(db)

    @app.post('/auth/register')
    def register(credentials: Credentials, request: Request):
        email = login_email(credentials.email)
        with database() as db:
            consume(db, [(f'register:{client_scope(request)}', 8), ('register', 200)])
        salt = secrets.token_hex(16)
        uid, now = secrets.token_hex(16), int(time.time())
        with database() as db:
            try:
                db.execute('INSERT INTO users VALUES (?, ?, ?, ?, 0, ?, ?)',
                           (uid, email, salt, password_hash(credentials.password, salt), now, now))
            except sqlite3.IntegrityError:
                raise HTTPException(409, 'That email is already registered.')
            return start_session(db, db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone())

    @app.post('/auth/login')
    def login(credentials: Credentials, request: Request):
        email = login_email(credentials.email)
        with database() as db:
            consume(db, [(f'login:{client_scope(request)}', 80), ('login', 1000)])
            user = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
        digest = password_hash(credentials.password, user['salt'] if user else '00' * 16)
        if user is None or not hmac.compare_digest(digest, user['password_hash']):
            raise HTTPException(401, 'Invalid email or password.')
        with database() as db:
            db.execute('UPDATE users SET last_seen=? WHERE id=?', (int(time.time()), user['id']))
            return start_session(db, user)

    @app.get('/auth/me')
    def me(session=Depends(require_session)):
        if session['user_id'] is None:
            return profile(None)
        return {**profile(session), 'plan': plan_status(session)}

    @app.post('/auth/logout')
    def logout(session=Depends(require_session)):
        with database() as db:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (session['token_hash'],))
        return {'ok': True}

    @app.get('/chats')
    def get_chats(session=Depends(require_account)):
        with database() as db:
            row = db.execute('SELECT * FROM chats WHERE user_id=?', (session['user_id'],)).fetchone()
        return {'revision': row['revision'], 'chats': json.loads(row['content'])} if row else {'revision': 0, 'chats': []}

    @app.post('/chats')
    def save_chats(snapshot: ChatSnapshot, session=Depends(require_account)):
        payload = json.dumps(snapshot.chats, ensure_ascii=False)
        if len(payload.encode()) > 2 * 1024 * 1024:
            raise HTTPException(413, 'Chat history is full. Remove older chats to save changes.')
        with database() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision FROM chats WHERE user_id=?', (session['user_id'],)).fetchone()
            if snapshot.revision != (row['revision'] if row else 0):
                raise HTTPException(409, 'Chat history changed on another device. Reload before editing again.')
            revision = snapshot.revision + 1
            db.execute('INSERT INTO chats VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET revision=excluded.revision, content=excluded.content',
                       (session['user_id'], revision, payload))
        return {'revision': revision}

    @app.get('/plans')
    def plans():
        return {'plans': PLANS, 'billing_days': PLAN_DAYS}

    @app.post('/account/upgrade-request')
    def upgrade_request(session=Depends(require_account)):
        now = int(time.time())
        with database() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT paid_until FROM subscriptions WHERE user_id=?', (session['user_id'],)).fetchone()
            if row and row['paid_until'] > now:
                raise HTTPException(409, 'Your Pro plan is already active.')
            db.execute("""
                INSERT INTO subscriptions (user_id, requested_at) VALUES (?, ?)
                ON CONFLICT(user_id) DO UPDATE SET requested_at=COALESCE(requested_at, excluded.requested_at)
            """, (session['user_id'], now))
            updated = db.execute('SELECT * FROM subscriptions WHERE user_id=?', (session['user_id'],)).fetchone()
            return plan_status(updated)

    @app.post('/admin/users/{user_id}/activate-pro')
    def activate_pro(user_id: str, session=Depends(require_admin)):
        now = int(time.time())
        with database() as db:
            result = db.execute("""
                UPDATE subscriptions SET paid_until=?, requested_at=NULL
                WHERE user_id=? AND requested_at IS NOT NULL AND paid_until<=?
            """, (now + PLAN_DAYS * 86400, user_id, now))
            if not result.rowcount:
                raise HTTPException(409, 'This account has no pending upgrade request.')
            updated = db.execute('SELECT * FROM subscriptions WHERE user_id=?', (user_id,)).fetchone()
            return plan_status(updated)

    @app.get('/admin/users')
    def admin_users(offset: int = 0, session=Depends(require_admin)):
        with database() as db:
            total = db.execute('SELECT COUNT(*) FROM users').fetchone()[0]
            active = db.execute('SELECT COUNT(*) FROM users WHERE last_seen>=?', (int(time.time()) - 86400,)).fetchone()[0]
            guests = db.execute("SELECT count FROM totals WHERE name='guest_sessions'").fetchone()
            users = db.execute("""
                SELECT u.id, u.email, u.is_admin, u.created_at, u.last_seen, p.paid_until, p.requested_at
                FROM users u LEFT JOIN subscriptions p ON p.user_id=u.id
                ORDER BY p.requested_at IS NULL, p.requested_at, u.created_at DESC, u.id LIMIT 100 OFFSET ?
            """, (max(0, offset),)).fetchall()
        return {'registered': total, 'active_24h': active, 'guest_sessions': guests[0] if guests else 0,
                'users': [{key: user[key] for key in ('id', 'email', 'is_admin', 'created_at', 'last_seen')}
                          | {'plan': plan_status(user)} for user in users]}


if __name__ == '__main__':
    import getpass
    from dotenv import load_dotenv

    load_dotenv()
    email = input('Admin email: ')
    password = getpass.getpass('New admin password: ')
    if password != getpass.getpass('Confirm admin password: '):
        raise SystemExit('Passwords do not match.')
    create_admin(email, password)
