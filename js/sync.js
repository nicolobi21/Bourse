/**
 * sync.js — Synchronisation multi-joueurs via Firebase Realtime Database
 *
 * Configuration Firebase requise :
 * 1. Créer un projet sur https://console.firebase.google.com
 * 2. Activer Realtime Database (mode test pour commencer)
 * 3. Remplacer FIREBASE_CONFIG ci-dessous avec vos identifiants
 *
 * Fonctionne aussi en mode hors-ligne (pas de Firebase nécessaire)
 */

const Sync = (() => {
  // === CONFIGURATION FIREBASE ===
  // Note: sur un site statique (GitHub Pages), la clé API est visible côté client.
  // Sécurisez votre base via les Firebase Security Rules dans la console Firebase :
  //   { "rules": { "rooms": { ".read": true, ".write": true },
  //                ".read": false, ".write": false } }
  // Cela limite l'accès à /rooms/ uniquement.
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCfX5QAr1-YluCcpKw1Ja0i9XluRHiVzJ4",
    authDomain: "bourse-2ba52.firebaseapp.com",
    databaseURL: "https://bourse-2ba52-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "bourse-2ba52",
    storageBucket: "bourse-2ba52.firebasestorage.app",
    messagingSenderId: "376332520419",
    appId: "1:376332520419:web:210d9524fbb503eef52ed6",
  };

  let db = null;
  let roomRef = null;
  let playerName = '';
  let playerId = '';  // Unique ID for Firebase key
  let roomCode = '';
  let isHost = false;
  let firebaseAvailable = false;
  let leaderboardListeners = [];
  let playersData = {};

  function init() {
    // Vérifier si Firebase est chargé et configuré
    if (typeof firebase !== 'undefined' && FIREBASE_CONFIG.apiKey) {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }
        db = firebase.database();
        firebaseAvailable = true;
      } catch (e) {
        console.warn('Firebase non disponible, mode hors-ligne activé');
        firebaseAvailable = false;
      }
    } else {
      firebaseAvailable = false;
    }

    // Restaurer la session si elle existe (ne pas écraser une session active)
    if (!playerName) {
      restoreSession();
    }

    // Reconnecter à Firebase si une session est restaurée
    if (firebaseAvailable && roomCode && !roomRef) {
      roomRef = db.ref('rooms/' + roomCode);
      listenToLeaderboard();
    }
  }

  function generatePlayerId(name) {
    // Unique player key: sanitized name + random suffix
    return sanitizeName(name) + '_' + Math.random().toString(36).substring(2, 6);
  }

  function createRoom(name) {
    roomCode = generateRoomCode();
    playerName = name;
    playerId = generatePlayerId(name);
    isHost = true;

    if (firebaseAvailable) {
      roomRef = db.ref('rooms/' + roomCode);
      roomRef.set({
        host: name,
        createdAt: Date.now(),
        marketOpen: true,
        players: {},
      });
      // Ne pas appeler updateScore() ici : le budget n'est pas encore défini.
      // Le score sera envoyé au premier cycle UI dans game.html.
      listenToLeaderboard();
    }

    // Stocker en local aussi
    localStorage.setItem('bourse_room', roomCode);
    localStorage.setItem('bourse_player', name);
    localStorage.setItem('bourse_playerId', playerId);
    localStorage.setItem('bourse_isHost', 'true');

    return roomCode;
  }

  // Sauver les settings de la salle dans Firebase (durée + budget)
  function saveRoomSettings(duration, budget) {
    if (firebaseAvailable && roomRef) {
      roomRef.update({ duration, budget });
    }
  }

  // Charger les settings de la salle depuis Firebase
  function loadRoomSettings(callback) {
    if (firebaseAvailable && roomRef) {
      roomRef.once('value', snap => {
        const val = snap.val();
        if (val) {
          // Seulement utiliser les valeurs Firebase si elles sont EXPLICITEMENT définies
          // Ne pas écraser localStorage avec des valeurs par défaut
          const duration = (val.duration && val.duration > 0) ? val.duration : null;
          const budget   = (val.budget   && val.budget   > 0) ? val.budget   : null;

          if (duration) localStorage.setItem('bourse_duration_' + roomCode, duration.toString());
          if (budget)   localStorage.setItem('bourse_budget_'   + roomCode, budget.toString());

          // Fallback sur localStorage si Firebase n'a pas de valeur explicite
          const finalDuration = duration || parseInt(localStorage.getItem('bourse_duration_' + roomCode)) || 3600000;
          const finalBudget   = budget   || parseInt(localStorage.getItem('bourse_budget_'   + roomCode)) || 10000;

          if (callback) callback({ duration: finalDuration, budget: finalBudget });
        }
      });
    }
  }

  function joinRoom(code, name, callback) {
    roomCode = code;
    playerName = name;
    if (!playerId) playerId = generatePlayerId(name);

    localStorage.setItem('bourse_room', code);
    localStorage.setItem('bourse_player', name);
    localStorage.setItem('bourse_playerId', playerId);

    if (firebaseAvailable) {
      roomRef = db.ref('rooms/' + code);
      // Vérifier que la salle existe avant de rejoindre
      roomRef.once('value', snap => {
        if (!snap.exists()) {
          // Salle introuvable
          roomRef = null;
          if (callback) callback(false);
          return;
        }
        updateScore();
        listenToLeaderboard();
        if (callback) callback(true);
      });
    } else {
      // Mode hors-ligne : toujours OK
      if (callback) callback(true);
    }
  }

  function updateScore() {
    if (!playerName) return;

    const data = {
      name: playerName,
      totalValue: Portfolio.getTotalValue(),
      performancePct: Portfolio.getPerformancePct(),
      cash: Portfolio.getCash(),
      positionsCount: Object.keys(Portfolio.getPositions()).length,
      lastUpdate: Date.now(),
    };

    playersData[playerName] = data;

    if (firebaseAvailable && roomRef && playerId) {
      roomRef.child('players/' + playerId).set(data);
    }

    // Local storage backup (utilise playerId pour éviter les collisions de prénoms)
    localStorage.setItem('bourse_score_' + roomCode + '_' + playerId, JSON.stringify(data));
  }

  function listenOnly(code) {
    if (!firebaseAvailable) return;
    roomRef = db.ref('rooms/' + code);
    listenToLeaderboard();
  }

  function listenToLeaderboard() {
    if (!firebaseAvailable || !roomRef) return;

    roomRef.child('players').on('value', snap => {
      const val = snap.val();
      if (val) {
        playersData = val;
        notifyLeaderboard();
      }
    });
  }

  function getLeaderboard() {
    const players = Object.values(playersData);
    players.sort((a, b) => b.totalValue - a.totalValue);
    return players;
  }

  function onLeaderboardUpdate(fn) {
    leaderboardListeners.push(fn);
  }

  function notifyLeaderboard() {
    leaderboardListeners.forEach(fn => fn(getLeaderboard()));
  }

  function setMarketStatus(open) {
    if (firebaseAvailable && roomRef && isHost) {
      roomRef.child('marketOpen').set(open);
    }
  }

  function getRoomCode() { return roomCode; }
  function getPlayerName() { return playerName; }
  function isFirebaseAvailable() { return firebaseAvailable; }
  function getIsHost() { return isHost; }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function sanitizeName(name) {
    // Firebase ne supporte pas certains caractères dans les clés
    return name.replace(/[.#$[\]]/g, '_');
  }

  function restoreSession() {
    const room = localStorage.getItem('bourse_room');
    const player = localStorage.getItem('bourse_player');
    const id = localStorage.getItem('bourse_playerId');
    const host = localStorage.getItem('bourse_isHost') === 'true';
    if (room && player) {
      roomCode = room;
      playerName = player;
      playerId = id || generatePlayerId(player);
      isHost = host;
      return true;
    }
    return false;
  }

  function clearSession() {
    localStorage.removeItem('bourse_room');
    localStorage.removeItem('bourse_player');
    localStorage.removeItem('bourse_isHost');
    roomCode = '';
    playerName = '';
    isHost = false;
  }

  return {
    init,
    createRoom,
    joinRoom,
    listenOnly,
    saveRoomSettings,
    loadRoomSettings,
    updateScore,
    getLeaderboard,
    onLeaderboardUpdate,
    setMarketStatus,
    getRoomCode,
    getPlayerName,
    isFirebaseAvailable,
    getIsHost,
    restoreSession,
    clearSession,
  };
})();
