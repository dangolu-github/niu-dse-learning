// Extra Practice: optional listening (HKALE / AS Use of English) and the grammar book with its hand-in window.
// Neither is DSE practice, homework or mock progression. The hand-in window is always open: photos or a PDF of
// any exercise, as often as you like; each hand-in is listed with its date, and the teacher's checked copy
// replaces the files once it is published.
(() => {
  const N = window.Niu, A = N.A, app = document.getElementById('app');
  const DRAFT = 'niu-grammar-draft';
  const S = { grammar: null, grammarId: '', files: [], meta: {}, note: '', busy: false };

  const readDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
      if (d) { S.grammarId = d.grammarId || ''; S.files = d.files || []; S.meta = d.meta || {}; S.note = d.note || ''; }
    } catch (_) { /* no draft */ }
    if (!S.grammarId) S.grammarId = N.newId('gram');
  };
  const writeDraft = () => { try { localStorage.setItem(DRAFT, JSON.stringify({ grammarId: S.grammarId, files: S.files, meta: S.meta, note: S.note })); } catch (_) { /* private browser */ } };
  const clearDraft = () => { S.grammarId = N.newId('gram'); S.files = []; S.meta = {}; S.note = ''; try { localStorage.removeItem(DRAFT); } catch (_) { /* nothing stored */ } };

  const remember = (fold, key) => {
    try { fold.open = localStorage.getItem(key) === 'true'; } catch (_) { /* keep closed */ }
    fold.addEventListener('toggle', () => { try { localStorage.setItem(key, String(fold.open)); } catch (_) { /* private browser */ } });
  };

  const fileLine = (f) => `<span>${N.esc(f.name || 'File')}${f.bytes ? ' · ' + N.size(f.bytes) : ''}</span><button class="nd-linkbtn" type="button" data-open-upload="${N.esc(f.id)}" data-name="${N.esc(f.name || 'File')}" data-mime="${N.esc(f.mime || '')}">View</button>`;

  function sectionRow(s, label) {
    const open = s.ready ? `<button class="nd-btn quiet" type="button" data-open-media="${N.esc(s.media)}" data-name="${N.esc(label || s.label)}">Open PDF</button>` : '<span class="nd-pill">Not added yet</span>';
    return `<li><span><strong>${N.esc(s.label)}</strong>${s.units ? ' <small>' + N.esc(s.units) + '</small>' : ''}${s.pages ? ' <small>' + N.esc(s.pages) + '</small>' : ''}</span>${open}</li>`;
  }

  function weekHtml(plan) {
    const week = plan.weeks[0];
    if (!week) return '<p class="nd-empty">No units have been set yet. 本周还没有指定单元。</p>';
    const bySection = {};
    plan.sections.forEach((s) => { bySection[s.id] = s; });
    return `<p class="nd-note">${N.esc(week.label)}${week.note ? '：' + N.esc(week.note) : ''}</p>
      <ul class="nd-list nd-units">${week.units.map((u) => {
        const s = bySection[u.section];
        return `<li><span><strong>Unit ${N.esc(u.unit)}</strong> ${N.esc(u.title)} <small>${N.esc(u.pages || '')}</small>${u.why ? `<br><small>${N.esc(u.why)}</small>` : ''}</span>${s && s.ready ? `<button class="nd-btn quiet" type="button" data-open-media="${N.esc(s.media)}" data-name="${N.esc(s.label)}">Open PDF</button>` : ''}</li>`;
      }).join('')}</ul>${week.check ? `<p class="nd-note">Then try: ${N.esc(week.check)}</p>` : ''}`;
  }

  function recordsHtml(records) {
    if (!records.length) return '<p class="nd-empty">Nothing handed in yet. 还没有交过。</p>';
    return `<ul class="nd-list nd-records">${records.map((r) => {
      const checked = r.review && r.review.files.length;
      const files = checked ? r.review.files : r.files;
      return `<li><div class="nd-record-head"><strong>${N.esc(N.when(r.at))}</strong>${r.note ? ' · ' + N.esc(r.note) : ''} ${r.review ? '<span class="nd-pill good">Checked 已批改</span>' : '<span class="nd-pill warn">Waiting 待批改</span>'}</div>
        ${checked ? `<p class="nd-note">老师批改后的版本（${N.esc(N.when(r.review.at))}）：</p>` : ''}
        <ul class="nd-files">${files.map((f) => `<li>${fileLine(f)}</li>`).join('')}</ul>
        ${r.review && r.review.comment ? `<p class="nd-note">老师：${N.esc(r.review.comment)}</p>` : ''}</li>`;
    }).join('')}</ul>`;
  }

  function handInHtml() {
    const list = S.files.length ? `<ul class="nd-files" data-draft-files>${S.files.map((id, i) => {
      const m = S.meta[id] || {};
      return `<li><span>${i + 1}. ✓ ${N.esc(m.name || 'File')}${m.bytes ? ' · ' + N.size(m.bytes) : ''}</span><button class="nd-linkbtn" type="button" data-draft-remove="${N.esc(id)}">Remove</button></li>`;
    }).join('')}</ul>` : '';
    return `<p>Take photos of your exercise pages or save them as a PDF, add them here and press Hand in. You can hand in as often as you like; each hand-in is listed below with its date.</p>
      <label class="nd-field">Which units? 做了哪些单元（可不填）<input type="text" maxlength="200" data-note value="${N.esc(S.note)}" placeholder="e.g. Unit 34, Unit 46"></label>
      ${list}
      <label class="nd-drop"><input type="file" multiple accept="image/*,application/pdf,.pdf,.heic,.heif" data-pick><strong>Choose photos or a PDF</strong><span>Up to ${(S.grammar && S.grammar.maxFiles) || 20} files · 12 MB per file</span></label>
      <div class="nd-progress" hidden><i></i></div>
      <div class="nd-actions"><button class="nd-btn" type="button" data-hand-in${S.files.length ? '' : ' disabled'}>Hand in <small>交上去</small></button></div>
      <p class="nd-msg" data-hand-msg role="status"></p>`;
  }

  function render(data, listening) {
    const plan = data.plan;
    app.innerHTML = `<p class="nd-kicker">Niu · DSE English</p><h1>Extra Practice</h1>
      <p class="nd-lead">拓展练习：听力原题节选自由选做；语法书按每周指定的单元做，其余自选，做完在这里交。</p>
      <details class="nd-section nd-paper" data-extra-fold="listening"><summary><h2>Listening <small>听力</small></h2><span>${listening.length}</span></summary>
      <p>拓展听力练习，自由选做。</p><div class="nd-cards">${listening.length ? listening.map((t) => N.taskCard({ ...t, paperLabel: 'Listening', part: '' })).join('') : '<p>No listening practice yet.</p>'}</div></details>
      <details class="nd-section nd-paper" data-extra-fold="grammar"><summary><h2>Grammar <small>语法</small></h2><span>${plan.sections.filter((s) => s.ready).length}</span></summary>
        <p>${N.esc(plan.book.title || 'Grammar book')}${plan.book.edition ? ' · ' + N.esc(plan.book.edition) : ''}${plan.book.note ? '<br>' + N.esc(plan.book.note) : ''}</p>
        <div class="nd-block"><h3 class="nd-sub">This week <small>本周单元</small></h3>${weekHtml(plan)}</div>
        <div class="nd-block" data-no-print><h3 class="nd-sub">Hand in your work <small>交作业</small></h3><div data-hand-in-panel>${handInHtml()}</div></div>
        <div class="nd-block"><h3 class="nd-sub">Your hand-ins <small>提交记录</small></h3><div data-records>${recordsHtml(data.records)}</div></div>
        <details class="nd-fold"><summary>The whole book <small>整本书，按章节</small></summary><div class="nd-fold-body"><ul class="nd-list nd-sections">${plan.sections.map((s) => sectionRow(s)).join('')}</ul></div></details>
        <div class="nd-viewer" data-viewer hidden data-no-print></div>
      </details>`;
    remember(app.querySelector('[data-extra-fold="listening"]'), 'niu-extra-listening-open');
    remember(app.querySelector('[data-extra-fold="grammar"]'), 'niu-extra-grammar-open');
  }

  const say = (text, kind) => { const m = app.querySelector('[data-hand-msg]'); if (m) { m.textContent = text; m.className = 'nd-msg' + (kind ? ' ' + kind : ''); } };
  const redrawPanel = () => { const panel = app.querySelector('[data-hand-in-panel]'); if (panel) panel.innerHTML = handInHtml(); };

  // Large photos are scaled down before they leave the device (same rule as task uploads).
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
    if (!type) type = /\.pdf$/i.test(file.name) ? 'application/pdf' : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : /\.hei[cf]$/i.test(file.name) ? 'image/heic' : 'image/jpeg';
    return { blob: file, type, name: file.name };
  }

  async function uploadFiles(files, input) {
    if (S.busy) { input.value = ''; return; }
    const max = (S.grammar && S.grammar.maxFiles) || 20;
    const bad = files.find((f) => !/^image\//.test(f.type) && f.type !== 'application/pdf' && !/\.(pdf|heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (bad) { say(`${bad.name} is not a photo or PDF. 只能上传照片或 PDF。`, 'error'); input.value = ''; return; }
    if (S.files.length + files.length > max) { say(`Choose no more than ${max} files in one hand-in.`, 'error'); input.value = ''; return; }
    S.busy = true; input.disabled = true;
    const bar = app.querySelector('[data-hand-in-panel] .nd-progress'), fill = bar.querySelector('i');
    bar.hidden = false; fill.style.width = '5%';
    try {
      for (let i = 0; i < files.length; i += 1) {
        say(`Sending ${i + 1} of ${files.length}… Keep this page open. 正在上传，请不要关闭页面。`);
        const ready = await prepare(files[i]);
        if (ready.blob.size > 12 * 1024 * 1024) throw new Error(`${files[i].name} is larger than 12 MB. Take the photo again at a smaller size.`);
        const fileId = N.newId('file');
        const data = await N.toBase64(ready.blob), submissionOrigin = await N.origin();
        const result = await A.post('uploadFile', { taskId: 'grammar', itemId: 'work', fileId, type: ready.type, name: ready.name, kind: 'uploaded', seconds: 0, data, submissionOrigin });
        S.files.push(fileId);
        S.meta[fileId] = { name: result.name || ready.name, bytes: result.bytes || ready.blob.size };
        writeDraft();
        fill.style.width = Math.round(((i + 1) / files.length) * 100) + '%';
      }
      S.busy = false;
      redrawPanel();
      say(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}. Check the list, then press Hand in. 已上传，核对后点 Hand in。`, 'success');
    } catch (error) {
      S.busy = false;
      redrawPanel();
      say((error && error.message) || 'The upload did not finish. Please try again.', 'error');
    }
  }

  async function handIn(button) {
    if (S.busy || !S.files.length) return;
    S.busy = true; button.disabled = true;
    say('Handing in… 正在提交。');
    try {
      const submissionOrigin = await N.origin();
      const result = await A.post('grammarSubmit', { grammarId: S.grammarId, note: S.note, files: S.files.slice(), submissionOrigin });
      if (JSON.stringify(result.files || []) !== JSON.stringify(S.files)) throw new Error('The receipt did not confirm every file. Reload the page to check before trying again.');
      clearDraft();
      const data = await A.request('getGrammar', {});
      S.grammar = data;
      app.querySelector('[data-records]').innerHTML = recordsHtml(data.records);
      S.busy = false;
      redrawPanel();
      say('Handed in. 已交，老师批改后会在下面显示。', 'success');
    } catch (error) {
      S.busy = false;
      redrawPanel();
      say((error && error.message) || 'The hand-in was not confirmed. Please try again.', 'error');
    }
  }

  // One viewer for section PDFs, own uploads and the teacher's checked copies (loaded through the private backend).
  async function show(button, mediaId, name, mime) {
    const viewer = app.querySelector('[data-viewer]');
    button.disabled = true;
    const was = button.textContent;
    button.textContent = 'Loading…';
    try {
      const blob = await N.loadMedia(mediaId);
      const url = URL.createObjectURL(blob);
      const type = mime || blob.type || '';
      const body = /^image\//.test(type) ? `<img src="${url}" alt="">` : `<iframe src="${url}" title="${N.esc(name)}"></iframe>`;
      viewer.hidden = false;
      viewer.innerHTML = `<div class="nd-viewer-head"><strong>${N.esc(name)}</strong><span><a class="nd-btn quiet" href="${url}" download="${N.esc(name.replace(/[\\/]/g, '-'))}${/^image\//.test(type) ? '' : /\.pdf$/i.test(name) ? '' : '.pdf'}">Download</a> <button class="nd-btn quiet" type="button" data-viewer-close>Close</button></span></div>${body}`;
      viewer.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (error) {
      say((error && error.message) || 'This file could not be loaded.', 'error');
    } finally { button.disabled = false; button.textContent = was; }
  }

  app.addEventListener('click', (event) => {
    const media = event.target.closest('[data-open-media]');
    if (media) { show(media, media.dataset.openMedia, media.dataset.name || 'PDF', 'application/pdf'); return; }
    const upload = event.target.closest('[data-open-upload]');
    if (upload) { show(upload, 'upload:' + upload.dataset.openUpload, upload.dataset.name || 'File', upload.dataset.mime || ''); return; }
    if (event.target.closest('[data-viewer-close]')) { const v = app.querySelector('[data-viewer]'); v.hidden = true; v.innerHTML = ''; return; }
    const remove = event.target.closest('[data-draft-remove]');
    if (remove) { S.files = S.files.filter((id) => id !== remove.dataset.draftRemove); writeDraft(); redrawPanel(); return; }
    const button = event.target.closest('[data-hand-in]');
    if (button) handIn(button);
  });
  app.addEventListener('change', (event) => {
    const pick = event.target.closest('[data-pick]');
    if (pick && pick.files.length) { uploadFiles(Array.from(pick.files), pick); return; }
    const note = event.target.closest('[data-note]');
    if (note) { S.note = note.value.slice(0, 200); writeDraft(); }
  });
  app.addEventListener('input', (event) => { const note = event.target.closest('[data-note]'); if (note) { S.note = note.value.slice(0, 200); writeDraft(); } });

  A.ready.then(async () => {
    try {
      readDraft();
      const [catalogue, grammar] = await Promise.all([A.request('getCatalogue', {}), A.request('getGrammar', {})]);
      N.previewNote(catalogue.env);
      S.grammar = grammar;
      render(grammar, catalogue.tasks.filter((t) => t.group === 'extra'));
      N.warmOrigin();
    } catch (error) { N.fail(app, error); }
  });
})();
