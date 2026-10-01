/*
 * 지분플랜 계산 엔진 — 의존성 없음. 브라우저(전역 EquityEngine)와 Node(require) 양쪽에서 동작한다.
 *
 * 금액 단위는 원, 주식수는 주. 한국 투자계약 관행을 따른다:
 *  - 주당 가격은 원 단위 반올림, 발행 주식수는 내림 (실제 납입액 = 주식수 × 주당가격)
 *  - 우선주(RCPS)는 라운드마다 별도 종류로 발행, 리픽싱(전환가격 조정)은 하한(%)을 둘 수 있음
 *  - SAFE(조건부지분인수계약)는 다음 가격 라운드에서 min(밸류캡 가격, 할인 가격)으로 전환
 */
(function (root) {
  'use strict';

  var EPS = 1e-9;

  function sum(arr, fn) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += fn ? fn(arr[i], i) : arr[i];
    return s;
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function fdShares(positions) {
    return sum(positions, function (p) { return p.asConverted; });
  }

  function roundPrice(p) {
    return Math.max(1, Math.round(p));
  }

  function refreshConversion(positions, cls) {
    positions.forEach(function (p) {
      if (p.classId === cls.id) p.asConverted = Math.floor(p.shares * cls.origPrice / cls.convPrice + EPS);
    });
  }

  function aggregateHolders(positions) {
    var fd = fdShares(positions);
    var map = {};
    var order = [];
    positions.forEach(function (p) {
      if (!map[p.holder]) {
        map[p.holder] = { holder: p.holder, shares: 0, asConverted: 0, invested: 0, kinds: {} };
        order.push(p.holder);
      }
      var h = map[p.holder];
      h.shares += p.shares;
      h.asConverted += p.asConverted;
      h.invested += p.invested;
      h.kinds[p.kind] = true;
    });
    return order.map(function (k) {
      var h = map[k];
      h.pct = fd > 0 ? h.asConverted / fd : 0;
      h.kinds = Object.keys(h.kinds);
      return h;
    });
  }

  /**
   * 시나리오 전체를 순서대로 계산해 단계별 캡테이블을 돌려준다.
   * @returns {{stages: Array, warnings: string[], pendingSafes: Array}}
   */
  function simulate(sc) {
    var warnings = [];
    var classes = [
      { id: 'common', name: '보통주', kind: 'common' },
      { id: 'option', name: '스톡옵션(부여)', kind: 'option' },
      { id: 'pool', name: '옵션풀(미부여)', kind: 'pool' }
    ];
    var positions = (sc.holders || [])
      .filter(function (h) { return num(h.shares) > 0; })
      .map(function (h) {
        var kind = h.kind === 'option' || h.kind === 'pool' ? h.kind : 'common';
        var s = Math.floor(num(h.shares));
        return { holder: (h.name || '').trim() || '(이름 없음)', classId: kind, kind: kind, shares: s, invested: 0, asConverted: s };
      });

    var stages = [];
    function snapshot(name, round) {
      stages.push({
        name: name,
        round: round,
        positions: clone(positions),
        classes: clone(classes),
        fd: fdShares(positions),
        holders: aggregateHolders(positions),
        pendingSafeAmount: sum(pendingSafes, function (s) { return s.amount; })
      });
    }

    var pendingSafes = [];
    snapshot('설립', null);

    (sc.rounds || []).forEach(function (r, idx) {
      var label = (r.name || '').trim() || ('라운드 ' + (idx + 1));
      var investors = (r.investors || []).filter(function (i) { return num(i.amount) > 0; });

      if (r.type === 'safe') {
        investors.forEach(function (i) {
          pendingSafes.push({
            round: label,
            holder: (i.name || '').trim() || (label + ' 투자자'),
            amount: num(i.amount),
            cap: num(r.cap),
            discount: Math.min(0.95, Math.max(0, num(r.discountPct) / 100))
          });
        });
        if (!investors.length) warnings.push(label + ': 투자 금액이 없어 계산에서 제외했습니다.');
        if (num(r.cap) <= 0 && num(r.discountPct) <= 0) warnings.push(label + ': 밸류캡과 할인율이 모두 없으면 다음 라운드 가격으로 그대로 전환됩니다.');
        snapshot(label, { type: 'safe', amount: sum(investors, function (i) { return num(i.amount); }), cap: num(r.cap), discountPct: num(r.discountPct) });
        return;
      }

      var pre = num(r.preMoney);
      var I = sum(investors, function (i) { return num(i.amount); });
      var S0 = fdShares(positions);
      if (pre <= 0 || I <= 0 || S0 <= 0) {
        warnings.push(label + ': ' + (S0 <= 0 ? '기존 주식이 없어' : '프리머니와 투자금을 입력해야') + ' 계산할 수 있습니다. 이 라운드는 건너뜁니다.');
        snapshot(label, { type: 'skipped' });
        return;
      }
      var U0 = sum(positions.filter(function (p) { return p.kind === 'pool'; }), function (p) { return p.asConverted; });
      var t = Math.min(0.5, Math.max(0, num(r.poolTargetPct) / 100));

      // 옵션풀 확대(프리머니에 포함)와 SAFE 전환이 서로의 주당가격에 영향을 주므로 고정점 반복으로 푼다.
      var poolAdd = 0;
      var safeSh = pendingSafes.map(function () { return 0; });
      var P = pre / S0;
      function safePrice(s, price, base) {
        var capPrice = s.cap > 0 ? s.cap / base : Infinity;
        return Math.min(capPrice, price * (1 - s.discount));
      }
      for (var k = 0; k < 1000; k++) {
        var base = S0 + poolAdd + sum(safeSh);
        P = pre / base;
        var nextSafe = pendingSafes.map(function (s) { return s.amount / safePrice(s, P, base); });
        var nextPool = poolAdd;
        if (t > 0) {
          var post = S0 + poolAdd + sum(nextSafe) + I / P;
          nextPool = Math.max(0, t * post - U0);
        }
        var delta = Math.abs(nextPool - poolAdd) + sum(nextSafe, function (v, i) { return Math.abs(v - safeSh[i]); });
        safeSh = nextSafe;
        poolAdd = nextPool;
        if (delta < 1e-7) break;
      }
      var baseFinal = S0 + poolAdd + sum(safeSh);
      P = roundPrice(pre / baseFinal);
      poolAdd = Math.ceil(poolAdd - 1e-6);

      var classId = 'r' + idx;
      var pref = r.pref || {};
      var cls = {
        id: classId,
        name: label + ' 우선주',
        kind: 'preferred',
        roundIndex: idx,
        origPrice: P,
        convPrice: P,
        multiple: Math.max(0, num(pref.multiple === undefined ? 1 : pref.multiple)),
        participating: !!pref.participating,
        capMultiple: Math.max(0, num(pref.capMultiple)),
        antiDilution: pref.antiDilution || 'none',
        refixFloorPct: Math.min(100, Math.max(0, num(pref.refixFloorPct === undefined ? 70 : pref.refixFloorPct)))
      };

      var newPositions = [];
      var safeConversions = pendingSafes.map(function (s) {
        var price = roundPrice(safePrice(s, P, baseFinal));
        var shares = Math.floor(s.amount / price);
        newPositions.push({ holder: s.holder, classId: classId, kind: 'preferred', shares: shares, invested: s.amount, asConverted: shares, fromSafe: true });
        return { holder: s.holder, round: s.round, amount: s.amount, price: price, shares: shares, discountVsRound: 1 - price / P };
      });
      var investorRows = investors.map(function (i) {
        var amount = num(i.amount);
        var shares = Math.floor(amount / P);
        var name = (i.name || '').trim() || (label + ' 투자자');
        newPositions.push({ holder: name, classId: classId, kind: 'preferred', shares: shares, invested: shares * P, asConverted: shares });
        return { holder: name, committed: amount, invested: shares * P, shares: shares };
      });
      var newShares = sum(newPositions, function (p) { return p.shares; });

      // 기존 우선주 리픽싱(희석방지) — 이번 라운드 가격이 전환가격보다 낮을 때만
      var refixes = [];
      var newMoney = I + sum(pendingSafes, function (s) { return s.amount; });
      classes.forEach(function (c) {
        if (c.kind !== 'preferred' || c.antiDilution === 'none' || P >= c.convPrice) return;
        var floorPrice = c.origPrice * c.refixFloorPct / 100;
        var target;
        if (c.antiDilution === 'full') {
          target = P;
        } else {
          var A = S0;
          var B = newMoney / c.convPrice;
          var C = newShares;
          target = c.convPrice * (A + B) / (A + C);
        }
        var nextCP = roundPrice(Math.max(target, floorPrice));
        if (nextCP >= c.convPrice) return;
        var before = sum(positions.filter(function (p) { return p.classId === c.id; }), function (p) { return p.asConverted; });
        var from = c.convPrice;
        c.convPrice = nextCP;
        refreshConversion(positions, c);
        var after = sum(positions.filter(function (p) { return p.classId === c.id; }), function (p) { return p.asConverted; });
        refixes.push({ className: c.name, from: from, to: nextCP, extraShares: after - before, floorHit: nextCP === roundPrice(floorPrice) && target < floorPrice });
      });

      if (poolAdd > 0) {
        var pool = positions.filter(function (p) { return p.kind === 'pool'; })[0];
        if (pool) {
          pool.shares += poolAdd;
          pool.asConverted += poolAdd;
        } else {
          positions.push({ holder: '옵션풀(미부여)', classId: 'pool', kind: 'pool', shares: poolAdd, invested: 0, asConverted: poolAdd });
        }
      }
      classes.push(cls);
      positions = positions.concat(newPositions);
      pendingSafes = [];

      var fdAfter = fdShares(positions);
      snapshot(label, {
        type: 'priced',
        preMoney: pre,
        price: P,
        effectivePreMoney: P * (fdAfter - newShares - sum(refixes, function (x) { return x.extraShares; })),
        postMoney: P * fdAfter,
        committed: I,
        invested: sum(investorRows, function (x) { return x.invested; }),
        investors: investorRows,
        newShares: newShares,
        poolAdd: poolAdd,
        poolPct: fdAfter > 0 ? sum(positions.filter(function (p) { return p.kind === 'pool'; }), function (p) { return p.asConverted; }) / fdAfter : 0,
        safeConversions: safeConversions,
        refixes: refixes
      });
    });

    if (pendingSafes.length) {
      warnings.push('미전환 SAFE ' + pendingSafes.length + '건(' + Math.round(sum(pendingSafes, function (s) { return s.amount; })).toLocaleString('ko-KR') +
        '원)은 다음 가격 라운드가 없어 캡테이블에 반영되지 않았습니다.');
    }
    return { stages: stages, warnings: warnings, pendingSafes: pendingSafes };
  }

  // 잔여 분배 단가 p 를 찾는다: Σ min(s_i·p, room_i) = R
  function solveResidualPrice(parts, R) {
    if (R <= EPS || !parts.length) return { p: 0, leftover: Math.max(0, R) };
    var uncapped = sum(parts.filter(function (x) { return x.room === Infinity; }), function (x) { return x.shares; });
    function f(p) { return sum(parts, function (x) { return Math.min(x.shares * p, x.room); }); }
    var hi;
    if (uncapped > 0) {
      hi = R / uncapped;
    } else {
      hi = Math.max.apply(null, parts.map(function (x) { return x.shares > 0 ? x.room / x.shares : 0; }));
      if (f(hi) < R) return { p: hi, leftover: R - f(hi) };
    }
    var lo = 0;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (f(mid) < R) lo = mid; else hi = mid;
    }
    return { p: hi, leftover: 0 };
  }

  /**
   * 엑싯(매각) 금액을 청산우선권 순서대로 분배한다.
   * seniority: 'stacked' = 후속 라운드가 선순위, 'pari' = 모든 우선주 동순위
   * 비참가적 우선주는 우선권과 보통주 전환 중 유리한 쪽을, 상한 있는 참가적 우선주는 상한과 전환 중 유리한 쪽을 택한다.
   */
  function waterfall(stage, exitValue, seniority) {
    var exit = Math.max(0, num(exitValue));
    var pos = stage.positions.filter(function (p) { return p.kind !== 'pool' && p.asConverted > 0; });
    var clsMap = {};
    stage.classes.forEach(function (c) { clsMap[c.id] = c; });
    var prefIds = [];
    pos.forEach(function (p) {
      if (p.kind === 'preferred' && prefIds.indexOf(p.classId) < 0) prefIds.push(p.classId);
    });

    function distribute(converted) {
      var pay = pos.map(function () { return 0; });
      var remaining = exit;
      var groups = {};
      pos.forEach(function (p, i) {
        if (p.kind !== 'preferred' || converted[p.classId]) return;
        var c = clsMap[p.classId];
        var rank = seniority === 'pari' ? 0 : c.roundIndex;
        (groups[rank] = groups[rank] || []).push(i);
      });
      Object.keys(groups).map(Number).sort(function (a, b) { return b - a; }).forEach(function (rank) {
        var idxs = groups[rank];
        var need = sum(idxs, function (i) { return pos[i].invested * clsMap[pos[i].classId].multiple; });
        if (need <= 0) return;
        var ratio = Math.min(1, remaining / need);
        idxs.forEach(function (i) { pay[i] = pos[i].invested * clsMap[pos[i].classId].multiple * ratio; });
        remaining -= need * ratio;
      });
      var parts = [];
      pos.forEach(function (p, i) {
        if (p.kind !== 'preferred' || converted[p.classId]) {
          parts.push({ i: i, shares: p.asConverted, room: Infinity });
        } else {
          var c = clsMap[p.classId];
          if (!c.participating) return;
          var room = c.capMultiple > 0 ? Math.max(0, c.capMultiple * p.invested - pay[i]) : Infinity;
          parts.push({ i: i, shares: p.asConverted, room: room });
        }
      });
      var solved = solveResidualPrice(parts, Math.max(0, remaining));
      parts.forEach(function (x) { pay[x.i] += Math.min(x.shares * solved.p, x.room); });
      return { pay: pay, pricePerShare: solved.p, leftover: solved.leftover };
    }

    function classPay(res, id) {
      return sum(pos, function (p, i) { return p.classId === id ? res.pay[i] : 0; });
    }

    var converted = {};
    var res = distribute(converted);
    for (var iter = 0; iter < 60; iter++) {
      var best = null;
      prefIds.forEach(function (id) {
        var trial = clone(converted);
        if (trial[id]) delete trial[id]; else trial[id] = true;
        var alt = distribute(trial);
        var cur = classPay(res, id);
        var gain = classPay(alt, id) - cur;
        if (gain > Math.max(1, cur * 1e-9)) {
          var rel = gain / (cur + 1);
          if (!best || rel > best.rel) best = { id: id, trial: trial, alt: alt, rel: rel };
        }
      });
      if (!best) break;
      converted = best.trial;
      res = best.alt;
    }

    var holders = {};
    var order = [];
    pos.forEach(function (p, i) {
      if (!holders[p.holder]) {
        holders[p.holder] = { holder: p.holder, payout: 0, invested: 0, asConverted: 0 };
        order.push(p.holder);
      }
      holders[p.holder].payout += res.pay[i];
      holders[p.holder].invested += p.invested;
      holders[p.holder].asConverted += p.asConverted;
    });
    var classes = prefIds.map(function (id) {
      var c = clsMap[id];
      return {
        id: id,
        name: c.name,
        converted: !!converted[id],
        preference: sum(pos, function (p) { return p.classId === id ? p.invested * c.multiple : 0; }),
        payout: classPay(res, id)
      };
    });
    return {
      exit: exit,
      holders: order.map(function (k) {
        var h = holders[k];
        h.share = exit > 0 ? h.payout / exit : 0;
        h.multiple = h.invested > 0 ? h.payout / h.invested : null;
        return h;
      }),
      classes: classes,
      commonPricePerShare: res.pricePerShare,
      leftover: res.leftover
    };
  }

  function payoutCurve(stage, maxExit, steps, seniority) {
    var out = [];
    for (var i = 0; i <= steps; i++) {
      var x = maxExit * i / steps;
      out.push({ exit: x, result: waterfall(stage, x, seniority) });
    }
    return out;
  }

  var api = { simulate: simulate, waterfall: waterfall, payoutCurve: payoutCurve, aggregateHolders: aggregateHolders };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EquityEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
