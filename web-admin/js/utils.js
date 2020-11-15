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

function getQueryParams(qs) {
    qs = qs.split('+').join(' ');

    var params = {},
        tokens,
        re = /[?&]?([^=]+)=([^&]*)/g;

    while (tokens = re.exec(qs)) {
        params[decodeURIComponent(tokens[1])] = decodeURIComponent(tokens[2]);
    }

    return params;
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
