/**
 * orderbook.js — Carnet de cotation
 * Affiche 5 niveaux bid/ask, gère ordres marché et limite
 */

const OrderBook = (() => {
  let pendingOrders = []; // Ordres à cours limité en attente
  let onOrderExecuted = null;

  function init() { restore(); }

  function save() {
    const roomCode = localStorage.getItem('bourse_room') || 'solo';
    try { localStorage.setItem('bourse_orders_' + roomCode, JSON.stringify(pendingOrders)); } catch(e) {}
  }

  function restore() {
    const roomCode = localStorage.getItem('bourse_room') || 'solo';
    try {
      const raw = localStorage.getItem('bourse_orders_' + roomCode);
      if (raw) pendingOrders = JSON.parse(raw) || [];
    } catch(e) { pendingOrders = []; }
  }

  function clearSave() {
    const roomCode = localStorage.getItem('bourse_room') || 'solo';
    localStorage.removeItem('bourse_orders_' + roomCode);
    pendingOrders = [];
  }

  function generateLevels(symbol) {
    const p = Market.getPrice(symbol);
    if (!p) return { asks: [], bids: [], spread: 0 };

    const asks = [];
    const bids = [];
    const tickSize = p.current > 20 ? 0.05 : 0.01;

    for (let i = 0; i < 5; i++) {
      asks.push({
        price: +(p.ask + tickSize * i).toFixed(2),
        volume: Math.floor(50 + Math.random() * 500),
      });
      bids.push({
        price: +(p.bid - tickSize * i).toFixed(2),
        volume: Math.floor(50 + Math.random() * 500),
      });
    }

    // Trier : asks ascending, bids descending
    asks.sort((a, b) => a.price - b.price);
    bids.sort((a, b) => b.price - a.price);

    const spread = +(asks[0].price - bids[0].price).toFixed(2);

    return { asks, bids, spread };
  }

  function render(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { asks, bids, spread } = generateLevels(symbol);
    const maxVol = Math.max(...asks.map(a => a.volume), ...bids.map(b => b.volume));

    let html = `<table class="orderbook">
      <thead><tr><th>Volume</th><th>Prix (€)</th></tr></thead>
      <tbody>`;

    // Asks (inversés pour affichage : prix le plus haut en haut)
    const reversedAsks = [...asks].reverse();
    reversedAsks.forEach(level => {
      const pct = (level.volume / maxVol * 100).toFixed(0);
      html += `<tr class="ask-row">
        <td>${level.volume}</td>
        <td class="vol-bar" style="--bar-width:${pct}%">${level.price.toFixed(2)}</td>
      </tr>`;
    });

    // Spread
    html += `<tr class="spread-row"><td colspan="2">Spread: ${spread.toFixed(2)}€</td></tr>`;

    // Bids
    bids.forEach(level => {
      const pct = (level.volume / maxVol * 100).toFixed(0);
      html += `<tr class="bid-row">
        <td>${level.volume}</td>
        <td class="vol-bar" style="--bar-width:${pct}%">${level.price.toFixed(2)}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function executeMarketOrder(symbol, side, quantity) {
    const p = Market.getPrice(symbol);
    if (!p || !Market.isOpen()) return null;

    const price = side === 'buy' ? p.ask : p.bid;
    const total = +(price * quantity).toFixed(2);

    return { symbol, side, type: 'market', price, quantity, total, time: Date.now() };
  }

  function placeLimitOrder(symbol, side, quantity, limitPrice) {
    if (!Market.isOpen()) return null;

    const order = {
      id: Date.now() + Math.random(),
      symbol,
      side,
      type: 'limit',
      quantity,
      limitPrice: +limitPrice,
      time: Date.now(),
      status: 'pending',
    };

    pendingOrders.push(order);
    save();
    return order;
  }

  function placeStopOrder(symbol, quantity, stopPrice) {
    if (!Market.isOpen()) return null;
    const order = {
      id: Date.now() + Math.random(),
      symbol,
      side: 'sell', // Stop loss = toujours une vente
      type: 'stop',
      quantity,
      stopPrice: +stopPrice,
      time: Date.now(),
      status: 'pending',
    };
    pendingOrders.push(order);
    save();
    return order;
  }

  function checkPendingOrders() {
    const executed = [];

    pendingOrders = pendingOrders.filter(order => {
      const p = Market.getPrice(order.symbol);
      if (!p) return true;

      let shouldExecute = false;
      let execPrice = 0;

      if (order.type === 'stop') {
        // Stop loss : déclenche si le bid descend sous le prix stop
        if (p.bid <= order.stopPrice) {
          shouldExecute = true;
          execPrice = p.bid; // Exécuté au marché (bid)
        }
      } else if (order.side === 'buy' && p.ask <= order.limitPrice) {
        shouldExecute = true;
        execPrice = p.ask;
      } else if (order.side === 'sell' && p.bid >= order.limitPrice) {
        shouldExecute = true;
        execPrice = p.bid;
      }

      if (shouldExecute) {
        const result = {
          symbol: order.symbol,
          side: 'sell',
          type: order.type,
          price: execPrice,
          quantity: order.quantity,
          total: +(execPrice * order.quantity).toFixed(2),
          time: Date.now(),
          orderId: order.id,
        };
        executed.push(result);
        return false;
      }
      return true;
    });

    if (executed.length > 0) {
      save();
      if (onOrderExecuted) executed.forEach(e => onOrderExecuted(e));
    }

    return executed;
  }

  function getPendingOrders() {
    return [...pendingOrders];
  }

  function cancelOrder(orderId) {
    pendingOrders = pendingOrders.filter(o => o.id !== orderId);
    save();
  }

  function setOnOrderExecuted(fn) {
    onOrderExecuted = fn;
  }

  return {
    init,
    generateLevels,
    render,
    executeMarketOrder,
    placeLimitOrder,
    placeStopOrder,
    checkPendingOrders,
    getPendingOrders,
    cancelOrder,
    setOnOrderExecuted,
    clearSave,
  };
})();
