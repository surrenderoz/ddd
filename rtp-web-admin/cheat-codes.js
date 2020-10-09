function CheatCodes(){
    this.keys = [];
    this.cheatMinLength = 4;
    this.cheatTimeout = null;
    this.cheatTimeoutDelay = 500;

    this.cheatHandlers = new Map();

    var obj = this;  // for event handlers

    this.onCheat = function(cheat){
        console.info(`CheatCodes: entered cheat "${cheat}"`);

        if (this.cheatHandlers.has(cheat)){
            this.cheatHandlers.get(cheat).forEach(function(handler, index){
                console.debug(`CheatCodes: run handler #${index+1} for cheat "${cheat}"`);
                handler.apply(window, [cheat]);
            });
        }
    }

    this.on = function(cheat, callback){
        cheat = cheat.toLowerCase();
        if (!this.cheatHandlers.has(cheat)){
            this.cheatHandlers.set(cheat, [callback]);
        } else {
            this.cheatHandlers.get(cheat).push(callback);
        }
    }

    this.restartCheatInterval = function(){
        if(this.cheatTimeout){
            window.clearTimeout(this.cheatTimeout);
            this.cheatTimeout = null;
        }

        (function (self, delay) {
            self.cheatTimeout = window.setTimeout(function () {
                var cheat = self.keys.join('');
                self.keys = [];
                if (cheat.length >= self.cheatMinLength){
                    self.onCheat(cheat);
                }
                self.cheatTimeout = null;
            }, delay);
        })(this, this.cheatTimeoutDelay);
    }

    $(document).on('keydown', function(e){
        obj.restartCheatInterval();
        if (e.keyCode >= 65 && e.keyCode <= 90){
            obj.keys.push(e.key.toLowerCase());
        }
    });
}
