function VideoStats(bitrateElem, resolutionElem, remoteVideoElem) {
    this.streaming = null;
    this.bitrateElem = bitrateElem;
    this.resolutionElem = resolutionElem;
    this.remoteVideoElem = remoteVideoElem;
    this.interval = null;

    this.setStreamingPluginHandle = function(streaming){
        this.streaming = streaming;
    }

    this.isWorking = function () {
        return this.interval;
    }

    this.hideElems = function(){
        this.bitrateElem.addClass('d-none');
        this.resolutionElem.addClass('d-none');
    }

    this.showElems = function(){
        this.bitrateElem.removeClass('d-none');
        this.resolutionElem.removeClass('d-none');
    }

    this.stop = function () {
        if (this.isWorking()) {
            clearInterval(this.interval);

            this.hideElems();
            console.debug('VideoStats: stopped');
        }
    }

    this._showCurrentResolution = function () {
        this.resolutionElem.text(
            this.remoteVideoElem.get(0).width + 'x' + this.remoteVideoElem.get(0).height);
    }

    this.start = function () {
        this.stop();

        // // Firefox Stable has a bug: width and height are not immediately available after a playing
        // if (Janus.webRTCAdapter.browserDetails.browser === "firefox") {
        //     (function (self) {
        //         setTimeout(function () {
        //             self._showCurrentResolution();
        //         }, 200);
        //     })(this);
        // } else {
        //     this._showCurrentResolution();
        // }

        (function (self) {
            self.interval = setInterval(function () {
                var bitrate = self.streaming.getBitrate();
                self.bitrateElem.text(bitrate);
                // Check if the resolution changed too
                var width = self.remoteVideoElem.get(0).videoWidth;
                var height = self.remoteVideoElem.get(0).videoHeight;
                if (width > 0 && height > 0)
                    self.resolutionElem.text(width + 'x' + height);
                self.showElems();
            }, 500);
        })(this);

        console.debug('VideoStats: started');
    }
}
