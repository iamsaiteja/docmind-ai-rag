"""Bound expensive requests and keep API responses out of shared caches."""
from threading import BoundedSemaphore

from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse


class RequestLimits:
    def __init__(self, app):
        self.app = app
        auth = BoundedSemaphore(12)
        answers = BoundedSemaphore(4)
        self.limits = {
            '/auth/login': auth,
            '/auth/register': auth,
            '/upload-pdf': BoundedSemaphore(2),
            '/ask': answers,
            '/ask-stream': answers,
        }

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return

        async def send_private(message):
            if message['type'] == 'http.response.start':
                MutableHeaders(scope=message)['Cache-Control'] = 'no-store'
            await send(message)

        path = scope['path'].rstrip('/')
        limit = self.limits.get(path) if scope['method'] == 'POST' else None
        if limit is not None and not limit.acquire(blocking=False):
            response = JSONResponse(
                {'detail': 'DocMind is busy. Please try again in a few seconds.'},
                status_code=503,
                headers={'Retry-After': '5'},
            )
            await response(scope, receive, send_private)
            return

        try:
            await self.app(scope, receive, send_private)
        finally:
            if limit is not None:
                limit.release()
