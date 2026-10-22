// Optional listening practice, kept separate from DSE practice, homework and mock progression.
(() => {
  const N = window.Niu, app = document.getElementById('app');
  N.A.ready.then(async () => {
    try {
      const data = await N.A.request('getCatalogue', {});
      N.previewNote(data.env);
      const list = data.tasks.filter((t) => t.group === 'extra');
      app.innerHTML = `<p class="nd-kicker">Niu · DSE English</p><h1>Extra Practice</h1>
        <details class="nd-section nd-paper" data-extra-fold="listening"><summary><h2>Listening <small>听力</small></h2><span>${list.length}</span></summary>
        <p>HKALE / AS Use of English</p><div class="nd-cards">${list.length ? list.map((t) => N.taskCard({ ...t, paperLabel: 'Listening', part: '' })).join('') : '<p>No listening practice yet.</p>'}</div></details>`;
      const fold = app.querySelector('[data-extra-fold]');
      const key = 'niu-extra-listening-open';
      try { fold.open = localStorage.getItem(key) === 'true'; } catch (_) { /* Keep closed. */ }
      fold.addEventListener('toggle', () => {
        try { localStorage.setItem(key, String(fold.open)); } catch (_) { /* Private browser. */ }
      });
    } catch (error) { N.fail(app, error); }
  });
})();
