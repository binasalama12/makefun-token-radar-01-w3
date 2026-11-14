// Early Scout's dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, the early-finds section, a filterable sortable table and a per-protocol detail
// view with the model's own inputs and the protocol's farm plan. No network: every byte it shows
// is in data.js. URL views: ?view=board (default), ?view=detail&slug=<slug>,
// ?view=filtered&f=<text>.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { q: '', category: 'all', scope: 'all', sort: 'implied', dir: -1, selected: null, view: 'board' };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function chainText(r, n) {
    if (!r.chains || !r.chains.length) return 'an unnamed chain';
    return n ? r.chains.slice(0, n).join(', ') : r.chains.join(', ');
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readParams() {
    var params = new URLSearchParams(window.location.search);
    var view = params.get('view');
    if (view === 'detail' || view === 'filtered' || view === 'board') state.view = view;
    if (params.get('slug')) { state.selected = params.get('slug'); state.view = 'detail'; }
    if (params.get('f')) { state.q = params.get('f'); state.view = 'filtered'; }
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.on_watchlist) return false;
      if (state.scope === 'early' && r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'category') { av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); }
      else if (key === 'chains') { av = chainText(a); bv = chainText(b); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Early Scout' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Early Scout — below-the-floor hunter' }),
        el('p', { html: 'The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M</b> of TVL and no token on record. The early radar adds <b>' + DATA.early_size + ' pre-token protocols below that floor</b>, ranked by what a token would be worth if the protocol\'s record stayed as it is. Age matters most: a protocol that ran for years with no token scores higher than a young one of the same size.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Rows on the board' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early finds below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: fmtUsd(DATA.rows[0] ? DATA.rows[0].implied_value_usd : 0) })),
        el('div', { class: 'fact' }, el('span', { text: 'Median implied value' }), el('b', { text: fmtUsd(DATA.median_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top three' }), el('b', { text: (DATA.top_three || []).map(function (t) { return t.name; }).join(', ') }))
      )
    );
  }

  function earlySection() {
    var early = DATA.rows.filter(function (r) { return !r.on_watchlist; }).slice(0, 6);
    var cards = early.map(function (r) {
      return el('button', { type: 'button', class: 'card', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: 'Early find · rank ' + r.rank }),
        el('b', { text: r.name }),
        el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
        el('span', { class: 'meta', text: (r.category || 'Other') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL · ' + fmtAge(r.age_days) + ' old · ' + chainText(r, 2) })
      );
    });
    return el('section', { class: 'early' },
      el('h2', null, 'Early finds ', el('span', { class: 'tag', text: 'BELOW THE FLOOR' })),
      el('p', { text: 'The strongest pre-token protocols under the $50M watchlist floor, by implied value. These are the launches the floor misses — smaller today, but ranked on the same model.' }),
      el('div', { class: 'cards' }, cards)
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; render(); });
    function scopeBtn(value, label) {
      return el('button', { type: 'button', 'aria-pressed': state.scope === value ? 'true' : 'false', text: label, onclick: function () { state.scope = value; render(); } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Show' }),
        el('div', { class: 'tabs' }, scopeBtn('all', 'All'), scopeBtn('watchlist', 'Watchlist only'), scopeBtn('early', 'Early only'))),
      el('span', { class: 'count', text: rows().length + ' of ' + DATA.board_size + ' rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.scope = 'all'; render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + chainText(r, 2) })
        )),
        el('td', { text: r.category || 'Other' }),
        el('td', { text: chainText(r, 2) }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: r.on_watchlist ? 'status' : 'status early', text: r.on_watchlist ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('category', 'Category'),
            sortHeader('chains', 'Chains'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Set' })
          )),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The maturity term is the biggest lever: a protocol that has run four years with no token earns twice the multiplier of a brand-new one. Implied value is an estimate, not a price, and it never says a token will be issued.' })
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    state.view = 'detail';
    render();
  }

  function detailView() {
    var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
    if (!row) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'Protocol not found' }),
        el('p', { text: 'That slug is not on this board.' }),
        el('button', { class: 'button', type: 'button', text: 'Back to the board', onclick: function () { state.selected = null; state.view = 'board'; render(); } })
      ));
    }
    var steps = row.farm_steps || [];
    var stat = function (label, value, big) {
      return el('div', { class: 'stat' }, el('span', { text: label }), el('b', { class: big ? 'big' : null, text: value }));
    };
    return el('div', null,
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · watchlist' : ' · early find') }),
          el('h1', { text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + chainText(row) })
        ),
        el('button', { class: 'button ghost', type: 'button', text: 'Back to the board', onclick: function () { state.selected = null; state.view = 'board'; render(); } })
      ),
      el('div', { class: 'detail-grid' },
        stat('Implied value', fmtUsd(row.implied_value_usd), true),
        stat('Board position', 'Top ' + Math.max(1, Math.ceil((row.rank / DATA.board_size) * 100)) + '% of the board', false),
        stat('TVL', fmtUsd(row.tvl_usd), false),
        stat('Seven-day change', fmtPct(row.change_7d), false),
        stat('Age with no token', fmtAge(row.age_days), false),
        stat('Growth multiplier', String(row.growth_multiplier), false),
        stat('Maturity multiplier', String(row.maturity_multiplier), false)
      ),
      el('section', { class: 'detail-section' },
        el('h2', { text: 'How the number is made' }),
        el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
      ),
      el('section', { class: 'detail-section' },
        el('h2', { text: 'Farm plan — five steps' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
        }))
      ),
      el('button', { class: 'button ghost back', type: 'button', text: 'Back to the board', onclick: function () { state.selected = null; state.view = 'board'; render(); } })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    if (state.view === 'detail' && state.selected) {
      shell.appendChild(detailView());
    } else {
      shell.appendChild(lede());
      shell.appendChild(earlySection());
      shell.appendChild(controls());
      shell.appendChild(boardTable());
      shell.appendChild(modelPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  readParams();
  render();
})();
