// Start the public catalog in parallel with the application bundle, not after
// React, Firebase and the rest of the app have initialized. Consumed once.
(function () {
var controller = new AbortController();
var timer = setTimeout(function () { controller.abort(); }, 20000);
window.__cinemaCatalogRequest = fetch('/api/movies', {
  headers: { Accept: 'application/json' }, cache: 'no-store',
  signal: controller.signal
}).then(function (response) {
  return response.ok ? response.json() : null;
}).catch(function () { return null; }).finally(function () { clearTimeout(timer); });
})();
