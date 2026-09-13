/* ============================================================
   College Fit Dashboard
   Vanilla ES6+. No build step, no dependencies, no backend.
   State lives in localStorage; every input recomputes in place.
   ============================================================ */

(function () {
  'use strict';

  var STORAGE_KEY = 'collegeFitDashboard';
  var SCHEMA_VERSION = 1;
  var MAX_COLLEGES = 4;   /* series palette is validated for 4 slots, never cycled */
  var MAX_CRITERIA = 8;   /* stacked-segment palette is validated for 8 slots */
  var AFFORDABILITY = 'affordability';

  /* ---------- utilities ---------- */

  var $ = function (sel) { return document.querySelector(sel); };

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function uid(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 9);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var money0 = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  });
  function usd(n) { return money0.format(Math.round(num(n))); }
  function usdShort(n) {
    n = Math.round(num(n));
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1) + 'k';
    return '$' + n;
  }
  function pct1(n) { return (Math.round(num(n) * 10) / 10).toFixed(1); }
  function score1(n) {
    var r = Math.round(num(n) * 10) / 10;
    return r % 1 === 0 ? String(r) : r.toFixed(1);
  }
  function seriesVar(i) { return 'var(--series-' + ((i % MAX_COLLEGES) + 1) + ')'; }
  function catVar(i) { return 'var(--cat-' + ((i % MAX_CRITERIA) + 1) + ')'; }

  /* ---------- defaults ---------- */

  function defaultCriteria() {
    return [
      { id: AFFORDABILITY, name: 'Affordability', weight: 9, auto: true },
      { id: uid('c'), name: 'Academics in my major', weight: 9, auto: false },
      { id: uid('c'), name: 'Campus feel & social fit', weight: 7, auto: false },
      { id: uid('c'), name: 'Career outcomes & internships', weight: 8, auto: false },
      { id: uid('c'), name: 'Distance from home', weight: 5, auto: false },
      { id: uid('c'), name: 'Housing & campus life', weight: 4, auto: false }
    ];
  }

  function defaultFinance(over) {
    var base = {
      tuition: 13000, housing: 12500, books: 2400, travel: 700,
      inflation: 4,
      grants: 8000, grantsRenewable: true,
      family: 6000, earnings: 3500, savings: 20000,
      years: 4, loanRate: 6.5, loanTerm: 10, salary: 62000
    };
    for (var k in (over || {})) base[k] = over[k];
    return base;
  }

  function defaultState() {
    var crits = defaultCriteria();
    function scores(vals) {
      var s = {};
      crits.forEach(function (c, i) { if (!c.auto) s[c.id] = vals[i - 1] || 7; });
      return s;
    }
    return {
      version: SCHEMA_VERSION,
      theme: 'auto',
      activeCollege: null,
      criteria: crits,
      colleges: [
        {
          id: uid('s'), name: 'Mizzou (MU)',
          scores: scores([8, 8, 7, 9]),
          fin: defaultFinance({})
        },
        {
          id: uid('s'), name: 'Iowa State (ISU)',
          scores: scores([9, 7, 8, 5]),
          fin: defaultFinance({
            tuition: 27000, housing: 10800, books: 2300, travel: 1400,
            grants: 12000, salary: 66000
          })
        }
      ]
    };
  }

  /* ---------- state & persistence ---------- */

  var state = defaultState();
  var saveTimer = null;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        toast('Could not save to this browser: ' + e.message);
      }
    }, 250);
  }

  function load() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (adopt(parsed)) return;
    } catch (e) { /* fall through to defaults */ }
    toast('Saved data could not be read — starting from the defaults.');
  }

  /* Accepts a state object (from storage or an imported file) after shape and
     range checks, so a corrupt or hand-edited file cannot wedge the dashboard. */
  function adopt(input) {
    if (!input || typeof input !== 'object') return false;
    if (!Array.isArray(input.criteria) || !Array.isArray(input.colleges)) return false;
    if (!input.criteria.length || !input.colleges.length) return false;

    var crits = input.criteria.slice(0, MAX_CRITERIA).map(function (c) {
      return {
        id: String(c && c.id || uid('c')),
        name: String(c && c.name || 'Priority').slice(0, 40),
        weight: clamp(num(c && c.weight), 0, 10),
        auto: !!(c && c.auto)
      };
    });
    if (!crits.some(function (c) { return c.auto; })) {
      crits.unshift({ id: AFFORDABILITY, name: 'Affordability', weight: 9, auto: true });
      crits = crits.slice(0, MAX_CRITERIA);
    }

    var colleges = input.colleges.slice(0, MAX_COLLEGES).map(function (s, i) {
      var fin = defaultFinance(null);
      var src = (s && s.fin) || {};
      Object.keys(fin).forEach(function (k) {
        if (k === 'grantsRenewable') fin[k] = src[k] !== false;
        else if (src[k] !== undefined) fin[k] = clamp(num(src[k]), 0, 1e9);
      });
      fin.years = clamp(Math.round(fin.years), 1, 6);
      fin.loanTerm = clamp(Math.round(fin.loanTerm), 1, 30);
      var scores = {};
      crits.forEach(function (c) {
        if (c.auto) return;
        var v = s && s.scores ? num(s.scores[c.id]) : 0;
        scores[c.id] = v ? clamp(v, 1, 10) : 5;
      });
      return { id: String(s && s.id || uid('s')), name: String(s && s.name || 'School ' + (i + 1)).slice(0, 40), scores: scores, fin: fin };
    });

    state = {
      version: SCHEMA_VERSION,
      theme: ['auto', 'light', 'dark'].indexOf(input.theme) > -1 ? input.theme : 'auto',
      activeCollege: null,
      criteria: crits,
      colleges: colleges
    };
    state.activeCollege = colleges.some(function (c) { return c.id === input.activeCollege; })
      ? input.activeCollege : colleges[0].id;
    return true;
  }

  function collegeById(id) {
    for (var i = 0; i < state.colleges.length; i++) {
      if (state.colleges[i].id === id) return state.colleges[i];
    }
    return null;
  }

  /* ============================================================
     FINANCE ENGINE
     Payment order per year: gift aid -> family + student earnings
     -> savings/529 -> loans cover whatever is left.
     ============================================================ */

  function computeFinance(fin) {
    var years = clamp(Math.round(num(fin.years)), 1, 6);
    var infl = num(fin.inflation) / 100;
    var rate = num(fin.loanRate) / 100;
    var term = clamp(Math.round(num(fin.loanTerm)), 1, 30);
    var savingsLeft = Math.max(0, num(fin.savings));
    var family = Math.max(0, num(fin.family));
    var earnings = Math.max(0, num(fin.earnings));
    var yearCash = family + earnings;

    var rows = [];
    var tot = { sticker: 0, aid: 0, net: 0, family: 0, earnings: 0, savings: 0, borrowed: 0 };
    var balanceAtGrad = 0;

    for (var y = 1; y <= years; y++) {
      var factor = Math.pow(1 + infl, y - 1);
      var sticker = (num(fin.tuition) + num(fin.housing) + num(fin.books) + num(fin.travel)) * factor;
      var offered = fin.grantsRenewable !== false ? num(fin.grants) : (y === 1 ? num(fin.grants) : 0);
      var aid = Math.min(Math.max(0, offered), sticker);
      var net = sticker - aid;
      var cash = Math.min(net, yearCash);
      /* split the applied cash back into its two sources, proportionally */
      var famPart = yearCash > 0 ? cash * (family / yearCash) : 0;
      var earnPart = cash - famPart;
      var draw = Math.min(savingsLeft, net - cash);
      savingsLeft -= draw;
      var borrow = net - cash - draw;

      /* unsubsidized behavior: each year's borrowing accrues from mid-year to graduation */
      balanceAtGrad += borrow * Math.pow(1 + rate, (years - y) + 0.5);

      rows.push({
        year: y, sticker: sticker, aid: aid, net: net,
        family: famPart, earnings: earnPart, savings: draw, borrow: borrow
      });
      tot.sticker += sticker; tot.aid += aid; tot.net += net;
      tot.family += famPart; tot.earnings += earnPart;
      tot.savings += draw; tot.borrowed += borrow;
    }

    var inSchoolInterest = balanceAtGrad - tot.borrowed;
    var n = term * 12;
    var i = rate / 12;
    var monthly = 0;
    if (balanceAtGrad > 0) {
      monthly = i === 0 ? balanceAtGrad / n : balanceAtGrad * i / (1 - Math.pow(1 + i, -n));
    }
    var totalRepaid = monthly * n;
    var totalInterest = Math.max(0, totalRepaid - tot.borrowed);
    var outOfPocket = tot.family + tot.earnings + tot.savings;
    var familyCost = outOfPocket + totalRepaid;
    var salaryMonthly = num(fin.salary) / 12;
    var strain = salaryMonthly > 0 ? (monthly / salaryMonthly) * 100 : 0;

    return {
      years: years, rows: rows, totals: tot,
      balanceAtGrad: balanceAtGrad,
      inSchoolInterest: inSchoolInterest,
      monthly: monthly,
      totalRepaid: totalRepaid,
      totalInterest: totalInterest,
      outOfPocket: outOfPocket,
      familyCost: familyCost,
      strain: strain,
      savingsUnused: savingsLeft
    };
  }

  function strainStatus(strain, borrowed) {
    if (borrowed <= 0) return { key: 'good', icon: '✓', label: 'No debt' };
    if (strain < 8) return { key: 'good', icon: '✓', label: 'Comfortable' };
    if (strain <= 12) return { key: 'warning', icon: '!', label: 'Manageable' };
    return { key: 'critical', icon: '▲', label: 'Tight' };
  }

  /* ============================================================
     SCORING ENGINE
     ============================================================ */

  function computeAll() {
    var fin = state.colleges.map(function (c) { return computeFinance(c.fin); });

    /* affordability: cheapest total lifetime cost scores 10, others scale by ratio */
    var costs = fin.map(function (f) { return f.familyCost; });
    var cheapest = Math.min.apply(null, costs);
    var afford = costs.map(function (v) {
      if (v <= 0 || cheapest <= 0) return 10;
      return clamp(10 * (cheapest / v), 1, 10);
    });

    var totalWeight = state.criteria.reduce(function (a, c) { return a + num(c.weight); }, 0);

    var results = state.colleges.map(function (col, idx) {
      var parts = state.criteria.map(function (crit, ci) {
        var raw = crit.auto ? afford[idx] : clamp(num(col.scores[crit.id]) || 5, 1, 10);
        var w = num(crit.weight);
        var contribution = totalWeight > 0 ? (w * raw) / (totalWeight * 10) * 100 : 0;
        return {
          id: crit.id, name: crit.name, index: ci,
          weight: w, score: raw, contribution: contribution
        };
      });
      var total = parts.reduce(function (a, p) { return a + p.contribution; }, 0);
      return {
        college: col, index: idx, fin: fin[idx],
        afford: afford[idx], parts: parts, total: total
      };
    });

    var ranked = results.slice().sort(function (a, b) { return b.total - a.total; });
    return { results: results, ranked: ranked, totalWeight: totalWeight, cheapest: cheapest };
  }

  /* ============================================================
     RENDER — inputs (rebuilt only on structural change)
     ============================================================ */

  function renderWeights() {
    var host = $('#weightList');
    host.innerHTML = state.criteria.map(function (c, i) {
      var removable = !c.auto;
      return '' +
        '<div class="wrow" data-crit="' + esc(c.id) + '">' +
          '<input class="wrow__name" type="text" maxlength="40" value="' + esc(c.name) + '"' +
            ' data-action="rename-criterion" aria-label="Priority name">' +
          '<div class="wrow__meta">' +
            (c.auto ? '<span class="chip chip--auto">auto-scored</span>' : '') +
            '<span class="chip"><span id="wpct-' + esc(c.id) + '">0%</span></span>' +
            (removable
              ? '<button type="button" class="iconbtn" data-action="remove-criterion" aria-label="Remove ' + esc(c.name) + '">&times;</button>'
              : '') +
          '</div>' +
          '<div class="wrow__slider">' +
            '<input type="range" min="0" max="10" step="1" value="' + c.weight + '"' +
              ' data-action="weight" aria-label="Weight for ' + esc(c.name) + '">' +
            '<span class="cell__val" id="wval-' + esc(c.id) + '">' + c.weight + '</span>' +
          '</div>' +
        '</div>';
    }).join('');
    $('#addCriterion').disabled = state.criteria.length >= MAX_CRITERIA;
    $('#newCriterion').placeholder = state.criteria.length >= MAX_CRITERIA
      ? 'Maximum of ' + MAX_CRITERIA + ' priorities'
      : 'Add a priority (e.g. Study abroad)';
  }

  function renderMatrix() {
    var head = '<thead><tr><th>Priority</th>' + state.colleges.map(function (c, i) {
      return '<th class="school"><span class="school__name">' +
        '<span class="swatch-dot" style="background:' + seriesVar(i) + '"></span>' +
        esc(c.name) + '</span></th>';
    }).join('') + '</tr></thead>';

    var body = '<tbody>' + state.criteria.map(function (crit) {
      var cells = state.colleges.map(function (col) {
        if (crit.auto) {
          return '<td><span class="cell--auto" id="auto-' + esc(col.id) + '">–</span>' +
            '<span class="matrix__weight">from the money panel</span></td>';
        }
        var v = clamp(num(col.scores[crit.id]) || 5, 1, 10);
        return '<td><div class="cell">' +
          '<input type="range" min="1" max="10" step="0.5" value="' + v + '"' +
            ' data-action="score" data-college="' + esc(col.id) + '" data-crit="' + esc(crit.id) + '"' +
            ' aria-label="' + esc(col.name) + ' — ' + esc(crit.name) + '">' +
          '<span class="cell__val" id="sval-' + esc(col.id) + '-' + esc(crit.id) + '">' + score1(v) + ' / 10</span>' +
          '</div></td>';
      }).join('');
      return '<tr><td>' + esc(crit.name) +
        '<span class="matrix__weight" id="mw-' + esc(crit.id) + '">weight ' + crit.weight + '</span></td>' +
        cells + '</tr>';
    }).join('') + '</tbody>';

    $('#scoreMatrix').innerHTML = head + body;
  }

  var MONEY_FIELDS = [
    { title: 'Cost of attendance — year 1', fields: [
      { k: 'tuition', label: 'Tuition & fees', step: 100 },
      { k: 'housing', label: 'Housing & meals', step: 100 },
      { k: 'books', label: 'Books & personal', step: 50 },
      { k: 'travel', label: 'Travel home', step: 50 },
      { k: 'inflation', label: 'Annual increase (%)', step: 0.5, max: 20 }
    ] },
    { title: 'Gift aid (never repaid)', fields: [
      { k: 'grants', label: 'Grants & scholarships', step: 250 },
      { k: 'grantsRenewable', label: 'Renews every year', type: 'check' }
    ] },
    { title: 'How you pay the rest', fields: [
      { k: 'family', label: 'Family cash / year', step: 250 },
      { k: 'earnings', label: 'Student earnings / year', step: 250 },
      { k: 'savings', label: 'Savings & 529 (total)', step: 500 }
    ] },
    { title: 'Loans & what comes after', fields: [
      { k: 'years', label: 'Years to degree', step: 1, max: 6, min: 1 },
      { k: 'loanRate', label: 'Loan interest rate (%)', step: 0.25, max: 20 },
      { k: 'loanTerm', label: 'Repayment years', step: 1, max: 30, min: 1 },
      { k: 'salary', label: 'Expected starting salary', step: 1000 }
    ] }
  ];

  function renderMoney() {
    $('#moneyGrid').innerHTML = state.colleges.map(function (col, i) {
      var groups = MONEY_FIELDS.map(function (g) {
        var rows = g.fields.map(function (f) {
          if (f.type === 'check') {
            return '<div class="frow frow--check"><label for="f-' + esc(col.id) + '-' + f.k + '">' + f.label + '</label>' +
              '<input id="f-' + esc(col.id) + '-' + f.k + '" type="checkbox" data-action="fin" data-college="' + esc(col.id) + '"' +
              ' data-field="' + f.k + '"' + (col.fin[f.k] !== false ? ' checked' : '') + '></div>';
          }
          return '<div class="frow"><label for="f-' + esc(col.id) + '-' + f.k + '">' + f.label + '</label>' +
            '<input id="f-' + esc(col.id) + '-' + f.k + '" type="number" inputmode="decimal"' +
            ' min="' + (f.min !== undefined ? f.min : 0) + '"' +
            (f.max !== undefined ? ' max="' + f.max + '"' : '') +
            ' step="' + f.step + '" value="' + num(col.fin[f.k]) + '"' +
            ' data-action="fin" data-college="' + esc(col.id) + '" data-field="' + f.k + '"></div>';
        }).join('');
        return '<div class="fgroup"><div class="fgroup__title">' + g.title + '</div>' + rows + '</div>';
      }).join('');

      return '<div class="mcard" style="--mcard-accent:' + seriesVar(i) + '">' +
        '<div class="mcard__head">' +
          '<span class="swatch-dot" style="background:' + seriesVar(i) + '"></span>' +
          '<input class="mcard__name" type="text" maxlength="40" value="' + esc(col.name) + '"' +
            ' data-action="rename-college" data-college="' + esc(col.id) + '" aria-label="School name">' +
          (state.colleges.length > 1
            ? '<button type="button" class="iconbtn" data-action="remove-college" data-college="' + esc(col.id) + '"' +
              ' aria-label="Remove ' + esc(col.name) + '">&times;</button>'
            : '') +
        '</div>' + groups +
        '<div class="mcard__total" id="mtot-' + esc(col.id) + '"></div>' +
      '</div>';
    }).join('');
    $('#addCollege').disabled = state.colleges.length >= MAX_COLLEGES;
    $('#addCollege').title = state.colleges.length >= MAX_COLLEGES
      ? 'Comparing more than ' + MAX_COLLEGES + ' at once stops being readable'
      : 'Add another school to the comparison';
  }

  function renderCashTabs() {
    $('#cashTabs').innerHTML = state.colleges.map(function (c) {
      var active = c.id === state.activeCollege;
      return '<button type="button" class="seg__btn' + (active ? ' is-active' : '') + '"' +
        ' data-action="cash-tab" data-college="' + esc(c.id) + '"' +
        ' aria-pressed="' + active + '">' + esc(c.name) + '</button>';
    }).join('');
  }

  /* ============================================================
     RENDER — derived views (re-run on every change)
     ============================================================ */

  function renderVerdict(model) {
    var host = $('#verdict');
    if (model.totalWeight <= 0) {
      host.innerHTML = '<span class="verdict__lead">No priorities set</span>' +
        '<span class="verdict__detail">Give at least one priority a weight above zero to get a ranking.</span>';
      host.style.borderLeftColor = 'var(--axis)';
      return;
    }
    var first = model.ranked[0];
    var second = model.ranked[1];
    host.style.borderLeftColor = seriesVar(first.index);

    if (!second) {
      host.innerHTML = '<span class="verdict__tag">Only school</span>' +
        '<span class="verdict__lead">' + esc(first.college.name) + '</span>' +
        '<span class="verdict__detail">Scores ' + pct1(first.total) + ' / 100 · ' +
        usd(first.fin.familyCost) + ' total cost to your family. Add a second school to compare.</span>';
      return;
    }

    var gap = first.total - second.total;
    var costGap = second.fin.familyCost - first.fin.familyCost;
    var lead;
    if (gap < 1.5) lead = 'Too close to call';
    else if (gap < 6) lead = esc(first.college.name) + ' edges ahead';
    else lead = esc(first.college.name) + ' wins';

    var costLine;
    if (Math.abs(costGap) < 500) {
      costLine = 'The two cost within ' + usd(Math.abs(costGap)) + ' of each other overall.';
    } else if (costGap > 0) {
      costLine = 'It also costs ' + usd(Math.abs(costGap)) + ' less over the whole degree.';
    } else {
      costLine = 'It costs ' + usd(Math.abs(costGap)) + ' more over the whole degree — the other priorities are carrying it.';
    }

    host.innerHTML = '<span class="verdict__tag">Leading</span>' +
      '<span class="verdict__lead">' + lead + '</span>' +
      '<span class="verdict__detail">' + pct1(first.total) + ' vs ' + pct1(second.total) +
      ' out of 100 for ' + esc(second.college.name) + '. ' + costLine + '</span>';
  }

  function renderRankChart(model) {
    if (model.totalWeight <= 0) {
      $('#rankChart').innerHTML = '<p class="panel__hint">Nothing to plot yet.</p>';
      $('#rankLegend').innerHTML = '';
      return;
    }
    $('#rankChart').innerHTML = '<div class="bars">' + model.ranked.map(function (r, rank) {
      var segs = r.parts.filter(function (p) { return p.contribution > 0; }).map(function (p) {
        var tip = esc(p.name) + '<br><span class="tip__key">weight</span> <b>' + p.weight + '/10</b>' +
          ' · <span class="tip__key">score</span> <b>' + score1(p.score) + '/10</b>' +
          '<br><span class="tip__key">adds</span> <b>' + pct1(p.contribution) + '</b> points';
        return '<span class="seg-fill" style="flex-grow:' + p.contribution.toFixed(3) +
          ';background:' + catVar(p.index) + '" data-tip="' + esc(tip) + '"></span>';
      }).join('');
      return '<div class="barrow">' +
        '<div class="barrow__head">' +
          '<span class="barrow__name">' +
            '<span class="rank-num">' + (rank + 1) + '</span>' +
            '<span class="swatch-dot" style="background:' + seriesVar(r.index) + '"></span>' +
            esc(r.college.name) +
          '</span>' +
          '<span class="barrow__value">' + pct1(r.total) + ' <span class="barrow__unit">/ 100</span></span>' +
        '</div>' +
        '<div class="track"><div class="bar" style="width:' + clamp(r.total, 0, 100).toFixed(2) + '%">' +
          segs + '</div></div>' +
      '</div>';
    }).join('') + '</div>';

    $('#rankLegend').innerHTML = state.criteria.map(function (c, i) {
      if (num(c.weight) <= 0) return '';
      return '<span class="legend__item"><span class="legend__swatch" style="background:' + catVar(i) + '"></span>' +
        esc(c.name) + '</span>';
    }).join('') || '<span class="legend__item">Every priority is weighted 0.</span>';
  }

  function renderRankTable(model) {
    var head = '<thead><tr><th>Priority</th><th>Weight</th>' + model.ranked.map(function (r) {
      return '<th>' + esc(r.college.name) + '</th>';
    }).join('') + '</tr></thead>';

    var body = '<tbody>' + state.criteria.map(function (crit, ci) {
      var cells = model.ranked.map(function (r) {
        var p = r.parts[ci];
        return '<td>' + score1(p.score) + ' <span class="matrix__weight">(' + pct1(p.contribution) + ' pts)</span></td>';
      }).join('');
      return '<tr><td><span class="swatch-dot" style="background:' + catVar(ci) + '"></span>' +
        esc(crit.name) + '</td><td>' + crit.weight + '</td>' + cells + '</tr>';
    }).join('') + '</tbody>';

    var foot = '<tfoot><tr><td>Fit score</td><td>' + model.totalWeight + '</td>' +
      model.ranked.map(function (r) { return '<td>' + pct1(r.total) + ' / 100</td>'; }).join('') +
      '</tr></tfoot>';

    $('#rankTable').innerHTML = head + body + foot;
  }

  function renderTiles(model) {
    var active = model.results.filter(function (r) { return r.college.id === state.activeCollege; })[0] || model.results[0];
    var f = active.fin;
    var st = strainStatus(f.strain, f.totals.borrowed);
    var accent = seriesVar(active.index);

    var tiles = [
      { label: 'Borrowed', value: usd(f.totals.borrowed),
        sub: f.inSchoolInterest > 0 ? '+ ' + usd(f.inSchoolInterest) + ' interest before graduation' : 'no in-school interest' },
      { label: 'Monthly payment', value: usd(f.monthly),
        sub: 'for ' + clamp(Math.round(num(active.college.fin.loanTerm)), 1, 30) + ' years after graduation' },
      { label: 'Paid back in total', value: usd(f.totalRepaid),
        sub: usd(f.totalInterest) + ' of that is interest' },
      { label: 'Salary strain', value: pct1(f.strain) + '%',
        sub: 'of starting gross pay · <span class="status status--' + st.key + '">' + st.icon + ' ' + st.label + '</span>' },
      { label: 'Out of pocket', value: usd(f.outOfPocket), sub: 'family, earnings and savings' },
      { label: 'True cost of the degree', value: usd(f.familyCost), sub: 'out of pocket plus every loan payment' }
    ];

    $('#statTiles').innerHTML = tiles.map(function (t) {
      return '<div class="tile" style="--tile-accent:' + accent + '">' +
        '<div class="tile__label">' + t.label + '</div>' +
        '<div class="tile__value">' + t.value + '</div>' +
        '<div class="tile__sub">' + t.sub + '</div></div>';
    }).join('');
  }

  function renderBorrowChart(model) {
    var maxYears = Math.max.apply(null, model.results.map(function (r) { return r.fin.years; }));
    var max = 0;
    model.results.forEach(function (r) {
      r.fin.rows.forEach(function (row) { max = Math.max(max, row.borrow); });
    });
    if (max <= 0) {
      $('#borrowChart').innerHTML = '<p class="panel__hint">No borrowing needed at these numbers — aid, family cash, earnings and savings cover every year.</p>';
      $('#borrowLegend').innerHTML = '';
      return;
    }

    var html = '';
    for (var y = 1; y <= maxYears; y++) {
      var bars = model.results.map(function (r) {
        var row = r.fin.rows[y - 1];
        if (!row) return '';
        var w = (row.borrow / max) * 100;
        var zero = row.borrow <= 0;
        var tip = esc(r.college.name) + ' · year ' + y +
          '<br><span class="tip__key">cost</span> <b>' + usd(row.sticker) + '</b>' +
          '<br><span class="tip__key">gift aid</span> <b>−' + usd(row.aid) + '</b>' +
          '<br><span class="tip__key">cash & savings</span> <b>−' + usd(row.family + row.earnings + row.savings) + '</b>' +
          '<br><span class="tip__key">borrowed</span> <b>' + usd(row.borrow) + '</b>';
        return '<div class="gbar">' +
          '<span class="gbar__name">' + esc(r.college.name) + '</span>' +
          '<span class="track track--slim"><span class="bar' + (zero ? ' is-zero' : '') +
            '" style="width:' + (zero ? 0 : Math.max(w, 0.8)).toFixed(2) +
            '%;background:' + seriesVar(r.index) + '" data-tip="' + esc(tip) + '"></span></span>' +
          '<span class="gbar__value">' + usdShort(row.borrow) + '</span>' +
        '</div>';
      }).join('');
      html += '<div class="group"><div class="group__label">Year ' + y + '</div>' + bars + '</div>';
    }
    $('#borrowChart').innerHTML = html;
    $('#borrowLegend').innerHTML = model.results.map(function (r) {
      return '<span class="legend__item"><span class="legend__swatch" style="background:' + seriesVar(r.index) +
        '"></span>' + esc(r.college.name) + '</span>';
    }).join('');
  }

  function renderCashTable(model) {
    var active = model.results.filter(function (r) { return r.college.id === state.activeCollege; })[0] || model.results[0];
    var f = active.fin;

    var head = '<thead><tr><th>' + esc(active.college.name) + '</th>' +
      '<th>Cost</th><th>Gift aid</th><th>Net</th><th>Family</th><th>Earnings</th><th>Savings</th><th>Borrowed</th></tr></thead>';

    var body = '<tbody>' + f.rows.map(function (r) {
      return '<tr><td>Year ' + r.year + '</td>' +
        '<td>' + usd(r.sticker) + '</td><td>−' + usd(r.aid) + '</td><td>' + usd(r.net) + '</td>' +
        '<td>' + usd(r.family) + '</td><td>' + usd(r.earnings) + '</td><td>' + usd(r.savings) + '</td>' +
        '<td>' + usd(r.borrow) + '</td></tr>';
    }).join('') + '</tbody>';

    var t = f.totals;
    var foot = '<tfoot><tr><td>Total</td><td>' + usd(t.sticker) + '</td><td>−' + usd(t.aid) + '</td>' +
      '<td>' + usd(t.net) + '</td><td>' + usd(t.family) + '</td><td>' + usd(t.earnings) + '</td>' +
      '<td>' + usd(t.savings) + '</td><td>' + usd(t.borrowed) + '</td></tr></tfoot>';

    $('#cashTable').innerHTML = head + body + foot;
  }

  var MIX_KEYS = [
    { key: 'aid', label: 'Gift aid', cat: 0 },
    { key: 'family', label: 'Family cash', cat: 1 },
    { key: 'earnings', label: 'Student earnings', cat: 2 },
    { key: 'savings', label: 'Savings & 529', cat: 3 },
    { key: 'loans', label: 'Loan payments', cat: 4 }
  ];

  function mixValues(f) {
    return {
      aid: f.totals.aid,
      family: f.totals.family,
      earnings: f.totals.earnings,
      savings: f.totals.savings,
      loans: f.totalRepaid
    };
  }

  function renderMixChart(model) {
    var totals = model.results.map(function (r) {
      var v = mixValues(r.fin);
      return MIX_KEYS.reduce(function (a, m) { return a + v[m.key]; }, 0);
    });
    var max = Math.max.apply(null, totals.concat([1]));

    $('#mixChart').innerHTML = '<div class="bars">' + model.results.map(function (r, i) {
      var v = mixValues(r.fin);
      var segs = MIX_KEYS.map(function (m) {
        if (v[m.key] <= 0) return '';
        var share = totals[i] > 0 ? (v[m.key] / totals[i]) * 100 : 0;
        var tip = m.label + '<br><b>' + usd(v[m.key]) + '</b> · ' + pct1(share) + '% of the total';
        return '<span class="seg-fill" style="flex-grow:' + v[m.key].toFixed(0) +
          ';background:' + catVar(m.cat) + '" data-tip="' + esc(tip) + '"></span>';
      }).join('');
      return '<div class="barrow">' +
        '<div class="barrow__head">' +
          '<span class="barrow__name">' +
            '<span class="swatch-dot" style="background:' + seriesVar(r.index) + '"></span>' + esc(r.college.name) +
          '</span>' +
          '<span class="barrow__value">' + usd(totals[i]) + '</span>' +
        '</div>' +
        '<div class="track"><div class="bar" style="width:' + (totals[i] / max * 100).toFixed(2) + '%">' + segs + '</div></div>' +
      '</div>';
    }).join('') + '</div>';

    $('#mixLegend').innerHTML = MIX_KEYS.map(function (m) {
      return '<span class="legend__item"><span class="legend__swatch" style="background:' + catVar(m.cat) +
        '"></span>' + m.label + '</span>';
    }).join('') + '<span class="legend__item">Bar length = sticker price plus loan interest.</span>';
  }

  function renderMixTable(model) {
    var head = '<thead><tr><th>Source</th>' + model.results.map(function (r) {
      return '<th>' + esc(r.college.name) + '</th>';
    }).join('') + '</tr></thead>';

    var body = '<tbody>' + MIX_KEYS.map(function (m) {
      return '<tr><td><span class="swatch-dot" style="background:' + catVar(m.cat) + '"></span>' + m.label + '</td>' +
        model.results.map(function (r) { return '<td>' + usd(mixValues(r.fin)[m.key]) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>';

    var foot = '<tfoot><tr><td>Cost to your family</td>' + model.results.map(function (r) {
      return '<td>' + usd(r.fin.familyCost) + '</td>';
    }).join('') + '</tr></tfoot>';

    $('#mixTable').innerHTML = head + body + foot;
  }

  function updateInputEchoes(model) {
    /* labels that live next to inputs, refreshed without rebuilding the inputs */
    state.criteria.forEach(function (c) {
      var pctEl = document.getElementById('wpct-' + c.id);
      if (pctEl) {
        pctEl.textContent = model.totalWeight > 0
          ? Math.round(num(c.weight) / model.totalWeight * 100) + '%' : '0%';
      }
      var wv = document.getElementById('wval-' + c.id);
      if (wv) wv.textContent = c.weight;
      var mw = document.getElementById('mw-' + c.id);
      if (mw) mw.textContent = 'weight ' + c.weight + (c.weight === 0 ? ' — ignored' : '');
    });

    model.results.forEach(function (r) {
      var autoEl = document.getElementById('auto-' + r.college.id);
      if (autoEl) autoEl.textContent = score1(r.afford) + ' / 10';

      var tot = document.getElementById('mtot-' + r.college.id);
      if (tot) {
        var y1 = r.fin.rows[0];
        tot.innerHTML =
          '<div><span>Year 1 cost after aid</span><b>' + usd(y1 ? y1.net : 0) + '</b></div>' +
          '<div><span>Year 1 borrowing</span><b>' + usd(y1 ? y1.borrow : 0) + '</b></div>' +
          '<div><span>Affordability score</span><b>' + score1(r.afford) + ' / 10</b></div>';
      }
    });
  }

  function recalc() {
    var model = computeAll();
    renderVerdict(model);
    renderRankChart(model);
    renderRankTable(model);
    renderTiles(model);
    renderBorrowChart(model);
    renderCashTable(model);
    renderMixChart(model);
    renderMixTable(model);
    updateInputEchoes(model);
    save();
  }

  function renderAll() {
    if (!collegeById(state.activeCollege)) state.activeCollege = state.colleges[0].id;
    renderWeights();
    renderMatrix();
    renderMoney();
    renderCashTabs();
    recalc();
  }

  /* ============================================================
     INTERACTION
     ============================================================ */

  var tip = null;

  function initTooltip() {
    tip = $('#tooltip');
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-tip]');
      if (!el) return;
      tip.innerHTML = el.getAttribute('data-tip');
      tip.hidden = false;
      placeTip(e);
    });
    document.addEventListener('mousemove', function (e) {
      if (!tip.hidden) {
        if (!e.target.closest('[data-tip]')) { tip.hidden = true; return; }
        placeTip(e);
      }
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest('[data-tip]')) tip.hidden = true;
    });
    window.addEventListener('scroll', function () { tip.hidden = true; }, { passive: true });
  }

  function placeTip(e) {
    var pad = 14;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = e.clientX + pad;
    var y = e.clientY + pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    $('#themeGlyph').textContent = state.theme === 'dark' ? '☾' : state.theme === 'light' ? '☀' : '◐';
    $('#themeBtn').title = 'Theme: ' + state.theme + ' (click to change)';
  }

  function bindEvents() {
    /* live inputs: sliders, numbers, checkboxes, inline names */
    document.addEventListener('input', function (e) {
      var el = e.target;
      var action = el.getAttribute('data-action');
      if (!action) return;

      if (action === 'weight') {
        var crit = el.closest('[data-crit]').getAttribute('data-crit');
        state.criteria.forEach(function (c) { if (c.id === crit) c.weight = clamp(num(el.value), 0, 10); });
        recalc();

      } else if (action === 'score') {
        var col = collegeById(el.getAttribute('data-college'));
        if (!col) return;
        var cid = el.getAttribute('data-crit');
        col.scores[cid] = clamp(num(el.value), 1, 10);
        var badge = document.getElementById('sval-' + col.id + '-' + cid);
        if (badge) badge.textContent = score1(col.scores[cid]) + ' / 10';
        recalc();

      } else if (action === 'fin') {
        var c2 = collegeById(el.getAttribute('data-college'));
        if (!c2) return;
        var field = el.getAttribute('data-field');
        if (el.type === 'checkbox') c2.fin[field] = el.checked;
        else c2.fin[field] = el.value === '' ? 0 : clamp(num(el.value), 0, 1e9);
        recalc();

      } else if (action === 'rename-college') {
        var c3 = collegeById(el.getAttribute('data-college'));
        if (!c3) return;
        c3.name = el.value.slice(0, 40);
        renderMatrixHeadings();
        renderCashTabs();
        recalc();

      } else if (action === 'rename-criterion') {
        var cid2 = el.closest('[data-crit]').getAttribute('data-crit');
        state.criteria.forEach(function (c) { if (c.id === cid2) c.name = el.value.slice(0, 40); });
        renderMatrixLabels();
        recalc();
      }
    });

    /* structural buttons */
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action], [data-view]');
      if (!el) return;
      var action = el.getAttribute('data-action');

      if (el.hasAttribute('data-view')) {
        var target = el.getAttribute('data-target');
        var kind = el.getAttribute('data-view');
        document.querySelectorAll('[data-target="' + target + '"]').forEach(function (b) {
          b.classList.toggle('is-active', b === el);
        });
        document.querySelectorAll('[data-view-for="' + target + '"]').forEach(function (v) {
          v.classList.toggle('is-hidden', v.getAttribute('data-view-kind') !== kind);
        });
        return;
      }

      if (action === 'remove-criterion') {
        var cid = el.closest('[data-crit]').getAttribute('data-crit');
        state.criteria = state.criteria.filter(function (c) { return c.id !== cid; });
        state.colleges.forEach(function (c) { delete c.scores[cid]; });
        renderAll();

      } else if (action === 'remove-college') {
        if (state.colleges.length <= 1) return;
        var id = el.getAttribute('data-college');
        var victim = collegeById(id);
        if (victim && !confirm('Remove ' + victim.name + ' from the comparison?')) return;
        state.colleges = state.colleges.filter(function (c) { return c.id !== id; });
        if (state.activeCollege === id) state.activeCollege = state.colleges[0].id;
        renderAll();

      } else if (action === 'cash-tab') {
        state.activeCollege = el.getAttribute('data-college');
        renderCashTabs();
        recalc();
      }
    });

    $('#addCollege').addEventListener('click', function () {
      if (state.colleges.length >= MAX_COLLEGES) return;
      var scores = {};
      state.criteria.forEach(function (c) { if (!c.auto) scores[c.id] = 5; });
      var col = {
        id: uid('s'),
        name: 'School ' + (state.colleges.length + 1),
        scores: scores,
        fin: defaultFinance({})
      };
      state.colleges.push(col);
      state.activeCollege = col.id;
      renderAll();
      var input = document.querySelector('[data-action="rename-college"][data-college="' + col.id + '"]');
      if (input) { input.focus(); input.select(); }
    });

    function addCriterion() {
      var input = $('#newCriterion');
      var name = input.value.trim();
      if (!name || state.criteria.length >= MAX_CRITERIA) return;
      var crit = { id: uid('c'), name: name.slice(0, 40), weight: 5, auto: false };
      state.criteria.push(crit);
      state.colleges.forEach(function (c) { c.scores[crit.id] = 5; });
      input.value = '';
      renderAll();
    }
    $('#addCriterion').addEventListener('click', addCriterion);
    $('#newCriterion').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addCriterion(); }
    });

    $('#resetBtn').addEventListener('click', function () {
      if (!confirm('Reset every school, priority and number back to the starting example?')) return;
      state = defaultState();
      state.activeCollege = state.colleges[0].id;
      applyTheme();
      renderAll();
      toast('Reset to the starting example.');
    });

    $('#exportBtn').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'college-fit-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('Downloaded a copy of your comparison.');
    });

    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var ok = false;
        try { ok = adopt(JSON.parse(reader.result)); } catch (err) { ok = false; }
        if (ok) {
          applyTheme();
          renderAll();
          toast('Loaded ' + file.name + '.');
        } else {
          toast("That file isn't a College Fit export.");
        }
      };
      reader.onerror = function () { toast('Could not read that file.'); };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#printBtn').addEventListener('click', function () { window.print(); });

    $('#themeBtn').addEventListener('click', function () {
      var order = ['auto', 'light', 'dark'];
      state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
      applyTheme();
      save();
    });
  }

  /* cheap partial refreshes so renaming doesn't tear down live inputs */
  function renderMatrixHeadings() {
    var ths = document.querySelectorAll('#scoreMatrix thead th.school .school__name');
    state.colleges.forEach(function (c, i) {
      if (!ths[i]) return;
      ths[i].innerHTML = '<span class="swatch-dot" style="background:' + seriesVar(i) + '"></span>' + esc(c.name);
    });
  }
  function renderMatrixLabels() {
    var rows = document.querySelectorAll('#scoreMatrix tbody tr');
    state.criteria.forEach(function (crit, i) {
      var cell = rows[i] && rows[i].firstElementChild;
      if (!cell) return;
      cell.innerHTML = esc(crit.name) + '<span class="matrix__weight" id="mw-' + esc(crit.id) + '">weight ' + crit.weight + '</span>';
    });
  }

  /* ---------- boot ---------- */

  load();
  if (!collegeById(state.activeCollege)) state.activeCollege = state.colleges[0].id;
  applyTheme();
  initTooltip();
  bindEvents();
  renderAll();
})();
