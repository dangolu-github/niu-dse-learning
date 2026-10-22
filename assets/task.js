// Task player: one task answered fully on the page.
// Typed answers save on this device at once and sync a moment later; recordings and uploaded files are
// sent as soon as they are made. Submitting is deliberate and final; feedback appears only when released.
(() => {
  const N = window.Niu, A = N.A, app = document.getElementById('app');
  const taskId = new URLSearchParams(location.search).get('id') || '';
  const S = { task: null, control: null, env: '', responses: {}, files: {}, submission: null, saveId: '', submissionId: '', clientUpdatedAt: '', secondsUsed: 0,
    audioDone: {}, dirty: false, saving: false, syncedSeconds: -1, blocked: '', uploads: 0, batches: 0, uploadErrors: {}, submitting: false, timer: null, retryDelay: 4000, recorders: [], pageLoads: [] };
  const PAPER = '__paper';
  const paperMode = () => Boolean(S.responses[PAPER] && S.responses[PAPER].mode === 'paper');
  const maxFiles = () => (S.task.paperUpload && S.task.paperUpload.maxFiles) || 20;
  const storeKey = () => `niu-dse-task:${S.env}:${taskId}:v${S.control.resetVersion}`;
  const items = () => S.task.blocks.filter((b) => b.type === 'q');
  const hasAnswer = (v) => v != null && (typeof v === 'string' ? v.trim() !== '' : Boolean(v.file) || Boolean(v.files && v.files.length));
  const units = () => {
    const grouped = {};
    (S.task.requireAny || []).forEach((g) => g.forEach((id) => { grouped[id] = true; }));
    return items().filter((q) => !grouped[q.id] && !q.optional).map((q) => [q.id]).concat(S.task.requireAny || []);
  };
  const answered = () => units().filter((u) => u.some((id) => hasAnswer(S.responses[id]))).length;
  const readOnly = () => Boolean(S.submission) || Boolean(S.blocked) || S.submitting;

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(storeKey()) || 'null'); } catch (error) { return null; }
  }
  function writeLocal() {
    try {
      localStorage.setItem(storeKey(), JSON.stringify({ saveId: S.saveId, submissionId: S.submissionId, responses: S.responses, files: S.files, clientUpdatedAt: S.clientUpdatedAt, secondsUsed: S.secondsUsed, audioDone: S.audioDone, uploadErrors: S.uploadErrors }));
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
    S.uploadErrors = S.submission ? {} : local.uploadErrors || {};
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
      // Existing unsubmitted essay-file drafts use the same new paper route without changing file evidence.
      if (!S.responses[PAPER] && S.task.paperUpload && S.task.paperUpload.paperMode) {
        const olderFiles = items().filter((q) => q.kind === 'file').flatMap((q) => ((S.responses[q.id] || {}).files || []));
        if (olderFiles.length) {
          S.responses[PAPER] = { mode: 'paper', files: [...new Set(olderFiles)] };
          items().filter((q) => q.kind === 'file').forEach((q) => { delete S.responses[q.id]; });
          S.dirty = true;
        }
      }
    }
    render();
    if (S.dirty && !readOnly()) schedule(800);
  }

  // ---------- rendering ----------

  const optionalTag = (q) => (q.optional ? '<span class="nd-optional">(optional 可不填)</span>' : '');
  const number = (q) => (q.n ? `<span class="nd-n">${N.esc(q.n)}</span>` : '');
  const text = (id) => (!paperMode() && typeof S.responses[id] === 'string' ? S.responses[id] : '');
  const off = () => (readOnly() || paperMode() ? ' disabled' : '');
  const plain = ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"';

  function questionHtml(q) {
    if (q.kind === 'mc') {
      return `<fieldset class="nd-q" data-q="${q.id}"><legend>${number(q)}${q.prompt}</legend>${q.options.map((option, i) => {
        const letter = 'ABCDEFGH'.charAt(i);
        return `<label class="nd-opt"><input type="radio" name="q-${q.id}" value="${letter}"${!paperMode() && S.responses[q.id] === letter ? ' checked' : ''}${off()}><span class="nd-letter">${letter}</span><span>${option}</span></label>`;
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
      return `<div class="nd-q nd-file" data-q="${q.id}" data-no-print><p class="nd-prompt-line">${number(q)}${q.prompt}${optionalTag(q)}</p><ul class="nd-files" data-files="${q.id}"></ul>${readOnly() ? '' : `<label class="nd-drop"><input type="file" multiple accept="image/*,application/pdf,.pdf,.heic,.heif" data-pick="${q.id}"><strong>Choose photos or a PDF</strong><span>Up to ${maxFiles()} files · 12 MB per file</span></label><div class="nd-progress" hidden><i></i></div>`}<p class="nd-msg" data-filemsg="${q.id}" role="status"></p></div>`;
    }
    return '';
  }

  function blockHtml(b, index) {
    if (b.type === 'html' && b.title) return `<details class="nd-block nd-doc"${b.open ? ' open' : ''}><summary>${N.esc(b.title)}</summary><div class="nd-rich nd-doc-body">${b.html}</div></details>`;
    if (b.type === 'html') return `<div class="nd-block ${b.sheet ? 'nd-sheet ' : ''}nd-rich">${b.html}</div>`;
    if (b.type === 'audio' && b.missing) return `<div class="nd-block nd-audio"><div class="nd-audio-head">🎧 <span>${N.esc(b.label || 'Recording')}</span></div><p class="nd-note">Your teacher will add this recording soon. 录音稍后由老师添加。</p></div>`;
    if (b.type === 'pages' && b.missing) return `<div class="nd-block nd-audio"><p class="nd-note">${N.esc(b.label || 'Question page')}: your teacher will add this page soon. 题页稍后由老师添加。</p></div>`;
    if (b.type === 'audio') return `<div class="nd-block nd-audio" data-audio="${N.esc(b.media)}" data-once="${b.playOnce ? 1 : 0}"><div class="nd-audio-head">🎧 <span>${N.esc(b.label || 'Recording')}</span>${b.playOnce ? '<span class="nd-pill warn">Plays once 只播放一次</span>' : ''}</div><div data-audio-body></div><p class="nd-msg" role="status"></p></div>`;
    if (b.type === 'pages') return `<details class="nd-block nd-pages${b.figure ? ' nd-figure' : ''}" data-pages="${N.esc(b.media.join(','))}"${index === 0 || b.open ? ' open' : ''}><summary>${N.esc(b.label || 'Question page')}</summary><div class="nd-pages-body"><p class="nd-note">Loading… 正在加载</p></div></details>`;
    if (b.type === 'q') return questionHtml(b);
    return '';
  }

  function render() {
    const t = S.task;
    const groups = t.requireAny || [];
    let blocks = '';
    t.blocks.forEach((b, index) => {
      if (!S.submission && b.type === 'q' && b.kind === 'file') return; // One consistent hand-in panel for new work.
      const secondOfGroup = b.type === 'q' && groups.some((g) => g.indexOf(b.id) > 0);
      blocks += (secondOfGroup ? '<p class="nd-or">— OR 或者 —</p>' : '') + blockHtml(b, index);
    });
    const back = t.classId ? `<a href="${N.root}class/?id=${encodeURIComponent(t.classId)}">← Class</a> · ` : '';
    app.innerHTML = `
      <p class="nd-back">${back}${t.group === 'extra' ? `<a href="${N.root}extra-practice/">← Extra Practice</a>` : `<a href="${N.root}practice/">← Practice &amp; Mock</a>`}</p>
      <p class="nd-kicker">${N.esc(t.group === 'extra' ? 'Extra Practice · Listening' : t.paperLabel)}${t.source ? ' · ' + N.esc(t.source) : ''}</p>
      <h1>${N.esc(t.label)}</h1>
      <div class="nd-taskbar"><span data-time></span><span data-progress></span><span class="grow"></span><span data-status role="status"></span><button class="nd-linkbtn" type="button" data-print="blank">Print questions / PDF</button>${S.submission ? '<button class="nd-linkbtn" type="button" data-print="review">Print my work / PDF</button>' : ''}</div>
      <div data-top></div>
      <div data-blocks>${blocks}</div>
      <div data-handin></div><div class="nd-submit" data-submit></div>`;
    app.classList.toggle('nd-paper-mode', paperMode());
    app.classList.toggle('nd-extra-task', t.group === 'extra');
    // Native question tables retain their column relationships and use the standard answer controls.
    app.querySelectorAll('[data-answer-slot]').forEach((slot) => {
      const id = slot.dataset.answerSlot;
      const field = Array.from(app.querySelectorAll('[data-q]')).find((node) => node.dataset.q === id);
      if (field) slot.append(field);
    });
    if (t.group === 'extra') {
      const key = 'niu-extra-folds:' + t.id;
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { /* Keep defaults. */ }
      app.querySelectorAll('[data-blocks] details').forEach((fold, i) => {
        fold.open = saved[i] === true;
        fold.addEventListener('toggle', () => {
          if (document.body.classList.contains('nd-printing')) return;
          saved[i] = fold.open;
          try { localStorage.setItem(key, JSON.stringify(saved)); } catch (_) { /* Private browser. */ }
        });
      });
    }
    renderTop();
    renderHandin();
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

  function renderHandin() {
    const area = app.querySelector('[data-handin]');
    if (!S.task.paperUpload) { area.innerHTML = ''; return; }
    const fileBox = questionHtml({ id: PAPER, kind: 'file', prompt: 'Upload your completed pages in order.', optional: false });
    const mode = S.task.paperUpload.paperMode
      ? `<p>Choose one way to submit. You do not need to type your paper answers again.</p><label><input type="radio" name="answer-method" value="online"${paperMode() ? '' : ' checked'}${readOnly() ? ' disabled' : ''}> Answer online</label> <label><input type="radio" name="answer-method" value="paper"${paperMode() ? ' checked' : ''}${readOnly() ? ' disabled' : ''}> Upload paper answers</label>`
      : '<p>Submit your recording above. You may attach photographs or a PDF of your notes.</p>';
    area.innerHTML = `<details class="nd-fold" data-no-print${paperMode() || S.submission ? ' open' : ''}><summary>${S.submission ? 'Submitted files' : 'Submit your work'}</summary><div class="nd-fold-body">${S.submission ? '' : mode}${fileBox}${S.submission ? '<p>The files listed here belong to this submitted attempt.</p>' : '<p>Uploading saves files. Press Submit answers below to hand in your work.</p>'}</div></details>`;
    drawFiles(PAPER);
  }

  function renderTop() {
    const top = app.querySelector('[data-top]');
    if (S.submission) {
      const r = S.submission.result || {};
      let html = `<p class="nd-banner" data-print-feedback>Submitted · ${N.esc(N.when(S.submission.submittedAt))}<small>${r.released ? (r.pending ? 'Part of this task is still waiting for your teacher. 部分题目还在等老师批改。' : 'Your feedback is below. 批改结果见下方。') : 'Your teacher will check this. 已提交，等待老师批改。'}</small></p>`;
      if (r.released && (r.outOf !== '' || r.overall)) {
        html += `<div class="nd-result"><h2>Feedback 批改结果</h2>${r.outOf !== '' ? `<p class="nd-score">${N.esc(r.score)} / ${N.esc(r.outOf)}</p>` : ''}${r.overall ? `<p class="nd-pre">${N.esc(r.overall)}</p>` : ''}</div>`;
      }
      if (S.submission.transcriptHtml) html += `<details class="nd-fold" data-print-feedback><summary><small>Transcript</small>Recording transcript 录音稿</summary><div class="nd-fold-body nd-rich">${S.submission.transcriptHtml}</div></details>`;
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
    const labels = { correct: '✓ Correct 正确', evaluated: '◎ Evaluated 已批改', wrong: '✗ Not correct 不正确', partial: '◐ Partly correct 部分正确', blank: '✗ Not answered 未作答', pending: 'Waiting for your teacher 等待批改', skipped: '' };
    (r.items || []).forEach((i) => {
      const box = app.querySelector(`[data-q="${i.id}"]`);
      if (!box || !labels[i.verdict]) return;
      const extra = [];
      if (Object.prototype.hasOwnProperty.call(i, 'original')) {
        // The immutable receipt is retained; this is the checked transcription from the paper.
        box.classList.add('nd-paper-reviewed');
        const input = box.querySelector('textarea, input[type=text]');
        if (input) { input.value = i.original; input.dataset.paperOriginal = '1'; }
        extra.push(`<div class="nd-pre nd-original"><span class="label">Original answer 原答案:</span> ${annotatedOriginal(i.original, i.spans)}${i.uncertain ? '<small> [?] Please check this handwriting.</small>' : ''}</div>`);
      }
      if (i.correct) extra.push(`<p class="nd-pre"><span class="label">Correction 改正:</span> ${N.esc(i.correct)}</p>`);
      if (i.comment) extra.push(`<p class="nd-pre"><span class="label">Why 错因:</span> ${N.esc(i.comment)}</p>`);
      if (i.key) extra.push(`<p><span class="label">Answer 答案:</span> ${N.esc(i.key)}</p>`);
      if (i.accept) extra.push(`<p><span class="label">Answer 答案:</span> ${i.accept.map(N.esc).join(' &nbsp;/&nbsp; ')}</p>`);
      if (i.explain) extra.push(`<p>${i.explain}</p>`);
      if (i.model) extra.push(`<details><summary>Model answer 参考答案</summary><div class="nd-rich">${i.model}</div></details>`);
      box.insertAdjacentHTML('beforeend', `<div class="nd-verdict ${i.verdict}" data-print-feedback><p class="label">${labels[i.verdict]}</p>${extra.join('')}</div>`);
    });
  }

  function annotatedOriginal(original, spans) {
    const value = String(original || ''); let cursor = 0, html = '';
    (spans || []).forEach((span) => {
      if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < cursor || span.end <= span.start || span.end > value.length) return;
      html += N.esc(value.slice(cursor, span.start)) + `<span class="nd-error-span">${N.esc(value.slice(span.start, span.end))}</span><span class="nd-fix-span"> [${N.esc(span.replacement || '')}]</span>`;
      cursor = span.end;
    });
    return html + N.esc(value.slice(cursor));
  }

  // ---------- status bar and timing ----------

  function updateBar() {
    const t = S.task;
    const timeEl = app.querySelector('[data-time]');
    if (!timeEl) return;
    // Time is counted and kept, never enforced: no task locks when the time is up.
    const guide = t.minutes ? (t.strictTime ? ` · exam time 考试时间 ${t.minutes} min` : ` · suggested 建议 ${t.minutes} min`) : '';
    timeEl.innerHTML = `Time 用时 <b>${N.clock(S.secondsUsed)}</b>${guide}`;
    app.querySelector('[data-progress]').innerHTML = paperMode() ? `${((S.responses[PAPER] || {}).files || []).length} file(s) attached` : `<b>${answered()}</b> / ${units().length} answered`;
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
    if (S.saving || S.submitting || !S.dirty || S.submission || S.blocked) return;
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
    if (S.submitting) return;
    if (S.uploads || S.batches || S.recorders.some((r) => r.isBusy())) { message.textContent = 'Wait for the recording or upload to finish first. 请等录音或上传完成。'; message.className = 'nd-msg error'; return; }
    if (Object.keys(S.uploadErrors).length) { message.textContent = 'Some selected files were not uploaded. Retry them or confirm the files to keep in the upload panel.'; message.className = 'nd-msg error'; return; }
    if (S.recorders.some((r) => r.hasUnsaved())) { message.textContent = 'One recording has not been saved yet. Press “Save this answer again” first. 有一段录音还没保存成功。'; message.className = 'nd-msg error'; return; }
    const missing = paperMode() ? 0 : units().length - answered();
    if (paperMode() ? !((S.responses[PAPER] || {}).files || []).length : !items().some((q) => hasAnswer(S.responses[q.id]))) { message.textContent = 'There is nothing to submit yet. 还没有作答。'; message.className = 'nd-msg error'; return; }
    const question = missing
      ? `${missing} answer${missing === 1 ? ' is' : 's are'} still empty. Submit anyway?\n还有 ${missing} 处未作答，确定提交吗？提交后不能修改。`
      : 'Submit your answers? You cannot change them afterwards.\n确定提交吗？提交后不能修改。';
    if (!window.confirm(question)) return;
    S.submitting = true;
    button.disabled = true;
    message.textContent = 'Submitting… 正在提交'; message.className = 'nd-msg';
    await waitForSave();
    if (!S.submissionId) { S.submissionId = N.newId('sub'); writeLocal(); }
    try {
      const submissionOrigin = await N.origin();
      const sent = JSON.parse(JSON.stringify(S.responses));
      const receipt = await A.post('submitTask', { taskId, saveId: S.saveId, submissionId: S.submissionId, resetVersion: S.control.resetVersion, responses: sent, secondsUsed: S.secondsUsed, submissionOrigin });
      for (const [id, value] of Object.entries(sent)) {
        if (value && value.files && JSON.stringify(value.files) !== JSON.stringify(((receipt.responses || {})[id] || {}).files || [])) throw new Error('The receipt did not confirm every attachment. Reload to check the submitted version before retrying.');
      }
      if (!paperMode()) A.fire('assessSubmission', { taskId, submissionId: S.submissionId });
      S.dirty = false;
      S.submitting = false;
      await load();
      window.scrollTo({ top: 0 });
    } catch (error) {
      S.submitting = false;
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
    if (radio && radio.name === 'answer-method') {
      if (S.batches) return;
      S.responses[PAPER] = { mode: radio.value, files: ((S.responses[PAPER] || {}).files || []) };
      changed(); render();
      app.querySelector('[data-handin] details').open = true;
      return;
    }
    if (radio) { S.responses[radio.name.slice(2)] = radio.value; changed(); return; }
    const pick = event.target.closest('[data-pick]');
    if (pick && pick.files.length) uploadFiles(pick.dataset.pick, Array.from(pick.files), pick);
  });
  app.addEventListener('click', (event) => {
    if (event.target.closest('[data-send]')) submit();
    else if (event.target.closest('[data-print]')) {
      const button = event.target.closest('[data-print]'); button.disabled = true;
      window.NiuPrint.print({ blank: button.dataset.print === 'blank', prepare: async () => { await Promise.all(S.pageLoads.map((start) => start())); } })
        .catch((e) => { setStatus(e.message || 'Printing could not start.'); }).finally(() => { button.disabled = false; });
    }
    const acceptFiles = event.target.closest('[data-keep-uploaded]');
    if (acceptFiles && !readOnly()) { delete S.uploadErrors[acceptFiles.dataset.keepUploaded]; writeLocal(); drawFiles(acceptFiles.dataset.keepUploaded); }
    const viewFile = event.target.closest('[data-open-file]');
    if (viewFile) openFile(viewFile.dataset.openFile, viewFile);
    const move = event.target.closest('[data-file-move]');
    if (move && !readOnly() && !S.batches) {
      const id = move.dataset.item, files = ((S.responses[id] || {}).files || []).slice(), from = files.indexOf(move.dataset.file), to = from + Number(move.dataset.fileMove);
      if (from >= 0 && to >= 0 && to < files.length) { [files[from], files[to]] = [files[to], files[from]]; S.responses[id] = Object.assign({}, S.responses[id], { files }); changed(); drawFiles(id); }
    }
    const remove = event.target.closest('[data-remove]');
    if (remove && !readOnly() && !S.batches) {
      const id = remove.dataset.item;
      const left = ((S.responses[id] || {}).files || []).filter((f) => f !== remove.dataset.remove);
      if (id === PAPER) S.responses[id] = Object.assign({}, S.responses[id], { files: left });
      else if (left.length) S.responses[id] = { files: left }; else delete S.responses[id];
      drawFiles(id);
      changed();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (S.uploads || S.batches || S.recorders.some((r) => r.isBusy())) { event.preventDefault(); event.returnValue = ''; }
  });

  // ---------- files and recordings ----------

  async function sendFile(itemId, blob, type, name, kind, seconds) {
    const fileId = N.newId('file');
    S.uploads += 1;
    try {
      const data = await N.toBase64(blob), submissionOrigin = await N.origin();
      const result = await A.post('uploadFile', { taskId, itemId, fileId, type, name, kind, seconds: seconds || 0, data, submissionOrigin });
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
    list.innerHTML = files.map((f, index) => {
      const meta = S.files[f] || {};
      return `<li><span>${index + 1}. ✓ ${N.esc(meta.name || 'File')}${meta.bytes ? ' · ' + N.size(meta.bytes) : ''}</span><button class="nd-linkbtn" type="button" data-open-file="${f}">View</button>${readOnly() ? '' : `<button class="nd-linkbtn" type="button" data-file-move="-1" data-file="${f}" data-item="${id}"${index ? '' : ' disabled'}>↑</button><button class="nd-linkbtn" type="button" data-file-move="1" data-file="${f}" data-item="${id}"${index < files.length - 1 ? '' : ' disabled'}>↓</button><button class="nd-linkbtn" type="button" data-remove="${f}" data-item="${id}">Remove</button>`}</li>`;
    }).join('');
    const message = app.querySelector(`[data-filemsg="${id}"]`);
    if (message && S.uploadErrors[id]) message.innerHTML = `${N.esc(S.uploadErrors[id])} <button type="button" class="nd-linkbtn" data-keep-uploaded="${id}">Keep only the files listed above</button>`;
    else if (message) message.textContent = '';
  }

  async function openFile(id, button) {
    button.disabled = true;
    try {
      const blob = await N.loadMedia('upload:' + id), url = URL.createObjectURL(blob);
      const dialog = document.createElement('dialog'); dialog.className = 'nd-file-preview';
      const meta = S.files[id] || {};
      dialog.innerHTML = `<button type="button" class="nd-btn">Close</button><p>${N.esc(meta.name || 'Uploaded page')}</p>${meta.mime === 'application/pdf' ? '<iframe title="Uploaded PDF"></iframe>' : '<img alt="Uploaded page">'}<p><a download="${N.esc(meta.name || 'upload')}" href="${url}">Download original file</a></p>`;
      dialog.querySelector('iframe,img').src = url;
      dialog.querySelector('button').onclick = () => dialog.close();
      dialog.addEventListener('close', () => { URL.revokeObjectURL(url); dialog.remove(); });
      document.body.append(dialog); dialog.showModal();
    } catch (e) { setStatus(e.message || 'The file could not be opened.'); }
    finally { button.disabled = false; }
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
    if (S.batches || readOnly()) { input.value = ''; return; }
    const message = app.querySelector(`[data-filemsg="${id}"]`);
    const bar = input.closest('.nd-q').querySelector('.nd-progress');
    const say = (textValue, kind) => { message.textContent = textValue; message.className = 'nd-msg' + (kind ? ' ' + kind : ''); };
    const bad = files.find((f) => !/^image\//.test(f.type) && f.type !== 'application/pdf' && !/\.(pdf|heic|heif|jpe?g|png|webp)$/i.test(f.name));
    const failSelection = (text) => { S.uploadErrors[id] = text; writeLocal(); drawFiles(id); input.value = ''; };
    if (bad) { failSelection(`${bad.name} is not a photo or PDF.`); return; }
    if ((((S.responses[id] || {}).files || []).length + files.length) > maxFiles()) { failSelection(`Choose no more than ${maxFiles()} files in total. No files from this selection were added.`); return; }
    if (id === PAPER) {
      S.responses[PAPER] = Object.assign({ files: [] }, S.responses[PAPER] || {}, { mode: S.task.paperUpload.paperMode ? 'paper' : 'online' });
      app.querySelectorAll('[name=answer-method]').forEach((r) => { r.checked = r.value === S.responses[PAPER].mode; });
      if (paperMode()) app.querySelectorAll('[data-blocks] [data-input], [data-blocks] input[type=radio]').forEach((el) => {
        el.disabled = true;
        if (el.type === 'radio') el.checked = false;
        else el.value = '';
      });
      app.classList.toggle('nd-paper-mode', paperMode());
    }
    S.batches += 1; input.disabled = true;
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
        S.responses[id] = Object.assign({}, S.responses[id] || {}, { files: current });
        drawFiles(id);
        changed();
        fill.style.width = Math.round(((i + 1) / files.length) * 100) + '%';
      }
      if (S.uploadErrors[id]) drawFiles(id);
      else say(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}. Check the list, then press Submit answers.`, 'success');
    } catch (error) {
      S.uploadErrors[id] = (error && error.message) || 'The upload did not finish. Please try again.';
      writeLocal(); drawFiles(id); message.classList.add('error');
    } finally {
      S.batches -= 1; input.disabled = readOnly();
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
    S.pageLoads = [];
    app.querySelectorAll('[data-pages]').forEach((box) => {
      const body = box.querySelector('.nd-pages-body');
      let loading = null;
      const start = () => {
        if (loading) return loading;
        loading = (async () => {
          const urls = [];
          for (const mediaId of box.dataset.pages.split(',')) urls.push(URL.createObjectURL(await N.loadMedia(mediaId)));
          body.innerHTML = urls.map((url, i) => `<img src="${url}" alt="Question page ${i + 1}">`).join('');
          await Promise.all(Array.from(body.querySelectorAll('img')).map((img) => img.decode()));
        })().catch((error) => {
          loading = null;
          body.innerHTML = `<p class="nd-msg error">${N.esc((error && error.message) || 'The page could not be loaded.')}</p>`;
          throw error;
        });
        return loading;
      };
      S.pageLoads.push(start);
      // Load all authorised figures, including folded ones, for both the print button and Ctrl-P.
      start().catch(() => {});
      box.addEventListener('toggle', () => { if (box.open) start().catch(() => {}); });
    });
  }

  A.ready.then(() => { N.warmOrigin(); return load(); }).catch((error) => N.fail(app, error));
})();
