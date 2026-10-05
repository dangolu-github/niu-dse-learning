// Speaking answers: record in the browser with the microphone, or upload an audio file.
// A finished take is sent at once and replaces the earlier take for that question; the audio is kept
// in the page until it is confirmed, so a failed upload can be retried without recording again.
window.NiuRecorder = (() => {
  const N = window.Niu;
  const MAX_BYTES = 12 * 1024 * 1024;
  const EXT_TYPES = { m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', webm: 'audio/webm', '3gp': 'audio/3gpp', amr: 'audio/amr', caf: 'audio/x-caf', flac: 'audio/flac' };
  const KNOWN = ['audio/webm', 'video/webm', 'audio/ogg', 'audio/mp4', 'video/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/3gpp', 'audio/amr', 'audio/x-caf', 'audio/flac'];
  const ACCEPT = 'audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm,.mp4,.3gp,.amr,.caf,.flac';
  const canRecord = () => Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const pickType = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  let active = null;

  const duration = (blob) => new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (value) => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(value); };
    const timer = setTimeout(() => done(0), 3000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(isFinite(audio.duration) ? Math.round(audio.duration) : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });

  // o: { item, value, meta, disabled, upload({blob,type,name,kind,seconds}) → {fileId, meta}, onChange(value, meta), playback(fileId) → Blob }
  function mount(box, o) {
    const item = o.item;
    const max = item.maxSeconds || 180;
    const st = { value: o.value || null, meta: o.meta || null, url: '', mode: 'idle', revealed: !item.revealOnStart || Boolean(o.value) || o.disabled, message: '', error: false, pending: null };
    let recorder = null, stream = null, ticker = null, meter = null, context = null, prepTimer = null, asked = 0;
    box.innerHTML = `<p class="nd-prompt-line">${item.n ? `<span class="nd-n">${N.esc(item.n)}</span>` : ''}<span data-prompt></span></p><div class="nd-speak-panel"></div>`;
    const promptEl = box.querySelector('[data-prompt]'), panel = box.querySelector('.nd-speak-panel');

    const note = (text, error) => { st.message = text || ''; st.error = Boolean(error); };

    function draw() {
      promptEl.innerHTML = st.revealed ? item.prompt : '<span class="nd-speak-hidden">The question appears when you start. 开始后显示题目。</span>';
      let html = '';
      if (st.mode === 'prep') {
        html = `<div class="nd-prep"><span>Preparation 准备时间</span><span class="nd-rec-time" data-prep></span>${canRecord() ? '<button class="nd-btn" type="button" data-act="record">● Start recording now<small>现在开始录音</small></button>' : ''}<button class="nd-btn quiet" type="button" data-act="cancel">Cancel<small>取消</small></button></div>`;
      } else if (st.mode === 'recording') {
        html = `<div class="nd-rec" role="status"><span class="nd-rec-dot"></span><span class="nd-rec-time" data-time>0:00 / ${N.clock(max)}</span><span class="nd-level"><i></i></span><button class="nd-btn danger" type="button" data-act="stop">■ Stop<small>停止并保存</small></button></div>`;
      } else if (st.mode === 'asking') {
        html = '<div class="nd-prep"><span>Allow the microphone when your browser asks. 请在浏览器弹出的提示里允许使用麦克风。</span><button class="nd-btn quiet" type="button" data-act="cancel">Cancel<small>取消</small></button></div>';
      } else if (st.mode === 'uploading') {
        html = '<p class="nd-msg">Saving your answer… Keep this page open. 正在保存，请不要关闭页面。</p><div class="nd-progress"><i style="width:65%"></i></div>';
      } else {
        if (st.pending) {
          html += `<audio controls preload="metadata" src="${st.pending.url}"></audio><div class="nd-actions"><button class="nd-btn" type="button" data-act="retry">Save this answer again<small>重新保存这段录音</small></button></div>`;
        } else if (st.value) {
          const meta = st.meta || {};
          const facts = [meta.kind === 'uploaded' ? 'Audio file saved 音频已保存' : 'Recording saved 录音已保存', meta.seconds ? N.clock(meta.seconds) : '', meta.bytes ? N.size(meta.bytes) : ''].filter(Boolean).join(' · ');
          html += `<div class="nd-saved"><span class="nd-pill good">✓</span><span>${N.esc(facts)}</span></div>`;
          html += st.url ? `<audio controls preload="metadata" src="${st.url}"></audio>` : '<div class="nd-actions"><button class="nd-btn quiet" type="button" data-act="play">▶ Listen to my answer<small>听我的录音</small></button></div>';
        }
        if (!o.disabled) {
          const again = Boolean(st.value) || Boolean(st.pending);
          html += '<div class="nd-actions">'
            + (item.prepSeconds && !again ? `<button class="nd-btn alt" type="button" data-act="prep">Start preparation (${N.clock(item.prepSeconds)})<small>开始准备</small></button>` : '')
            + (canRecord() ? `<button class="nd-btn${again ? ' alt' : ''}" type="button" data-act="record">● ${again ? 'Record again' : 'Record'}<small>${again ? '重新录音' : '开始录音'} · 最长 ${N.clock(max)}</small></button>` : '')
            + `<label class="nd-btn alt nd-filepick">Upload an audio file<small>上传音频文件</small><input type="file" accept="${ACCEPT}" data-file></label></div>`
            + (canRecord() ? '' : '<p class="nd-note">This browser cannot record. Upload an audio file instead. 此浏览器不能录音，请上传音频文件。</p>');
        }
      }
      panel.innerHTML = html + `<p class="nd-msg${st.error ? ' error' : ''}" role="status">${N.esc(st.message)}</p>`;
    }

    function release() {
      clearInterval(ticker); ticker = null;
      if (meter) cancelAnimationFrame(meter); meter = null;
      if (stream) stream.getTracks().forEach((track) => track.stop()); stream = null;
      if (context) { try { context.close(); } catch (error) { /* already closed */ } } context = null;
      if (active === api) active = null;
    }

    function clearPrep() { clearInterval(prepTimer); prepTimer = null; }

    function startPrep() {
      st.mode = 'prep'; st.revealed = true; note('');
      draw();
      const end = Date.now() + item.prepSeconds * 1000;
      const tick = () => {
        const left = Math.max(0, Math.round((end - Date.now()) / 1000));
        const el = panel.querySelector('[data-prep]');
        if (el) el.textContent = N.clock(left);
        if (left <= 0 && st.mode === 'prep') { clearPrep(); st.mode = 'idle'; note('Preparation time is up. Start recording. 准备时间到，请开始录音。'); draw(); }
      };
      tick();
      prepTimer = setInterval(tick, 500);
    }

    async function startRecording() {
      if (active && active !== api) active.stop();
      clearPrep();
      const request = ++asked;
      st.mode = 'asking'; st.revealed = true; note('');
      draw();
      let granted = null;
      try { granted = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (error) {
        if (request !== asked || st.mode !== 'asking') return;
        st.mode = 'idle';
        note('The microphone is blocked. Allow the microphone for this site in your browser, or upload an audio file instead. 麦克风被拦截：请在浏览器里允许本网站使用麦克风，或改为上传音频文件。', true);
        draw();
        return;
      }
      // Cancelled while the browser was still asking: let the microphone go again.
      if (request !== asked || st.mode !== 'asking') { granted.getTracks().forEach((track) => track.stop()); return; }
      stream = granted;
      const type = pickType();
      try { recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream); }
      catch (error) { release(); st.mode = 'idle'; note('Recording is not available in this browser. Upload an audio file instead. 此浏览器不能录音，请上传音频文件。', true); draw(); return; }
      active = api;
      const chunks = [];
      const started = performance.now();
      recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        // A take that ran to the limit is reported as the limit, not a moment over it.
        const seconds = Math.min(max, Math.round((performance.now() - started) / 1000));
        const blob = new Blob(chunks, { type: (recorder.mimeType || type || 'audio/webm').split(';')[0] });
        recorder = null;
        release();
        if (!blob.size || seconds < 1) { st.mode = 'idle'; note('Nothing was recorded. Try again. 没有录到声音，请再试一次。', true); draw(); return; }
        save(blob, blob.type, 'recording', 'recorded', seconds);
      };
      recorder.start();
      st.mode = 'recording'; st.revealed = true; note('');
      draw();
      ticker = setInterval(() => {
        const elapsed = (performance.now() - started) / 1000;
        const el = panel.querySelector('[data-time]');
        if (el) el.textContent = `${N.clock(elapsed)} / ${N.clock(max)}`;
        if (elapsed >= max) stop();
      }, 250);
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        context = new Ctx();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] - 128));
          const bar = panel.querySelector('.nd-level i');
          if (bar) bar.style.width = Math.min(100, Math.round(peak / 128 * 160)) + '%';
          meter = requestAnimationFrame(loop);
        };
        loop();
      } catch (error) { /* the level meter is optional */ }
    }

    function stop() {
      clearInterval(ticker); ticker = null;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    }

    async function save(blob, type, name, kind, seconds) {
      if (blob.size > MAX_BYTES) {
        st.mode = 'idle';
        note(`This audio is ${N.size(blob.size)}; the limit is 12 MB. Record a shorter answer, or save the file as m4a or mp3. 文件超过 12 MB，请缩短录音或改存为 m4a / mp3。`, true);
        draw();
        return;
      }
      st.mode = 'uploading'; note('');
      draw();
      try {
        const result = await o.upload({ blob, type, name, kind, seconds });
        if (st.url) URL.revokeObjectURL(st.url);
        if (st.pending && st.pending.url) URL.revokeObjectURL(st.pending.url);
        st.pending = null;
        st.url = URL.createObjectURL(blob);
        st.value = { file: result.fileId }; st.meta = result.meta;
        st.mode = 'idle'; note('');
        o.onChange(st.value, result.meta);
      } catch (error) {
        if (st.pending && st.pending.url) URL.revokeObjectURL(st.pending.url);
        st.pending = { blob, type, name, kind, seconds, url: URL.createObjectURL(blob) };
        st.mode = 'idle';
        note(((error && error.message) || 'The answer could not be saved.') + ' Your audio is still here: press “Save this answer again”. 录音还在，请点“重新保存”。', true);
      }
      draw();
    }

    async function pickFile(file) {
      const extension = (file.name.split('.').pop() || '').toLowerCase();
      let type = String(file.type || '').toLowerCase().split(';')[0];
      if (KNOWN.indexOf(type) < 0) type = EXT_TYPES[extension] || type;
      if (KNOWN.indexOf(type) < 0) { note('Choose an audio file: m4a, mp3, wav, aac, ogg or webm. 请选择音频文件。', true); draw(); return; }
      clearPrep();
      st.revealed = true;
      await save(file, type, file.name, 'uploaded', await duration(file));
    }

    async function play() {
      note('Loading your answer… 正在加载');
      draw();
      try {
        const blob = await o.playback(st.value.file);
        st.url = URL.createObjectURL(blob);
        note('');
      } catch (error) { note((error && error.message) || 'The audio could not be loaded.', true); }
      draw();
    }

    panel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-act]');
      if (!button) return;
      const act = button.dataset.act;
      if (act === 'prep') startPrep();
      else if (act === 'record') startRecording();
      else if (act === 'stop') stop();
      else if (act === 'cancel') { clearPrep(); asked += 1; st.mode = 'idle'; note(''); draw(); }
      else if (act === 'play') play();
      else if (act === 'retry' && st.pending) save(st.pending.blob, st.pending.type, st.pending.name, st.pending.kind, st.pending.seconds);
    });
    panel.addEventListener('change', (event) => {
      const input = event.target.closest('[data-file]');
      if (input && input.files && input.files[0]) pickFile(input.files[0]);
    });

    const api = { stop, isBusy: () => st.mode === 'recording' || st.mode === 'uploading', hasUnsaved: () => Boolean(st.pending) };
    draw();
    return api;
  }

  return { mount, canRecord };
})();
