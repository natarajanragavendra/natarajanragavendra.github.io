/* Portfolio tab. */
(function () {
  'use strict';
  var App = window.App, S = App.state, e = App.esc, cr = App.cr, inr = App.inr, pct = App.pct;
  var CLASS = { epf: { n: '1', name: 'EPF and PPF' }, debt: { n: '2', name: 'Debt funds' }, equity: { n: '3', name: 'Equity' } };
  App.CLASS = CLASS;

  function personName(id) { var p = S.data.people.find(function (x) { return x.id === id; }); return p ? p.name : id; }
  /* Fund names without the plan suffixes every one of them carries. */
  function short(name) { return String(name).replace(/\s+Growth\s+Direct\s+Plan$/i, '').replace(/\s+(Growth|Direct)\s+Plan$/i, ''); }
  function bucketName(id) { var b = S.data.buckets.find(function (x) { return x.id === id; }); return b ? b.name : id; }
  App.personName = personName; App.bucketName = bucketName;
  function driftBar(share, target, n) {
    var max = Math.max(share || 0, target || 0, 0.01) * 1.15;
    return '<div class="drift" role="img" aria-label="' + pct(share) + ' against a target of ' + pct(target) + '"><i class="c-' + n + '" data-w="' + (share / max * 100).toFixed(2) +
      '"></i>' + (target != null ? '<b data-x="' + (target / max * 100).toFixed(2) + '"></b>' : '') + '</div>';
  }

  function hero() {
    var pf = S.pf, nw = pf.netWorth, target = S.target, F = pf.scopes.family, P = S.data.settings.projection;
    var full = Math.max(nw, target, 1), share = target > 0 ? nw / target : null, fillX = nw / full * 100, tx = target / full * 100;
    var years = Math.min(30, Math.max(1, Math.round(+P.years || 4)));
    /* RSUs: the vests listed in Settings, then a flat yearly amount each August after the last of them. */
    var futureRsu = P.futureRsu == null ? 3000000 : Math.max(0, +P.futureRsu || 0);
    var lastVest = pf.vests.reduce(function (y, x) { return Math.max(y, +x.date.slice(0, 4)); }, 0);
    var rsuFrom = Math.max(lastVest, +pf.today.slice(0, 4) - (+pf.today.slice(5, 7) < 8 ? 1 : 0)) + 1;
    var vestPlan = [];
    if (P.includeVests) {
      vestPlan = pf.vests.slice();
      if (futureRsu > 0) for (var vy = rsuFrom; vy <= rsuFrom + 60; vy++) vestPlan.push({ date: vy + '-08-15', value: futureRsu });
    }
    var pr = window.Portfolio.project({ start: nw, target: target, monthly: pf.monthly.family.total, returnRate: P.returnRate,
      targetGrowth: P.targetGrowth, stepUp: +P.stepUp || 0, vests: vestPlan, today: pf.today, years: years });
    S.projection = pr;
    var line = nw >= target
      ? 'You have <b>' + cr(nw) + '</b>, past the <b>' + cr(target) + '</b> your plan needs today.'
      : 'You have <b>' + cr(nw) + '</b> of the <b>' + cr(target) + '</b> your plan needs today.';
    var h = '<section class="hero"><p class="hero-line">' + line + '</p>' +
      '<div class="rail" role="img" aria-label="' + pct(share) + ' of the target">' +
      '<div class="rail-track"><div class="rail-fill" data-w="' + fillX.toFixed(2) + '"></div></div>' +
      '<span class="rail-mark" data-x="' + Math.min(tx, 99.8).toFixed(2) + '"></span>' +
      '<span class="rail-label' + (tx > 85 ? ' end' : '') + '" data-x="' + tx.toFixed(2) + '">Target today ' + cr(target) + '</span>' +
      '<span class="rail-note' + (fillX > 20 ? ' end' : '') + '" data-x="' + fillX.toFixed(2) + '">' + pct(share) + ' there</span></div>';
    var when = nw >= target ? 'Already there' : pr.reached ? App.month(pr.year, pr.month) : 'Not within 60 years';
    h += '<dl class="facts">' + fact(nw >= target ? 'Target' : 'You cross the target', when, nw < target && pr.reached ? (pr.months >= 24 ? (pr.months / 12).toFixed(1) + ' years' : pr.months + ' months') + ' from now' : '') +
      fact('Return so far', pct(F.xirr.all), 'a year') +
      (pf.usdInr ? fact('In dollars', '$' + (nw / pf.usdInr / 1e6).toFixed(2) + ' M', '') : '') + '</dl>';
    h += '<p class="proj"><button type="button" class="linkbtn" data-action="toggle-proj" aria-expanded="' + !!S.showProj + '">' + (S.showProj ? 'Hide the path' : 'Show the path and its assumptions') + '</button></p>';
    if (S.showProj) {
      h += '<div class="inline-form">' + App.field('Return a year', 'settings.projection.returnRate', { type: 'pct', rerender: 1 }) +
        App.field('Target grows a year', 'settings.projection.targetGrowth', { type: 'pct', rerender: 1 }) +
        App.field('Step-up each April', 'settings.projection.stepUp', { type: 'pct', rerender: 1, value: +P.stepUp || 0 }) +
        App.field('Years to show', 'settings.projection.years', { type: 'int', rerender: 1, value: years }) +
        (P.includeVests ? App.field('RSUs a year from ' + rsuFrom, 'settings.projection.futureRsu', { money: 1, rerender: 1, value: futureRsu }) : '') +
        App.field('Add RSU vests', 'settings.projection.includeVests', { type: 'bool', rerender: 1 }) + '</div>' +
        '<div class="legend"><span><i class="swatch c-3"></i>Net worth</span><span><i class="swatch c-none"></i>Target (dashed)</span></div><div class="chart" id="proj-chart"></div>';
      var end = pr.end;
      h += '<p class="dim">' + e(assume) + '. By ' + App.month(end.year, end.month) + ': ' + cr(end.value) + ', ' + pct(end.value / end.target, 0) + ' of the target then.</p>';
    }
    return h + '</section>';
  }
  function fact(label, value, small) { return '<div class="fact"><dt>' + e(label) + '</dt><dd>' + value + (small ? '<small>' + e(small) + '</small>' : '') + '</dd></div>'; }

  function notes() {
    var h = '', pf = S.pf, P = S.prices;
    if (S.loadError) h += '<p class="note">' + e(S.loadError) + ' <button type="button" class="linkbtn" data-action="reload">Try again</button></p>';
    if (!P) h += '<p class="note">No prices are loaded, so fund values show as zero. In the private repository, run the “Update prices” job under Actions, then reload.</p>';
    else if (P.errors && P.errors.length) h += '<p class="note">The last price run could not refresh everything, so older prices are in use for those: ' + e(P.errors.join(' | ')) + '</p>';
    var miss = pf.scopes.family.missingPrices;
    if (P && miss.length) h += '<p class="note">No price yet for ' + e(miss.join(', ')) + '. They count as zero until the next price run.</p>';
    var py = S.data.plan.planYear, ty = +pf.today.slice(0, 4);
    if (py < ty) h += '<p class="note">The retirement plan is still set to ' + py + '. Update the plan year and today’s expenses on the Retirement plan tab.</p>';
    return h;
  }

  function allocation(s, sid) {
    var t = (S.data.targets[sid] || {}), tc = t.classes || {}, te = t.equity || {}, tot = s.total;
    var row = function (cls, name, v, share, tg, n) {
      return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + name + '</td><td class="n">' + cr(v) + '</td><td class="n">' + pct(share, 0) + '</td><td class="n dim">' + pct(tg, 0) +
        '</td><td class="driftcell">' + driftBar(share, tg, n) + '</td></tr>';
    };
    var h = '<section class="block"><header><h2>Allocation</h2><span class="sub">Bar: today’s weight. Tick: target.</span></header><div class="scroll"><table>' +
      '<thead><tr><th></th><th class="n">Value</th><th class="n">Weight</th><th class="n">Target</th><th></th></tr></thead><tbody>';
    ['epf', 'debt', 'equity'].forEach(function (c) {
      h += row('', '<i class="swatch c-' + CLASS[c].n + '"></i>' + CLASS[c].name, s.classes[c], tot > 0 ? s.classes[c] / tot : 0, tc[c], CLASS[c].n);
    });
    var eq = s.classes.equity, ids = S.data.buckets.filter(function (b) { return b.class === 'equity' && ((s.buckets[b.id] || 0) > 0 || te[b.id] > 0); });
    if (ids.length) {
      h += '<tr class="group"><td colspan="5">Within equity</td></tr>';
      ids.forEach(function (b) { var v = s.buckets[b.id] || 0; h += row('sub', e(b.name), v, eq > 0 ? v / eq : 0, te[b.id] || 0, '3'); });
    }
    return h + '</tbody></table></div></section>';
  }

  function holdings(s, sid) {
    var tot = s.total, w = function (v) { return tot > 0 ? pct(v / tot, 1) : '–'; };
    var h = '<section class="block"><header><h2>Holdings</h2><span class="sub">' + (S.pf.latestPrice ? 'Prices of ' + App.date(S.pf.latestPrice) : '') + '</span>' +
      '<span class="right"><button type="button" class="btn small quiet" data-action="reload-prices">Reload prices</button></span></header><div class="scroll"><table>' +
      '<thead><tr><th></th><th class="n">Value</th><th class="n">Weight</th><th class="n">XIRR</th></tr></thead><tbody>';
    ['equity', 'debt'].forEach(function (c) {
      var rows = s.holdings.filter(function (x) { return x.class === c; }); if (!rows.length) return;
      h += '<tr class="group"><td><i class="swatch c-' + CLASS[c].n + '"></i>' + CLASS[c].name + '</td><td class="n">' + cr(s.classes[c]) + '</td><td class="n">' + w(s.classes[c]) + '</td><td class="n">' + pct(s.xirr[c]) + '</td></tr>';
      rows.forEach(function (x) {
        var young = x.first && window.Portfolio.monthsBetween(x.first, S.pf.today) < 12;
        h += '<tr><td>' + e(short(x.name)) + (x.price ? '' : ' <span class="down">no price</span>') + '</td><td class="n">' + cr(x.value) + '</td><td class="n">' + w(x.value) + '</td><td class="n">' +
          (young ? '<span class="dim" title="Held for under a year">new</span>' : pct(x.xirr)) + '</td></tr>';
      });
    });
    if (s.accounts.length) {
      h += '<tr class="group"><td><i class="swatch c-1"></i>EPF and PPF</td><td class="n">' + cr(s.classes.epf) + '</td><td class="n">' + w(s.classes.epf) + '</td><td class="n">' + pct(s.xirr.epf) + '</td></tr>';
      s.accounts.forEach(function (a) {
        h += '<tr><td>' + e(a.name) + (sid === 'family' ? ' <span class="dim">' + e(personName(a.person)) + '</span>' : '') +
          ' <button type="button" class="linkbtn small" data-action="account" data-id="' + e(a.id) + '">Update</button></td><td class="n">' + cr(a.value) + '</td><td class="n">' + w(a.value) + '</td><td></td></tr>';
      });
    }
    return h + '</tbody></table></div></section>';
  }

  /* A section that starts closed; its open state survives re-rendering (see App.render). */
  function fold(id, title, sub, body) {
    return '<details class="block fold" id="' + id + '"><summary><h2>' + e(title) + '</h2>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</summary>' + body + '</details>';
  }

  function monthly(sid) {
    var m = S.pf.monthly, cols = sid === 'family' ? S.data.people.map(function (p) { return p.id; }).concat(['family']) : [sid];
    var row = function (label, f, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + '</td>' + cols.map(function (c) { return '<td class="n">' + f(m[c]) + '</td>'; }).join('') + '</tr>'; };
    var h = '<div class="scroll"><table><thead><tr><th></th>' +
      cols.map(function (c) { return '<th class="n">' + e(c === 'family' ? 'Family' : personName(c)) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += row('<i class="swatch c-1"></i>EPF, from salary', function (x) { return inr(x.epf); });
    h += row('<i class="swatch c-2"></i>Debt funds', function (x) { return inr(x.debt); });
    S.data.buckets.filter(function (b) { return b.class === 'equity'; }).forEach(function (b) {
      h += row('<i class="swatch c-3"></i>' + e(b.name), function (x) { return x.buckets[b.id] ? inr(x.buckets[b.id]) : '–'; });
    });
    h += row('Total', function (x) { return inr(x.total); }, 'total');
    return fold('monthly', 'Monthly investment', cr(m.family.total) + ' a month, split by your targets', h + '</tbody></table></div>');
  }

  function vests() {
    var v = S.pf.vests; if (!v.length) return '';
    var total = v.reduce(function (t, x) { return t + (x.value || 0); }, 0);
    return fold('vests', 'RSU vests to come', cr(total) + ' at today’s price, after tax', '<table><thead><tr><th>Vests</th><th class="n">Shares</th><th class="n">Worth today</th></tr></thead><tbody>' +
      v.map(function (x) { return '<tr><td>' + App.date(x.date) + '</td><td class="n">' + App.num(x.shares) + '</td><td class="n">' + cr(x.value) + '</td></tr>'; }).join('') + '</tbody></table>');
  }
  function glide() {
    var g = S.data.glidePath; if (!g.length) return '';
    var age = S.plan.age, cur = null; g.forEach(function (r) { if (r.age <= age) cur = r; });
    return fold('glide', 'Glide path', 'Targets by age; you are ' + age, '<table><thead><tr><th>From age</th><th class="n">EPF and PPF</th><th class="n">Debt</th><th class="n">Equity</th></tr></thead><tbody>' +
      g.map(function (r) { return '<tr' + (r === cur ? ' class="now"' : '') + '><td>' + r.age + '</td><td class="n">' + pct(r.epf, 0) + '</td><td class="n">' + pct(r.debt, 0) + '</td><td class="n">' + pct(r.equity, 0) + '</td></tr>'; }).join('') +
      '</tbody></table>');
  }

  function ledger(sid) {
    var L = S.ledger, inst = {}, tx = S.data.transactions, rows = [], years = {}, funds = {};
    S.data.instruments.forEach(function (i) { inst[i.id] = i; });
    for (var k = tx.length - 1; k >= 0; k--) {
      var t = tx[k];
      if (sid !== 'family' && t[1] !== sid) continue;
      years[t[0].slice(0, 4)] = 1; funds[t[2]] = 1;
      if (L.fund && t[2] !== L.fund) continue;
      if (L.year && t[0].slice(0, 4) !== L.year) continue;
      rows.push([k, t]);
    }
    var fundOpts = Object.keys(funds).map(function (id) { return [id, inst[id] ? short(inst[id].name) : id]; }).sort(function (a, b) { return a[1] < b[1] ? -1 : 1; });
    var h = '<div class="filters">' +
      '<select data-action-change="ledger-filter" data-key="fund" aria-label="Fund"><option value="">All funds</option>' + fundOpts.map(function (o) { return '<option value="' + e(o[0]) + '"' + (L.fund === o[0] ? ' selected' : '') + '>' + e(o[1]) + '</option>'; }).join('') + '</select>' +
      '<select data-action-change="ledger-filter" data-key="year" aria-label="Year"><option value="">All years</option>' + Object.keys(years).sort().reverse().map(function (y) { return '<option' + (L.year === y ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select>' +
      '</div>';
    var sub = App.num(rows.length) + ' entries' + (L.fund || L.year ? ', filtered' : '');
    if (!rows.length) return fold('ledger', 'Ledger', sub, h + '<p class="empty">No entries match. Add one with “Add a transaction”.</p>');
    var b = '<div class="scroll"><table class="wide"><thead><tr><th>Date</th>' + (sid === 'family' ? '<th>Who</th>' : '') + '<th>Fund</th><th>Type</th><th class="n">Units</th><th class="n">Price</th><th class="n">Amount</th><th></th></tr></thead><tbody>';
    rows.slice(0, L.limit).forEach(function (r) {
      var t = r[1], i = inst[t[2]] || { name: t[2], class: '' }, isEpf = i.class === 'epf';
      b += '<tr><td class="nowrap">' + App.date(t[0]) + '</td>' + (sid === 'family' ? '<td>' + e(personName(t[1])) + '</td>' : '') + '<td>' + e(short(i.name)) + '</td><td>' + (isEpf ? 'Paid in' : t[3] === 'sell' ? 'Sold' : 'Bought') +
        '</td><td class="n">' + (t[4] != null ? App.num(t[4], 3) : '') + '</td><td class="n">' + (t[5] != null ? App.num(t[5], 4) : '') + '</td><td class="n">' + inr(Math.abs(t[6])) +
        '</td><td class="n"><button type="button" class="btn small quiet" data-action="tx-edit" data-i="' + r[0] + '">Edit</button></td></tr>';
    });
    b += '</tbody></table></div>';
    if (rows.length > L.limit) b += '<p><button type="button" class="btn small" data-action="ledger-more">Show ' + Math.min(100, rows.length - L.limit) + ' more</button></p>';
    return fold('ledger', 'Ledger', sub, h + b);
  }

  App.viewPortfolio = function () {
    var sid = S.scope, s = S.pf.scopes[sid] || S.pf.scopes.family;
    var seg = '<div class="seg" role="group" aria-label="Whose holdings">' + [['family', 'Family']].concat(S.data.people.map(function (p) { return [p.id, p.name]; })).map(function (o) {
      return '<button type="button" data-action="scope" data-scope="' + e(o[0]) + '" aria-pressed="' + (sid === o[0]) + '">' + e(o[1]) + '</button>'; }).join('') + '</div>';
    return hero() + notes() + '<div class="bar-row">' + seg + '<span class="grow"></span>' +
      '<button type="button" class="btn" data-action="month-entries">This month’s entries</button>' +
      '<button type="button" class="btn primary" data-action="tx-add">Add a transaction</button></div>' +
      allocation(s, sid) + holdings(s, sid) + monthly(sid) + vests() + glide() + ledger(sid);
  };
  App.afterPortfolio = function (root) {
    var pc = root.querySelector('#proj-chart'), pr = S.projection;
    if (pc && pr) {
      var step = Math.max(1, Math.ceil((pr.path.length - 1) / 120)), mi = -1, pts = [];
      pr.path.forEach(function (p, i) {
        if (i % step && i !== pr.path.length - 1) return;
        pts.push({ label: App.month(p.year, p.month), a: p.value, b: p.target });
      });
      if (pr.crossIndex) mi = Math.min(pts.length - 1, Math.round(pr.crossIndex / step));
      var monthsPerLabel = 12 * Math.max(1, Math.ceil((pr.path.length - 1) / 72));
      App.lineChart(pc, { title: 'Net worth against the growing target', points: pts, names: ['Net worth', 'Target'], fmt: function (v) { return cr(v, 1); },
        height: 240, labelEvery: Math.max(1, Math.round(monthsPerLabel / step)),
        marker: mi > 0 ? { i: mi, label: 'Crosses ' + App.month(pr.year, pr.month) } : null });
    }
  };

  App.actions.scope = function (el) { S.scope = el.dataset.scope; S.ledger.limit = 30; S.ledger.fund = ''; App.render(); };
  App.actions['toggle-proj'] = function () { S.showProj = !S.showProj; App.render(); };
  App.actions['ledger-more'] = function () { S.ledger.limit += 100; App.render(); };
  App.actions['ledger-filter'] = function (el) { S.ledger[el.dataset.key] = el.value; S.ledger.limit = 30; App.render(); };
  App.actions['reload-prices'] = function () { App.reloadPrices(); };
})();
