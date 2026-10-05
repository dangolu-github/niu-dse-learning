// Task player: one task answered fully on the page.
// Typed answers save on this device at once and sync a moment later; recordings and uploaded files are
// sent as soon as they are made. Submitting is deliberate and final; feedback appears only when released.
(() => {
  const N = window.Niu, A = N.A, app = document.getElementById('app');
  const taskId = new URLSearchParams(location.search).get('id') || '';
  const S = { task: null, control: null, env: '', responses: {}, files: {}, submission: null, saveId: '', submissionId: '', clientUpdatedAt: '', secondsUsed: 0,
    audioDone: {}, dirty: false, saving: false, syncedSeconds: -1, blocked: '', uploads: 0, timer: null, retryDelay: 4000, recorders: [] };
  const storeKey = () => `niu-dse-task:${S.env}:${taskId}:v${S.control.resetVersion}`;
  const items = () => S.task.blocks.filter((b) => b.type === 'q');
  const hasAnswer = (v) => v != null && (typeof v === 'string' ? v.trim() !== '' : Boolean(v.file) || Boolean(v.files && v.files.length));
  const units = () => {
    const grouped = {};
    (S.task.requireAny || []).forEach((g) => g.forEach((id) => { grouped[id] = true; }));
    return items().filter((q) => !grouped[q.id] && !q.optional).map((q) => [q.id]).concat(S.task.requireAny || []);
  };
  const answered = () => units().filter((u) => u.some((id) => hasAnswer(S.responses[id]))).length;
  const readOnly = () => Boolean(S.submission) || Boolean(S.blocked);

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(storeKey()) || 'null'); } catch (error) { return null; }
  }
  function writeLocal() {
    try {
      localStorage.setItem(storeKey(), JSON.stringify({ saveId: S.saveId, submissionId: S.submissionId, responses: S.responses, files: S.files, clientUpdatedAt: S.clientUpdatedAt, secondsUsed: S.secondsUsed, audioDone: S.audioDone }));
    } catch (error) { /* private mode: the server copy still saves */ }
  }

  async function load() {
    const data = await A.request('getTask', { taskId });
    S.task = data.task; S.control = data.control; S.env = data.env; S.submission = data.submission; S.files = data.files || {};
    S.blocked = '';
    N.previewNote(S.env);
    document.title = S.task.label + ' · Niu · DSE English';
    const local = readLocal() || {};
    S.saveId = local.saveId || N.newId('save');
    S.submissionId = local.submissionId || '';
    S.audioDone = local.audioDone || {};
    if (S.submission) {
      S.responses = S.submission.responses || {};
      S.secondsUsed = S.submission.secondsUsed || 0;
    } else {
      const server = data.draft;
      const localNewer = local.responses && (!server || String(local.clientUpdatedAt || '') >= String(server.clientUpdatedAt || ''));
      S.responses = localNewer ? local.responses : server ? server.responses : {};
      S.clientUpdatedAt = localNewer ? local.clientUpdatedAt || '' : server ? server.clientUpdatedAt || '' : '';
      S.secondsUsed = Math.max(Number(local.secondsUsed) || 0, server ? server.secondsUsed || 0 : 0);
      if (localNewer) { S.files = Object.assign({}, local.files || {}, S.files); S.dirty = !server || local.clientUpdatedAt !== server.clientUpdatedAt; }
      if (!S.control.receiving) S.blocked = 'This task is closed. New answers are not being accepted. 本题已停止作答。';
    }
    render();
    if (S.dirty && !readOnly()) schedule(800);
  }

  // ---------- rendering ----------

  const optionalTag = (q) => (q.optional ? '<span class="nd-optional">(optional 可不填)</span>' : '');
  const number = (q) => (q.n ? `<span class="nd-n">${N.esc(q.n)}</span>` : '');
  const text = (id) => (typeof S.responses[id] === 'string' ? S.responses[id] : '');
  const off = () => (readOnly() ? ' disabled' : '');
  const plain = ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"';

  function questionHtml(q) {
    if (q.kind === 'mc') {
      return `<fieldset class="nd-q" data-q="${q.id}"><legend>${number(q)}${q.prompt}</legend>${q.options.map((option, i) => {
        const letter = 'ABCDEFGH'.charAt(i);
        return `<label class="nd-opt"><input type="radio" name="q-${q.id}" value="${letter}"${S.responses[q.id] === letter ? ' checked' : ''}${off()}><span class="nd-letter">${letter}</span><span>${option}</span></label>`;
      }).join('')}</fieldset>`;
    }
    if (q.kind === 'gap') {
      const input = `<input type="text" data-input="${q.id}" value="${N.esc(text(q.id))}" aria-label="Answer ${N.esc(q.n)}"${plain}${off()}>`;
      const parts = q.prompt.split(/_{4,}/);
      const line = parts.length > 1 ? parts[0] + input + parts.slice(1).join('') : q.prompt + ' ' + input;
      return `<div class="nd-q nd-gap" data-q="${q.id}">${number(q)}<span class="nd-gap-line">${line}</span></div>`;
    }
    if (q.kind === 'short' || q.kind === 'long') {
      const rows = q.rows || (q.kind === 'short' ? 2 : 10);
      const guide = q.wordGuide ? ` data-min="${q.wordGuide[0]}" data-max="${q.wordGuide[1]}"` : '';
      return `<div class="nd-q" data-q="${q.id}"><p class="nd-prompt-line">${number(q)}${q.prompt}${optionalTag(q)}</p><textarea rows="${rows}" data-input="${q.id}"${plain}${off()}>${N.esc(text(q.id))}</textarea>${q.kind === 'long' ? `<p class="nd-count" data-count="${q.id}"${guide}></p>` : ''}</div>`;
    }
    if (q.kind === 'speak') return `<div class="nd-q nd-speak" data-q="${q.id}" data-speak="${q.id}"></div>`;
    if (q.kind === 'file') {
      return `<div class="nd-q nd-file" data-q="${q.id}"><p class="nd-prompt-line">${number(q)}${q.prompt}${optionalTag(q)}</p><ul class="nd-files" data-files="${q.id}"></ul>${readOnly() ? '' : `<label class="nd-drop"><input type="file" multiple accept="image/*,application/pdf,.pdf,.heic,.heif" data-pick="${q.id}"><strong>Choose photos or a PDF</strong><span>每页拍一张清楚的照片，或选择 PDF · 每个文件不超过 12 MB</span></label><div class="nd-progress" hidden><i></i></div>`}<p class="nd-msg" data-filemsg="${q.id}" role="status"></p></div>`;
    }
    return '';
  }

  function blockHtml(b, index) {
    if (b.type === 'html') return `<div class="nd-block nd-rich">${b.html}</div>`;
    if (b.type === 'audio' && b.missing) return `<div class="nd-block nd-audio"><div class="nd-audio-head">🎧 <span>${N.esc(b.label || 'Recording')}</span></div><p class="nd-note">Your teacher will add this recording soon. 录音稍后由老师添加。</p></div>`;
    if (b.type === 'pages' && b.missing) return `<div class="nd-block nd-audio"><p class="nd-note">${N.esc(b.label || 'Question page')}: your teacher will add this page soon. 题页稍后由老师添加。</p></div>`;
    if (b.type === 'audio') return `<div class="nd-block nd-audio" data-audio="${N.esc(b.media)}" data-once="${b.playOnce ? 1 : 0}"><div class="nd-audio-head">🎧 <span>${N.esc(b.label || 'Recording')}</span>${b.playOnce ? '<span class="nd-pill warn">Plays once 只播放一次</span>' : ''}</div><div data-audio-body></div><p class="nd-msg" role="status"></p></div>`;
    if (b.type === 'pages') return `<details class="nd-block nd-pages" data-pages="${N.esc(b.media.join(','))}"${index === 0 ? ' open' : ''}><summary>${N.esc(b.label || 'Question page')}</summary><div class="nd-pages-body"><p class="nd-note">Loading… 正在加载</p></div></details>`;
    if (b.type === 'q') return questionHtml(b);
    return '';
  }

  function render() {
    const t = S.task;
    const groups = t.requireAny || [];
    let blocks = '';
    t.blocks.forEach((b, index) => {
      const secondOfGroup = b.type === 'q' && groups.some((g) => g.indexOf(b.id) > 0);
      blocks += (secondOfGroup ? '<p class="nd-or">— OR 或者 —</p>' : '') + blockHtml(b, index);
    });
    const back = t.classId ? `<a href="${N.root}class/?id=${encodeURIComponent(t.classId)}">← Class</a> · ` : '';
    app.innerHTML = `
      <p class="nd-back">${back}<a href="${N.root}practice/">← Practice &amp; Mock</a></p>
      <p class="nd-kicker">${N.esc(t.paperLabel)}${t.source ? ' · ' + N.esc(t.source) : ''}</p>
      <h1>${N.esc(t.label)}</h1>
      <div class="nd-taskbar"><span data-time></span><span data-progress></span><span class="grow"></span><span data-status role="status"></span><button class="nd-linkbtn" type="button" data-print>Print / PDF</button></div>
      <div data-top></div>
      <div data-blocks>${blocks}</div>
      <div class="nd-submit" data-submit></div>`;
    renderTop();
    renderSubmit();
    items().forEach((q) => {
      if (q.kind === 'long') updateCount(q.id);
      if (q.kind === 'file') drawFiles(q.id);
    });
    mountRecorders();
    mountAudio();
    mountPages();
    if (S.submission) showFeedback();
    updateBar();
  }

  function renderTop() {
    const top = app.querySelector('[data-top]');
    if (S.submission) {
      const r = S.submission.result || {};
      let html = `<p class="nd-banner">Submitted · ${N.esc(N.when(S.submission.submittedAt))}<small>${r.released ? (r.pending ? 'Part of this task is still waiting for your teacher. 部分题目还在等老师批改。' : 'Your feedback is below. 批改结果见下方。') : 'Your teacher will check this. 已提交，等待老师批改。'}</small></p>`;
      if (r.released && (r.outOf !== '' || r.overall)) {
        html += `<div class="nd-result"><h2>Feedback 批改结果</h2>${r.outOf !== '' ? `<p class="nd-score">${N.esc(r.score)} / ${N.esc(r.outOf)}</p>` : ''}${r.overall ? `<p class="nd-pre">${N.esc(r.overall)}</p>` : ''}</div>`;
      }
      if (S.submission.transcriptHtml) html += `<details class="nd-fold"><summary><small>Transcript</small>Recording transcript 录音稿</summary><div class="nd-fold-body nd-rich">${S.submission.transcriptHtml}</div></details>`;
      top.innerHTML = html;
    } else if (S.blocked) top.innerHTML = `<p class="nd-banner warn">${N.esc(S.blocked)}</p>`;
    else top.innerHTML = '';
  }

  function renderSubmit() {
    const area = app.querySelector('[data-submit]');
    if (S.submission || S.blocked) { area.innerHTML = ''; return; }
    area.innerHTML = `<div class="nd-actions"><button class="nd-btn" type="button" data-send>Submit answers<small>提交（提交后不能修改）</small></button></div><p class="nd-msg" data-sendmsg role="status"></p>`;
  }

  function showFeedback() {
    const r = S.submission.result || {};
    if (!r.released) return;
    const labels = { correct: '✓ Correct 正确', wrong: '✗ Not correct 不正确', partial: '◐ Partly correct 部分正确', blank: '✗ Not answered 未作答', pending: 'Waiting for your teacher 等待批改', skipped: '' };
    (r.items || []).forEach((i) => {
      const box = app.querySelector(`[data-q="${i.id}"]`);
      if (!box || !labels[i.verdict]) return;
      const extra = [];
      if (i.comment) extra.push(`<p class="nd-pre"><span class="label">Teacher:</span> ${N.esc(i.comment)}</p>`);
      if (i.correct) extra.push(`<p class="nd-pre"><span class="label">Correction 改正:</span> ${N.esc(i.correct)}</p>`);
      if (i.key) extra.push(`<p><span class="label">Answer 答案:</span> ${N.esc(i.key)}</p>`);
      if (i.accept) extra.push(`<p><span class="label">Answer 答案:</span> ${i.accept.map(N.esc).join(' &nbsp;/&nbsp; ')}</p>`);
      if (i.explain) extra.push(`<p>${i.explain}</p>`);
      if (i.model) extra.push(`<details><summary>Model answer 参考答案</summary><div class="nd-rich">${i.model}</div></details>`);
      box.insertAdjacentHTML('beforeend', `<div class="nd-verdict ${i.verdict}"><p class="label">${labels[i.verdict]}</p>${extra.join('')}</div>`);
    });
  }

  // ---------- status bar and timing ----------

  function updateBar() {
    const t = S.task;
    const timeEl = app.querySelector('[data-time]');
    if (!timeEl) return;
    // Time is counted and kept, never enforced: no task locks when the time is up.
    const guide = t.minutes ? (t.strictTime ? ` · exam time 考试时间 ${t.minutes} min` : ` · suggested 建议 ${t.minutes} min`) : '';
    timeEl.innerHTML = `Time 用时 <b>${N.clock(S.secondsUsed)}</b>${guide}`;
    app.querySelector('[data-progress]').innerHTML = `<b>${answered()}</b> / ${units().length} answered`;
  }

  function setStatus(message) {
    const el = app.querySelector('[data-status]');
    if (el) el.textContent = message;
  }

  setInterval(() => {
    if (!S.task || readOnly() || document.hidden) return;
    S.secondsUsed += 1;
    if (S.secondsUsed % 15 === 0) writeLocal();
    // Once a minute the time used is saved with the draft, so the work can be continued anywhere.
    if (S.secondsUsed % 60 === 0 && S.secondsUsed !== S.syncedSeconds && !S.submission && !S.blocked) { S.dirty = true; schedule(500); }
    updateBar();
  }, 1000);

  // ---------- saving ----------

  function changed() {
    S.clientUpdatedAt = new Date().toISOString();
    S.dirty = true;
    writeLocal();
    updateBar();
    setStatus('Saved on this device 已存在本机');
    schedule(1500);
  }

  function schedule(delay) {
    clearTimeout(S.timer);
    S.timer = setTimeout(sync, delay);
  }

  // Leaving the page (closing it, switching app, locking the phone): send what is not yet saved.
  function flush() {
    if (!S.task || S.submission || S.blocked || !S.saveId) return;
    if (!S.dirty && S.secondsUsed === S.syncedSeconds) return;
    writeLocal();
    A.fire('saveDraft', { taskId, saveId: S.saveId, responses: S.responses, clientUpdatedAt: S.clientUpdatedAt, secondsUsed: S.secondsUsed });
    S.syncedSeconds = S.secondsUsed;
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  async function sync() {
    if (S.saving || !S.dirty || S.submission || S.blocked) return;
    S.saving = true; S.dirty = false;
    try {
      const seconds = S.secondsUsed;
      await A.post('saveDraft', { taskId, saveId: S.saveId, responses: S.responses, clientUpdatedAt: S.clientUpdatedAt, secondsUsed: seconds });
      S.syncedSeconds = seconds;
      S.retryDelay = 4000;
      if (!S.dirty) setStatus('Saved 已保存 · ' + new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
    } catch (error) {
      const message = (error && error.message) || '';
      if (/closed|already submitted|not open|reopened/i.test(message)) {
        S.blocked = /already submitted/i.test(message) ? '' : message;
        S.saving = false;
        if (!S.blocked) { await load(); return; }
        render();
        return;
      }
      S.dirty = true;
      setStatus('Saved on this device · not sent yet 已存在本机，尚未同步');
      S.retryDelay = Math.min(60000, S.retryDelay * 2);
    }
    S.saving = false;
    if (S.dirty) schedule(S.retryDelay);
  }

  async function waitForSave() {
    clearTimeout(S.timer);
    for (let i = 0; i < 60 && S.saving; i += 1) await N.sleep(250);
  }

  async function submit() {
    const message = app.querySelector('[data-sendmsg]');
    const button = app.querySelector('[data-send]');
    if (S.uploads || S.recorders.some((r) => r.isBusy())) { message.textContent = 'Wait for the recording or upload to finish first. 请等录音或上传完成。'; message.className = 'nd-msg error'; return; }
    if (S.recorders.some((r) => r.hasUnsaved())) { message.textContent = 'One recording has not been saved yet. Press “Save this answer again” first. 有一段录音还没保存成功。'; message.className = 'nd-msg error'; return; }
    const missing = units().length - answered();
    if (!answered() && !Object.keys(S.responses).some((id) => hasAnswer(S.responses[id]))) { message.textContent = 'There is nothing to submit yet. 还没有作答。'; message.className = 'nd-msg error'; return; }
    const question = missing
      ? `${missing} answer${missing === 1 ? ' is' : 's are'} still empty. Submit anyway?\n还有 ${missing} 处未作答，确定提交吗？提交后不能修改。`
      : 'Submit your answers? You cannot change them afterwards.\n确定提交吗？提交后不能修改。';
    if (!window.confirm(question)) return;
    button.disabled = true;
    message.textContent = 'Submitting… 正在提交'; message.className = 'nd-msg';
    await waitForSave();
    if (!S.submissionId) { S.submissionId = N.newId('sub'); writeLocal(); }
    try {
      await A.post('submitTask', { taskId, saveId: S.saveId, submissionId: S.submissionId, resetVersion: S.control.resetVersion, responses: S.responses, secondsUsed: S.secondsUsed });
      A.fire('assessSubmission', { taskId, submissionId: S.submissionId });
      S.dirty = false;
      await load();
      window.scrollTo({ top: 0 });
    } catch (error) {
      message.textContent = (error && error.message) || 'The answers could not be submitted. Please try again.';
      message.className = 'nd-msg error';
      button.disabled = false;
    }
  }

  // ---------- typed answers ----------

  function updateCount(id) {
    const el = app.querySelector(`[data-count="${id}"]`);
    if (!el) return;
    const count = N.words(text(id));
    const min = Number(el.dataset.min || 0), max = Number(el.dataset.max || 0);
    el.textContent = `${count} word${count === 1 ? '' : 's'}${max ? ` · guide 建议 ${min}–${max}` : ''}`;
    el.classList.toggle('ok', Boolean(max) && count >= min && count <= max);
  }

  app.addEventListener('input', (event) => {
    const input = event.target.closest('[data-input]');
    if (!input || readOnly()) return;
    const id = input.dataset.input;
    if (input.value.trim()) S.responses[id] = input.value; else delete S.responses[id];
    updateCount(id);
    changed();
  });
  app.addEventListener('change', (event) => {
    if (readOnly()) return;
    const radio = event.target.closest('input[type=radio]');
    if (radio) { S.responses[radio.name.slice(2)] = radio.value; changed(); return; }
    const pick = event.target.closest('[data-pick]');
    if (pick && pick.files.length) uploadFiles(pick.dataset.pick, Array.from(pick.files), pick);
  });
  app.addEventListener('click', (event) => {
    if (event.target.closest('[data-send]')) submit();
    else if (event.target.closest('[data-print]')) window.print();
    const remove = event.target.closest('[data-remove]');
    if (remove && !readOnly()) {
      const id = remove.dataset.item;
      const left = ((S.responses[id] || {}).files || []).filter((f) => f !== remove.dataset.remove);
      if (left.length) S.responses[id] = { files: left }; else delete S.responses[id];
      drawFiles(id);
      changed();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (S.uploads || S.recorders.some((r) => r.isBusy())) { event.preventDefault(); event.returnValue = ''; }
  });

  // ---------- files and recordings ----------

  async function sendFile(itemId, blob, type, name, kind, seconds) {
    const fileId = N.newId('file');
    S.uploads += 1;
    try {
      const result = await A.post('uploadFile', { taskId, itemId, fileId, type, name, kind, seconds: seconds || 0, data: await N.toBase64(blob) });
      const meta = { name: result.name || name, mime: type, bytes: result.bytes || blob.size, seconds: seconds || 0, kind };
      S.files[fileId] = meta;
      return { fileId, meta };
    } finally { S.uploads -= 1; }
  }

  function mountRecorders() {
    S.recorders = [];
    app.querySelectorAll('[data-speak]').forEach((box) => {
      const item = items().filter((q) => q.id === box.dataset.speak)[0];
      const value = S.responses[item.id] && S.responses[item.id].file ? S.responses[item.id] : null;
      S.recorders.push(window.NiuRecorder.mount(box, {
        item, value, meta: value ? S.files[value.file] : null, disabled: readOnly(),
        upload: (take) => sendFile(item.id, take.blob, take.type, take.name, take.kind, take.seconds),
        onChange: (next) => { S.responses[item.id] = next; changed(); },
        playback: (fileId) => N.loadMedia('upload:' + fileId)
      }));
    });
  }

  function drawFiles(id) {
    const list = app.querySelector(`[data-files="${id}"]`);
    if (!list) return;
    const files = (S.responses[id] || {}).files || [];
    list.innerHTML = files.map((f) => {
      const meta = S.files[f] || {};
      return `<li><span>✓ ${N.esc(meta.name || 'File')}${meta.bytes ? ' · ' + N.size(meta.bytes) : ''}</span>${readOnly() ? '' : `<button class="nd-linkbtn" type="button" data-remove="${f}" data-item="${id}">Remove</button>`}</li>`;
    }).join('');
  }

  // Phone photos are large; shrink them to a sharp, readable JPEG before sending.
  async function prepare(file) {
    const isImage = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
    if (isImage && file.size > 1.2 * 1024 * 1024) {
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
        if (blob && blob.size < file.size) return { blob, type: 'image/jpeg', name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
      } catch (error) { /* keep the original file */ }
    }
    let type = file.type;
    if (!type) type = /\.pdf$/i.test(file.name) ? 'application/pdf' : /\.hei[cf]$/i.test(file.name) ? 'image/heic' : 'image/jpeg';
    return { blob: file, type, name: file.name };
  }

  async function uploadFiles(id, files, input) {
    const message = app.querySelector(`[data-filemsg="${id}"]`);
    const bar = input.closest('.nd-q').querySelector('.nd-progress');
    const say = (textValue, kind) => { message.textContent = textValue; message.className = 'nd-msg' + (kind ? ' ' + kind : ''); };
    const bad = files.find((f) => !/^image\//.test(f.type) && f.type !== 'application/pdf' && !/\.(pdf|heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (bad) { say(`${bad.name} is not a photo or PDF. 只能上传照片或 PDF。`, 'error'); input.value = ''; return; }
    bar.hidden = false;
    const fill = bar.querySelector('i');
    fill.style.width = '5%';
    try {
      for (let i = 0; i < files.length; i += 1) {
        say(`Sending ${i + 1} of ${files.length}… Keep this page open. 正在上传，请不要关闭页面。`);
        const ready = await prepare(files[i]);
        if (ready.blob.size > 12 * 1024 * 1024) throw new Error(`${files[i].name} is larger than 12 MB. Take the photo again at a smaller size.`);
        const sent = await sendFile(id, ready.blob, ready.type, ready.name, 'uploaded', 0);
        const current = ((S.responses[id] || {}).files || []).concat(sent.fileId);
        S.responses[id] = { files: current };
        drawFiles(id);
        changed();
        fill.style.width = Math.round(((i + 1) / files.length) * 100) + '%';
      }
      say(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}. 上传成功。`, 'success');
    } catch (error) {
      say((error && error.message) || 'The upload did not finish. Please try again.', 'error');
    } finally {
      input.value = '';
      setTimeout(() => { bar.hidden = true; }, 1200);
    }
  }

  // ---------- private audio and page images ----------

  function mountAudio() {
    app.querySelectorAll('[data-audio]').forEach((box) => {
      const mediaId = box.dataset.audio, once = box.dataset.once === '1';
      const body = box.querySelector('[data-audio-body]'), message = box.querySelector('.nd-msg');
      const used = once && S.audioDone[mediaId] && S.env !== 'test' && !S.submission;
      if (used) { body.innerHTML = '<p class="nd-note">You have already listened to this recording. 录音已播放过，不能重播。</p>'; return; }
      body.innerHTML = '<div class="nd-actions"><button class="nd-btn" type="button" data-load>Load the recording<small>加载录音</small></button></div><div class="nd-progress" hidden><i></i></div>';
      body.querySelector('[data-load]').addEventListener('click', async (event) => {
        const button = event.currentTarget, bar = body.querySelector('.nd-progress'), fill = bar.querySelector('i');
        button.disabled = true; bar.hidden = false; message.textContent = 'Loading… 正在加载'; message.className = 'nd-msg';
        try {
          const blob = await N.loadMedia(mediaId, (fraction) => { fill.style.width = Math.round(fraction * 100) + '%'; });
          const url = URL.createObjectURL(blob);
          message.textContent = '';
          if (!once || S.submission) { body.innerHTML = `<audio controls preload="auto" src="${url}"></audio>`; return; }
          body.innerHTML = '<div class="nd-once"><button class="nd-btn" type="button" data-start>▶ Start<small>开始播放 · 不能暂停或重播</small></button><div class="nd-progress"><i></i></div><span class="nd-rec-time" data-clock></span></div>';
          const audio = document.createElement('audio');
          audio.preload = 'auto';
          audio.src = url;
          body.querySelector('.nd-once').append(audio);
          const start = body.querySelector('[data-start]'), line = body.querySelector('.nd-progress i'), clockEl = body.querySelector('[data-clock]');
          audio.addEventListener('timeupdate', () => {
            if (audio.duration) line.style.width = (audio.currentTime / audio.duration * 100) + '%';
            clockEl.textContent = `${N.clock(audio.currentTime)} / ${N.clock(audio.duration || 0)}`;
          });
          audio.addEventListener('ended', () => { body.innerHTML = '<p class="nd-note">The recording has finished. 录音播放完毕。</p>'; });
          start.addEventListener('click', () => {
            start.disabled = true;
            S.audioDone[mediaId] = true;
            writeLocal();
            audio.play().catch(() => {
              // Nothing was heard, so the one play is not used up.
              delete S.audioDone[mediaId];
              writeLocal();
              start.disabled = false;
              message.textContent = 'The recording could not start. Press Start again. 录音没有开始播放，请再按一次。'; message.className = 'nd-msg error';
            });
          });
        } catch (error) {
          button.disabled = false; bar.hidden = true;
          message.textContent = (error && error.message) || 'The recording could not be loaded.'; message.className = 'nd-msg error';
        }
      });
    });
  }

  function mountPages() {
    app.querySelectorAll('[data-pages]').forEach((box) => {
      const body = box.querySelector('.nd-pages-body');
      let started = false;
      const start = async () => {
        if (started) return;
        started = true;
        try {
          const urls = [];
          for (const mediaId of box.dataset.pages.split(',')) urls.push(URL.createObjectURL(await N.loadMedia(mediaId)));
          body.innerHTML = urls.map((url, i) => `<img src="${url}" alt="Question page ${i + 1}">`).join('');
        } catch (error) {
          started = false;
          body.innerHTML = `<p class="nd-msg error">${N.esc((error && error.message) || 'The page could not be loaded.')}</p>`;
        }
      };
      if (box.open) start();
      box.addEventListener('toggle', () => { if (box.open) start(); });
    });
  }

  A.ready.then(load).catch((error) => N.fail(app, error));
})();
