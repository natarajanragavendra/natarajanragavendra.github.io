/* Shared state, formatting, storage (private GitHub repo or this browser), form binding and charts. */
(function () {
  'use strict';
  var App = window.App = {
    state: { tab: 'portfolio', scope: 'family', data: null, prices: null, cfg: null, sha: null, dirty: false,
             status: '', statusErr: false, ledger: { person: '', fund: '', year: '', limit: 30 }, cashMode: 'today', showProj: false },
    actions: {}
  };
  var S = App.state;
  var LS = { cfg: 'ledger.cfg', data: 'ledger.data', prices: 'ledger.prices', at: 'ledger.cachedAt' };
  var API = 'https://api.github.com';

  /* ---------- formatting ---------- */
  var nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  App.MON = MON;
  App.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  App.inr = function (v) { return v == null || !isFinite(v) ? '–' : (v < 0 ? '−' : '') + '₹' + nf0.format(Math.abs(Math.round(v))); };
  App.cr = function (v, d) {
    if (v == null || !isFinite(v)) return '–';
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 9995000) return s + '₹' + (a / 1e7).toFixed(d == null ? 2 : d) + ' Cr';
    if (a >= 99950) return s + '₹' + (a / 1e5).toFixed(d == null ? (a < 999500 ? 2 : 1) : d) + ' L';
    return s + '₹' + nf0.format(Math.round(a));
  };
  App.pct = function (v, d) { return v == null || !isFinite(v) ? '–' : (v * 100).toFixed(d == null ? 1 : d) + '%'; };
  App.num = function (v, d) { return v == null || !isFinite(v) ? '–' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }).format(v); };
  App.date = function (s) { if (!s) return ''; var p = String(s).slice(0, 10).split('-'); return (+p[2]) + ' ' + MON[+p[1] - 1] + ' ' + p[0]; };
  App.month = function (y, m) { return MON[m - 1] + ' ' + y; };
  App.signed = function (v, f) { return v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : '') + f(v); };
  App.today = function () { return S.todayOverride || window.Portfolio.todayStr(); };

  /* ---------- storage ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  App.loadCfg = function () { try { return JSON.parse(lsGet(LS.cfg) || 'null'); } catch (e) { return null; } };
  App.saveCfg = function (cfg) { S.cfg = cfg; lsSet(LS.cfg, JSON.stringify(cfg)); };
  App.forget = function () { try { Object.keys(LS).forEach(function (k) { localStorage.removeItem(LS[k]); }); } catch (e) { /* ignore */ } };

  function b64encode(text) {
    var bytes = new TextEncoder().encode(text), bin = '', i;
    for (i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64.replace(/\s/g, '')), bytes = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function ghUrl(cfg, path) {
    return API + '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + '/contents/' +
      path.split('/').map(encodeURIComponent).join('/');
  }
  function ghHeaders(cfg, raw) {
    return { 'Authorization': 'Bearer ' + cfg.token, 'Accept': raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
             'X-GitHub-Api-Version': '2022-11-28' };
  }
  function ghFail(res, what) {
    var e = new Error(res.status === 401 ? 'GitHub did not accept the access token. It may have expired.'
      : res.status === 404 ? 'Could not find ' + what + '. Check the owner, repository, branch and file name, and that the token can read this repository.'
      : res.status === 403 ? 'GitHub refused access to ' + what + '. Check the token has Contents: read and write on this repository.'
      : 'GitHub returned ' + res.status + ' for ' + what + '.');
    e.status = res.status; return e;
  }
  App.ghRead = function (cfg, path) {
    var url = ghUrl(cfg, path) + '?ref=' + encodeURIComponent(cfg.branch || 'main');
    return fetch(url, { headers: ghHeaders(cfg), cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw ghFail(res, path);
      return res.json();
    }).then(function (j) {
      if (j.encoding === 'base64' && j.content) return { text: b64decode(j.content), sha: j.sha };
      return fetch(url, { headers: ghHeaders(cfg, true), cache: 'no-store' }).then(function (r2) {   // files over 1 MB
        if (!r2.ok) throw ghFail(r2, path);
        return r2.text().then(function (t) { return { text: t, sha: j.sha }; });
      });
    });
  };
  App.ghWrite = function (cfg, path, text, sha, message) {
    var body = { message: message, content: b64encode(text), branch: cfg.branch || 'main' };
    if (sha) body.sha = sha;
    return fetch(ghUrl(cfg, path), { method: 'PUT', headers: ghHeaders(cfg), body: JSON.stringify(body) }).then(function (res) {
      if (!res.ok) throw ghFail(res, path);
      return res.json();
    }).then(function (j) { return j.content.sha; });
  };

  /* One transaction per line, so the private repo's history reads as a ledger. */
  App.serialize = function (data) {
    var head = {}, k;
    for (k in data) if (k !== 'transactions') head[k] = data[k];
    var s = JSON.stringify(head, null, 1);
    var tx = (data.transactions || []).map(function (t) { return '  ' + JSON.stringify(t); }).join(',\n');
    return s.slice(0, s.lastIndexOf('}')).replace(/\s+$/, '') + ',\n "transactions": [\n' + tx + '\n ]\n}\n';
  };
  App.normalize = function (d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.transactions) || !Array.isArray(d.instruments)) throw new Error('This is not a ledger data file.');
    ['people', 'buckets', 'accounts', 'otherAssets', 'vests', 'glidePath', 'recurring'].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
    d.targets = d.targets || {}; d.settings = d.settings || {};
    d.settings.expectedReturns = d.settings.expectedReturns || { epf: 0.081, ppf: 0.07, debt: 0.06, equity: 0.12 };
    d.settings.projection = d.settings.projection || { returnRate: 0.12, targetGrowth: 0.07, includeVests: true };
    var def = window.RetCalc.defaults(); d.plan = d.plan || def;
    Object.keys(def).forEach(function (k) { if (d.plan[k] === undefined) d.plan[k] = def[k]; });
    d.plan.current = d.plan.current || def.current;
    ['family'].concat(d.people.map(function (p) { return p.id; })).forEach(function (id) {
      var t = d.targets[id] = d.targets[id] || {}; t.classes = t.classes || { epf: 0, debt: 0, equity: 1 }; t.equity = t.equity || {};
    });
    d.transactions.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    return d;
  };

  App.setStatus = function (msg, err) {
    S.status = msg || ''; S.statusErr = !!err;
    var el = document.getElementById('status'); if (el) { el.textContent = S.status; el.className = 'status' + (err ? ' err' : ''); }
  };
  function cacheLocally() { lsSet(LS.data, App.serialize(S.data)); if (S.prices) lsSet(LS.prices, JSON.stringify(S.prices)); lsSet(LS.at, new Date().toISOString()); }

  App.load = function () {
    var cfg = S.cfg = App.loadCfg();
    if (!cfg) return Promise.resolve(false);
    if (cfg.mode !== 'github') {
      var raw = lsGet(LS.data);
      if (!raw) return Promise.resolve(false);
      S.data = App.normalize(JSON.parse(raw));
      try { S.prices = JSON.parse(lsGet(LS.prices) || 'null'); } catch (e) { S.prices = null; }
      S.sha = null; S.dirty = false; App.setStatus('Kept in this browser only');
      return Promise.resolve(true);
    }
    App.setStatus('Loading from GitHub…');
    return Promise.all([
      App.ghRead(cfg, cfg.path || 'data.json'),
      App.ghRead(cfg, cfg.pricesPath || 'prices.json').catch(function (e) { return { error: e }; })
    ]).then(function (r) {
      S.data = App.normalize(JSON.parse(r[0].text)); S.sha = r[0].sha; S.dirty = false;
      S.prices = r[1].error ? null : JSON.parse(r[1].text);
      cacheLocally();
      App.setStatus(r[1].error ? 'Loaded, but prices.json could not be read' : 'Loaded from ' + cfg.owner + '/' + cfg.repo, !!r[1].error);
      return true;
    }).catch(function (e) {
      var raw = lsGet(LS.data);
      if (!raw) throw e;
      S.data = App.normalize(JSON.parse(raw)); S.sha = null; S.dirty = false; S.offline = true;
      try { S.prices = JSON.parse(lsGet(LS.prices) || 'null'); } catch (x) { S.prices = null; }
      S.loadError = e.message + ' Showing the copy this browser saved on ' + App.date((lsGet(LS.at) || '').slice(0, 10)) + '.';
      App.setStatus('Offline copy', true);
      return true;
    });
  };

  App.save = function () {
    var cfg = S.cfg, text = App.serialize(S.data);
    if (!cfg || cfg.mode !== 'github') {
      if (!lsSet(LS.data, text)) { App.setStatus('This browser refused to store the data. Download a backup from Settings.', true); return Promise.resolve(false); }
      lsSet(LS.at, new Date().toISOString());
      S.dirty = false; App.setStatus('Saved in this browser'); App.renderChrome(); return Promise.resolve(true);
    }
    App.setStatus('Saving…');
    var path = cfg.path || 'data.json', msg = 'Ledger update ' + App.today();
    function done(sha) { S.sha = sha; S.dirty = false; S.offline = false; cacheLocally(); App.setStatus('Saved to ' + cfg.owner + '/' + cfg.repo); App.renderChrome(); return true; }
    return App.ghWrite(cfg, path, text, S.sha, msg).then(done).catch(function (e) {
      if (e.status !== 409 && e.status !== 422) { App.setStatus(e.message + ' Your changes are still here, unsaved.', true); return false; }
      return App.ghRead(cfg, path).then(function (cur) {
        if (!window.confirm('The data file on GitHub changed after this page loaded it (another device, or an edit on GitHub).\n\nOK: replace it with what is on this screen.\nCancel: keep it; your changes stay here, unsaved.')) {
          App.setStatus('Not saved: the file on GitHub is newer.', true); return false;
        }
        return App.ghWrite(cfg, path, text, cur.sha, msg).then(done);
      }).catch(function (e2) { App.setStatus(e2.message, true); return false; });
    });
  };

  App.reloadPrices = function () {
    var cfg = S.cfg;
    if (!cfg || cfg.mode !== 'github') return Promise.resolve();
    App.setStatus('Loading prices…');
    return App.ghRead(cfg, cfg.pricesPath || 'prices.json').then(function (r) {
      S.prices = JSON.parse(r.text); lsSet(LS.prices, r.text); App.recompute(); App.render(); App.setStatus('Prices reloaded');
    }).catch(function (e) { App.setStatus(e.message, true); });
  };
  /* Asks GitHub to run the price job now. Needs "Actions: read and write" on the token. */
  App.runPriceJob = function () {
    var cfg = S.cfg;
    return fetch(API + '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + '/actions/workflows/update-prices.yml/dispatches',
      { method: 'POST', headers: ghHeaders(cfg), body: JSON.stringify({ ref: cfg.branch || 'main' }) }).then(function (res) {
      if (res.status === 204) { App.setStatus('Price job started. Reload prices in a minute or two.'); return; }
      App.setStatus(res.status === 403 || res.status === 404
        ? 'Could not start the price job: the token needs Actions: read and write. It still runs twice a day on its own.'
        : 'GitHub returned ' + res.status + ' when starting the price job.', true);
    }).catch(function (e) { App.setStatus(e.message, true); });
  };

  /* ---------- compute ---------- */
  App.recompute = function () {
    if (!S.data) return;
    S.pf = window.Portfolio.compute(S.data, S.prices || {}, App.today());
    var plan = Object.assign({}, S.data.plan), cur = S.data.plan.current || {};
    plan.current = cur.linked ? S.pf.planInputs : cur;
    S.plan = window.RetCalc.compute(plan);
    S.target = S.plan.corpusToday;
  };
  App.touch = function (full) { S.dirty = true; App.recompute(); if (full === false) App.renderOutputs(); else App.render(); App.renderChrome(); };

  /* ---------- paths and bound fields ---------- */
  App.getPath = function (obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); };
  App.setPath = function (obj, path, val) {
    var ks = path.split('.'), last = ks.pop(), o = ks.reduce(function (o, k) { if (o[k] == null) o[k] = {}; return o[k]; }, obj);
    o[last] = val;
  };
  function shown(v, type) {
    if (v == null || v === '') return '';
    if (type === 'pct') return String(Math.round(v * 1e6) / 1e4);
    return String(v);
  }
  App.parseField = function (el) {
    var t = el.dataset.type || 'num', raw = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (t === 'bool') return !!raw;
    if (t === 'text') return raw;
    if (t === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
    if (raw === '') return el.dataset.nullable ? null : 0;
    var n = Number(raw); if (!isFinite(n)) return undefined;
    return t === 'pct' ? n / 100 : t === 'int' ? Math.round(n) : n;
  };
  /* A labelled input bound to a path in the data file. opts: type, hint, nullable, wide, rerender, placeholder, disabled, value */
  App.field = function (label, path, opts) {
    opts = opts || {};
    var type = opts.type || 'num', v = opts.value !== undefined ? opts.value : App.getPath(S.data, path), e = App.esc;
    var attrs = ' data-bind="' + e(path) + '" data-type="' + type + '"' + (opts.nullable ? ' data-nullable="1"' : '') +
      (opts.rerender ? ' data-rerender="1"' : '') + (opts.disabled ? ' disabled' : '') + (opts.placeholder ? ' placeholder="' + e(opts.placeholder) + '"' : '');
    if (type === 'bool') return '<label class="check' + (opts.wide ? ' field wide' : '') + '"><input type="checkbox"' + attrs + (v ? ' checked' : '') + '><span>' + e(label) + '</span></label>';
    var input = type === 'text' || type === 'date' || type === 'password'
      ? '<input type="' + type + '"' + attrs + ' value="' + e(v == null ? '' : v) + '">'
      : '<input type="number" step="any" inputmode="decimal"' + attrs + ' value="' + e(shown(v, type)) + '">';
    if (type === 'pct') input = '<span class="unit" data-unit="%">' + input + '</span>';
    var hint = opts.hint !== undefined ? opts.hint : (type === 'num' && opts.money && v ? App.cr(v) : '');
    return '<label class="field' + (opts.wide ? ' wide' : '') + '"><span>' + e(label) + '</span>' + input +
      (opts.hint !== undefined || opts.money ? '<small' + (opts.money ? ' data-echo="1"' : '') + '>' + e(hint) + '</small>' : '') + '</label>';
  };
  /* A bare bound input for table editors. */
  App.cell = function (path, type, cls, extra) {
    var v = App.getPath(S.data, path), e = App.esc;
    if (type === 'bool') return '<input type="checkbox" data-bind="' + e(path) + '" data-type="bool"' + (v !== false && v ? ' checked' : '') + ' aria-label="Include">';
    var plain = type === 'text' || type === 'date';
    return '<input class="' + (cls || '') + '" type="' + (plain ? type : 'number') + '"' + (plain ? '' : ' step="any"') +
      ' data-bind="' + e(path) + '" data-type="' + type + '"' + (extra || '') + ' value="' + e(plain ? (v == null ? '' : v) : shown(v, type)) + '">';
  };
  App.select = function (path, options, extra) {
    var v = App.getPath(S.data, path), e = App.esc;
    return '<select data-bind="' + e(path) + '" data-type="text"' + (extra || '') + '>' + options.map(function (o) {
      return '<option value="' + e(o[0]) + '"' + (String(v == null ? '' : v) === String(o[0]) ? ' selected' : '') + '>' + e(o[1]) + '</option>';
    }).join('') + '</select>';
  };

  /* ---------- tooltip ---------- */
  var tip;
  App.tip = {
    show: function (html, x, y) {
      tip = tip || document.getElementById('tip'); tip.innerHTML = html; tip.hidden = false;
      var r = tip.getBoundingClientRect(), left = x + 14, top = y + 14;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
      tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
    },
    hide: function () { tip = tip || document.getElementById('tip'); tip.hidden = true; }
  };
  function tipRow(cls, name, val) { return '<div class="row"><span>' + (cls ? '<i class="swatch ' + cls + '"></i>' : '') + App.esc(name) + '</span><b>' + val + '</b></div>'; }

  /* ---------- charts (inline SVG, no library) ---------- */
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  /* Stacked (or single) columns. o: labels, series [{name, cls, values}], fmt, height, labelEvery */
  App.barChart = function (el, o) {
    var W = 720, H = o.height || 240, L = 54, R = 8, T = 10, B = 26, n = o.labels.length, e = App.esc;
    var totals = o.labels.map(function (_, i) { return o.series.reduce(function (t, s) { return t + Math.max(0, s.values[i] || 0); }, 0); });
    var max = niceMax(Math.max.apply(null, totals.concat([0]))), pw = W - L - R, ph = H - T - B, slot = pw / Math.max(n, 1);
    var bw = Math.max(2, Math.min(34, slot - 2)), svg = '', i, g;
    for (g = 0; g <= 4; g++) {
      var y = T + ph - ph * g / 4;
      svg += '<line class="' + (g ? 'grid' : 'axis') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + e(o.fmt(max * g / 4)) + '</text>';
    }
    var every = o.labelEvery || Math.ceil(n / 12);
    for (i = 0; i < n; i++) {
      var x = L + slot * i + (slot - bw) / 2, y0 = T + ph;
      o.series.forEach(function (s) {
        var v = Math.max(0, s.values[i] || 0), h = ph * v / max; if (h <= 0) return;
        y0 -= h;
        svg += '<rect class="' + s.cls + '" x="' + x.toFixed(1) + '" y="' + (y0 + (h > 3 ? 1 : 0)).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, h - (h > 3 ? 1 : 0)).toFixed(1) + '" rx="' + Math.min(3, bw / 2) + '"/>';
      });
      if (i % every === 0) svg += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + e(o.labels[i]) + '</text>';
      svg += '<rect class="hit" data-i="' + i + '" x="' + (L + slot * i).toFixed(1) + '" y="' + T + '" width="' + slot.toFixed(1) + '" height="' + ph + '"/>';
    }
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + e(o.title || 'Chart') + '">' + svg + '</svg>';
    el.onmousemove = function (ev) {
      var t = ev.target.closest('.hit'); if (!t) { App.tip.hide(); return; }
      var k = +t.dataset.i, html = '<b>' + e(o.tipLabel ? o.tipLabel(k) : o.labels[k]) + '</b>';
      o.series.forEach(function (s) { if (o.series.length === 1 || s.values[k]) html += tipRow(o.series.length > 1 ? s.cls.replace('f-', 'c-') : '', s.name, o.fmt(s.values[k] || 0)); });
      if (o.series.length > 1) html += tipRow('', 'Total', o.fmt(totals[k]));
      App.tip.show(html, ev.clientX, ev.clientY);
    };
    el.onmouseleave = App.tip.hide;
  };
  /* Two lines over time with end labels and a crosshair. o: points [{label, a, b}], names [a, b], fmt */
  App.lineChart = function (el, o) {
    var W = 720, H = o.height || 220, L = 54, R = 96, T = 12, B = 26, n = o.points.length, e = App.esc;
    if (n < 2) { el.innerHTML = ''; return; }
    var max = niceMax(Math.max.apply(null, o.points.map(function (p) { return Math.max(p.a, p.b); })));
    var pw = W - L - R, ph = H - T - B, X = function (i) { return L + pw * i / (n - 1); }, Y = function (v) { return T + ph - ph * v / max; };
    var svg = '', g, i;
    for (g = 0; g <= 4; g++) {
      var y = Y(max * g / 4);
      svg += '<line class="' + (g ? 'grid' : 'axis') + '" x1="' + L + '" x2="' + (L + pw) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + e(o.fmt(max * g / 4)) + '</text>';
    }
    var every = Math.max(1, Math.ceil(n / 6));
    for (i = 0; i < n; i += every) svg += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + e(o.points[i].label) + '</text>';
    ['a', 'b'].forEach(function (k, j) {
      var d = o.points.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[k]).toFixed(1); }).join(' ');
      svg += '<path class="line l-' + k + '" d="' + d + '" fill="none"/>';
    });
    var last = o.points[n - 1], ya = Y(last.a), yb = Y(last.b);
    if (Math.abs(ya - yb) < 14) { if (ya <= yb) { ya -= 7; yb += 7; } else { ya += 7; yb -= 7; } }
    svg += '<text class="lbl" x="' + (L + pw + 8) + '" y="' + (ya + 4) + '">' + e(o.names[0]) + '</text><text class="lbl" x="' + (L + pw + 8) + '" y="' + (yb + 4) + '">' + e(o.names[1]) + '</text>';
    svg += '<line class="axis cross" x1="0" x2="0" y1="' + T + '" y2="' + (T + ph) + '" visibility="hidden"/><rect class="hit" x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '"/>';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + e(o.title || 'Chart') + '">' + svg + '</svg>';
    var cross = el.querySelector('.cross'), hit = el.querySelector('.hit');
    el.onmousemove = function (ev) {
      var r = hit.getBoundingClientRect(); if (ev.clientX < r.left || ev.clientX > r.right) { App.tip.hide(); cross.setAttribute('visibility', 'hidden'); return; }
      var k = Math.round((ev.clientX - r.left) / r.width * (n - 1)), p = o.points[k];
      cross.setAttribute('x1', X(k)); cross.setAttribute('x2', X(k)); cross.setAttribute('visibility', 'visible');
      App.tip.show('<b>' + e(p.label) + '</b>' + tipRow('c-3', o.names[0], o.fmt(p.a)) + tipRow('c-none', o.names[1], o.fmt(p.b)), ev.clientX, ev.clientY);
    };
    el.onmouseleave = function () { App.tip.hide(); cross.setAttribute('visibility', 'hidden'); };
  };

  /* Bar widths and marker positions are set from data attributes, because the page's
   * content-security policy does not allow inline style attributes. */
  App.applyGeometry = function (root) {
    (root || document).querySelectorAll('[data-w]').forEach(function (el) { el.style.width = el.dataset.w + '%'; });
    (root || document).querySelectorAll('[data-x]').forEach(function (el) { el.style.left = el.dataset.x + '%'; });
  };
})();
