/* 지분플랜 UI — 프레임워크 없음, 오프라인 단일 파일로 동작 */
(function () {
  'use strict';

  var E = window.EquityEngine;
  var CONFIG = window.EQUITYPLAN_CONFIG || {};
  var EDITION = window.EQUITYPLAN_EDITION || 'demo';
  var PRO = EDITION === 'pro';
  var DEMO_MAX_ROUNDS = 3;
  var STORE_KEY = 'equityplan.v1';
  var 억 = 1e8;

  var COLORS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'];

  function example() {
    return window.EquityExample();
  }

  function blank() {
    return {
      company: '',
      seniority: 'stacked',
      exitValue: 100 * 억,
      holders: [{ name: '창업자', kind: 'common', shares: 10000000 }],
      rounds: []
    };
  }

  function load() {
    if (!PRO) return example();
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 저장소를 못 쓰는 환경이면 예시로 시작 */ }
    return example();
  }

  var state = load();
  var stageTab = -1;
  var lastSim = null;

  // ---------- 포맷 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function won(n) {
    if (n == null || !isFinite(n)) return '-';
    var a = Math.abs(n);
    var sign = n < 0 ? '-' : '';
    if (a >= 1e12) return sign + trim((a / 1e12).toFixed(2)) + '조';
    if (a >= 1e8) return sign + trim((a / 1e8).toFixed(a >= 1e10 ? 0 : a >= 1e9 ? 1 : 2)) + '억';
    if (a >= 1e4) return sign + Math.round(a / 1e4).toLocaleString('ko-KR') + '만';
    return sign + Math.round(a).toLocaleString('ko-KR');
  }
  function trim(s) { return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
  function int(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 2 : d) + '%'; }
  function parseNum(v) {
    var n = Number(String(v).replace(/[,\s원주%억]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function fmtInput(v, scale) {
    if (v === '' || v == null) return '';
    var x = v / (scale || 1);
    if (scale > 1) return trim(x.toFixed(4));
    return Math.round(x).toLocaleString('ko-KR');
  }

  // ---------- 상태 경로 ----------
  function getPath(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, state);
  }
  function setPath(path, value) {
    var keys = path.split('.');
    var o = state;
    for (var i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }

  // ---------- 입력 패널 ----------
  function field(label, path, opts) {
    opts = opts || {};
    var v = getPath(path);
    var id = 'f-' + path.replace(/\./g, '-');
    if (opts.type === 'select') {
      return '<label class="fld" for="' + id + '"><span>' + label + '</span><select id="' + id + '" data-path="' + path + '" data-type="text">' +
        opts.options.map(function (o) { return '<option value="' + o[0] + '"' + (String(v) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
        '</select></label>';
    }
    if (opts.type === 'bool') {
      return '<label class="fld chk" for="' + id + '"><input type="checkbox" id="' + id + '" data-path="' + path + '" data-type="bool"' + (v ? ' checked' : '') + '><span>' + label + '</span></label>';
    }
    if (opts.type === 'text') {
      return '<label class="fld" for="' + id + '"><span>' + label + '</span><input id="' + id + '" type="text" data-path="' + path + '" data-type="text" value="' + esc(v) + '" placeholder="' + esc(opts.placeholder || '') + '"></label>';
    }
    return '<label class="fld" for="' + id + '"><span>' + label + '</span><span class="unit-wrap"><input id="' + id + '" type="text" inputmode="decimal" data-path="' + path + '" data-type="num" data-scale="' + (opts.scale || 1) + '" value="' + esc(fmtInput(v, opts.scale)) + '"><em>' + (opts.unit || '') + '</em></span>' +
      (opts.hint ? '<small>' + opts.hint + '</small>' : '') + '</label>';
  }

  function holderRow(h, i) {
    var p = 'holders.' + i;
    return '<div class="row holder-row">' +
      '<input type="text" id="h-name-' + i + '" aria-label="주주 이름" data-path="' + p + '.name" data-type="text" value="' + esc(h.name) + '" placeholder="이름">' +
      '<select id="h-kind-' + i + '" aria-label="주식 종류" data-path="' + p + '.kind" data-type="text">' +
      [['common', '보통주'], ['option', '스톡옵션(부여)'], ['pool', '옵션풀(미부여)']].map(function (o) {
        return '<option value="' + o[0] + '"' + (h.kind === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
      '<span class="unit-wrap"><input type="text" inputmode="numeric" id="h-shares-' + i + '" aria-label="주식수" data-path="' + p + '.shares" data-type="num" data-scale="1" value="' + esc(fmtInput(h.shares, 1)) + '"><em>주</em></span>' +
      '<button class="icon-btn" data-act="del-holder" data-i="' + i + '" aria-label="삭제" title="삭제">×</button></div>';
  }

  function investorRows(r, ri) {
    return (r.investors || []).map(function (inv, ii) {
      var p = 'rounds.' + ri + '.investors.' + ii;
      return '<div class="row inv-row">' +
        '<input type="text" id="r' + ri + '-inv-name-' + ii + '" aria-label="투자자" data-path="' + p + '.name" data-type="text" value="' + esc(inv.name) + '" placeholder="투자자 이름">' +
        '<span class="unit-wrap"><input type="text" inputmode="decimal" id="r' + ri + '-inv-amt-' + ii + '" aria-label="투자금" data-path="' + p + '.amount" data-type="num" data-scale="' + 억 + '" value="' + esc(fmtInput(inv.amount, 억)) + '"><em>억원</em></span>' +
        '<button class="icon-btn" data-act="del-inv" data-r="' + ri + '" data-i="' + ii + '" aria-label="투자자 삭제" title="삭제">×</button></div>';
    }).join('');
  }

  function roundCard(r, i) {
    var p = 'rounds.' + i;
    var isSafe = r.type === 'safe';
    var head = '<div class="round-head"><span class="tag ' + (isSafe ? 'tag-safe' : 'tag-priced') + '">' + (isSafe ? 'SAFE' : '우선주') + '</span>' +
      '<input class="round-name" type="text" id="r' + i + '-name" aria-label="라운드 이름" data-path="' + p + '.name" data-type="text" value="' + esc(r.name) + '">' +
      '<div class="round-tools">' +
      '<button class="icon-btn" data-act="up" data-i="' + i + '" aria-label="위로" title="위로"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button class="icon-btn" data-act="down" data-i="' + i + '" aria-label="아래로" title="아래로"' + (i === state.rounds.length - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button class="icon-btn" data-act="del-round" data-i="' + i + '" aria-label="라운드 삭제" title="삭제">×</button></div></div>';
    var invs = '<div class="sub">투자자</div>' + investorRows(r, i) + '<button class="link-btn" data-act="add-inv" data-r="' + i + '">+ 투자자 추가</button>';
    if (isSafe) {
      return '<article class="card round">' + head + invs +
        '<div class="grid2">' + field('밸류캡', p + '.cap', { scale: 억, unit: '억원', hint: '0이면 캡 없음' }) +
        field('할인율', p + '.discountPct', { unit: '%' }) + '</div>' +
        '<p class="note">다음 가격 라운드에서 캡 가격과 할인 가격 중 낮은 가격으로 전환됩니다.</p></article>';
    }
    var pr = p + '.pref';
    return '<article class="card round">' + head +
      '<div class="grid2">' + field('프리머니 밸류', p + '.preMoney', { scale: 억, unit: '억원' }) +
      field('옵션풀 목표(투자 후)', p + '.poolTargetPct', { unit: '%', hint: '프리머니에 포함해 확대. 0이면 유지' }) + '</div>' +
      invs +
      '<details class="terms"' + (r._open ? ' open' : '') + ' data-i="' + i + '"><summary>우선주 조건 · ' + termSummary(r.pref || {}) + '</summary>' +
      '<div class="grid2">' + field('청산우선권 배수', pr + '.multiple', { unit: 'x' }) +
      field('참가 상한', pr + '.capMultiple', { unit: 'x', hint: '참가적일 때만. 0이면 상한 없음' }) + '</div>' +
      field('참가적 우선주 (우선권 회수 후 보통주와 추가 분배)', pr + '.participating', { type: 'bool' }) +
      '<div class="grid2">' + field('리픽싱(희석방지)', pr + '.antiDilution', { type: 'select', options: [['none', '없음'], ['broad', '가중평균(broad-based)'], ['full', '풀 래칫']] }) +
      field('리픽싱 하한', pr + '.refixFloorPct', { unit: '%', hint: '최초 전환가 대비' }) + '</div>' +
      '</details></article>';
  }

  function termSummary(pf) {
    var m = pf.multiple == null ? 1 : pf.multiple;
    var s = m + 'x ' + (pf.participating ? '참가적' + (pf.capMultiple > 0 ? '(상한 ' + pf.capMultiple + 'x)' : '') : '비참가적');
    s += ' · ' + ({ none: '리픽싱 없음', broad: '가중평균 리픽싱', full: '풀 래칫' }[pf.antiDilution || 'none']);
    return s;
  }

  function renderInputs() {
    var el = document.getElementById('inputs');
    el.innerHTML =
      '<section class="card"><h2>회사</h2>' + field('회사명', 'company', { type: 'text', placeholder: '예: 주식회사 ○○' }) + '</section>' +
      '<section class="card"><h2>설립 시 지분</h2><p class="note">보통주, 부여된 스톡옵션, 미부여 옵션풀을 입력하세요.</p>' +
      '<div class="row holder-row row-head"><span>주주</span><span>종류</span><span>주식수</span><span></span></div>' +
      state.holders.map(holderRow).join('') +
      '<button class="link-btn" data-act="add-holder">+ 주주 추가</button></section>' +
      '<h2 class="section-title">투자 라운드 <span class="count">' + state.rounds.length + '</span></h2>' +
      state.rounds.map(roundCard).join('') +
      '<div class="add-round"><button class="btn" data-act="add-priced">+ 가격 라운드</button><button class="btn ghost" data-act="add-safe">+ SAFE</button></div>';
  }

  // ---------- 결과 ----------
  function colorMap(stages) {
    var map = {};
    var n = 0;
    stages.forEach(function (s) {
      s.holders.forEach(function (h) {
        if (!(h.holder in map)) map[h.holder] = COLORS[n++ % COLORS.length];
      });
    });
    return map;
  }

  function founderNames() {
    return state.holders.filter(function (h) { return (h.kind || 'common') === 'common' && h.shares > 0; })
      .map(function (h) { return (h.name || '').trim() || '(이름 없음)'; });
  }

  function renderKpis(sim) {
    var last = sim.stages[sim.stages.length - 1];
    var fn = founderNames();
    var fpct = E.aggregateHolders(last.positions).filter(function (h) { return fn.indexOf(h.holder) >= 0; })
      .reduce(function (s, h) { return s + h.pct; }, 0);
    var priced = sim.stages.filter(function (s) { return s.round && s.round.type === 'priced'; });
    var raised = priced.reduce(function (s, st) {
      return s + st.round.invested + st.round.safeConversions.reduce(function (a, c) { return a + c.amount; }, 0);
    }, 0);
    var post = priced.length ? priced[priced.length - 1].round.postMoney : null;
    return '<div class="kpis">' +
      kpi('창업자 지분 (최종, 완전희석)', pct(fpct, 1), fn.length + '명 합계') +
      kpi('최종 포스트머니', post ? won(post) + '원' : '-', priced.length ? priced[priced.length - 1].name : '가격 라운드 없음') +
      kpi('누적 투자유치', won(raised) + '원', priced.length + '개 가격 라운드') +
      kpi('완전희석 주식수', int(last.fd) + '주', '옵션풀 포함') +
      '</div>';
  }
  function kpi(label, value, sub) {
    return '<div class="kpi"><span class="k-label">' + label + '</span><strong class="k-value">' + value + '</strong><span class="k-sub">' + esc(sub) + '</span></div>';
  }

  function renderEvolution(sim, colors) {
    var W = 640, rowH = 30, gap = 12, left = 112, right = 8;
    var barW = W - left - right;
    var H = sim.stages.length * (rowH + gap) + 4;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="evo" role="img" aria-label="라운드별 지분 변화">';
    sim.stages.forEach(function (s, si) {
      var y = si * (rowH + gap);
      svg += '<text x="0" y="' + (y + rowH / 2 + 4) + '" class="ax-label">' + esc(s.name.length > 12 ? s.name.slice(0, 11) + '…' : s.name) + '</text>';
      var x = left;
      s.holders.forEach(function (h) {
        var w = barW * h.pct;
        if (w <= 0) return;
        svg += '<rect x="' + x.toFixed(2) + '" y="' + y + '" width="' + Math.max(0, w - 1).toFixed(2) + '" height="' + rowH + '" class="fill-' + colors[h.holder] + '"><title>' + esc(h.holder) + ' ' + pct(h.pct) + '</title></rect>';
        if (w > 44) svg += '<text x="' + (x + 6).toFixed(2) + '" y="' + (y + rowH / 2 + 4) + '" class="seg-label">' + pct(h.pct, 1) + '</text>';
        x += w;
      });
    });
    svg += '</svg>';
    var names = Object.keys(colors);
    var legend = '<ul class="legend">' + names.map(function (n) {
      return '<li><i class="fill-' + colors[n] + '"></i>' + esc(n) + '</li>';
    }).join('') + '</ul>';
    return svg + legend;
  }

  function roundDetail(s) {
    var r = s.round;
    if (!r) return '<p class="note">설립 시점 지분입니다.</p>';
    if (r.type === 'skipped') return '<p class="note warn-text">입력값이 부족해 이 라운드는 계산되지 않았습니다.</p>';
    if (r.type === 'safe') {
      return '<dl class="facts"><div><dt>SAFE 투자금</dt><dd>' + won(r.amount) + '원</dd></div><div><dt>밸류캡</dt><dd>' + (r.cap > 0 ? won(r.cap) + '원' : '없음') + '</dd></div>' +
        '<div><dt>할인율</dt><dd>' + (r.discountPct || 0) + '%</dd></div></dl><p class="note">아직 주식이 아닙니다. 다음 가격 라운드에서 전환됩니다.</p>';
    }
    var h = '<dl class="facts">' +
      '<div><dt>주당 가격</dt><dd>' + int(r.price) + '원</dd></div>' +
      '<div><dt>프리머니</dt><dd>' + won(r.preMoney) + '원</dd></div>' +
      '<div><dt>포스트머니</dt><dd>' + won(r.postMoney) + '원</dd></div>' +
      '<div><dt>실제 납입액</dt><dd>' + won(r.invested) + '원</dd></div>' +
      '<div><dt>신주 발행</dt><dd>' + int(r.newShares) + '주</dd></div>' +
      '<div><dt>옵션풀 확대</dt><dd>' + (r.poolAdd ? '+' + int(r.poolAdd) + '주' : '없음') + ' · 투자 후 ' + pct(r.poolPct, 1) + '</dd></div></dl>';
    if (r.safeConversions.length) {
      h += '<div class="sub">SAFE 전환</div><ul class="plain">' + r.safeConversions.map(function (c) {
        return '<li>' + esc(c.holder) + ': ' + won(c.amount) + '원 → 주당 ' + int(c.price) + '원 (라운드가 대비 ' + pct(c.discountVsRound, 1) + ' 할인), ' + int(c.shares) + '주</li>';
      }).join('') + '</ul>';
    }
    if (r.refixes.length) {
      h += '<div class="sub">리픽싱 발동</div><ul class="plain">' + r.refixes.map(function (x) {
        return '<li>' + esc(x.className) + ': 전환가격 ' + int(x.from) + '원 → ' + int(x.to) + '원' + (x.floorHit ? ' (하한 적용)' : '') + ', 보통주 환산 +' + int(x.extraShares) + '주</li>';
      }).join('') + '</ul>';
    }
    return h;
  }

  function renderCapTable(sim, colors) {
    if (stageTab < 0 || stageTab >= sim.stages.length) stageTab = sim.stages.length - 1;
    var s = sim.stages[stageTab];
    var clsName = {};
    s.classes.forEach(function (c) { clsName[c.id] = c.name; });
    var tabs = '<div class="tabs" role="tablist">' + sim.stages.map(function (st, i) {
      return '<button role="tab" id="tab-' + i + '" aria-selected="' + (i === stageTab) + '" data-act="tab" data-i="' + i + '">' + esc(st.name) + '</button>';
    }).join('') + '</div>';
    var rows = s.positions.slice().sort(function (a, b) { return b.asConverted - a.asConverted; }).map(function (p) {
      return '<tr><td><i class="dot fill-' + colors[p.holder] + '"></i>' + esc(p.holder) + '</td><td>' + esc(clsName[p.classId] || p.classId) + '</td>' +
        '<td class="n">' + int(p.shares) + '</td><td class="n">' + int(p.asConverted) + '</td><td class="n">' + pct(s.fd ? p.asConverted / s.fd : 0) + '</td>' +
        '<td class="n">' + (p.invested ? won(p.invested) : '-') + '</td></tr>';
    }).join('');
    var holders = s.holders.slice().sort(function (a, b) { return b.pct - a.pct; }).map(function (h) {
      return '<tr><td><i class="dot fill-' + colors[h.holder] + '"></i>' + esc(h.holder) + '</td><td class="n">' + int(h.asConverted) + '</td><td class="n strong">' + pct(h.pct) + '</td><td class="n">' + (h.invested ? won(h.invested) : '-') + '</td></tr>';
    }).join('');
    return tabs + '<div class="detail">' + roundDetail(s) + '</div>' +
      '<div class="sub">주주별 합계</div><div class="tbl-wrap"><table><thead><tr><th>주주</th><th class="n">보통주 환산</th><th class="n">완전희석 지분</th><th class="n">투자금</th></tr></thead><tbody>' + holders +
      '</tbody><tfoot><tr><td>합계</td><td class="n">' + int(s.fd) + '</td><td class="n">100.00%</td><td></td></tr></tfoot></table></div>' +
      '<details class="raw"><summary>주식 종류별 상세 (주주명부 형식)</summary><div class="tbl-wrap"><table><thead><tr><th>주주</th><th>주식 종류</th><th class="n">주식수</th><th class="n">보통주 환산</th><th class="n">지분</th><th class="n">투자금</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>';
  }

  function renderExit(sim, colors) {
    var last = sim.stages[sim.stages.length - 1];
    var lastPriced = sim.stages.filter(function (s) { return s.round && s.round.type === 'priced'; }).pop();
    var maxExit = Math.max(10 * 억, (lastPriced ? lastPriced.round.postMoney : 50 * 억) * 4);
    var exit = state.exitValue == null ? maxExit / 4 : state.exitValue;
    var res = E.waterfall(last, exit, state.seniority);
    var head = '<div class="exit-controls">' +
      '<label class="fld" for="exit-input"><span>엑싯(매각) 금액</span><span class="unit-wrap"><input id="exit-input" type="text" inputmode="decimal" data-path="exitValue" data-type="num" data-scale="' + 억 + '" value="' + esc(fmtInput(exit, 억)) + '"><em>억원</em></span></label>' +
      '<input id="exit-range" type="range" aria-label="엑싯 금액 조절" min="0" max="' + Math.round(maxExit / 억) + '" step="1" value="' + Math.min(Math.round(exit / 억), Math.round(maxExit / 억)) + '">' +
      field('청산 순위', 'seniority', { type: 'select', options: [['stacked', '후속 라운드 선순위'], ['pari', '우선주 동순위']] }) + '</div>';
    var rows = res.holders.slice().sort(function (a, b) { return b.payout - a.payout; }).map(function (h) {
      return '<tr><td><i class="dot fill-' + colors[h.holder] + '"></i>' + esc(h.holder) + '</td><td class="n strong">' + won(h.payout) + '원</td><td class="n">' + pct(h.share, 1) + '</td>' +
        '<td class="n">' + (h.multiple == null ? '-' : h.multiple.toFixed(2) + 'x') + '</td></tr>';
    }).join('');
    var cls = res.classes.length ? '<ul class="chips">' + res.classes.map(function (c) {
      return '<li class="' + (c.converted ? 'chip-conv' : 'chip-pref') + '">' + esc(c.name) + ': ' + (c.converted ? '보통주 전환이 유리' : '우선권 행사 (' + won(c.preference) + '원)') + '</li>';
    }).join('') + '</ul>' : '';
    var curve = E.payoutCurve(last, maxExit, 60, state.seniority);
    return head + cls + '<div class="tbl-wrap"><table><thead><tr><th>주주</th><th class="n">분배액</th><th class="n">비중</th><th class="n">투자 배수</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="sub">엑싯 금액별 분배액</div>' + exitChart(curve, exit, maxExit, colors) +
      (res.leftover > 1 ? '<p class="note warn-text">분배되지 않은 잔액 ' + won(res.leftover) + '원이 있습니다. 보통주 주주가 없는지 확인하세요.</p>' : '');
  }

  function exitChart(curve, exit, maxExit, colors) {
    var W = 640, H = 280, L = 56, R = 12, T = 12, B = 34;
    var end = curve[curve.length - 1].result.holders.slice().sort(function (a, b) { return b.payout - a.payout; }).slice(0, 6).map(function (h) { return h.holder; });
    var maxY = 0;
    curve.forEach(function (pt) {
      pt.result.holders.forEach(function (h) { if (end.indexOf(h.holder) >= 0 && h.payout > maxY) maxY = h.payout; });
    });
    maxY = niceCeil(maxY || 1);
    function x(v) { return L + (W - L - R) * v / maxExit; }
    function y(v) { return T + (H - T - B) * (1 - v / maxY); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="exit-chart" role="img" aria-label="엑싯 금액별 주주 분배액">';
    for (var g = 0; g <= 4; g++) {
      var gv = maxY * g / 4;
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" class="grid"/>';
      svg += '<text x="' + (L - 6) + '" y="' + (y(gv) + 4) + '" class="ax-label" text-anchor="end">' + won(gv) + '</text>';
    }
    for (var t = 0; t <= 4; t++) {
      var tv = maxExit * t / 4;
      svg += '<text x="' + x(tv) + '" y="' + (H - 12) + '" class="ax-label" text-anchor="' + (t === 0 ? 'start' : t === 4 ? 'end' : 'middle') + '">' + won(tv) + '</text>';
    }
    end.forEach(function (name) {
      var d = curve.map(function (pt, i) {
        var h = pt.result.holders.filter(function (z) { return z.holder === name; })[0];
        return (i ? 'L' : 'M') + x(pt.exit).toFixed(1) + ' ' + y(h ? h.payout : 0).toFixed(1);
      }).join(' ');
      svg += '<path d="' + d + '" class="line stroke-' + colors[name] + '" fill="none"><title>' + esc(name) + '</title></path>';
    });
    if (exit <= maxExit) svg += '<line x1="' + x(exit) + '" x2="' + x(exit) + '" y1="' + T + '" y2="' + (H - B) + '" class="marker"/>';
    svg += '</svg>';
    return svg + '<ul class="legend">' + end.map(function (n) { return '<li><i class="fill-' + colors[n] + '"></i>' + esc(n) + '</li>'; }).join('') + '</ul>';
  }

  function niceCeil(v) {
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / p;
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) if (m <= steps[i]) return steps[i] * p;
    return 10 * p;
  }

  function renderResults() {
    var sim = E.simulate(state);
    lastSim = sim;
    var colors = colorMap(sim.stages);
    document.getElementById('company-title').textContent = state.company || '이름 없는 회사';
    document.getElementById('warnings').innerHTML = sim.warnings.map(function (w) { return '<p class="warn">' + esc(w) + '</p>'; }).join('');
    document.getElementById('kpis').innerHTML = renderKpis(sim);
    document.getElementById('evolution').innerHTML = renderEvolution(sim, colors);
    document.getElementById('captable').innerHTML = renderCapTable(sim, colors);
    var active = document.activeElement && document.activeElement.id;
    document.getElementById('exit').innerHTML = renderExit(sim, colors);
    if (active === 'exit-input' || active === 'exit-range' || active === 'f-seniority') {
      var el = document.getElementById(active);
      if (el) {
        el.focus();
        if (el.setSelectionRange && el.type === 'text') { var n = el.value.length; el.setSelectionRange(n, n); }
      }
    }
    document.getElementById('print-date').textContent = new Date().toLocaleDateString('ko-KR');
    save();
  }

  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(renderResults, 120);
  }

  function save() {
    if (!PRO) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 불가 환경 */ }
  }

  // ---------- 모달 ----------
  function modal(html) {
    var m = document.getElementById('modal');
    m.innerHTML = '<div class="modal-back" data-act="close-modal"></div><div class="modal-box" role="dialog" aria-modal="true">' + html + '</div>';
    m.hidden = false;
    var b = m.querySelector('button, a');
    if (b) b.focus();
  }
  function closeModal() {
    var m = document.getElementById('modal');
    m.hidden = true;
    m.innerHTML = '';
  }
  function upsell(title) {
    modal('<h3>' + esc(title) + '</h3>' +
      '<p>체험판은 계산을 모두 해볼 수 있지만, 저장·불러오기·엑셀/PDF 내보내기와 4개 이상 라운드는 정식판에서 열립니다.</p>' +
      '<ul class="plain"><li>1회 결제 ' + esc(CONFIG.price || '') + ', 구독 없음</li><li>설치·가입 없이 PC에서 파일 하나로 실행</li><li>입력한 지분 정보는 내 PC 밖으로 나가지 않음</li></ul>' +
      '<div class="modal-actions"><a class="btn" href="' + esc(CONFIG.buyUrl || '#') + '" target="_blank" rel="noopener">정식판 구매</a><button class="btn ghost" data-act="close-modal">계속 체험하기</button></div>');
  }

  // ---------- 내보내기 ----------
  function download(name, mime, content) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function fileBase() {
    return (state.company || '지분플랜').replace(/[\\/:*?"<>|]/g, '').trim() + '_' + new Date().toISOString().slice(0, 10);
  }
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv() {
    var sim = lastSim || E.simulate(state);
    var lines = [];
    function row(arr) { lines.push(arr.map(csvCell).join(',')); }
    row([CONFIG.name || '지분플랜', state.company || '', new Date().toLocaleDateString('ko-KR')]);
    row([]);
    row(['라운드 요약']);
    row(['라운드', '유형', '프리머니(원)', '주당가격(원)', '납입액(원)', '신주(주)', '옵션풀 확대(주)', '포스트머니(원)']);
    sim.stages.forEach(function (s) {
      var r = s.round;
      if (!r) return;
      if (r.type === 'priced') row([s.name, '가격 라운드', r.preMoney, r.price, r.invested, r.newShares, r.poolAdd, Math.round(r.postMoney)]);
      else if (r.type === 'safe') row([s.name, 'SAFE', '', '', r.amount, '', '', '']);
    });
    sim.stages.forEach(function (s) {
      row([]);
      row(['캡테이블: ' + s.name]);
      row(['주주', '주식 종류', '주식수', '보통주 환산', '완전희석 지분(%)', '투자금(원)']);
      var cn = {};
      s.classes.forEach(function (c) { cn[c.id] = c.name; });
      s.positions.forEach(function (p) {
        row([p.holder, cn[p.classId] || p.classId, p.shares, p.asConverted, (s.fd ? p.asConverted / s.fd * 100 : 0).toFixed(4), Math.round(p.invested)]);
      });
      row(['합계', '', '', s.fd, '100', '']);
    });
    var last = sim.stages[sim.stages.length - 1];
    var w = E.waterfall(last, state.exitValue || 0, state.seniority);
    row([]);
    row(['엑싯 분배: ' + Math.round(w.exit) + '원', state.seniority === 'pari' ? '우선주 동순위' : '후속 라운드 선순위']);
    row(['주주', '분배액(원)', '비중(%)', '투자 배수']);
    w.holders.forEach(function (h) { row([h.holder, Math.round(h.payout), (h.share * 100).toFixed(2), h.multiple == null ? '' : h.multiple.toFixed(2)]); });
    download(fileBase() + '.csv', 'text/csv;charset=utf-8', '﻿' + lines.join('\r\n'));
  }

  // ---------- 이벤트 ----------
  function onInput(e) {
    var t = e.target;
    if (t.id === 'exit-range') {
      state.exitValue = Number(t.value) * 억;
      var inp = document.getElementById('exit-input');
      if (inp) inp.value = t.value;
      schedule();
      return;
    }
    var path = t.getAttribute('data-path');
    if (!path) return;
    var type = t.getAttribute('data-type');
    var v;
    if (type === 'bool') v = t.checked;
    else if (type === 'num') v = parseNum(t.value) * Number(t.getAttribute('data-scale') || 1);
    else v = t.value;
    setPath(path, v);
    var details = t.closest('details.terms');
    if (details) details.querySelector('summary').textContent = '우선주 조건 · ' + termSummary(state.rounds[Number(details.getAttribute('data-i'))].pref || {});
    if (t.closest('#inputs') && /\.(kind)$/.test(path)) { /* 종류 변경은 결과만 다시 그리면 됨 */ }
    schedule();
  }

  function newPriced() {
    var names = ['Seed', 'Pre-A', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E'];
    var used = state.rounds.map(function (r) { return r.name; });
    var lastIdx = -1;
    used.forEach(function (nm) { var j = names.indexOf(nm); if (j > lastIdx) lastIdx = j; });
    var n = lastIdx + 1;
    while (n < names.length && used.indexOf(names[n]) >= 0) n++;
    var lastPriced = null;
    if (lastSim) lastPriced = lastSim.stages.filter(function (s) { return s.round && s.round.type === 'priced'; }).pop();
    var pre = lastPriced ? Math.round(lastPriced.round.postMoney * 2 / 억) * 억 : 40 * 억;
    return {
      type: 'priced', name: names[n] || ('라운드 ' + (state.rounds.length + 1)), preMoney: pre, poolTargetPct: 0, _open: true,
      investors: [{ name: '', amount: Math.round(pre / 4 / 억) * 억 }],
      pref: { multiple: 1, participating: false, capMultiple: 0, antiDilution: 'broad', refixFloorPct: 70 }
    };
  }

  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    var i = Number(b.getAttribute('data-i'));
    var structural = true;
    switch (act) {
      case 'add-holder': state.holders.push({ name: '', kind: 'common', shares: 0 }); break;
      case 'del-holder': state.holders.splice(i, 1); break;
      case 'add-priced':
      case 'add-safe':
        if (!PRO && state.rounds.length >= DEMO_MAX_ROUNDS) { upsell('라운드 4개 이상은 정식판에서 열립니다'); return; }
        state.rounds.push(act === 'add-safe'
          ? { type: 'safe', name: 'SAFE', investors: [{ name: '', amount: 1 * 억 }], cap: 30 * 억, discountPct: 20 }
          : newPriced());
        break;
      case 'del-round': state.rounds.splice(i, 1); stageTab = -1; break;
      case 'up': if (i > 0) state.rounds.splice(i - 1, 0, state.rounds.splice(i, 1)[0]); break;
      case 'down': if (i < state.rounds.length - 1) state.rounds.splice(i + 1, 0, state.rounds.splice(i, 1)[0]); break;
      case 'add-inv': state.rounds[Number(b.getAttribute('data-r'))].investors.push({ name: '', amount: 0 }); break;
      case 'del-inv': state.rounds[Number(b.getAttribute('data-r'))].investors.splice(i, 1); break;
      case 'tab': stageTab = i; structural = false; break;
      case 'close-modal': closeModal(); return;
      case 'example':
        modal('<h3>예시를 불러올까요?</h3><p>지금 입력한 내용이 예시 데이터로 바뀝니다.</p><div class="modal-actions"><button class="btn" data-act="do-example">예시 불러오기</button><button class="btn ghost" data-act="close-modal">취소</button></div>');
        return;
      case 'reset':
        modal('<h3>새로 시작할까요?</h3><p>지금 입력한 내용이 지워집니다. 필요하면 먼저 저장하세요.</p><div class="modal-actions"><button class="btn" data-act="do-reset">새로 시작</button><button class="btn ghost" data-act="close-modal">취소</button></div>');
        return;
      case 'do-example': state = example(); stageTab = -1; closeModal(); break;
      case 'do-reset': state = blank(); stageTab = -1; closeModal(); break;
      case 'save':
        if (!PRO) { upsell('저장은 정식판 기능입니다'); return; }
        download(fileBase() + '.equityplan.json', 'application/json', JSON.stringify(state, null, 2));
        return;
      case 'open':
        if (!PRO) { upsell('불러오기는 정식판 기능입니다'); return; }
        document.getElementById('file-input').click();
        return;
      case 'csv':
        if (!PRO) { upsell('엑셀 내보내기는 정식판 기능입니다'); return; }
        exportCsv();
        return;
      case 'print':
        if (!PRO) { upsell('PDF 보고서는 정식판 기능입니다'); return; }
        window.print();
        return;
      case 'buy': upsell('정식판으로 모든 기능을 여세요'); return;
      default: return;
    }
    if (structural) renderInputs();
    renderResults();
  }

  function onFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.holders) || !Array.isArray(data.rounds)) throw new Error('형식 오류');
        state = data;
        stageTab = -1;
        renderInputs();
        renderResults();
      } catch (err) {
        modal('<h3>파일을 열 수 없습니다</h3><p>지분플랜에서 저장한 .equityplan.json 파일인지 확인하세요.</p><div class="modal-actions"><button class="btn" data-act="close-modal">확인</button></div>');
      }
      e.target.value = '';
    };
    reader.readAsText(f);
  }

  function onToggle(e) {
    var d = e.target;
    if (d.matches && d.matches('details.terms')) {
      var r = state.rounds[Number(d.getAttribute('data-i'))];
      if (r) r._open = d.open;
    }
  }

  function boot() {
    document.body.classList.add(PRO ? 'is-pro' : 'is-demo');
    document.querySelectorAll('[data-brand]').forEach(function (el) { el.textContent = CONFIG.name || '지분플랜'; });
    document.querySelectorAll('[data-price]').forEach(function (el) { el.textContent = CONFIG.price || ''; });
    document.addEventListener('input', onInput);
    document.addEventListener('change', function (e) { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') onInput(e); });
    document.addEventListener('click', onClick);
    document.addEventListener('toggle', onToggle, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    document.getElementById('file-input').addEventListener('change', onFile);
    renderInputs();
    renderResults();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
