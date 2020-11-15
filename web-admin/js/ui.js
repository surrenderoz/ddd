function UI(){
    this.deviceName = null;

    this.initIsTextroomReady = false;
    this.initIsStreamingReady = false;
    this.connDialog = null;
    this.connIsTextroomReady = false;
    this.connIsStreamingReady = false;

    this.errors = new Map();
    this.errorIntervals = new Map();
    /* Error aliases:
        no_session
        transaction_error (textroom only?)
        join_error (textroom only?)
        session_closed
        janus_session_error
        janus_session_destroyed
        webrtc_error
        streaming_message_error
        textroom_message_error
        streaming_error

        textroom_send_error
    */

    /* Events Management */
    this.events = {}

    this.on = function (name, listener, context){
        if (!this.events[name]) {
            this.events[name] = [];
        }
        this.events[name].push([listener, context]);
    }

    this.removeListener = function (name, listenerToRemove) {
        if (!this.events[name]) {
            console.error(`UI.Events: can't remove a listener. Event "${name}" doesn't exits.`);
        }
        const filterListeners = function(listener){
            return listener !== listenerToRemove;
        };
        this.events[name] = this.events[name].filter(filterListeners);
    }

    this.emit = function (name, data){
        if (!this.events[name]) {
            console.error(`UI.Events: can't emit a listener. Event "${name}" doesn't exits.`);
        }

        this.events[name].forEach(function(callback, index){
            console.debug(`UI.Events: run handler #${index+1} for event "${name}" with data`, data);
            callback[0].apply(callback[1], [data]);
        });
    }


    this.fillForm = function(){
        if (document.location.search) {
            var query = getQueryParams(document.location.search);
            if (query.session) {
                $('#input-session-id').val(query.session);
            }
            if (query.pin) {
                $('#input-pin').val(query.pin);
            }
        }
    }

    /* Stage 1: initialization */
    this.initStart = function(){
        this.fillForm();
        this.initIsTextroomReady = false;
        this.initIsStreamingReady = false;
        loader.show('Setup ..')
    }

    this.initAbort = function(){
        this.initIsTextroomReady = false;
        this.initIsStreamingReady = false;
        loader.hide();
    }

    this.initTextroomReady = function(){
        console.debug('UI.Initialization: textroom ready');
        this.initIsTextroomReady = true;
        this.checkInitReady();
    }

    this.initStreamingReady = function(){
        console.debug('UI.Initialization: streaming ready');
        this.initIsStreamingReady = true;
        this.checkInitReady();
    }

    this.checkInitReady = function(){
        if (this.initIsStreamingReady && this.initIsTextroomReady){
            console.debug('UI.Initialization: ready. Show login form');
            loader.hide();
        }
    }


    /* Stage 2: connection */

    this.connStart = function(){
        this.connIsTextroomReady = false;
        this.connIsStreamingReady = false;
        loader.show('Connecting to device ..');
    }

    this.connAbort = function(){
        this.initIsTextroomReady = false;
        this.initIsStreamingReady = false;
        loader.hide();
    }

    this.connTextroomReady = function(){
        console.debug('UI.Connection: textroom ready');
        this.connIsTextroomReady = true;
        this.checkConnReady();
    }

    this.connStreamingReady = function(){
        console.debug('UI.Connection: streaming ready');
        this.connIsStreamingReady = true;
        this.checkConnReady();
    }

    this.checkConnReady = function(){
        if (this.connIsStreamingReady && this.connIsTextroomReady) {
            console.debug('UI.Connection: ready. Switching from login form to main window');
            loader.hide();
            $('#login-form-container').addClass('d-none');
            $('#main-window').removeClass('d-none');
        }
    }


    /* Errors */

    this.showErrorModal = function(message, alias, callback, timeout){
        var errorAlias =  typeof alias !== 'undefined' ? alias : message;
        var existsError = this.errors.get(errorAlias);
        var currentTimestamp = new Date().getTime();
        if (existsError && currentTimestamp - existsError[1] < 5000){  // старая ошибка - ничего не делаем
            console.info('Error (repeat)', message, alias);
        } else {  // новая ошибка - показываем пользователю
            console.error('Error', message, alias);
            var modalDialog = bootbox.alert({
                message: message,
                callback: callback,
            });
            if (timeout === parseInt(timeout, 10) && typeof callback !== 'undefined'){
                (function (self, timeout_id) {
                    var interval = window.setInterval(function () {
                        var intervalData = self.errorIntervals.get(timeout_id);
                        intervalData[1] += 1;
                        intervalData[3].find('.modal-footer .btn-primary').html(
                            `${intervalData[4]} (${(intervalData[2]-intervalData[1]).toString()})`
                        )
                        if(intervalData[1] >= intervalData[2]){
                            window.clearInterval(intervalData[0]);
                            callback();
                            intervalData[3].modal('hide');
                            self.errorIntervals.delete(timeout_id);
                        }
                    }, 1000);ge :
                    self.errorIntervals.set(currentTimestamp, [interval, -1, timeout, modalDialog, modalDialog.find('.modal-footer .btn-primary').html()]);
                })(this, currentTimestamp);
            }
        }
        this.errors.set(errorAlias, [message, currentTimestamp]);
    }

    this.showNotify = function (type, message, title, onclick, onhidden, timeout){
        var options = {};
        if (typeof onclick === 'function'){
            options.onclick = onclick;
        }
        if (typeof onhidden === 'function'){
            options.onHidden = onhidden;
        }
        if (typeof timeout === 'number'){
            options.timeOut = timeout;
        }
        toastr[type](message, title, options);
    }
    this.showInfo = function(message, title, onclick, onhidden, timeout){
        this.showNotify('info', message, title, onclick, onhidden, timeout);
    }
    this.showWarning = function(message, title, onclick, onhidden, timeout){
        this.showNotify('warning', message, title, onclick, onhidden, timeout);
    }
    this.showSuccess = function(message, title, onclick, onhidden, timeout){
        this.showNotify('success', message, title, onclick, onhidden, timeout);
    }
    this.showError = function(message, title, onclick, onhidden, timeout){
        this.showNotify('error', message, title, onclick, onhidden, timeout);
    }

    /* Misc */
    this.setDevice = function(deviceId, deviceName){
        this.deviceId = deviceId;
        this.deviceName = deviceName;
        $('#textDeviceName').html(deviceName);
    }

    /* Disconnect */
    this.sessionClosedRemotely = function(message){
        message = message ? message : 'Session has been terminated by remote device';
        this.showErrorModal(message, 'session_closed', function(){window.location.reload();}, 5);
    }

    this.disconnect = function(message){
        message = message ? message : 'Disconnected';
        this.showErrorModal(message, 'session_closed', function(){window.location.reload();}, 5);
    }
}
