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
    $('#login-form').on('submit', function (e) {
        var sessionId = $('#input-session-id').val();
        var pin = $('#pin').val();
        remoteVideo.startStreamMountpoint(sessionId, pin);
        remoteChat.startRoom(sessionId, pin);
        e.preventDefault();
    });

    // objects
    {
        var janus = null;
        var textroom = null;
        var streaming = null;
        var ui = new UI();
    }

    // ids
    {
        var opaqueId = Janus.randomString(12);
        var streamingOpaqueId = "streaming-" + opaqueId;
        var textroomOpaqueId = "textroom-" + opaqueId;
    }

    var videoStats;
    var remoteVideo;
    var spinner;

    var remoteChat;

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
                            Janus.error("textroom: error attaching plugin: ", error);
                            bootbox.alert("Ошибка подключения к сессии: " + error);
                        },

                        onmessage: function (msg, jsep) {
                            Janus.log("textroom: got a message ", msg);

                            if (msg.error) {
                                bootbox.alert(msg.error);
                            }
                            if (jsep) {
                                // Answer
                                textroom.createAnswer({
                                    jsep: jsep,
                                    media: {audio: false, video: false, data: true},
                                    success: function (jsep) {
                                        Janus.debug("textroom: success answering with SDP", jsep);
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

                        ondataopen: function (data) {
                            console.info("textroom: DataChannel is available", data);
                        },

                        ondata: function (rawData) {
                            console.debug("textroom: got data from DataChannel", rawData);

                            var data = JSON.parse(rawData);

                            // process transaction if we have response on it
                            var transactionId = data.transaction;
                            var transactionResult = remoteChat.processTransactionAnswer(transactionId, data);
                            if (transactionResult) {
                                console.info('textroom: done transaction with id', transactionId, 'and result', transactionResult);
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
                            Janus.log("streaming: plugin attached! (" + streaming.getPlugin() + ", id=" + streaming.getId() + ")");
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
                                ui.streamingReady(true);
                            }
                            // check error
                            else if (msg.error) {
                                ui.streamingReady(false);
                                if (msg.error_code === 455){
                                    bootbox.alert('Не найдена сессия с идентификатором ' + remoteVideo.mountpointId);
                                } else {
                                    bootbox.alert(msg["error"]);
                                    stopStreaming();
                                    remoteVideo.cleanup();
                                }
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
                        oncleanup: function () {
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
    if (streaming) {
        streaming.send({"message": {"request": "stop"}});
        streaming.hangup();
    }
}

function VideoSpinner(container) {
    this.container = container;
    this.spinner = null;

    this.start = function () {
        if (this.spinner) {
            this.spinner.spin();
            console.info('VideoSpinner: started');
        } else {
            this.spinner = new Spinner({top: 100}).spin(this.container);
            console.info('VideoSpinner: created & started');
        }
    }
    this.stop = function () {
        if (this.spinner) {
            this.spinner.stop();
            this.spinner = null;
            console.log('VideoSpinner: stopped');
        } else {
            console.warn('VideoSpinner: already stopped');
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
    }
}

function RemoteVideo(ui, streaming, remoteVideoElem, waitingVideoElem, noRemoteVideoElem, videoStats, spinner) {
    this.ui = ui;
    this.streaming = streaming;
    this.remoteVideoElem = remoteVideoElem;
    this.waitingVideoElem = waitingVideoElem;
    this.noRemoteVideoElem = noRemoteVideoElem;
    this.videoStats = videoStats;
    this.spinner = spinner;
    this.stream = null;
    this.mountpointId = null;

    this.noRemoteVideo = function () {
        // No remote video
        this.remoteVideoElem.addClass('d-none');
        this.noRemoteVideoElem.removeClass('d-none');
    }

    this.hasRemoteVideo = function () {
        this.noRemoteVideoElem.addClass('d-none');
        this.remoteVideoElem.removeClass('d-none');
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
        console.info("streaming: starting mountpoint id " + mountpointId);

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
        if (obj.remoteVideoElem.videoWidth) {
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

    this.cleanup = function () {
        this.waitingVideoElem.addClass('d-none');
        this.remoteVideoElem.addClass('d-none');
        this.noRemoteVideoElem.addClass('d-none');
        this.videoStats.stop();
        $('#streaming-container').addClass('d-none');
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
        data.transaction = transactionId;
        this.transactions[transactionId] = callback;

        this.textroom.data({
            text: JSON.stringify(data),
            error: function (reason) {
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
            var ret = this.transactions[transactionId](data);
            delete this.transactions[transactionId];
            return [undefined, null].indexOf(ret) < 0 ? ret : true;
        }
        return false;
    };

    /* Chat controls */
    this.disableSendButton = function () {
        this.sendButton.attr('disabled', true);
    };

    this.enableSendButton = function () {
        this.sendButton.removeAttr('disabled');
    };

    this.disableAllChatControls = function () {
        this.disableSendButton();
        this.messageInput.attr('disabled', true);
    };

    this.enableAllChatControls = function () {
        this.enableSendButton();
        this.messageInput.removeAttr('disabled').focus();
        this.chatElem.css('height', '250px');
    };

    this.chatScrollDown = function () {
        this.chatElem.scrollTop(this.chatElem.prop('scrollHeight'));
    };

    /* HTML Event Handlers */
    this.chatForm.on("submit", function (e) {
        var data = obj.messageInput.val();
        console.info('textroom: chat form send data', data);
        obj.sendData(data)
        e.preventDefault();
    });

    /* TextRoom functions*/

    this.setUp = function(){
        console.info('textroom: set up ..');

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

			if(response.participants && response.participants.length > 0) {
                for (var i in response.participants) {
                    var p = response.participants[i];
                    obj.participants[p.username] = p.display ? p.display : p.username;
                    if (p.username !== obj.userId) {
                        obj.appendMessageToChat(`<i>${obj.participants[p.username]} уже здесь</i>`);
                    }
                }
            }

            obj.ui.textroomReady(true);
            obj.enableAllChatControls();
        }, function (reason) {
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

        this.disableAllChatControls();
        this.startTransaction(messageData, function (response) {
            obj.messageInput.val('');
            obj.enableAllChatControls();
        }, function (reason) {
            bootbox.alert(reason);
        });
    };

    this.cleanup = function () {
        this.disableAllChatControls();
    };


    /* Messages Processing */
    this.processIncomingMessage = function (message, from, date, isWhisper){
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
        message = this._formatMessageForHTML(message);
        var dateString = getDateString(date);
        this.appendMessageToChat(`<i>${message}</i>`, 'purple', dateString);
    };

    this.processJoin = function (userId, userName){
        this.participants[userId] = userName ? userName : userId;

        if (userId !== this.userId) {
            // todo: process somebody
        }
        this.appendMessageToChat(`<i>${this.participants[userId]} вошёл</i>`, 'green');
    };

    this.processLeave = function (userId){
        this.appendMessageToChat(`<i>${this.participants[userId]} вышел</i>`, 'green');
        delete this.participants[userId];
    };

    this.processKick = function (userId){
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
        this.appendMessageToChat(`<b>Сессия ${this.sessionId} была завершена</b>`);
        bootbox.alert("Сессия была завершена", function () {
            window.location.reload();
        });
        console.warn("textroom: current room " + roomId + " has been destroyed");
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
        this.checkIsAllReady();
    };

    this.textroomReady = function (ready){
        this.isTextroomReady = ready;
        this.checkIsAllReady();
    };

    this.checkIsAllReady = function(){
        if (this.isStreamingReady && this.isTextroomReady){
            if (!this.alreadyShowed) {
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
