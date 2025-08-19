const STATUS = document.getElementById("statusBadge");
const balancesBody = document.getElementById("balancesTbody");
const tradesBody = document.getElementById("tradesTbody");
const symbolSelect = document.getElementById("symbolSelect");
const hoursSelect = document.getElementById("hoursSelect");
const cmdForm = document.getElementById("cmdForm");
const cmdSymbol = document.getElementById("cmdSymbol");
const cmdAction = document.getElementById("cmdAction");
const btnBuy = document.getElementById("btnBuy");
const btnSell = document.getElementById("btnSell");
const btnCancel = document.getElementById("btnCancel");
const cmdNote = document.getElementById("cmdNote");
const cmdErr = document.getElementById("cmdErr");

const usdcEl = document.getElementById("usdcAvailable");
const holdingsEl = document.getElementById("holdingsValue");
const totalEl = document.getElementById("grandTotal");

let enabledCoins = [];

let lastTradesRefresh = 0;
const TRADES_REFRESH_MS = 3000; // throttle to max once every 3s
let lastTradeStamp = null;      // remember last trade timestamp seen via WS/status

let _lastSeenActiveAt = 0;
let _lastTradeText = "";  // sticky last trade line
let lastStatusFetch = 0;
const STATUS_REFRESH_MS = 5000; // update at most every 5s

function setStatus(active, last_trade, opts = {}) {
  const graceMs = opts.graceMs ?? 70_000; // keep green up to 70s after last positive heartbeat
  const now = Date.now();

  // Record active heartbeat
  if (active === true) _lastSeenActiveAt = now;

  // Update trade text only if meaningful
  const lt = (last_trade ?? "").trim();
  const isMeaningful = lt && lt.toLowerCase() !== "no trades yet";
  if (isMeaningful) _lastTradeText = lt;

  // Effective active with grace
  const effectiveActive =
    active === true ||
    (active == null && now - _lastSeenActiveAt < graceMs) ||
    (active === false && now - _lastSeenActiveAt < graceMs);

  STATUS.textContent = effectiveActive
    ? `Active • ${_lastTradeText || ""}`.trim()
    : "Idle" + (_lastTradeText ? ` • ${_lastTradeText}` : "");

  STATUS.className = `text-xs px-2 py-1 rounded-full ${
    effectiveActive
      ? "bg-emerald-700/40 text-emerald-300"
      : "bg-orange-700/40 text-orange-300"
  }`;
}

async function fetchAndRenderStatus() {
  const st = await fetchJSON("/api/status");
  setStatus(Boolean(st.active), st.seconds_since_update ? `Last update: ${st.seconds_since_update} seconds ago` : "No trades yet");
}
async function maybeRefreshStatus(force = false) {
  const now = Date.now();
  if (force || now - lastStatusFetch >= STATUS_REFRESH_MS) {
    await fetchAndRenderStatus();
    lastStatusFetch = now;
  }
}

function buyBadgeFor(coin) {
  const b = badgeData[coin];
  if (!b) return "";

  const price = b.price_usdc != null ? Number(b.price_usdc) : null;

  // Prefer server-provided target; otherwise derive from current price + buy_pct
  let tgt = null;
  if (b.buy_target != null) {
    tgt = Number(b.buy_target);
  } else if (price != null && b.buy_pct != null) {
    const pct = Number(b.buy_pct);           // e.g. -4 means buy 4% below ref
    tgt = price * (1 + pct / 100);           // fallback when no DCA exists
  }

  if (price == null || tgt == null || !Number.isFinite(tgt)) return "";

  // Color: green when price <= target, amber when within +1%, gray otherwise
  const cls =
    price <= tgt
      ? "bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-600/30"
      : price <= tgt * 1.01
      ? "bg-amber-600/20 text-amber-300 ring-1 ring-amber-600/30"
      : "bg-zinc-800 text-zinc-300";

  return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${cls}">Buy ≤ ${fmt(tgt, 6)}</span>`;
}

function rebuyBadgeFor(coin) {
  const b = badgeData[coin];
  if (!b?.rebuy_level || !b?.price_usdc) return "";
  const lvl = Number(b.rebuy_level), p = Number(b.price_usdc);
  const cls = p <= lvl ? "bg-sky-600/20 text-sky-300 ring-1 ring-sky-600/30"
                       : (p <= lvl * 1.01 ? "bg-amber-600/20 text-amber-300 ring-1 ring-amber-600/30"
                                          : "bg-zinc-800 text-zinc-300");
  return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${cls}">Rebuy ≤ ${fmt(lvl, 6)}</span>`;
}

function profitBadgeFor(coin) {
  const b = badgeData[coin];
  if (b?.total_profit == null) return "";
  const pnl = Number(b.total_profit);
  let cls = "bg-zinc-800 text-zinc-300";
  if (pnl > 0) cls = "bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-600/30";
  else if (pnl < 0) cls = "bg-rose-600/20 text-rose-300 ring-1 ring-rose-600/30";
  const label = `PnL $ ${fmt(Math.abs(pnl), 2)}${pnl < 0 ? " " : pnl > 0 ? " " : ""}`;
  return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${cls}">${label}</span>`;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmt(x, decimals = 4) {
  if (x == null) return "—";
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

let badgeData = {}; // coin -> badge info

async function refreshBadges() {
  try {
    const res = await fetchJSON("/api/coins/badges");
    badgeData = {};
    for (const row of res.coins) badgeData[row.coin] = row;
  } catch {
    badgeData = {};
  }
}

function renderBadgeFor(coin) {
  const b = badgeData[coin];
  if (!b || !b.eligible || !b.sell_target) return ""; // no badge if ineligible

  const price = Number(b.price_usdc);
  const target = Number(b.sell_target);
  const diffPct = ((price - target) / target) * 100;

  let cls = "bg-red-800 text-red-300"; // far away
  let glowColor = ""; // no glow by default

  if (diffPct >= 2) {
    cls = "bg-emerald-500 text-emerald-100";
    glowColor = "rgba(16,185,129,0.8)"; // emerald
  } else if (diffPct >= 0) {
    cls = "bg-green-500 text-green-100";
    glowColor = "rgba(34,197,94,0.8)"; // green
  } else if (diffPct >= -2) {
    cls = "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/50";
    glowColor = "rgba(234,179,8,0.8)"; // yellow
  } else if (diffPct >= -5) {
    cls = "bg-orange-600/20 text-orange-200 ring-1 ring-orange-600/50";
    glowColor = "rgba(234,88,12,0.8)"; // orange
  } else {
    cls = "bg-red-800 text-red-300";
    glowColor = "rgba(220,38,38,0.8)"; // red
  }

  // Glow if within ±1% of target
  const glowClass = (Math.abs(diffPct) <= 1) ? "glow" : "";
  const label = `Sell ≥ $${fmt(target, 4)}`;

  return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${cls}">${label}</span>`;
}

function priceBadgeFor(coin) {
  const b = badgeData[coin];
  if (!b?.price_usdc) return "";

  const price = Number(b.price_usdc);
  const pct = b.change_24h_pct != null ? Number(b.change_24h_pct) : null;

  let cls = "bg-zinc-800 text-zinc-300";
  let sign = "";
  if (pct !== null && Number.isFinite(pct)) {
    if (pct > 0) { cls = "bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-600/30"; sign = "▲"; }
    else if (pct < 0) { cls = "bg-rose-600/20 text-rose-300 ring-1 ring-rose-600/30"; sign = "▼"; }
  }
  const pctTxt = pct !== null && Number.isFinite(pct) ? ` ${sign} ${fmt(Math.abs(pct), 2)}%` : "";
  const label = `${fmt(price, 6)} ${pctTxt}`;
  return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${cls}">${label}</span>`;
}

function valueBadgeFor(coin, amt) {
  const b = badgeData[coin]; // from /api/coins/badges
  const price = b?.price_usdc != null ? Number(b.price_usdc) : null;
  const value = b?.value_usdc != null ? Number(b.value_usdc) : (price != null ? amt * price : null);

  let cls = "bg-zinc-800 text-zinc-300"; // default
  if (b?.sell_target && b?.price_usdc) {
    const p = Number(b.price_usdc), tgt = Number(b.sell_target);
    const dist = b?.distance_pct != null ? Number(b.distance_pct) : null;
    if (p >= tgt) cls = "bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-600/30";
    else if (dist !== null && dist <= 1 && dist > 0) cls = "bg-amber-600/20 text-amber-300 ring-1 ring-amber-600/30";
  }

  const label = value != null
    ? `$ ${fmt(value, 2)} (${fmt(amt, 6)} ${coin})`
    : "—";

  return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${cls}">${label}</span>`;
}

function targetDistanceBadgeFor(coin, hasHoldings) {
  const b = badgeData[coin];
  if (!b) return "";

  const pricePct = b.current_pct_from_ref != null ? Number(b.current_pct_from_ref) : null;
  const targetPct = hasHoldings
    ? (b.sell_pct != null ? Number(b.sell_pct) : null)   // e.g. +4
    : (b.buy_pct  != null ? Number(b.buy_pct)  : null);  // e.g. -4

  if (targetPct == null) return "";

  const fmtPct = (x) => (x >= 0 ? `+${x.toFixed(1)}` : `${x.toFixed(1)}`);
  const left = pricePct == null ? "—" : fmtPct(pricePct);
  const right = fmtPct(targetPct);
  const label = `Target ${left}% / ${right}%`;

  // Color/glow
  let cls = "bg-zinc-800 text-zinc-300";
  let glowColor = "rgba(161,161,170,0.6)";
  if (pricePct != null && Number.isFinite(pricePct)) {
    const met = hasHoldings ? (pricePct >= targetPct) : (pricePct <= targetPct);
    const gap = hasHoldings ? (targetPct - pricePct) : (pricePct - targetPct); // >0 means away

    if (met) {
      cls = "bg-green-500 text-green-100";
      glowColor = "rgba(34,197,94,0.8)";
    } else if (gap <= 1) {
      cls = "bg-yellow-500 text-yellow-100";
      glowColor = "rgba(234,179,8,0.8)";
    } else if (gap <= 3) {
      cls = "bg-orange-600 text-orange-200";
      glowColor = "rgba(234,88,12,0.8)";
    } else {
      cls = "bg-rose-700 text-rose-200";
      glowColor = "rgba(244,63,94,0.8)";
    }
  }

  const glowClass = (pricePct != null && Math.abs(pricePct - targetPct) <= 1) ? "glow" : "";
  return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${cls} ${glowClass}" style="--glow-color:${glowColor}">${label}</span>`;
}
// Escape HTML special characters to prevent XSS
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBalances(items) {
  // currency -> amount
  const map = {};
  for (const b of items || []) {
    if (!b?.currency) continue;
    map[escapeHTML(b.currency.toUpperCase())] = Number(b.available_balance ?? 0);
  }

  function renderPriceCell(coin) {
    return `<div class="flex justify-center">${priceBadgeFor(escapeHTML(coin)) || ""}</div>`;
  }

  function renderBuyRebuyCell(coin, amt, valUSDC) {
    const hasHoldings = valUSDC >= 1;
    return `<div class="flex justify-center">${hasHoldings ? rebuyBadgeFor(escapeHTML(coin)) : buyBadgeFor(escapeHTML(coin)) || ""}</div>`;
  }

  function renderTargetCell(coin, amt, valUSDC) {
    const hasHoldings = valUSDC >= 1;
    return `<div class="flex justify-center">${targetDistanceBadgeFor(escapeHTML(coin), hasHoldings) || ""}</div>`;
  }

  function renderSellCell(coin) {
    return `<div class="flex justify-center">${renderBadgeFor(escapeHTML(coin)) || ""}</div>`;
  }

  function renderProfitCell(coin) {
    return `<div class="flex justify-center">${profitBadgeFor(escapeHTML(coin)) || ""}</div>`;
  }

  const rows = enabledCoins
    .filter(c => c !== "USDC")
    .sort((a, b) => {
      const valA = (map[escapeHTML(a)] ?? 0) * (badgeData[a]?.price_usdc ?? 0);
      const valB = (map[escapeHTML(b)] ?? 0) * (badgeData[b]?.price_usdc ?? 0);
      return valB - valA; // highest first
    })
    .map(coin => {
      const safeCoin = escapeHTML(coin);
      const amt = map[safeCoin] ?? 0;
      const valUSDC = amt * (badgeData[coin]?.price_usdc ?? 0);

      return `<tr class="hover:bg-zinc-800/50">
        <td class="py-2">${safeCoin}</td>
        <td class="py-2">
          <div class="grid grid-cols-5 gap-1 text-center">
            ${renderPriceCell(coin)}
            ${renderBuyRebuyCell(coin, amt, valUSDC)}
            ${renderTargetCell(coin, amt, valUSDC)}
            ${renderSellCell(coin)}
            ${renderProfitCell(coin)}
          </div>
        </td>
        <td class="py-2 text-right">${valueBadgeFor(coin, amt)}</td>
      </tr>`;
    });

  balancesBody.innerHTML = rows.join("");
}

async function fetchAndRenderTrades(limit = 20) {
  const res = await fetch(`/api/trades?limit=${limit}`, { cache: "no-store" });
  const data = await res.json();
  renderTrades(data.trades);           // pass the array only
}

function renderTrades(items = []) {
  tradesBody.innerHTML = (items || []).map(t => `
    <tr class="hover:bg-zinc-800/50">
      <td class="py-2">${t.timestamp ? new Date(t.timestamp).toLocaleString() : ""}</td>
      <td class="py-2">${t.symbol || ""}</td>
      <td class="py-2 ${String(t.side).toUpperCase() === "BUY" ? "text-emerald-400" : "text-rose-400"}">
        ${t.side || ""}
      </td>
      <td class="py-2 text-right">${t.amount != null ? fmt(t.amount, 6) : ""}</td>
      <td class="py-2 text-right">${t.price  != null ? fmt(t.price,  6) : ""}</td>
    </tr>
  `).join("");
}

async function refreshSummary() {
  try {
    const s = await fetchJSON("/api/portfolio/summary");
    usdcEl.textContent = fmt(s.usdc_available, 2);
    holdingsEl.textContent = fmt(s.holdings_value_usdc, 2);
    totalEl.textContent = fmt(s.total_usdc, 2);
  } catch (e) {
    usdcEl.textContent = holdingsEl.textContent = totalEl.textContent = "—";
  }
}

async function loadSymbols() {
  const state = await fetchJSON("/api/state");
  const symbols = Array.from(new Set(state.map(s => s.symbol))).sort();
  const list = symbols.length ? symbols : ["USDC-EUR"];
  symbolSelect.innerHTML = list.map(s => `<option value="${s}">${s}</option>`).join("");
}

let priceChart;
async function renderPrice(symbol, hours) {
  const series = await fetchJSON(`/api/price_history?symbol=${encodeURIComponent(symbol)}&hours=${hours}`);
  const labels = series.points.map(p => new Date(p.timestamp).toLocaleString());
  const data = series.points.map(p => p.price);

  if (!priceChart) {
    const ctx = document.getElementById("priceChart").getContext("2d");
    priceChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ label: `${series.symbol}`, data, tension: 0.25, borderWidth: 2, pointRadius: 0 }] },
      options: { responsive: true, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true } } }
    });
  } else {
    priceChart.data.labels = labels;
    priceChart.data.datasets[0].label = series.symbol;
    priceChart.data.datasets[0].data = data;
    priceChart.update();
  }
}

function valueBadgeFor(coin, amt) {
  const b = badgeData[coin]; // from /api/coins/badges
  const price = b?.price_usdc != null ? Number(b.price_usdc) : null;
  const value = price != null ? amt * price : null;

  if (value == null) return "—";

  // 🎨 Color bands
  let cls = "bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700";
  if (value >= 500) {
    cls = "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/50"; // gold
  } else if (value >= 250) {
    cls = "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50"; // green
  } else if (value >= 100) {
    cls = "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/50"; // blue
  } else if (value >= 10) {
    cls = "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50"; // indigo
  }

  const label = `$ ${fmt(value, 2)} (${fmt(amt, 6)} ${coin})`;

  return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${cls}">${label}</span>`;
}

async function bootstrap() {
  const status = await fetchJSON("/api/status").catch(() => null);
  await refreshSummary();
  setInterval(refreshSummary, 10000);

  const cfg = await fetchJSON("/api/config/info").catch(() => null);
  enabledCoins = (cfg?.coins || []).map(c => c.toUpperCase());

  populateCmdSymbols();

  btnBuy.addEventListener("click", () => submitManualCommand("BUY"));
  btnSell.addEventListener("click", () => submitManualCommand("SELL"));
  btnCancel.addEventListener("click", () => submitManualCommand("CANCEL"));

  await refreshBadges();
  renderBalances(await fetchJSON("/api/balances"));

  await loadSymbols();
  await renderPrice(symbolSelect.value, hoursSelect.value);

  await fetchAndRenderStatus();
  await fetchAndRenderTrades(20);

  // WS setup
  const BADGE_REFRESH_MS = 5000;
  let lastBadgeFetch = 0;
  async function maybeRefreshBadges(force = false) {
    const now = Date.now();
    if (force || now - lastBadgeFetch >= BADGE_REFRESH_MS) {
      await refreshBadges();
      lastBadgeFetch = now;
    }
  }

  function connectWS() {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/live`);
    ws.onopen = () => {
      try { ws.send(JSON.stringify({ subscribe: [symbolSelect.value] })); } catch {}
    };

    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type !== "tick") return;

      // 2) If status.last_trade changed, force-refresh trades immediately
      if (msg.status?.last_trade && msg.status.last_trade !== lastTradeStamp) {
        lastTradeStamp = msg.status.last_trade;
        await fetchAndRenderTrades(20);
      } else {
        // Otherwise refresh on any tick, but throttled
        const now = Date.now();
        if (now - lastTradesRefresh >= TRADES_REFRESH_MS) {
          await fetchAndRenderTrades(20);
          lastTradesRefresh = now;
        }
      }

      // 3) balances → badges & balances table (throttled badges)
      if (Array.isArray(msg.balances)) {
        await maybeRefreshBadges();
        renderBalances(msg.balances);
      }

      // 4) totals
      refreshSummary();

      // status
      await maybeRefreshStatus();
    };

    // auto-reconnect
    ws.onclose = () => setTimeout(connectWS, 1500);
    ws.onerror  = () => { try { ws.close(); } catch {} };
  }

  connectWS();

  // Symbol/hour selectors
  symbolSelect.addEventListener("change", async () => {
    await renderPrice(symbolSelect.value, hoursSelect.value);
    try { ws.send(JSON.stringify({ subscribe: [symbolSelect.value] })); } catch {}
  });

  hoursSelect.addEventListener("change", () => {
    renderPrice(symbolSelect.value, hoursSelect.value);
  });

  function populateCmdSymbols() {
    if (!Array.isArray(enabledCoins) || enabledCoins.length === 0) return;
    // Only coins (exclude USDC)
    const opts = enabledCoins
      .filter(c => c !== "USDC")
      .map(c => {
        const safe = escapeHTML(c);
        return `<option value="${safe}">${safe}</option>`;
      })
      .join("");
    cmdSymbol.innerHTML = opts || `<option value="" disabled>No enabled coins</option>`;
  }

  // Manual command form
  async function submitManualCommand(action) {
    const symbol = cmdSymbol.value;
    if (!symbol) return;

    cmdNote.classList.add("hidden");
    cmdErr.classList.add("hidden");

    // Disable buttons during send
    [btnBuy, btnSell, btnCancel].forEach(b => b.disabled = true);

    try {
      const res = await fetch("/api/manual_commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, action })   // ← only symbol + action
      });
      if (!res.ok) throw new Error(await res.text());
      cmdNote.classList.remove("hidden");
      setTimeout(() => cmdNote.classList.add("hidden"), 1500);
    } catch (e) {
      console.error(e);
      cmdErr.textContent = "Failed to send";
      cmdErr.classList.remove("hidden");
      setTimeout(() => cmdErr.classList.add("hidden"), 2500);
    } finally {
      [btnBuy, btnSell, btnCancel].forEach(b => b.disabled = false);
    }
  }

}

bootstrap();
