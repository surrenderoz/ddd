var server = null;
if(window.location.protocol === 'http:') {
	server = [
		"ws://" + window.location.hostname + ":8188",
		"http://" + window.location.hostname + ":8088/janus"
	];
} else {
	server = [
		"wss://" + window.location.hostname + ":8989",
		"https://" + window.location.hostname + ":8089/janus"
	];
}

var janus = null;
var textroom = null;
var streaming = null;
var opaqueId = Janus.randomString(12);
var streamingOpaqueId = "streaming-"+opaqueId;
var textroomOpaqueId = "textroom-"+opaqueId;

var bitrateTimer = null;
var spinner = null;

var myusername = Janus.randomString(6);
var myid = Janus.randomString(6);
var participants = {};
var transactions = {};
