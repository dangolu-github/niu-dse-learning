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
      app.innerHTML = `
        <p class="nd-back"><a href="../">← Class Logbook</a></p>
        <p class="nd-kicker">Class ${N.esc(c.number)} · ${N.esc(N.longDate(c.date))}</p>
        <h1>${N.esc(c.title)}</h1>
        ${c.focus ? `<p class="nd-lead">${N.esc(c.focus)}</p>` : ''}
        <div class="nd-actions"><button class="nd-btn quiet" type="button" id="print">Print / Save as PDF<small>打印或存为 PDF</small></button></div>
        <section class="nd-section" id="class-handout"><h2>Class Handout <small>课堂讲义</small></h2>${handouts}</section>
        <section class="nd-section" id="class-summary"><h2>Class Summary <small>课堂总结</small></h2>${summary}</section>
        <section class="nd-section" id="homework"><h2>Homework <small>作业</small></h2>${homework}</section>`;
      document.getElementById('print').addEventListener('click', () => {
        document.querySelectorAll('details.nd-fold').forEach((d) => { d.open = true; });
        window.print();
      });
    } catch (error) { N.fail(app, error); }
  });
})();
