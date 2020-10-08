function DebugUtils(remoteChat){
    this.enabled = false;
    this.testSwipesInterval = null;
    this.remoteChat = remoteChat;

    this.isDebugEnabled = function(){
        return this.enabled;
    }

    this.enable = function(){
        this.enabled = true;
        $('.debug-stuff').removeClass('d-none');
        $('div').addClass('debug-border');
    }

    this.disable = function(){
        this.enabled = false;
        $('.debug-stuff').addClass('d-none');
        $('div').removeClass('debug-border');
    }

    this.toggleTestSwipes = function(w, h, delay){
        if (this.testSwipesInterval){
            clearInterval(this.testSwipesInterval);
            this.testSwipesInterval = null;
            return 'Off';
        } else {
            (function (self, w, h, delay) {
                if (typeof w === 'undefined'){w = 500;}
                if (typeof h === 'undefined'){h = 200;}
                if (typeof delay === 'undefined'){delay = 1000;}
                self.testSwipesInterval = setInterval(function () {
                    self.remoteChat.sendData(`swipe,${w},${h},0,${h},500`);
                }, delay);
            })(this, w, h, delay);
            return 'On';
        }
    }
}