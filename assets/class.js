// One class record: Class Handout, Class Summary, Homework.
(() => {
  const N = window.Niu, app = document.getElementById('app');
  const classId = new URLSearchParams(location.search).get('id') || '';
  N.A.ready.then(async () => {
    try {
      const data = await N.A.request('getClass', { classId });
      N.previewNote(data.env);
      const c = data.class;
      document.title = `Class ${c.number} · ${c.title}`;
      const handouts = c.resources.length
        ? c.resources.map((r, i) => `<details class="nd-fold"${i === 0 ? ' open' : ''}><summary><small>${N.esc(r.kind)}</small>${N.esc(r.label)}</summary><div class="nd-fold-body nd-rich">${r.html}</div></details>`).join('')
        : '<p class="nd-empty">No handout for this class.</p>';
      const summary = c.summaryHtml
        ? `${c.summaryHidden ? '<p class="nd-banner warn">Hidden from the learner until Summary visible is turned on.</p>' : ''}<div class="nd-block nd-rich">${c.summaryHtml}</div>`
        : '<p class="nd-empty">The class summary will appear here. 课堂总结稍后发布。</p>';
      const homework = c.tasks.length
        ? `<div class="nd-cards">${c.tasks.map(N.taskCard).join('')}</div>`
        : '<p class="nd-empty">No homework for this class.</p>';
      // Class words: the new words this class stressed. One column of headwords can be copied for 扇贝.
      const lists = c.words || [];
      const allWords = lists.flatMap((l) => l.words.map((w) => w.word));
      const wordTable = (l) => `<div class="nd-block"><h3 class="nd-sub">${N.esc(l.title)} <small>${l.words.length} words</small></h3>${l.note ? `<p class="nd-note">${N.esc(l.note)}</p>` : ''}
        <table class="nd-wordtable"><thead><tr><th>Word 单词</th><th>Meaning 意思</th><th>Example 例句</th></tr></thead><tbody>${l.words.map((w) => `<tr><td><strong>${N.esc(w.word)}</strong> <small>${N.esc(w.pos)}</small></td><td>${N.esc(w.meaning)}</td><td class="ex">${N.esc(w.example)}</td></tr>`).join('')}</tbody></table>
        <div class="nd-actions"><button class="nd-btn quiet" type="button" data-copy-words="${N.esc(l.id)}">Copy the word column<small>复制单词列（每行一个，可直接粘贴到扇贝）</small></button></div></div>`;
      const classWords = lists.length
        ? `${lists.length > 1 ? `<div class="nd-actions"><button class="nd-btn" type="button" data-copy-words="*">Copy all ${allWords.length} words<small>复制本课全部单词</small></button></div>` : ''}${lists.map(wordTable).join('')}<p class="nd-msg" id="copy-msg"></p>`
        : '<p class="nd-empty">No word list for this class yet. 本课单词稍后发布。</p>';
      app.innerHTML = `
        <p class="nd-back"><a href="../">← Class Logbook</a></p>
        <p class="nd-kicker">Class ${N.esc(c.number)} · ${N.esc(N.longDate(c.date))}</p>
        <h1>${N.esc(c.title)}</h1>
        ${c.focus ? `<p class="nd-lead">${N.esc(c.focus)}</p>` : ''}
        <div class="nd-actions"><button class="nd-btn quiet" type="button" id="print">Print / Save as PDF<small>打印或存为 PDF</small></button></div>
        <section class="nd-section" id="class-handout"><h2>Class Handout <small>课堂讲义</small></h2>${handouts}</section>
        <section class="nd-section" id="class-summary"><h2>Class Summary <small>课堂总结</small></h2>${summary}</section>
        <section class="nd-section" id="class-words"><h2>Class Words <small>本课单词</small></h2>${classWords}</section>
        <section class="nd-section" id="homework"><h2>Homework <small>作业</small></h2>${homework}</section>`;
      app.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-copy-words]');
        if (!button) return;
        const id = button.dataset.copyWords;
        const text = (id === '*' ? allWords : lists.filter((l) => l.id === id)[0].words.map((w) => w.word)).join('\n');
        const msg = document.getElementById('copy-msg');
        try { await navigator.clipboard.writeText(text); }
        catch (error) {
          const box = document.createElement('textarea'); box.value = text; document.body.appendChild(box); box.select();
          try { document.execCommand('copy'); } finally { box.remove(); }
        }
        msg.textContent = 'Copied ' + text.split('\n').length + ' words. Paste them into 扇贝. 已复制，可粘贴到扇贝。'; msg.className = 'nd-msg success';
      });
      document.getElementById('print').addEventListener('click', () => {
        document.querySelectorAll('details.nd-fold').forEach((d) => { d.open = true; });
        window.print();
      });
    } catch (error) { N.fail(app, error); }
  });
})();
