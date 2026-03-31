/**
 * portfolio.js — Gestion du portefeuille joueur
 * Capital, positions, PnL latent/réalisé, historique
 */

const Portfolio = (() => {
  let INITIAL_CAPITAL = 10000;

  let cash = INITIAL_CAPITAL;
  let positions = {};    // { symbol: { quantity, avgPrice, totalCost } }
  let history = [];      // Historique des transactions
  let realizedPnL = 0;
  let listeners = [];
  let valueHistory = []; // Historique de la valeur totale du portefeuille

  let initialized = false;

  function init(budget) {
    if (budget && !isNaN(budget) && budget > 0) INITIAL_CAPITAL = budget;
    cash = INITIAL_CAPITAL;
    positions = {};
    history = [];
    realizedPnL = 0;
    valueHistory = [{ time: Date.now(), value: INITIAL_CAPITAL }];
    initialized = true;
    restore(); // Tente de restaurer depuis localStorage
  }

  function isInitialized() { return initialized; }

  function save() {
    const roomCode = localStorage.getItem('bourse_room') || 'solo';
    const data = { cash, positions, history, realizedPnL, valueHistory, initialCapital: INITIAL_CAPITAL };
    localStorage.setItem('bourse_portfolio_' + roomCode, JSON.stringify(data));
  }

  function restore() {
    const roomCode = localStorage.getItem('bourse_room') || 'solo';
    const raw = localStorage.getItem('bourse_portfolio_' + roomCode);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      // Si le capital initial a changé (nouveau budget), ignorer l'ancien save
      if (data.initialCapital && data.initialCapital !== INITIAL_CAPITAL) {
        localStorage.removeItem('bourse_portfolio_' + roomCode);
        return;
      }
      cash = data.cash ?? INITIAL_CAPITAL;
      positions = data.positions ?? {};
      history = data.history ?? [];
      realizedPnL = data.realizedPnL ?? 0;
      valueHistory = data.valueHistory ?? [{ time: Date.now(), value: INITIAL_CAPITAL }];
    } catch (e) {
      console.warn('Portfolio restore failed', e);
    }
  }

  function recordValue() {
    valueHistory.push({ time: Date.now(), value: getTotalValue() });
    save();
  }

  function getValueHistory() {
    return [...valueHistory];
  }

  function getCash() { return cash; }

  function executeTrade(tradeResult) {
    if (!tradeResult) return false;
    const { symbol, side, price, quantity, total } = tradeResult;

    if (side === 'buy') {
      if (total > cash) return false; // Fonds insuffisants

      cash = +(cash - total).toFixed(2);

      if (!positions[symbol]) {
        positions[symbol] = { quantity: 0, avgPrice: 0, totalCost: 0 };
      }
      const pos = positions[symbol];
      pos.totalCost = +(pos.totalCost + total).toFixed(2);
      pos.quantity += quantity;
      pos.avgPrice = +(pos.totalCost / pos.quantity).toFixed(2);

    } else if (side === 'sell') {
      const pos = positions[symbol];
      if (!pos || pos.quantity < quantity) return false; // Pas assez d'actions

      // Calcul PnL réalisé
      const costBasis = +(pos.avgPrice * quantity).toFixed(2);
      const proceeds = total;
      const pnl = +(proceeds - costBasis).toFixed(2);
      realizedPnL = +(realizedPnL + pnl).toFixed(2);

      cash = +(cash + total).toFixed(2);
      pos.quantity -= quantity;
      pos.totalCost = +(pos.avgPrice * pos.quantity).toFixed(2);

      if (pos.quantity === 0) {
        delete positions[symbol];
      }
    }

    history.push({
      ...tradeResult,
      time: Date.now(),
    });

    save();
    notifyListeners();
    return true;
  }

  function getPositions() {
    return { ...positions };
  }

  function getPosition(symbol) {
    return positions[symbol] || null;
  }

  function getHistory() {
    return [...history];
  }

  function getUnrealizedPnL() {
    let total = 0;
    Object.entries(positions).forEach(([symbol, pos]) => {
      const p = Market.getPrice(symbol);
      if (p) {
        const marketValue = p.current * pos.quantity;
        total += marketValue - pos.totalCost;
      }
    });
    return +total.toFixed(2);
  }

  function getRealizedPnL() {
    return realizedPnL;
  }

  function getTotalValue() {
    let positionsValue = 0;
    Object.entries(positions).forEach(([symbol, pos]) => {
      const p = Market.getPrice(symbol);
      if (p) {
        positionsValue += p.current * pos.quantity;
      }
    });
    return +(cash + positionsValue).toFixed(2);
  }

  function getPerformancePct() {
    return +(((getTotalValue() - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100).toFixed(2);
  }

  function onUpdate(fn) {
    listeners.push(fn);
  }

  function notifyListeners() {
    listeners.forEach(fn => fn());
  }

  function getInitialCapital() { return INITIAL_CAPITAL; }

  return {
    init,
    getCash,
    getInitialCapital,
    executeTrade,
    getPositions,
    getPosition,
    getHistory,
    getUnrealizedPnL,
    getRealizedPnL,
    getTotalValue,
    getPerformancePct,
    getValueHistory,
    recordValue,
    onUpdate,
    isInitialized,
  };
})();
