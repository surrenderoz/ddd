import asyncio
import logging
import time
from concurrent.futures import TimeoutError
from typing import TYPE_CHECKING, Dict, Union
from urllib.parse import urlparse

from aiohttp import ClientSession, ClientTimeout, ServerTimeoutError

from .exceptions import JanusSessionAlreadyExists, JanusSessionDoesNotExists
from .plugins import JANUS_PLUGINS, JanusPluginTextRoom, JanusPluginStreaming
from .utils import transaction_id, normalize_url

if TYPE_CHECKING:
    from .plugins import JanusBasePlugin


class Janus:
    _root_url: str = ''
    _sessions: Dict[str, "JanusSession"] = None

    def __init__(self, url):
        self._root_url = url
        self._sessions = {}

    @property
    def url(self):
        return normalize_url(self._root_url)

    @property
    def url_hostname(self):
        parsed = urlparse(self._root_url)
        return parsed.hostname

    def get_session(self, alias: str) -> Union["JanusSession", None]:
        return self._sessions.get(alias, None)

    def create_session(self, alias: str = 'main') -> "JanusSession":
        if self.get_session(alias):
            raise JanusSessionAlreadyExists
        session = JanusSession(self)
        self._sessions[alias] = session
        return session

    async def destroy_session(self, alias: str = 'main'):
        if self.get_session(alias):
            await self.get_session(alias).destroy()
            del self._sessions[alias]

    async def destroy_all_sessions(self):
        for session in self._sessions.values():
            await session.destroy()
        self._sessions.clear()


class JanusSession:
    _plugins: Dict[str, "JanusBasePlugin"] = None
    _http: Union["ClientSession", None] = None
    _session_id: str = ''
    _janus: "Janus" = None
    _transactions: Dict = None

    def __init__(self, janus):
        self._poll_task = None
        self._plugins = {}
        self._janus = janus
        self._transactions = {}
        self._http = ClientSession(
            timeout=ClientTimeout(connect=5, total=30)
        )

    @property
    def session_id(self):
        return self._session_id

    @property
    def session_url(self):
        return normalize_url(self._janus.url, str(self.session_id)) if self._session_id else ''

    @property
    def http(self):
        return self._http

    async def init(self):
        message = {
            "janus": "create",
            "transaction": transaction_id()
        }
        async with self.http.post(self._janus.url, json=message) as response:
            data = await response.json()
            assert data["janus"] == "success"
            self._session_id = data["data"]["id"]
            logging.info('session %s: created!', self.session_id)
        self._poll_task = asyncio.ensure_future(self._poll())

    async def _attach(self, plugin: str) -> "JanusBasePlugin":
        plugin_class = JANUS_PLUGINS[plugin]
        plugin_name = plugin_class.JANUS_PLUGIN_ID
        message = {
            "janus": "attach",
            "plugin": plugin_name,
            "transaction": transaction_id(),
        }
        async with self.http.post(self.session_url, json=message) as response:
            data = await response.json()
            assert data["janus"] == "success"
            plugin_id = data["data"]["id"]

        plugin = plugin_class(self, plugin_id)
        self._plugins[plugin_id] = plugin
        logging.info('session %s: attached plugin %s with handle_id %s', self.session_id, plugin_name, plugin_id)

        return plugin

    async def attach_textroom(self) -> "JanusPluginTextRoom":
        return await self._attach('textroom')

    async def attach_streaming(self) -> "JanusPluginStreaming":
        return await self._attach('streaming')

    async def destroy(self):
        logging.info('session %s: destroying..', self.session_id)
        if not self.session_url:
            raise JanusSessionDoesNotExists

        if self._poll_task:
            self._poll_task.cancel()
            self._poll_task = None
            logging.debug('session %s: polling cancelled', self.session_id)

        message = {"janus": "destroy", "transaction": transaction_id()}
        async with self.http.post(self.session_url, json=message) as response:
            data = await response.json()
            assert data["janus"] == "success"
            logging.debug('session %s: destroyed on server', self.session_id)

        if self.http:
            await self.http.close()
            self._http = None
            logging.debug('session %s: http closed', self.session_id)

        logging.info('session %s: destroyed!', self.session_id)
        self._session_id = ''

    async def _poll(self):
        while True:
            if not self.session_url:
                raise JanusSessionDoesNotExists
            try:
                params = {"maxev": 1, "rid": int(time.time() * 1000)}
                logging.info('session %s: polling %s with %s ..', self.session_id, self.session_url, params)

                async with self.http.get(self.session_url, params=params) as response:
                    data = await response.json()
                    logging.info('session %s: polled data %s', self.session_id, data)
                    if data["janus"] == "event":
                        plugin = self._plugins.get(data["sender"], None)
                        if plugin:
                            logging.info('session %s: got janus event, sending to %s', self.session_id, plugin)
                            await plugin.queue.put(data)
                        else:
                            logging.warning(
                                'session %s: got janus event for unknown plugin instance, skipping', self.session_id)
                    elif data['janus'] == 'webrtcup':
                        if plugin:
                            logging.info('session %s: got WEBRTC UP!, emitting to %s', self.session_id, plugin)
                            plugin.emit('webrtcup')
                        else:
                            logging.warning(
                                'session %s: got WEBRC UP for unknown plugin instance, skipping', self.session_id)
            except (ServerTimeoutError, TimeoutError) as ex:
                logging.warning('session %s: polling error %s, retry..', self.session_id, ex)
