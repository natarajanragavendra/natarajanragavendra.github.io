/* Portfolio tab. */
(function () {
  'use strict';
  var App = window.App, S = App.state, e = App.esc, cr = App.cr, inr = App.inr, pct = App.pct;
  var CLASS = { epf: { n: '1', name: 'EPF and PPF' }, debt: { n: '2', name: 'Debt funds' }, equity: { n: '3', name: 'Equity' } };
  App.CLASS = CLASS;

  function personName(id) { var p = S.data.people.find(function (x) { return x.id === id; }); return p ? p.name : id; }
  function bucketName(id) { var b = S.data.buckets.find(function (x) { return x.id === id; }); return b ? b.name : id; }
  App.personName = personName; App.bucketName = bucketName;
  function gain(v) { return '<span class="' + (v >= 0 ? 'up' : 'down') + '">' + App.signed(v, cr) + '</span>'; }
  function driftBar(share, target, n) {
    var max = Math.max(share || 0, target || 0, 0.01) * 1.15;
    return '<div class="drift" role="img" aria-label="' + pct(share) + ' against a target of ' + pct(target) + '"><i class="c-' + n + '" data-w="' + (share / max * 100).toFixed(2) +
      '"></i>' + (target != null ? '<b data-x="' + (target / max * 100).toFixed(2) + '"></b>' : '') + '</div>';
  }

  function hero() {
    var pf = S.pf, nw = pf.netWorth, target = S.target, F = pf.scopes.family, P = S.data.settings.projection;
    var full = Math.max(nw, target, 1), share = target > 0 ? nw / target : null, fillX = nw / full * 100, tx = target / full * 100;
    var pr = window.Portfolio.project({ start: nw, target: target, monthly: pf.monthly.family.total, returnRate: P.returnRate,
      targetGrowth: P.targetGrowth, vests: P.includeVests ? pf.vests : [], today: pf.today });
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
    h += '<dl class="facts">' +
      fact('Retirement fund', cr(F.total), 'EPF, PPF, debt and equity') +
      (pf.otherAssets ? fact('Other assets', cr(pf.otherAssets), S.data.otherAssets.map(function (a) { return a.name; }).join(', ')) : '') +
      fact(nw >= target ? 'Ahead by' : 'Still to go', cr(Math.abs(target - nw)), 'in today’s money') +
      (pf.usdInr ? fact('Net worth in dollars', '$' + (nw / pf.usdInr / 1e6).toFixed(3) + ' M', 'at ₹' + pf.usdInr.toFixed(2) + ' to the dollar') : '') +
      fact('Return so far', pct(F.xirr.all), 'XIRR on money in the ledger') +
      fact('Going in each month', cr(pf.monthly.family.total), cr(pf.monthly.family.total * 12) + ' a year') + '</dl>';
    var assume = 'At ' + pct(P.returnRate, 1).replace('.0%', '%') + ' a year and ' + cr(pf.monthly.family.total) + ' a month' +
      (P.includeVests && pf.vests.length ? ', with RSU vests added at today’s share price' : '') + ', against a target growing ' + pct(P.targetGrowth, 1).replace('.0%', '%') + ' a year';
    h += '<p class="proj">' + (nw >= target ? 'You are past the target today. ' : (pr.reached
      ? assume + ', you cross it in <b>' + App.month(pr.year, pr.month) + '</b>, ' + (pr.months >= 24 ? (pr.months / 12).toFixed(1) + ' years' : pr.months + ' months') + ' from now. '
      : assume + ', you do not cross it within 60 years. ')) +
      '<button type="button" class="linkbtn" data-action="toggle-proj">' + (S.showProj ? 'Hide the path' : 'Show the path and change these assumptions') + '</button></p>';
    if (S.showProj) {
      h += '<div class="inline-form">' + App.field('Return a year', 'settings.projection.returnRate', { type: 'pct', rerender: 1 }) +
        App.field('Target grows a year', 'settings.projection.targetGrowth', { type: 'pct', rerender: 1 }) +
        App.field('Add RSU vests', 'settings.projection.includeVests', { type: 'bool', rerender: 1 }) + '</div>' +
        '<div class="legend"><span><i class="swatch c-3"></i>Net worth</span><span><i class="swatch c-none"></i>Target (dashed)</span></div><div class="chart" id="proj-chart"></div>';
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
    var t = (S.data.targets[sid] || {}), tc = t.classes || {}, te = t.equity || {}, h = '', tot = s.total;
    h += '<section class="block"><header><h2>Allocation</h2><span class="sub">The bar is where you are; the tick is the target</span></header><div class="scroll"><table>' +
      '<thead><tr><th>Asset class</th><th class="n">Value</th><th class="n">Share</th><th class="n">Target</th><th></th><th class="n">To reach target</th></tr></thead><tbody>';
    ['epf', 'debt', 'equity'].forEach(function (c) {
      var v = s.classes[c], share = tot > 0 ? v / tot : 0, tg = tc[c];
      h += '<tr><td><i class="swatch c-' + CLASS[c].n + '"></i>' + CLASS[c].name + '</td><td class="n">' + cr(v) + '</td><td class="n">' + pct(share) + '</td><td class="n">' + pct(tg) +
        '</td><td class="driftcell">' + driftBar(share, tg, CLASS[c].n) + '</td><td class="n">' + (tg != null ? App.signed(tg * tot - v, cr) : '') + '</td></tr>';
    });
    h += '<tr class="total"><td>Total</td><td class="n">' + cr(tot) + '</td><td class="n">100%</td><td class="n">' + pct((tc.epf || 0) + (tc.debt || 0) + (tc.equity || 0), 0) + '</td><td></td><td></td></tr>';
    var eq = s.classes.equity, ids = S.data.buckets.filter(function (b) { return b.class === 'equity' && ((s.buckets[b.id] || 0) > 0 || te[b.id] > 0); });
    if (ids.length) {
      h += '<tr class="group"><td colspan="6">Within equity</td></tr>';
      ids.forEach(function (b) {
        var v = s.buckets[b.id] || 0, share = eq > 0 ? v / eq : 0, tg = te[b.id] || 0, x = s.bucketXirr[b.id];
        h += '<tr class="sub"><td>' + e(b.name) + (x != null ? ' <span class="dim">' + pct(x) + ' XIRR</span>' : '') + '</td><td class="n">' + cr(v) + '</td><td class="n">' + pct(share) + '</td><td class="n">' + pct(tg) +
          '</td><td class="driftcell">' + driftBar(share, tg, '3') + '</td><td class="n">' + App.signed(tg * eq - v, cr) + '</td></tr>';
      });
    }
    h += '</tbody></table></div>';
    var des = S.data.settings.debtEquityShare || 0;
    if (des && tot > 0) h += '<p class="dim">Effective equity is ' + pct((s.classes.equity + des * s.classes.debt) / tot) + ', counting ' + pct(des, 0) + ' of the debt funds as equity.</p>';
    return h + '</section>';
  }

  function holdings(s, sid) {
    var h = '<section class="block"><header><h2>Holdings</h2><span class="sub">' + (S.pf.latestPrice ? 'Prices as of ' + App.date(S.pf.latestPrice) : '') + '</span>' +
      '<span class="right"><button type="button" class="btn small" data-action="reload-prices">Reload prices</button></span></header><div class="scroll"><table>' +
      '<thead><tr><th>Fund</th><th class="n">Units</th><th class="n">Price</th><th class="n">Value</th><th class="n">Put in</th><th class="n">Gain</th><th class="n">XIRR</th></tr></thead><tbody>';
    ['equity', 'debt'].forEach(function (c) {
      var rows = s.holdings.filter(function (x) { return x.class === c; }); if (!rows.length) return;
      h += '<tr class="group"><td colspan="3"><i class="swatch c-' + CLASS[c].n + '"></i>' + CLASS[c].name + '</td><td class="n">' + cr(s.classes[c]) + '</td><td colspan="2"></td><td class="n">' + pct(s.xirr[c]) + '</td></tr>';
      rows.forEach(function (x) {
        h += '<tr><td>' + e(x.name) + (x.bucket && c === 'equity' ? ' <span class="dim">' + e(bucketName(x.bucket)) + '</span>' : '') + '</td><td class="n">' + App.num(x.units, 3) + '</td><td class="n">' +
          (x.price ? '₹' + App.num(x.price, x.price > 1000 ? 2 : 4) + (x.native ? ' <span class="dim">$' + App.num(x.native, 2) + '</span>' : '') : '<span class="down">no price</span>') +
          '</td><td class="n">' + cr(x.value) + '</td><td class="n">' + cr(x.invested) + '</td><td class="n">' + gain(x.gain) + '</td><td class="n">' + pct(x.xirr) + '</td></tr>';
      });
    });
    if (s.accounts.length) {
      h += '<tr class="group"><td colspan="3"><i class="swatch c-1"></i>EPF and PPF</td><td class="n">' + cr(s.classes.epf) + '</td><td colspan="2"></td><td class="n">' + pct(s.xirr.epf) + '</td></tr>';
      s.accounts.forEach(function (a) {
        var parts = a.asOf ? cr(a.base) + ' on ' + App.date(a.asOf) + (a.contributions ? ', plus ' + cr(a.contributions) + ' paid in since' : '') + (a.interest ? ' and about ' + cr(a.interest) + ' interest' : '')
          : 'Balance as last entered';
        h += '<tr><td>' + e(a.name) + (sid === 'family' ? ' <span class="dim">' + e(personName(a.person)) + '</span>' : '') + '</td><td colspan="2" class="dim">' + e(parts) + '</td><td class="n">' + cr(a.value) +
          '</td><td colspan="3" class="n"><button type="button" class="btn small" data-action="account" data-id="' + e(a.id) + '">Update balance</button></td></tr>';
      });
    }
    return h + '</tbody></table></div></section>';
  }

  function returns(s) {
    var closedGain = S.pf.closed.filter(function (c) { return S.scope === 'family' || c.person === S.scope; });
    var h = '<section class="block"><header><h2>Returns</h2></header><table><tbody>' +
      '<tr><td>Put in, net of withdrawals</td><td class="n">' + cr(s.invested) + '</td></tr>' +
      '<tr><td>Worth now <span class="dim">funds, shares and tracked EPF</span></td><td class="n">' + cr(s.trackedValue) + '</td></tr>' +
      '<tr><td>Profit</td><td class="n">' + gain(s.profit) + ' <span class="dim">' + pct(s.invested > 0 ? s.profit / s.invested : null, 0) + '</span></td></tr>' +
      '<tr><td>XIRR, everything</td><td class="n">' + pct(s.xirr.all) + '</td></tr>' +
      '<tr><td>XIRR, equity</td><td class="n">' + pct(s.xirr.equity) + '</td></tr>' +
      '<tr><td>XIRR, debt funds</td><td class="n">' + pct(s.xirr.debt) + '</td></tr>' +
      (s.xirr.epf != null ? '<tr><td>XIRR, EPF</td><td class="n">' + pct(s.xirr.epf) + '</td></tr>' : '') +
      '<tr><td>Expected from here <span class="dim">your assumed return for each class, weighted</span></td><td class="n">' + pct(s.expectedReturn) + '</td></tr>' +
      '</tbody></table>' + (closedGain.length ? '<p class="dim">Includes ' + closedGain.length + ' funds sold in full, which made ' +
        cr(closedGain.reduce(function (t, c) { return t + c.gain; }, 0)) + ' between them. PPF is left out because its deposits are not in the ledger.</p>' : '') + '</section>';
    return h;
  }
  function byYear() { return '<section class="block"><header><h2>Put in each year</h2><span class="sub">Net of withdrawals</span></header><div class="chart" id="year-chart"></div></section>'; }

  function monthly(sid) {
    var m = S.pf.monthly, cols = sid === 'family' ? S.data.people.map(function (p) { return p.id; }).concat(['family']) : [sid];
    var row = function (label, f, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + '</td>' + cols.map(function (c) { return '<td class="n">' + f(m[c]) + '</td>'; }).join('') + '</tr>'; };
    var h = '<section class="block"><header><h2>What goes in each month</h2><span class="sub">Your own investment, split by your targets</span></header><div class="scroll"><table><thead><tr><th></th>' +
      cols.map(function (c) { return '<th class="n">' + e(c === 'family' ? 'Family' : personName(c)) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += row('<i class="swatch c-1"></i>EPF, from salary', function (x) { return inr(x.epf); });
    h += row('<i class="swatch c-2"></i>Debt funds', function (x) { return inr(x.debt); });
    S.data.buckets.filter(function (b) { return b.class === 'equity'; }).forEach(function (b) {
      h += row('<i class="swatch c-3"></i>' + e(b.name), function (x) { return x.buckets[b.id] ? inr(x.buckets[b.id]) : '–'; });
    });
    h += row('Total a month', function (x) { return inr(x.total); }, 'total') + row('Total a year', function (x) { return cr(x.total * 12); });
    return h + '</tbody></table></div></section>';
  }

  function vests() {
    var v = S.pf.vests; if (!v.length) return '';
    return '<section class="block"><header><h2>RSU vests to come</h2><span class="sub">After tax, at today’s share price</span></header><table><thead><tr><th>Vests</th><th class="n">Shares</th><th class="n">Worth today</th></tr></thead><tbody>' +
      v.map(function (x) { return '<tr><td>' + App.date(x.date) + '</td><td class="n">' + App.num(x.shares) + '</td><td class="n">' + cr(x.value) + '</td></tr>'; }).join('') +
      '<tr class="total"><td>Total</td><td class="n">' + App.num(v.reduce(function (t, x) { return t + x.shares; }, 0)) + '</td><td class="n">' + cr(v.reduce(function (t, x) { return t + (x.value || 0); }, 0)) + '</td></tr></tbody></table></section>';
  }
  function glide() {
    var g = S.data.glidePath; if (!g.length) return '';
    var age = S.plan.age, cur = null; g.forEach(function (r) { if (r.age <= age) cur = r; });
    var des = S.data.settings.debtEquityShare || 0;
    return '<section class="block"><header><h2>Glide path</h2><span class="sub">Planned targets by age; you are ' + age + '</span></header><table><thead><tr><th>From age</th><th class="n">EPF and PPF</th><th class="n">Debt</th><th class="n">Equity</th><th class="n">Effective equity</th></tr></thead><tbody>' +
      g.map(function (r) { return '<tr' + (r === cur ? ' class="now"' : '') + '><td>' + r.age + '</td><td class="n">' + pct(r.epf, 0) + '</td><td class="n">' + pct(r.debt, 0) + '</td><td class="n">' + pct(r.equity, 0) + '</td><td class="n">' + pct(r.equity + des * r.debt) + '</td></tr>'; }).join('') +
      '</tbody></table></section>';
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
    var fundOpts = Object.keys(funds).map(function (id) { return [id, inst[id] ? inst[id].name : id]; }).sort(function (a, b) { return a[1] < b[1] ? -1 : 1; });
    var h = '<section class="block" id="ledger"><header><h2>Ledger</h2><span class="sub">' + App.num(rows.length) + ' entries</span><span class="right">' +
      '<select data-action-change="ledger-filter" data-key="fund" aria-label="Fund"><option value="">All funds</option>' + fundOpts.map(function (o) { return '<option value="' + e(o[0]) + '"' + (L.fund === o[0] ? ' selected' : '') + '>' + e(o[1]) + '</option>'; }).join('') + '</select>' +
      '<select data-action-change="ledger-filter" data-key="year" aria-label="Year"><option value="">All years</option>' + Object.keys(years).sort().reverse().map(function (y) { return '<option' + (L.year === y ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select>' +
      '</span></header>';
    if (!rows.length) return h + '<p class="empty">No entries match. Add one with “Add a transaction”.</p></section>';
    h += '<div class="scroll"><table><thead><tr><th>Date</th>' + (sid === 'family' ? '<th>Who</th>' : '') + '<th>Fund</th><th>Type</th><th class="n">Units</th><th class="n">Price</th><th class="n">Amount</th><th></th></tr></thead><tbody>';
    rows.slice(0, L.limit).forEach(function (r) {
      var t = r[1], i = inst[t[2]] || { name: t[2], class: '' }, isEpf = i.class === 'epf';
      h += '<tr><td>' + App.date(t[0]) + '</td>' + (sid === 'family' ? '<td>' + e(personName(t[1])) + '</td>' : '') + '<td>' + e(i.name) + '</td><td>' + (isEpf ? 'Paid in' : t[3] === 'sell' ? 'Sold' : 'Bought') +
        '</td><td class="n">' + (t[4] != null ? App.num(t[4], 3) : '') + '</td><td class="n">' + (t[5] != null ? App.num(t[5], 4) : '') + '</td><td class="n">' + inr(Math.abs(t[6])) +
        '</td><td class="n"><button type="button" class="btn small quiet" data-action="tx-edit" data-i="' + r[0] + '">Edit</button></td></tr>';
    });
    h += '</tbody></table></div>';
    if (rows.length > L.limit) h += '<p><button type="button" class="btn small" data-action="ledger-more">Show ' + Math.min(100, rows.length - L.limit) + ' more</button></p>';
    return h + '</section>';
  }

  App.viewPortfolio = function () {
    var sid = S.scope, s = S.pf.scopes[sid] || S.pf.scopes.family;
    var seg = '<div class="seg" role="group" aria-label="Whose holdings">' + [['family', 'Family']].concat(S.data.people.map(function (p) { return [p.id, p.name]; })).map(function (o) {
      return '<button type="button" data-action="scope" data-scope="' + e(o[0]) + '" aria-pressed="' + (sid === o[0]) + '">' + e(o[1]) + '</button>'; }).join('') + '</div>';
    return hero() + notes() + '<div class="bar-row">' + seg + '<span class="grow"></span>' +
      '<button type="button" class="btn" data-action="month-entries">This month’s entries</button>' +
      '<button type="button" class="btn primary" data-action="tx-add">Add a transaction</button></div>' +
      allocation(s, sid) + holdings(s, sid) + '<div class="cols">' + returns(s) + byYear() + '</div>' + monthly(sid) +
      '<div class="cols">' + vests() + glide() + '</div>' + ledger(sid);
  };
  App.afterPortfolio = function (root) {
    var s = S.pf.scopes[S.scope] || S.pf.scopes.family, ys = Object.keys(s.byYear).sort();
    var yc = root.querySelector('#year-chart');
    if (yc) App.barChart(yc, { title: 'Money put in each year', labels: ys, series: [{ name: 'Put in', cls: 'f-one', values: ys.map(function (y) { return s.byYear[y]; }) }],
      fmt: function (v) { return cr(v, v >= 1e7 ? 1 : 0); }, labelEvery: 1, height: 250 });
    var pc = root.querySelector('#proj-chart'), pr = S.projection;
    if (pc && pr) {
      var pts = pr.path.filter(function (p, i) { return i % Math.max(1, Math.ceil(pr.path.length / 120)) === 0 || i === pr.path.length - 1; })
        .map(function (p) { return { label: App.month(p.year, p.month), a: p.value, b: p.target }; });
      App.lineChart(pc, { title: 'Net worth against the growing target', points: pts, names: ['Net worth', 'Target'], fmt: function (v) { return cr(v, 1); } });
    }
  };

  App.actions.scope = function (el) { S.scope = el.dataset.scope; S.ledger.limit = 30; S.ledger.fund = ''; App.render(); };
  App.actions['toggle-proj'] = function () { S.showProj = !S.showProj; App.render(); };
  App.actions['ledger-more'] = function () { S.ledger.limit += 100; App.render(); };
  App.actions['ledger-filter'] = function (el) { S.ledger[el.dataset.key] = el.value; S.ledger.limit = 30; App.render(); };
  App.actions['reload-prices'] = function () { App.reloadPrices(); };
})();
