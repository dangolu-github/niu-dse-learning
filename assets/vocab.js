// Vocabulary: the teacher's word lists, each a toggle, with export for a flashcard app. Learners cannot add words
// (teacher's decision, 2026-10-05); words a learner added before that still show in their own list until removed.
(() => {
  const N = window.Niu, A = N.A, app = document.getElementById('app');
  const S = { lists: [], myListId: '', query: '', open: new Set() };

  const matches = (w) => !S.query || [w.word, w.meaning, w.example].join(' ').toLowerCase().indexOf(S.query) >= 0;
  const wordRow = (w) => `<li class="nd-word${w.known ? ' is-known' : ''}">
    <span><span class="w">${N.esc(w.word)}</span>${w.pos ? `<span class="pos">${N.esc(w.pos)}</span>` : ' '}<span>${N.esc(w.meaning)}</span></span>
    <span class="tools"><label><input type="checkbox" data-known="${N.esc(w.id)}"${w.known ? ' checked' : ''}> Known 已掌握</label>${w.source === 'student' ? `<button class="nd-linkbtn" type="button" data-remove="${N.esc(w.id)}">Remove</button>` : ''}</span>
    ${w.example ? `<span class="ex">${N.esc(w.example)}</span>` : ''}${w.from ? `<span class="ex nd-note">From: ${N.esc(w.from)}</span>` : ''}</li>`;

  function listsHtml() {
    return S.lists.map((l) => {
      if (l.id === S.myListId && !l.words.length) return '';
      const words = l.words.filter(matches);
      if (S.query && !words.length) return '';
      const open = S.query || S.open.has(l.id) ? ' open' : '';
      return `<details class="nd-fold nd-vocab-list" data-list="${N.esc(l.id)}"${open}><summary><small>${l.words.length} word${l.words.length === 1 ? '' : 's'}</small>${N.esc(l.title)}</summary><div class="nd-fold-body">
        ${l.note ? `<p class="nd-note">${N.esc(l.note)}</p>` : ''}
        ${l.words.length ? `<div class="nd-actions"><button class="nd-btn quiet" type="button" data-copy="${N.esc(l.id)}">Copy the words<small>复制单词（可粘贴到扇贝词书）</small></button><button class="nd-btn quiet" type="button" data-download="${N.esc(l.id)}">Download .txt<small>下载词表</small></button></div><p class="nd-msg" data-copymsg="${N.esc(l.id)}" role="status"></p>` : ''}
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

  const exportText = (id) => S.lists.filter((l) => l.id === id)[0].words.map((w) => w.word).join('\n');

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
  app.addEventListener('change', async (event) => {
    const box = event.target.closest('[data-known]');
    if (!box) return;
    box.disabled = true;
    try { await A.post('setWordStatus', { wordId: box.dataset.known, status: box.checked ? 'known' : 'learning' }); await refresh(true); }
    catch (error) { box.checked = !box.checked; box.disabled = false; }
  });
  app.addEventListener('click', async (event) => {
    const copy = event.target.closest('[data-copy]'), download = event.target.closest('[data-download]'), remove = event.target.closest('[data-remove]');
    if (copy) {
      const message = app.querySelector(`[data-copymsg="${copy.dataset.copy}"]`);
      try { await navigator.clipboard.writeText(exportText(copy.dataset.copy)); message.textContent = 'Copied. Paste it into your word app. 已复制，可粘贴到背单词软件。'; message.className = 'nd-msg success'; }
      catch (error) { message.textContent = 'Copying is blocked here. Use Download instead. 无法复制，请用下载。'; message.className = 'nd-msg error'; }
    } else if (download) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([exportText(download.dataset.download) + '\n'], { type: 'text/plain;charset=utf-8' }));
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
