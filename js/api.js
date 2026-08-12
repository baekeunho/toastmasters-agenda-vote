// Talks to the club's Apps Script Web App (see js/config.js).
//
// POSTs are sent as Content-Type: text/plain on purpose. Apps Script Web
// Apps can't answer a CORS preflight (OPTIONS) request, so any POST that
// would trigger one (e.g. application/json) fails cross-origin. A
// text/plain body with a JSON string counts as a "simple request" under
// the Fetch spec, so no preflight happens; Code.gs parses the body itself.
window.TM_API = (function () {
  function baseUrl() {
    var url = window.TM_CONFIG && window.TM_CONFIG.WEB_APP_URL;
    if (!url) {
      throw new Error('WEB_APP_URL is not set in js/config.js');
    }
    return url;
  }

  async function get(action, params) {
    var url = new URL(baseUrl());
    url.searchParams.set('action', action);
    Object.keys(params || {}).forEach(function (key) {
      url.searchParams.set(key, params[key]);
    });
    var res = await fetch(url.toString(), { method: 'GET' });
    return res.json();
  }

  async function post(action, body) {
    var payload = Object.assign({ action: action }, body || {});
    var res = await fetch(baseUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  return {
    getAgenda: function () { return get('getAgenda'); },
    publishAgenda: function (data) { return post('publishAgenda', data); },
    vote: function (data) { return post('vote', data); },
    submitFeedback: function (data) { return post('submitFeedback', data); }
  };
})();
