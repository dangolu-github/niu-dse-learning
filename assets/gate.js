// Course access for Niu's learner pages. The password is checked by the course service and never stored
// here: the browser keeps an opaque trust credential and a short-lived access token.
(() => {
  const trustedBrowserKey = 'niu-dse-trusted-browser-v1';
  const deviceTokenKey = 'niu-dse-device-token-v1';
  const tokenKey = 'niu-dse-access-token';
  const expiryKey = 'niu-dse-access-expires-at';
  const config = window.NIU_PORTAL_CONFIG || {};
  let resolveReady;
  let renewal = null;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  const readStorage = (storage, key) => {
    try { return storage.getItem(key) || ''; }
    catch { return ''; }
  };
  const writeStorage = (storage, key, value) => {
    try { storage.setItem(key, value); return true; }
    catch { return false; }
  };
  const getToken = () => readStorage(window.sessionStorage, tokenKey);
  const getDeviceToken = () => readStorage(window.localStorage, deviceTokenKey);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randomId = (prefix) => prefix + '-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(16) + Math.random().toString(16).slice(2).padEnd(16, '0'));

  const setAccess = (token, deviceToken, expiresIn) => {
    if (token) writeStorage(window.sessionStorage, tokenKey, token);
    if (token) writeStorage(window.sessionStorage, expiryKey, String(Date.now() + Number(expiresIn || 21600) * 1000));
    writeStorage(window.localStorage, trustedBrowserKey, 'granted');
    if (deviceToken) writeStorage(window.localStorage, deviceTokenKey, deviceToken);
  };

  const consumeTrustedDevice = () => {
    try {
      const parameters = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const token = String(parameters.get('niu-trusted-device') || '').replace(/[^a-f0-9]/gi, '').slice(0, 128);
      if (!token) return '';
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return token;
    }
    catch { return ''; }
  };

  // JSONP read: Apps Script web apps answer GET requests from any origin this way.
  const requestData = (action, parameters, timeoutMs) => new Promise((resolve, reject) => {
    if (!config.endpoint) { reject(new Error('The course service is not connected yet.')); return; }
    const callbackName = `__niuPortal${Date.now()}${Math.random().toString(16).slice(2)}`;
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('The course service did not answer. Check your connection and try again.')); }, timeoutMs || 25000);
    const cleanup = () => { window.clearTimeout(timeout); delete window[callbackName]; script.remove(); };
    window[callbackName] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('The course service could not be reached.')); };
    const query = new URLSearchParams(Object.assign({}, parameters, { action, callback: callbackName, _: String(Date.now()) }));
    script.src = `${config.endpoint}?${query.toString()}`;
    document.head.appendChild(script);
  });

  const requestAccess = async (action, parameters) => {
    const data = await requestData(action, parameters);
    if (!data || !data.ok || !data.accessToken) throw new Error((data && data.error) || 'Access could not be confirmed.');
    return data;
  };
  const authorize = (code) => requestAccess('authorizeAccess', { code });
  const renewAccess = (deviceToken) => requestAccess('renewAccess', { deviceToken });

  async function ensureFreshAccess(force) {
    if (renewal) return renewal;
    const token = getToken();
    const expiresAt = Number(readStorage(window.sessionStorage, expiryKey));
    if (!force && token && expiresAt > Date.now() + 60000) return token;
    const device = getDeviceToken();
    if (!device) {
      showGate();
      throw new Error('Please enter the course password again. Nothing you saved is lost.');
    }
    renewal = renewAccess(device).then((access) => {
      setAccess(access.accessToken, device, access.expiresIn);
      reveal();
      resolveReady();
      return access.accessToken;
    }).catch(() => {
      showGate();
      throw new Error('We could not reconnect. Check your connection and enter the course password again.');
    }).finally(() => { renewal = null; });
    return renewal;
  }

  async function request(action, parameters, timeoutMs) {
    let token = await ensureFreshAccess(false);
    let data = await requestData(action, Object.assign({}, parameters, { accessToken: token }), timeoutMs);
    if (data && !data.ok && /course access expired/i.test(data.error || '')) {
      token = await ensureFreshAccess(true);
      data = await requestData(action, Object.assign({}, parameters, { accessToken: token }), timeoutMs);
    }
    if (!data || !data.ok) throw new Error((data && data.error) || 'The request could not be confirmed. Please try again.');
    return data;
  }

  // Write: the response to the POST is opaque (no-cors), so the outcome is read back as a receipt
  // stored under this request's ID. Resolves with the server's result or throws its error message.
  async function post(action, payload, retried) {
    if (!config.endpoint) throw new Error('The course service is not connected yet.');
    const token = await ensureFreshAccess(false);
    const requestId = randomId('req');
    let sent = true;
    try {
      await fetch(config.endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({}, payload, { action, accessToken: token, requestId }))
      });
    } catch (error) { sent = false; }
    for (let attempt = 0; attempt < (sent ? 8 : 2); attempt += 1) {
      let receipt = null;
      try { receipt = await requestData('getReceipt', { requestId }); } catch (error) { /* try again */ }
      if (receipt && receipt.found) {
        const result = receipt.result || {};
        if (result.ok) return result;
        if (!retried && /course access expired/i.test(result.error || '')) {
          await ensureFreshAccess(true);
          return post(action, payload, true);
        }
        throw new Error(result.error || 'The request was not accepted.');
      }
      await sleep(600 + attempt * 500);
    }
    throw new Error(sent ? 'We could not confirm that this was saved. Check your connection and try again.' : 'The request could not be sent. Check your connection and try again.');
  }

  // A write nobody waits for (the page moves on at once; the server works in the background).
  async function fire(action, payload) {
    try {
      const token = await ensureFreshAccess(false);
      fetch(config.endpoint, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({}, payload, { action, accessToken: token }))
      }).catch(() => {});
    } catch (error) { /* nothing depends on this request */ }
  }

  window.NiuAccess = { ready, ensureFreshAccess, request, post, fire, getToken, randomId, siteUrl: config.siteUrl || '' };

  const reveal = () => {
    document.body.dataset.access = 'granted';
    document.documentElement.classList.remove('access-pending');
    document.body.classList.remove('access-locked');
    document.querySelectorAll('body > [inert]').forEach((node) => { node.inert = false; });
    document.querySelector('.access-gate')?.remove();
  };

  const showGate = () => {
    if (document.querySelector('.access-gate')) return;
    document.body.dataset.access = 'locked';
    document.body.classList.add('access-locked');
    Array.from(document.body.children).forEach((node) => { node.inert = true; });
    const gate = document.createElement('div');
    gate.className = 'access-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'access-title');
    gate.innerHTML = `
      <form class="access-card">
        <p class="access-kicker">Niu · DSE English</p>
        <h1 id="access-title">Welcome back</h1>
        <p>Enter your course password. 请输入课程密码。</p>
        <label for="course-password">Password</label>
        <div class="access-row">
          <input id="course-password" name="password" type="password" autocomplete="current-password" required>
          <button type="submit">Continue</button>
        </div>
        <p class="access-error" role="alert" aria-live="polite"></p>
      </form>`;
    document.body.append(gate);
    gate.inert = false;
    document.documentElement.classList.remove('access-pending');
    const form = gate.querySelector('form');
    const input = gate.querySelector('input');
    const error = gate.querySelector('.access-error');
    input.focus();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.textContent = '';
      const button = form.querySelector('button');
      button.disabled = true;
      button.textContent = 'Opening…';
      try {
        const access = await authorize(input.value.trim());
        setAccess(access.accessToken, access.deviceToken, access.expiresIn);
      } catch (accessError) {
        const message = (accessError && accessError.message) || '';
        const wrong = /incorrect course password/i.test(message);
        error.textContent = wrong ? 'That password does not match. Please try again.'
          : /too many attempts/i.test(message) ? message
            : 'We could not connect to your course. Check your connection and try again.';
        if (wrong) input.select();
        button.disabled = false;
        button.textContent = wrong ? 'Continue' : 'Try again';
        return;
      }
      reveal();
      resolveReady();
    });
  };

  const trustedDevice = consumeTrustedDevice() || getDeviceToken();
  if (trustedDevice) {
    renewAccess(trustedDevice).then((access) => {
      setAccess(access.accessToken, trustedDevice, access.expiresIn);
      reveal();
      resolveReady();
    }).catch(() => { showGate(); });
    return;
  }
  showGate();
})();
