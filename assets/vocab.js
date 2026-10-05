// Vocabulary: the teacher's word lists, each a toggle, with export for a flashcard app. Learners cannot add words
// (teacher's decision, 2026-10-05); words a learner added before that still show in their own list until removed.
// A checked word (已掌握) and any phrase (扇贝 takes single words only) are left out when a list is copied or
// downloaded; Check all / Uncheck all work per list.
(() => {
  const N = window.Niu, A = N.A, app = document.getElementById('app');
  const S = { lists: [], myListId: '', query: '', open: new Set() };

  const matches = (w) => !S.query || [w.word, w.meaning, w.example].join(' ').toLowerCase().indexOf(S.query) >= 0;
  const wordRow = (w) => `<li class="nd-word${w.known ? ' is-known' : ''}">
    <span><span class="w">${N.esc(w.word)}</span>${w.pos ? `<span class="pos">${N.esc(w.pos)}</span>` : ' '}<span>${N.esc(w.meaning)}</span></span>
    <span class="tools"><label class="nd-check"><input type="checkbox" data-known="${N.esc(w.id)}"${w.known ? ' checked' : ''}> 已掌握</label>${w.source === 'student' ? `<button class="nd-linkbtn" type="button" data-remove="${N.esc(w.id)}">Remove</button>` : ''}</span>
    ${w.example ? `<span class="ex">${N.esc(w.example)}</span>` : ''}${w.from ? `<span class="ex nd-note">From: ${N.esc(w.from)}</span>` : ''}</li>`;

  function listsHtml() {
    return S.lists.map((l) => {
      if (l.id === S.myListId && !l.words.length) return '';
      const words = l.words.filter(matches);
      if (S.query && !words.length) return '';
      const open = S.query || S.open.has(l.id) ? ' open' : '';
      const checked = l.words.filter((w) => w.known).length;
      return `<details class="nd-fold nd-vocab-list" data-list="${N.esc(l.id)}"${open}><summary><small>${l.words.length} word${l.words.length === 1 ? '' : 's'}${checked ? ` · ${checked} checked` : ''}</small>${N.esc(l.title)}</summary><div class="nd-fold-body">
        ${l.note ? `<p class="nd-note">${N.esc(l.note)}</p>` : ''}
        ${l.words.length ? `<div class="nd-actions"><button class="nd-btn quiet" type="button" data-checkall="${N.esc(l.id)}"${checked === l.words.length ? ' disabled' : ''}>Check all<small>全部勾选</small></button><button class="nd-btn quiet" type="button" data-uncheckall="${N.esc(l.id)}"${checked ? '' : ' disabled'}>Uncheck all<small>全部取消</small></button><button class="nd-btn quiet" type="button" data-copy="${N.esc(l.id)}">Copy unchecked words<small>复制没勾选的单词（不含词组，可粘贴到扇贝）</small></button><button class="nd-btn quiet" type="button" data-download="${N.esc(l.id)}">Download .txt<small>下载没勾选的单词</small></button></div><p class="nd-msg" data-copymsg="${N.esc(l.id)}" role="status"></p>` : ''}
        ${words.length ? `<ul class="nd-words">${words.map(wordRow).join('')}</ul>` : '<p class="nd-empty">No words yet.</p>'}</div></details>`;
    }).join('') || '<p class="nd-empty">No words match. 没有找到。</p>';
  }

  function render() {
    app.innerHTML = `
      <p class="nd-kicker">Niu · DSE English</p>
      <h1>Vocabulary</h1>
      <p class="nd-lead">老师发布的词表。点开标题看单词；背单词要连例句一起背，词表可以复制到背单词软件里。</p>
      <p style="margin:20px 0 14px"><input class="nd-search" type="search" placeholder="Search words 搜索" value="${N.esc(S.query)}" data-search aria-label="Search words"></p>
      <div data-lists>${listsHtml()}</div>`;
  }

  async function refresh(keepPage) {
    const data = await A.request('getVocabulary', {});
    N.previewNote(data.env);
    S.lists = data.lists; S.myListId = data.myListId;
    if (keepPage && app.querySelector('[data-lists]')) app.querySelector('[data-lists]').innerHTML = listsHtml();
    else render();
  }

  const listById = (id) => S.lists.filter((l) => l.id === id)[0];
  // Checked words and phrases are skipped when copying or downloading.
  const isPhrase = (w) => /\s/.test(w.word.trim());
  const exportWords = (id) => listById(id).words.filter((w) => !w.known && !isPhrase(w)).map((w) => w.word);
  const skippedNote = (id, n) => {
    const l = listById(id), checked = l.words.filter((w) => w.known).length, phrases = l.words.filter((w) => !w.known && isPhrase(w)).length;
    const en = [checked ? `${checked} checked` : '', phrases ? `${phrases} phrase${phrases === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
    const zh = [checked ? `已勾选的 ${checked} 个` : '', phrases ? `词组 ${phrases} 个（扇贝不能加）` : ''].filter(Boolean).join('、');
    return `Copied ${n} words${en ? `, skipped ${en}` : ''}. 已复制 ${n} 个单词${zh ? `，跳过${zh}` : ''}，可粘贴到背单词软件。`;
  };
  const redraw = () => { app.querySelector('[data-lists]').innerHTML = listsHtml(); };
  const say = (id, text, kind) => { const m = app.querySelector(`[data-copymsg="${id}"]`); if (m) { m.textContent = text; m.className = 'nd-msg' + (kind ? ' ' + kind : ''); } };

  // Updates the page at once, then saves; puts the old state back if saving fails.
  async function setKnown(words, known, listId) {
    const before = words.map((w) => w.known);
    words.forEach((w) => { w.known = known; });
    redraw();
    try {
      const status = known ? 'known' : 'learning';
      if (words.length === 1) await A.post('setWordStatus', { wordId: words[0].id, status });
      else await A.post('setWordStatus', { wordIds: words.map((w) => w.id), status });
    } catch (error) {
      words.forEach((w, i) => { w.known = before[i]; });
      redraw();
      say(listId, 'Not saved. Check your connection and try again. 没有保存，请检查网络后重试。', 'error');
    }
  }

  app.addEventListener('input', (event) => {
    if (!event.target.matches('[data-search]')) return;
    S.query = event.target.value.trim().toLowerCase();
    app.querySelector('[data-lists]').innerHTML = listsHtml();
  });
  // Remember which lists are open, so marking a word as known (which re-renders) keeps them open.
  app.addEventListener('toggle', (event) => {
    const list = event.target.closest && event.target.closest('details[data-list]');
    if (!list || S.query) return;
    if (list.open) S.open.add(list.dataset.list); else S.open.delete(list.dataset.list);
  }, true);
  app.addEventListener('change', (event) => {
    const box = event.target.closest('[data-known]');
    if (!box) return;
    const list = box.closest('[data-list]').dataset.list;
    const word = listById(list).words.filter((w) => w.id === box.dataset.known)[0];
    setKnown([word], box.checked, list);
  });
  app.addEventListener('click', async (event) => {
    const copy = event.target.closest('[data-copy]'), download = event.target.closest('[data-download]'), remove = event.target.closest('[data-remove]');
    const checkAll = event.target.closest('[data-checkall]'), uncheckAll = event.target.closest('[data-uncheckall]');
    if (checkAll || uncheckAll) {
      const id = (checkAll || uncheckAll).dataset[checkAll ? 'checkall' : 'uncheckall'];
      const words = listById(id).words.filter((w) => w.known !== Boolean(checkAll));
      if (words.length) await setKnown(words, Boolean(checkAll), id);
    } else if (copy) {
      const words = exportWords(copy.dataset.copy);
      if (!words.length) { say(copy.dataset.copy, 'Nothing to copy: every word is checked. 没有要复制的单词（都已勾选）。'); return; }
      try {
        await navigator.clipboard.writeText(words.join('\n'));
        say(copy.dataset.copy, skippedNote(copy.dataset.copy, words.length), 'success');
      } catch (error) { say(copy.dataset.copy, 'Copying is blocked here. Use Download instead. 无法复制，请用下载。', 'error'); }
    } else if (download) {
      const words = exportWords(download.dataset.download);
      if (!words.length) { say(download.dataset.download, 'Nothing to download: every word is checked. 没有要下载的单词（都已勾选）。'); return; }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([words.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' }));
      link.download = download.dataset.download + '.txt';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    } else if (remove && window.confirm('Remove this word from your list? 从生词表删除这个词？')) {
      remove.disabled = true;
      try { await A.post('setWordStatus', { wordId: remove.dataset.remove, status: 'removed' }); await refresh(true); }
      catch (error) { remove.disabled = false; }
    }
  });

  A.ready.then(() => refresh(false)).catch((error) => N.fail(app, error));
})();
