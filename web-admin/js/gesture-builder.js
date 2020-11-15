function GestureBuilder(divGesture, remoteChat){
    this.divGesture = divGesture;
    this.remoteChat = remoteChat;

    this.swipeStartPosition = [0, 0];
    this.swipeStartMillis = 0;
    this.swipeInProcess = false;

    let obj = this;  // for event handlers

    this.gestureStart = function (offsetX, offsetY){
        console.debug('gesture: starts on ', [offsetX, offsetY]);
        this.swipeInProcess = true;
        this.swipeStartMillis = Date.now();
        this.swipeStartPosition = [offsetX, offsetY];
    }

    this.gestureFinish = function (offsetX, offsetY){
        offsetX = offsetX > 0 ? offsetX : 0;
        offsetY = offsetY > 0 ? offsetY : 0;
        if(this.swipeInProcess){
            console.debug('gesture: ends on ', [offsetX, offsetY]);

            var swipeDuration = Date.now() - this.swipeStartMillis;
            var swipeEndPosition = [offsetX, offsetY];
            var swipeType = '', swipeDataToSend = '';
            if (Math.abs(this.swipeStartPosition[0]-swipeEndPosition[0]) < 2 && Math.abs(this.swipeStartPosition[1]-swipeEndPosition[1]) < 2 ){
                swipeDataToSend = `tap,${this.swipeStartPosition[0]},${this.swipeStartPosition[1]},${swipeDuration}`;
            } else {
                swipeDataToSend = `swipe,${this.swipeStartPosition[0]},${this.swipeStartPosition[1]},${swipeEndPosition[0]},${swipeEndPosition[1]},${swipeDuration}`;
            }
            this.remoteChat.sendData(swipeDataToSend);
            this.swipeInProcess = false;
        }
    }

    this.divGesture.on('mousedown', function(e){
        $(e.target).css('cursor', 'pointer');
        obj.gestureStart(e.offsetX, e.offsetY);
        e.preventDefault();
    }).on('mouseup', function(e){
        $(e.target).css('cursor', 'auto');
        obj.gestureFinish(e.offsetX, e.offsetY);
        e.preventDefault();
    }).on('mouseleave', function(e){
        $(e.target).css('cursor', 'auto');
        obj.gestureFinish(e.offsetX, e.offsetY);
        e.preventDefault();
    });
}
