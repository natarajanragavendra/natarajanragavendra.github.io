/* Retirement plan tab: inputs on the left, results on the right. */
(function () {
  'use strict';
  var App = window.App, S = App.state, e = App.esc, cr = App.cr, pct = App.pct, F = App.field;

  function box(title, body, open) { return '<details' + (open ? ' open' : '') + '><summary>' + e(title) + '</summary><div class="body">' + body + '</div></details>'; }
  function removeBtn(path, i, what) { return '<button type="button" class="btn small quiet danger" data-action="row-del" data-path="' + path + '" data-i="' + i + '" aria-label="Remove ' + e(what) + '">Remove</button>'; }

  function inputs() {
    var p = S.data.plan, linked = !!(p.current && p.current.linked), live = S.pf.planInputs, h = '';
    h += box('The two of you', '<div class="fields">' +
      F('Plan year', 'plan.planYear', { type: 'int', hint: 'Expenses are in this year’s rupees' }) +
      F('Year of birth', 'plan.birthYear', { type: 'int', hint: 'Age ' + S.plan.age + ' this year' }) +
      F('Freedom at age', 'plan.fiAge', { type: 'int', hint: 'You stop adding money' }) +
      F('Start drawing at', 'plan.withdrawAge', { type: 'int', nullable: 1, placeholder: 'same', hint: 'Blank if the same age' }) +
      F('Plan until age', 'plan.lifeExpectancy', { type: 'int', hint: 'In the younger spouse’s years' }) + '</div>', true);
    h += box('Spending, in today’s rupees', '<div class="fields">' +
      F('Each month', 'plan.monthlyExpenses', { money: 1 }) + F('Each year, on top', 'plan.annualExpenses', { money: 1 }) + '</div>', true);
    h += box('Inflation and returns', '<div class="fields three">' +
      F('Inflation before', 'plan.inflationPre', { type: 'pct' }) + F('Inflation after', 'plan.inflationPost', { type: 'pct' }) +
      F('Return in retirement', 'plan.returnPost', { type: 'pct' }) + F('Equity', 'plan.returnEquity', { type: 'pct' }) +
      F('Taxable debt', 'plan.returnDebt', { type: 'pct' }) + F('PPF', 'plan.returnTaxFree', { type: 'pct' }) + '</div>' +
      '<p class="dim">Returns are after tax. Before and after refer to retirement.</p>');
    var cur = function (label, key) {
      return linked ? F(label, 'plan.current.' + key, { disabled: 1, value: Math.round(live[key]), hint: cr(live[key]) }) : F(label, 'plan.current.' + key, { money: 1 });
    };
    h += box('What you have now', '<div class="fields">' + F('Use live holdings from the Portfolio tab', 'plan.current.linked', { type: 'bool', wide: 1, rerender: 1 }) +
      cur('Equity', 'equity') + cur('Taxable debt', 'debt') + cur('PPF', 'taxFree') + cur('EPF', 'epf') +
      F('Lump sum at retirement', 'plan.lumpSum', { money: 1 }) + '</div>' +
      (linked ? '<p class="dim">Taxable debt includes other assets you have marked as debt.</p>' : ''));
    h += box('EPF and new investments', '<div class="fields">' +
      F('EPF going in each month', 'plan.epfMonthly', { money: 1 }) + F('It grows each year by', 'plan.epfGrowth', { type: 'pct' }) +
      F('EPF return', 'plan.epfReturn', { type: 'pct' }) + F('Equity share of new money', 'plan.investEquityShare', { type: 'pct' }) +
      F('Yearly step-up', 'plan.investStepUp', { type: 'pct' }) + F('PPF going in each month', 'plan.taxFreeMonthly', { money: 1 }) +
      F('Safety buffer on the corpus', 'plan.buffer', { type: 'pct' }) + '</div>');

    var g = '<div class="scroll"><table class="edit"><thead><tr><th>Goal</th><th>For</th><th>Year</th><th>Cost today</th><th>Rises %</th><th>In plan</th><th></th></tr></thead><tbody>';
    (p.goals || []).forEach(function (_, i) {
      var b = 'plan.goals.' + i + '.';
      g += '<tr><td>' + App.cell(b + 'name', 'text') + '</td><td>' + App.cell(b + 'group', 'text', 'w-amt') + '</td><td>' + App.cell(b + 'year', 'int', 'w-year') + '</td><td>' + App.cell(b + 'cost', 'num', 'w-amt') +
        '</td><td>' + App.cell(b + 'inflation', 'pct', 'w-pct') + '</td><td>' + App.cell(b + 'include', 'bool') + '</td><td>' + removeBtn('plan.goals', i, 'goal') + '</td></tr>';
    });
    g += '</tbody></table></div><p><button type="button" class="btn small" data-action="row-add" data-path="plan.goals">Add a goal</button></p>';
    h += box('Goals', g);

    var s = '<div class="scroll"><table class="edit"><thead><tr><th>Name</th><th>Kind</th><th>A month today</th><th>Rises %</th><th>From</th><th>Until</th><th></th></tr></thead><tbody>';
    (p.streams || []).forEach(function (_, i) {
      var b = 'plan.streams.' + i + '.';
      s += '<tr><td>' + App.cell(b + 'name', 'text') + '</td><td>' + App.select(b + 'kind', [['expense', 'Expense'], ['income', 'Income']]) + '</td><td>' + App.cell(b + 'monthly', 'num', 'w-amt') +
        '</td><td>' + App.cell(b + 'growth', 'pct', 'w-pct') + '</td><td>' + App.cell(b + 'startYear', 'int', 'w-year', ' data-nullable="1" placeholder="' + S.plan.retirementYear + '"') +
        '</td><td>' + App.cell(b + 'endYear', 'int', 'w-year', ' data-nullable="1" placeholder="' + S.plan.endYear + '"') + '</td><td>' + removeBtn('plan.streams', i, 'row') + '</td></tr>';
    });
    s += '</tbody></table></div><p><button type="button" class="btn small" data-action="row-add" data-path="plan.streams">Add income or an expense</button></p>' +
      '<p class="dim">Rent, an annuity, school fees, travel: anything that runs for some years of retirement. Blank years mean from retirement, or to the end.</p>';
    h += box('Income and expenses in retirement', s);

    var bk = '<table class="edit"><thead><tr><th>Bucket</th><th>Years</th><th>Equity %</th></tr></thead><tbody>';
    for (var i = 0; i < 11; i++) bk += '<tr><td>' + i + '</td><td>' + (i === 0 ? '<input class="w-year" disabled value="' + S.plan.buckets[0].tenure + '">' : App.cell('plan.bucketTenures.' + i, 'int', 'w-year')) +
      '</td><td>' + (i < 2 ? '<span class="dim">Debt only</span>' : App.cell('plan.bucketEquity.' + i, 'pct', 'w-pct')) + '</td></tr>';
    bk += '</tbody></table><p class="dim">The workbook’s design. Lengthen the early buckets to hold less equity. The money inside a bucket is assumed to earn the debt return less ' +
      pct(p.ladderSpread, 0) + '.</p>';
    h += box('Bucket design', bk);
    return h;
  }

  function fact(label, value, small) { return '<div class="fact"><dt>' + e(label) + '</dt><dd>' + value + (small ? '<small>' + e(small) + '</small>' : '') + '</dd></div>'; }

  function outputs() {
    var r = S.plan, p = r.inputs, own = S.pf.monthly.family.self, h = '';
    h += '<section class="hero"><p class="hero-line">' + (r.yearsToRetirement > 0
      ? 'At ' + r.fiAge + ', in ' + r.retirementYear + ', you need <b>' + cr(r.corpusBucket) + '</b>. That is <b>' + cr(r.corpusToday) + '</b> in today’s money, and you have <b>' + pct(r.achieved, 0) + '</b> of it.'
      : 'You need <b>' + cr(r.corpusBucket) + '</b> today, and you have <b>' + pct(r.achieved, 0) + '</b> of it.') + '</p>' +
      '<dl class="facts">' + fact('Monthly spending then', cr(r.firstYearMonthly), cr(r.monthlyExpensesToday) + ' today') +
      fact('Years to go', String(r.yearsToRetirement), 'then ' + r.yearsInRetirement + ' years, to ' + p.lifeExpectancy) +
      fact('Without buckets', cr(r.corpusConstant), 'buckets cut the corpus by ' + pct(r.bucketSaving)) +
      fact('Target on the Portfolio tab', cr(r.corpusToday), 'discounted at ' + pct(p.returnPost, 0) + ' a year') + '</dl></section>';

    var gap = r.gapBucket, f = r.future;
    h += '<section class="block"><header><h2>Are you on track?</h2></header><table><tbody>' +
      '<tr><td>Equity you hold <span class="dim">grows at ' + pct(p.returnEquity, 0) + '</span></td><td class="n">' + cr(f.equity) + '</td></tr>' +
      '<tr><td>Taxable debt <span class="dim">' + pct(p.returnDebt, 0) + '</span></td><td class="n">' + cr(f.debt) + '</td></tr>' +
      '<tr><td>PPF <span class="dim">' + pct(p.returnTaxFree, 0) + '</span></td><td class="n">' + cr(f.taxFree) + '</td></tr>' +
      '<tr><td>EPF balance <span class="dim">' + pct(p.epfReturn) + '</span></td><td class="n">' + cr(f.epfBalance) + '</td></tr>' +
      '<tr><td>EPF still to be paid in</td><td class="n">' + cr(f.epfContributions) + '</td></tr>' +
      (f.lumpSum ? '<tr><td>Lump sum</td><td class="n">' + cr(f.lumpSum) + '</td></tr>' : '') +
      '<tr class="total"><td>What you already have becomes, by ' + r.retirementYear + '</td><td class="n">' + cr(f.total) + '</td></tr>' +
      '<tr><td>Corpus needed</td><td class="n">' + cr(r.corpusBucket) + '</td></tr>' +
      '<tr class="total"><td>' + (gap > 0 ? 'Gap for new investments to fill' : 'Surplus before any new investment') + '</td><td class="n"><span class="' + (gap > 0 ? '' : 'up') + '">' + cr(Math.abs(gap)) + '</span></td></tr>' +
      '</tbody></table>';
    if (gap > 0) {
      h += '<p>That needs <b>' + cr(r.monthlyBucket) + ' a month</b> outside EPF (' + cr(r.monthlyEquity) + ' in equity, ' + cr(r.monthlyDebt) + ' in debt), or ' + cr(r.monthlyTotalInvest) +
        ' counting EPF. ' + (own > 0 ? 'You put in ' + cr(own) + ' a month yourselves, ' + (own >= r.monthlyBucket ? 'which covers it.' : 'which is ' + cr(r.monthlyBucket - own) + ' short.') : '') +
        ' <span class="dim">A plain single-return plan would need ' + cr(r.monthlyConstant) + ' a month; buckets lower that by ' + pct(r.stressReduction, 0) + '.</span></p>';
    } else h += '<p>What you already hold is projected to cover the corpus with no further investment.</p>';
    h += '</section>';

    h += '<section class="block"><header><h2>What the corpus pays out</h2><span class="right"><span class="seg" role="group" aria-label="Rupee basis">' +
      '<button type="button" data-action="cash-mode" data-mode="today" aria-pressed="' + (S.cashMode === 'today') + '">Today’s rupees</button>' +
      '<button type="button" data-action="cash-mode" data-mode="future" aria-pressed="' + (S.cashMode !== 'today') + '">Rupees of the year</button></span></span></header>' +
      '<div class="legend"><span><i class="swatch c-1"></i>Living expenses</span><span><i class="swatch c-2"></i>Goals</span><span><i class="swatch c-3"></i>Other expenses, net of income</span></div>' +
      '<div class="chart" id="cash-chart"></div>';
    var early = r.goals.filter(function (g) { return g.fundedBy === 'income'; });
    if (early.length) h += '<p class="dim">Paid from income before retirement, so not in the corpus: ' +
      early.map(function (g) { return e(g.name) + ' in ' + g.year + ' (' + cr(g.futureCost) + ')'; }).join(', ') + '.</p>';
    h += '<details><summary class="linkbtn">Show as a table</summary><div class="scroll"><table><thead><tr><th>Year</th><th class="n">Age</th><th class="n">Living</th><th class="n">Goals</th><th class="n">Other</th><th class="n">From the corpus</th></tr></thead><tbody>' +
      cashRows().map(function (x) { return '<tr><td>' + x.year + '</td><td class="n">' + x.age + '</td><td class="n">' + cr(x.living) + '</td><td class="n">' + (x.goals ? cr(x.goals) + ' <span class="dim">' + e(x.names.join(', ')) + '</span>' : '–') +
        '</td><td class="n">' + (x.other ? cr(x.other) : '–') + '</td><td class="n">' + cr(x.total) + '</td></tr>'; }).join('') + '</tbody></table></div></details></section>';

    var a = r.atRetirement, act = r.buckets.filter(function (b) { return b.active; });
    h += '<section class="block"><header><h2>Buckets at retirement</h2><span class="sub">How the ' + cr(r.corpusBucket) + ' is set aside in ' + r.retirementYear + '</span></header><div class="scroll"><table>' +
      '<thead><tr><th>Bucket</th><th>Pays for</th><th>Held in</th><th class="n">Set aside</th><th class="n">Pays out</th><th class="n">Return</th><th>Filled by what you have?</th></tr></thead><tbody>';
    act.forEach(function (b) {
      var c = b.coverWithEpf, split = b.index === 2 || b.index === 3 ? ' <span class="dim">' + cr(b.debtPart) + ' debt, ' + cr(b.equityPart) + ' equity</span>' : '';
      h += '<tr><td>' + b.index + '</td><td class="nowrap">' + b.startYear + ' to ' + b.endYear + '</td><td>' + e(b.assets) + split + '</td><td class="n">' + cr(b.investWithBuffer) +
        '</td><td class="n">' + cr(b.outflow) + '</td><td class="n">' + (b.requiredReturn == null ? pct(b.ladderReturn, 0) : pct(b.requiredReturn)) + '</td><td class="nowrap">' +
        (c == null ? '' : c <= 1 ? '<span class="up">Yes</span> <span class="dim">' + pct(c, 0) + ' used so far</span>' : '<span class="down">Not yet</span> <span class="dim">needs ' + pct(c, 0) + '</span>') + '</td></tr>';
    });
    h += '</tbody></table></div><p class="dim">“What you have” is today’s holdings and EPF grown to ' + r.retirementYear + ' (' + cr(f.total) + '), before new investments. Buckets fill in order.</p>' +
      '<div class="scroll"><table><thead><tr><th>Mix in ' + r.retirementYear + '</th><th class="n">Cash and FDs</th><th class="n">Longer-term debt</th><th class="n">Equity</th><th class="n">Total</th></tr></thead><tbody>' +
      '<tr><td>The buckets need</td><td class="n">' + cr(a.needCash) + '</td><td class="n">' + cr(a.needDebt) + '</td><td class="n">' + cr(a.needEquity) + ' <span class="dim">' + pct(a.needEquity / a.needTotal, 0) + '</span></td><td class="n">' + cr(a.needTotal) + '</td></tr>' +
      '<tr><td>You are heading for</td><td class="n" colspan="2">' + cr(a.projectedDebt) + ' in debt of all kinds</td><td class="n">' + cr(a.projectedEquity) + ' <span class="dim">' + pct(a.projectedEquity / a.projectedTotal, 0) + '</span></td><td class="n">' + cr(a.projectedTotal) + '</td></tr>' +
      '</tbody></table></div><p class="dim">The second row includes the monthly investment the plan asks for' + (a.projectedEquity > a.needEquity ? '. You would move ' + cr(a.projectedEquity - a.needEquity) + ' from equity to debt when you retire.' : '.') + '</p></section>';

    var gs = r.goals.filter(function (g) { return g.cost; });
    if (gs.length) {
      h += '<section class="block"><header><h2>Goals</h2></header><div class="scroll"><table><thead><tr><th>Goal</th><th>Year</th><th class="n">Cost today</th><th class="n">Cost then</th><th>Paid from</th></tr></thead><tbody>' +
        gs.slice().sort(function (x, y) { return x.year - y.year; }).map(function (g) {
          return '<tr><td>' + e(g.name) + (g.group ? ' <span class="dim">' + e(g.group) + '</span>' : '') + '</td><td>' + g.year + '</td><td class="n">' + cr(g.cost) + '</td><td class="n">' + cr(g.futureCost) + '</td><td>' +
            ({ income: 'Income, before retirement', corpus: 'The corpus', none: g.include ? 'Outside the plan’s years' : 'Left out of the plan' })[g.fundedBy] + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    }
    return h;
  }

  function cashRows() {
    var r = S.plan, p = r.inputs, out = [];
    r.rows.forEach(function (x) {
      if (x.n < r.yearsToRetirement || x.n > r.horizon) return;
      var defl = S.cashMode === 'today' ? Math.pow(1 + p.inflationPre, Math.min(x.n, r.yearsToRetirement)) * Math.pow(1 + p.inflationPost, Math.max(0, x.n - r.yearsToRetirement)) : 1;
      out.push({ year: x.year, age: x.age, living: x.living / defl, goals: x.goals / defl, other: -x.other / defl, total: x.fromCorpus / defl, names: x.goalNames });
    });
    return out;
  }

  App.viewPlan = function () { return '<div class="plan"><div class="plan-in" id="plan-in">' + inputs() + '</div><div id="plan-out">' + outputs() + '</div></div>'; };
  App.afterPlan = function (root) {
    var el = root.querySelector('#cash-chart'); if (!el) return;
    var rows = cashRows();
    App.barChart(el, { title: 'Yearly payout from the corpus', labels: rows.map(function (x) { return String(x.year); }),
      tipLabel: function (i) { return rows[i].year + ', age ' + rows[i].age + (rows[i].names.length ? ': ' + rows[i].names.join(', ') : ''); },
      series: [{ name: 'Living expenses', cls: 'f-1', values: rows.map(function (x) { return x.living; }) },
               { name: 'Goals', cls: 'f-2', values: rows.map(function (x) { return x.goals; }) },
               { name: 'Other, net', cls: 'f-3', values: rows.map(function (x) { return Math.max(0, x.other); }) }],
      fmt: function (v) { return cr(v, v >= 1e7 ? 1 : 0); }, height: 260 });
  };
  /* Re-draw results only, so the field being typed in keeps its focus. */
  App.renderPlanOutputs = function () {
    var out = document.getElementById('plan-out'); if (!out) return;
    out.innerHTML = outputs(); App.applyGeometry(out); App.afterPlan(out);
  };

  App.actions['cash-mode'] = function (el) { S.cashMode = el.dataset.mode; App.renderPlanOutputs(); };
  App.actions['row-add'] = function (el) {
    var path = el.dataset.path, arr = App.getPath(S.data, path);
    if (!arr) { arr = []; App.setPath(S.data, path, arr); }
    var blank = { 'plan.goals': { group: '', name: 'New goal', year: S.plan.retirementYear, cost: 0, inflation: 0.06, include: true },
                  'plan.streams': { name: 'New item', kind: 'expense', monthly: 0, growth: 0.06, startYear: null, endYear: null },
                  'otherAssets': { name: 'New asset', value: 0, planAs: 'debt' },
                  'vests': { date: App.today(), shares: 0, instrument: (S.data.instruments.find(function (i) { return i.price && i.price.type === 'quote'; }) || {}).id || '', person: (S.data.people[0] || {}).id },
                  'glidePath': { age: S.plan.age, epf: 0.15, debt: 0.3, equity: 0.55 } }[path] || {};
    arr.push(blank); S.dirty = true; App.recompute();
    if (el.closest('dialog')) App.refreshDialog(); else App.render();
    App.renderChrome();
  };
  App.actions['row-del'] = function (el) {
    var arr = App.getPath(S.data, el.dataset.path); arr.splice(+el.dataset.i, 1); S.dirty = true; App.recompute();
    if (el.closest('dialog')) App.refreshDialog(); else App.render();
    App.renderChrome();
  };
})();
