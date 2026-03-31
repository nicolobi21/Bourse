/**
 * market.js — Moteur de simulation des prix
 * Random walk avec drift, volatilité par action, spread bid/ask
 */

const Market = (() => {
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

  let prices = {};
  let priceHistory = {};
  let listeners = [];
  let intervalId = null;
  let marketOpen = false;

  function init() {
    // Idempotent: ne pas réinitialiser si déjà initialisé (évite reset des prix au rechargement)
    if (Object.keys(prices).length > 0) return;

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
      priceHistory[stock.symbol] = [{ time: Date.now(), price: stock.basePrice }];
    });
    initTrends();
  }

  function start() {
    if (intervalId) return;
    marketOpen = true;
    intervalId = setInterval(tick, 10000); // Mise à jour toutes les 10 secondes
  }

  function stop() {
    marketOpen = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  // Tendances cachées par action — changent au cours du jeu
  let trends = {};
  let trendChangeCounter = 0;

  function initTrends() {
    STOCKS.forEach(stock => {
      // Chaque action a une tendance de fond : haussière, baissière ou neutre
      // Pondérée par les fondamentaux (P/E bas = plus de chances de monter)
      const pe = parseFloat(stock.fundamentals.pe);
      const divYield = parseFloat(stock.fundamentals.dividend);
      // Score fondamental : PE bas + dividende haut = favorable
      // Borné entre -0.001 et +0.001 pour éviter les explosions de prix
      const rawScore = (20 - pe) / 10000 + divYield / 20000;
      const fundScore = Math.max(-0.001, Math.min(0.001, rawScore));

      trends[stock.symbol] = {
        direction: fundScore + (Math.random() - 0.5) * 0.0003, // drift très léger
        momentum: 0,       // momentum accumulé (mean-reversion)
        sentiment: 0,       // sentiment de marché (-1 à +1)
      };
    });
  }

  function tick() {
    if (!marketOpen) return;

    // Toutes les ~5 minutes (30 ticks de 10s), possibilité de changement de tendance
    trendChangeCounter++;
    if (trendChangeCounter >= 30) {
      trendChangeCounter = 0;
      STOCKS.forEach(stock => {
        const t = trends[stock.symbol];
        // Le sentiment évolue graduellement (pas de saut brutal)
        t.sentiment += (Math.random() - 0.5) * 0.4;
        t.sentiment = Math.max(-1, Math.min(1, t.sentiment));
        // La direction ajuste légèrement, bornée pour éviter les explosions
        t.direction += (Math.random() - 0.5) * 0.0002;
        t.direction = Math.max(-0.002, Math.min(0.002, t.direction));
      });
    }

    STOCKS.forEach(stock => {
      const p = prices[stock.symbol];
      const t = trends[stock.symbol];

      // 1. Tendance de fond (fondamentaux) — très léger
      const trendComponent = t.direction * 0.1;

      // 2. Momentum : si l'action monte depuis un moment, elle a tendance à continuer
      //    mais avec mean-reversion (retour vers le prix d'ouverture)
      const deviation = (p.current - p.open) / p.open;
      const meanReversion = -deviation * 0.05; // force de rappel renforcée
      t.momentum = t.momentum * 0.8 + (p.changePct / 100) * 0.2; // momentum lissé
      t.momentum = Math.max(-0.01, Math.min(0.01, t.momentum)); // borner le momentum
      const momentumComponent = t.momentum * 0.05;

      // 3. Sentiment de marché
      const sentimentComponent = t.sentiment * stock.volatility * 0.2;

      // 4. Bruit aléatoire (toujours présent mais réduit)
      const noise = gaussianRandom() * stock.volatility * 0.5;

      // Combinaison — bornée à ±3% max par tick
      let returnRate = trendComponent + momentumComponent + sentimentComponent + meanReversion + noise;
      returnRate = Math.max(-0.03, Math.min(0.03, returnRate));

      p.current = +(p.current * (1 + returnRate)).toFixed(2);
      // Borner le prix entre 50% et 200% du prix d'ouverture
      p.current = Math.max(p.open * 0.5, Math.min(p.open * 2, p.current));

      // Mise à jour high/low
      p.high = Math.max(p.high, p.current);
      p.low = Math.min(p.low, p.current);

      // Calcul change
      p.change = +(p.current - p.open).toFixed(2);
      p.changePct = +((p.change / p.open) * 100).toFixed(2);

      // Spread bid/ask (0.1% à 0.5%)
      const spreadPct = 0.001 + Math.random() * 0.004;
      const halfSpread = p.current * spreadPct / 2;
      p.bid = +(p.current - halfSpread).toFixed(2);
      p.ask = +(p.current + halfSpread).toFixed(2);

      // Historique (cap à 500 points par action)
      priceHistory[stock.symbol].push({ time: Date.now(), price: p.current });
      if (priceHistory[stock.symbol].length > 500) priceHistory[stock.symbol].shift();
    });

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
    priceHistory[symbol].push({ time: Date.now(), price: p.current });
    if (priceHistory[symbol].length > 500) priceHistory[symbol].shift();
  }

  function getPrice(symbol) {
    return prices[symbol];
  }

  function getAllPrices() {
    return { ...prices };
  }

  function getHistory(symbol) {
    return priceHistory[symbol] || [];
  }

  function getStocks() {
    return STOCKS;
  }

  function isOpen() {
    return marketOpen;
  }

  function onUpdate(fn) {
    listeners.push(fn);
  }

  function clearListeners() {
    listeners = [];
  }

  function notifyListeners() {
    listeners.forEach(fn => fn(prices));
  }

  function gaussianRandom() {
    // Box-Muller transform
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  return { init, start, stop, getPrice, getAllPrices, getHistory, getStocks, isOpen, applyShock, onUpdate, clearListeners };
})();
