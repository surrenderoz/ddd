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

    // TODO: test
    // servers = [];
    // if (window.location.protocol === 'https:') {
    //     servers.push(
    //         "ws://janus-rtp-remoteadmin.kuzmichev.dev:8188",
    //         "http://janus-rtp-remoteadmin.kuzmichev.dev:8088/janus",
    //         //"ws://demo.h-mdm.com:8188",
    //         //"http://demo.h-mdm.com:8088/janus",
    //     );
    // } else {
    //     servers.push(
    //         "wss://janus-rtp-remoteadmin.kuzmichev.dev:8989",
    //         "https://janus-rtp-remoteadmin.kuzmichev.dev:8089/janus",
    //         //"wss://demo.h-mdm.com:8989",
    //         //"https://demo.h-mdm.com/janus"
    //     );
    // }
    // TODO: end test
    return servers;
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

function Loader(divLoader){
    this.divLoader = divLoader;

    this.show = function (text){
        if (text) {
            this.divLoader.attr('data-text', text);
        } else {
            this.divLoader.removeAttr('data-text');
        }
        this.divLoader.addClass('is-active');
    }

    this.hide = function(){
        this.divLoader.removeClass('is-active');
    }
}
window.loader = new Loader($('#pageLoader'));