// Home: what to do next, the four sections, and the Class Logbook.
(() => {
  const N = window.Niu, app = document.getElementById('app');
  N.A.ready.then(async () => {
    try {
      const data = await N.A.request('getHome', {});
      N.previewNote(data.env);
      const todo = data.todo.length
        ? `<div class="nd-cards">${data.todo.map(N.taskCard).join('')}</div>`
        : '<p class="nd-empty">No homework is waiting. 目前没有待完成的作业。</p>';
      const classes = data.classes.length
        ? `<ol class="nd-log">${data.classes.map((c) => `<li><a href="class/?id=${encodeURIComponent(c.id)}"><span class="num">${N.esc(c.number)}</span><span><strong>${N.esc(c.title)}</strong><span class="date">Class ${N.esc(c.number)} · ${N.esc(N.longDate(c.date))}${c.focus ? ' · ' + N.esc(c.focus) : ''}</span></span><span class="go">Open →</span></a></li>`).join('')}</ol>`
        : '<p class="nd-empty">Class records will appear here after each class.</p>';
      app.innerHTML = `
        <p class="nd-kicker">Niu · DSE English</p>
        <h1>Welcome back</h1>
        <p class="nd-lead">课程记录、练习与模考、错题本和词汇都在这里。</p>
        <div class="nd-tiles">
          <a class="nd-tile" href="practice/"><b>${data.counts.practice}</b><strong>Practice &amp; Mock</strong><span>练习与模考</span></a>
          <a class="nd-tile" href="mistake-log/"><b>${data.counts.mistakesOpen}</b><strong>Mistake Log</strong><span>待复习的错题</span></a>
          <a class="nd-tile" href="vocabulary/"><b>${data.counts.words}</b><strong>Vocabulary</strong><span>词汇</span></a>
        </div>
        <section class="nd-section"><h2>To do <small>待完成</small></h2>${todo}</section>
        <section class="nd-section"><h2>Class Logbook <small>课程记录</small></h2>${classes}</section>`;
    } catch (error) { N.fail(app, error); }
  });
})();
