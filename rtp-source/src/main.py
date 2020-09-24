import argparse
import asyncio
import logging
import coloredlogs
import os
import signal
from asyncio import CancelledError
from contextlib import suppress
from typing import Set, Dict, List, Union

from aiortc import RTCPeerConnection

from janus import Janus
from janus.utils import random_string, random_uuid

pcs: Set["RTCPeerConnection"] = set()


class GStreaming:
    process: Union["asyncio.subprocess.Process", None] = None
    command: List[str] = [
        "gst-launch-1.0", "audiotestsrc", "wave=ticks", "!",
        "audioresample", "!", "audio/x-raw,channels=1,rate=16000", "!",
        "opusenc", "bitrate=20000", "!",
        "rtpopuspay", "!", "udpsink", "host=HOST", "port=AUDIOPORT",
        "videotestsrc", "pattern=ball", "!",
        "video/x-raw,width=320,height=240,framerate=15/1", "!",
        "videoscale", "!", "videorate", "!", "videoconvert", "!", "timeoverlay", "!",
        "vp8enc", "error-resilient=1", "!",
        "rtpvp8pay", "!", "udpsink", "host=HOST", "port=VIDEOPORT"
    ]

    def __init__(self, host: str, videoport: int, audioport: int):
        self.vars: Dict[str, str] = {
            'HOST': host,
            'AUDIOPORT': audioport,
            'VIDEOPORT': videoport,
        }

    def _prepare_command(self):
        cmd = [c for c in self.command]
        for var, val in self.vars.items():
            cmd = [c.replace(str(var), str(val)) for c in cmd]
        logging.debug('GStreaming: prepared cmd: %s', cmd)
        return cmd

    def is_running(self):
        ret = self.process and self.process.returncode is None
        logging.debug('GStreaming.is_running = %s', ret)
        return ret

    async def start_streaming(self):
        if self.is_running():
            self.stop_streaming()

        self.process = await asyncio.create_subprocess_exec(
            *self._prepare_command(), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        return self.process

    def stop_streaming(self):
        if self.is_running():
            self.process.terminate()
            self.process = None


async def run(janus: "Janus"):
    # PC setup
    pc = RTCPeerConnection()
    pcs.add(pc)

    # prepare ids and credentials
    # todo: entrypoints_uuid = random_uuid()
    entrypoints_uuid = 'testuuid'
    room_id = entrypoints_uuid
    stream_id = entrypoints_uuid

    # todo: pin = random_string(length=4, letters=False)
    pin = '1111'

    # todo: username = random_string(6, digits=False)
    # todo: display_name = 'rtp-source-' + username
    username = f'device:{room_id}'
    display_name = username

    # Janus session setup
    session = janus.create_session()
    await session.init()

    # Janus textroom, datachannel and room setup
    textroom = await session.attach_textroom()
    textroom.pc = pc
    textroom.setup_pc()
    await textroom.get_offer()
    await textroom.send_answer()
    await textroom.ready()
    room = await textroom.create_room(_id=room_id, pin=pin)
    room_id = room['room']
    await textroom.join_room(room_id, username=username, display=display_name, pin=pin)

    # Janus streaming mountpoint setup
    streaming = await session.attach_streaming()
    stream = await streaming.create(
        _id=stream_id, is_private=False, pin=pin,
        videortpmap='H264/90000',
    )
    stream_id = stream['stream']['id']
    stream_audioport = stream['stream']['audio_port']
    stream_videoport = stream['stream']['video_port']
    gstreaming = GStreaming(janus.url_hostname, videoport=stream_videoport, audioport=stream_audioport)

    # print credentials
    print(f'============= CONNECT CREDENTIALS ===================')
    print(f'===')
    print(f'=== SESSION ID: {entrypoints_uuid}')  # one of equal IDs
    print(f'=== PIN: {pin}')
    print(f'===')
    print(f'=====================================================')

    try:
        while True:
            message = await textroom.message()
            logging.info('got incoming message: %s', message)

            # Somebody JOINED
            if message['textroom'] == 'join':
                if message['username'] != username:
                    await textroom.send_to_room(
                        room_id, text=f'Hi {message["display"]}. I have "start", "stop" and "quit" commands, '
                                      f'other messages I will replay. '
                                      f'GStreaming will be started asap in honour of your joining to us! :)')
                    if not gstreaming.is_running():
                        await gstreaming.start_streaming()

            # MESSAGE from somebody
            elif message['textroom'] == 'message':
                sender: str = message['from']
                text: str = message['text']
                if message['from'] != username:
                    # START STREAMING
                    if text.lower().startswith("start"):
                        if not gstreaming.is_running():
                            await gstreaming.start_streaming()
                            await textroom.send_to_room(room_id, text='Starting GStreaming ..')
                        else:
                            await textroom.send_to_room(room_id, text='Already started!')
                    # STOP STREAMING
                    elif text.lower().startswith("stop"):
                        if gstreaming.is_running():
                            gstreaming.stop_streaming()
                            await textroom.send_to_room(room_id, text='Stopping GStreaming ..')
                        else:
                            await textroom.send_to_room(room_id, text='Nothing to stop.')
                    # QUIT
                    elif text.lower() == 'quit':
                        await textroom.send_to_room(room_id, text=f'Bye {sender}!')
                        break
                    else:
                        await textroom.send_to_room(
                            room_id, text=f'{sender}, you said \"{text}\", nothing to do.')
    finally:
        gstreaming.stop_streaming()
        await streaming.destroy(_id=stream_id)
        await textroom.destroy_room(_id=room_id)


async def shutdown_sig_handler(s):
    logging.info(f"received exit signal {s.name}...")
    tasks = [task for task in asyncio.Task.all_tasks() if task is not asyncio.tasks.Task.current_task()]
    logging.debug(f"waiting for {len(tasks)} tasks..")
    for task in tasks:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    await asyncio.gather(*tasks, return_exceptions=True)
    for task in enumerate(tasks):
        logging.debug('finished awaited task "%s"', task)
    logging.info(f"gracefully handled {s.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Janus")
    parser.add_argument("--run", default=False, const=True, nargs='?'),
    args = parser.parse_args()
    if not args.run:
        logging.error('rtp-source need "--run" arg to start')
        exit(0)

    # vars
    verbose = int(os.environ.get('VERBOSE', 0))
    janus_host = os.environ.get('JANUS_HOST', '')

    # logging setup
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format='%(asctime)s - %(levelname)s - %(name)s - %(message)s',
    )
    coloredlogs.install()

    if not janus_host:
        if verbose:
            janus_host = 'headwind-janus-test.kuzmichev.dev'
        else:
            logging.error('JANUS_HOST environment MUST BE set')
            exit()
    url = f'https://{janus_host}:8089/janus'

    logging.info('====================================')
    logging.info('=== RTP Source configured:')
    logging.info('=== Janus HOST: %s:', janus_host)
    logging.info('=== Janus REST API url: %s', url)
    logging.info('=== Verbose Debug: %s', bool(verbose))
    logging.info('====================================')

    # Janus & loop setup
    janus_instance = Janus(url)
    loop = asyncio.get_event_loop()
    if verbose:
        loop.set_debug(True)

    # signal handlers setup
    signals = (signal.SIGHUP, signal.SIGTERM, signal.SIGINT, signal.SIGQUIT)
    for signal in signals:
        loop.add_signal_handler(signal, lambda: asyncio.ensure_future(shutdown_sig_handler(signal)))

    # run
    try:
        loop.run_until_complete(
            run(janus=janus_instance)
        )
    except CancelledError:
        pass
    finally:
        loop.run_until_complete(janus_instance.destroy_all_sessions())
        loop.run_until_complete(asyncio.gather(*[pc.close() for pc in pcs]))
        loop.stop()
        loop.close()
        logging.info('finally quit')
