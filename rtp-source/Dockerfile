#FROM python:3.8-alpine
#
#WORKDIR /usr/src/app
#
#RUN apk update && \
#    apk add --virtual .build-deps gcc musl-dev linux-headers libffi-dev opus-dev libvpx-dev libsrtp-dev libressl-dev ffmpeg-dev
#
#COPY requirements.txt ./
#RUN pip install --no-cache-dir -r requirements.txt
#RUN apk del .build-deps && \
#    apk add libffi opus libvpx libsrtp libressl ffmpeg
#
#COPY ./src/* ./
#
#CMD ["python", "./janus.py"]

FROM python:3.6-buster

WORKDIR /usr/src/app

RUN apt-get update && \
    apt-get install -y libgstreamer1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-tools && \
    apt-get autoremove -y && apt-get clean && rm -r /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY ./src/ ./
CMD ["python", "main.py"]
