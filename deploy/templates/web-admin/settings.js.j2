// Opaque ids
var opaqueId = Janus.randomString(12);
var streamingOpaqueId = "streaming-" + opaqueId;
var textroomOpaqueId = "textroom-" + opaqueId;

// Janus
{% if api_http %}var portApiHttp = {{ api_http_port }};{% endif %}
{% if api_https %}var portApiHttps = {{ api_https_port }};{% endif %}
{% if api_wss %}var portApiWss = {{ api_wss_port }};{% endif %}
var apiSecret = "{{ janus_api_secret }}";

var janusDebugLevel = 'all'; // ['warn', 'error'];

// Toastr options
toastr.options = {
    "closeButton": false,
    "debug": false,
    "newestOnTop": false,
    "progressBar": true,
    "positionClass": "toast-top-right",
    "preventDuplicates": true,

    "showDuration": 1,
    "hideDuration": 1000,
    "timeOut": 5000,
    "extendedTimeOut": 0,

    "showEasing": "swing",
    "hideEasing": "linear",
    "showMethod": "fadeIn",
    "hideMethod": "fadeOut",

    "onclick": null,
    "onHidden": null,
}

// Janus servers
function getJanusServers() {
    var servers = [];
    if (window.location.protocol === 'https:') {
        servers.push(
{% if api_wss %}
            `wss://${window.location.hostname}:${portApiWss}`,
{% endif %}
{% if api_https %}
            `https://${window.location.hostname}:${portApiHttps}/janus`,
{% endif %}
        );
    }
    if (window.location.protocol === 'http:') {
        servers.push(
            // insecure websockets strictly disabled: `ws://${window.location.hostname}:${portApiWs}`,
{% if api_http %}
            `http://${window.location.hostname}:${portApiHttp}/janus`,
{% endif %}
        );
    }
    return servers;
}

var janusServers = getJanusServers();
