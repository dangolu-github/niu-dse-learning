// Checked work 批改展示: one hand-in read back in the task's own layout (teacher rule, 2026-11-10: 批改页面要延用
// 原提交页面或者题目页面的排版；答案和批改要直接显示出来；听力的批改后页面要能提供script).
//
// The question is drawn by the same layout code as the task page (layout.js): a gap filled in its sentence, the
// choices as they were offered, the parts of one question in one box, answers in their table cells, reading texts
// in their own pane. Where the task page has an answer control, this page has the answer as it was written, with
// the correction inside it — the wrong words marked, the right answer beside them in brackets — and a small mark
// for the verdict and score. Listening work adds the script of its recording; each line plays from where it starts.
//
// What is not drawn, because the payload (getReviewedDisplay, ReviewDisplay.gs) does not carry it: a reason, a
// comment, an accepted-answer list, a model answer, an explanation, a rubric, a teacher note, a preliminary
// assessment or a marking label.
//
// Two ways in, one renderer:
//   · its own page — review/, and the owner's preview of it — asks the course for the projection and draws it.
//   · the task page, and the owner's Student review of it, already receive the projection with their own
//     payload, so they call NiuReview.mount with it. Those pages set <body data-review-boot="off">: this file is
//     then only a library there and draws nothing until it is asked to.
(() => {
  const N = window.Niu, A = N.A, app = document.getElementById('app'), L = window.NiuLayout;
  const params = new URLSearchParams(location.search);
  const submissionId = params.get('submission') || (window.NiuReviewSubmission || '');
  const autoBoot = document.body.dataset.reviewBoot !== 'off';

  // The learner's own wording for a verdict, as a mark beside the answer: symbol on the page, words on hover
  // and for screen readers.
  const VERDICTS = {
    correct: ['✓', 'Correct 正确', 'good'],
    evaluated: ['◎', 'Evaluated 已批改', 'info'],
    wrong: ['✗', 'Not correct 不正确', 'bad'],
    partial: ['◐', 'Partly correct 部分正确', 'warn'],
    blank: ['✗', 'Not answered 未作答', 'bad'],
    pending: ['…', 'Waiting for your teacher 等待批改', 'wait'],
    skipped: ['', '', '']
  };

  // Writing and speaking: the crossing-out stays quiet and the correction is the red word. Short answers: the
  // answer marked in pale red with the right answer in pale green brackets beside it.
  const styleOf = (q) => (q && ['mc', 'gap', 'short'].indexOf(q.kind) >= 0 ? 'short' : 'writing');
  const neutral = (text) => N.esc(text).replace(/\[unclear\]/g, '<span class="nr-unclear">[unclear]</span>');

  // The learner's words, kept whole, with each correction in the place it belongs. A correction that does
  // not fit the answer is left out rather than moved, so a bad position can never rewrite the work.
  function marked(original, spans, annotations, style) {
    const value = String(original || '');
    const marks = (spans || []).map((s) => Object.assign({ mark: 'fix' }, s))
      .concat((annotations || []).map((a) => Object.assign({ mark: 'note' }, a)))
      .filter((m) => Number.isInteger(m.start) && Number.isInteger(m.end) && m.end > m.start && m.end <= value.length)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const writing = style !== 'short';
    let cursor = 0, html = '';
    marks.forEach((m) => {
      if (m.start < cursor) return;
      html += neutral(value.slice(cursor, m.start));
      const own = neutral(value.slice(m.start, m.end));
      if (m.mark === 'note') html += `${own} <span class="nr-anno">${N.esc(m.text || '')}</span>`;
      else if (writing) html += `<del class="nr-del nr-del-w">${own}</del> <ins class="nr-ins nr-ins-w">${N.esc(m.replacement || '')}</ins>`;
      else html += `<del class="nr-del">${own}</del> <ins class="nr-ins">[${N.esc(m.replacement || '')}]</ins>`;
      cursor = m.end;
    });
    return html + neutral(value.slice(cursor));
  }

  // One short answer marked wrong with no more exact place to mark: the answer as written, marked, and the
  // right answer beside it. An answer left blank shows the right answer on its own.
  function wholeMarked(original, correction) {
    return `${original ? `<del class="nr-del">${N.esc(original)}</del> ` : ''}<ins class="nr-ins">[${N.esc(correction)}]</ins>`;
  }

  // The answer as written, with its corrections, for one question. '' when nothing was written and there is
  // nothing to correct.
  function answerInner(item, q) {
    const d = (item && item.display) || {};
    if (d.kind !== 'text') return '';
    const original = d.original || '';
    if (!original && d.correction) return wholeMarked('', d.correction);
    if ((d.spans || []).length || (d.annotations || []).length) return marked(original, d.spans, d.annotations, styleOf(q));
    if (d.correction) return wholeMarked(original, d.correction);
    return neutral(original);
  }

  // The verdict and score beside an answer. A one-mark question needs no figure: the tick or cross is the mark.
  function markHtml(item) {
    if (!item) return '';
    const v = VERDICTS[item.waiting ? 'pending' : item.verdict] || VERDICTS.pending;
    if (!v[0]) return '';
    const scored = typeof item.score === 'number';
    const figure = scored && (item.worth > 1 || item.verdict === 'partial' || item.verdict === 'evaluated' || !item.worth)
      ? ` ${item.score}${item.worth ? '/' + item.worth : ''}` : '';
    return `<span class="nr-mark ${v[2]}" title="${N.esc(v[1])}"><span aria-hidden="true">${v[0]}</span><span class="nr-mark-words">${N.esc(v[1])}</span>${figure}</span>`;
  }

  function filesHtml(item) {
    const d = (item && item.display) || {};
    return (d.files || []).map((f) => `<div class="nr-recording" data-media="upload:${N.esc(f.id)}"><span class="nr-note">${N.esc(f.kind === 'recorded' ? 'Your recording 你的录音' : f.name)}${f.seconds ? ' · ' + N.clock(f.seconds) : ''}</span> <span data-audio-body><button class="nd-linkbtn" type="button" data-load-media>Play 播放</button></span></div>`).join('');
  }

  // The parts of the task layout that differ from the task page: no control anywhere, the answer in its place.
  function controls(byId, view) {
    const item = (q) => byId[q.id];
    const chosenLetter = (it) => String(((it && it.display) || {}).original || '').trim().toUpperCase();
    // The right option: the chosen one when it was right, otherwise the saved correction — a letter ("B"), a
    // letter with its option ("B · the flowers"), or the option's own words.
    const keyLetter = (it, q) => {
      if (!it) return '';
      if (it.verdict === 'correct') return chosenLetter(it);
      const c = String(((it.display || {}).correction) || '').trim();
      const lead = /^([A-H])(?![A-Za-z])/.exec(c);
      if (lead) return lead[1];
      const words = L.bare(c).toLowerCase();
      const i = q ? (q.options || []).findIndex((o) => L.bare(o).toLowerCase() === words) : -1;
      return i >= 0 ? 'ABCDEFGH'.charAt(i) : '';
    };
    const field = (q, writing) => {
      const it = item(q), inner = answerInner(it, q);
      return `<div class="nr-field${writing ? ' nr-field-w' : ''}${inner ? '' : ' nr-empty'}">${inner || '&nbsp;'}</div><p class="nr-verdict">${markHtml(it)}</p>`;
    };
    return {
      option: (q, letter, option) => {
        const it = item(q), chosen = chosenLetter(it) === letter, key = keyLetter(it, q) === letter;
        const state = chosen && key ? ' nr-right' : chosen ? ' nr-wrong' : key ? ' nr-key' : '';
        // Readable without colour too: a tick on the right option, a cross on a wrong choice.
        const sign = key ? '<span class="nr-opt-sign good" title="Correct answer 正确答案">✓</span>'
          : chosen ? '<span class="nr-opt-sign bad" title="Your answer 你的答案">✗</span>' : '';
        return `<div class="nd-opt nr-opt${state}"><span class="nd-letter">${letter}</span><span>${option}</span>${sign}</div>`;
      },
      // A wrong or blank choice also says the right answer in words beside its cross, as a gap does.
      after: (q) => {
        const it = item(q), d = (it && it.display) || {};
        const fix = it && ['wrong', 'blank', 'partial'].indexOf(it.verdict) >= 0 && d.correction ? ` <ins class="nr-ins">[${N.esc(d.correction)}]</ins>` : '';
        return `<p class="nr-verdict">${markHtml(it)}${fix}</p>`;
      },
      inline: (q) => {
        const it = item(q), inner = answerInner(it, q);
        return `<span class="nr-fill${inner ? '' : ' nr-empty'}">${inner || '&nbsp;'}</span> ${markHtml(it)}`;
      },
      box: (q) => field(q, false),
      long: (q) => field(q, true),
      speak: (q) => {
        const it = item(q) || {}, d = it.display || {};
        const words = d.original ? `<div class="nr-field nr-field-w">${marked(d.original, d.spans, d.annotations, 'writing')}</div>` : '';
        return `<div class="nd-q nd-speak" data-q="${q.id}"><p class="nd-prompt-line">${L.number(q)}${q.prompt}</p>${filesHtml(it)}${words}<p class="nr-verdict">${markHtml(it)}</p></div>`;
      },
      // An upload slot shows what was handed in through it; one that was not used is not part of the work.
      file: (q) => {
        const it = item(q) || {}, d = it.display || {};
        if (!(d.files || []).length && !d.original && !d.correction) return '';
        return `<div class="nd-q" data-q="${q.id}"><p class="nd-prompt-line">${L.number(q)}${q.prompt}</p>${filesHtml(it)}${d.original || d.correction ? field(q, true) : `<p class="nr-verdict">${markHtml(it)}</p>`}</div>`;
      },
      // The recording, with the script of it right below once the work is checked.
      audio: (b) => {
        const script = view.script && view.script.media === b.media ? view.script : null;
        return `<div class="nd-block nd-audio" data-media="${N.esc(b.media)}"><div class="nd-audio-head">🎧 <span>${N.esc(b.label || 'Recording')}</span></div><div data-audio-body><button class="nd-btn" type="button" data-load-media>Play the recording<small>播放录音</small></button></div>${script ? scriptHtml(script) : ''}</div>`;
      },
      pages: (b) => `<details class="nd-block nd-pages${b.figure ? ' nd-figure' : ''}" data-pages="${N.esc(b.media.join(','))}" open><summary>${N.esc(b.label || 'Question page')}</summary><div class="nd-pages-body"><p class="nd-note">Loading… 正在加载</p></div></details>`
    };
  }

  // The script: each speaker's turn a paragraph, each line a piece of the recording that plays from its start.
  function scriptHtml(script) {
    const turns = [];
    script.lines.forEach((line, i) => {
      const last = turns[turns.length - 1];
      if (!last || last.turn !== line.turn) turns.push({ turn: line.turn, who: line.who, lines: [] });
      turns[turns.length - 1].lines.push(Object.assign({ i }, line));
    });
    return `<details class="nd-block nr-script" data-script="${N.esc(script.media)}"><summary>Script 听力原文</summary><div class="nr-script-body">${turns.map((t) =>
      `<p class="nr-turn">${t.who ? `<span class="nr-who">${N.esc(t.who)}:</span> ` : ''}${t.lines.map((l) =>
        `<span class="nr-line" data-s="${l.s}" data-e="${l.e}" tabindex="0" role="button" title="Play from here 从这里播放">${N.esc(l.text)}</span>`).join(' ')}</p>`).join('')}</div></details>`;
  }

  function render(view, options) {
    const t = view.task, byId = {};
    (view.items || []).forEach((i) => { byId[i.id] = i; });
    document.title = t.label + ' · Checked work · Niu · DSE English';
    const c = controls(byId, view);
    const texts = L.readingTexts(t);
    const waitingAll = view.waiting;
    const work = waitingAll ? '' : `<div data-blocks>${L.blocksHtml(t, texts, c)}</div>`;
    const banner = waitingAll
      ? `<p class="nd-banner warn">${waitingAll === 'not-released'
        ? 'Submitted. Waiting for your teacher to review. 已提交，等待老师批改。'
        : 'Your teacher is still checking this hand-in. 老师还在批改这次作业。'}</p>`
      : '';
    // The mark sits in the page itself, not in the toolbar: the toolbar is left off a printed copy, and the
    // mark belongs on the paper with the work.
    const parts = (view.scoreParts || []).map((p) => `${N.esc(p.label)} ${N.esc(p.score)} / ${N.esc(p.outOf)}`).join(' · ');
    const total = !waitingAll && view.outOf !== '' && view.outOf != null
      ? `<p class="nr-score-line"><span class="nr-total"><b>${N.esc(view.score)}</b> / ${N.esc(view.outOf)}</span>${parts ? `<span class="nr-parts">${parts}</span>` : ''}</p>`
      : '';
    const pending = !waitingAll && view.pending ? '<span>Part of this hand-in is still being checked. 部分题目还在批改中。</span>' : '';
    const bar = `<div class="nd-taskbar"><span>Handed in 提交 ${N.esc(N.when(view.submittedAt))}</span>${pending}<span class="grow"></span>
      <button class="nd-linkbtn" type="button" data-print-review>Print 打印 / PDF</button></div>`;
    // Drawn on its own page, the way back is the task this work belongs to. Drawn inside that task page, the
    // host supplies its own links, so neither page sends the learner in a circle.
    const back = options && options.backHtml != null
      ? String(options.backHtml)
      : `<a href="${N.root}practice/task/?id=${encodeURIComponent(t.id)}">← ${N.esc(t.label)}</a>`;
    const head = `${back ? `<p class="nd-back">${back}</p>` : ''}
      <p class="nd-kicker">Checked work 批改展示${t.paperLabel ? ' · ' + N.esc(t.paperLabel) : ''}</p>
      <h1>${N.esc(t.label)}</h1>
      ${banner}${bar}${total}`;
    const split = texts.length > 0 && !waitingAll;
    app.innerHTML = split
      ? `${head}<div class="nd-split"><section class="nd-split-pane nd-split-texts" aria-label="Texts 文章">${L.textsHtml(t, texts, c)}</section><div class="nd-split-pane nd-split-questions">${work}</div></div>`
      : `${head}${work}`;
    app.classList.add('nr-checked');
    document.body.classList.toggle('nd-split-page', split);
    L.settle(app);
    // The answers and corrections are shown directly: a fold that holds a question is open. Folds of other
    // material, and the script, start closed as on the task page.
    app.querySelectorAll('details.nd-doc').forEach((fold) => { if (fold.querySelector('[data-q]')) fold.open = true; });
    // Only what the teacher's own Show answers / Show explanations switches release (off by default): closed
    // folds under the question they belong to.
    (view.released || []).forEach((r) => {
      const box = Array.from(app.querySelectorAll('[data-q]')).find((node) => node.dataset.q === r.id);
      if (!box) return;
      const folds = [];
      if (r.accept && r.accept.length) folds.push(`<p class="nr-note">Answer 答案: ${r.accept.map(N.esc).join(' / ')}</p>`);
      if (r.explain) folds.push(`<details class="nr-extra nd-explain"><summary>Explanation 解析</summary><div class="nd-rich">${r.explain}</div></details>`);
      if (r.model) folds.push(`<details class="nr-extra"><summary>Model answer 参考答案</summary><div class="nd-rich">${r.model}</div></details>`);
      if (folds.length) box.insertAdjacentHTML('beforeend', folds.join(''));
    });
    L.mountPassages(app);
    mountPages();
    if (typeof window.NiuReviewStrip === 'function') window.NiuReviewStrip(view);
  }

  // ---------- recordings, the script and page images ----------

  const players = {};
  async function player(box) {
    const media = box.dataset.media;
    if (players[media]) return players[media];
    const body = box.querySelector('[data-audio-body]');
    const button = body.querySelector('[data-load-media]');
    if (button) { button.disabled = true; button.innerHTML = 'Loading… 加载中'; }
    players[media] = (async () => {
      const blob = await N.loadMedia(media);
      const audio = document.createElement('audio');
      audio.controls = true; audio.preload = 'auto'; audio.src = URL.createObjectURL(blob);
      body.replaceChildren(audio);
      follow(media, audio);
      return audio;
    })().catch((error) => {
      delete players[media];
      if (button) { button.disabled = false; button.innerHTML = 'Play 播放'; }
      body.insertAdjacentHTML('beforeend', `<p class="nr-note" role="alert">${N.esc(error.message || 'This recording could not be loaded.')}</p>`);
      throw error;
    });
    return players[media];
  }

  // While the recording plays, the line being spoken is marked in the script.
  function follow(media, audio) {
    const lines = Array.from(app.querySelectorAll(`[data-script="${CSS.escape(media)}"] .nr-line`));
    if (!lines.length) return;
    let current = null;
    audio.addEventListener('timeupdate', () => {
      const now = audio.currentTime;
      const hit = lines.find((l, i) => now >= Number(l.dataset.s) - 0.05 && (i + 1 >= lines.length || now < Number(lines[i + 1].dataset.s) - 0.05));
      if (hit === current) return;
      if (current) current.classList.remove('nr-now');
      current = hit || null;
      if (current) current.classList.add('nr-now');
    });
  }

  async function playLine(line) {
    const box = line.closest('.nd-audio[data-media]');
    if (!box) return;
    try {
      const audio = await player(box);
      app.querySelectorAll('audio').forEach((other) => { if (other !== audio) other.pause(); });
      audio.currentTime = Math.max(0, Number(line.dataset.s) - 0.15);
      await audio.play();
    } catch (error) { /* the player shows the failure */ }
  }

  function mountPages() {
    app.querySelectorAll('[data-pages]').forEach((box) => {
      const body = box.querySelector('.nd-pages-body');
      (async () => {
        const urls = [];
        for (const mediaId of box.dataset.pages.split(',').filter(Boolean)) urls.push(URL.createObjectURL(await N.loadMedia(mediaId)));
        body.innerHTML = urls.map((url, i) => `<img src="${url}" alt="Question page ${i + 1}">`).join('');
      })().catch((error) => { body.innerHTML = `<p class="nd-msg error">${N.esc((error && error.message) || 'The page could not be loaded.')}</p>`; });
    });
  }

  // These belong to the page this renderer has drawn. Where it is only held in reserve, nothing is listening
  // until something has actually been drawn here. Attached once either way.
  let listening = false;
  function listen() {
    if (listening) return;
    listening = true;
    app.addEventListener('click', (event) => {
      const load = event.target.closest('[data-load-media]');
      if (load) { player(load.closest('[data-media]')).then((audio) => audio.play()).catch(() => {}); return; }
      const line = event.target.closest('.nr-line');
      if (line) { playLine(line); return; }
      if (event.target.closest('[data-print-review]')) {
        if (window.NiuPrint) window.NiuPrint.print().catch((error) => window.alert(error.message));
        else window.print();
      }
    });
    app.addEventListener('keydown', (event) => {
      const line = event.target.closest && event.target.closest('.nr-line');
      const { key: pressed } = event;
      if (line && (pressed === 'Enter' || pressed === ' ')) { event.preventDefault(); playLine(line); }
    });
  }

  // review.css is this renderer's own sheet, added once something is drawn if the page has not loaded it.
  function styles() {
    const loaded = Array.from(document.querySelectorAll('link[rel=stylesheet]'))
      .some((link) => String(link.getAttribute('href') || '').indexOf('assets/review.css') >= 0);
    if (loaded) return Promise.resolve();
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${N.root}assets/review.css?v=niu-checked-layout-20261110`;
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      document.head.appendChild(link);
    });
  }

  // One finished projection, already in the host page's hands, drawn here. `options.backHtml` is the host's
  // own way back.
  async function mount(view, options) {
    await styles();
    listen();
    render(view, options || {});
  }
  window.NiuReview = { mount: mount };

  if (autoBoot) (async () => {
    try {
      await A.ready;
      if (!submissionId) throw new Error('This page needs the hand-in it belongs to.');
      const view = await A.request('getReviewedDisplay', { submissionId });
      // Teacher preview only: a learner hand-in opens on the Teacher page's Student review.
      if (view.teacherReview) { location.replace(view.teacherReview); return; }
      N.previewNote(view.env || '');
      await mount(view);
    } catch (error) { N.fail(app, error); }
  })();
})();
