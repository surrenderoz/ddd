function CheatCodes(){
    this.keys = [];
    this.cheatMinLength = 4;
    this.cheatTimeout = null;
    this.cheatTimeoutDelay = 500;

    var obj = this;  // for event handlers

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
                    ui.emit('CheatCodes.onCheatEntered', cheat);
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
