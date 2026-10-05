// Vocabulary: word lists from the teacher, the learner's own words, and export for a flashcard app.
(() => {
  const N = window.Niu, A = N.A, app = document.getElementById('app');
  const S = { lists: [], myListId: '', query: '' };

  const matches = (w) => !S.query || [w.word, w.meaning, w.example].join(' ').toLowerCase().indexOf(S.query) >= 0;
  const wordRow = (w) => `<li class="nd-word${w.known ? ' is-known' : ''}">
    <span><span class="w">${N.esc(w.word)}</span>${w.pos ? `<span class="pos">${N.esc(w.pos)}</span>` : ' '}<span>${N.esc(w.meaning)}</span></span>
    <span class="tools"><label><input type="checkbox" data-known="${N.esc(w.id)}"${w.known ? ' checked' : ''}> Known 已掌握</label>${w.source === 'student' ? `<button class="nd-linkbtn" type="button" data-remove="${N.esc(w.id)}">Remove</button>` : ''}</span>
    ${w.example ? `<span class="ex">${N.esc(w.example)}</span>` : ''}${w.from ? `<span class="ex nd-note">From: ${N.esc(w.from)}</span>` : ''}</li>`;

  function listsHtml() {
    return S.lists.map((l) => {
      const words = l.words.filter(matches);
      if (S.query && !words.length) return '';
      const empty = l.id === S.myListId ? 'Add words you meet in practice with the form above. 做题时遇到的生词可以加在这里。' : 'No words yet.';
      return `<section class="nd-section" data-list="${N.esc(l.id)}"><h2>${N.esc(l.title)} <small>${l.words.length} word${l.words.length === 1 ? '' : 's'}</small></h2>
        ${l.note ? `<p class="nd-note">${N.esc(l.note)}</p>` : ''}
        ${l.words.length ? `<div class="nd-actions"><button class="nd-btn quiet" type="button" data-copy="${N.esc(l.id)}">Copy the words<small>复制单词（可粘贴到扇贝词书）</small></button><button class="nd-btn quiet" type="button" data-download="${N.esc(l.id)}">Download .txt<small>下载词表</small></button></div><p class="nd-msg" data-copymsg="${N.esc(l.id)}" role="status"></p>` : ''}
        ${words.length ? `<ul class="nd-words">${words.map(wordRow).join('')}</ul>` : `<p class="nd-empty">${empty}</p>`}</section>`;
    }).join('');
  }

  function render() {
    app.innerHTML = `
      <p class="nd-kicker">Niu · DSE English</p>
      <h1>Vocabulary</h1>
      <p class="nd-lead">老师发布的词表和你自己加的生词。背单词要连例句一起背；词表可以复制到背单词软件里。</p>
      <section class="nd-section"><h2>Add a word <small>添加生词</small></h2>
        <form class="nd-form" data-add>
          <label class="nd-field">Word or phrase 单词或短语<input name="word" maxlength="80" required autocomplete="off" autocapitalize="off"></label>
          <label class="nd-field">Meaning 意思<input name="meaning" maxlength="200" autocomplete="off"></label>
          <label class="nd-field wide">Example sentence 例句<input name="example" maxlength="400" autocomplete="off"></label>
          <label class="nd-field">Where I met it 出处<input name="from" maxlength="120" autocomplete="off" placeholder="e.g. 2019 Listening Task 2"></label>
          <div class="nd-actions"><button class="nd-btn" type="submit">Add<small>添加</small></button></div>
          <p class="nd-msg wide" data-addmsg role="status"></p>
        </form></section>
      <p style="margin:26px 0 0"><input class="nd-search" type="search" placeholder="Search words 搜索" value="${N.esc(S.query)}" data-search aria-label="Search words"></p>
      <div data-lists>${listsHtml()}</div>`;
  }

  async function refresh(keepForm) {
    const data = await A.request('getVocabulary', {});
    N.previewNote(data.env);
    S.lists = data.lists; S.myListId = data.myListId;
    if (keepForm && app.querySelector('[data-lists]')) app.querySelector('[data-lists]').innerHTML = listsHtml();
    else render();
  }

  const exportText = (id) => S.lists.filter((l) => l.id === id)[0].words.map((w) => w.word).join('\n');

  app.addEventListener('input', (event) => {
    if (!event.target.matches('[data-search]')) return;
    S.query = event.target.value.trim().toLowerCase();
    app.querySelector('[data-lists]').innerHTML = listsHtml();
  });
  app.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-add]');
    if (!form) return;
    event.preventDefault();
    const message = form.querySelector('[data-addmsg]'), button = form.querySelector('button');
    const values = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    message.textContent = 'Adding… 正在添加'; message.className = 'nd-msg wide';
    try {
      const result = await A.post('addWord', values);
      message.textContent = result.duplicate ? 'This word is already in your list. 这个词已经在你的生词表里。' : 'Added. 已添加。';
      message.className = 'nd-msg wide' + (result.duplicate ? '' : ' success');
      if (!result.duplicate) form.reset();
      await refresh(true);
    } catch (error) {
      message.textContent = (error && error.message) || 'The word could not be added.'; message.className = 'nd-msg wide error';
    }
    button.disabled = false;
  });
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
