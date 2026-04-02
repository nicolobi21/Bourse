/**
 * charts.js — Graphiques en chandeliers japonais via Chart.js
 * Technique : barres flottantes [low,high] pour mèches + [open,close] pour corps
 * Aucune dépendance supplémentaire requise.
 */

const Charts = (() => {
  const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

  let chart = null;
  let currentSymbol = null;
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
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          // Dataset 0 — Mèches (low → high), très fines
          {
            label: 'Mèches',
            data: [],
            backgroundColor: [],
            borderColor:  'transparent',
            barPercentage: 0.12,
            categoryPercentage: 1.0,
            order: 2,
          },
          // Dataset 1 — Corps (open → close)
          {
            label: 'Corps',
            data: [],
            backgroundColor: [],
            borderColor: 'transparent',
            barPercentage: 0.55,
            categoryPercentage: 0.85,
            order: 1,
          },
          // Dataset 2 — Achats (scatter)
          {
            type: 'scatter',
            label: 'Achats',
            data: [],
            backgroundColor: '#10b981',
            pointRadius: 7,
            pointStyle: 'triangle',
            showLine: false,
            order: 0,
          },
          // Dataset 3 — Ventes (scatter)
          {
            type: 'scatter',
            label: 'Ventes',
            data: [],
            backgroundColor: '#ef4444',
            pointRadius: 7,
            pointStyle: 'rectRot',
            showLine: false,
            order: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a2332',
            borderColor:     '#374151',
            borderWidth: 1,
            titleColor:  '#e5e7eb',
            bodyColor:   '#9ca3af',
            filter: (item) => item.datasetIndex !== 0, // masquer la mèche dans le tooltip
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 1) {
                  const d = ctx.raw;
                  if (!Array.isArray(d)) return null;
                  const [a, b] = d;
                  const open  = Math.min(a, b);
                  const close = Math.max(a, b);
                  return `O: ${open.toFixed(2)}€  F: ${close.toFixed(2)}€`;
                }
                if (ctx.datasetIndex === 2) return `Achat: ${ctx.parsed.y.toFixed(2)}€`;
                if (ctx.datasetIndex === 3) return `Vente: ${ctx.parsed.y.toFixed(2)}€`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'category',
            display: true,
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#6b7280', maxTicksLimit: 8, font: { size: 10 } },
          },
          y: {
            display: true,
            grid: { color: 'rgba(255,255,255,0.04)' },
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

    const GREEN      = 'rgba(16, 185, 129, 0.9)';
    const RED        = 'rgba(239, 68, 68, 0.9)';
    const GREEN_WICK = 'rgba(16, 185, 129, 0.6)';
    const RED_WICK   = 'rgba(239, 68, 68, 0.6)';

    const labels    = history.map(h => formatDateLabel(h.gameDate || h.time));
    const wickData  = history.map(h => [h.low  ?? h.price, h.high ?? h.price]);
    const bodyData  = history.map(h => [h.open ?? h.price, h.close ?? h.price]);
    const bodyColors = history.map(h => (h.close ?? h.price) >= (h.open ?? h.price) ? GREEN : RED);
    const wickColors = history.map(h => (h.close ?? h.price) >= (h.open ?? h.price) ? GREEN_WICK : RED_WICK);

    chart.data.labels                    = labels;
    chart.data.datasets[0].data          = wickData;
    chart.data.datasets[0].backgroundColor = wickColors;
    chart.data.datasets[1].data          = bodyData;
    chart.data.datasets[1].backgroundColor = bodyColors;

    // Markers d'achat / vente (par label de date)
    const trades = Portfolio.getHistory().filter(t => t.symbol === currentSymbol);
    const buyPoints  = [];
    const sellPoints = [];

    trades.forEach(trade => {
      // Trouver l'entrée live la plus proche par timestamp réel
      let closestIdx = -1;
      let minDist = Infinity;
      history.forEach((h, i) => {
        const dist = Math.abs(h.time - trade.time);
        if (dist < minDist) { minDist = dist; closestIdx = i; }
      });
      // Afficher uniquement si le trade correspond à un point live récent (< 60 s)
      if (closestIdx >= 0 && minDist < 60000) {
        const point = { x: labels[closestIdx], y: trade.price };
        if (trade.side === 'buy') buyPoints.push(point);
        else                      sellPoints.push(point);
      }
    });

    chart.data.datasets[2].data = buyPoints;
    chart.data.datasets[3].data = sellPoints;

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
