// Practice & Mock: homework first, then practice by paper, then mock exams.
(() => {
  const N = window.Niu, app = document.getElementById('app');
  const cards = (list) => `<div class="nd-cards">${list.map(N.taskCard).join('')}</div>`;
  N.A.ready.then(async () => {
    try {
      const data = await N.A.request('getCatalogue', {});
      N.previewNote(data.env);
      const of = (group) => data.tasks.filter((t) => t.group === group);
      const homework = of('homework'), practice = of('practice'), mock = of('mock');
      const byPaper = Object.keys(data.papers).map((paper) => {
        const list = practice.filter((t) => t.paper === paper);
        return list.length ? `<h3 class="nd-sub">${N.esc(data.papers[paper])}</h3>${cards(list)}` : '';
      }).join('');
      app.innerHTML = `
        <p class="nd-kicker">Niu · DSE English</p>
        <h1>Practice &amp; Mock</h1>
        <p class="nd-lead">所有题目都在网页上完成：打字作答、听录音、录音或上传音频。答案会自动保存，换手机、平板或电脑可以接着做。</p>
        <section class="nd-section"><h2>Homework <small>作业</small></h2>${homework.length ? cards(homework) : '<p class="nd-empty">No homework yet.</p>'}</section>
        <section class="nd-section"><h2>Practice <small>分卷练习</small></h2>${byPaper || '<p class="nd-empty">Practice sets will appear here. 练习题稍后发布。</p>'}</section>
        <section class="nd-section"><h2>Mock exams <small>模考</small></h2>${mock.length ? cards(mock) : '<p class="nd-empty">Mock papers will appear here. 模考卷稍后发布。</p>'}</section>`;
    } catch (error) { N.fail(app, error); }
  });
})();
