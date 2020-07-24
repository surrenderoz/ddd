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
    return servers;
}

$(document).ready(function () {
    $('#login-form').on('submit', function (e) {
        var sessionId = $('#input-session-id').val();
        var pin = $('#input-pin').val();
        remoteVideo.startStreamMountpoint(sessionId, pin);
        remoteChat.startRoom(sessionId, pin);
        e.preventDefault();
    });

    // Make sure the browser supports WebRTC
    if (!Janus.isWebrtcSupported()) {
        console.error('No WebRTC support - no cartoons');
        bootbox.alert("Нет поддержки WebRTC, попробуйте свежую версию Google Chrome");
        return;
    }

    // objects
    var janus = null;
    var textroom = null;
    var streaming = null;

    var ui = new UI();

    var remoteVideo;
    var remoteChat;

    var videoStats;
    var spinner;

    // opaque ids
    var opaqueId = Janus.randomString(12);
    var streamingOpaqueId = "streaming-" + opaqueId;
    var textroomOpaqueId = "textroom-" + opaqueId;

    var janusServers = getJanusServers();
    var janusDebugLevel = ['warn', 'error'];

    console.debug('actual Janus servers:', janusServers);
    console.debug('janus debug level:', janusDebugLevel);

    // Initialize Janus Library
    Janus.init({
        debug: janusDebugLevel, callback: function () {
            janus = new Janus({
                server: janusServers,
                success: function () {
                    // Attach to TextRoom plugin
                    janus.attach({
                        plugin: "janus.plugin.textroom",
                        opaqueId: textroomOpaqueId,
                        success: function (pluginHandle) {
                            textroom = pluginHandle;
                            console.info("textroom: plugin attached! (" + textroom.getPlugin() + ", id=" + textroom.getId() + ")");

                            if (!remoteChat) {
                                remoteChat = new RemoteChat(
                                    ui,
                                    textroom,
                                    $('#textroomChat'),
                                    $('#chat-form'),
                                    $('#textroomMessageInput'),
                                    $('#textroomSendButton'),
                                )
                            }

                            remoteChat.setUp();
                        },

                        error: function (error) {
                            console.error("textroom: error attaching plugin: ", error);
                            bootbox.alert("Ошибка подключения к сессии: " + error);
                        },

                        onmessage: function (msg, jsep) {
                            console.debug("textroom: got a message ", msg);

                            if (msg.error) {
                                console.error('textroom: onmessage got error', msg)
                                bootbox.alert(msg.error);
                            }
                            if (jsep) {
                                console.debug("textroom: answering for SDP", jsep);
                                // Answer
                                textroom.createAnswer({
                                    jsep: jsep,
                                    media: {audio: false, video: false, data: true},
                                    success: function (jsep) {
                                        console.debug("textroom: success answering with SDP", jsep);
                                        var body = {"request": "ack"};
                                        textroom.send({"message": body, "jsep": jsep});
                                    },
                                    error: function (error) {
                                        console.error("textroom: WebRTC error", error);
                                        bootbox.alert("Ошибка WebRTC: " + JSON.stringify(error));
                                    }
                                });
                            }
                        },

                        ondataopen: function (data) {
                            console.debug("textroom: DataChannel is available", data);
                        },

                        ondata: function (rawData) {
                            console.debug("textroom: got data from DataChannel", rawData);

                            var data = JSON.parse(rawData);

                            // process transaction if we have response on it
                            var transactionId = data.transaction;
                            var transactionResult = remoteChat.processTransactionAnswer(transactionId, data);
                            if (transactionResult) {
                                console.debug('textroom: done transaction with id', transactionId, 'and result', transactionResult);
                                return;
                            }

                            var what = data.textroom;
                            if (what === "message") {
                                // Incoming Message
                                remoteChat.processIncomingMessage(data.text, data.from, data.date, data.whisper);
                            } else if (what === "announcement") {
                                // Room Announcement
                                remoteChat.processAnnouncement(data.text, data.date);
                            } else if (what === "join") {
                                // Somebody joined
                                remoteChat.processJoin(data.username, data.display);
                            } else if (what === "leave") {
                                // Somebody left
                                remoteChat.processLeave(data.username);
                            } else if (what === "kicked") {
                                // Somebody was kicked
                                remoteChat.processKick(data.username);
                            } else if (what === "destroyed") {
                                remoteChat.processRoomDestroy(data.room);
                            }
                        },

                        oncleanup: function () {
                            console.info("textroom: got cleanup");
                            remoteChat.cleanup();
                        }
                    });

                    // Attach to Streaming plugin
                    janus.attach({
                        plugin: "janus.plugin.streaming",
                        opaqueId: streamingOpaqueId,
                        success: function (pluginHandle) {
                            streaming = pluginHandle;
                            console.info("streaming: plugin attached! (" + streaming.getPlugin() + ", id=" + streaming.getId() + ")");
                            if (!spinner) {
                                spinner = new VideoSpinner($('#stream').get(0));
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
                                    ui,
                                    streaming,
                                    $('#streamingRemoteVideo'),
                                    $('#streamingNoRemoteVideo'),
                                    videoStats,
                                    spinner,
                                );
                            }
                        },

                        error: function (error) {
                            console.error("streaming: error attaching plugin: ", error);
                            bootbox.alert("Ошибка подключения к сессии: " + error);
                        },

                        onmessage: function (msg, jsep) {
                            console.debug("streaming: got a message", msg, jsep);
                            var result = msg.result;
                            // check result
                            if (result) {
                                if (result.status) {
                                    if (result.status === 'starting') {
                                        $('#streamingStatus').text("Starting, please wait...").removeClass('d-none');
                                    } else if (result.status === 'started') {
                                        $('#streamingStatus').text("Started").removeClass('d-none');
                                    } else if (result.status === 'stopped') {
                                        remoteVideo.stopStreaming();
                                    }
                                } else if (msg.streaming === 'event') {
                                    // todo: simulcast in place? Is VP9/SVC in place?
                                }
                                ui.streamingReady(true);
                            }
                            // check error
                            else if (msg.error) {
                                ui.streamingReady(false);
                                if (msg.error_code === 455){
                                    bootbox.alert('Не найдена сессия с идентификатором ' + remoteVideo.mountpointId);
                                } else {
                                    bootbox.alert(msg["error"]);
                                    remoteVideo.stopStreaming();
                                }
                                return;
                            }

                            // handle JSEP
                            if (jsep) {
                                console.debug("streaming: handling remote SDP", jsep);
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
                                            console.debug("streaming: SDP customized", jsep);
                                        }
                                    },
                                    success: function (jsep) {
                                        console.debug("streaming: success answering with SDP", jsep);
                                        var body = {"request": "start"};
                                        streaming.send({"message": body, "jsep": jsep});
                                    },
                                    error: function (error) {
                                        console.error("streaming: WebRTC error", error);
                                        bootbox.alert("Ошибка WebRTC: " + JSON.stringify(error));
                                    }
                                });
                            }
                        },

                        onremotestream: function (stream) {
                            console.info("streaming: got remote stream", stream);
                            remoteVideo.setStream(stream);
                        },
                        oncleanup: function () {
                            console.info("streaming: got cleanup");
                            remoteVideo.cleanup();
                        },
                    });
                },
                error: function (error) {
                    console.error(error);
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

function VideoSpinner(container) {
    this.container = container;
    this.spinner = null;

    this.start = function () {
        if (this.spinner) {
            this.spinner.spin();
            console.debug('VideoSpinner: started');
        } else {
            this.spinner = new Spinner({top: 100}).spin(this.container);
            console.debug('VideoSpinner: created & started');
        }
    }
    this.stop = function () {
        if (this.spinner) {
            this.spinner.stop();
            this.spinner = null;
            console.debug('VideoSpinner: stopped');
        } else {
            console.debug('VideoSpinner: already stopped');
        }
    }
}

function VideoStats(streaming, bitrateElem, resolutionElem, remoteVideoElem) {
    this.streaming = streaming;
    this.bitrateElem = bitrateElem;
    this.resolutionElem = resolutionElem;
    this.remoteVideoElem = remoteVideoElem;
    this.interval = null;

    this.isWorking = function () {
        return this.interval;
    }

    this.stop = function () {
        if (this.isWorking()) {
            clearInterval(this.interval);

            this.bitrateElem.addClass('d-none');
            this.resolutionElem.addClass('d-none');
            console.debug('VideoStats: stopped');
        }
    }

    this._showCurrentResolution = function () {
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

        console.debug('VideoStats: started');
    }
}

function RemoteVideo(ui, streaming, remoteVideoElem, noRemoteVideoElem, videoStats, spinner) {
    this.ui = ui;
    this.streaming = streaming;
    this.remoteVideoElem = remoteVideoElem;
    this.noRemoteVideoElem = noRemoteVideoElem;
    this.videoStats = videoStats;
    this.spinner = spinner;
    this.stream = null;
    this.mountpointId = null;

    var obj = this;  // lol hack

    this.noRemoteVideo = function () {
        this.remoteVideoElem.addClass('d-none');
        this.noRemoteVideoElem.removeClass('d-none');
        console.debug('video: no remote');
    }

    this.hasRemoteVideo = function () {
        this.noRemoteVideoElem.addClass('d-none');
        this.remoteVideoElem.removeClass('d-none');
        console.debug('video: has remote');
    }

    this.setStream = function (stream) {
        this.stream = stream;

        Janus.attachMediaStream(this.remoteVideoElem.get(0), stream);

        var videoTracks = stream.getVideoTracks();
        if (videoTracks && videoTracks.length > 0) {
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
        this.spinner.start();
    }

    this.remoteVideoElem.on("playing", function (e) {
        console.debug('video: playing event', e);
        obj.spinner.stop();

        if (obj.remoteVideoElem.videoWidth) {
            obj.remoteVideoElem.removeClass('d-none');
        }

        var videoTracks = obj.stream.getVideoTracks();
        if (videoTracks && videoTracks.length > 0) {
            obj.videoStats.start();
        } else {
            obj.videoStats.stop();
        }
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
        this.noRemoteVideoElem.addClass('d-none');
        this.videoStats.stop();
        // $('#streaming-container').addClass('d-none');
    }
}

function RemoteChat(ui, textroom, chatElem, chatForm, messageInput, sendButton) {
    this.ui = ui;
    this.textroom = textroom;
    this.chatElem = chatElem;
    this.chatForm = chatForm;
    this.messageInput = messageInput;
    this.sendButton = sendButton;

    this.transactions = {};
    this.participants = {};

    this.sessionId = '';
    this.pin = '';
    this.userId = Janus.randomString(12);
    this.userName = Janus.randomString(6);

    var obj = this;  // lol hack

    /* Transactions */
    this.startTransaction = function (data, callback, errorCallback) {
        var transactionId = Janus.randomString(12);
        console.debug('chat: transaction start', transactionId, data, callback, errorCallback);

        data.transaction = transactionId;
        this.transactions[transactionId] = callback;
        console.debug('now we have', Object.keys(this.transactions).length, 'active transactions');

        this.textroom.data({
            text: JSON.stringify(data),
            error: function (reason) {
                console.error('chat: transaction send data error', reason);
                bootbox.alert(reason);
                if (errorCallback) {
                    errorCallback(reason);
                }
            }
        });

        return transactionId;
    };

    this.processTransactionAnswer = function (transactionId, data) {
        if (this.transactions[transactionId]) {
            console.debug('chat: transaction answered', transactionId, data)
            var ret = this.transactions[transactionId](data);
            delete this.transactions[transactionId];
            console.debug('chat: now we have', Object.keys(this.transactions).length, 'active transactions');
            return [undefined, null].indexOf(ret) < 0 ? ret : true;
        }
        return false;
    };


    /* Chat controls */
    this.disableAllChatControls = function () {
        this.sendButton.attr('disabled', true);
        this.messageInput.attr('disabled', true);
    };

    this.enableAllChatControls = function () {
        this.sendButton.removeAttr('disabled');
        this.messageInput.removeAttr('disabled').focus();
        this.chatElem.css('height', '250px');
    };

    this.chatScrollDown = function () {
        this.chatElem.scrollTop(this.chatElem.prop('scrollHeight'));
    };


    /* HTML Event Handlers */
    this.chatForm.on("submit", function (e) {
        var data = obj.messageInput.val();
        obj.sendData(data)
        e.preventDefault();
    });


    /* TextRoom functions*/
    this.setUp = function(){
        console.info('chat: set up ..');

        var body = {"request": "setup"};
        this.textroom.send({"message": body});
    };

    this.startRoom = function (sessionId, pin) {
        this.sessionId = sessionId;
        this.pin = pin;

        this.registerUserAndJoinRoom();
    };

    this.registerUserAndJoinRoom = function () {
        this.disableAllChatControls();
        var registerData = {
            textroom: "join",
            room: this.sessionId,
            pin: this.pin,
            username: this.userId,
            display: this.userName,
        };
        console.debug('chat: join room & register user', registerData);

        this.startTransaction(registerData, function (response) {
            if (response.textroom === "error") {
                obj.ui.textroomReady(false);

                if (response.error_code === 417) {
                    bootbox.alert("Не найдена сессия с идентификатором " + obj.sessionId);
                } else {
                    bootbox.alert(response.error);
                }
                return;
            }

            console.debug('chat: we are in the room!');

			if(response.participants && response.participants.length > 0) {
                for (var i in response.participants) {
                    var p = response.participants[i];
                    obj.participants[p.username] = p.display ? p.display : p.username;
                    if (p.username !== obj.userId) {
                        obj.appendMessageToChat(`<i>${obj.participants[p.username]} уже здесь</i>`);
                    }
                }
            }
			console.debug('chat: room has participants', obj.participants);

            obj.ui.textroomReady(true);
            obj.enableAllChatControls();
        }, function (reason) {
            console.error('chat: joining room error', reason);
            obj.disableAllChatControls();
            bootbox.alert(reason);
        });
    };

    this.sendData = function (data) {
        if (!data) {
            return;
        }

        var messageData = {
            textroom: "message",
            room: this.sessionId,
            text: data,
        };
        console.debug('textroom: sending chat message', messageData);

        this.disableAllChatControls();
        this.startTransaction(messageData, function (response) {
            obj.messageInput.val('');
            obj.enableAllChatControls();
        }, function (reason) {
            console.error('textroom: sending chat message error', reason);
            bootbox.alert(reason);
        });
    };

    this.cleanup = function () {
        console.debug('chat: cleanup');
        this.disableAllChatControls();
    };


    /* Messages Processing */
    this.processIncomingMessage = function (message, from, date, isWhisper){
        console.debug('chat: incoming message', message, from, date, isWhisper);
        message = this._formatMessageForHTML(message);
        var dateString = getDateString(date);
        if (isWhisper) {
            // Private message
            this.appendMessageToChat(`<b>[скрытое сообщение от ${from}]:</b> ${message}</p>`, 'gray', dateString);
        } else {
            // Public message
            this.appendMessageToChat(`<b>${from}:</b> ${message}</p>`, 'black', dateString);
        }
    };

    this.processAnnouncement = function (message, date){
        console.debug('chat: announcement', message, date);
        message = this._formatMessageForHTML(message);
        var dateString = getDateString(date);
        this.appendMessageToChat(`<i>${message}</i>`, 'purple', dateString);
    };

    this.processJoin = function (userId, userName){
        console.debug('chat: user joined', userId, userName);
        this.participants[userId] = userName ? userName : userId;

        if (userId !== this.userId) {
            // todo: process somebody
        }
        this.appendMessageToChat(`<i>${this.participants[userId]} вошёл</i>`, 'green');
    };

    this.processLeave = function (userId){
        console.debug('chat: user leaved', userId);
        this.appendMessageToChat(`<i>${this.participants[userId]} вышел</i>`, 'green');
        delete this.participants[userId];
    };

    this.processKick = function (userId){
        console.debug('chat: user kicked', userId);
        this.appendMessageToChat(`<i>${this.participants[userId]} был выкинут из комнаты</i>`, 'red');
        delete this.participants[userId];

        if (userId === this.userId) {
            bootbox.alert("Вас выкинули из сессии", function () {
                window.location.reload();
            });
        }
    };

    this.processRoomDestroy = function (roomId){
        if (roomId !== this.sessionId) {
            return;
        }
        console.debug('chat: current room has been destroyed', roomId);
        this.appendMessageToChat(`<b>Сессия ${this.sessionId} была завершена</b>`);
        bootbox.alert("Сессия была завершена", function () {
            window.location.reload();
        });
    }


    this.appendMessageToChat = function (message, color, dateString){
        dateString = dateString ? dateString : getDateString();
        this.chatElem.append(`<p style="color: ${color};">[${dateString}] ${message}</p>`);
        this.chatScrollDown();
    }

    this._formatMessageForHTML = function (message){
        message = message.replace(new RegExp('<', 'g'), '&lt');
        message = message.replace(new RegExp('>', 'g'), '&gt');
        return message
    }
}

function UI(){
    this.isStreamingReady = false;
    this.isTextroomReady = false;
    this.alreadyShowed = false;

    this.streamingReady = function (ready){
        this.isStreamingReady = ready;
        console.debug('UI: streaming ready', ready);
        this.checkIsAllReady();
    };

    this.textroomReady = function (ready){
        this.isTextroomReady = ready;
        console.debug('UI: textroom ready', ready);
        this.checkIsAllReady();
    };

    this.checkIsAllReady = function(){
        if (this.isStreamingReady && this.isTextroomReady){
            if (!this.alreadyShowed) {
                console.debug('UI: all ready, switching login form to main window');
                $('#login-form-container').addClass('d-none');
                $('#main-window').removeClass('d-none');
                this.alreadyShowed = true;
            }
        }
    };
}

function getDateString(jsonDate) {
    var when;
    if (jsonDate) {
        when = new Date(Date.parse(jsonDate));
    } else {
        when = new Date();
    }
    return ("0" + when.getUTCHours()).slice(-2) + ":" +
        ("0" + when.getUTCMinutes()).slice(-2) + ":" +
        ("0" + when.getUTCSeconds()).slice(-2);
}
