// Shared helpers for Niu's learner pages: header, formatting, task cards and private media.
// Each page sets <body data-root="../" data-page="practice"> and has <main id="app">.
window.Niu = (() => {
  const A = window.NiuAccess;
  const root = document.body.dataset.root || './';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const newId = (prefix) => A.randomId(prefix);
  const when = (value) => {
    const d = new Date(value);
    return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const longDate = (ymd) => {
    const d = new Date(String(ymd) + 'T12:00:00');
    return isNaN(d) ? String(ymd || '') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const clock = (seconds) => {
    const s = Math.max(0, Math.round(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const size = (bytes) => bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  // Words as a word processor counts them: "6:40", "p.m." and "dog-friendly" are one word each.
  const words = (text) => String(text || '').split(/\s+/).filter((w) => /[A-Za-z0-9\u00C0-\u024F]/.test(w)).length;

  const pages = [['home', '', 'Classes', '课程记录'], ['practice', 'practice/', 'Practice & Mock', '练习与模考'], ['mistakes', 'mistake-log/', 'Mistake Log', '错题本'], ['vocabulary', 'vocabulary/', 'Vocabulary', '词汇']];
  function header() {
    const active = document.body.dataset.page || '';
    const top = document.createElement('header');
    top.className = 'nd-top';
    top.innerHTML = `<div class="nd-top-inner"><a class="nd-brand" href="${root}">Niu <span>· DSE English</span></a><nav class="nd-nav" aria-label="Sections">${
      pages.map((p) => `<a href="${root}${p[1]}"${p[0] === active ? ' aria-current="page"' : ''}>${p[2]}<small>${p[3]}</small></a>`).join('')}</nav></div>`;
    document.body.prepend(top);
  }

  // Shown only in the teacher's preview browser.
  function previewNote(env) {
    if (env !== 'test' || document.querySelector('.nd-preview')) return;
    const note = document.createElement('p');
    note.className = 'nd-preview';
    note.textContent = 'Teacher preview · anything saved from this browser is a test record.';
    document.querySelector('.nd-top').after(note);
  }

  const taskHref = (id) => `${root}practice/task/?id=${encodeURIComponent(id)}`;
  const stateText = {
    locked: ['Not open yet', ''], new: ['Not started', ''], draft: ['In progress', 'warn'], submitted: ['Submitted', 'good'], checked: ['Checked', 'good']
  };
  function taskCard(card) {
    const state = stateText[card.state] || stateText.new;
    const facts = [card.paperLabel + (card.part ? ' · Part ' + card.part : '')];
    if (card.count) facts.push(card.count + (card.count === 1 ? ' answer' : ' answers'));
    if (card.minutes) facts.push(card.minutes + ' min');
    if (card.hasAudio) facts.push('listening');
    if (card.hasSpeaking) facts.push('speaking');
    let detail = '';
    if (card.state === 'draft') detail = `${card.answered || 0} / ${card.count} answered`;
    if (card.state === 'submitted') detail = when(card.submittedAt);
    if (card.state === 'checked') detail = card.outOf !== undefined && card.outOf !== '' ? `${card.score} / ${card.outOf}` : when(card.submittedAt);
    const action = card.state === 'locked' ? '' : card.state === 'new' ? 'Start' : card.state === 'draft' ? 'Continue' : card.state === 'checked' ? 'See feedback' : 'View';
    const closed = card.receiving === false && (card.state === 'new' || card.state === 'draft') ? '<span class="nd-pill">Closed</span>' : '';
    const hidden = card.released === false && card.state !== 'locked' ? '<span class="nd-pill warn">Not released</span>' : '';
    const body = `<div class="nd-card-kind">${esc(facts.filter(Boolean).join(' · '))}</div><h3>${esc(card.label)}</h3>
      <p class="nd-meta"><span class="nd-pill ${state[1]}">${state[0]}</span>${closed}${hidden}${detail ? ' <span>' + esc(detail) + '</span>' : ''}</p>`;
    return card.state === 'locked'
      ? `<article class="nd-card is-locked">${body}</article>`
      : `<a class="nd-card nd-card-link" href="${taskHref(card.id)}">${body}<span class="nd-go">${action} →</span></a>`;
  }

  const b64ToBytes = (b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };
  const mediaCache = new Map();
  // Private audio and page images arrive in parts after the access check and are joined here.
  function loadMedia(mediaId, onProgress) {
    if (mediaCache.has(mediaId)) return mediaCache.get(mediaId);
    const job = (async () => {
      const first = await A.request('getMedia', { mediaId, part: 0 }, 90000);
      const parts = [b64ToBytes(first.data)];
      if (onProgress) onProgress(1 / first.parts);
      for (let i = 1; i < first.parts; i += 1) {
        const next = await A.request('getMedia', { mediaId, part: i }, 90000);
        parts.push(b64ToBytes(next.data));
        if (onProgress) onProgress((i + 1) / first.parts);
      }
      return new Blob(parts, { type: first.mime });
    })();
    mediaCache.set(mediaId, job);
    job.catch(() => mediaCache.delete(mediaId));
    return job;
  }

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  function fail(container, error) {
    container.innerHTML = `<p class="nd-empty" role="alert">${esc((error && error.message) || 'This page could not be loaded. Please try again.')}</p>`;
  }

  header();
  return { A, root, esc, sleep, newId, when, longDate, clock, size, words, taskHref, taskCard, loadMedia, toBase64, fail, previewNote };
})();
