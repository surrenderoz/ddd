FROM ubuntu:18.04

RUN apt-get update && \
    apt-get install -y libgstreamer1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-tools && \
    apt-get autoremove -y && apt-get clean && rm -r /var/lib/apt/lists/*

CMD ["gst-launch-1.0",\
  "audiotestsrc", "wave=ticks", "!", \
    "audioresample", "!", "audio/x-raw,channels=1,rate=16000", "!", \
    "opusenc", "bitrate=20000", "!", \
      "rtpopuspay", "!", "udpsink", "host=headwind-janus-test.kuzmichev.dev", "port=5030", \
  "videotestsrc", "pattern=ball", "!", \
    "video/x-raw,width=320,height=240,framerate=15/1", "!", \
    "videoscale", "!", "videorate", "!", "videoconvert", "!", "timeoverlay", "!", \
    "vp8enc", "error-resilient=1", "!", \
      "rtpvp8pay", "!", "udpsink", "host=headwind-janus-test.kuzmichev.dev", "port=5020"]
