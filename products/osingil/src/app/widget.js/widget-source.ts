/**
 * 쇼핑몰 주문완료 화면에 삽입되는 설문 위젯 (카페24 스크립트 태그로 설치됨).
 * 프레임워크 없이 Shadow DOM 안에서 그려 쇼핑몰 CSS와 서로 간섭하지 않는다.
 */
export function widgetSource(apiBase: string): string {
  return `(function () {
  "use strict";
  var API = ${JSON.stringify(apiBase)};
  if (window.__osingilLoaded) return;
  window.__osingilLoaded = true;

  function mallFromScript() {
    var cur = document.currentScript;
    var list = cur ? [cur] : [];
    var all = document.getElementsByTagName("script");
    for (var i = 0; i < all.length; i++) list.push(all[i]);
    for (var j = 0; j < list.length; j++) {
      var src = list[j].src || "";
      if (src.indexOf(API + "/widget.js") === 0) {
        try { var m = new URL(src).searchParams.get("mall"); if (m) return m; } catch (e) {}
      }
    }
    return null;
  }

  var MALL = mallFromScript();

  function extData() {
    var d = window.EC_FRONT_EXTERNAL_SCRIPT_VARIABLE_DATA;
    return d && typeof d === "object" ? d : {};
  }

  function findOrderId() {
    var d = extData();
    if (d.order_id) return String(d.order_id);
    try {
      var p = new URLSearchParams(location.search).get("order_id");
      if (p) return p;
    } catch (e) {}
    var text = (document.body && document.body.innerText) || "";
    var m = text.match(/\\b(20\\d{6}-\\d{7})\\b/);
    return m ? m[1] : null;
  }

  function amountHint() {
    var d = extData();
    var keys = ["payed_amount", "total_price", "order_price", "payment_amount"];
    for (var i = 0; i < keys.length; i++) {
      var n = Number(String(d[keys[i]] || "").replace(/[^0-9.]/g, ""));
      if (n > 0) return Math.round(n);
    }
    return null;
  }

  function isOrderResult() {
    return /order_result/i.test(location.pathname) || !!extData().order_id;
  }

  function storageKey(orderId) { return "osingil:" + MALL + ":" + orderId; }
  function seen(orderId) { try { return !!localStorage.getItem(storageKey(orderId)); } catch (e) { return false; } }
  function markSeen(orderId) { try { localStorage.setItem(storageKey(orderId), "1"); } catch (e) {} }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  var CSS = [
    ":host{all:initial}",
    ".wrap{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;justify-content:center;padding:0 12px 12px;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif}",
    ".card{pointer-events:auto;width:100%;max-width:420px;background:#fff;color:#191f28;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.18);padding:20px 18px 16px;transform:translateY(16px);opacity:0;transition:transform .25s ease,opacity .25s ease;box-sizing:border-box}",
    ".card.in{transform:none;opacity:1}",
    ".top{display:flex;align-items:flex-start;gap:12px}",
    ".q{flex:1;font-size:16px;font-weight:700;line-height:1.45;margin:0;word-break:keep-all}",
    ".x{border:0;background:#f2f4f6;color:#6b7684;width:28px;height:28px;border-radius:50%;font-size:16px;line-height:28px;cursor:pointer;flex:none}",
    ".sub{font-size:12.5px;color:#6b7684;margin:6px 0 14px}",
    ".grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
    ".opt{border:1px solid #e5e8eb;background:#f9fafb;color:#191f28;border-radius:10px;padding:11px 10px;font-size:14px;cursor:pointer;text-align:center;word-break:keep-all;font-family:inherit}",
    ".opt:hover,.opt:focus-visible{border-color:#3182f6;background:#e8f3ff;outline:none}",
    ".other{display:flex;gap:8px;margin-top:10px}",
    ".other input{flex:1;min-width:0;border:1px solid #d1d6db;border-radius:10px;padding:10px;font-size:14px;font-family:inherit}",
    ".send{border:0;background:#3182f6;color:#fff;border-radius:10px;padding:0 16px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}",
    ".done{text-align:center;font-size:15px;font-weight:600;padding:18px 0 8px}",
    "@media (prefers-reduced-motion:reduce){.card{transition:none}}"
  ].join("");

  function render(cfg, orderId) {
    var host = document.createElement("div");
    host.setAttribute("data-osingil", "");
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    var wrap = document.createElement("div");
    wrap.className = "wrap";
    var card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", cfg.question);
    wrap.appendChild(card);
    root.appendChild(wrap);

    function close() {
      markSeen(orderId);
      card.classList.remove("in");
      setTimeout(function () { host.remove(); }, 260);
    }

    function thanks() {
      card.innerHTML = "";
      var d = document.createElement("div");
      d.className = "done";
      d.textContent = "응답해 주셔서 감사합니다!";
      card.appendChild(d);
      setTimeout(close, 1600);
    }

    function submit(answerId, otherText) {
      markSeen(orderId);
      thanks();
      try {
        fetch(API + "/api/public/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mall: MALL, order_id: orderId, answer_id: answerId, other_text: otherText || null, amount_hint: amountHint() }),
          keepalive: true
        });
      } catch (e) {}
    }

    var top = document.createElement("div");
    top.className = "top";
    var q = document.createElement("p");
    q.className = "q";
    q.textContent = cfg.question;
    var x = document.createElement("button");
    x.className = "x";
    x.type = "button";
    x.setAttribute("aria-label", "닫기");
    x.textContent = "×";
    x.onclick = close;
    top.appendChild(q);
    top.appendChild(x);
    card.appendChild(top);
    var sub = document.createElement("p");
    sub.className = "sub";
    sub.textContent = "하나만 골라 주세요. 더 나은 쇼핑몰을 만드는 데 쓰입니다.";
    card.appendChild(sub);

    var grid = document.createElement("div");
    grid.className = "grid";
    var opts = cfg.options.slice();
    if (cfg.randomize) shuffle(opts);
    opts.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.textContent = o.label;
      b.onclick = function () { submit(o.id, null); };
      grid.appendChild(b);
    });
    if (cfg.allow_other) {
      var ob = document.createElement("button");
      ob.type = "button";
      ob.className = "opt";
      ob.textContent = "기타";
      ob.onclick = function () {
        if (card.querySelector(".other")) return;
        var row = document.createElement("div");
        row.className = "other";
        var inp = document.createElement("input");
        inp.maxLength = 100;
        inp.placeholder = "직접 입력해 주세요";
        inp.setAttribute("aria-label", "기타 유입경로");
        var send = document.createElement("button");
        send.type = "button";
        send.className = "send";
        send.textContent = "보내기";
        send.onclick = function () { if (inp.value.trim()) submit("other", inp.value.trim()); else inp.focus(); };
        inp.onkeydown = function (e) { if (e.key === "Enter") send.onclick(); };
        row.appendChild(inp);
        row.appendChild(send);
        card.appendChild(row);
        inp.focus();
      };
      grid.appendChild(ob);
    }
    card.appendChild(grid);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    requestAnimationFrame(function () { requestAnimationFrame(function () { card.classList.add("in"); }); });
  }

  function start() {
    if (!MALL || !isOrderResult()) return;
    var orderId = findOrderId();
    if (!orderId || seen(orderId)) return;
    fetch(API + "/api/public/survey?mall=" + encodeURIComponent(MALL))
      .then(function (r) { return r.json(); })
      .then(function (cfg) { if (cfg && cfg.show && cfg.options && cfg.options.length) render(cfg, orderId); })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(start, 700); });
  } else {
    setTimeout(start, 700);
  }
})();
`;
}
