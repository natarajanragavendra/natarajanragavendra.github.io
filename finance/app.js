/* Start-up, rendering and event wiring. */
(function () {
  'use strict';
  var App = window.App, S = App.state;
  var main = document.getElementById('app'), dlg = document.getElementById('dlg');

  App.render = function () {
    document.querySelectorAll('.tab').forEach(function (t) { if (t.dataset.tab === S.tab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    if (!S.data) { main.innerHTML = App.viewWelcome(S.bootError); return; }
    var open = null, pin = document.getElementById('plan-in');
    if (S.tab === 'plan' && pin) open = Array.prototype.map.call(pin.querySelectorAll('details'), function (d) { return d.open; });
    main.innerHTML = S.tab === 'plan' ? App.viewPlan() : App.viewPortfolio();
    if (open) main.querySelectorAll('#plan-in details').forEach(function (d, i) { if (open[i] !== undefined) d.open = open[i]; });
    App.applyGeometry(main);
    (S.tab === 'plan' ? App.afterPlan : App.afterPortfolio)(main);
  };
  App.renderOutputs = function () { if (S.tab === 'plan') App.renderPlanOutputs(); else App.render(); };
  App.renderChrome = function () {
    var save = document.getElementById('save');
    save.hidden = !S.dirty || !S.data;
    if (S.dirty && !/Saving|Unsaved|unsaved|Not saved|added/.test(S.status)) App.setStatus('Unsaved changes');
  };

  App.actions.tab = function (el) { S.tab = el.dataset.tab; App.render(); window.scrollTo(0, 0); };
  App.actions.save = function () { App.save(); };
  App.actions.reload = function () { location.reload(); };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = App.actions[el.dataset.action];
    if (fn) fn(el, ev);
  });

  function isToggle(el) { return el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'date'; }
  function onField(ev) {
    var el = ev.target;
    if (!el || !el.dataset) return;
    if (ev.type === 'change' && el.dataset.actionChange) { App.actions[el.dataset.actionChange](el); return; }
    var toggle = isToggle(el);
    if (el.dataset.tx || el.dataset.m || el.dataset.c) {            // dialog drafts, not yet in the data
      if ((ev.type === 'change') === toggle) App.dialogInput(el);
      return;
    }
    if (!el.dataset.bind) return;
    var late = toggle || el.dataset.rerender;                         // these wait for "change" so typing is not interrupted
    if ((ev.type === 'change') !== !!late) return;
    var v = App.parseField(el);
    if (v === undefined) return;
    App.setPath(S.data, el.dataset.bind, v);
    S.dirty = true; App.recompute();
    var echo = el.closest('.field') && el.closest('.field').querySelector('small[data-echo]');
    if (echo) echo.textContent = v ? App.cr(v) : '';
    if (el.closest('dialog')) { /* the page behind is redrawn when the dialog closes */ }
    else if (el.dataset.rerender || !el.closest('#plan-in')) App.render();
    else App.renderPlanOutputs();
    App.renderChrome();
  }
  document.addEventListener('input', onField);
  document.addEventListener('change', onField);

  dlg.addEventListener('close', function () { if (S.data) { App.recompute(); App.render(); App.renderChrome(); } });
  dlg.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT' || ev.target.type === 'checkbox') return;
    var b = dlg.querySelector('[data-default]');
    if (b) { ev.preventDefault(); ev.target.dispatchEvent(new Event('change', { bubbles: true })); b.click(); }
  });
  window.addEventListener('beforeunload', function (ev) { if (S.dirty) { ev.preventDefault(); ev.returnValue = ''; } });

  var q = new URLSearchParams(location.search);
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('today') || '')) S.todayOverride = q.get('today');   // for checking against a past date
  App.load().then(function (ok) {
    if (ok) App.recompute();
    App.render(); App.renderChrome();
  }).catch(function (err) {
    S.data = null; S.bootError = err.message; App.setStatus('Not connected', true); App.render();
  });
})();
