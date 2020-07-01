FROM ubuntu:18.04

RUN apt-get update && \
    apt-get install -y wget ffmpeg && \
    apt-get autoremove -y && apt-get clean && rm -r /var/lib/apt/lists/*

WORKDIR /root/

RUN wget https://upload.wikimedia.org/wikipedia/commons/transcoded/0/02/Elephants_Dream%28HQ%29.webm/Elephants_Dream%28HQ%29.webm.360p.webm

CMD ["ffmpeg", "-re", "-threads", "2", "-fflags", "+genpts", \
  "-i", "Elephants_Dream(HQ).webm.360p.webm", \
  "-c:v", "copy", "-an", \
  "-f", "rtp", "rtp://headwind-janus-test.kuzmichev.dev:5020", \
  "-acodec", "libopus", "-vn", \
  "-f", "rtp", "rtp://headwind-janus-test.kuzmichev.dev:5030"]
