/**
 * charts.js — Graphiques de cours en temps réel via Chart.js
 * Axe X en jours de trading virtuels (DD Mon en français)
 */

const Charts = (() => {
  const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

  let chart = null;
  let currentSymbol = null;
  let tradeMarkers = [];
  let timeframeDays = 90; // 0 = tout, 7 = 1 sem, 30 = 1 mois, 90 = 3 mois

  function formatDateLabel(ts) {
    const d = new Date(ts);
    return d.getUTCDate() + ' ' + MONTHS_FR[d.getUTCMonth()];
  }

  function init(canvasId, symbol) {
    currentSymbol = symbol;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Prix (€)',
            data: [],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHitRadius: 10,
          },
          {
            label: 'Achats',
            data: [],
            borderColor: 'transparent',
            backgroundColor: '#10b981',
            pointRadius: 6,
            pointStyle: 'triangle',
            showLine: false,
          },
          {
            label: 'Ventes',
            data: [],
            borderColor: 'transparent',
            backgroundColor: '#ef4444',
            pointRadius: 6,
            pointStyle: 'rectRot',
            showLine: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: {
          intersect: false,
          mode: 'index',
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a2332',
            borderColor: '#374151',
            borderWidth: 1,
            titleColor: '#e5e7eb',
            bodyColor: '#9ca3af',
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) return `Prix: ${ctx.parsed.y.toFixed(2)}€`;
                if (ctx.datasetIndex === 1) return `Achat: ${ctx.parsed.y.toFixed(2)}€`;
                if (ctx.datasetIndex === 2) return `Vente: ${ctx.parsed.y.toFixed(2)}€`;
              },
            },
          },
        },
        scales: {
          x: {
            display: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: '#6b7280',
              maxTicksLimit: 8,
              font: { size: 10 },
            },
          },
          y: {
            display: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: '#6b7280',
              font: { size: 10 },
              callback: (v) => v.toFixed(2) + '€',
            },
          },
        },
      },
    });
  }

  function setTimeframe(days) {
    timeframeDays = days;
    update();
  }

  function update() {
    if (!chart || !currentSymbol) return;

    let history = Market.getHistory(currentSymbol);

    // Filtrer par nombre de jours (slice depuis la fin)
    if (timeframeDays > 0 && history.length > timeframeDays) {
      history = history.slice(-timeframeDays);
    }

    // Utiliser gameDate pour l'affichage, time pour le matching des trades
    const labels = history.map(h => formatDateLabel(h.gameDate || h.time));
    const data = history.map(h => h.price);

    chart.data.labels = labels;
    chart.data.datasets[0].data = data;

    // Couleur selon tendance
    if (data.length >= 2) {
      const isUp = data[data.length - 1] >= data[0];
      chart.data.datasets[0].borderColor = isUp ? '#10b981' : '#ef4444';
      chart.data.datasets[0].backgroundColor = isUp
        ? 'rgba(16, 185, 129, 0.05)'
        : 'rgba(239, 68, 68, 0.05)';
    }

    // Trade markers : match par timestamp réel (uniquement sur la partie live)
    const trades = Portfolio.getHistory().filter(t => t.symbol === currentSymbol);
    const buyPoints = new Array(labels.length).fill(null);
    const sellPoints = new Array(labels.length).fill(null);

    trades.forEach(trade => {
      let closest = -1;
      let minDist = Infinity;
      history.forEach((h, i) => {
        const dist = Math.abs(h.time - trade.time);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });
      // N'afficher que si le trade est proche d'un point live (< 60s d'écart)
      if (closest >= 0 && minDist < 60000) {
        if (trade.side === 'buy') buyPoints[closest] = trade.price;
        else sellPoints[closest] = trade.price;
      }
    });

    chart.data.datasets[1].data = buyPoints;
    chart.data.datasets[2].data = sellPoints;

    chart.update('none');
  }

  function switchStock(symbol) {
    currentSymbol = symbol;
    update();
  }

  function getChart() {
    return chart;
  }

  return { init, update, switchStock, setTimeframe, getChart };
})();
