// The offline page's retry (feat-webapp-4): when the browser reports a
// connection, or every 5 seconds, ask the server for this very address; a
// real answer (not the worker's own offline page, marked X-Chassis-Offline)
// reloads. Also bound to the Retry button.
(function () {
    function retry() {
        fetch(location.href, { cache: 'no-store' })
            .then((res) => {
                if (res.status < 500 && !res.headers.get('x-chassis-offline')) location.reload();
            })
            .catch(() => {});
    }
    window.addEventListener('online', retry);
    setInterval(retry, 5000);
    const button = document.getElementById('retry');
    if (button) button.addEventListener('click', retry);
})();
