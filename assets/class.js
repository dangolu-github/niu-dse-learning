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
        ? c.resources.map((r, i) => `<details class="nd-fold"${i === 0 ? ' open' : ''}><summary><small>${N.esc(r.kind)}</small>${N.esc(r.label)}</summary><div class="nd-fold-body nd-rich">${r.html}<p><button class="nd-btn" data-paper-edit="${N.esc(r.id)}">Edit annotations</button></p></div></details>`).join('')
        : '<p class="nd-empty">No handout for this class.</p>';
      const summary = c.summaryHtml
        ? `${c.summaryHidden ? '<p class="nd-banner warn">Hidden from the learner until Summary visible is turned on.</p>' : ''}<div class="nd-block nd-rich">${c.summaryHtml}</div>`
        : '<p class="nd-empty">The class summary will appear here. 课堂总结稍后发布。</p>';
      const homework = c.tasks.length
        ? `<div class="nd-cards">${c.tasks.map(N.taskCard).join('')}</div>`
        : '<p class="nd-empty">No homework for this class.</p>';
      // Class words: the new words this class stressed. One column of headwords can be copied for 扇贝;
      // checked words (已掌握, shared with the Vocabulary page) are left out of the copy.
      const lists = c.words || [];
      const open = new Set();
      const listById = (id) => lists.filter((l) => l.id === id)[0];
      // 扇贝 takes single words only, so a phrase is never copied.
      const unchecked = (l) => l.words.filter((w) => !w.known && !/\s/.test(w.word.trim())).map((w) => w.word);
      const wordTable = (l) => {
        const checked = l.words.filter((w) => w.known).length;
        return `<details class="nd-fold" data-wordlist="${N.esc(l.id)}"${open.has(l.id) ? ' open' : ''}><summary><small>${l.words.length} words${checked ? ` · ${checked} checked` : ''}</small>${N.esc(l.title)}</summary><div class="nd-fold-body">${l.note ? `<p class="nd-note">${N.esc(l.note)}</p>` : ''}
        <div class="nd-actions"><button class="nd-btn quiet" type="button" data-checkall="${N.esc(l.id)}"${checked === l.words.length ? ' disabled' : ''}>Check all<small>全部勾选</small></button><button class="nd-btn quiet" type="button" data-uncheckall="${N.esc(l.id)}"${checked ? '' : ' disabled'}>Uncheck all<small>全部取消</small></button></div>
        <table class="nd-wordtable"><thead><tr><th class="ck">已掌握</th><th>Word 单词</th><th>Meaning 意思</th><th>Example 例句</th></tr></thead><tbody>${l.words.map((w) => `<tr class="${w.known ? 'is-known' : ''}"><td class="ck"><input type="checkbox" aria-label="已掌握 ${N.esc(w.word)}" data-known="${N.esc(w.id)}"${w.known ? ' checked' : ''}></td><td><strong>${N.esc(w.word)}</strong> <small>${N.esc(w.pos)}</small></td><td>${N.esc(w.meaning)}</td><td class="ex">${N.esc(w.example)}</td></tr>`).join('')}</tbody></table>
        <div class="nd-actions"><button class="nd-btn quiet" type="button" data-copy-words="${N.esc(l.id)}">Copy unchecked words<small>复制没勾选的单词（每行一个，可直接粘贴到扇贝）</small></button></div></div></details>`;
      };
      const classWordsHtml = () => lists.length
        ? `${lists.length > 1 ? `<div class="nd-actions"><button class="nd-btn" type="button" data-copy-words="*">Copy all unchecked words<small>复制本课没勾选的全部单词</small></button></div>` : ''}${lists.map(wordTable).join('')}<p class="nd-msg" id="copy-msg"></p>`
        : '<p class="nd-empty">No word list for this class yet. 本课单词稍后发布。</p>';
      const classWords = classWordsHtml();
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
      const box = () => document.getElementById('class-words');
      const redraw = () => { box().innerHTML = '<h2>Class Words <small>本课单词</small></h2>' + classWordsHtml(); };
      const say = (text, kind) => { const m = document.getElementById('copy-msg'); m.textContent = text; m.className = 'nd-msg' + (kind ? ' ' + kind : ''); };
      async function setKnown(words, known) {
        const before = words.map((w) => w.known);
        words.forEach((w) => { w.known = known; });
        redraw();
        try {
          const status = known ? 'known' : 'learning';
          if (words.length === 1) await N.A.post('setWordStatus', { wordId: words[0].id, status });
          else await N.A.post('setWordStatus', { wordIds: words.map((w) => w.id), status });
        } catch (error) {
          words.forEach((w, i) => { w.known = before[i]; });
          redraw();
          say('Not saved. Check your connection and try again. 没有保存，请检查网络后重试。', 'error');
        }
      }
      app.addEventListener('toggle', (event) => {
        const d = event.target.closest && event.target.closest('details[data-wordlist]');
        if (d) { if (d.open) open.add(d.dataset.wordlist); else open.delete(d.dataset.wordlist); }
      }, true);
      app.addEventListener('change', (event) => {
        const tick = event.target.closest('[data-known]');
        if (!tick) return;
        const l = listById(tick.closest('[data-wordlist]').dataset.wordlist);
        setKnown(l.words.filter((w) => w.id === tick.dataset.known), tick.checked);
      });
      app.addEventListener('click', async (event) => {
        const paper=event.target.closest('[data-paper-edit]');if(paper){paper.disabled=true;try{const out=await N.A.post('createPaperAnnotationLink',{resourceId:paper.dataset.paperEdit});location.assign(out.url);}catch(error){paper.disabled=false;paper.textContent='Try again · '+error.message;}return;}
        const all = event.target.closest('[data-checkall]'), none = event.target.closest('[data-uncheckall]');
        if (all || none) {
          const l = listById(all ? all.dataset.checkall : none.dataset.uncheckall);
          const words = l.words.filter((w) => w.known !== Boolean(all));
          if (words.length) await setKnown(words, Boolean(all));
          return;
        }
        const button = event.target.closest('[data-copy-words]');
        if (!button) return;
        const id = button.dataset.copyWords;
        const chosen = id === '*' ? lists : [listById(id)];
        const words = chosen.flatMap(unchecked), skipped = chosen.reduce((n, l) => n + l.words.filter((w) => w.known).length, 0);
        if (!words.length) { say('Nothing to copy: every word is checked. 没有要复制的单词（都已勾选）。'); return; }
        const text = words.join('\n');
        try { await navigator.clipboard.writeText(text); }
        catch (error) {
          const area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select();
          try { document.execCommand('copy'); } finally { area.remove(); }
        }
        say(`Copied ${words.length} words${skipped ? `, skipped ${skipped} checked` : ''}. Paste them into 扇贝. 已复制 ${words.length} 个${skipped ? `（跳过已勾选的 ${skipped} 个）` : ''}，可粘贴到扇贝。`, 'success');
      });
      document.getElementById('print').addEventListener('click', () => {
        document.querySelectorAll('details.nd-fold').forEach((d) => { d.open = true; });
        window.print();
      });
    } catch (error) { N.fail(app, error); }
  });
})();
