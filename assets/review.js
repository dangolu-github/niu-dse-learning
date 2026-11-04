// Checked work 批改展示: one hand-in, the question and material it was answered from, the learner's own
// answer with the correction marked inside it, and the verdict and score. 2026-11-04.
//
// This file is the whole of that page. There is deliberately no code here for a reason, a comment, an
// answer key, an accepted-answer list, a model answer, an explanation, a rubric, a teacher note, a
// preliminary assessment or a marking label: the payload (getReviewedDisplay, ReviewDisplay.gs) does not
// carry them, and nothing here would draw them if it did. The ordinary task page keeps its own result
// panel and its separately switched explanations; that page is untouched.
//
// The teacher's own preview of this page loads this same file against the same action name, so what she
// reads before release is what the learner reads after it. Only the saved version behind it differs, and
// her page says so in its own strip.
(() => {
  const N = window.Niu, A = N.A, app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const submissionId = params.get('submission') || (window.NiuReviewSubmission || '');

  // The learner's own wording for a verdict, exactly as the task page's result already says it.
  const VERDICTS = {
    correct: ['✓ Correct 正确', 'good'],
    evaluated: ['◎ Evaluated 已批改', ''],
    wrong: ['✗ Not correct 不正确', 'bad'],
    partial: ['◐ Partly correct 部分正确', 'warn'],
    blank: ['✗ Not answered 未作答', 'bad'],
    pending: ['Waiting for your teacher 等待批改', ''],
    skipped: ['', '']
  };

  // Writing and speaking: the crossing-out stays quiet and the correction is the red word, so the eye goes
  // to what to write instead. Short answers: the answer marked in pale red with the right answer in pale
  // green brackets beside it, which is how the mistake log and the task page already show them.
  const styleOf = (q) => (q && ['mc', 'gap', 'short'].indexOf(q.kind) >= 0 ? 'short' : 'writing');

  // A place in the transcript where something was said that is not so, with the learner's own words left
  // in place and the fact added beside them. Never a reason, a rule or a panel.
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
      if (m.mark === 'note') {
        html += `${own} <span class="nr-anno">${N.esc(m.text || '')}</span>`;
      } else if (writing) {
        html += `<del class="nr-del nr-del-w">${own}</del> <ins class="nr-ins nr-ins-w">${N.esc(m.replacement || '')}</ins>`;
      } else {
        html += `<del class="nr-del">${own}</del> <ins class="nr-ins">[${N.esc(m.replacement || '')}]</ins>`;
      }
      cursor = m.end;
    });
    return html + neutral(value.slice(cursor));
  }

  // One short answer marked wrong with no more exact place to mark: the answer as written, marked, and the
  // right answer beside it on the same line. An answer left blank shows the right answer on its own.
  function wholeMarked(original, correction) {
    const written = original ? `<del class="nr-del">${N.esc(original)}</del> ` : '';
    return `${written}<ins class="nr-ins">[${N.esc(correction)}]</ins>`;
  }

  function answerHtml(item, q) {
    const d = item.display || {};
    if (item.waiting) return '';
    const style = styleOf(q);
    if (d.kind === 'audio') {
      const files = (d.files || []).map((f) => `<div class="nr-audio" data-media="upload:${N.esc(f.id)}"><p class="nr-note">${N.esc(f.kind === 'recorded' ? 'Your recording 你的录音' : f.name)}${f.seconds ? ' · ' + N.clock(f.seconds) : ''}</p><div data-audio-body><button class="nd-linkbtn" type="button" data-load-media>Play 播放</button></div></div>`).join('');
      // The recording is the answer. Where the words have been written out and checked, they are shown
      // under it with the corrections in place; where they have not, the recording stands on its own.
      return files + (d.original ? `<p class="nr-answer nr-pre">${marked(d.original, d.spans, d.annotations, style)}</p>` : '');
    }
    if (d.kind !== 'text') return '';
    // A choice stays the letter the learner chose: the options are printed with the question above, and a
    // correction's position belongs to the answer as it was saved.
    const original = d.original || '';
    if (!original && d.correction) return `<p class="nr-answer nr-pre">${wholeMarked('', d.correction)}</p>`;
    const body = (d.spans || []).length || (d.annotations || []).length ? marked(original, d.spans, d.annotations, style)
      : d.correction ? wholeMarked(original, d.correction)
      : neutral(original);
    return `<p class="nr-answer nr-pre">${body}</p>`;
  }

  function itemHtml(item, q) {
    const verdict = VERDICTS[item.verdict] || VERDICTS.pending;
    // An open answer (writing, speaking) carries no per-question mark on the paper, so its saved score
    // stands on its own instead of being shown out of nothing.
    const score = typeof item.score === 'number' ? `<span class="nr-score">${item.score}${item.worth ? ' / ' + item.worth : ''}</span>` : '';
    const prompt = q ? `<p class="nr-prompt">${q.n ? `<span class="nr-n">${N.esc(q.n)}</span>` : ''}${q.prompt}</p>` : '';
    const options = q && q.kind === 'mc' && (q.options || []).length
      ? `<ol class="nr-options" type="A">${q.options.map((o) => `<li>${o}</li>`).join('')}</ol>` : '';
    return `<section class="nr-item" data-q="${N.esc(item.id)}">${prompt}${options}${answerHtml(item, q)}
      ${verdict[0] ? `<p class="nr-verdict ${verdict[1]}">${verdict[0]}${score}</p>` : ''}</section>`;
  }

  // The material the questions were answered from, drawn read-only: texts as they are, recordings and page
  // images loadable through the same private-media path the task page uses.
  function materialHtml(block) {
    if (block.type === 'html' && block.title) return `<details class="nr-doc" open><summary>${N.esc(block.title)}</summary><div class="nd-rich">${block.html}</div></details>`;
    if (block.type === 'html') return `<div class="nd-rich nr-material">${block.html}</div>`;
    if (block.type === 'audio' && block.missing) return '';
    if (block.type === 'pages' && block.missing) return '';
    if (block.type === 'audio') return `<div class="nr-audio" data-media="${N.esc(block.media)}"><p class="nr-note">🎧 ${N.esc(block.label || 'Recording')}</p><div data-audio-body><button class="nd-linkbtn" type="button" data-load-media>Play 播放</button></div></div>`;
    if (block.type === 'pages') return `<div class="nr-pages" data-pages="${N.esc((block.media || []).join(','))}"><p class="nr-note">${N.esc(block.label || 'Question page')} <button class="nd-linkbtn" type="button" data-load-pages>Show 显示</button></p><div data-pages-body></div></div>`;
    return '';
  }

  // Reading work keeps the paper's own arrangement: the texts in one pane and the questions in another,
  // each scrolling by itself, as the task page does (the same titled blocks before the first question).
  function readingTexts(t) {
    const firstQ = t.blocks.findIndex((b) => b.type === 'q');
    const titled = (b) => (b.type === 'html' && b.title) || (t.paper !== 'P1' && b.type === 'pages' && b.label);
    const start = t.paper === 'P1' ? 0
      : t.paper === 'P3' || t.paper === 'P4' ? t.blocks.findIndex((b) => b.type === 'html' && /^(Data File|Article)\b/.test(b.title || ''))
      : -1;
    if (start < 0) return [];
    return t.blocks.map((b, i) => (i >= start && (firstQ < 0 || i < firstQ) && titled(b) ? i : -1)).filter((i) => i >= 0);
  }

  function render(view) {
    const t = view.task, byId = {};
    (view.items || []).forEach((i) => { byId[i.id] = i; });
    document.title = t.label + ' · Checked work · Niu · DSE English';
    const texts = readingTexts(t);
    const work = t.blocks.map((block, index) => {
      if (texts.includes(index)) return '';
      if (block.type !== 'q') return materialHtml(block);
      const item = byId[block.id];
      if (!item) return '';
      // An upload slot that was never used is not part of the work: the paper route was not taken, so its
      // "or upload photos / a PDF" prompt has nothing to show. A recording or an uploaded page that the
      // learner did hand in keeps its own place below.
      if (block.kind === 'file' && !(item.display && (item.display.files || []).length) && !(item.display && item.display.original) && !(item.display && item.display.correction)) return '';
      return itemHtml(item, block);
    }).join('');
    const waiting = view.waiting
      ? `<p class="nd-banner warn">${view.waiting === 'not-released'
        ? 'Your teacher has not released the feedback for this hand-in yet. 这次作业的批改还没有发布。'
        : 'Your teacher is still checking this hand-in. 老师还在批改这次作业。'}</p>`
      : '';
    // The mark sits in the page itself, not in the toolbar: the toolbar is for things to press and is left
    // off a printed copy, and the mark belongs on the paper with the work.
    const parts = (view.scoreParts || []).map((p) => `${N.esc(p.label)} ${N.esc(p.score)} / ${N.esc(p.outOf)}`).join(' · ');
    const total = !view.waiting && view.outOf !== '' && view.outOf != null
      ? `<p class="nr-score-line"><span class="nr-total"><b>${N.esc(view.score)}</b> / ${N.esc(view.outOf)}</span>${parts ? `<span class="nr-parts">${parts}</span>` : ''}</p>`
      : '';
    const pending = !view.waiting && view.pending
      ? '<span>Part of this hand-in is still being checked. 部分题目还在批改中。</span>' : '';
    const bar = `<div class="nd-taskbar"><span>Handed in 提交 ${N.esc(N.when(view.submittedAt))}</span>${pending}<span class="grow"></span>
      <button class="nd-linkbtn" type="button" data-print-review>Print 打印 / PDF</button></div>`;
    app.innerHTML = `
      <p class="nd-back"><a href="${N.root}practice/task/?id=${encodeURIComponent(t.id)}">← ${N.esc(t.label)}</a></p>
      <p class="nd-kicker">Checked work 批改展示${t.paperLabel ? ' · ' + N.esc(t.paperLabel) : ''}</p>
      <h1>${N.esc(t.label)}</h1>
      ${waiting}${bar}${total}
      ${texts.length && !view.waiting
        ? `<div class="nd-split"><section class="nd-split-pane nd-split-texts" aria-label="Texts 文章">${texts.map((i) => materialHtml(Object.assign({}, t.blocks[i], { open: true }))).join('')}</section><div class="nd-split-pane nd-split-questions">${work}</div></div>`
        : view.waiting ? '' : `<div class="nr-body">${work}</div>`}`;
    document.body.classList.toggle('nd-split-page', texts.length > 0 && !view.waiting);
    if (typeof window.NiuReviewStrip === 'function') window.NiuReviewStrip(view);
  }

  async function playMedia(box) {
    const button = box.querySelector('[data-load-media]');
    const body = box.querySelector('[data-audio-body]');
    button.disabled = true; button.textContent = 'Loading… 加载中';
    try {
      const blob = await N.loadMedia(box.dataset.media);
      const audio = document.createElement('audio');
      audio.controls = true; audio.src = URL.createObjectURL(blob);
      body.replaceChildren(audio);
    } catch (error) {
      button.disabled = false; button.textContent = 'Play 播放';
      body.insertAdjacentHTML('beforeend', `<p class="nr-note" role="alert">${N.esc(error.message || 'This recording could not be loaded.')}</p>`);
    }
  }

  async function showPages(box) {
    const button = box.querySelector('[data-load-pages]');
    const body = box.querySelector('[data-pages-body]');
    button.disabled = true; button.textContent = 'Loading… 加载中';
    try {
      for (const mediaId of box.dataset.pages.split(',').filter(Boolean)) {
        const blob = await N.loadMedia(mediaId);
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob); img.alt = 'Question page';
        body.appendChild(img);
      }
      button.remove();
    } catch (error) {
      button.disabled = false; button.textContent = 'Show 显示';
      body.insertAdjacentHTML('beforeend', `<p class="nr-note" role="alert">${N.esc(error.message || 'This page could not be loaded.')}</p>`);
    }
  }

  app.addEventListener('click', (event) => {
    const media = event.target.closest('[data-load-media]');
    if (media) { playMedia(media.closest('[data-media]')); return; }
    const pages = event.target.closest('[data-load-pages]');
    if (pages) { showPages(pages.closest('[data-pages]')); return; }
    // The learner site's own print path: it opens every fold, waits for the pictures and puts the page
    // back as it was afterwards. Printing reads the page and changes nothing that is stored.
    if (event.target.closest('[data-print-review]')) {
      if (window.NiuPrint) window.NiuPrint.print().catch((error) => window.alert(error.message));
      else window.print();
    }
  });

  (async () => {
    try {
      await A.ready;
      if (!submissionId) throw new Error('This page needs the hand-in it belongs to.');
      const view = await A.request('getReviewedDisplay', { submissionId });
      N.previewNote(view.env || '');
      render(view);
    } catch (error) { N.fail(app, error); }
  })();
})();
