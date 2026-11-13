/* Retirement plan engine.
 *
 * A port of the "Low-stress Retirement and All Goals Calculator" workbook
 * (freefincal bucket-strategy calculator, S R Srinivasan's consolidated version):
 * the Retirement_Inputs, Staggered Goals Planner, YearlyCashFlow,
 * 0+10 Buckets income ladder and Subjective Stress Reducer sheets.
 * Cell references in comments point at that workbook.
 *
 * Works in the browser (window.RetCalc) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RetCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BUCKETS = [
    { purpose: 'Immediate needs', risk: 'None', assets: 'FDs, liquid funds' },
    { purpose: 'Next half-decade or so', risk: 'Low', assets: 'Short-term debt, RBI bonds' },
    { purpose: 'Subsequent period', risk: 'Medium', assets: 'Debt plus equity' },
    { purpose: 'Core holding, balanced', risk: 'Medium to high', assets: 'Debt plus equity' },
    { purpose: 'Corpus growth', risk: 'High', assets: 'Equity, aggressive hybrid' },
    { purpose: 'Corpus growth', risk: 'High', assets: 'Equity, aggressive hybrid' },
    { purpose: 'Corpus growth', risk: 'High', assets: 'Equity, aggressive hybrid' },
    { purpose: 'Corpus growth', risk: 'High', assets: 'Equity, aggressive hybrid' },
    { purpose: 'Corpus growth', risk: 'High', assets: 'Equity, aggressive hybrid' },
    { purpose: 'Corpus growth', risk: 'High', assets: 'Equity, aggressive hybrid' },
    { purpose: 'Corpus growth', risk: 'High', assets: 'Equity, aggressive hybrid' }
  ];

  function defaults() {
    return {
      planYear: new Date().getFullYear(),
      birthYear: 1990,
      monthlyExpenses: 100000,
      annualExpenses: 0,
      inflationPre: 0.07,
      fiAge: 50,
      withdrawAge: null,          // null = same as fiAge (no CoastFI period)
      lifeExpectancy: 93,
      inflationPost: 0.08,
      returnPost: 0.08,
      returnEquity: 0.10,
      returnDebt: 0.06,
      returnTaxFree: 0.07,
      current: { linked: true, equity: 0, debt: 0, taxFree: 0, epf: 0 },
      lumpSum: 0,
      epfMonthly: 0,
      epfGrowth: 0.06,
      epfReturn: 0.081,
      epfEquityShare: 0,
      investEquityShare: 0.8,
      investStepUp: 0,
      taxFreeMonthly: 0,
      buffer: 0.10,
      ladderSpread: 0.01,
      bucketTenures: [5, 5, 5, 10, 5, 5, 6, 5, 5, 5, 5],
      bucketEquity: [0, 0, 0.4, 0.7, 1, 1, 1, 1, 1, 1, 1],
      goals: [],
      streams: []
    };
  }

  function num(v, d) { v = Number(v); return isFinite(v) ? v : (d || 0); }

  /* Future value of a monthly investment that steps up once a year.
   * Workbook form: m*12*(1+r)*((1+r)^n-(1+g)^n)/(r-g), or m*12*n*(1+r)^n when r = g. */
  function fvStepUp(monthly, r, g, n) {
    if (n <= 0) return 0;
    if (Math.abs(r - g) < 1e-12) return monthly * 12 * n * Math.pow(1 + r, n);
    return monthly * 12 * (1 + r) * (Math.pow(1 + r, n) - Math.pow(1 + g, n)) / (r - g);
  }
  /* Inverse of fvStepUp: the starting monthly amount that grows to `target`. */
  function monthlyFor(target, r, g, n) {
    if (n <= 0) return 0;
    if (Math.abs(r - g) < 1e-12) return target / (12 * n * Math.pow(1 + r, n));
    return target * (r - g) / (12 * (1 + r) * (Math.pow(1 + r, n) - Math.pow(1 + g, n)));
  }

  function compute(input) {
    var d = defaults(), p = {}, k;
    for (k in d) p[k] = d[k];
    for (k in input) if (input[k] !== undefined) p[k] = input[k];
    var cur = p.current || {};

    var planYear = num(p.planYear);
    var age = planYear - num(p.birthYear);                                  // B10
    var fiAge = num(p.fiAge);
    var wdAge = (p.withdrawAge === null || p.withdrawAge === undefined || p.withdrawAge === '')
      ? fiAge : Math.max(fiAge, num(p.withdrawAge));                         // B12
    var yrToRet = Math.max(0, fiAge - age);                                 // B14
    var yrToWd = Math.max(0, wdAge - age);                                  // B15
    var monthlyTotal = num(p.monthlyExpenses) + num(p.annualExpenses) / 12; // B5
    var firstYearMonthly = monthlyTotal * Math.pow(1 + p.inflationPre, yrToWd); // B16
    var yearsInRet = Math.max(0, num(p.lifeExpectancy) - Math.max(wdAge, age)); // B18
    var time = yearsInRet + yrToWd;                                         // ladder B11
    var retYear = planYear + yrToRet;
    var endYear = planYear + yrToWd + yearsInRet;

    /* ---- Goals: future cost in the goal year (Planner rows 13, 35, 58) ---- */
    var goalsByN = {};
    var goalsOut = (p.goals || []).map(function (g) {
      var n = num(g.year) - planYear;
      var include = g.include !== false;
      var future = num(g.cost) * Math.pow(1 + num(g.inflation), n);
      var counted = include && n >= 0 && num(g.cost) !== 0;
      if (counted) {
        if (!goalsByN[n]) goalsByN[n] = { amount: 0, names: [] };
        goalsByN[n].amount += future;
        goalsByN[n].names.push(g.name || 'Goal');
      }
      return {
        name: g.name || 'Goal', group: g.group || '', year: num(g.year), yearsAway: n,
        cost: num(g.cost), inflation: num(g.inflation), include: include, futureCost: n >= 0 ? future : 0,
        fundedBy: !include || n < 0 ? 'none' : (n < yrToRet ? 'income' : (n > time ? 'none' : 'corpus'))
      };
    });

    /* ---- Income and expense streams in retirement (Planner rows 72-79) ---- */
    var streams = (p.streams || []).map(function (s) {
      var start = num(s.startYear) > 0 ? num(s.startYear) : retYear;        // row 78
      var end = num(s.endYear) > 0 ? num(s.endYear) : endYear;              // row 79
      var sign = s.kind === 'income' ? 1 : -1;
      var first = sign * num(s.monthly) * Math.pow(1 + num(s.growth), Math.max(0, start - planYear)); // row 74
      return { name: s.name || 'Stream', kind: s.kind === 'income' ? 'income' : 'expense',
               start: start, end: end, growth: num(s.growth), firstMonthly: first };
    });
    function streamsIn(year) {
      var t = 0;
      for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (year >= s.start && year <= s.end) t += Math.pow(1 + s.growth, year - s.start) * s.firstMonthly * 12;
      }
      return t;
    }

    /* ---- Yearly cash flow (YearlyCashFlow columns I, J, L, M, N, O) ---- */
    var nRows = Math.max(84, time + 2);
    var rows = [], living = 0, sumPV = 0;
    for (var n = 0; n < nRows; n++) {
      if (living > 0) living = living * (1 + p.inflationPost);
      else living = n < yrToWd ? 0 : firstYearMonthly * 12;                 // column I
      var g = goalsByN[n] ? goalsByN[n].amount : 0;                         // columns C, F, J
      var other = streamsIn(planYear + n);                                  // column L
      var need = g + living - other;
      var fromCorpus = (n < yrToRet || n > time) ? 0 : need;                // column M
      var fromIncome = (n >= yrToRet || n > time) ? 0 : need;               // column O
      var pv = fromCorpus / Math.pow(1 + p.returnPost, n - yrToRet);        // column N
      sumPV += pv;
      rows.push({ n: n, year: planYear + n, age: age + n, living: n > time ? 0 : living, goals: g,
                  goalNames: goalsByN[n] ? goalsByN[n].names : [], other: other,
                  fromCorpus: fromCorpus, fromIncome: fromIncome, pvAtRetirement: pv });
    }
    function cashAt(n) { return n >= 0 && n < rows.length ? rows[n].fromCorpus : 0; }

    var buffer = num(p.buffer);
    var corpusConstant = sumPV * (1 + buffer);                              // B22

    /* ---- Bucket ladder ('0+10 Buckets income ladder') ---- */
    var tenures = (p.bucketTenures || d.bucketTenures).slice(0, 11);
    while (tenures.length < 11) tenures.push(5);
    tenures[0] = (yrToWd - yrToRet) < 5 ? 5 : (yrToWd - yrToRet);           // D42
    var eqShare = (p.bucketEquity || d.bucketEquity).slice(0, 11);
    while (eqShare.length < 11) eqShare.push(1);
    var ladderRet = p.returnDebt - num(p.ladderSpread, 0.01);               // K41
    var buckets = [], prevMax = null, cumTenure = 0, investSum = 0;
    for (var i = 0; i < 11; i++) {
      var kk, start;
      if (i === 0) { kk = Math.min(tenures[0], time); start = yrToRet; }    // N3
      else { kk = prevMax >= time ? 0 : Math.min(tenures[i], time - prevMax); start = prevMax + 1; } // S3...
      kk = Math.max(0, kk);
      var corpus = 0, outflow = 0;
      for (var j = 0; j < kk; j++) {
        var c = cashAt(start + j);
        outflow += c;
        corpus += c / Math.pow(1 + ladderRet, j);                           // N10:N39
      }
      var share = i < 2 ? 0 : num(eqShare[i]);
      var reqRet = i === 0 ? null : (i === 1 ? p.returnDebt
        : share * p.returnEquity + (1 - share) * p.returnDebt);              // K43:K52
      var invest = i === 0 ? corpus : corpus / Math.pow(1 + reqRet, cumTenure); // N6, S6...
      investSum += invest;
      buckets.push({
        index: i, tenure: kk, startN: start, startYear: planYear + start,
        endYear: planYear + start + Math.max(kk, 1) - 1, active: kk > 0,
        purpose: BUCKETS[i].purpose, risk: BUCKETS[i].risk, assets: BUCKETS[i].assets,
        equityShare: share, requiredReturn: reqRet, ladderReturn: ladderRet,
        corpusAtStart: corpus, investAtRetirement: invest, outflow: outflow,
        investWithBuffer: invest * (1 + buffer),
        equityPart: invest * (1 + buffer) * (i >= 4 ? 1 : share),
        debtPart: invest * (1 + buffer) * (i >= 4 ? 0 : 1 - share)
      });
      prevMax = start + Math.max(kk, 1) - 1;
      cumTenure += tenures[i];
    }
    var corpusBucket = investSum * (1 + buffer);                            // G9, B23
    var disc = Math.pow(1 + p.returnPost, yrToRet);
    var corpusToday = corpusBucket / disc;                                  // B24
    var corpusConstantToday = corpusConstant / disc;

    /* ---- What the current investments grow to (Retirement_Inputs rows 31-45) ---- */
    var curEq = num(cur.equity), curDebt = num(cur.debt), curTF = num(cur.taxFree), curEpf = num(cur.epf);
    var fvEq = curEq * Math.pow(1 + p.returnEquity, yrToRet);               // C32
    var fvDebt = curDebt * Math.pow(1 + p.returnDebt, yrToRet);             // C33
    var fvTF = curTF * Math.pow(1 + p.returnTaxFree, yrToRet);              // C34
    var lump = num(p.lumpSum);                                              // C35
    var fvEpfBalance = curEpf * Math.pow(1 + p.epfReturn, yrToRet);         // B44
    var fvEpfContrib = fvStepUp(num(p.epfMonthly), p.epfReturn, p.epfGrowth, yrToRet);
    var fvEpf = fvEpfBalance + fvEpfContrib;                                // C40
    var haveToday = curEq + curDebt + curTF + curEpf;                       // B43
    var projectedExisting = fvEq + fvDebt + fvTF + lump + fvEpf;

    /* ---- Monthly investment still needed (rows 42-66) ---- */
    var wEq = num(p.investEquityShare), wDebt = 1 - wEq;                    // B49, B50
    var netRet = p.returnEquity * wEq + p.returnDebt * wDebt;               // B54
    var step = num(p.investStepUp);                                         // B53
    var tfMonthly = num(p.taxFreeMonthly);                                  // B65
    var rTFm = Math.pow(1 + p.returnTaxFree, 1 / 12) - 1;
    var fvTFMonthly = yrToRet > 0 && tfMonthly > 0
      ? tfMonthly * (Math.pow(1 + rTFm, yrToRet * 12) - 1) / rTFm * (1 + rTFm) : 0; // C65
    var gapConstant = corpusConstant - projectedExisting;                   // B42
    var gapBucket = corpusBucket - projectedExisting;                       // B46
    var monthlyConstant = yrToRet > 0 && gapConstant > 0
      ? monthlyFor(gapConstant - fvTFMonthly, netRet, step, yrToRet) + tfMonthly : 0; // B55
    var monthlyBucket = yrToRet > 0 && gapBucket > 0
      ? monthlyFor(gapBucket - fvTFMonthly, netRet, step, yrToRet) + tfMonthly : 0;   // B56
    var eqMonthly = Math.max(0, monthlyBucket - tfMonthly) * wEq;           // B61
    var debtMonthly = Math.max(0, monthlyBucket - tfMonthly) * wDebt;       // B62
    var fvEqMonthly = fvStepUp(eqMonthly, p.returnEquity, step, yrToRet);   // C61
    var fvDebtMonthly = fvStepUp(debtMonthly, p.returnDebt, step, yrToRet); // C62
    var monthlyTotalInvest = monthlyBucket + tfMonthly + num(p.epfMonthly); // B57 (as in the workbook)
    var stressReduction = monthlyConstant <= 0 ? 0
      : (monthlyBucket <= 0 ? 1 : (monthlyConstant - monthlyBucket) / monthlyConstant); // B58
    var effDen = eqMonthly + debtMonthly + tfMonthly + num(p.epfMonthly);
    var effectiveEquity = effDen > 0 ? eqMonthly / effDen : null;           // C50

    /* ---- Stress reducer: can the projected corpus fill each bucket? ---- */
    var epfEq = num(p.epfEquityShare);
    var projEquity = fvEq + fvEqMonthly + epfEq * fvEpf;                    // K34
    var projDebt = fvDebt + fvTF + lump + (1 - epfEq) * fvEpf + fvDebtMonthly + fvTFMonthly; // K35
    var withoutEpf = fvEq + fvDebt + fvTF + lump;                           // SUM(C32:C35)
    var cum = 0, needCash = 0, needDebt = 0, needEquity = 0;
    buckets.forEach(function (b) {
      cum += b.investWithBuffer;
      b.cumulative = cum;                                                   // column K
      b.coverExisting = b.active && withoutEpf > 0 ? cum / withoutEpf : null;        // column G
      b.coverWithEpf = b.active && projectedExisting > 0 ? cum / projectedExisting : null; // column H
      if (b.index === 0) needCash += b.investWithBuffer;                    // E28
      else { needDebt += b.debtPart; needEquity += b.equityPart; }          // F28, G28
    });

    return {
      inputs: p,
      age: age, fiAge: fiAge, withdrawAge: wdAge, yearsToRetirement: yrToRet, yearsToWithdrawal: yrToWd,
      yearsInRetirement: yearsInRet, retirementYear: retYear, endYear: endYear, horizon: time,
      monthlyExpensesToday: monthlyTotal, firstYearMonthly: firstYearMonthly, firstYearAnnual: firstYearMonthly * 12,
      rows: rows, goals: goalsOut, streams: streams, buckets: buckets,
      corpusConstant: corpusConstant, corpusBucket: corpusBucket,
      corpusToday: corpusToday, corpusConstantToday: corpusConstantToday,
      bucketSaving: corpusConstant > 0 ? (corpusConstant - corpusBucket) / corpusConstant : 0, // B25
      haveToday: haveToday, achieved: corpusToday > 0 ? haveToday / corpusToday : null,       // C43
      future: { equity: fvEq, debt: fvDebt, taxFree: fvTF, lumpSum: lump, epfBalance: fvEpfBalance,
                epfContributions: fvEpfContrib, epf: fvEpf, total: projectedExisting },
      gapConstant: gapConstant, gapBucket: gapBucket,
      monthlyConstant: monthlyConstant, monthlyBucket: monthlyBucket,
      monthlyEquity: eqMonthly, monthlyDebt: debtMonthly, monthlyTotalInvest: monthlyTotalInvest,
      fvMonthlyEquity: fvEqMonthly, fvMonthlyDebt: fvDebtMonthly, fvMonthlyTaxFree: fvTFMonthly,
      netReturn: netRet, stressReduction: stressReduction, effectiveEquity: effectiveEquity,
      atRetirement: {
        needCash: needCash, needDebt: needDebt, needEquity: needEquity, needTotal: corpusBucket,
        projectedEquity: projEquity, projectedDebt: projDebt, projectedTotal: projEquity + projDebt,
        surplus: projEquity + projDebt - corpusBucket
      }
    };
  }

  return { compute: compute, defaults: defaults, fvStepUp: fvStepUp, monthlyFor: monthlyFor };
});
