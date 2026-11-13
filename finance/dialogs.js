/* Dialogs: add or edit a transaction, this month's entries, EPF/PPF balance, settings, first-run connect. */
(function () {
  'use strict';
  var App = window.App, S = App.state, e = App.esc, cr = App.cr;
  var dlg, current = null;

  App.openDialog = function (build, wide) {
    dlg = dlg || document.getElementById('dlg');
    current = build; dlg.className = wide ? 'wide' : ''; dlg.innerHTML = build();
    App.applyGeometry(dlg);
    if (!dlg.open) dlg.showModal();
  };
  App.refreshDialog = function () {
    if (!current || !dlg) return;
    var top = dlg.scrollTop; dlg.innerHTML = current(); App.applyGeometry(dlg); dlg.scrollTop = top;
  };
  App.closeDialog = function () { if (dlg && dlg.open) dlg.close(); };
  App.actions['dlg-close'] = function () { App.closeDialog(); };
  function head(title) { return '<div class="dlg-head"><h2>' + e(title) + '</h2><button type="button" class="btn quiet" data-action="dlg-close">Close</button></div>'; }
  function instById(id) { return S.data.instruments.find(function (i) { return i.id === id; }); }
  function latestPrice(id) { var i = instById(id), p = i && window.Portfolio.priceOf(i, S.prices || {}); return p ? p.price : null; }
  function heldUnits(person, id) {
    return S.data.transactions.reduce(function (t, x) { return x[1] === person && x[2] === id ? t + (x[3] === 'sell' ? -1 : 1) * (+x[4] || 0) : t; }, 0);
  }
  function round(v, d) { var m = Math.pow(10, d); return Math.round(v * m) / m; }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fund'; }
  function fundOptions(person, selected, withNew) {
    var held = [], other = [], epf = [];
    S.data.instruments.forEach(function (i) {
      if (i.class === 'epf') { epf.push(i); return; }
      (Math.abs(heldUnits(person, i.id)) >= 0.01 ? held : other).push(i);
    });
    var opt = function (i) { return '<option value="' + e(i.id) + '"' + (selected === i.id ? ' selected' : '') + '>' + e(i.name) + '</option>'; };
    var byName = function (a, b) { return a.name < b.name ? -1 : 1; };
    return '<option value="">Choose…</option>' +
      (held.length ? '<optgroup label="' + e(App.personName(person)) + ' holds now">' + held.sort(byName).map(opt).join('') + '</optgroup>' : '') +
      (epf.length ? '<optgroup label="Provident fund">' + epf.map(opt).join('') + '</optgroup>' : '') +
      (other.length ? '<optgroup label="Other funds">' + other.sort(byName).map(opt).join('') + '</optgroup>' : '') +
      (withNew ? '<option value="__new"' + (selected === '__new' ? ' selected' : '') + '>A new fund or share…</option>' : '');
  }
  function addTx(row) { S.data.transactions.push(row); S.data.transactions.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; }); }

  /* ---------- one transaction ---------- */
  var T = null;
  function txDialog() {
    var i = T.id && T.id !== '__new' ? instById(T.id) : null, isEpf = i && i.class === 'epf', isNew = T.id === '__new';
    var h = head(T.index != null ? 'Edit this entry' : 'Add a transaction') + '<div class="dlg-body"><div class="fields">';
    h += '<div class="field wide"><span>Whose</span><div class="choice">' + S.data.people.map(function (p) {
      return '<label><input type="radio" name="tx-person" data-tx="person" value="' + e(p.id) + '"' + (T.person === p.id ? ' checked' : '') + '><span>' + e(p.name) + '</span></label>'; }).join('') + '</div></div>';
    h += '<label class="field wide"><span>Fund</span><select data-tx="id">' + fundOptions(T.person, T.id, true) + '</select></label>';
    if (isNew) {
      h += '<label class="field wide"><span>Name of the fund or share</span><input type="text" data-tx="newName" value="' + e(T.newName || '') + '"></label>' +
        '<label class="field"><span>Priced by</span><select data-tx="newSource"><option value="amfi"' + (T.newSource === 'amfi' ? ' selected' : '') + '>Indian mutual fund (ISIN)</option><option value="quote"' + (T.newSource === 'quote' ? ' selected' : '') +
        '>US-listed share or ETF (ticker)</option><option value="none"' + (T.newSource === 'none' ? ' selected' : '') + '>No live price</option></select></label>' +
        (T.newSource === 'none' ? '<span></span>' : '<label class="field"><span>' + (T.newSource === 'quote' ? 'Ticker, such as MSFT' : 'ISIN, 12 characters starting INF') + '</span><input type="text" data-tx="newCode" value="' + e(T.newCode || '') + '"></label>') +
        '<label class="field"><span>Counts as</span><select data-tx="newBucket">' + S.data.buckets.map(function (b) {
          return '<option value="' + e(b.id) + '"' + (T.newBucket === b.id ? ' selected' : '') + '>' + e(b.class === 'debt' ? 'Debt' : 'Equity: ' + b.name) + '</option>'; }).join('') + '</select></label><span></span>';
    }
    if (!isEpf) h += '<div class="field"><span>Type</span><div class="choice">' + [['buy', 'Bought'], ['sell', 'Sold']].map(function (o) {
      return '<label><input type="radio" name="tx-type" data-tx="type" value="' + o[0] + '"' + (T.type === o[0] ? ' checked' : '') + '><span>' + o[1] + '</span></label>'; }).join('') + '</div></div>';
    h += '<label class="field"><span>Date</span><input type="date" data-tx="date" value="' + e(T.date) + '"></label>';
    h += '<label class="field"><span>' + (isEpf ? 'Amount paid in' : 'Amount') + '</span><input type="number" step="any" inputmode="decimal" data-tx="amount" value="' + e(T.amount) + '"><small data-tx-echo>' + (T.amount ? cr(+T.amount) : '') + '</small></label>';
    if (!isEpf) {
      h += '<label class="field"><span>Price or NAV, in rupees</span><input type="number" step="any" inputmode="decimal" data-tx="price" value="' + e(T.price) + '"><small>' +
        (i && latestPrice(i.id) ? 'Latest known: ₹' + App.num(latestPrice(i.id), 4) : '') + '</small></label>' +
        '<label class="field"><span>Units</span><input type="number" step="any" inputmode="decimal" data-tx="units" value="' + e(T.units) + '"><small>' +
        (i ? App.personName(T.person) + ' holds ' + App.num(heldUnits(T.person, i.id) - (T.index != null ? T.origSigned : 0), 3) : '') + '</small></label>' +
        '<p class="field wide dim">Units are worked out as amount ÷ price. Type the units from the statement to correct them; the amount then follows.</p>';
    } else {
      h += '<p class="field wide dim">This records the money going in, for the return calculation. The EPF balance itself is kept under Holdings, where “Update balance” resets it from the passbook.</p>';
    }
    h += '</div><p class="err" id="tx-err" role="alert"></p></div><div class="dlg-foot">' +
      (T.index != null ? '<button type="button" class="btn danger left" data-action="tx-delete">Delete this entry</button>' : '') +
      '<button type="button" class="btn" data-action="dlg-close">Cancel</button>' +
      (T.index == null ? '<button type="button" class="btn" data-action="tx-save" data-more="1">Save and add another</button>' : '') +
      '<button type="button" class="btn primary" data-action="tx-save" data-default>Save</button></div>';
    return h;
  }
  function newTx(keep) {
    var person = (keep && keep.person) || (S.scope !== 'family' ? S.scope : (S.lastPerson || S.data.people[0].id));
    T = { index: null, person: person, id: '', type: 'buy', date: (keep && keep.date) || App.today(), amount: '', price: '', units: '', unitsManual: false,
          newSource: 'amfi', newBucket: (S.data.buckets[0] || {}).id };
  }
  App.actions['tx-add'] = function () { newTx(); App.openDialog(txDialog); };
  App.actions['tx-edit'] = function (el) {
    var k = +el.dataset.i, t = S.data.transactions[k];
    T = { index: k, person: t[1], id: t[2], type: t[3], date: t[0], amount: Math.abs(t[6]), price: t[5] == null ? '' : t[5], units: t[4] == null ? '' : t[4],
          unitsManual: true, origSigned: (t[3] === 'sell' ? -1 : 1) * (+t[4] || 0) };
    App.openDialog(txDialog);
  };
  function txInput(el) {
    var k = el.dataset.tx, v = el.value;
    if (k === 'person' || k === 'id' || k === 'type' || k === 'newSource') {
      T[k] = v;
      if (k === 'id') { var lp = v && v !== '__new' ? latestPrice(v) : null; T.price = lp ? round(lp, 4) : ''; T.units = ''; T.unitsManual = false; if (T.amount && lp) T.units = round(T.amount / lp, 3); }
      if (k === 'person' && T.index == null) T.id = T.id === '__new' ? T.id : T.id;
      App.refreshDialog(); return;
    }
    T[k] = v;
    var a = +T.amount, p = +T.price, u = +T.units, set = function (name, val) { T[name] = val; var x = dlg.querySelector('[data-tx="' + name + '"]'); if (x) x.value = val; };
    if (k === 'amount') { if (T.unitsManual && u > 0) set('price', round(a / u, 4)); else if (p > 0) set('units', a ? round(a / p, 3) : ''); }
    if (k === 'price') { if (T.unitsManual && u > 0) set('amount', round(u * p, 2)); else if (a > 0 && p > 0) set('units', round(a / p, 3)); }
    if (k === 'units') { T.unitsManual = v !== ''; if (u > 0 && p > 0) set('amount', round(u * p, 2)); }
    var echo = dlg.querySelector('[data-tx-echo]'); if (echo) echo.textContent = +T.amount ? cr(+T.amount) : '';
  }
  App.actions['tx-save'] = function (el) {
    var err = function (m) { dlg.querySelector('#tx-err').textContent = m; return false; };
    var id = T.id, a = +T.amount, p = +T.price, u = +T.units;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(T.date)) return err('Enter the date.');
    if (T.date > App.today()) return err('That date is in the future.');
    if (!id) return err('Choose the fund.');
    if (id === '__new') {
      var name = (T.newName || '').trim(), code = (T.newCode || '').trim().toUpperCase();
      if (!name) return err('Give the new fund a name.');
      if (T.newSource === 'amfi' && !/^IN[A-Z0-9]{10}$/.test(code)) return err('An ISIN is 12 characters and starts with IN. It is on the fund’s factsheet and your statement.');
      if (T.newSource === 'quote' && !/^[A-Z.\-]{1,8}$/.test(code)) return err('Enter the ticker, such as MSFT.');
      var b = S.data.buckets.find(function (x) { return x.id === T.newBucket; }) || { id: null, class: 'equity' }, nid = slug(name), n = 2;
      while (instById(nid)) nid = slug(name) + '-' + n++;
      S.data.instruments.push({ id: nid, name: name, class: b.class, bucket: b.id,
        price: T.newSource === 'amfi' ? { type: 'amfi', isin: code } : T.newSource === 'quote' ? { type: 'quote', symbol: code, currency: 'USD' } : null });
      id = T.id = nid;
    }
    var inst = instById(id), row;
    if (inst.class === 'epf') {
      if (!(a > 0)) return err('Enter the amount paid in.');
      row = [T.date, T.person, id, 'buy', null, null, -round(a, 2)];
    } else {
      if (!(a > 0) || !(p > 0) || !(u > 0)) return err('Enter the amount and the price; units are worked out from them.');
      if (T.type === 'sell') {
        var held = heldUnits(T.person, id) - (T.index != null ? T.origSigned : 0);
        if (u > held + 0.01) return err(App.personName(T.person) + ' holds only ' + App.num(held, 3) + ' units of this fund.');
      }
      row = [T.date, T.person, id, T.type, u, p, round(T.type === 'sell' ? a : -a, 2)];
      if (!window.Portfolio.priceOf(Object.assign({}, inst, { manualPrice: 0 }), S.prices || {})) { inst.manualPrice = p; inst.manualPriceDate = T.date; }
    }
    if (T.index != null) S.data.transactions.splice(T.index, 1);
    addTx(row); S.lastPerson = T.person; S.dirty = true; App.recompute();
    if (el.dataset.more) { newTx({ person: T.person, date: T.date }); App.refreshDialog(); App.setStatus('Added. Unsaved changes.'); App.renderChrome(); App.render(); }
    else { App.closeDialog(); App.render(); App.renderChrome(); }
  };
  App.actions['tx-delete'] = function () {
    if (!window.confirm('Delete this entry from the ledger?')) return;
    S.data.transactions.splice(T.index, 1); S.dirty = true; App.recompute(); App.closeDialog(); App.render(); App.renderChrome();
  };

  /* ---------- this month's entries ---------- */
  var M = null;
  function usualEntries() {
    var rec = (S.data.recurring || []).map(function (r) { return { person: r.person, id: r.instrument, amount: r.amount, on: r.on !== false }; });
    if (!rec.length) {            // first use: start from last month's purchases
      var d = App.today().split('-').map(Number), pm = d[1] === 1 ? (d[0] - 1) + '-12' : d[0] + '-' + String(d[1] - 1).padStart(2, '0'), seen = {};
      S.data.transactions.forEach(function (t) {
        if (t[0].slice(0, 7) !== pm || t[3] !== 'buy') return;
        var k = t[1] + '|' + t[2], amt = Math.abs(t[6]);
        if (!seen[k] || amt < seen[k].amount) seen[k] = { person: t[1], id: t[2], amount: Math.round(amt / 10) * 10, on: true };
      });
      rec = Object.keys(seen).map(function (k) { return seen[k]; });
    }
    S.data.accounts.forEach(function (a) {         // EPF contributions that the ledger tracks
      if (!a.ledgerInstrument || !(a.monthly > 0)) return;
      if (!rec.some(function (r) { return r.person === a.person && r.id === a.ledgerInstrument; })) rec.push({ person: a.person, id: a.ledgerInstrument, amount: a.monthly, on: true });
    });
    return rec;
  }
  function monthRow(r) {
    var i = instById(r.id), lp = i && i.class !== 'epf' ? latestPrice(r.id) : null;
    r.epf = !!(i && i.class === 'epf'); r.price = lp ? round(lp, 4) : ''; r.units = lp && r.amount ? round(r.amount / lp, 3) : ''; r.unitsManual = false;
    var ym = M.date.slice(0, 7);
    r.done = S.data.transactions.some(function (t) { return t[0].slice(0, 7) === ym && t[1] === r.person && t[2] === r.id && t[3] === 'buy'; });
    if (r.done) r.on = false;
    return r;
  }
  function monthDialog() {
    var n = M.rows.filter(function (r) { return r.on; }).length;
    var h = head('This month’s entries') + '<div class="dlg-body"><p>Your usual purchases, priced at the latest NAV. Untick what you did not buy, correct amounts or units from the statements, then add them in one go.</p>' +
      '<div class="fields"><label class="field"><span>Date for all of them</span><input type="date" data-m="date" value="' + e(M.date) + '"></label></div>' +
      '<div class="scroll"><table class="edit"><thead><tr><th></th><th>Whose</th><th>Fund</th><th>Amount</th><th>Price</th><th>Units</th><th></th></tr></thead><tbody>';
    M.rows.forEach(function (r, k) {
      h += '<tr><td><input type="checkbox" data-m="on" data-k="' + k + '"' + (r.on ? ' checked' : '') + ' aria-label="Include"></td>' +
        '<td><select class="who" data-m="person" data-k="' + k + '">' + S.data.people.map(function (p) { return '<option value="' + e(p.id) + '"' + (r.person === p.id ? ' selected' : '') + '>' + e(p.name) + '</option>'; }).join('') + '</select></td>' +
        '<td><select data-m="id" data-k="' + k + '">' + fundOptions(r.person, r.id, false) + '</select>' + (r.done ? '<div class="dim">Already entered this month</div>' : '') + '</td>' +
        '<td><input class="w-amt" type="number" step="any" data-m="amount" data-k="' + k + '" value="' + e(r.amount) + '"></td>' +
        '<td>' + (r.epf ? '' : '<input class="w-amt" type="number" step="any" data-m="price" data-k="' + k + '" value="' + e(r.price) + '">') + '</td>' +
        '<td>' + (r.epf ? '' : '<input class="w-amt" type="number" step="any" data-m="units" data-k="' + k + '" value="' + e(r.units) + '">') + '</td>' +
        '<td><button type="button" class="btn small quiet danger" data-action="month-del" data-k="' + k + '">Remove</button></td></tr>';
    });
    h += '</tbody></table></div><p><button type="button" class="btn small" data-action="month-row">Add a line</button></p>' +
      '<label class="check"><input type="checkbox" data-m="remember"' + (M.remember ? ' checked' : '') + '><span>Remember these lines and amounts as the usual entries</span></label>' +
      '<p class="err" id="m-err" role="alert"></p></div><div class="dlg-foot"><button type="button" class="btn" data-action="dlg-close">Cancel</button>' +
      '<button type="button" class="btn primary" data-action="month-save" data-default>Add ' + n + (n === 1 ? ' entry' : ' entries') + '</button></div>';
    return h;
  }
  App.actions['month-entries'] = function () {
    M = { date: App.today(), remember: !(S.data.recurring || []).length, rows: [] };
    M.rows = usualEntries().map(monthRow);
    if (S.scope !== 'family') M.rows.sort(function (a, b) { return (a.person === S.scope ? 0 : 1) - (b.person === S.scope ? 0 : 1); });
    App.openDialog(monthDialog, true);
  };
  App.actions['month-row'] = function () { M.rows.push(monthRow({ person: S.scope !== 'family' ? S.scope : S.data.people[0].id, id: '', amount: '', on: true })); App.refreshDialog(); };
  App.actions['month-del'] = function (el) { M.rows.splice(+el.dataset.k, 1); App.refreshDialog(); };
  function monthInput(el) {
    var k = el.dataset.m, r = el.dataset.k != null ? M.rows[+el.dataset.k] : null, v = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'date') { M.date = v; M.rows.forEach(function (x) { var on = x.on; monthRow(x); if (!x.done) x.on = on; }); App.refreshDialog(); return; }
    if (k === 'remember') { M.remember = v; return; }
    if (k === 'on') { r.on = v; App.refreshDialog(); return; }
    if (k === 'person') { r.person = v; monthRow(r); App.refreshDialog(); return; }
    if (k === 'id') { r.id = v; r.on = true; monthRow(r); App.refreshDialog(); return; }
    r[k] = v;
    var a = +r.amount, p = +r.price, u = +r.units, row = el.closest('tr'), set = function (name, val) { r[name] = val; var x = row.querySelector('[data-m="' + name + '"]'); if (x) x.value = val; };
    if (k === 'amount') { if (r.unitsManual && u > 0) set('price', round(a / u, 4)); else if (p > 0) set('units', a ? round(a / p, 3) : ''); }
    if (k === 'price') { if (r.unitsManual && u > 0) set('amount', round(u * p, 2)); else if (a > 0 && p > 0) set('units', round(a / p, 3)); }
    if (k === 'units') { r.unitsManual = v !== ''; if (u > 0 && p > 0) set('amount', round(u * p, 2)); }
  }
  App.actions['month-save'] = function () {
    var err = function (m) { dlg.querySelector('#m-err').textContent = m; return false; };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(M.date) || M.date > App.today()) return err('Enter a date that is not in the future.');
    var rows = M.rows.filter(function (r) { return r.on; }), out = [];
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k], i = instById(r.id), a = +r.amount, p = +r.price, u = +r.units;
      if (!i) return err('Choose a fund on every ticked line.');
      if (r.epf) { if (!(a > 0)) return err('Enter the amount for ' + i.name + '.'); out.push([M.date, r.person, r.id, 'buy', null, null, -round(a, 2)]); }
      else { if (!(a > 0) || !(p > 0) || !(u > 0)) return err('Enter the amount and price for ' + i.name + '.'); out.push([M.date, r.person, r.id, 'buy', u, p, -round(a, 2)]); }
    }
    if (!out.length) return err('Tick at least one line.');
    out.forEach(addTx);
    if (M.remember) S.data.recurring = M.rows.filter(function (r) { return r.id; }).map(function (r) {
      var keep = r.unitsManual && r.price ? Math.round(+r.amount / 10) * 10 : +r.amount;
      return { person: r.person, instrument: r.id, amount: keep, on: r.on || r.done };
    });
    S.dirty = true; App.recompute(); App.closeDialog(); App.render(); App.renderChrome();
    App.setStatus(out.length + (out.length === 1 ? ' entry' : ' entries') + ' added. Unsaved changes.');
  };

  /* ---------- EPF / PPF balance ---------- */
  App.actions.account = function (el) {
    var k = S.data.accounts.findIndex(function (a) { return a.id === el.dataset.id; }), a = S.data.accounts[k], b = 'accounts.' + k + '.';
    App.openDialog(function () {
      return head(App.personName(a.person) + '’s ' + a.name) + '<div class="dlg-body"><p>Enter the balance from the passbook and its date. From that date the page adds the monthly contribution, and interest if you choose, until you next update it.</p><div class="fields">' +
        App.field('Balance', b + 'balance', { money: 1 }) + App.field('As of', b + 'asOf', { type: 'date' }) +
        App.field('Added to the balance each month', b + 'monthly', { money: 1 }) + App.field('Interest rate', b + 'rate', { type: 'pct' }) +
        App.field('Add estimated interest since that date', b + 'accrue', { type: 'bool', wide: 1 }) + '</div></div>' +
        '<div class="dlg-foot"><button type="button" class="btn primary" data-action="dlg-close" data-default>Done</button></div>';
    });
  };

  /* ---------- settings ---------- */
  var tab = 'data', C = null;
  function connectFields() {
    var f = function (label, key, type, ph) { return '<label class="field"><span>' + label + '</span><input type="' + (type || 'text') + '" data-c="' + key + '" value="' + e(C[key] || '') + '" placeholder="' + e(ph || '') + '" autocomplete="off" spellcheck="false"></label>'; };
    return '<div class="fields">' + f('GitHub user or organisation', 'owner', 'text', 'your-username') + f('Private repository', 'repo', 'text', 'finance-data') +
      f('Branch', 'branch', 'text', 'main') + f('Access token', 'token', 'password', 'github_pat_…') + '</div>';
  }
  function settingsDialog() {
    var cfg = S.cfg || {}, d = S.data, h = head('Settings') + '<div class="dlg-body"><div class="seg" role="group">' +
      [['data', 'Where the data lives'], ['targets', 'Targets'], ['assets', 'Other assets and vests'], ['funds', 'Funds'], ['raw', 'Everything else']].map(function (o) {
        return '<button type="button" data-action="settings-tab" data-t="' + o[0] + '" aria-pressed="' + (tab === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    if (tab === 'data') {
      h += '<h3>' + (cfg.mode === 'github' ? 'Connected to ' + e(cfg.owner + '/' + cfg.repo) : 'Kept in this browser only') + '</h3>' +
        '<p>' + (cfg.mode === 'github' ? 'Holdings and plan are read from and saved to data.json in that private repository. Prices come from prices.json, which the repository’s “Update prices” job rewrites twice a day.'
          : 'Connect a private GitHub repository to use the same data on every device and to get automatic prices.') + '</p>' + connectFields() +
        '<p class="dim">The token is kept in this browser only and is sent only to api.github.com. Use a fine-grained token limited to that one repository, with Contents: read and write.</p><p class="err" id="c-err" role="alert"></p>' +
        '<p><button type="button" class="btn primary" data-action="connect">' + (cfg.mode === 'github' ? 'Reconnect' : 'Connect') + '</button> ' +
        (cfg.mode === 'github' ? '<button type="button" class="btn" data-action="run-prices">Run the price job now</button>' : '') + '</p>' +
        '<h3>Backup</h3><p><button type="button" class="btn" data-action="download">Download the data file</button> <button type="button" class="btn" data-action="open-file">Open a data file</button> ' +
        '<button type="button" class="btn danger" data-action="forget">Sign this browser out</button></p>' +
        '<p class="dim">Opening a file replaces what is on screen; nothing changes in the repository until you save. Signing out removes the token and the cached copy from this browser.</p>';
    }
    if (tab === 'targets') {
      var scopes = [['family', 'Family']].concat(d.people.map(function (p) { return [p.id, p.name]; })), eqB = d.buckets.filter(function (b) { return b.class === 'equity'; });
      h += '<h3>Target allocation</h3><div class="scroll"><table class="edit"><thead><tr><th></th>' + scopes.map(function (s) { return '<th>' + e(s[1]) + ' %</th>'; }).join('') + '</tr></thead><tbody>' +
        ['epf', 'debt', 'equity'].map(function (c) { return '<tr><td>' + App.CLASS[c].name + '</td>' + scopes.map(function (s) { return '<td>' + App.cell('targets.' + s[0] + '.classes.' + c, 'pct', 'w-pct') + '</td>'; }).join('') + '</tr>'; }).join('') +
        '<tr><td colspan="' + (scopes.length + 1) + '" class="dim">Within equity</td></tr>' +
        eqB.map(function (b) { return '<tr><td>' + e(b.name) + '</td>' + scopes.map(function (s) { return '<td>' + App.cell('targets.' + s[0] + '.equity.' + b.id, 'pct', 'w-pct') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
        '<h3>Own investment each month, outside EPF</h3><div class="fields">' + d.people.map(function (p, i) { return App.field(p.name, 'people.' + i + '.monthlySelf', { money: 1 }); }).join('') + '</div>' +
        '<h3>Return you assume for each class</h3><div class="fields three">' + App.field('EPF', 'settings.expectedReturns.epf', { type: 'pct' }) + App.field('PPF', 'settings.expectedReturns.ppf', { type: 'pct' }) +
        App.field('Debt funds', 'settings.expectedReturns.debt', { type: 'pct' }) + App.field('Equity', 'settings.expectedReturns.equity', { type: 'pct' }) +
        App.field('Share of debt funds that is equity', 'settings.debtEquityShare', { type: 'pct' }) + '</div>' +
        '<h3>Glide path</h3><table class="edit"><thead><tr><th>From age</th><th>EPF and PPF %</th><th>Debt %</th><th>Equity %</th><th></th></tr></thead><tbody>' +
        d.glidePath.map(function (_, i) { var b = 'glidePath.' + i + '.'; return '<tr><td>' + App.cell(b + 'age', 'int', 'w-year') + '</td><td>' + App.cell(b + 'epf', 'pct', 'w-pct') + '</td><td>' + App.cell(b + 'debt', 'pct', 'w-pct') + '</td><td>' + App.cell(b + 'equity', 'pct', 'w-pct') +
          '</td><td><button type="button" class="btn small quiet danger" data-action="row-del" data-path="glidePath" data-i="' + i + '">Remove</button></td></tr>'; }).join('') +
        '</tbody></table><p><button type="button" class="btn small" data-action="row-add" data-path="glidePath">Add an age</button></p>';
    }
    if (tab === 'assets') {
      h += '<h3>Other assets</h3><p>Counted in net worth but not in the retirement fund’s allocation.</p><table class="edit"><thead><tr><th>Name</th><th>Value</th><th>In the plan, counts as</th><th></th></tr></thead><tbody>' +
        d.otherAssets.map(function (_, i) { var b = 'otherAssets.' + i + '.'; return '<tr><td>' + App.cell(b + 'name', 'text') + '</td><td>' + App.cell(b + 'value', 'num', 'w-amt') + '</td><td>' +
          App.select(b + 'planAs', [['debt', 'Taxable debt'], ['equity', 'Equity'], ['none', 'Not counted']]) + '</td><td><button type="button" class="btn small quiet danger" data-action="row-del" data-path="otherAssets" data-i="' + i + '">Remove</button></td></tr>'; }).join('') +
        '</tbody></table><p><button type="button" class="btn small" data-action="row-add" data-path="otherAssets">Add an asset</button></p>' +
        '<h3>RSU vests to come</h3><p>Shares after tax withholding. Past dates drop off the list by themselves; record the shares you keep as a transaction.</p><table class="edit"><thead><tr><th>Vest date</th><th>Shares</th><th>Share</th><th></th></tr></thead><tbody>' +
        d.vests.map(function (_, i) { var b = 'vests.' + i + '.'; return '<tr><td>' + App.cell(b + 'date', 'date') + '</td><td>' + App.cell(b + 'shares', 'num', 'w-year') + '</td><td>' +
          App.select(b + 'instrument', d.instruments.filter(function (x) { return x.price && x.price.type === 'quote'; }).map(function (x) { return [x.id, x.name]; })) +
          '</td><td><button type="button" class="btn small quiet danger" data-action="row-del" data-path="vests" data-i="' + i + '">Remove</button></td></tr>'; }).join('') +
        '</tbody></table><p><button type="button" class="btn small" data-action="row-add" data-path="vests">Add a vest</button></p>';
    }
    if (tab === 'funds') {
      h += '<p>Funds with a live price. The price job looks mutual funds up by ISIN and shares by ticker.</p><div class="scroll"><table class="edit"><thead><tr><th>Name</th><th>ISIN or ticker</th><th>Counts as</th></tr></thead><tbody>';
      d.instruments.forEach(function (x, i) {
        if (!x.price) return;
        h += '<tr><td>' + App.cell('instruments.' + i + '.name', 'text') + '</td><td>' + App.cell('instruments.' + i + '.price.' + (x.price.type === 'amfi' ? 'isin' : 'symbol'), 'text', 'w-amt') +
          (x.price.scale ? ' <span class="dim">× ' + App.num(x.price.scale, 4) + '</span>' : '') + '</td><td>' +
          App.select('instruments.' + i + '.bucket', d.buckets.map(function (b) { return [b.id, b.class === 'debt' ? 'Debt' : 'Equity: ' + b.name]; })) + '</td></tr>';
      });
      h += '</tbody></table></div><p class="dim">To add a fund, add a transaction and choose “A new fund or share”. Funds you have sold in full keep their history but need no price.</p>';
    }
    if (tab === 'raw') {
      var rest = {}; Object.keys(d).forEach(function (k) { if (k !== 'transactions') rest[k] = d[k]; });
      h += '<p>The whole data file except the ledger entries, for anything without a form: people, bucket names, price sources and so on.</p>' +
        '<textarea class="json" id="raw-json" spellcheck="false">' + e(JSON.stringify(rest, null, 1)) + '</textarea><p class="err" id="raw-err" role="alert"></p>' +
        '<p><button type="button" class="btn" data-action="raw-apply">Apply these changes</button></p>';
    }
    return h + '</div><div class="dlg-foot"><button type="button" class="btn primary" data-action="dlg-close">Done</button></div>';
  }
  App.actions.settings = function () {
    var cfg = S.cfg || {}; C = { owner: cfg.owner || '', repo: cfg.repo || '', branch: cfg.branch || 'main', token: cfg.token || '' };
    if (!S.data) tab = 'data';
    App.openDialog(S.data ? settingsDialog : function () { return head('Settings') + '<div class="dlg-body"><p>Connect your data first.</p></div>'; }, true);
  };
  App.actions['settings-tab'] = function (el) { tab = el.dataset.t; App.refreshDialog(); };
  App.actions['raw-apply'] = function () {
    var errEl = dlg.querySelector('#raw-err');
    try {
      var o = JSON.parse(dlg.querySelector('#raw-json').value); o.transactions = S.data.transactions;
      S.data = App.normalize(o); S.dirty = true; App.recompute(); errEl.textContent = 'Applied. Save to keep it.';
    } catch (x) { errEl.textContent = 'Not applied: ' + x.message; }
  };
  App.actions['run-prices'] = function () { App.runPriceJob(); };
  App.actions.download = function () {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([App.serialize(S.data)], { type: 'application/json' }));
    a.download = 'data-' + App.today() + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };
  App.actions.forget = function () {
    if (!window.confirm('Remove the access token and the cached copy of your data from this browser? The repository is not touched.' + (S.dirty ? '\n\nYou have unsaved changes that will be lost.' : ''))) return;
    App.forget(); S.dirty = false; location.reload();
  };
  App.actions['open-file'] = function () {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      f.text().then(function (text) {
        var o = JSON.parse(text);
        if (!o.transactions && (o.mf || o.quotes || o.fx)) {          // a prices file
          S.prices = o; try { localStorage.setItem('ledger.prices', text); } catch (x) { /* ignore */ }
          App.recompute(); App.closeDialog(); App.render(); App.setStatus('Prices loaded from ' + f.name); return;
        }
        S.data = App.normalize(o); S.loadError = null;
        if (!S.cfg) App.saveCfg({ mode: 'local' });
        if (S.cfg.mode === 'local') { S.dirty = false; App.recompute(); App.save(); } else { S.dirty = true; App.recompute(); }
        App.closeDialog(); App.render(); App.renderChrome();
      }).catch(function (x) { App.setStatus('Could not read that file: ' + x.message, true); });
    };
    inp.click();
  };
  App.actions.connect = function (el) {
    var root = el.closest('dialog') || document, errEl = root.querySelector('#c-err');
    var cfg = { mode: 'github', owner: (C.owner || '').trim(), repo: (C.repo || '').trim(), branch: (C.branch || 'main').trim() || 'main', token: (C.token || '').trim(), path: 'data.json', pricesPath: 'prices.json' };
    if (!cfg.owner || !cfg.repo || !cfg.token) { errEl.textContent = 'Enter the owner, the repository and the token.'; return; }
    errEl.textContent = 'Connecting…';
    App.ghRead(cfg, cfg.path).then(function (r) {
      var remote = App.normalize(JSON.parse(r.text));
      if (S.data && S.dirty && !window.confirm('Load the data from the repository and drop the unsaved changes on screen?')) { errEl.textContent = ''; return; }
      App.saveCfg(cfg); S.data = remote; S.sha = r.sha; S.dirty = false; S.loadError = null;
      return App.ghRead(cfg, cfg.pricesPath).then(function (p) { S.prices = JSON.parse(p.text); }, function () { /* prices arrive with the first job run */ })
        .then(function () { App.recompute(); App.closeDialog(); App.render(); App.setStatus('Connected to ' + cfg.owner + '/' + cfg.repo); App.renderChrome(); });
    }).catch(function (x) {
      if (x.status === 404 && S.data && window.confirm('That repository has no data.json yet (or the token cannot see it).\n\nCreate data.json there from the data on screen?')) {
        return App.ghWrite(cfg, cfg.path, App.serialize(S.data), null, 'Create ledger data').then(function (sha) {
          App.saveCfg(cfg); S.sha = sha; S.dirty = false; App.closeDialog(); App.render(); App.setStatus('Created data.json in ' + cfg.owner + '/' + cfg.repo); App.renderChrome();
        }).catch(function (y) { errEl.textContent = y.message; });
      }
      errEl.textContent = x.message || 'Could not connect.';
    });
  };

  /* ---------- first run ---------- */
  App.viewWelcome = function (error) {
    if (!C) { var cfg = S.cfg || {}; C = { owner: cfg.owner || '', repo: cfg.repo || '', branch: cfg.branch || 'main', token: cfg.token || '' }; }
    return '<div class="welcome"><h2>Connect your data</h2><p>This page holds no numbers of its own. It reads your holdings and plan from a private GitHub repository, using an access token that stays in this browser.</p>' +
      connectFields() + '<p class="err" id="c-err" role="alert">' + e(error || '') + '</p><p><button type="button" class="btn primary" data-action="connect">Connect</button></p>' +
      '<p>No repository yet? <button type="button" class="linkbtn" data-action="open-file">Open a data file</button> to keep everything in this browser, and connect later from Settings.</p>' +
      '<ol><li>Create a private repository and add data.json, prices.json and the price job from the setup folder.</li>' +
      '<li>On GitHub, open Settings, Developer settings, Fine-grained tokens. Create a token for that repository only, with Contents: read and write.</li>' +
      '<li>Enter the details above. Do this once on each device.</li></ol></div>';
  };

  App.dialogInput = function (el) {
    if (el.dataset.tx) return txInput(el), true;
    if (el.dataset.m) return monthInput(el), true;
    if (el.dataset.c) { C[el.dataset.c] = el.value; return true; }
    return false;
  };
})();
