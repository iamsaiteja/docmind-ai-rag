"""Verify Firebase sign-in tokens against the configured project's public keys."""
import re
import time
from threading import local

from cachecontrol import CacheControl
from cachecontrol.cache import DictCache
from fastapi import HTTPException
from google.auth import jwt
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request
from google.oauth2.id_token import verify_firebase_token
from requests import Session


_cache = DictCache()
_transports = local()


def public_keys_request(url, method='GET', body=None, headers=None, timeout=5):
    if not hasattr(_transports, 'request'):
        _transports.request = Request(session=CacheControl(Session(), cache=_cache))
    return _transports.request(url, method=method, body=body, headers=headers, timeout=timeout)


def verify_token(token, project_id):
    header = jwt.decode_header(token)
    if header.get('alg') != 'RS256' or not isinstance(header.get('kid'), str) or not header['kid']:
        raise ValueError('Invalid Firebase token header')
    return verify_firebase_token(token, public_keys_request, audience=project_id)


def verified_identity(token, project_id):
    try:
        claims = verify_token(token, project_id)
    except TransportError as error:
        raise HTTPException(503, 'Sign-in verification is temporarily unavailable.') from error
    except (ValueError, GoogleAuthError) as error:
        raise HTTPException(401, 'Sign-in could not be verified. Please try again.') from error

    subject, auth_time = claims.get('sub'), claims.get('auth_time')
    firebase = claims.get('firebase')
    now = int(time.time())
    if (
        claims.get('iss') != f'https://securetoken.google.com/{project_id}'
        or not isinstance(subject, str) or not 1 <= len(subject) <= 128
        or type(auth_time) is not int or not 0 < auth_time <= now
        or not isinstance(firebase, dict) or firebase.get('tenant') is not None
    ):
        raise HTTPException(401, 'Sign-in could not be verified. Please try again.')

    provider = firebase.get('sign_in_provider')
    email = claims.get('email')
    if provider == 'google.com' and claims.get('email_verified') is True and isinstance(email, str):
        return subject, email
    number = claims.get('phone_number')
    if provider == 'phone' and isinstance(number, str) and re.fullmatch(r'\+[1-9][0-9]{6,14}', number):
        return subject, None
    raise HTTPException(401, 'Use a verified Google account or mobile number.')
