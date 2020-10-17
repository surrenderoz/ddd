// Opaque ids
var opaqueId = Janus.randomString(12);
var streamingOpaqueId = "streaming-" + opaqueId;
var textroomOpaqueId = "textroom-" + opaqueId;

// Janus
var janusServers = getJanusServers();
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