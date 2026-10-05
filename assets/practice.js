// Practice & Mock: homework first, then practice by paper and part, then mock exams by set.
(() => {
  const N = window.Niu, app = document.getElementById('app');
  const cards = (list) => `<div class="nd-cards">${list.map(N.taskCard).join('')}</div>`;
  N.A.ready.then(async () => {
    try {
      const data = await N.A.request('getCatalogue', {});
      N.previewNote(data.env);
      const of = (group) => data.tasks.filter((t) => t.group === group);
      const homework = of('homework'), practice = of('practice'), mock = of('mock');
      const parts = data.parts || {};
      // Practice: one block per paper, one sub-heading per part; tasks without a part come last in their paper.
      const byPaper = Object.keys(data.papers).map((paper) => {
        const list = practice.filter((t) => t.paper === paper);
        if (!list.length) return '';
        const known = (parts[paper] || []).map(([id]) => id);
        const groups = (parts[paper] || []).map(([id, label]) => [label, list.filter((t) => t.part === id)])
          .concat([['Other · 其他', list.filter((t) => known.indexOf(t.part) < 0)]])
          .filter(([, l]) => l.length);
        const inner = groups.map(([label, l]) => (groups.length > 1 || label !== 'Other · 其他' ? `<h4 class="nd-part">${N.esc(label)}</h4>` : '') + cards(l)).join('');
        return `<details class="nd-paper" open><summary><h3 class="nd-sub">${N.esc(data.papers[paper])}</h3><span class="nd-paper-count">${list.length}</span></summary>${inner}</details>`;
      }).join('');
      // Mocks: one block per set, papers in exam order.
      const order = (t) => ['P1', 'P2', 'P3', 'P4'].indexOf(t.paper) * 10 + ['', 'A', 'B', 'B1', 'B2'].indexOf(t.part);
      const sets = (data.mockSets || []).map((m) => [m, mock.filter((t) => t.mockSet === m.id).sort((a, b) => order(a) - order(b))])
        .concat([[{ id: '', label: 'Other mocks · 其他模考', note: '' }, mock.filter((t) => !(data.mockSets || []).some((m) => m.id === t.mockSet))]])
        .filter(([, l]) => l.length);
      const mocks = sets.map(([m, l]) => `<details class="nd-paper"><summary><h3 class="nd-sub">${N.esc(m.label)}</h3><span class="nd-paper-count">${l.length}</span></summary>${m.note ? `<p class="nd-note">${N.esc(m.note)}</p>` : ''}${cards(l)}</details>`).join('');
      app.innerHTML = `
        <p class="nd-kicker">Niu · DSE English</p>
        <h1>Practice &amp; Mock</h1>
        <p class="nd-lead">所有题目都在网页上完成：打字作答、听录音、录音或上传音频。答案会自动保存，换手机、平板或电脑可以接着做。</p>
        <section class="nd-section"><h2>Homework <small>作业</small></h2>${homework.length ? cards(homework) : '<p class="nd-empty">No homework yet.</p>'}</section>
        <section class="nd-section"><h2>Practice <small>分卷分部分练习</small></h2>${byPaper || '<p class="nd-empty">Practice sets will appear here. 练习题稍后发布。</p>'}</section>
        <section class="nd-section"><h2>Mock exams <small>模考</small></h2>${mocks || '<p class="nd-empty">Mock papers will appear here. 模考卷稍后发布。</p>'}</section>`;
    } catch (error) { N.fail(app, error); }
  });
})();
