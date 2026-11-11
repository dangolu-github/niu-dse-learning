// The task layout, shared (2026-11-10). One question drawn the way the paper sets it: a gap filled inside its
// sentence, choices side by side when they are short, the parts of one question in one box, note-sheet blanks
// together, answers in the table cells they belong to, reading texts in their own pane and passages kept to the
// paper's lines. The task page draws the answer controls into it; the checked work draws the answer as written,
// with its corrections, into exactly the same places (teacher rule, 2026-11-10: 批改页面要延用原提交页面或者题目页面的排版).
//
// Nothing here knows about saving, submitting or marking. A caller passes the parts that differ:
//   option(q, letter, optionHtml, i)  one choice of a multiple-choice question
//   inline(q)                         what stands in a gap inside a sentence
//   box(q)                            the field of a short answer under its prompt
//   long(q)                           the field (and anything under it) of a long answer
//   speak(q)                          the whole box of a spoken answer
//   file(q)                           the whole box of an upload slot
//   after(q)                          optional: added at the end of a choice question's box
//   audio(b, index) / pages(b, index) optional: a recording / page image block drawn differently
(() => {
  const N = window.Niu;
  const esc = (v) => N.esc(v);
  const bare = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  // 12(i), 12 (ii): a part of question 12.
  const subLabel = (q) => { const m = String(q.n || '').match(/^\s*(\d+)\s*\(([ivxl]+)\)\s*$/i); return m ? { base: m[1], roman: m[2].toLowerCase() } : null; };
  // A part whose prompt only repeats its own label ("(i)" under 1(i)) shows the number alone.
  const echoOnly = (q) => { const s = subLabel(q); return Boolean(s) && bare(q.prompt).toLowerCase() === `(${s.roman})`; };
  // A short answer with one blank in its sentence is filled in the sentence, as on the paper.
  const inSentence = (q) => q.kind === 'short' && !(q.rows > 1) && (String(q.prompt).match(/_{4,}/g) || []).length === 1;
  const optionalTag = (q) => (q.optional ? '<span class="nd-optional">(optional 可不填)</span>' : '');
  const number = (q) => (q.n ? `<span class="nd-n">${esc(q.n)}</span>` : '');

  function questionHtml(q, c) {
    if (q.kind === 'mc') {
      // Short choices (T / F / NG, attitudes, letters, numbers) sit side by side.
      const compact = q.options.every((option) => bare(option).length <= 18);
      return `<fieldset class="nd-q nd-mc${compact ? ' nd-mc-inline' : ''}" data-q="${q.id}"><legend>${number(q)}${echoOnly(q) ? '' : q.prompt}</legend>${q.options.map((option, i) => c.option(q, 'ABCDEFGH'.charAt(i), option, i)).join('')}${c.after ? c.after(q) : ''}</fieldset>`;
    }
    if (q.kind === 'gap' || inSentence(q)) {
      const input = c.inline(q);
      const parts = q.prompt.split(/_{4,}/);
      const line = parts.length > 1 ? parts[0] + input + parts.slice(1).join('') : q.prompt + ' ' + input;
      const midSentence = parts.length > 1 && bare(parts.slice(1).join('')).length > 1;
      return `<div class="nd-q nd-gap${midSentence ? ' nd-gap-mid' : ''}" data-q="${q.id}">${number(q)}<span class="nd-gap-line">${line}${optionalTag(q)}</span></div>`;
    }
    if (q.kind === 'short') {
      const field = c.box(q);
      if (echoOnly(q)) return `<div class="nd-q nd-q-bare" data-q="${q.id}">${number(q)}${field}</div>`;
      return `<div class="nd-q" data-q="${q.id}"><p class="nd-prompt-line">${number(q)}${q.prompt}${optionalTag(q)}</p>${field}</div>`;
    }
    if (q.kind === 'long') return `<div class="nd-q" data-q="${q.id}"><p class="nd-prompt-line">${number(q)}${q.prompt}${optionalTag(q)}</p>${c.long(q)}</div>`;
    if (q.kind === 'speak') return c.speak(q);
    if (q.kind === 'file') return c.file(q);
    return '';
  }

  function blockHtml(b, index, c) {
    if (b.type === 'html' && b.title) return `<details class="nd-block nd-doc"${b.open ? ' open' : ''}><summary>${esc(b.title)}</summary><div class="nd-rich nd-doc-body">${b.html}</div></details>`;
    if (b.type === 'html') return `<div class="nd-block ${b.sheet ? 'nd-sheet ' : ''}nd-rich">${b.html}</div>`;
    if (b.type === 'audio' && b.missing) return `<div class="nd-block nd-audio"><div class="nd-audio-head">🎧 <span>${esc(b.label || 'Recording')}</span></div><p class="nd-note">Your teacher will add this recording soon. 录音稍后由老师添加。</p></div>`;
    if (b.type === 'pages' && b.missing) return `<div class="nd-block nd-audio"><p class="nd-note">${esc(b.label || 'Question page')}: your teacher will add this page soon. 题页稍后由老师添加。</p></div>`;
    if (b.type === 'audio') return c.audio ? c.audio(b, index) : `<div class="nd-block nd-audio" data-audio="${esc(b.media)}" data-once="${b.playOnce ? 1 : 0}"><div class="nd-audio-head">🎧 <span>${esc(b.label || 'Recording')}</span>${b.playOnce ? '<span class="nd-pill warn">Plays once 只播放一次</span>' : ''}</div><div data-audio-body></div><p class="nd-msg" role="status"></p></div>`;
    if (b.type === 'pages') return c.pages ? c.pages(b, index) : `<details class="nd-block nd-pages${b.figure ? ' nd-figure' : ''}" data-pages="${esc(b.media.join(','))}"${index === 0 || b.open ? ' open' : ''}><summary>${esc(b.label || 'Question page')}</summary><div class="nd-pages-body"><p class="nd-note">Loading… 正在加载</p></div></details>`;
    if (b.type === 'q') return questionHtml(b, c);
    return '';
  }

  // Reading tasks: the texts go in a left pane and the questions in a right pane, each scrolling on its own, so
  // the learner can look back at the text while answering (teacher rule, 2026-10-29). Phones stack the panes,
  // texts on top. The texts are the titled blocks before the first question: in Paper 1 all of them, in Paper 3
  // Part B the Data File pages from the first one on, in Paper 4 the article and its picture. They never fold.
  function readingTexts(t) {
    const firstQ = t.blocks.findIndex((b) => b.type === 'q');
    const titled = (b) => (b.type === 'html' && b.title) || (t.paper !== 'P1' && b.type === 'pages' && b.label);
    const start = t.paper === 'P1' ? 0
      : t.paper === 'P3' || t.paper === 'P4' ? t.blocks.findIndex((b) => b.type === 'html' && /^(Data File|Article)\b/.test(b.title || ''))
      : -1;
    if (start < 0) return [];
    return t.blocks.map((b, i) => (i >= start && (firstQ < 0 || i < firstQ) && titled(b) ? i : -1)).filter((i) => i >= 0);
  }

  // The parts of one question (4(i), 4(ii) …) share one box with the question they belong to, and a run of
  // note-sheet blanks shares one box, as on the paper, instead of one box each. `skip(b)` leaves a block out
  // (the task page leaves an unused upload slot out of new work); `extra(b, index)` is drawn right after a block.
  function blocksHtml(t, texts, c, skip, extra) {
    const groups = t.requireAny || [];
    const parts = [];
    t.blocks.forEach((b, index) => {
      if (texts.includes(index)) {
        // Drawn in the texts pane. Print puts the texts back here, in the paper's order (print.js).
        if (index === texts[0]) parts.push({ b, key: '', html: '<div data-text-slot hidden></div>' });
        return;
      }
      if (skip && skip(b)) return;
      const secondOfGroup = b.type === 'q' && groups.some((g) => g.indexOf(b.id) > 0);
      const sub = b.type === 'q' ? subLabel(b) : null;
      const key = sub ? 'n' + sub.base : b.type === 'q' && b.kind === 'gap' && !secondOfGroup ? 'notes' : '';
      parts.push({ b, key, html: (secondOfGroup ? '<p class="nd-or">— OR 或者 —</p>' : '') + blockHtml(b, index, c) + (extra ? extra(b, index) : '') });
    });
    const sheet = (p) => p.b.type === 'html' && !p.b.title;
    parts.forEach((p, i) => {
      if (p.key || !sheet(p)) return;
      const before = parts[i - 1], after = parts.slice(i + 1).find((x) => !sheet(x));
      // A worked example or heading between two parts of the same question stays inside its box.
      if (before && after && before.key && before.key === after.key && before.key !== 'notes') p.key = before.key;
      // The question's own wording, directly above its parts, heads the box.
      else if (parts[i + 1] && /^n\d+$/.test(parts[i + 1].key) && new RegExp(`^${parts[i + 1].key.slice(1)}\\b`).test(bare(p.b.html))) p.key = parts[i + 1].key;
    });
    let html = '';
    for (let i = 0; i < parts.length;) {
      let j = i + 1;
      if (parts[i].key) while (j < parts.length && parts[j].key === parts[i].key) j += 1;
      const run = parts.slice(i, j);
      html += run.filter((p) => p.b.type === 'q').length > 1
        ? `<div class="nd-qgroup${run[0].key === 'notes' ? ' nd-qgroup-notes' : ''}">${run.map((p) => p.html).join('')}</div>`
        : run.map((p) => p.html).join('');
      i = j;
    }
    return html;
  }

  // The texts pane's blocks, drawn open and marked so they cannot be folded.
  const textsHtml = (t, texts, c) => texts.map((i) => blockHtml(Object.assign({}, t.blocks[i], { open: true }), i, c).replace(/^<details /, '<details data-text ')).join('');

  // After drawing: the answers that belong in a table cell go into it, an emptied question group is unwrapped,
  // and a text in the texts pane reopens if it is closed.
  function settle(root) {
    root.querySelectorAll('[data-text]').forEach((fold) => fold.addEventListener('toggle', () => { if (!fold.open) fold.open = true; }));
    // Native question tables retain their column relationships and use the standard answer controls.
    root.querySelectorAll('[data-answer-slot]').forEach((slot) => {
      const id = slot.dataset.answerSlot;
      const field = Array.from(root.querySelectorAll('[data-q]')).find((node) => node.dataset.q === id);
      if (field) slot.append(field);
    });
    root.querySelectorAll('.nd-qgroup').forEach((group) => { if (!group.querySelector('[data-q]')) group.replaceWith(...group.childNodes); });
  }

  // ---------- reading passages on screen ----------
  // A passage keeps the paper's lines: one <li> per printed line, numbered where the paper prints a number.
  // Where the screen is wide enough every paper line stays on one screen line (the passage shrinks a little,
  // never below 13px). On a narrower screen the lines join into paragraphs and each printed line number
  // stays in the text as a small mark, so "line 42" can still be found. Printing always uses the paper lines.

  const passages = [];

  function reflowHtml(lines) {
    let html = '';
    lines.forEach((li, i) => {
      if (i === 0 || li.classList.contains('nd-pstart')) html += (i ? '</p>' : '') + '<p>';
      else if (!/\w-$/.test(lines[i - 1].textContent.trim())) html += ' ';
      if (li.dataset.n) html += `<span class="nd-ln" aria-hidden="true">${esc(li.dataset.n)}</span>`;
      html += li.innerHTML;
    });
    return html + '</p>';
  }

  function widestEm(p, px) {
    p.list.classList.add('nd-measure-lines');
    p.list.style.setProperty('--nd-measure-size', px + 'px');
    const widest = Math.max(...p.lines.map((line) => {
      const range = document.createRange();
      range.selectNodeContents(line);
      return range.getBoundingClientRect().width / px;
    }));
    p.list.classList.remove('nd-measure-lines');
    p.list.style.removeProperty('--nd-measure-size');
    return widest;
  }

  function layoutPassage(p) {
    if (document.body.classList.contains('nd-printing') || window.matchMedia('print').matches) return;
    const box = p.list.parentElement, css = getComputedStyle(box);
    const room = box.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) - parseFloat(getComputedStyle(p.list).paddingLeft);
    if (!box.offsetParent || room <= 0) return; // folded away: laid out when opened
    if (!p.em) {
      const shown = p.list.classList.contains('nd-reflowed');
      p.list.classList.remove('nd-reflowed');
      p.em = widestEm(p, 14);
      if (p.em > 0) p.em = Math.max(p.em, widestEm(p, Math.max(13, Math.min(16, room / p.em))));
      p.list.classList.toggle('nd-reflowed', shown);
      if (!(p.em > 0)) return;
    }
    const size = Math.min(16, (room * 0.985) / p.em);
    const fit = size >= 13;
    if (p.fit === fit && p.size === size) return;
    p.fit = fit; p.size = size;
    p.list.classList.toggle('nd-fit-screen', fit);
    p.list.classList.toggle('nd-reflowed', !fit);
    if (fit) p.list.style.setProperty('--nd-screen-size', size.toFixed(2) + 'px');
    else p.list.style.removeProperty('--nd-screen-size');
  }

  function mountPassages(root) {
    passages.splice(0).forEach((p) => p.observer.disconnect());
    root.querySelectorAll('ol.nd-lines').forEach((list) => {
      const lines = Array.from(list.children).filter((node) => node.tagName === 'LI');
      if (!lines.length) return;
      const flow = document.createElement('div');
      flow.className = 'nd-lines-reflow';
      flow.setAttribute('data-no-print', '');
      flow.innerHTML = reflowHtml(lines);
      list.after(flow);
      const p = { list, lines, em: 0 };
      p.observer = new ResizeObserver(() => layoutPassage(p));
      p.observer.observe(list.parentElement);
      passages.push(p);
    });
  }
  const relayout = () => passages.forEach((p) => { p.fit = null; layoutPassage(p); });
  document.addEventListener('niu:print-restored', relayout);
  window.matchMedia('print').addEventListener('change', (event) => { if (!event.matches) relayout(); });

  window.NiuLayout = { bare, subLabel, echoOnly, inSentence, optionalTag, number, questionHtml, blockHtml, readingTexts, blocksHtml, textsHtml, settle, mountPassages };
})();
