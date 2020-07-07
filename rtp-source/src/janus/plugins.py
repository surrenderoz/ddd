import asyncio
import json
import logging
from asyncio.futures import Future
from json import JSONDecodeError
from typing import TYPE_CHECKING, Union, Dict

from aiortc import RTCPeerConnection, RTCIceCandidate, RTCDataChannel
from aiortc import RTCSessionDescription
from pyee import AsyncIOEventEmitter

from .utils import transaction_id, normalize_url

if TYPE_CHECKING:
    from .session import JanusSession


class JanusBasePlugin(AsyncIOEventEmitter):
    JANUS_PLUGIN_ID: str = ''

    _queue: Union[None, "asyncio.Queue"] = None
    _session: Union[None, "JanusSession"] = None
    _handle_id: str = ''

    _pc: ["RTCPeerConnection"] = None

    def __init__(self, session: "JanusSession", handle_id: str):
        super().__init__()
        self._queue = asyncio.Queue()
        self._session = session
        self._handle_id = handle_id

    def __str__(self):
        return f'{self.session.session_id}:{self.JANUS_PLUGIN_ID}:{self.handle_id}'

    def __repr__(self):
        return f'<{self.__class__.__name__} {self}>'

    @property
    def queue(self):
        return self._queue

    @property
    def session(self):
        return self._session

    @property
    def handle_id(self):
        return self._handle_id

    @property
    def plugin_url(self):
        return normalize_url(self._session.session_url, str(self.handle_id))\
            if self.session.session_url and self.handle_id else ''

    @property
    def pc(self):
        return self._pc

    @pc.setter
    def pc(self, val: "RTCPeerConnection"):
        self._pc = val

    async def send_message(self, janus: str = 'message', body: Dict = None, payload: Dict = None,
                           wait_for_event=True, wait_for_ack='ack'):
        # prepare request
        message = {
            "janus": janus,
            "session_id": self.session.session_id,
            "handle_id": self.handle_id,
            "transaction": transaction_id(),
        }
        if body:
            message['body'] = body
        if payload:
            message.update(payload)
        logging.debug('plugin %s:%s: http send on %s with message=%s',
                      self.JANUS_PLUGIN_ID, self.handle_id, self.plugin_url, message)

        # perform request & return ack data from response (if not wait_for_event)
        async with self.session.http.post(self.plugin_url, json=message) as response:
            data = await response.json()
            logging.debug('plugin %s:%s: got data %s ', self.JANUS_PLUGIN_ID, self.handle_id, data)
            assert data["janus"] == wait_for_ack
        if not wait_for_event:
            return data

        # waiting for event and return its data..
        event_response = await self._queue.get()
        assert event_response["transaction"] == message["transaction"]
        return event_response

    async def add_trickle(self, candidate: str, sdp_mid: str = 'data', sdp_mline_index: int = 0):
        payload = {
            "candidate": {
                "candidate": candidate,
                "sdpMid": sdp_mid,
                "sdpMLineIndex": sdp_mline_index,
            }
        }
        logging.debug('plugin %s:%s: send trickle %s sdpMid=%s sdpMLineIndex=%s ',
                      self.JANUS_PLUGIN_ID, self.handle_id, payload, sdp_mid, sdp_mline_index)
        await self.send_message(janus='trickle', payload=payload, wait_for_event=False)

    async def complete_trickle(self):
        payload = {"candidate": {"completed": True}}
        logging.debug('plugin %s:%s: complete trickle', self.JANUS_PLUGIN_ID, self.handle_id)
        await self.send_message(janus='trickle', payload=payload, wait_for_event=False)


class JanusPluginTextRoom(JanusBasePlugin):
    JANUS_PLUGIN_ID = "janus.plugin.textroom"

    _dc: "RTCDataChannel" = None
    _dc_ready_future: "Future" = None
    _dc_transaction_futures: Dict[str, Union[Future, None]] = None
    _dc_message_queue: Union[None, "asyncio.Queue"] = None

    def __init__(self, session: "JanusSession", handle_id: str):
        super().__init__(session, handle_id)
        self._dc_transaction_futures = {}
        self._dc_ready_future = Future()
        self._dc_message_queue = asyncio.Queue()

        @self.on('webrtcup')
        async def _():
            await self._on_webrtcup_trick()

    def ready(self):
        return self._dc_ready_future

    async def message(self):
        return await self._dc_message_queue.get()

    def setup_pc(self):
        @self.pc.on('signalingstatechange')
        def on_signalingstatechange():
            logging.debug('plugin %s:%s: PC.signalingState changed to %s ',
                          self.JANUS_PLUGIN_ID, self.handle_id, self.pc.signalingState)

        @self.pc.on('icegatheringstatechange')
        def on_icegatheringstatechange():
            logging.debug('plugin %s:%s: PC.iceGatheringState changed to %s ',
                          self.JANUS_PLUGIN_ID, self.handle_id, self.pc.iceGatheringState)

        @self.pc.on('iceconnectionstatechange')
        async def on_iceconnectionstatechange():
            logging.debug('plugin %s:%s: PC.iceConnectionState changed to %s ',
                          self.JANUS_PLUGIN_ID, self.handle_id, self.pc.iceConnectionState)
            if self.pc.iceConnectionState == "failed":
                await self.pc.close()
            elif self.pc.iceConnectionState == "checking":
                candidates = self.pc.localDescription.sdp.split("\r\n")
                for candidate in candidates:
                    if "a=candidate:" in candidate:
                        candidate = candidate.replace("a=candidate:", "")
                        splitted_data = candidate.split(" ")
                        remote_ice_candidate = RTCIceCandidate(
                            foundation=splitted_data[0],
                            component=int(splitted_data[1]),
                            protocol=splitted_data[2],
                            priority=int(splitted_data[3]),
                            ip=splitted_data[4],
                            port=int(splitted_data[5]),
                            type=splitted_data[7],
                            sdpMid='0',
                            sdpMLineIndex=0,
                        )
                        self.pc.addIceCandidate(remote_ice_candidate)
                        await self.add_trickle('candidate:' + candidate, 'data', 0)
                        logging.debug('plugin %s:%s: added ICE candidate to PC: %s',
                                      self.JANUS_PLUGIN_ID, self.handle_id, splitted_data)
                    elif "a=end-of-candidates" in candidate:
                        await self.complete_trickle()

        @self.pc.on("datachannel")
        def on_datachannel(channel: "RTCDataChannel"):
            logging.info('plugin %s:%s: DataChannel created by remote! id: %s, label: %s',
                         self.JANUS_PLUGIN_ID, self.handle_id, channel.id, channel.label)
            self._dc = channel
            self._dc_ready_future.set_result(True)

            @channel.on("message")
            async def on_message(raw_message):
                logging.debug('plugin %s:%s: DataChannel "%s" message: %s',
                              self.JANUS_PLUGIN_ID, self.handle_id, channel.label, raw_message)
                try:
                    message = json.loads(raw_message)

                    # answer on started transaction
                    if message.get('transaction', ''):
                        if not self._dc_transaction_futures.get(message['transaction'], None):
                            logging.error('UNKNOWN TRANSACION %s', raw_message)
                        else:
                            self._dc_transaction_futures[message['transaction']].set_result(message)
                            # todo ??? self._dc_transaction_futures[message['transaction']].done()
                            self._dc_transaction_futures[message['transaction']] = None
                    # other messages or events
                    else:
                        await self._dc_message_queue.put(message)

                except JSONDecodeError as ex:
                    logging.error('plugin %s:%s: message decoding error: %s', self.JANUS_PLUGIN_ID, self.handle_id, ex)

    async def get_offer(self):
        body = {"request": "setup"}
        r = await self.send_message(body=body)
        await self.pc.setRemoteDescription(
            RTCSessionDescription(
                type=r['jsep']['type'],
                sdp=r['jsep']['sdp'],
            )
        )
        logging.info('plugin %s:%s: set up OK, local PC got %s %s ',
                     self.JANUS_PLUGIN_ID, self.handle_id, r['jsep']['type'], r['jsep']['sdp'])

    async def send_answer(self):
        await self.pc.setLocalDescription(await self.pc.createAnswer())
        body = {"request": "ack"}
        payload = {
            "jsep": {
                "type": self.pc.localDescription.type,
                "sdp": self.pc.localDescription.sdp,
            }
        }
        r = await self.send_message(body=body, payload=payload)
        logging.info('plugin %s:%s: answer sent, remote PC got %s %s',
                     self.JANUS_PLUGIN_ID, self.handle_id, self.pc.localDescription.type, self.pc.localDescription.sdp)
        assert r['plugindata']['data']['result'] == 'ok'

    async def _on_webrtcup_trick(self):
        _dc = self.pc.createDataChannel('trick')

        @_dc.on("open")
        def trick():
            _dc.send('{"textroom": "list", "transaction": "trick_transaction"}')
            _dc.close()

    async def join_room(self, _id: str, username: str = '', display: str = '', pin: str = '') -> "Future":
        f = asyncio.ensure_future(Future())
        tid = transaction_id()
        self._dc_transaction_futures[tid] = f

        payload = {
            "textroom": "join",
            "room": _id,
            "username": username or transaction_id(),
            "display": display or transaction_id(),
            "transaction": tid,
        }
        if pin:
            payload['pin'] = pin
        self._dc.send(json.dumps(payload))
        await f
        resp = f.result()
        assert resp['textroom'] == 'success'

        logging.info('plugin %s:%s: joined room %s: "%s" aKa "%s"',
                     self.JANUS_PLUGIN_ID, self.handle_id, _id, display, username)
        return resp

    async def send_to_room(self, _id: str, text: str):
        f = asyncio.ensure_future(Future())
        tid = transaction_id()
        self._dc_transaction_futures[tid] = f

        payload = {
            "textroom": "message",
            "room": _id,
            "text": text,
            "ack": True,
            "transaction": tid,
        }
        self._dc.send(json.dumps(payload))
        await f
        resp = f.result()
        assert resp['textroom'] == 'success'
        return resp

    async def create_room(self, _id: str = '', pin: str = '', is_private: bool = False, permanent: bool = False):
        f = asyncio.ensure_future(Future())
        tid = transaction_id()
        self._dc_transaction_futures[tid] = f

        payload = {
            "textroom": "create",
            "is_private": is_private,
            "permanent": permanent,
            "transaction": tid,
        }
        if _id:
            payload['room'] = _id
        if pin:
            payload['pin'] = pin

        self._dc.send(json.dumps(payload))
        await f
        resp = f.result()
        assert resp['textroom'] == 'success'
        logging.info('plugin %s:%s: created room %s',
                     self.JANUS_PLUGIN_ID, self.handle_id, resp['room'])
        return resp

    async def destroy_room(self, _id: str, permanent: bool = False):
        f = asyncio.ensure_future(Future())
        tid = transaction_id()
        self._dc_transaction_futures[tid] = f

        payload = {
            "textroom": "destroy",
            "room": _id,
            "permanent": permanent,
            "transaction": tid,
        }

        self._dc.send(json.dumps(payload))
        await f
        resp = f.result()
        assert resp['textroom'] == 'success'
        logging.info('plugin %s:%s: destroyed room %s',
                     self.JANUS_PLUGIN_ID, self.handle_id, _id)
        return resp


class JanusPluginStreaming(JanusBasePlugin):
    JANUS_PLUGIN_ID = 'janus.plugin.streaming'

    async def list(self):
        body = {
            'request': 'list',
        }
        res = await self.send_message(body=body, wait_for_ack='success', wait_for_event=False)
        return res['plugindata']['data']['list']

    async def info(self, _id: str, secret: str = ''):
        body = {
            'request': 'info',
            'id': _id,
        }
        if secret:
            body['secret'] = secret
        res = await self.send_message(body=body, wait_for_ack='success', wait_for_event=False)
        return res['plugindata']['data']['info']

    async def create(
            self, _type: str = 'rtp', _id: str = '', secret: str = '', pin: str = '', is_private: bool = True,
            audio: bool = True, audioport: int = 0, audiopt: int = 111, audiortpmap: str = "opus/48000/2",
            video: bool = True, videoport: int = 0, videopt: int = 100, videortpmap: str = "VP8/90000",
            videobufferkf: bool = False,  # experimental feature
            data: bool = False,
    ):
        body = {
            'request': 'create',
            'type': _type,
            'description': 'Dynamically created mountpoint with random id and name',
            'permanent': False,
            'is_private': is_private,
            'audio': audio,
            'video': video,
            'data': data,
        }
        if _id:
            body['_id'] = _id
            body['name'] = _id
            body['description'] = _id
        if secret:
            body['secret'] = secret
        if pin:
            body['pin'] = pin
        if audio:
            body.update({
                'audioport': audioport,
                'audiopt': audiopt,
                'audiortpmap': audiortpmap,
            })
        if video:
            body.update({
                'videoport': videoport,
                'videopt': videopt,
                'videortpmap': videortpmap,
                'videobufferkf': videobufferkf,
            })

        res = await self.send_message(body=body, wait_for_ack='success', wait_for_event=False)
        logging.info('plugin %s:%s: mountpoint created: %s',
                     self.JANUS_PLUGIN_ID, self.handle_id, res['plugindata']['data'])
        return res['plugindata']['data']

    async def destroy(self, _id, secret: str = '', permanent: bool = False):
        body = {
            'request': 'destroy',
            'id': _id
        }
        if secret:
            body['secret'] = secret
        if permanent:
            body['permanent'] = permanent
        res = await self.send_message(body=body, wait_for_ack='success', wait_for_event=False)
        logging.info('plugin %s:%s: mountpoint destroyed: %s',
                     self.JANUS_PLUGIN_ID, self.handle_id, res['plugindata']['data'])
        return res['plugindata']['data']


JANUS_PLUGINS = {
    'textroom': JanusPluginTextRoom,
    'streaming': JanusPluginStreaming,
}
