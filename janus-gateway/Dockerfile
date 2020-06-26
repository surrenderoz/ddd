FROM ubuntu:18.04 AS BUILD

# Build deps
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
        libmicrohttpd-dev \
		libjansson-dev \
		libssl-dev \
		libglib2.0-dev \
		libopus-dev \
		libogg-dev \
		libcurl4-openssl-dev \
		liblua5.3-dev \
		libconfig-dev \
		libpcre3-dev \
		zlib1g-dev \
		pkg-config \
		gengetopt \
		libtool \
		automake \
		cmake \
		build-essential \
		wget \
		curl \
		git \
		ca-certificates \
		golang \
        gtk-doc-tools \
    && apt-get autoremove -y && apt-get clean && rm -r /var/lib/apt/lists/*

RUN mkdir /tmp/sources

# Build libnice
RUN cd /tmp/sources/ && git clone https://gitlab.freedesktop.org/libnice/libnice.git/ \
    && cd libnice \
    && git checkout tags/0.1.16 \
    && ./autogen.sh \
    && ./configure --prefix=/usr \
    && make && make install

# Build libsrtp
RUN cd /tmp/sources/ && wget https://github.com/cisco/libsrtp/archive/v2.3.0.tar.gz \
    && tar xfv v2.3.0.tar.gz \
    && cd libsrtp-2.3.0 \
    && ./configure --prefix=/usr --enable-openssl \
    && make shared_library && make install

# Build usrsctp (for DataChannels support)
RUN cd /tmp/sources/ && git clone https://github.com/sctplab/usrsctp \
    && cd usrsctp \
    && git checkout df49eb6e19b84905d0b20dd79edf81ec7a76f133 \
    && ./bootstrap \
    && ./configure --prefix=/usr \
    && make && make install

# Build libwebsockets (for WebSockets transport support)
RUN cd /tmp/sources/ && git clone https://github.com/warmcat/libwebsockets.git \
    && cd libwebsockets \
    && git checkout v4.0.9 \
    && mkdir build && cd build \
    && cmake -DLWS_MAX_SMP=1 -DCMAKE_INSTALL_PREFIX:PATH=/usr -DCMAKE_C_FLAGS="-fpic" .. \
    && make && make install

# Build BoringSSL (instead of OpenSSL, for DTLS timeout)
RUN cd /tmp/sources/ && git clone https://boringssl.googlesource.com/boringssl \
    && cd boringssl \
    && git checkout 78b3337a10a7f7b3495b6cb8140a74e265290898 \
    && sed -i s/" -Werror"//g CMakeLists.txt \
    && mkdir -p build && cd build \
    && cmake -DCMAKE_CXX_FLAGS="-lrt" .. && make && cd .. \
    && mkdir -p /opt/boringssl && cp -R include /opt/boringssl/ && mkdir -p /opt/boringssl/lib \
    && cp build/ssl/libssl.a /opt/boringssl/lib/ && cp build/crypto/libcrypto.a /opt/boringssl/lib/

# Build Janus Gateway
RUN cd /tmp/sources/ && git clone https://github.com/meetecho/janus-gateway.git \
    && cd janus-gateway \
    && git checkout v0.9.3 \
    && sh autogen.sh \
    && ./configure \
      # General
      --prefix=/usr/local \
      --enable-boringssl \
      --enable-dtls-settimeout \
      # Transports
      --disable-rabbitmq --disable-mqtt --disable-unix-sockets --disable-nanomsg \
      # Plugins
      --disable-plugin-audiobridge --disable-plugin-recordplay --disable-plugin-sip --disable-plugin-nosip --disable-plugin-videocall --disable-plugin-videoroom --disable-plugin-voicemail \
    && make && make install


FROM ubuntu:18.04

RUN apt-get -y update \
	&& apt-get install -y \
		libmicrohttpd12 \
		libjansson4 \
		libssl1.1 \
		libglib2.0-0 \
		libopus0 \
		libogg0 \
		libcurl4 \
		liblua5.3-0 \
		libconfig9 \
	&& apt-get autoremove -y && apt-get clean && rm -r /var/lib/apt/lists/*

# libnice
COPY --from=BUILD /usr/lib/libnice.la /usr/lib/libnice.la
COPY --from=BUILD /usr/lib/libnice.so.10.9.0 /usr/lib/libnice.so.10.9.0
RUN ln -s /usr/lib/libnice.so.10.9.0 /usr/lib/libnice.so.10
RUN ln -s /usr/lib/libnice.so.10.9.0 /usr/lib/libnice.so

# libsrtp
COPY --from=BUILD /usr/lib/libsrtp2.so.1 /usr/lib/libsrtp2.so.1
RUN ln -s /usr/lib/libsrtp2.so.1 /usr/lib/libsrtp2.so

# usrsctp
COPY --from=BUILD /usr/lib/libusrsctp.la /usr/lib/libusrsctp.la
COPY --from=BUILD /usr/lib/libusrsctp.so.1.0.0 /usr/lib/libusrsctp.so.1.0.0
RUN ln -s /usr/lib/libusrsctp.so.1.0.0 /usr/lib/libusrsctp.so
RUN ln -s /usr/lib/libusrsctp.so.1.0.0 /usr/lib/libusrsctp.so.1

# libwebsockets
COPY --from=BUILD /usr/lib/libwebsockets.so.16 /usr/lib/libwebsockets.so.16
RUN ln -s /usr/lib/libwebsockets.so.16 /usr/lib/libwebsockets.so

# BoringSSL
# TODO: после тестирования работы станет понятно, нужно ли тащить либы, пока и так запускается после билда

## Janus Gateway
# binaries
COPY --from=BUILD /usr/local/bin/janus /usr/local/bin/janus
COPY --from=BUILD /usr/local/bin/janus-cfgconv /usr/local/bin/janus-cfgconv
# libs
COPY --from=BUILD /usr/local/lib/janus /usr/local/lib/janus
# assets, demos, etc
COPY --from=BUILD /usr/local/share/janus /usr/local/share/janus
# configs
RUN mkdir /usr/local/etc/janus

# SECURE ports (REST, Admin&Monitor REST, WebSockets, Admin&Monitor WebSockets)
EXPOSE 8089 7889 8989 7989

# INSECURE ports (REST, Admin&Monitor REST, WebSockets, Admin&Monitor WebSockets)
# EXPOSE 8088 7088 8188 7188

# RTP/RTCP ports
EXPOSE 10000-10200/udp

# TODO test CMD ["/usr/local/bin/janus", "--nat-1-1=${DOCKER_IP}"]
CMD ["/usr/local/bin/janus"]
