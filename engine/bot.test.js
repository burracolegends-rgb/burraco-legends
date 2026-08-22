// Verifica del bot: deve giocare turni leciti, calare davvero, non
// bloccare mai il tavolo e portare a termine partite intere.
// Uso: node engine/bot.test.js

import { createMatch } from './partita.js';
import { botGiocaTurno } from './bot.js';
import { makeCard } from './core-rules.js';

let failures = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) failures++; };
const T0 = Date.parse('2026-08-04T10:00:00.000Z');

// --- un turno singolo: pesca e scarta, e il turno passa ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5 });
  const mosse = botGiocaTurno(state, 0, T0 + 1000);
  check('il bot gioca almeno pesca + scarto', mosse.length >= 2);
  check('la prima mossa è una pescata (mazzo o monte)', ['pesca', 'monte'].includes(mosse[0].tipo));
  check('l\'ultima mossa è lo scarto', mosse[mosse.length - 1].tipo === 'scarta');
  check('il turno è passato all\'altro giocatore', state.currentPlayerIndex === 1);
  check('la mano resta di dimensione lecita', state.players[0].hand.length >= 1);
}

// --- non gioca fuori dal proprio turno ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5 });
  const mosse = botGiocaTurno(state, 1, T0 + 1000);   // tocca al giocatore 0
  check('il bot non muove se non è il suo turno', mosse.length === 0);
}

// --- cala quando ha una combinazione in mano ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5 });
  // gli metto in mano una scala sicura
  state.players[0].hand = [
    makeCard('♥', 4), makeCard('♥', 5), makeCard('♥', 6),
    makeCard('♠', 9), makeCard('♣', 3), makeCard('♦', 12), makeCard('♠', 13)
  ];
  const mosse = botGiocaTurno(state, 0, T0 + 1000);
  check('il bot riconosce e cala la scala', mosse.some((m) => m.tipo === 'cala'));
  check('la calata è finita sul tavolo', state.players[0].melds.length >= 1);
  check('la calata ha inflitto danno', mosse.some((m) => m.tipo === 'cala' && m.danno > 0));
}

// --- non spreca la matta in un tris da tre a inizio partita ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5 });
  state.players[0].hand = [
    makeCard('♥', 9), makeCard('♠', 9), makeCard(null, 0, true),   // coppia + jolly
    makeCard('♣', 3), makeCard('♦', 5), makeCard('♠', 7), makeCard('♥', 13),
    makeCard('♣', 11), makeCard('♦', 4), makeCard('♠', 6), makeCard('♥', 8)
  ];
  // il tallone va fissato: le due carte pescate cambiano la mano, e con
  // una seconda matta il bot avrebbe ragione a spendere il jolly
  state.tallone = [makeCard('♣', 13), makeCard('♦', 10), ...state.tallone.filter((c) => !c.isJolly && !c.isPinella)];
  botGiocaTurno(state, 0, T0 + 1000);
  const jollyCalato = state.players[0].melds.some((m) => m.cards.some((c) => c.isJolly));
  check('con il mazzo ancora pieno non brucia il jolly per un tris da tre', !jollyCalato);
}

// --- PROVA DI RESISTENZA: bot contro bot, partite intere ---
{
  let bloccate = 0, errori = 0, finite = 0, turniTot = 0;
  const esiti = {};
  for (let p = 0; p < 60; p++) {
    const state = createMatch({ chiInizia: 0, now: T0 });
    let turni = 0;
    try {
      while (state.status === 'in_progress' && turni < 400) {
        const prima = state.currentPlayerIndex;
        const manoP = state.players[prima].hand.length;
        botGiocaTurno(state, prima, T0 + turni * 1000);
        // se il turno non è passato e nulla è cambiato, il tavolo è bloccato
        if (state.status === 'in_progress' && state.currentPlayerIndex === prima && state.players[prima].hand.length === manoP) {
          bloccate++; break;
        }
        turni++;
      }
    } catch (e) { errori++; console.log('   eccezione:', e.message); continue; }
    if (state.status === 'finished') { finite++; esiti[state.winReason] = (esiti[state.winReason] || 0) + 1; }
    else if (turni >= 400) bloccate++;
    turniTot += turni;
  }
  check('60 partite bot contro bot: nessuna eccezione', errori === 0);
  check('60 partite bot contro bot: nessun tavolo bloccato', bloccate === 0);
  check('tutte le partite arrivano a una conclusione', finite === 60);
  console.log('     turni medi per partita:', Math.round(turniTot / 60), '· esiti:', JSON.stringify(esiti));
}

// --- MISURA DI BILANCIAMENTO: quanto danno si fa davvero in una partita ---
// Non è un controllo che può fallire: serve a vedere se i numeri di VITA
// reggono il ritmo del danno, o se le partite finiscono sempre a mazzo
// esaurito senza che nessuno vada mai KO.
{
  let dannoTot = 0, calateTot = 0, agganciTot = 0, pvResiduiTot = 0, partite = 30;
  const lunghezze = {};
  for (let p = 0; p < partite; p++) {
    const state = createMatch({ chiInizia: 0, now: T0 });
    let turni = 0;
    while (state.status === 'in_progress' && turni < 400) {
      const chi = state.currentPlayerIndex;
      const mosse = botGiocaTurno(state, chi, T0 + turni * 1000);
      for (const m of mosse) {
        if (m.tipo === 'cala')      { dannoTot += m.danno; calateTot++; lunghezze[m.carte] = (lunghezze[m.carte] || 0) + 1; }
        if (m.tipo === 'aggancia')  { dannoTot += m.danno; agganciTot++; }
      }
      turni++;
    }
    for (const g of state.players) for (const s of ['♥', '♦', '♣', '♠']) pvResiduiTot += g.characters[s].pv;
  }
  console.log('\n--- BILANCIAMENTO (misurato su ' + partite + ' partite bot contro bot) ---');
  console.log('  calate per partita:      ', (calateTot / partite).toFixed(1));
  console.log('  agganci per partita:     ', (agganciTot / partite).toFixed(1));
  console.log('  lunghezza delle calate:  ', JSON.stringify(lunghezze));
  console.log('  danno totale per partita:', (dannoTot / partite).toFixed(0), '(diviso fra i due giocatori)');
  console.log('  PV rimasti a fine partita:', (pvResiduiTot / partite).toFixed(0), 'su 800 totali (2 giocatori × 4 × 100)');
  console.log('  → per andare KO servono 400 PV di danno su un solo giocatore\n');
}

console.log('\n' + (failures === 0 ? 'Tutti i controlli passati.' : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
