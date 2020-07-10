function getJanusServers() {
    var servers = [];
    if (window.location.protocol === 'http:') {
        servers.push(
            "ws://" + window.location.hostname + ":8188",
            "http://" + window.location.hostname + ":8088/janus"
        );
    } else {
        servers.push(
            "wss://" + window.location.hostname + ":8989",
            "https://" + window.location.hostname + ":8089/janus"
        );
    }
    // todo: test
    servers = [
        'wss://headwind-janus-test.kuzmichev.dev:8989',
        // 'https://headwind-janus-test.kuzmichev.dev:8089/janus'
    ];
    return servers;
}

$(document).ready(function () {
    $('#login-form').on('submit', function() {
        var sessionId = $('#input-session-id').val();
        var pin = $('#pin').val();
        remoteVideo.startStreamMountpoint(sessionId, pin);
        $('#login-form-container').addClass('d-none');
        $('#main-window').removeClass('d-none');
        return false;
    });

    // objects
    {
        var janus = null;
        var textroom = null;
        var streaming = null;
    }

    //ids
    {
        var opaqueId = Janus.randomString(12);
        var streamingOpaqueId = "streaming-" + opaqueId;
        var textroomOpaqueId = "textroom-" + opaqueId;
    }

    var videoStats;
    var remoteVideo;
    var spinner;

    // Make sure the browser supports WebRTC
    if (!Janus.isWebrtcSupported()) {
        bootbox.alert("Нет поддержки WebRTC, попробуйте свежую версию Google Chrome");
        return;
    }
    // Initialize the library (all console debuggers enabled)
    Janus.init({
        debug: "all", callback: function () {
            janus = new Janus({
                server: getJanusServers(),
                success: function () {
                    // Attach to TextRoom plugin
                    janus.attach({
                        plugin: "janus.plugin.textroom",
                        opaqueId: opaqueId,
                        success: function (pluginHandle) {
                            textroom = pluginHandle;
                            Janus.log("textroom: plugin attached! (" + textroom.getPlugin() + ", id=" + textroom.getId() + ")");

                            // todo: тут создание объектов текструма
                        },

                        error: function (error) {
                            Janus.error("textroom: error attaching plugin: ", error);
                            bootbox.alert("Ошибка подключения к сессии: " + error);
                        },

                        onmessage: function (msg, jsep) {
                            Janus.log ("textroom: got a message ", msg);

                            if (msg.error) {
                                bootbox.alert(msg.error);
                            }
                            if (jsep) {
                                // Answer
                                textroom.createAnswer({
                                    jsep: jsep,
                                    media: {audio: false, video: false, data: true},
                                    success: function (jsep) {
                                        Janus.debug("Got SDP!");
                                        Janus.debug(jsep);
                                        var body = {"request": "ack"};
                                        textroom.send({"message": body, "jsep": jsep});
                                    },
                                    error: function (error) {
                                        Janus.error("WebRTC error:", error);
                                        bootbox.alert("Ошибка WebRTC: " + JSON.stringify(error));
                                    }
                                });
                            }
                        },
                    });

                    // Attach to Streaming plugin
                    janus.attach({
                        plugin: "janus.plugin.streaming",
                        opaqueId: streamingOpaqueId,
                        success: function (pluginHandle) {
                            streaming = pluginHandle;
                            Janus.log("streaming: plugin attached! (" + streaming.getPlugin() + ", id=" + streaming.getId() + ")");
                            if (!spinner){
                                spinner = new VideoSpinner($('stream'));
                            }
                            if (!videoStats) {
                                videoStats = new VideoStats(
                                    streaming,
                                    $('#streamingCurrentBitrate'),
                                    $('#streamingCurrentResolution'),
                                    $('#streamingRemoteVideo'),
                                );
                            }
                            if (!remoteVideo) {
                                remoteVideo = new RemoteVideo(
                                    streaming,
                                    $('#streamingRemoteVideo'),
                                    $('#streamingWaitingVideo'),
                                    $('#streamingNoRemoteVideo'),
                                    videoStats,
                                    spinner,
                                );
                            }
                        },

                        error: function (error) {
                            Janus.error("streaming: error attaching plugin: ", error);
                            bootbox.alert("Ошибка подключения к сессии: " + error);
                        },

                        onmessage: function (msg, jsep) {
                            Janus.log("streaming: got a message", msg, jsep);
                            var result = msg.result;
                            // check result
                            if (result) {
                                if (result.status) {
                                    if (result.status === 'starting') {
                                        $('#streamingStatus').text("Starting, please wait...").removeClass('d-none');
                                    } else if (result.status === 'started') {
                                        $('#streamingStatus').text("Started").removeClass('d-none');
                                    } else if (result.status === 'stopped') {
                                        stopStreaming();
                                        remoteVideo.cleanup();
                                    }
                                } else if (msg.streaming === 'event') {
                                    // todo: simulcast in place? Is VP9/SVC in place?
                                }
                            }
                            // check error
                            else if (msg.error) {
                                bootbox.alert(msg["error"]);
                                stopStreaming();
                                remoteVideo.cleanup();
                                return;
                            }

                            // handle JSEP
                            if (jsep) {
                                Janus.log("streaming: handling remote SDP", jsep);
                                var stereo = (jsep.sdp.indexOf("stereo=1") !== -1);
                                // got offer from the plugin, let's answer
                                streaming.createAnswer({
                                    jsep: jsep,
                                    // We want recvonly audio/video and, if negotiated, datachannels
                                    media: {audioSend: false, videoSend: false, data: true},

                                    // our offer should contains stereo if remote SDP has it
                                    customizeSdp: function (jsep) {
                                        if (stereo && jsep.sdp.indexOf("stereo=1") === -1) {
                                            jsep.sdp = jsep.sdp.replace("useinbandfec=1", "useinbandfec=1;stereo=1");
                                        }
                                    },
                                    success: function (jsep) {
                                        Janus.log("streaming: success answering with SDP", jsep);
                                        var body = {"request": "start"};
                                        streaming.send({"message": body, "jsep": jsep});
                                        // todo: будет ли кнопка watch
                                    },
                                    error: function (error) {
                                        Janus.error("WebRTC error:", error);
                                        bootbox.alert("WebRTC error... " + JSON.stringify(error));
                                    }
                                });
                            }
                        },

                        onremotestream: function (stream) {
                            Janus.log("streaming: got remote stream", stream);
                            remoteVideo.setStream(stream);
                        },
                        oncleanup: function(){
                            Janus.log("streaming: got cleanup");
                            remoteVideo.cleanup();
                        },
                    });
                },
                error: function (error) {
                    Janus.error(error);
                    bootbox.alert('Возникла ошибка: ' + error, function () {
                        window.location.reload();
                    });
                },
                destroyed: function () {
                    bootbox.alert('Сеанс завершён, страница будет перезагружена', function () {
                        window.location.reload();
                    });
                }
            });
        }
    });
});

function stopJanus() {
    // todo: нужна кнопка остановки всего?
    janus.destroy();
}

function stopStreaming(streaming) {
    if(streaming) {
        streaming.send({"message": {"request": "stop"}});
        streaming.hangup();
    }
}

function VideoSpinner(container){
    this.container = container;
    this.spinner = null;

    this.start = function(){
        if (this.spinner) {
            spinner.spin();
        } else {
            spinner = new Spinner({top: 100}).spin(this.container);
        }
    }
    this.stop = function () {
        if (this.spinner) {
            this.spinner.stop();
            this.spinner = null;
        }
    }
}

function VideoStats(streaming, bitrateElem, resolutionElem, remoteVideoElem) {
    this.streaming = streaming;
    this.bitrateElem = bitrateElem;
    this.resolutionElem = resolutionElem;
    this.remoteVideoElem = remoteVideoElem;
    this.interval = null;

    this.isWorking = function(){
        return this.interval;
    }

    this.stop = function(){
        if (this.isWorking()) {
            clearInterval(this.interval);

            this.bitrateElem.addClass('d-none');
            this.resolutionElem.addClass('d-none');
        }
    }

    this._showCurrentResolution = function(){
        this.resolutionElem.text(
            this.remoteVideoElem.get(0).width + 'x' + this.remoteVideoElem.get(0).height).removeClass('d-none');
    }

    this.start = function () {
        this.stop();

        this.resolutionElem.removeClass('d-none');

        // Firefox Stable has a bug: width and height are not immediately available after a playing
        if (Janus.webRTCAdapter.browserDetails.browser === "firefox") {
            (function (self) {
                setTimeout(function () {
                    self._showCurrentResolution();
                }, 200);
            })(this);
        } else {
            this._showCurrentResolution();
        }

        this.bitrateElem.removeClass('d-none');
        (function (self) {
            self.interval = setInterval(function () {
                var bitrate = self.streaming.getBitrate();
                self.bitrateElem.text(bitrate);
                // Check if the resolution changed too
                var width = self.remoteVideoElem.get(0).videoWidth;
                var height = self.remoteVideoElem.get(0).videoHeight;
                if (width > 0 && height > 0)
                    self.resolutionElem.text(width + 'x' + height).removeClass('d-none');
            }, 1000);
        })(this);
    }
}

function RemoteVideo(streaming, remoteVideoElem, waitingVideoElem, noRemoteVideoElem, videoStats, spinner) {
    this.streaming = streaming;
    this.remoteVideoElem = remoteVideoElem;
    this.waitingVideoElem = waitingVideoElem;
    this.noRemoteVideoElem = noRemoteVideoElem;
    this.videoStats = videoStats;
    this.spinner = spinner;
    this.stream = null;

    this.noRemoteVideo = function(){
        // No remote video
        this.remoteVideoElem.addClass('d-none');
        this.noRemoteVideoElem.removeClass('d-none');
    }

    this.hasRemoteVideo = function(){
        this.noRemoteVideoElem.addClass('d-none');
        this.remoteVideoElem.removeClass('d-none');
    }

    this.setStream = function(stream){
        this.stream = stream;

        Janus.attachMediaStream(this.remoteVideoElem.get(0), stream);

        var videoTracks = stream.getVideoTracks();
        if (videoTracks && videoTracks.length > 0) {
            this.hasRemoteVideo();
            if (['chrome', 'firefox', 'safari'].indexOf(Janus.webRTCAdapter.browserDetails.browser) >= 0){
                this.videoStats.start();
            }
        } else {
            this.noRemoteVideo();
            this.videoStats.stop();
        }
    }

    this.startStreamMountpoint = function (mountpointId, pin) {
        Janus.log("streaming: starting mountpoint id " + mountpointId);

        var body = {"request": "watch", "id": mountpointId};
        if (pin) {
            body.pin = pin;
        }
        this.streaming.send({"message": body});
        this.noRemoteVideo();
        this.waitingVideoElem.removeClass('d-none');
        this.spinner.start();
    }

    var obj = this;  // lol hack
    this.remoteVideoElem.on("playing", function (e) {
        obj.waitingVideoElem.addClass('d-none');
        if (obj.remoteVideoElem.videoWidth){
            obj.remoteVideoElem.removeClass('d-none');
        }
        obj.spinner.stop();

        var videoTracks = obj.stream.getVideoTracks();
        if (videoTracks && videoTracks.length > 0) {
            obj.videoStats.start();
        } else {
            obj.videoStats.stop();
        }
    });

    this.cleanup = function(){
        this.waitingVideoElem.addClass('d-none');
        this.remoteVideoElem.addClass('d-none');
        this.noRemoteVideoElem.addClass('d-none');
        this.videoStats.stop();
        $('#streaming-container').addClass('d-none');
    }
}