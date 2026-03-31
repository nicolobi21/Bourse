/**
 * app.js — Orchestrateur principal du jeu
 * Initialise tous les modules, gère le timer, rafraîchit l'UI
 */

const App = (() => {
  let GAME_DURATION = 60 * 60 * 1000; // 1 heure en ms par défaut

  let selectedStock = 'ABI';
  let gameStartTime = null;
  let timerInterval = null;
  let uiInterval = null;
  let orderSide = 'buy';
  let orderType = 'market';
  let tutorialStep = 0;
  const TUTORIAL_STEPS = 4;
  let portfolioChart = null;
  let achievements = [];
  let shownAchievements = new Set();

  function initGame() {
    // Clear listeners to prevent duplicates if initGame is called multiple times
    Market.clearListeners();
    Events.clearListeners();

    // Init modules
    Market.init();
    Charts.init('price-chart', 'ABI');

    // Note: Sync.init() est déjà appelé dans bootGame() avant initGame()

    // Restaurer session
    if (!Sync.getPlayerName()) {
      window.location.href = 'index.html';
      return;
    }

    // Charger durée et budget (local d'abord, puis Firebase en arrière-plan)
    const savedDuration = localStorage.getItem('bourse_duration_' + Sync.getRoomCode());
    if (savedDuration) {
      GAME_DURATION = parseInt(savedDuration);
    }
    const rawBudget = parseInt(localStorage.getItem('bourse_budget_' + Sync.getRoomCode()));
    const savedBudget = (!isNaN(rawBudget) && rawBudget > 0) ? rawBudget : 10000;
    Portfolio.init(savedBudget);

    // Synchroniser les settings depuis Firebase (au cas où on rejoint une salle)
    Sync.loadRoomSettings((settings) => {
      if (settings.budget && settings.budget !== savedBudget) {
        // Le budget Firebase diffère du local → réinitialiser avec le bon budget
        Portfolio.init(settings.budget);
        localStorage.setItem('bourse_budget_' + Sync.getRoomCode(), settings.budget.toString());
        updateUI();
      }
      if (settings.duration && settings.duration !== GAME_DURATION) {
        GAME_DURATION = settings.duration;
      }
    });

    // Restaurer les succès
    restoreAchievements();

    // Démarrer le marché
    Market.start();

    // Timer
    gameStartTime = Date.now();
    const savedStart = localStorage.getItem('bourse_gameStart_' + Sync.getRoomCode());
    if (savedStart) {
      gameStartTime = parseInt(savedStart);
    } else {
      localStorage.setItem('bourse_gameStart_' + Sync.getRoomCode(), gameStartTime.toString());
    }

    // Market update listener
    Market.onUpdate(() => {
      updateUI();
      OrderBook.checkPendingOrders();
    });

    // Limit order execution
    OrderBook.setOnOrderExecuted((result) => {
      const success = Portfolio.executeTrade(result);
      if (success) {
        const isStop = result.type === 'stop';
        const msg = isStop
          ? `🛡️ Stop Loss déclenché : Vente ${result.quantity}x ${result.symbol} à ${result.price.toFixed(2)}€`
          : `Ordre ${result.side === 'buy' ? 'achat' : 'vente'} exécuté : ${result.quantity}x ${result.symbol} à ${result.price.toFixed(2)}€`;
        showToast(msg, isStop ? 'error' : 'success');
        Sync.updateScore();
      } else {
        showToast(`Ordre rejeté (position insuffisante) : ${result.quantity}x ${result.symbol}`, 'error');
      }
      updatePendingOrders();
    });

    // Démarrer les événements avec le bon timing
    Events.start(gameStartTime, GAME_DURATION);

    // Flash news listener
    Events.onEvent(showFlashNews);

    // Calendar UI listener
    Events.onCalendarUpdate(updateCalendarUI);

    // Setup UI
    setupStockList();
    setupOrderPanel();
    selectStock('ABI');

    // Timer interval
    timerInterval = setInterval(updateTimer, 1000);

    // UI refresh + portfolio history
    uiInterval = setInterval(() => {
      updateUI();
      updatePendingOrders();
      Portfolio.recordValue();
      updatePortfolioChart();
      checkAchievements();
      Sync.updateScore();
      updateLiveLeaderboard(Sync.getLeaderboard());
    }, 5000);

    // Init portfolio mini-chart
    initPortfolioChart();

    // Setup tabs, timeframes, leaderboard, and mobile nav
    setupRightPanelTabs();
    setupTimeframeButtons();
    setupLiveLeaderboard();
    setupMobileNav();

    // Show tutorial on first visit
    if (!localStorage.getItem('bourse_tutorialDone')) {
      showTutorial();
    }

    updateTimer();
    updateUI();
    updateCalendarUI();
  }

  // ==================== UTILITIES ====================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==================== STOCK LIST ====================
  function setupStockList() {
    const container = document.getElementById('stock-list');
    if (!container) return;

    const stocks = Market.getStocks();
    container.innerHTML = stocks.map(s => `
      <div class="stock-item" data-symbol="${s.symbol}" onclick="App.selectStock('${s.symbol}')">
        <div>
          <div class="name">${s.symbol}</div>
          <div class="sector">${s.sector}</div>
        </div>
        <div class="stock-price">
          <div class="value" id="price-${s.symbol}">${s.basePrice.toFixed(2)}€</div>
          <div class="pct" id="pct-${s.symbol}">0.00%</div>
        </div>
      </div>
    `).join('');
  }

  function selectStock(symbol) {
    selectedStock = symbol;

    // UI highlight
    document.querySelectorAll('.stock-item').forEach(el => {
      el.classList.toggle('active', el.dataset.symbol === symbol);
    });

    // Update chart
    Charts.switchStock(symbol);

    // Update chart header
    updateChartHeader();

    // Update order panel
    updateOrderPanel();

    // Update orderbook
    OrderBook.render('orderbook-container', symbol);

    // Update company info
    updateCompanyInfo(symbol);
  }

  // ==================== UI UPDATES ====================
  function updateUI() {
    updateStockList();
    updateChartHeader();
    Charts.update();
    OrderBook.render('orderbook-container', selectedStock);
    updatePortfolioBar();
    updateTicker();
    updateHeaderValue();
    updateOrderPanel();
  }

  function updateStockList() {
    Market.getStocks().forEach(s => {
      const p = Market.getPrice(s.symbol);
      if (!p) return;

      const priceEl = document.getElementById(`price-${s.symbol}`);
      const pctEl = document.getElementById(`pct-${s.symbol}`);

      if (priceEl) {
        priceEl.textContent = p.current.toFixed(2) + '€';
        priceEl.className = 'value ' + (p.changePct >= 0 ? 'up' : 'down');
      }
      if (pctEl) {
        pctEl.textContent = (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%';
        pctEl.className = 'pct ' + (p.changePct >= 0 ? 'up' : 'down');
      }
    });
  }

  function updateChartHeader() {
    const p = Market.getPrice(selectedStock);
    if (!p) return;

    const nameEl = document.getElementById('chart-name');
    const priceEl = document.getElementById('chart-price');
    const changeEl = document.getElementById('chart-change');
    const detailEl = document.getElementById('chart-detail');

    if (nameEl) nameEl.textContent = p.name;
    if (priceEl) {
      priceEl.textContent = p.current.toFixed(2) + '€';
      priceEl.className = 'current-price ' + (p.changePct >= 0 ? 'text-green' : 'text-red');
    }
    if (changeEl) {
      changeEl.textContent = `${p.changePct >= 0 ? '+' : ''}${p.change.toFixed(2)}€ (${p.changePct >= 0 ? '+' : ''}${p.changePct.toFixed(2)}%)`;
      changeEl.className = 'change-info ' + (p.changePct >= 0 ? 'text-green' : 'text-red');
    }
    if (detailEl) {
      detailEl.innerHTML = `
        <span>Ouv: <strong>${p.open.toFixed(2)}€</strong></span>
        <span>Haut: <strong class="text-green">${p.high.toFixed(2)}€</strong></span>
        <span>Bas: <strong class="text-red">${p.low.toFixed(2)}€</strong></span>
        <span>Bid: <strong>${p.bid.toFixed(2)}€</strong></span>
        <span>Ask: <strong>${p.ask.toFixed(2)}€</strong></span>
      `;
    }
  }

  function updateHeaderValue() {
    const totalEl = document.getElementById('header-total-value');
    const pnlEl = document.getElementById('header-pnl');
    const cashEl = document.getElementById('header-cash');

    if (totalEl) totalEl.textContent = Portfolio.getTotalValue().toLocaleString('fr-BE', { minimumFractionDigits: 2 }) + '€';
    if (cashEl) cashEl.textContent = Portfolio.getCash().toLocaleString('fr-BE', { minimumFractionDigits: 2 }) + '€';
    if (pnlEl) {
      const pct = Portfolio.getPerformancePct();
      pnlEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
      pnlEl.className = pct >= 0 ? 'text-green' : 'text-red';
    }
  }

  let tickerBuilt = false;
  function updateTicker() {
    const container = document.getElementById('ticker-content');
    if (!container) return;

    const stocks = Market.getStocks();

    // Build ticker DOM only once
    if (!tickerBuilt) {
      const items = [...stocks, ...stocks].map(s => {
        return `<span class="ticker-item">
          <span class="symbol">${s.symbol}</span>
          <span class="price" data-ticker-price="${s.symbol}"></span>
          <span class="change" data-ticker-change="${s.symbol}"></span>
        </span>`;
      }).join('');
      container.innerHTML = items;
      tickerBuilt = true;
    }

    // Update values only (no innerHTML rebuild → animation preserved)
    stocks.forEach(s => {
      const p = Market.getPrice(s.symbol);
      if (!p) return;
      const dir = p.changePct >= 0 ? 'up' : 'down';
      container.querySelectorAll(`[data-ticker-price="${s.symbol}"]`).forEach(el => {
        el.textContent = p.current.toFixed(2) + '€';
      });
      container.querySelectorAll(`[data-ticker-change="${s.symbol}"]`).forEach(el => {
        el.textContent = `${p.changePct >= 0 ? '▲' : '▼'} ${Math.abs(p.changePct).toFixed(2)}%`;
        el.className = 'change ' + dir;
      });
    });
  }

  // ==================== PORTFOLIO BAR ====================
  function updatePortfolioBar() {
    // Résumé
    const cashEl = document.getElementById('portfolio-cash');
    const unrealizedEl = document.getElementById('portfolio-unrealized');
    const realizedEl = document.getElementById('portfolio-realized');
    const totalEl = document.getElementById('portfolio-total');

    if (cashEl) cashEl.textContent = Portfolio.getCash().toLocaleString('fr-BE', { minimumFractionDigits: 2 }) + '€';

    const unrealized = Portfolio.getUnrealizedPnL();
    if (unrealizedEl) {
      unrealizedEl.textContent = (unrealized >= 0 ? '+' : '') + unrealized.toLocaleString('fr-BE', { minimumFractionDigits: 2 }) + '€';
      unrealizedEl.className = unrealized >= 0 ? 'text-green' : 'text-red';
    }

    const realized = Portfolio.getRealizedPnL();
    if (realizedEl) {
      realizedEl.textContent = (realized >= 0 ? '+' : '') + realized.toLocaleString('fr-BE', { minimumFractionDigits: 2 }) + '€';
      realizedEl.className = realized >= 0 ? 'text-green' : 'text-red';
    }

    if (totalEl) totalEl.textContent = Portfolio.getTotalValue().toLocaleString('fr-BE', { minimumFractionDigits: 2 }) + '€';

    // Positions table
    updatePositionsTable();

    // History table
    updateHistoryTable();
  }

  function updatePositionsTable() {
    const tbody = document.getElementById('positions-tbody');
    if (!tbody) return;

    const positions = Portfolio.getPositions();
    const entries = Object.entries(positions);

    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Aucune position</td></tr>';
      return;
    }

    tbody.innerHTML = entries.map(([symbol, pos]) => {
      const p = Market.getPrice(symbol);
      const currentValue = p ? (p.current * pos.quantity) : 0;
      const pnl = p ? +(currentValue - pos.totalCost).toFixed(2) : 0;
      const pnlPct = pos.totalCost > 0 ? +((pnl / pos.totalCost) * 100).toFixed(2) : 0;
      const pnlClass = pnl >= 0 ? 'text-green' : 'text-red';

      return `<tr>
        <td><strong>${symbol}</strong></td>
        <td>${pos.quantity}</td>
        <td>${pos.avgPrice.toFixed(2)}€</td>
        <td>${p ? p.current.toFixed(2) : '-'}€</td>
        <td class="${pnlClass}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}€</td>
        <td class="${pnlClass}">${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</td>
      </tr>`;
    }).join('');
  }

  function updateHistoryTable() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    const history = Portfolio.getHistory();

    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center">Aucune transaction</td></tr>';
      return;
    }

    // Dernières 20 transactions
    tbody.innerHTML = history.slice(-20).reverse().map(t => {
      // Afficher le temps écoulé depuis le début du jeu (T+mm:ss)
      const elapsed = Math.max(0, t.time - gameStartTime);
      const mins = Math.floor(elapsed / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000);
      const timeStr = 'T+' + mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
      const sideClass = t.side === 'buy' ? 'text-green' : 'text-red';
      const sideText = t.side === 'buy' ? 'ACHAT' : 'VENTE';

      return `<tr>
        <td>${timeStr}</td>
        <td class="${sideClass}">${sideText}</td>
        <td>${t.symbol}</td>
        <td>${t.quantity} × ${t.price.toFixed(2)}€</td>
        <td>${t.total.toFixed(2)}€</td>
      </tr>`;
    }).join('');
  }

  // ==================== COMPANY INFO ====================
  function updateCompanyInfo(symbol) {
    const container = document.getElementById('company-info');
    if (!container) return;

    const stock = Market.getStocks().find(s => s.symbol === symbol);
    if (!stock) return;

    const riskClass = stock.fundamentals.risk === 'Faible' ? 'risk-low'
      : stock.fundamentals.risk === 'Élevé' ? 'risk-high' : 'risk-moderate';

    container.innerHTML = `
      <div class="company-desc">${stock.description}</div>
      <div class="fundamentals-grid">
        <span class="fund-label">Chiffre d'affaires</span><span class="fund-value">${stock.fundamentals.ca}</span>
        <span class="fund-label">Employés</span><span class="fund-value">${stock.fundamentals.employees}</span>
        <span class="fund-label">P/E ratio</span><span class="fund-value">${stock.fundamentals.pe}</span>
        <span class="fund-label">Dividende</span><span class="fund-value">${stock.fundamentals.dividend}</span>
        <span class="fund-label">Risque</span><span class="fund-value ${riskClass}">${stock.fundamentals.risk}</span>
      </div>
    `;
  }

  // ==================== PENDING ORDERS ====================
  function updatePendingOrders() {
    const container = document.getElementById('pending-orders');
    if (!container) return;

    const orders = OrderBook.getPendingOrders();
    if (orders.length === 0) {
      container.innerHTML = '<span class="text-muted" style="font-size:0.8rem;">Aucun ordre limite en attente</span>';
      return;
    }

    container.innerHTML = orders.map(o => {
      let label, priceStr, labelClass;
      if (o.type === 'stop') {
        label = '🛡️ Stop';
        labelClass = 'text-red';
        priceStr = `déclenchement ≤ ${o.stopPrice.toFixed(2)}€`;
      } else {
        labelClass = o.side === 'buy' ? 'text-green' : 'text-red';
        label = o.side === 'buy' ? 'Limite Achat' : 'Limite Vente';
        priceStr = `@ ${o.limitPrice.toFixed(2)}€`;
      }
      return `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.3rem 0; font-size:0.8rem; border-bottom:1px solid var(--border);">
        <span><span class="${labelClass}">${label}</span> ${o.quantity}x ${o.symbol} ${priceStr}</span>
        <button onclick="App.cancelOrder(${o.id})" style="background:var(--red); color:white; border:none; border-radius:3px; padding:0.15rem 0.4rem; font-size:0.7rem; cursor:pointer;">✕</button>
      </div>`;
    }).join('');
  }

  function cancelOrder(orderId) {
    OrderBook.cancelOrder(orderId);
    updatePendingOrders();
    showToast('Ordre annulé', 'success');
  }

  // ==================== ORDER PANEL ====================
  function setupOrderPanel() {
    // Buy/Sell tabs
    document.querySelectorAll('.order-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        orderSide = tab.dataset.side;
        document.querySelectorAll('.order-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        updateOrderPanel();
      });
    });

    // Market/Limit tabs
    document.querySelectorAll('.order-type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        orderType = tab.dataset.type;
        document.querySelectorAll('.order-type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        updateOrderPanel();
      });
    });

    // Quantity input
    const qtyInput = document.getElementById('order-quantity');
    const priceInput = document.getElementById('order-limit-price');
    const stopInput = document.getElementById('order-stop-price');

    if (qtyInput) {
      qtyInput.addEventListener('input', updateOrderSummary);
      qtyInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitOrder(); });
    }
    if (priceInput) priceInput.addEventListener('input', updateOrderSummary);
    if (stopInput) stopInput.addEventListener('input', updateOrderSummary);

    // Submit
    const submitBtn = document.getElementById('btn-submit-order');
    if (submitBtn) submitBtn.addEventListener('click', submitOrder);

    // Quick quantity buttons
    document.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pct = parseFloat(btn.dataset.pct);
        setQuantityByPct(pct);
      });
    });
  }

  function updateOrderPanel() {
    const limitGroup = document.getElementById('limit-price-group');
    const stopGroup = document.getElementById('stop-price-group');
    const stopInfo = document.getElementById('stop-loss-info');

    if (limitGroup) limitGroup.style.display = orderType === 'limit' ? 'flex' : 'none';
    if (stopGroup)  stopGroup.style.display  = orderType === 'stop'  ? 'flex' : 'none';
    if (stopInfo)   stopInfo.classList.toggle('hidden', orderType !== 'stop');

    // Stop loss = vente uniquement → forcer le côté "sell"
    if (orderType === 'stop') {
      orderSide = 'sell';
      document.querySelectorAll('.order-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.side === 'sell');
      });
    }

    // Update button text & color
    const btn = document.getElementById('btn-submit-order');
    if (btn) {
      if (orderType === 'stop') {
        btn.textContent = 'PLACER STOP LOSS';
        btn.className = 'btn-order sell';
      } else {
        btn.textContent = orderSide === 'buy' ? 'ACHETER' : 'VENDRE';
        btn.className = 'btn-order ' + orderSide;
      }
    }

    // Pre-fill limit price
    if (orderType === 'limit') {
      const p = Market.getPrice(selectedStock);
      const priceInput = document.getElementById('order-limit-price');
      if (p && priceInput && !priceInput.value) {
        priceInput.value = orderSide === 'buy' ? p.ask.toFixed(2) : p.bid.toFixed(2);
      }
    }

    // Pre-fill stop price (légèrement sous le bid actuel)
    if (orderType === 'stop') {
      const p = Market.getPrice(selectedStock);
      const stopInput = document.getElementById('order-stop-price');
      if (p && stopInput && !stopInput.value) {
        stopInput.value = (p.bid * 0.97).toFixed(2); // -3% par défaut
      }
    }

    updateOrderSummary();
  }

  function getPendingReserved(symbol, side) {
    return OrderBook.getPendingOrders()
      // Pour les achats: compter TOUS les ordres buy (cross-stock) pour ne pas surengager le cash
      // Pour les ventes: filtrer par symbole (on ne peut vendre que les actions qu'on possède)
      .filter(o => o.side === side && (side === 'buy' || o.symbol === symbol))
      .reduce((sum, o) => sum + (side === 'sell' ? o.quantity : o.limitPrice * o.quantity), 0);
  }

  function setQuantityByPct(pct) {
    const p = Market.getPrice(selectedStock);
    if (!p) return;

    let maxQty;
    if (orderSide === 'buy') {
      const reservedCash = getPendingReserved(selectedStock, 'buy');
      maxQty = Math.floor((Portfolio.getCash() - reservedCash) / p.ask);
    } else {
      const pos = Portfolio.getPosition(selectedStock);
      const reservedQty = getPendingReserved(selectedStock, 'sell');
      maxQty = pos ? pos.quantity - reservedQty : 0;
    }

    const qty = maxQty <= 0 ? 0 : Math.max(1, Math.floor(maxQty * pct));
    const qtyInput = document.getElementById('order-quantity');
    if (qtyInput) {
      qtyInput.value = qty;
      updateOrderSummary();
    }
  }

  function updateOrderSummary() {
    const qtyInput = document.getElementById('order-quantity');
    const quantity = parseInt(qtyInput?.value) || 0;
    const p = Market.getPrice(selectedStock);
    if (!p) return;

    let price;
    if (orderType === 'limit') {
      price = parseFloat(document.getElementById('order-limit-price')?.value) || 0;
    } else if (orderType === 'stop') {
      price = parseFloat(document.getElementById('order-stop-price')?.value) || 0;
    } else {
      price = orderSide === 'buy' ? p.ask : p.bid;
    }

    const total = +(price * quantity).toFixed(2);

    const priceEl = document.getElementById('summary-price');
    const totalEl = document.getElementById('summary-total');
    const availEl = document.getElementById('summary-available');

    if (priceEl) priceEl.textContent = price.toFixed(2) + '€';
    if (totalEl) totalEl.textContent = total.toLocaleString('fr-BE', { minimumFractionDigits: 2 }) + '€';

    if (availEl) {
      if (orderSide === 'buy') {
        const reservedCash = getPendingReserved(selectedStock, 'buy');
        const availCash = Portfolio.getCash() - reservedCash;
        availEl.textContent = 'Cash dispo: ' + Math.max(0, availCash).toLocaleString('fr-BE', { minimumFractionDigits: 2 }) + '€';
      } else {
        const pos = Portfolio.getPosition(selectedStock);
        const reservedQty = getPendingReserved(selectedStock, 'sell');
        const availQty = (pos ? pos.quantity : 0) - reservedQty;
        availEl.textContent = 'Disponible: ' + Math.max(0, availQty) + ' actions';
      }
    }

    // Enable/disable button
    const btn = document.getElementById('btn-submit-order');
    if (btn) {
      let enabled = quantity > 0 && price > 0 && Market.isOpen();
      if (orderType === 'stop') {
        // Stop loss : vérifier qu'on possède assez d'actions et que le prix stop est sous le bid actuel
        const pos = Portfolio.getPosition(selectedStock);
        const reservedQty = getPendingReserved(selectedStock, 'sell');
        const hasPosition = pos && (pos.quantity - reservedQty) >= quantity;
        const stopBelowBid = price < p.bid;
        enabled = enabled && hasPosition && stopBelowBid;
      } else if (orderSide === 'buy') {
        const reservedCash = getPendingReserved(selectedStock, 'buy');
        enabled = enabled && total <= (Portfolio.getCash() - reservedCash);
      } else {
        const pos = Portfolio.getPosition(selectedStock);
        const reservedQty = getPendingReserved(selectedStock, 'sell');
        enabled = enabled && pos && (pos.quantity - reservedQty) >= quantity;
      }
      btn.disabled = !enabled;
    }
  }

  function submitOrder() {
    const qtyInput = document.getElementById('order-quantity');
    const quantity = parseInt(qtyInput?.value) || 0;
    if (quantity <= 0) return;

    let result;
    if (orderType === 'market') {
      result = OrderBook.executeMarketOrder(selectedStock, orderSide, quantity);
      if (result) {
        const success = Portfolio.executeTrade(result);
        if (success) {
          const action = orderSide === 'buy' ? 'Achat' : 'Vente';
          showToast(`${action} de ${quantity}x ${selectedStock} à ${result.price.toFixed(2)}€`, 'success');
          playSound(orderSide);
          checkAchievements();
          Sync.updateScore();
        } else {
          showToast('Fonds insuffisants ou position manquante', 'error');
        }
      }
    } else if (orderType === 'limit') {
      const limitPrice = parseFloat(document.getElementById('order-limit-price')?.value);
      if (!limitPrice) return;
      result = OrderBook.placeLimitOrder(selectedStock, orderSide, quantity, limitPrice);
      if (result) {
        showToast(`Ordre limite placé : ${orderSide === 'buy' ? 'Achat' : 'Vente'} ${quantity}x ${selectedStock} à ${limitPrice.toFixed(2)}€`, 'success');
        updatePendingOrders();
      }
    } else if (orderType === 'stop') {
      const stopPrice = parseFloat(document.getElementById('order-stop-price')?.value);
      if (!stopPrice) return;
      result = OrderBook.placeStopOrder(selectedStock, quantity, stopPrice);
      if (result) {
        showToast(`🛡️ Stop Loss placé : ${quantity}x ${selectedStock} — déclenchement à ${stopPrice.toFixed(2)}€`, 'success');
        document.getElementById('order-stop-price').value = '';
        updatePendingOrders();
      }
    }

    // Reset quantity
    if (qtyInput) qtyInput.value = '';
    updateOrderSummary();
    updateUI();
  }

  // ==================== TIMER ====================
  function updateTimer() {
    const elapsed = Date.now() - gameStartTime;
    const remaining = Math.max(0, GAME_DURATION - elapsed);

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    const timerEl = document.getElementById('game-timer');
    if (timerEl) {
      timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

      timerEl.classList.remove('warning', 'critical');
      if (remaining < 300000) timerEl.classList.add('critical');      // < 5 min
      else if (remaining < 600000) timerEl.classList.add('warning');  // < 10 min
    }

    // Marché fermé
    if (remaining <= 0) {
      closeMarket();
    }
  }

  let marketClosed = false;
  function closeMarket() {
    if (marketClosed) return;
    marketClosed = true;
    Market.stop();
    Events.stop();
    clearInterval(timerInterval);
    clearInterval(uiInterval);
    Sync.updateScore();
    Sync.setMarketStatus(false);

    // Afficher overlay
    const overlay = document.getElementById('market-closed-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      const finalValue = document.getElementById('final-value');
      const finalPnl = document.getElementById('final-pnl');

      if (finalValue) finalValue.textContent = Portfolio.getTotalValue().toLocaleString('fr-BE', { minimumFractionDigits: 2 }) + '€';
      if (finalPnl) {
        const pct = Portfolio.getPerformancePct();
        finalPnl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
        finalPnl.className = 'final-pnl ' + (pct >= 0 ? 'text-green' : 'text-red');
      }
    }
  }

  // ==================== FLASH NEWS ====================
  function showFlashNews(event) {
    // Banner overlay
    const banner = document.getElementById('flash-news');
    if (banner) {
      const textEl = banner.querySelector('.flash-text');
      const impactEl = banner.querySelector('.flash-impact');

      if (textEl) textEl.textContent = event.text;
      if (impactEl) {
        const sign = event.impact >= 0 ? '+' : '';
        impactEl.textContent = `Impact : ${sign}${event.impactPct}%`;
        impactEl.className = 'flash-impact ' + (event.type === 'positive' ? 'positive' : 'negative');
      }

      banner.classList.remove('hidden');
      playSound('news');

      setTimeout(() => {
        banner.classList.add('hidden');
      }, 12000);
    }

    // News feed (persistent log)
    const feed = document.getElementById('news-feed');
    if (feed) {
      // Remove placeholder
      if (feed.querySelector('.text-muted')) feed.innerHTML = '';

      const now = new Date();
      const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
      const sign = event.impact >= 0 ? '+' : '';

      const item = document.createElement('div');
      item.className = 'news-item ' + event.type;
      item.innerHTML = `
        <div class="news-time">${timeStr}</div>
        <div>${event.text}</div>
        <div class="news-impact ${event.type === 'positive' ? 'text-green' : 'text-red'}">${sign}${event.impactPct}%</div>
      `;

      feed.prepend(item);

      // Limit to 15 items
      while (feed.children.length > 15) {
        feed.removeChild(feed.lastChild);
      }
    }

    // Badge notification on News tab
    addTabBadge('news');
    if (event.isCalendar) addTabBadge('calendar');
  }

  // ==================== TOAST ====================
  let activeToasts = [];

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Décaler les toasts actifs vers le haut
    activeToasts.push(toast);
    repositionToasts();

    setTimeout(() => {
      activeToasts = activeToasts.filter(t => t !== toast);
      toast.remove();
      repositionToasts();
    }, 4000);
  }

  function repositionToasts() {
    let offset = 1.5; // rem from bottom
    for (let i = activeToasts.length - 1; i >= 0; i--) {
      activeToasts[i].style.bottom = offset + 'rem';
      offset += 3.5; // height approx of each toast
    }
  }

  // ==================== TUTORIAL ====================
  function showTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay) return;

    // Mettre à jour le budget et la durée dans le tutoriel
    const budgetEl = document.getElementById('tutorial-budget');
    if (budgetEl) budgetEl.textContent = Portfolio.getInitialCapital().toLocaleString('fr-BE');
    const durationEl = document.getElementById('tutorial-duration');
    if (durationEl) {
      const min = GAME_DURATION / 60000;
      durationEl.textContent = min >= 60 ? (min / 60) + ' heure' : min + ' minutes';
    }

    overlay.classList.remove('hidden');
    tutorialStep = 0;
    updateTutorialStep();
  }

  function nextTutorial() {
    tutorialStep++;
    if (tutorialStep >= TUTORIAL_STEPS) {
      closeTutorial();
    } else {
      updateTutorialStep();
    }
  }

  function prevTutorial() {
    tutorialStep = Math.max(0, tutorialStep - 1);
    updateTutorialStep();
  }

  function closeTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.classList.add('hidden');
    localStorage.setItem('bourse_tutorialDone', 'true');
  }

  function updateTutorialStep() {
    document.querySelectorAll('.tutorial-card .step').forEach((el, i) => {
      el.classList.toggle('active', i === tutorialStep);
    });
    document.querySelectorAll('.tutorial-dot').forEach((el, i) => {
      el.classList.toggle('active', i === tutorialStep);
    });
  }

  // ==================== CALENDAR UI ====================
  function updateCalendarUI(schedule) {
    const container = document.getElementById('calendar-events');
    if (!container) return;

    if (!schedule) schedule = Events.getSchedule();
    if (!schedule || schedule.length === 0) {
      container.innerHTML = '<div class="text-muted" style="font-size:0.8rem;">Aucun événement programmé</div>';
      return;
    }

    container.innerHTML = schedule.map(e => {
      let statusClass = '';
      let statusText = '';
      let icon = '📅';

      if (e.triggered) {
        statusClass = 'cal-past';
        statusText = 'Publié';
        icon = '✅';
      } else if (e.isSoon) {
        statusClass = 'cal-soon';
        statusText = `Dans ${e.remainingMin} min`;
        icon = '⏰';
      } else {
        statusClass = 'cal-future';
        statusText = `Dans ${e.remainingMin} min`;
        icon = '📅';
      }

      return `<div class="cal-item ${statusClass}">
        <span class="cal-icon">${icon}</span>
        <div class="cal-info">
          <div class="cal-label">${e.label}</div>
          <div class="cal-time">${statusText}</div>
        </div>
      </div>`;
    }).join('');
  }

  // ==================== PORTFOLIO MINI-CHART ====================
  function initPortfolioChart() {
    const canvas = document.getElementById('portfolio-chart');
    if (!canvas) return;

    portfolioChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 1.5,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: {
            display: true,
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#6b7280', font: { size: 9 }, callback: v => (v/1000).toFixed(1) + 'k' },
          },
        },
      },
    });
  }

  function updatePortfolioChart() {
    if (!portfolioChart) return;
    const hist = Portfolio.getValueHistory();
    const labels = hist.map(h => {
      const d = new Date(h.time);
      return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    });
    portfolioChart.data.labels = labels;
    portfolioChart.data.datasets[0].data = hist.map(h => h.value);

    // Color based on performance
    const isUp = hist.length > 1 && hist[hist.length - 1].value >= hist[0].value;
    portfolioChart.data.datasets[0].borderColor = isUp ? '#10b981' : '#ef4444';
    portfolioChart.data.datasets[0].backgroundColor = isUp ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
    portfolioChart.update('none');
  }

  // ==================== SOUND EFFECTS ====================
  let sharedAudioCtx = null;
  function getAudioCtx() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  }

  function playSound(type) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.08;

    if (type === 'buy') {
      osc.frequency.value = 600;
      osc.type = 'sine';
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'sell') {
      osc.frequency.value = 400;
      osc.type = 'sine';
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'news') {
      osc.frequency.value = 800;
      osc.type = 'square';
      gain.gain.value = 0.04;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'achievement') {
      osc.frequency.value = 523;
      osc.type = 'sine';
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.frequency.value = 659; osc2.type = 'sine';
        gain2.gain.value = 0.08;
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc2.start(); osc2.stop(ctx.currentTime + 0.6);
      }, 150);
      osc.stop(ctx.currentTime + 0.5);
    }
  }

  // ==================== ACHIEVEMENTS ====================
  const ACHIEVEMENT_DEFS = [
    { id: 'first_trade', name: 'Baptême du feu', desc: 'Passe ton premier ordre', icon: '🎯', check: () => Portfolio.getHistory().length >= 1 },
    { id: 'trader_10', name: 'Trader actif', desc: 'Passe 10 ordres', icon: '📈', check: () => Portfolio.getHistory().length >= 10 },
    { id: 'trader_25', name: 'Trader compulsif', desc: 'Passe 25 ordres', icon: '🔥', check: () => Portfolio.getHistory().length >= 25 },
    { id: 'diversified', name: 'Diversifié', desc: 'Possède 3 actions différentes', icon: '🎨', check: () => Object.keys(Portfolio.getPositions()).length >= 3 },
    { id: 'all_in', name: 'All-In', desc: 'Possède les 7 actions', icon: '🌍', check: () => Object.keys(Portfolio.getPositions()).length >= 7 },
    { id: 'profit_5pct', name: 'En forme !', desc: 'Atteins +5% de performance', icon: '💰', check: () => Portfolio.getPerformancePct() >= 5 },
    { id: 'profit_10pct', name: 'Loup de Bruxelles', desc: 'Atteins +10% de performance', icon: '🐺', check: () => Portfolio.getPerformancePct() >= 10 },
    { id: 'loss_5pct', name: 'Leçon apprise', desc: 'Subis -5% de perte', icon: '📚', check: () => Portfolio.getPerformancePct() <= -5 },
    { id: 'cash_king', name: 'Cash is King', desc: 'Garde plus de 8 000€ en cash', icon: '👑', check: () => Portfolio.getCash() >= 8000 && Portfolio.getHistory().length >= 3 },
    { id: 'big_order', name: 'Grosse mise', desc: 'Passe un ordre de plus de 2 000€', icon: '🎰', check: () => Portfolio.getHistory().some(h => h.total >= 2000) },
    { id: 'realized_profit', name: 'Plus-value réelle', desc: 'Réalise un profit (PnL réalisé > 0)', icon: '✅', check: () => Portfolio.getRealizedPnL() > 0 },
    { id: 'speed_trader', name: 'Speed Trader', desc: 'Passe 5 ordres en 2 minutes', icon: '⚡', check: () => {
      const h = Portfolio.getHistory();
      if (h.length < 5) return false;
      for (let i = 4; i < h.length; i++) {
        if (h[i].time - h[i-4].time < 120000) return true;
      }
      return false;
    }},
  ];

  function saveAchievements() {
    const roomCode = Sync.getRoomCode() || 'solo';
    localStorage.setItem('bourse_achievements_' + roomCode, JSON.stringify([...shownAchievements]));
  }

  function restoreAchievements() {
    const roomCode = Sync.getRoomCode() || 'solo';
    const saved = localStorage.getItem('bourse_achievements_' + roomCode);
    if (!saved) return;
    try {
      const ids = JSON.parse(saved);
      ids.forEach(id => {
        shownAchievements.add(id);
        const def = ACHIEVEMENT_DEFS.find(a => a.id === id);
        if (def) achievements.push(def);
      });
      updateAchievementsBadge();
    } catch (e) {}
  }

  function checkAchievements() {
    ACHIEVEMENT_DEFS.forEach(a => {
      if (!shownAchievements.has(a.id) && a.check()) {
        shownAchievements.add(a.id);
        achievements.push(a);
        showAchievementToast(a);
        playSound('achievement');
        updateAchievementsBadge();
        saveAchievements();
      }
    });
  }

  function showAchievementToast(a) {
    const toast = document.createElement('div');
    toast.className = 'toast achievement-toast';
    toast.innerHTML = `<span style="font-size:1.5rem;">${a.icon}</span> <div><strong>${a.name}</strong><br><span class="text-muted" style="font-size:0.75rem;">${a.desc}</span></div>`;
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '0.75rem';
    toast.style.borderColor = '#f59e0b';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  function updateAchievementsBadge() {
    const badge = document.getElementById('achievements-count');
    if (badge) {
      badge.textContent = achievements.length + '/' + ACHIEVEMENT_DEFS.length;
    }
    // Update panel
    const panel = document.getElementById('achievements-list');
    if (panel) {
      panel.innerHTML = ACHIEVEMENT_DEFS.map(a => {
        const unlocked = shownAchievements.has(a.id);
        return `<div class="achievement-item ${unlocked ? 'unlocked' : 'locked'}">
          <span class="achievement-icon">${unlocked ? a.icon : '🔒'}</span>
          <div>
            <div class="achievement-name">${a.name}</div>
            <div class="achievement-desc">${a.desc}</div>
          </div>
        </div>`;
      }).join('');
    }
  }

  function toggleAchievements() {
    const panel = document.getElementById('achievements-panel');
    if (panel) panel.classList.toggle('hidden');
    updateAchievementsBadge();
  }

  // ==================== RIGHT PANEL TABS ====================
  let activeRightTab = 'order';
  let newNewsCount = 0;
  let newCalendarCount = 0;

  function setupRightPanelTabs() {
    document.querySelectorAll('.right-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.rtab;
        activeRightTab = target;

        // Update tab buttons
        document.querySelectorAll('.right-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update content
        document.querySelectorAll('.right-tab-content').forEach(c => c.classList.remove('active'));
        const content = document.getElementById('rtab-' + target);
        if (content) content.classList.add('active');

        // Clear badge on clicked tab
        const badge = tab.querySelector('.tab-badge');
        if (badge) badge.remove();
        if (target === 'news') newNewsCount = 0;
        if (target === 'calendar') newCalendarCount = 0;
      });
    });
  }

  function addTabBadge(tabName) {
    if (activeRightTab === tabName) return; // Already viewing this tab
    const tab = document.querySelector(`.right-tab[data-rtab="${tabName}"]`);
    if (!tab) return;

    if (tabName === 'news') newNewsCount++;
    if (tabName === 'calendar') newCalendarCount++;
    const count = tabName === 'news' ? newNewsCount : newCalendarCount;

    let badge = tab.querySelector('.tab-badge');
    if (badge) {
      badge.textContent = count;
    } else {
      badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = count;
      tab.appendChild(badge);
    }
  }

  // ==================== TIMEFRAME BUTTONS ====================
  function setupTimeframeButtons() {
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tf = parseInt(btn.dataset.tf);
        Charts.setTimeframe(tf);
      });
    });
  }

  // ==================== LIVE LEADERBOARD ====================
  function setupLiveLeaderboard() {
    // Listen for Firebase leaderboard updates
    Sync.onLeaderboardUpdate(updateLiveLeaderboard);
    // Also update from local data immediately
    updateLiveLeaderboard(Sync.getLeaderboard());
  }

  function updateLiveLeaderboard(players) {
    const tbody = document.getElementById('live-leaderboard-tbody');
    if (!tbody) return;

    if (!players || players.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">En attente des joueurs...</td></tr>';
      return;
    }

    const myName = Sync.getPlayerName();
    tbody.innerHTML = players.map((p, i) => {
      const isMe = p.name === myName;
      const perf = p.performancePct || 0;
      const perfClass = perf >= 0 ? 'text-green' : 'text-red';
      return `<tr class="${isMe ? 'is-me' : ''}">
        <td>${i + 1}</td>
        <td>${escapeHtml(p.name)}${isMe ? ' (moi)' : ''}</td>
        <td style="text-align:right;">${p.totalValue ? p.totalValue.toLocaleString('fr-BE', { minimumFractionDigits: 2 }) + '€' : '-'}</td>
        <td style="text-align:right;" class="${perfClass}">${perf >= 0 ? '+' : ''}${perf.toFixed(2)}%</td>
      </tr>`;
    }).join('');
  }

  // ==================== MOBILE NAV ====================
  function setupMobileNav() {
    const nav = document.getElementById('mobile-nav');
    if (!nav) return;

    nav.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.panel;
        nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Show/hide panels
        document.getElementById('panel-left')?.classList.toggle('hidden', target !== 'stocks');
        document.querySelector('.chart-panel')?.classList.toggle('hidden', target !== 'chart');
        document.getElementById('panel-right')?.classList.toggle('hidden', target !== 'order');
        document.querySelector('.portfolio-bar')?.classList.toggle('hidden', target !== 'portfolio');
      });
    });
  }

  return {
    initGame,
    selectStock,
    cancelOrder,
    nextTutorial,
    prevTutorial,
    closeTutorial,
    showToast,
    playSound,
    toggleAchievements,
  };
})();
