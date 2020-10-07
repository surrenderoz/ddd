function RemoteVideo(ui, remoteVideoElem, videoLoader, videoStats) {
    this.ui = ui;
    this.streaming = null;
    this.remoteVideoElem = remoteVideoElem;
    this.videoLoader = videoLoader;
    this.videoStats = videoStats;
    this.stream = null;
    this.mountpointId = null;

    this.videoResolution = null;

    var obj = this;  // for event handlers

    this.noRemoteVideo = function () {
        this.videoLoader.show();
        console.debug('video: no remote');
    }

    this.hasRemoteVideo = function () {
        this.videoLoader.hide();
        console.debug('video: has remote');
    }

    this.setStreamingPluginHandle = function(streaming){
        this.streaming = streaming;
    }

    this.setResolution = function(w, h){
        this.videoResolution = [w, h];
        this.remoteVideoElem.attr('width', w).attr('height', h);
    }

    this.setStream = function (stream) {
        let streamChanged = false;
        if (this.stream !== stream) {
            this.stream = stream;
            streamChanged = true;
        }

        var videoTracks = stream.getVideoTracks();
        if (videoTracks && videoTracks.length > 0) {
            if (streamChanged) {
                Janus.attachMediaStream(this.remoteVideoElem.get(0), this.stream);
            }
            this.hasRemoteVideo();
            if (['chrome', 'firefox', 'safari'].indexOf(Janus.webRTCAdapter.browserDetails.browser) >= 0) {
                this.videoStats.start();
            }
        } else {
            this.noRemoteVideo();
            this.videoStats.stop();
        }
    }

    this.startStreamMountpoint = function (mountpointId, pin) {
        this.mountpointId = mountpointId;
        console.info("streaming: starting mountpoint id " + mountpointId + ' with pin ' + pin);

        var body = {"request": "watch", "id": mountpointId, "pin": pin};
        this.streaming.send({"message": body});
        this.noRemoteVideo();
    }

    this.remoteVideoElem.on("playing", function (e) {
        console.debug('video: playing event', e);

        var videoTracks = obj.stream.getVideoTracks();
        if (videoTracks && videoTracks.length > 0) {
            obj.videoStats.start();
            remoteVideoElem = obj.remoteVideoElem.get(0);
            obj.setResolution(remoteVideoElem.videoWidth, remoteVideoElem.videoHeight);
        } else {
            obj.videoStats.stop();
        }
    });

    this.remoteVideoElem.on("canplay", function (e) {
        console.debug('VIDEO: canplay', e);
    });

    this.remoteVideoElem.on("waiting", function (e) {
        console.debug('VIDEO: waiting', e);
    });
    this.remoteVideoElem.on("loadeddata", function (e) {
        console.debug('VIDEO: loadeddata', e);
    });
    this.remoteVideoElem.on("loadedmetadata", function (e) {
        console.debug('VIDEO: loadedmetadata', e);
    });
    this.remoteVideoElem.on("play", function (e) {
        console.debug('VIDEO: play', e);
    });
    this.remoteVideoElem.on("pause", function (e) {
        console.debug('VIDEO: pause', e);
    });
    this.remoteVideoElem.on("suspend", function (e) {
        console.debug('VIDEO: suspend', e);
    });
    this.remoteVideoElem.on("abort", function (e) {
        console.debug('VIDEO: abort', e);

    });
    this.remoteVideoElem.on("durationchanged", function (e) {
        console.debug('VIDEO: durationchanged', e);
    });

    this.remoteVideoElem.on("error", function (e) {
        console.debug('VIDEO: error', e);
    });
    this.remoteVideoElem.on("progress", function (e) {
        // console.debug('VIDEO: progress', e);
    });


    this.stopStreaming = function () {
        console.info('video: stopping streaming');
        this.streaming.send({"message": {"request": "stop"}});
        this.streaming.hangup();
        this.cleanup();
    }

    this.cleanup = function () {
        console.info('video: cleanup ..');
        this.remoteVideoElem.addClass('d-none');
        this.videoStats.stop();
        // $('#streaming-container').addClass('d-none');
    }
}
