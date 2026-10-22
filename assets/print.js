// Print only content already present in the authorised learner page.
// Answer values are copied to temporary text nodes; the editable controls and fold choices are restored.
(() => {
  let state = null;
  let printing = false;
  const root = () => document.getElementById('app') || document.querySelector('main') || document.body;

  function prepare(options = {}) {
    if (state) return;
    const app = root();
    state = { details: [], controls: [], added: [], classes: [], blank: Boolean(options.blank) };
    document.body.classList.add('nd-printing');
    document.body.classList.toggle('nd-print-blank', state.blank);
    app.querySelectorAll('details').forEach((node) => {
      state.details.push([node, node.open]);
      node.open = true;
    });

    app.querySelectorAll('textarea[data-input], input[type="text"][data-input], .nd-q input[type="radio"], .nd-q input[type="checkbox"]').forEach((control) => {
      // Checked paper work already has its faithful original (with error spans) in the feedback.
      // Do not print a second copy from the hidden form value. A clean question sheet still needs space.
      if (!state.blank && control.hasAttribute('data-paper-original')) {
        control.classList.add('nd-print-control');
        state.controls.push(control);
        return;
      }
      const mark = control.type === 'radio' || control.type === 'checkbox';
      const node = document.createElement(control.tagName === 'TEXTAREA' ? 'div' : 'span');
      node.className = 'nd-print-value' + (mark ? ' nd-print-mark' : control.tagName === 'TEXTAREA' ? ' nd-print-answer' : ' nd-print-inline');
      if (mark) {
        node.textContent = !state.blank && control.checked ? '●' : '○';
        node.setAttribute('aria-hidden', 'true');
      } else {
        node.textContent = state.blank ? '' : control.value;
        if (!node.textContent.trim()) {
          node.classList.add('nd-print-empty');
          // Supply bounded working room, not a full mostly blank essay page.
          if (control.tagName === 'TEXTAREA') node.classList.add(Number(control.rows) > 3 ? 'nd-print-long-space' : 'nd-print-short-space');
          else node.textContent = '\u00a0';
        }
      }
      control.classList.add('nd-print-control');
      control.insertAdjacentElement('afterend', node);
      state.controls.push(control);
      state.added.push(node);
    });

    app.querySelectorAll('.nd-q').forEach((question) => {
      const text = question.textContent.length;
      const longAnswer = question.querySelector('textarea[rows]');
      if (text < 1000 && !question.querySelector('table, img') && (!longAnswer || Number(longAnswer.rows) <= 3)) {
        question.classList.add('nd-print-short');
        state.classes.push([question, 'nd-print-short']);
      }
    });
    const blocks = app.querySelector('[data-blocks]');
    if (blocks && !blocks.querySelector('.nd-doc, .nd-pages, table') &&
        !Array.from(blocks.querySelectorAll('textarea')).some((node) => Number(node.rows) > 3) &&
        blocks.querySelectorAll('.nd-q').length >= 6 &&
        !blocks.querySelector('.nd-verdict, [data-print-feedback]')) {
      blocks.classList.add('nd-print-columns');
      state.classes.push([blocks, 'nd-print-columns']);
    }
    document.dispatchEvent(new CustomEvent('niu:print-prepared', { detail: { blank: state.blank } }));
  }

  function restore() {
    if (!state) return;
    const previous = state;
    state = null;
    previous.added.forEach((node) => node.remove());
    previous.controls.forEach((node) => node.classList.remove('nd-print-control'));
    previous.classes.forEach(([node, name]) => node.classList.remove(name));
    previous.details.forEach(([node, open]) => { node.open = open; });
    document.body.classList.remove('nd-printing', 'nd-print-blank');
    document.dispatchEvent(new CustomEvent('niu:print-restored'));
  }

  async function readyImages() {
    const images = Array.from(root().querySelectorAll('img')).filter((image) =>
      !image.closest('[hidden], [data-no-print]') &&
      !(state && state.blank && image.closest('.nd-verdict, .nd-result, .nd-banner, [data-print-feedback], .nd-paper-review, .nd-review')));
    await Promise.all(images.map(async (image) => {
      if (image.decode) {
        try { await image.decode(); } catch (error) { throw new Error('A picture could not be loaded. Please reload it before printing.'); }
      } else if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', () => reject(new Error('A picture could not be loaded.')), { once: true });
        });
      }
      if (!image.naturalWidth) throw new Error('A picture could not be loaded. Please reload it before printing.');
    }));
  }

  async function print(options = {}) {
    if (printing) return;
    printing = true;
    try {
      prepare(options);
      // The task renderer supplies its private figure-loading promise here.
      if (typeof options.prepare === 'function') await options.prepare();
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await readyImages();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
    } catch (error) {
      restore();
      throw error;
    } finally {
      printing = false;
      // Standard print dialogs fire afterprint on close. A focus fallback covers browsers that omit it.
    }
  }

  window.addEventListener('beforeprint', () => prepare());
  window.addEventListener('afterprint', restore);
  window.addEventListener('focus', () => {
    if (state && !printing && !window.matchMedia('print').matches) restore();
  });
  window.NiuPrint = { print, prepare, restore, get active() { return Boolean(state); } };
})();
