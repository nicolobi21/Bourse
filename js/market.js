/**
 * market.js — Moteur de simulation des prix
 * 10 secondes de jeu = 1 jour de trading virtuel
 * Historique pré-jeu : 252 jours ouvrables générés de façon déterministe
 */

const Market = (() => {
  // Ancre fixe : le jeu démarre virtuellement le 2024-01-02
  const GAME_VIRTUAL_START = new Date('2024-01-02T00:00:00Z').getTime();

  const STOCKS = [
    {
      symbol: 'ABI', name: 'AB InBev', sector: 'Alimentation & Boissons', basePrice: 52, volatility: 0.008,
      description: "Leader mondial de la bière (Jupiler, Stella Artois, Corona). Présent dans plus de 150 pays.",
      fundamentals: { ca: '57 Mrd€', employees: '164 000', pe: '22x', dividend: '1.5%', risk: 'Modéré' }
    },
    {
      symbol: 'UCB', name: 'UCB', sector: 'Pharmaceutique', basePrice: 85, volatility: 0.010,
      description: "Biopharmaceutique belge spécialisée dans la neurologie et l'immunologie. Pipeline de médicaments innovants.",
      fundamentals: { ca: '5.3 Mrd€', employees: '8 600', pe: '35x', dividend: '1.2%', risk: 'Élevé' }
    },
    {
      symbol: 'PROX', name: 'Proximus', sector: 'Télécom', basePrice: 8, volatility: 0.012,
      description: "Opérateur télécom historique belge. Réseau fixe, mobile et services IT. Déploiement 5G en cours.",
      fundamentals: { ca: '5.9 Mrd€', employees: '11 000', pe: '15x', dividend: '4.8%', risk: 'Modéré' }
    },
    {
      symbol: 'SOLV', name: 'Solvay', sector: 'Chimie', basePrice: 35, volatility: 0.009,
      description: "Groupe chimique belge fondé en 1863. Matériaux avancés pour aéronautique, automobile et énergie.",
      fundamentals: { ca: '13 Mrd€', employees: '22 000', pe: '12x', dividend: '3.5%', risk: 'Modéré' }
    },
    {
      symbol: 'COLR', name: 'Colruyt', sector: 'Distribution', basePrice: 42, volatility: 0.007,
      description: "Distributeur belge connu pour ses prix bas. Supermarchés Colruyt, OKay, Bio-Planet.",
      fundamentals: { ca: '10 Mrd€', employees: '33 000', pe: '18x', dividend: '2.1%', risk: 'Faible' }
    },
    {
      symbol: 'AGS', name: 'Ageas', sector: 'Assurance', basePrice: 48, volatility: 0.009,
      description: "Assureur international belge. Assurance vie et non-vie en Europe et Asie.",
      fundamentals: { ca: '14 Mrd€', employees: '45 000', pe: '8x', dividend: '5.2%', risk: 'Modéré' }
    },
    {
      symbol: 'BEKB', name: 'Bekaert', sector: 'Industrie', basePrice: 38, volatility: 0.011,
      description: "Leader mondial des fils d'acier et technologies de revêtement. Clients dans l'automobile et la construction.",
      fundamentals: { ca: '5.2 Mrd€', employees: '24 000', pe: '10x', dividend: '2.8%', risk: 'Élevé' }
    },
  ];

  // Taux de dividende annuels (reflètent les fundamentals)
  const DIVIDEND_RATES = {
    ABI: 0.015, UCB: 0.012, PROX: 0.048, SOLV: 0.035,
    COLR: 0.021, AGS: 0.052, BEKB: 0.028,
  };

  // Paramètres historiques réalistes par action
  const STOCK_PARAMS = {
    ABI:  { annualDrift: -0.02, annualVol: 0.20 },
    UCB:  { annualDrift:  0.18, annualVol: 0.28 },
    PROX: { annualDrift: -0.08, annualVol: 0.22 },
    SOLV: { annualDrift:  0.05, annualVol: 0.25 },
    COLR: { annualDrift:  0.04, annualVol: 0.18 },
    AGS:  { annualDrift:  0.10, annualVol: 0.22 },
    BEKB: { annualDrift:  0.02, annualVol: 0.28 },
  };

  let prices = {};
  let priceHistory = {};       // historique live (temps réel + date virtuelle)
  let preGameHistory = {};     // 252 jours ouvrables pré-jeu (déterministe)
  let currentGameDate = GAME_VIRTUAL_START;
  let listeners = [];
  let dividendListeners = [];
  let weekendListeners = [];
  let intervalId = null;
  let marketOpen = false;
  let trends = {};
  let trendChangeCounter = 0;
  let dividendTickCounter = 0; // Compteur pour versements trimestriels (63 ticks)

  // === Générateur aléatoire déterministe (LCG) ===
  function lcgRandom(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function nextBusinessDay(ts) {
    const d = new Date(ts);
    d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d.getTime();
  }

  function prevBusinessDay(ts) {
    const d = new Date(ts);
    d.setUTCDate(d.getUTCDate() - 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return d.getTime();
  }

  /**
   * Génère 252 jours ouvrables d'historique se terminant exactement à basePrice.
   * Déterministe : même graine → même historique à chaque session.
   */
  function generatePreGameHistory(stock) {
    const params = STOCK_PARAMS[stock.symbol] || { annualDrift: 0.03, annualVol: 0.22 };
    const N = 252;
    const dailyDrift = params.annualDrift / N;
    const dailyVol = params.annualVol / Math.sqrt(N);

    // Graine basée sur le symbole (déterministe)
    const seed = stock.symbol.split('').reduce(
      (acc, ch) => (Math.imul(acc, 31) + ch.charCodeAt(0)) >>> 0, 1234567
    );
    const rng = lcgRandom(seed);

    // Générer N log-rendements (GBM)
    const logReturns = [];
    for (let i = 0; i < N; i++) {
      let u, v;
      do { u = rng(); } while (u === 0);
      do { v = rng(); } while (v === 0);
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      logReturns.push((dailyDrift - 0.5 * dailyVol * dailyVol) + dailyVol * z);
    }

    // Prix de départ calculé pour que la fin soit exactement basePrice
    const totalLogReturn = logReturns.reduce((a, b) => a + b, 0);
    const startPrice = stock.basePrice * Math.exp(-totalLogReturn);

    // Dates : N jours ouvrables avant GAME_VIRTUAL_START
    const dates = [];
    let ts = GAME_VIRTUAL_START;
    for (let i = 0; i < N; i++) {
      ts = prevBusinessDay(ts);
      dates.unshift(ts);
    }

    // Volatilité intraday (pour les mèches des chandeliers)
    const intradayVol = dailyVol * 0.5;

    // Construire la série de prix avec OHLC
    const history = [];
    let cumLogReturn = 0;

    for (let i = 0; i < N; i++) {
      // Avancer d'abord pour que history[N-1].close === basePrice
      cumLogReturn += logReturns[i];
      const closePrice = Math.max(0.01, +(startPrice * Math.exp(cumLogReturn)).toFixed(2));
      const openPrice = i === 0
        ? +startPrice.toFixed(2)
        : history[i - 1].close;

      // Mèches intraday déterministes (suite du même RNG)
      let u, v;
      do { u = rng(); } while (u === 0);
      do { v = rng(); } while (v === 0);
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      const wick = Math.abs(z) * intradayVol;

      const high  = +(Math.max(openPrice, closePrice) * (1 + wick)).toFixed(2);
      const low   = +(Math.min(openPrice, closePrice) * Math.max(0.001, 1 - wick)).toFixed(2);

      history.push({
        time:     dates[i],
        gameDate: dates[i],
        price:    closePrice,  // alias close (compatibilité)
        open:     openPrice,
        high,
        low,
        close:    closePrice,
      });
    }

    return history;
  }

  function save() {
    const roomCode = localStorage.getItem('bourse_room') || 'solo';
    try {
      // preGameHistory est déterministe, inutile de le sauvegarder
      localStorage.setItem('bourse_market_' + roomCode, JSON.stringify({
        prices, priceHistory, currentGameDate, trends, trendChangeCounter, dividendTickCounter,
        _version: 2, // invalide les vieilles sauvegardes sans OHLC
      }));
    } catch (e) {
      // localStorage plein : on ignore
    }
  }

  function restore() {
    const roomCode = localStorage.getItem('bourse_room') || 'solo';
    const raw = localStorage.getItem('bourse_market_' + roomCode);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (!data.prices || Object.keys(data.prices).length !== STOCKS.length) return false;
      // Invalider les vieilles sauvegardes sans OHLC (version < 2)
      if (data._version !== 2) {
        localStorage.removeItem('bourse_market_' + roomCode);
        return false;
      }

      STOCKS.forEach(stock => {
        if (data.prices[stock.symbol]) {
          data.prices[stock.symbol] = { ...stock, ...data.prices[stock.symbol] };
        }
      });

      prices = data.prices;
      priceHistory = data.priceHistory || {};
      currentGameDate = data.currentGameDate || GAME_VIRTUAL_START;
      trends = data.trends || {};
      trendChangeCounter = data.trendChangeCounter || 0;
      dividendTickCounter = data.dividendTickCounter || 0;

      // Régénérer l'historique pré-jeu (déterministe, pas besoin de le persister)
      STOCKS.forEach(stock => {
        preGameHistory[stock.symbol] = generatePreGameHistory(stock);
      });

      return true;
    } catch (e) {
      return false;
    }
  }

  function init() {
    if (restore()) return;

    currentGameDate = GAME_VIRTUAL_START;

    STOCKS.forEach(stock => {
      prices[stock.symbol] = {
        ...stock,
        current: stock.basePrice,
        open: stock.basePrice,
        high: stock.basePrice,
        low: stock.basePrice,
        change: 0,
        changePct: 0,
        bid: stock.basePrice * (1 - 0.001),
        ask: stock.basePrice * (1 + 0.001),
      };
      priceHistory[stock.symbol] = [{
        time:     Date.now(),
        gameDate: currentGameDate,
        price:    stock.basePrice,
        open:     stock.basePrice,
        high:     stock.basePrice,
        low:      stock.basePrice,
        close:    stock.basePrice,
      }];
      preGameHistory[stock.symbol] = generatePreGameHistory(stock);
    });

    initTrends();
  }

  function start() {
    if (intervalId) return;
    marketOpen = true;
    intervalId = setInterval(tick, 10000);
  }

  function stop() {
    marketOpen = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    save();
  }

  function initTrends() {
    STOCKS.forEach(stock => {
      // Graine déterministe basée sur le symbole → identique pour tous les clients
      const seed = stock.symbol.split('').reduce(
        (acc, ch) => (Math.imul(acc, 31) + ch.charCodeAt(0)) >>> 0, 9876543
      );
      const rng = lcgRandom(seed);
      const pe = parseFloat(stock.fundamentals.pe);
      const divYield = parseFloat(stock.fundamentals.dividend);
      const rawScore = (20 - pe) / 10000 + divYield / 20000;
      const fundScore = Math.max(-0.001, Math.min(0.001, rawScore));
      trends[stock.symbol] = {
        direction: fundScore + (rng() - 0.5) * 0.0003,
        momentum: 0,
        sentiment: 0,
      };
    });
  }

  function tick() {
    if (!marketOpen) return;

    // Avancer la date virtuelle d'un jour ouvrable (10 secondes = 1 jour)
    const prevGameDate = currentGameDate;
    currentGameDate = nextBusinessDay(currentGameDate);

    // Détecter le passage d'un week-end (vendredi → lundi)
    if (new Date(prevGameDate).getUTCDay() === 5 && new Date(currentGameDate).getUTCDay() === 1) {
      weekendListeners.forEach(fn => fn(currentGameDate));
    }

    // Dividendes trimestriels (tous les 63 ticks ≈ 1 trimestre virtuel)
    dividendTickCounter++;
    if (dividendTickCounter >= 63) {
      dividendTickCounter = 0;
      payDividends();
    }

    // Seed déterministe basé sur la date virtuelle — identique pour tous les clients
    const D = (currentGameDate / 1000) | 0;

    trendChangeCounter++;
    if (trendChangeCounter >= 30) {
      trendChangeCounter = 0;
      STOCKS.forEach((stock, i) => {
        const rng = lcgRandom((D * 31 + i * 999983 + 7654321) >>> 0);
        const t = trends[stock.symbol];
        t.sentiment += (rng() - 0.5) * 0.4;
        t.sentiment = Math.max(-1, Math.min(1, t.sentiment));
        t.direction += (rng() - 0.5) * 0.0002;
        t.direction = Math.max(-0.002, Math.min(0.002, t.direction));
      });
    }

    STOCKS.forEach((stock, i) => {
      const p = prices[stock.symbol];
      const t = trends[stock.symbol];
      const tickOpen = p.current;

      // Générateur séquentiel unique par (jour, action) — 5 appels
      const rng = lcgRandom((D * 13 + i * 1000003 + 1) >>> 0);

      // Bruit gaussien principal via Box-Muller
      const u1 = Math.max(1e-10, rng());
      const u2 = rng();
      const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stock.volatility * 0.5;

      const trendComponent     = t.direction * 0.1;
      const deviation          = (p.current - p.open) / p.open;
      const meanReversion      = -deviation * 0.05;
      t.momentum = t.momentum * 0.8 + (p.changePct / 100) * 0.2;
      t.momentum = Math.max(-0.01, Math.min(0.01, t.momentum));
      const momentumComponent  = t.momentum * 0.05;
      const sentimentComponent = t.sentiment * stock.volatility * 0.2;

      let returnRate = trendComponent + momentumComponent + sentimentComponent + meanReversion + noise;
      returnRate = Math.max(-0.03, Math.min(0.03, returnRate));

      p.current = +(p.current * (1 + returnRate)).toFixed(2);
      p.current = Math.max(p.open * 0.5, Math.min(p.open * 2, p.current));
      p.high = Math.max(p.high, p.current);
      p.low  = Math.min(p.low, p.current);
      p.change    = +(p.current - p.open).toFixed(2);
      p.changePct = +((p.change / p.open) * 100).toFixed(2);

      // Spread déterministe (3e appel rng)
      const spreadPct  = 0.001 + rng() * 0.004;
      const halfSpread = p.current * spreadPct / 2;
      p.bid = +(p.current - halfSpread).toFixed(2);
      p.ask = +(p.current + halfSpread).toFixed(2);

      // Mèches intraday — Box-Muller appels 4 & 5
      const wu1  = Math.max(1e-10, rng());
      const wu2  = rng();
      const wick = Math.abs(Math.sqrt(-2 * Math.log(wu1)) * Math.cos(2 * Math.PI * wu2)) * stock.volatility * 0.4;
      const tickHigh = +(Math.max(tickOpen, p.current) * (1 + wick)).toFixed(2);
      const tickLow  = +(Math.min(tickOpen, p.current) * Math.max(0.001, 1 - wick)).toFixed(2);

      priceHistory[stock.symbol].push({
        time:     Date.now(),
        gameDate: currentGameDate,
        price:    p.current,
        open:     +tickOpen.toFixed(2),
        high:     tickHigh,
        low:      tickLow,
        close:    p.current,
      });
      if (priceHistory[stock.symbol].length > 500) priceHistory[stock.symbol].shift();
    });

    save();
    notifyListeners();
  }

  function applyShock(symbol, pctChange) {
    if (symbol === 'ALL') {
      STOCKS.forEach(s => {
        applySingleShock(s.symbol, pctChange + (Math.random() - 0.5) * 0.01);
      });
    } else if (symbol.startsWith('SECTOR:')) {
      const sector = symbol.replace('SECTOR:', '');
      STOCKS.filter(s => s.sector === sector).forEach(s => {
        applySingleShock(s.symbol, pctChange + (Math.random() - 0.5) * 0.01);
      });
    } else {
      applySingleShock(symbol, pctChange);
    }
    notifyListeners();
  }

  function applySingleShock(symbol, pctChange) {
    const p = prices[symbol];
    if (!p) return;
    p.current = +(p.current * (1 + pctChange)).toFixed(2);
    p.current = Math.max(p.current, 0.01);
    p.high = Math.max(p.high, p.current);
    p.low = Math.min(p.low, p.current);
    p.change = +(p.current - p.open).toFixed(2);
    p.changePct = +((p.change / p.open) * 100).toFixed(2);
    const spreadPct = 0.001 + Math.random() * 0.004;
    const halfSpread = p.current * spreadPct / 2;
    p.bid = +(p.current - halfSpread).toFixed(2);
    p.ask = +(p.current + halfSpread).toFixed(2);
    priceHistory[symbol].push({
      time:     Date.now(),
      gameDate: currentGameDate,
      price:    p.current,
      open:     p.current,
      high:     p.current,
      low:      p.current,
      close:    p.current,
    });
    if (priceHistory[symbol].length > 500) priceHistory[symbol].shift();
  }

  function getPrice(symbol) {
    return prices[symbol];
  }

  function getAllPrices() {
    return { ...prices };
  }

  /**
   * Retourne l'historique complet : 252 jours pré-jeu + historique live.
   * Chaque entrée a { time, price, gameDate }.
   */
  function getHistory(symbol) {
    const pre = preGameHistory[symbol] || [];
    const live = priceHistory[symbol] || [];
    return [...pre, ...live];
  }

  function getStocks() {
    return STOCKS;
  }

  function isOpen() {
    return marketOpen;
  }

  function getCurrentGameDate() {
    return currentGameDate;
  }

  function onUpdate(fn) {
    listeners.push(fn);
  }

  function clearListeners() {
    listeners = [];
  }

  /**
   * Verse les dividendes trimestriels à tous les joueurs ayant des positions.
   * Montant = cours actuel × taux_annuel / 4 × quantité.
   */
  function payDividends() {
    if (typeof Portfolio === 'undefined') return;
    const positions = Portfolio.getPositions();
    const payments = [];
    STOCKS.forEach(stock => {
      const pos = positions[stock.symbol];
      if (!pos || pos.quantity <= 0) return;
      const p = prices[stock.symbol];
      if (!p) return;
      const annualRate = DIVIDEND_RATES[stock.symbol] || 0;
      const amount = +(p.current * annualRate / 4 * pos.quantity).toFixed(2);
      if (amount > 0) {
        Portfolio.receiveDividend(stock.symbol, amount);
        payments.push({ symbol: stock.symbol, name: stock.name, amount });
      }
    });
    if (payments.length > 0) {
      dividendListeners.forEach(fn => fn(payments));
    }
  }

  function onDividend(fn)  { dividendListeners.push(fn); }
  function onWeekend(fn)   { weekendListeners.push(fn); }

  function clearSave() {
    const roomCode = localStorage.getItem('bourse_room') || 'solo';
    localStorage.removeItem('bourse_market_' + roomCode);
    prices = {};
    priceHistory = {};
    preGameHistory = {};
    currentGameDate = GAME_VIRTUAL_START;
    trends = {};
    trendChangeCounter = 0;
    dividendTickCounter = 0;
  }

  function notifyListeners() {
    listeners.forEach(fn => fn(prices));
  }

  function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  return {
    init, start, stop,
    getPrice, getAllPrices, getHistory,
    getStocks, isOpen,
    applyShock,
    onUpdate, onDividend, onWeekend,
    clearListeners, clearSave,
    getCurrentGameDate,
  };
})();
