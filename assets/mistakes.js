// Mistake Log: wrong answers from checked work and corrections the teacher adds, with retries.
(() => {
  const N = window.Niu, A = N.A, app = document.getElementById('app');
  const S = { list: [], skills: [], skill: 'All', show: 'open', open: {} };

  function card(m) {
    const cleared = m.status === 'cleared';
    const from = [m.taskLabel, m.n ? 'Q' + m.n : ''].filter(Boolean).join(' · ');
    const options = m.options && m.options.length ? `<ol type="A" class="ctx">${m.options.map((o) => `<li>${N.esc(o)}</li>`).join('')}</ol>` : '';
    const shown = cleared || S.open[m.id];
    const answer = m.correct || m.why
      ? (shown
        ? `${m.correct ? `<dt>Correct 正确</dt><dd class="good">${N.esc(m.correct)}</dd>` : ''}${m.why ? `<dt>Why 原因</dt><dd>${N.esc(m.why)}</dd>` : ''}`
        : '')
      : '';
    let retry = '';
    if (!cleared) {
      if (m.awaitingSelfCheck) {
        retry = `<p class="nd-note">Compare your new answer with the correction. 对照改正后的写法：这次写对了吗？</p><div class="nd-actions"><button class="nd-btn" type="button" data-self="yes" data-id="${m.id}">I had it<small>这次写对了</small></button><button class="nd-btn alt" type="button" data-self="no" data-id="${m.id}">Not yet<small>还没掌握</small></button></div>`;
      } else {
        retry = `<div class="nd-retry">${m.mc
          ? `<input type="text" maxlength="1" placeholder="A, B, C…" data-attempt="${m.id}" aria-label="Your new answer">`
          : `<textarea rows="2" placeholder="Try again: write the answer again 再做一次" data-attempt="${m.id}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>`}
          <button class="nd-btn" type="button" data-check="${m.id}">Check<small>检查</small></button>
          ${(m.correct || m.why) && !shown ? `<button class="nd-btn quiet" type="button" data-reveal="${m.id}">Show answer<small>看答案</small></button>` : ''}</div>`;
      }
    }
    return `<article class="nd-mistake${cleared ? ' is-cleared' : ''}" data-mistake="${m.id}">
      <h3><span class="nd-pill ${cleared ? 'good' : 'bad'}">${cleared ? 'Cleared 已掌握' : 'To review 待复习'}</span> ${N.esc(m.skill)}${m.type ? ' · ' + N.esc(m.type) : ''}</h3>
      <p class="nd-meta">${N.esc(from)}${from ? ' · ' : ''}${N.esc(N.when(m.at))}${m.attempts ? ` · ${m.attempts} ${m.attempts === 1 ? 'retry' : 'retries'}` : ''}</p>
      ${m.context ? `<p class="ctx">${N.esc(m.context)}</p>` : ''}${options}
      <dl><dt>You wrote 你写的</dt><dd class="bad">${N.esc(m.answer || '(no answer 未作答)')}</dd>${m.lastAttempt && !cleared ? `<dt>Last retry 上次重做</dt><dd>${N.esc(m.lastAttempt)}</dd>` : ''}${answer}</dl>
      ${retry}<p class="nd-msg" data-msg="${m.id}" role="status"></p></article>`;
  }

  function render() {
    const bySkill = S.list.filter((m) => S.skill === 'All' || m.skill === S.skill);
    const open = bySkill.filter((m) => m.status === 'open'), cleared = bySkill.filter((m) => m.status === 'cleared');
    const shown = S.show === 'open' ? open : cleared;
    const chip = (label, pressed, attrs) => `<button class="nd-chip" type="button" aria-pressed="${pressed}" ${attrs}>${N.esc(label)}</button>`;
    app.innerHTML = `
      <p class="nd-kicker">Niu · DSE English</p>
      <h1>Mistake Log</h1>
      <p class="nd-lead">批改过的错题和老师加的改正都在这里。先自己再做一次，再看答案；做对了就会移到“已掌握”。</p>
      <div class="nd-chips" role="group" aria-label="Skill">${['All'].concat(S.skills).map((s) => chip(s, S.skill === s, `data-skill="${N.esc(s)}"`)).join('')}</div>
      <div class="nd-chips" role="group" aria-label="Status">${chip(`To review 待复习 (${open.length})`, S.show === 'open', 'data-show="open"')}${chip(`Cleared 已掌握 (${cleared.length})`, S.show === 'cleared', 'data-show="cleared"')}</div>
      <section class="nd-section">${shown.length ? shown.map(card).join('') : `<p class="nd-empty">${S.show === 'open' ? 'Nothing to review here. 这里没有待复习的错题。' : 'Nothing cleared yet. 还没有已掌握的条目。'}</p>`}</section>`;
  }

  async function refresh() {
    const data = await A.request('getMistakes', {});
    N.previewNote(data.env);
    S.list = data.mistakes; S.skills = data.skills;
    render();
  }

  const say = (id, text, kind) => {
    const el = app.querySelector(`[data-msg="${id}"]`);
    if (el) { el.textContent = text; el.className = 'nd-msg' + (kind ? ' ' + kind : ''); }
  };

  app.addEventListener('click', async (event) => {
    const skill = event.target.closest('[data-skill]'), show = event.target.closest('[data-show]');
    if (skill) { S.skill = skill.dataset.skill; render(); return; }
    if (show) { S.show = show.dataset.show; render(); return; }
    const reveal = event.target.closest('[data-reveal]');
    if (reveal) { S.open[reveal.dataset.reveal] = true; render(); return; }
    const check = event.target.closest('[data-check]'), self = event.target.closest('[data-self]');
    if (!check && !self) return;
    const id = check ? check.dataset.check : self.dataset.id;
    const button = check || self;
    button.disabled = true;
    try {
      if (check) {
        const attempt = app.querySelector(`[data-attempt="${id}"]`).value.trim();
        if (!attempt) { say(id, 'Write your new answer first. 先写出你的新答案。', 'error'); button.disabled = false; return; }
        say(id, 'Checking… 正在检查');
        const result = await A.post('redoMistake', { mistakeId: id, attempt });
        if (result.outcome === 'self-check') S.open[id] = true;
        await refresh();
        if (result.outcome === 'incorrect') say(id, 'Not yet. Look at the question again and try once more. 还不对，再看一遍题目。', 'error');
      } else {
        await A.post('redoMistake', { mistakeId: id, selfMark: self.dataset.self });
        if (self.dataset.self === 'no') delete S.open[id];
        await refresh();
      }
    } catch (error) {
      say(id, (error && error.message) || 'Please try again.', 'error');
      button.disabled = false;
    }
  });

  A.ready.then(refresh).catch((error) => N.fail(app, error));
})();
