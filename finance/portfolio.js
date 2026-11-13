/* Portfolio engine: holdings from the ledger, prices, allocation, XIRR, projection.
 * Works in the browser (window.Portfolio) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Portfolio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 86400000;
  var UNIT_EPS = 0.01;   // residual units below this count as a closed holding

  function parseDate(s) {
    var p = String(s).split('-');
    return Date.UTC(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  /* Whole months from a to b, like DATEDIF(a, b, "M"). */
  function monthsBetween(a, b) {
    var x = String(a).split('-').map(Number), y = String(b).split('-').map(Number);
    var m = (y[0] - x[0]) * 12 + (y[1] - x[1]);
    if ((y[2] || 1) < (x[2] || 1)) m -= 1;
    return Math.max(0, m);
  }

  /* XIRR as Sheets and Excel define it: sum of a / (1+r)^((t - t0)/365) = 0. */
  function xirr(flows) {
    var f = flows.filter(function (x) { return x.a && isFinite(x.a); });
    if (f.length < 2) return null;
    var pos = false, neg = false, t0 = Infinity;
    f.forEach(function (x) { if (x.a > 0) pos = true; else neg = true; if (x.t < t0) t0 = x.t; });
    if (!pos || !neg) return null;
    var ys = f.map(function (x) { return (x.t - t0) / DAY / 365; });
    function npv(r) { var s = 0; for (var i = 0; i < f.length; i++) s += f[i].a / Math.pow(1 + r, ys[i]); return s; }
    function dnpv(r) { var s = 0; for (var i = 0; i < f.length; i++) s -= ys[i] * f[i].a / Math.pow(1 + r, ys[i] + 1); return s; }
    var r = 0.1, i, v, dv, nr;
    for (i = 0; i < 60; i++) {
      v = npv(r); dv = dnpv(r);
      if (!isFinite(v) || !isFinite(dv) || dv === 0) break;
      nr = r - v / dv;
      if (!(nr > -0.999999)) break;
      if (Math.abs(nr - r) < 1e-10) return nr;
      r = nr;
    }
    var lo = -0.9999, hi = 10, flo = npv(lo), fhi = npv(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2, fm = npv(mid);
      if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
      if (hi - lo < 1e-10) break;
    }
    return (lo + hi) / 2;
  }

  /* Price of one unit in rupees, from the prices file. A fund the price job has not
   * seen yet falls back to the price typed in with its last transaction. */
  function priceOf(inst, prices) {
    prices = prices || {};
    var p = inst.price, live = null;
    if (p && p.type === 'amfi') {
      var m = (prices.mf || {})[p.isin];
      if (m && m.nav > 0) live = { price: +m.nav, date: m.date || null, source: 'AMFI' };
    } else if (p && p.type === 'quote') {
      var q = (prices.quotes || {})[p.symbol];
      if (q && q.price > 0) {
        var cur = q.currency || p.currency || 'USD', f = cur === 'INR' ? { rate: 1 } : (prices.fx || {})[cur + 'INR'];
        if (f && f.rate > 0) live = { price: q.price * (p.scale || 1) * f.rate, date: q.date || null, source: p.symbol, native: q.price * (p.scale || 1), currency: cur, fx: +f.rate };
      }
    }
    if (live) return live;
    if (inst.manualPrice > 0) return { price: +inst.manualPrice, date: inst.manualPriceDate || null, source: 'manual' };
    return null;
  }

  /* EPF / PPF balance today: last known balance, plus contributions since,
   * plus (optionally) interest estimated at the account's rate. */
  function accountValue(acc, today) {
    var base = +acc.balance || 0;
    if (!acc.asOf) return { value: base, base: base, contributions: 0, interest: 0, months: 0 };
    var m = monthsBetween(acc.asOf, today), monthly = +acc.monthly || 0, contrib = monthly * m, interest = 0;
    if (acc.accrue && acc.rate > 0 && m > 0) {
      var rm = Math.pow(1 + acc.rate, 1 / 12) - 1;
      interest = base * (Math.pow(1 + rm, m) - 1);
      for (var k = 1; k <= m; k++) interest += monthly * (Math.pow(1 + rm, m - k) - 1);
    }
    return { value: base + contrib + interest, base: base, contributions: contrib, interest: interest, months: m };
  }

  function emptyScope(id, name) {
    return { id: id, name: name, classes: { epf: 0, debt: 0, equity: 0 }, buckets: {}, holdings: [], accounts: [],
             total: 0, flows: { all: [], equity: [], debt: [], epf: [] }, bucketFlows: {}, byYear: {}, missingPrices: [] };
  }

  function compute(data, prices, today) {
    today = today || todayStr();
    var tNow = parseDate(today);
    var inst = {}; (data.instruments || []).forEach(function (i) { inst[i.id] = i; });
    var people = data.people || [];
    var scopes = { family: emptyScope('family', 'Family') };
    people.forEach(function (p) { scopes[p.id] = emptyScope(p.id, p.name); });
    var pos = {};   // person|instrument -> position

    (data.transactions || []).forEach(function (tx) {
      var date = tx[0], person = tx[1], id = tx[2], type = tx[3], units = +tx[4] || 0, amount = +tx[6] || 0;
      var i = inst[id]; if (!i || !scopes[person]) return;
      var key = person + '|' + id;
      var p = pos[key] || (pos[key] = { person: person, id: id, units: 0, net: 0, flows: [], first: date, last: date, count: 0 });
      p.units += type === 'sell' ? -units : units;
      p.net += amount; p.count++; if (date > p.last) p.last = date; if (date < p.first) p.first = date;
      var t = parseDate(date), fl = { t: t, a: amount }, year = date.slice(0, 4);
      p.flows.push(fl);
      [scopes[person], scopes.family].forEach(function (s) {
        s.flows.all.push(fl);
        (s.flows[i.class] || (s.flows[i.class] = [])).push(fl);
        if (i.bucket) (s.bucketFlows[i.bucket] || (s.bucketFlows[i.bucket] = [])).push(fl);
        s.byYear[year] = (s.byYear[year] || 0) - amount;
      });
    });

    var latestPrice = null;
    Object.keys(pos).forEach(function (key) {
      var p = pos[key], i = inst[p.id];
      if (i.class === 'epf' || Math.abs(p.units) < UNIT_EPS) { p.closed = i.class !== 'epf'; return; }
      var pr = priceOf(i, prices);
      p.priceInfo = pr; p.price = pr ? pr.price : null; p.value = pr ? pr.price * p.units : 0;
      if (pr && pr.date && (!latestPrice || pr.date > latestPrice)) latestPrice = pr.date;
      var h = { person: p.person, id: p.id, name: i.name, class: i.class, bucket: i.bucket || null, units: p.units,
                price: p.price, priceDate: pr ? pr.date : null, priceSource: pr ? pr.source : null, native: pr ? pr.native : null,
                value: p.value, invested: -p.net, gain: p.value + p.net,
                xirr: pr ? xirr(p.flows.concat([{ t: tNow, a: p.value }])) : null };
      scopes[p.person].holdings.push(h);
      if (!pr) { scopes[p.person].missingPrices.push(i.name); if (scopes.family.missingPrices.indexOf(i.name) < 0) scopes.family.missingPrices.push(i.name); }
    });

    /* Closed positions: money in and out of funds no longer held. */
    var closed = [];
    Object.keys(pos).forEach(function (key) {
      var p = pos[key]; if (!p.closed) return;
      closed.push({ person: p.person, id: p.id, name: inst[p.id].name, class: inst[p.id].class, gain: p.net,
                    first: p.first, last: p.last, xirr: xirr(p.flows) });
    });

    /* Family holdings: the same fund held by both people becomes one line. */
    var fam = {};
    people.forEach(function (pp) {
      scopes[pp.id].holdings.forEach(function (h) {
        var f = fam[h.id];
        if (!f) { f = fam[h.id] = Object.assign({}, h, { person: 'family', flows: [] }); f.units = 0; f.value = 0; f.invested = 0; f.gain = 0; }
        f.units += h.units; f.value += h.value; f.invested += h.invested; f.gain += h.gain;
        f.flows = f.flows.concat(pos[pp.id + '|' + h.id].flows);
      });
    });
    Object.keys(fam).forEach(function (id) {
      var f = fam[id];
      f.xirr = f.price ? xirr(f.flows.concat([{ t: tNow, a: f.value }])) : null;
      delete f.flows; scopes.family.holdings.push(f);
    });

    /* EPF and PPF accounts. */
    (data.accounts || []).forEach(function (a) {
      var v = accountValue(a, today), s = scopes[a.person]; if (!s) return;
      var hasLedger = !!(a.ledgerInstrument && pos[a.person + '|' + a.ledgerInstrument]);
      var row = Object.assign({}, a, v, { inXirr: hasLedger });
      s.accounts.push(row); scopes.family.accounts.push(row);
    });

    Object.keys(scopes).forEach(function (sid) {
      var s = scopes[sid];
      s.holdings.forEach(function (h) {
        s.classes[h.class] = (s.classes[h.class] || 0) + h.value;
        if (h.bucket) s.buckets[h.bucket] = (s.buckets[h.bucket] || 0) + h.value;
      });
      var epfInXirr = 0;
      s.accounts.forEach(function (a) { s.classes.epf += a.value; if (a.inXirr) epfInXirr += a.value; });
      s.epf = s.accounts.filter(function (a) { return a.kind === 'EPF'; }).reduce(function (t, a) { return t + a.value; }, 0);
      s.ppf = s.accounts.filter(function (a) { return a.kind !== 'EPF'; }).reduce(function (t, a) { return t + a.value; }, 0);
      s.total = s.classes.epf + s.classes.debt + s.classes.equity;
      s.holdings.sort(function (a, b) { return b.value - a.value; });
      var term = function (v) { return [{ t: tNow, a: v }]; };
      /* Value that has matching cash flows in the ledger (PPF, and EPF without ledger rows, are left out). */
      s.trackedValue = s.classes.equity + s.classes.debt + epfInXirr;
      s.invested = -s.flows.all.reduce(function (t, f) { return t + f.a; }, 0);
      s.profit = s.trackedValue - s.invested;
      s.xirr = {
        all: xirr(s.flows.all.concat(term(s.trackedValue))),
        equity: xirr(s.flows.equity.concat(term(s.classes.equity))),
        debt: xirr(s.flows.debt.concat(term(s.classes.debt))),
        epf: epfInXirr > 0 ? xirr(s.flows.epf.concat(term(epfInXirr))) : null,
        debtAndEpf: xirr(s.flows.debt.concat(s.flows.epf, term(s.classes.debt + epfInXirr)))
      };
      s.bucketXirr = {};
      Object.keys(s.bucketFlows).forEach(function (b) {
        if (s.buckets[b] > 0) s.bucketXirr[b] = xirr(s.bucketFlows[b].concat(term(s.buckets[b])));
      });
      var er = (data.settings || {}).expectedReturns || {};
      s.expectedReturn = s.total > 0
        ? (s.epf * (er.epf || 0) + s.ppf * (er.ppf || 0) + s.classes.debt * (er.debt || 0) + s.classes.equity * (er.equity || 0)) / s.total
        : null;
      delete s.flows; delete s.bucketFlows;
    });

    /* Monthly investment, split the way the sheet does it: EPF is fixed, and each
     * person's own investment is divided between debt and equity by their targets. */
    var monthly = { family: { self: 0, epf: 0, debt: 0, equity: 0, total: 0, buckets: {} } };
    people.forEach(function (pp) {
      var t = ((data.targets || {})[pp.id]) || {}, c = t.classes || {}, self = +pp.monthlySelf || 0;
      var epf = (data.accounts || []).filter(function (a) { return a.person === pp.id; })
        .reduce(function (s, a) { return s + (a.monthlyCounted !== undefined ? +a.monthlyCounted : (+a.monthly || 0)); }, 0);
      var den = (c.debt || 0) + (c.equity || 0);
      var debt = den > 0 ? self * (c.debt || 0) / den : 0, equity = self - debt, b = {};
      Object.keys(t.equity || {}).forEach(function (k) { b[k] = equity * t.equity[k]; });
      monthly[pp.id] = { self: self, epf: epf, debt: debt, equity: equity, total: self + epf, buckets: b };
      var f = monthly.family; f.self += self; f.epf += epf; f.debt += debt; f.equity += equity; f.total += self + epf;
      Object.keys(b).forEach(function (k) { f.buckets[k] = (f.buckets[k] || 0) + b[k]; });
    });

    var other = (data.otherAssets || []).reduce(function (t, a) { return t + (+a.value || 0); }, 0);
    var otherDebt = (data.otherAssets || []).filter(function (a) { return a.planAs === 'debt'; })
      .reduce(function (t, a) { return t + (+a.value || 0); }, 0);
    var otherEquity = (data.otherAssets || []).filter(function (a) { return a.planAs === 'equity'; })
      .reduce(function (t, a) { return t + (+a.value || 0); }, 0);
    var F = scopes.family, fxr = ((prices || {}).fx || {}).USDINR;

    /* RSU vests still to come, at today's price. */
    var vests = (data.vests || []).filter(function (v) { return v.date >= today; }).map(function (v) {
      var i = inst[v.instrument], pr = i ? priceOf(i, prices) : null;
      return { date: v.date, shares: +v.shares, instrument: v.instrument, value: pr ? pr.price * v.shares : null };
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    return {
      today: today, scopes: scopes, closed: closed, monthly: monthly, vests: vests,
      otherAssets: other, netWorth: F.total + other, liquidNetWorth: F.total + other - F.classes.epf,
      usdInr: fxr && fxr.rate > 0 ? +fxr.rate : null, latestPrice: latestPrice, pricesUpdated: (prices || {}).updated || null,
      /* What the retirement plan takes as "current investments". */
      planInputs: { equity: F.classes.equity + otherEquity, debt: F.classes.debt + otherDebt, taxFree: F.ppf, epf: F.epf }
    };
  }

  /* When does the portfolio cross a target that itself grows every year? Monthly steps. */
  function project(o) {
    var v = +o.start, target = +o.target, c = +o.monthly || 0;
    var mr = Math.pow(1 + o.returnRate, 1 / 12) - 1, mg = Math.pow(1 + (o.targetGrowth || 0), 1 / 12) - 1;
    var mstep = o.stepUp || 0, d = String(o.today).split('-').map(Number), y = d[0], m = d[1];
    var vests = {};
    (o.vests || []).forEach(function (x) { if (x.value) { var k = x.date.slice(0, 7); vests[k] = (vests[k] || 0) + x.value; } });
    var path = [{ year: y, month: m, value: v, target: target }], n = 0;
    while (v < target && n < 720) {
      m++; if (m > 12) { m = 1; y++; if (mstep) c *= 1 + mstep; }
      n++;
      v = v * (1 + mr) + c + (vests[y + '-' + String(m).padStart(2, '0')] || 0);
      target = target * (1 + mg);
      path.push({ year: y, month: m, value: v, target: target });
    }
    return { reached: v >= target, months: n, year: y, month: m, value: v, target: target, path: path };
  }

  return { compute: compute, xirr: xirr, project: project, priceOf: priceOf, accountValue: accountValue,
           monthsBetween: monthsBetween, parseDate: parseDate, todayStr: todayStr };
});
