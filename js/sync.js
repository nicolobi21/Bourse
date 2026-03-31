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
  // === REMPLACER AVEC VOTRE CONFIGURATION FIREBASE ===
  const FIREBASE_CONFIG = {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
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
      joinRoom(roomCode, name);
    }

    // Stocker en local aussi
    localStorage.setItem('bourse_room', roomCode);
    localStorage.setItem('bourse_player', name);
    localStorage.setItem('bourse_playerId', playerId);
    localStorage.setItem('bourse_isHost', 'true');

    return roomCode;
  }

  function joinRoom(code, name) {
    roomCode = code;
    playerName = name;
    if (!playerId) playerId = generatePlayerId(name);

    localStorage.setItem('bourse_room', code);
    localStorage.setItem('bourse_player', name);
    localStorage.setItem('bourse_playerId', playerId);

    if (firebaseAvailable) {
      roomRef = db.ref('rooms/' + code);
      // Vérifier que la salle existe
      roomRef.once('value', snap => {
        if (!snap.exists()) {
          // Créer la salle si elle n'existe pas (mode tolérant)
          roomRef.set({
            host: name,
            createdAt: Date.now(),
            marketOpen: true,
            players: {},
          });
        }
      });
      updateScore();
      listenToLeaderboard();
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

    // Local storage backup
    localStorage.setItem('bourse_score_' + roomCode + '_' + playerName, JSON.stringify(data));
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
