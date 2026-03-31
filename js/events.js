/**
 * events.js — Système d'événements : Calendrier programmé + Flash infos surprises
 *
 * - CALENDAR_EVENTS : événements annoncés à l'avance dans l'agenda (heure connue, impact inconnu)
 * - NEWS_BANK : flash infos surprises qui tombent aléatoirement
 */

const Events = (() => {

  // ==================== CALENDRIER (événements programmés) ====================
  // minuteOffset = minute de la partie où l'événement se déclenche
  // L'événement est visible dans l'agenda dès le début, mais l'impact n'est révélé qu'au moment T
  const CALENDAR_EVENTS = [
    // Résultats trimestriels
    { minuteOffset: 5,  label: "Résultats Q3 — AB InBev",          target: 'ABI',  possibleOutcomes: [
      { text: "AB InBev : résultats Q3 supérieurs aux attentes, CA en hausse de 8%", min: 0.04, max: 0.09, type: 'positive' },
      { text: "AB InBev : résultats Q3 décevants, marges en baisse en Europe", min: -0.06, max: -0.02, type: 'negative' },
    ]},
    { minuteOffset: 10, label: "Publication des résultats — UCB",   target: 'UCB',  possibleOutcomes: [
      { text: "UCB : bénéfice net en hausse de 15%, guidances relevées", min: 0.05, max: 0.10, type: 'positive' },
      { text: "UCB : résultats en ligne mais pipeline décevant, le marché sanctionne", min: -0.07, max: -0.03, type: 'negative' },
    ]},
    { minuteOffset: 15, label: "Décision de la BCE sur les taux",   target: 'ALL',  possibleOutcomes: [
      { text: "La BCE maintient ses taux — le marché salue la stabilité", min: 0.01, max: 0.03, type: 'positive' },
      { text: "La BCE relève ses taux de 25 points de base — pression sur les marchés", min: -0.03, max: -0.01, type: 'negative' },
      { text: "La BCE baisse ses taux de 25 points — euphorie sur les marchés européens", min: 0.03, max: 0.05, type: 'positive' },
    ]},
    { minuteOffset: 20, label: "Chiffres de vente — Colruyt",       target: 'COLR', possibleOutcomes: [
      { text: "Colruyt : ventes en hausse de 4.2%, croissance organique solide", min: 0.03, max: 0.07, type: 'positive' },
      { text: "Colruyt : recul des ventes de 1.5%, pression concurrentielle accrue", min: -0.05, max: -0.02, type: 'negative' },
    ]},
    { minuteOffset: 25, label: "Annonce stratégique — Proximus",    target: 'PROX', possibleOutcomes: [
      { text: "Proximus annonce un partenariat 5G majeur avec un géant tech américain", min: 0.04, max: 0.08, type: 'positive' },
      { text: "Proximus : plan de restructuration annoncé, 1 200 emplois supprimés", min: -0.06, max: -0.02, type: 'negative' },
    ]},
    { minuteOffset: 30, label: "Publication indice PMI zone euro",   target: 'ALL',  possibleOutcomes: [
      { text: "PMI zone euro à 52.4 — expansion plus forte que prévu", min: 0.02, max: 0.04, type: 'positive' },
      { text: "PMI zone euro à 47.1 — contraction inquiétante de l'activité", min: -0.03, max: -0.01, type: 'negative' },
    ]},
    { minuteOffset: 35, label: "Résultats semestriels — Solvay",    target: 'SOLV', possibleOutcomes: [
      { text: "Solvay : EBITDA en hausse de 12%, relèvement des objectifs annuels", min: 0.04, max: 0.08, type: 'positive' },
      { text: "Solvay : provision de 150M€ pour litige environnemental, résultats en baisse", min: -0.07, max: -0.03, type: 'negative' },
    ]},
    { minuteOffset: 40, label: "Résultats annuels — Ageas",         target: 'AGS',  possibleOutcomes: [
      { text: "Ageas : bénéfice record, dividende exceptionnel de 3€ par action", min: 0.05, max: 0.09, type: 'positive' },
      { text: "Ageas : sinistralité en hausse, provisions doublées, le titre décroche", min: -0.08, max: -0.03, type: 'negative' },
    ]},
    { minuteOffset: 45, label: "Contrat majeur — Bekaert",          target: 'BEKB', possibleOutcomes: [
      { text: "Bekaert décroche un méga-contrat de 500M€ avec un constructeur automobile chinois", min: 0.06, max: 0.10, type: 'positive' },
      { text: "Bekaert : perte d'un client majeur, avertissement sur résultats", min: -0.08, max: -0.04, type: 'negative' },
    ]},
    { minuteOffset: 50, label: "Chiffres inflation Belgique",       target: 'ALL',  possibleOutcomes: [
      { text: "Inflation belge en recul à 1.8% — confiance des investisseurs renforcée", min: 0.02, max: 0.04, type: 'positive' },
      { text: "Inflation belge remonte à 3.4% — craintes de resserrement monétaire", min: -0.03, max: -0.01, type: 'negative' },
    ]},
  ];

  // ==================== FLASH INFOS SURPRISES ====================
  const NEWS_BANK = [
    { text: "AB InBev lance une nouvelle marque premium en Asie", target: 'ABI', min: 0.02, max: 0.05, type: 'positive' },
    { text: "AB InBev perd des parts de marché en Amérique latine", target: 'ABI', min: -0.04, max: -0.01, type: 'negative' },
    { text: "UCB signe un partenariat stratégique avec un géant pharmaceutique japonais", target: 'UCB', min: 0.03, max: 0.07, type: 'positive' },
    { text: "Un essai clinique d'UCB montre des effets secondaires inattendus", target: 'UCB', min: -0.05, max: -0.02, type: 'negative' },
    { text: "Proximus déploie la 5G dans 10 nouvelles villes belges", target: 'PROX', min: 0.03, max: 0.06, type: 'positive' },
    { text: "Le régulateur belge impose de nouvelles contraintes tarifaires à Proximus", target: 'PROX', min: -0.05, max: -0.02, type: 'negative' },
    { text: "Solvay augmente ses prix de 5% sur toute sa gamme chimie de spécialité", target: 'SOLV', min: 0.02, max: 0.05, type: 'positive' },
    { text: "Colruyt annonce l'ouverture de 15 nouveaux magasins en Wallonie", target: 'COLR', min: 0.02, max: 0.04, type: 'positive' },
    { text: "Colruyt subit une cyberattaque — systèmes de caisse perturbés", target: 'COLR', min: -0.04, max: -0.01, type: 'negative' },
    { text: "Ageas étend ses activités d'assurance vie en Chine", target: 'AGS', min: 0.02, max: 0.05, type: 'positive' },
    { text: "Bekaert investit massivement dans les fibres pour énergie solaire", target: 'BEKB', min: 0.03, max: 0.06, type: 'positive' },
    { text: "La demande mondiale d'acier chute — Bekaert sous pression", target: 'BEKB', min: -0.05, max: -0.02, type: 'negative' },
    { text: "Crise dans le secteur télécom européen — nouvelles régulations", target: 'SECTOR:Télécom', min: -0.04, max: -0.01, type: 'negative' },
    { text: "Le secteur pharmaceutique européen en hausse après de bons résultats", target: 'SECTOR:Pharmaceutique', min: 0.02, max: 0.05, type: 'positive' },
    { text: "Tensions géopolitiques — les marchés européens sous pression", target: 'ALL', min: -0.03, max: -0.01, type: 'negative' },
    { text: "Le PIB de la zone euro dépasse les attentes — optimisme général", target: 'ALL', min: 0.02, max: 0.04, type: 'positive' },
  ];

  let usedIndices = new Set();
  let surpriseIntervalId = null;
  let calendarCheckId = null;
  let listeners = [];
  let calendarListeners = [];
  let gameStartTime = null;
  let gameDurationMin = 60;
  let triggeredCalendarEvents = new Set();
  let scheduledEvents = []; // Computed on start

  function start(startTime, durationMs) {
    gameStartTime = startTime || Date.now();
    gameDurationMin = (durationMs || 3600000) / 60000;

    // Compute scheduled events based on game duration
    computeSchedule();

    // Start surprise flash infos (every 3-6 min)
    if (!surpriseIntervalId) {
      scheduleSurprise();
    }

    // Check calendar every 5 seconds
    if (!calendarCheckId) {
      calendarCheckId = setInterval(checkCalendar, 5000);
    }
  }

  function stop() {
    if (surpriseIntervalId) {
      clearTimeout(surpriseIntervalId);
      surpriseIntervalId = null;
    }
    if (calendarCheckId) {
      clearInterval(calendarCheckId);
      calendarCheckId = null;
    }
  }

  function computeSchedule() {
    // Scale calendar events to fit game duration with minimum spacing
    const minSpacing = 2; // Au moins 2 minutes entre chaque événement
    const endBuffer = 3;  // Pas d'événement dans les 3 dernières minutes

    // D'abord, filtrer et scaler
    let scaled = CALENDAR_EVENTS.map(e => ({
      ...e,
      scaledMinute: Math.round(e.minuteOffset * (gameDurationMin / 60)),
      triggered: false,
    }));

    // Filtrer ceux qui tombent trop tard
    scaled = scaled.filter(e => e.scaledMinute <= gameDurationMin - endBuffer);

    // Limiter le nombre d'événements pour les parties courtes
    if (gameDurationMin <= 20) {
      scaled = scaled.slice(0, 5); // Max 5 événements pour parties très courtes
    } else if (gameDurationMin <= 35) {
      scaled = scaled.slice(0, 7);
    }

    // Assurer un espacement minimum entre les événements
    const spaced = [];
    let lastMinute = -minSpacing;
    for (const e of scaled) {
      const adjustedMinute = Math.max(e.scaledMinute, lastMinute + minSpacing);
      if (adjustedMinute <= gameDurationMin - endBuffer) {
        spaced.push({ ...e, scaledMinute: adjustedMinute });
        lastMinute = adjustedMinute;
      }
    }

    scheduledEvents = spaced;
    triggeredCalendarEvents.clear();
  }

  function getSchedule() {
    if (!gameStartTime) return [];

    return scheduledEvents.map(e => {
      const triggerTime = gameStartTime + e.scaledMinute * 60000;
      const elapsed = Date.now() - gameStartTime;
      const elapsedMin = elapsed / 60000;
      const remaining = Math.max(0, e.scaledMinute - elapsedMin);

      return {
        label: e.label,
        target: e.target,
        minuteOffset: e.scaledMinute,
        triggerTime,
        triggered: triggeredCalendarEvents.has(e.minuteOffset),
        remainingMin: Math.round(remaining),
        isPast: elapsedMin >= e.scaledMinute,
        isSoon: remaining > 0 && remaining <= 3, // within 3 minutes
      };
    });
  }

  function checkCalendar() {
    if (!Market.isOpen() || !gameStartTime) return;

    const elapsed = Date.now() - gameStartTime;
    const elapsedMin = elapsed / 60000;

    scheduledEvents.forEach(e => {
      if (triggeredCalendarEvents.has(e.minuteOffset)) return;
      if (elapsedMin >= e.scaledMinute) {
        triggeredCalendarEvents.add(e.minuteOffset);
        triggerCalendarEvent(e);
      }
    });

    // Notify calendar UI update
    calendarListeners.forEach(fn => fn(getSchedule()));
  }

  function triggerCalendarEvent(calEvent) {
    // Pick random outcome
    const outcome = calEvent.possibleOutcomes[Math.floor(Math.random() * calEvent.possibleOutcomes.length)];
    const impact = outcome.min + Math.random() * (outcome.max - outcome.min);

    Market.applyShock(calEvent.target, impact);

    const impactPct = (impact * 100).toFixed(1);
    const eventData = {
      ...outcome,
      target: calEvent.target,
      impact,
      impactPct,
      time: Date.now(),
      isCalendar: true,
      calendarLabel: calEvent.label,
    };

    listeners.forEach(fn => fn(eventData));
  }

  // ==================== SURPRISE FLASH INFOS ====================
  function scheduleSurprise() {
    const delay = (180 + Math.random() * 180) * 1000; // 3-6 min
    surpriseIntervalId = setTimeout(() => {
      triggerSurprise();
      scheduleSurprise();
    }, delay);
  }

  function triggerSurprise() {
    if (!Market.isOpen()) return;

    if (usedIndices.size >= NEWS_BANK.length) {
      usedIndices.clear();
    }

    let idx;
    do {
      idx = Math.floor(Math.random() * NEWS_BANK.length);
    } while (usedIndices.has(idx));

    usedIndices.add(idx);
    const event = NEWS_BANK[idx];
    const impact = event.min + Math.random() * (event.max - event.min);

    Market.applyShock(event.target, impact);

    const impactPct = (impact * 100).toFixed(1);
    const eventData = {
      ...event,
      impact,
      impactPct,
      time: Date.now(),
      isCalendar: false,
    };

    listeners.forEach(fn => fn(eventData));
  }

  function forceEvent() {
    triggerSurprise();
  }

  function onEvent(fn) {
    listeners.push(fn);
  }

  function onCalendarUpdate(fn) {
    calendarListeners.push(fn);
  }

  function clearListeners() {
    listeners = [];
    calendarListeners = [];
  }

  return { start, stop, forceEvent, onEvent, onCalendarUpdate, getSchedule, clearListeners };
})();
