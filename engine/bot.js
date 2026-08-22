// ============================================================
// BURRACO LEGENDS — avversario artificiale, capacità MEDIA.
//
// Livello voluto: un giocatore discreto, non un campione. Sa fare le cose
// giuste di base — riconosce tris e scale, cala, non spreca le matte, non
// si suicida scartando l'ultima carta — ma non calcola le mosse future,
// non conta le carte uscite e non gioca "contro" il seme che gli conviene
// colpire. Serve ad avere un avversario credibile con cui provare il
// gioco, non a essere imbattibile.
//
// Usa SOLO le azioni pubbliche del motore (actionDraw, actionLayMeld,
// actionDiscard): non tocca lo stato di nascosto, quindi non può barare —
// se una mossa è illecita il motore la rifiuta come farebbe con un umano.
// ============================================================

import { validateMeld, cardPointValue, SUITS } from './core-rules.js';
import { actionDraw, actionTakeDiscardPile, actionLayMeld, actionAttachToMeld, actionDiscard, usaAbilitaSpeciale } from './partita.js';

const matta = (c) => c.isJolly || c.isPinella;

// --- ricerca delle combinazioni calabili ------------------------------

// Tris: 3+ carte dello stesso valore (semi diversi). Le matte si usano
// solo se servono davvero (vedi conviene usare la matta, più sotto).
function cercaTris(mano, usaMatte) {
  const perValore = {};
  for (const c of mano) { if (!matta(c)) (perValore[c.value] = perValore[c.value] || []).push(c); }
  const trovate = [];
  for (const v of Object.keys(perValore)) {
    const g = perValore[v];
    if (g.length >= 3) { trovate.push(g.slice(0, Math.min(g.length, 8))); continue; }
    if (g.length === 2 && usaMatte) {
      const m = mano.find((c) => matta(c));
      if (m) { const prova = [...g, m]; if (validateMeld(prova).ok) trovate.push(prova); }
    }
  }
  return trovate;
}

// Scale: 3+ carte consecutive dello stesso seme. Cerca la corsa più lunga
// disponibile per ciascun seme, e prova a tapparne un buco con una matta.
function cercaScale(mano, usaMatte) {
  const trovate = [];
  for (const s of SUITS) {
    const delSeme = mano.filter((c) => !matta(c) && c.suit === s).sort((a, b) => a.value - b.value);
    if (delSeme.length < 2) continue;

    // corse consecutive naturali
    let corsa = [delSeme[0]];
    for (let i = 1; i < delSeme.length; i++) {
      const prec = corsa[corsa.length - 1];
      if (delSeme[i].value === prec.value + 1) corsa.push(delSeme[i]);
      else if (delSeme[i].value === prec.value) continue;   // doppione: lo salto
      else { if (corsa.length >= 3 && validateMeld(corsa).ok) trovate.push(corsa.slice()); corsa = [delSeme[i]]; }
    }
    if (corsa.length >= 3 && validateMeld(corsa).ok) trovate.push(corsa.slice());

    // con una matta: provo a unire due corse separate da un solo buco
    if (usaMatte) {
      const m = mano.find((c) => matta(c));
      if (m) {
        for (let i = 0; i < delSeme.length - 1; i++) {
          for (let j = i + 1; j < delSeme.length; j++) {
            const pezzo = delSeme.slice(i, j + 1);
            if (pezzo.length < 2) continue;
            const prova = [...pezzo, m];
            if (prova.length >= 3 && validateMeld(prova).ok && !trovate.some((t) => t.length >= prova.length)) {
              trovate.push(prova);
            }
          }
        }
      }
    }
  }
  return trovate;
}

// Un giocatore medio non brucia una matta per un tris da tre carte: la
// tiene per allungare un gioco. La spende quando ne ha due, o quando la
// mano si sta svuotando e tenerla in mano costerebbe punti.
function convieneUsareMatta(mano, tallone) {
  if (mano.filter(matta).length >= 2) return true;
  if (tallone.length < 15) return true;
  if (mano.length <= 5) return true;
  return false;
}

// --- scelta dello scarto ---------------------------------------------

// Scarta la carta che serve di meno: mai una matta, e fra le altre quella
// che non è agganciata a niente. A parità, la più cara — così non resta
// in mano a fine partita. È il ragionamento di un giocatore discreto:
// niente calcoli su cosa serve all'avversario.
function scegliScarto(mano) {
  const candidate = mano.filter((c) => !matta(c));
  if (candidate.length === 0) return mano[0];

  const punteggio = (c) => {
    let utile = 0;
    for (const altra of mano) {
      if (altra === c) continue;
      if (!matta(altra) && altra.value === c.value) utile += 3;                       // coppia verso un tris
      if (!matta(altra) && altra.suit === c.suit && Math.abs(altra.value - c.value) === 1) utile += 3; // vicina di scala
      if (!matta(altra) && altra.suit === c.suit && Math.abs(altra.value - c.value) === 2) utile += 1; // buco colmabile
    }
    return utile * 10 - cardPointValue(c);   // meno è utile e più è cara → si scarta prima
  };
  return candidate.reduce((peggiore, c) => (punteggio(c) < punteggio(peggiore) ? c : peggiore), candidate[0]);
}

// --- turno completo ---------------------------------------------------

/**
 * Gioca un turno intero del bot: pesca, cala quello che trova, scarta.
 * Ritorna l'elenco delle mosse fatte, così il tavolo può mostrarle una
 * alla volta invece che tutte insieme.
 */
export function botGiocaTurno(state, playerIndex, nowMs = Date.now()) {
  const mosse = [];
  if (state.status !== 'in_progress' || state.currentPlayerIndex !== playerIndex) return mosse;
  const io = () => state.players[playerIndex];

  // 1. PESCA — prende il monte scarti solo se è piccolo e la carta in cima
  //    gli serve subito; altrimenti pesca dal mazzo. Un giocatore medio non
  //    si carica venti carte in mano sperando di piazzarle.
  let presoMonte = false;
  const cima = state.scarti[state.scarti.length - 1];
  if (cima && state.scarti.length <= 4 && !matta(cima)) {
    const conCima = [...io().hand, cima];
    const utile = cercaTris(conCima, false).some((t) => t.includes(cima)) ||
                  cercaScale(conCima, false).some((t) => t.includes(cima));
    if (utile) {
      const r = actionTakeDiscardPile(state, playerIndex, nowMs);
      if (r.ok) { presoMonte = true; mosse.push({ tipo: 'monte', carte: state.scarti.length }); }
    }
  }
  if (!presoMonte) {
    const r = actionDraw(state, playerIndex, nowMs);
    if (r.ok) mosse.push({ tipo: 'pesca', quante: r.drawn });
    if (state.status !== 'in_progress') return mosse;   // mazzo finito: partita chiusa
  }

  // 1b. ABILITÀ SPECIALI — usa quelle cariche, puntando al personaggio
  //     avversario più debole ancora in piedi: è la scelta ovvia, quella
  //     che farebbe chiunque, senza calcoli più fini.
  for (const s of SUITS) {
    const eroe = io().characters[s];
    if (!eroe || eroe.pv <= 0 || (eroe.carica || 0) < 100 - 1e-9) continue;
    const avv = state.players[playerIndex === 0 ? 1 : 0].characters;
    const vivi = SUITS.filter((x) => avv[x].pv > 0);
    if (!vivi.length) break;
    const piuDebole = vivi.reduce((min, x) => (avv[x].pv < avv[min].pv ? x : min), vivi[0]);
    const r = usaAbilitaSpeciale(state, playerIndex, s, piuDebole, nowMs);
    if (r.ok) {
      mosse.push({ tipo: 'abilita', danno: r.damage || 0, colpi: r.colpi || [], semeAttaccante: s, semeBersaglio: piuDebole });
      if (r.matchEnded) return mosse;
    }
  }

  // 2a. AGGANCIA — prima di aprire giochi nuovi, allunga quelli che ha già:
  //     costa una carta sola e fa comunque danno. Un giocatore medio lo fa
  //     sempre, è la mossa più economica che ci sia.
  let agganciato = true;
  while (agganciato && state.status === 'in_progress') {
    agganciato = false;
    for (const gioco of io().melds) {
      for (const c of io().hand.slice()) {
        // tenersi sempre almeno due carte: una da tenere, una da scartare
        if (io().hand.length <= 2) break;
        if (matta(c) && !convieneUsareMatta(io().hand, state.tallone)) continue;
        const r = actionAttachToMeld(state, playerIndex, gioco.id, [c.id], nowMs);
        if (r.ok) {
          mosse.push({ tipo: 'aggancia', carte: 1, danno: r.damage || 0, colpi: r.colpi || [], pozzetto: !!r.pozzettoPreso });
          agganciato = true;
          if (r.matchEnded) return mosse;
        }
      }
    }
  }

  // 2b. CALA — finché trova combinazioni valide, tenendosi sempre almeno una
  //    carta da scartare (restare a zero senza poter chiudere blocca il turno).
  let ancora = true;
  while (ancora && state.status === 'in_progress') {
    ancora = false;
    const mano = io().hand;
    const usaMatte = convieneUsareMatta(mano, state.tallone);
    const opzioni = [...cercaScale(mano, usaMatte), ...cercaTris(mano, usaMatte)]
      .filter((g) => g.length >= 3)
      .sort((a, b) => b.length - a.length);   // prima le combinazioni più lunghe: fanno più danno

    for (const gruppo of opzioni) {
      const restanti = mano.length - gruppo.length;
      // Dopo questa calata potrei chiudere? Serve il pozzetto già preso e un
      // gioco da 5+ carte, contando anche quello che sto per calare.
      const puoChiudere = io().pozzettoTaken &&
        (gruppo.length >= 5 || io().melds.some((m) => m.cards.length >= 5));

      // Trappola in cui il bot cadeva: restare con UNA carta sola. Quella
      // carta non si può scartare (svuoterebbe la mano) se non si è in
      // condizione di chiudere, quindi il turno non finiva più e il tavolo
      // si bloccava. Servono almeno due carte: una da tenere, una da scartare.
      if (restanti === 1 && !puoChiudere) continue;
      // Svuotare del tutto la mano va bene solo se il pozzetto deve ancora
      // arrivare (lo si prende subito) oppure se così si chiude davvero.
      if (restanti === 0 && io().pozzettoTaken && !puoChiudere) continue;

      const r = actionLayMeld(state, playerIndex, gruppo.map((c) => c.id), nowMs);
      if (r.ok) {
        mosse.push({ tipo: 'cala', carte: gruppo.length, danno: r.damage || 0, colpi: r.colpi || [], pozzetto: !!r.pozzettoPreso });
        ancora = true;
        if (r.matchEnded) return mosse;
        break;
      }
    }
  }

  // 3. SCARTA — chiude il turno
  if (state.status === 'in_progress' && io().hand.length > 0) {
    const carta = scegliScarto(io().hand);
    const r = actionDiscard(state, playerIndex, carta.id, nowMs);
    if (r.ok) mosse.push({ tipo: 'scarta', carta, chiusura: !!r.matchEnded });
    else {
      // ripiego: se lo scarto scelto è illecito provo le altre carte
      for (const c of io().hand) {
        const r2 = actionDiscard(state, playerIndex, c.id, nowMs);
        if (r2.ok) { mosse.push({ tipo: 'scarta', carta: c, chiusura: !!r2.matchEnded }); break; }
      }
    }
  }
  return mosse;
}
