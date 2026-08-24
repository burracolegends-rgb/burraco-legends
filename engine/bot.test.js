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

// ============================================================
// LE TRE DECISIONI DI BURRACO che il bot sbagliava, e che ora arrivano
// dal cervello collaudato di Burraco Pulito. Ognuna qui sotto ha un
// controllo suo: erano difetti segnalati giocando, non ipotesi.
// ============================================================

// --- RACCOGLIE IL MONTE quando dentro c'è roba che gli serve ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5 });
  state.players[0].hand = [
    makeCard('♥', 7), makeCard('♠', 7),      // coppia di 7: il 7 nel monte fa tris
    makeCard('♦', 4), makeCard('♦', 5),      // 4-5 di quadri: il 6 fa scala
    makeCard('♣', 2), makeCard('♠', 11), makeCard('♥', 3)
  ];
  state.scarti = [makeCard('♦', 6), makeCard('♣', 7), makeCard('♥', 9)];
  const mosse = botGiocaTurno(state, 0, T0 + 1000);
  check('con un monte pieno di carte utili lo raccoglie', mosse[0].tipo === 'monte');
}

// --- NON raccoglie un monte che è quasi tutta spazzatura ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5 });
  state.players[0].hand = [
    makeCard('♥', 7), makeCard('♦', 4), makeCard('♣', 9),
    makeCard('♠', 11), makeCard('♥', 13), makeCard('♦', 2), makeCard('♣', 5)
  ];
  // nessuna di queste si lega a niente di quello che ha in mano
  state.scarti = [makeCard('♠', 3), makeCard('♥', 10), makeCard('♦', 12),
                  makeCard('♣', 8), makeCard('♠', 6), makeCard('♥', 4)];
  const mosse = botGiocaTurno(state, 0, T0 + 1000);
  check('un monte di sole carte inutili lo lascia lì', mosse[0].tipo === 'pesca');
}

// --- L'ASSO STA A DUE POSTI: vede anche Q-K-A ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5 });
  state.players[0].hand = [
    makeCard('♠', 12), makeCard('♠', 13), makeCard('♠', 1),   // Q-K-A di picche
    makeCard('♥', 4), makeCard('♦', 9), makeCard('♣', 6), makeCard('♥', 11)
  ];
  botGiocaTurno(state, 0, T0 + 1000);
  const calataQKA = state.players[0].melds.some((m) =>
    m.cards.length >= 3 && m.cards.every((c) => c.suit === '♠') &&
    m.cards.some((c) => c.value === 1) && m.cards.some((c) => c.value === 13));
  check('cala la scala Q-K-A invece di tenersela in mano', calataQKA);
}

// --- AGGANCIO MULTIPLO: due carte insieme quando una sola non basterebbe ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5 });
  // gli metto in tavola una scala già calata
  state.players[0].melds = [{
    id: 'm_prova', type: 'sequence', suit: '♥', value: null, wildcardId: null,
    order: { min: 4, max: 6, aceHigh: false },
    cards: [makeCard('♥', 4), makeCard('♥', 5), makeCard('♥', 6)]
  }];
  state.players[0].hand = [
    makeCard('♥', 7), makeCard('♥', 8),      // insieme allungano la scala
    makeCard('♠', 2), makeCard('♦', 11), makeCard('♣', 9), makeCard('♠', 13)
  ];
  const mosse = botGiocaTurno(state, 0, T0 + 1000);
  const multiplo = mosse.find((m) => m.tipo === 'aggancia' && m.carte >= 2);
  check('aggancia più carte in una volta sola', !!multiplo);
}

// --- ANTISTALLO: se il tallone non cala, prima o poi pesca e basta ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5 });
  // una situazione in cui raccoglierebbe sempre: coppia in mano, monte utile
  const preparaMonteInvitante = () => {
    state.players[0].hand = [
      makeCard('♥', 7), makeCard('♠', 7), makeCard('♦', 4), makeCard('♦', 5),
      makeCard('♣', 2), makeCard('♠', 11), makeCard('♥', 3)
    ];
    state.scarti = [makeCard('♦', 6), makeCard('♣', 7), makeCard('♥', 9)];
  };

  let raccolte = 0, pescate = 0;
  const talloneFermo = state.tallone.length;
  for (let giro = 0; giro < 8; giro++) {
    preparaMonteInvitante();
    state.tallone.length = talloneFermo;          // il tallone non cala mai
    state.currentPlayerIndex = 0;
    state.players[0].hasDrawnThisTurn = false;
    const mosse = botGiocaTurno(state, 0, T0 + giro * 1000);
    if (mosse[0] && mosse[0].tipo === 'monte') raccolte++;
    if (mosse[0] && mosse[0].tipo === 'pesca') pescate++;
  }
  check('col tallone fermo da troppo tempo smette di raccogliere e pesca',
    pescate > 0, 'raccolte ' + raccolte + ', pescate ' + pescate);
}

// ============================================================
// LA PARTE LEGENDS: abilità degli eroi e Carte Magiche.
// Il bot NON le usava mai — cercava una barra di "carica" che il gioco
// non ha più da quando ci sono i punti magia, quindi la condizione era
// sempre falsa e i suoi 15 punti restavano lì. Si vedeva giocando: un
// avversario che non attacca mai.
// ============================================================

// --- usa l'abilità dell'eroe più forte sul nemico più debole ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5 });
  const mio = state.players[0], suo = state.players[1];
  mio.puntiMagia = 15;                       // punti a sufficienza
  // il mio eroe di picche è il più forte; quello di cuori il più debole
  mio.characters['♠'].att = 200; mio.characters['♠'].pv = 150;
  mio.characters['♥'].att = 50;  mio.characters['♥'].pv = 150;
  mio.characters['♦'].att = 60;  mio.characters['♦'].pv = 150;
  mio.characters['♣'].att = 70;  mio.characters['♣'].pv = 150;
  // fra i suoi, quello di quadri è il più vicino a cadere
  suo.characters['♥'].pv = 100; suo.characters['♦'].pv = 12;
  suo.characters['♣'].pv = 100; suo.characters['♠'].pv = 100;

  const mosse = botGiocaTurno(state, 0, T0 + 1000);
  const prima = mosse.find((m) => m.tipo === 'abilita');
  check('usa davvero le abilità (prima non lo faceva mai)', !!prima);
  check('attacca con l\'eroe più forte che ha', prima && prima.semeAttaccante === '♠');
  check('e punta al nemico più vicino a cadere', prima && prima.semeBersaglio === '♦');
}

// --- gioca le Carte Magiche, alternandole alle abilità ---
{
  const sorpresa = { id: 'sorpresa_prova', tipo: 'sorpresa', rarita: 3, trigger: 'on_activate',
                     effetti: [{ effect: 'danno_diretto', parametro: '20', target: 'avversario' }], durata_turni: 0 };
  const trappola = { id: 'trappola_prova', tipo: 'trappola', rarita: 3, trigger: 'avversario_pesca',
                     effetti: [{ effect: 'scarto_forzato', parametro: '1', target: 'avversario' }], durata_turni: 0 };
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5,
                              magiche: [[sorpresa, trappola], []] });
  state.players[0].puntiMagia = 15;
  const mosse = botGiocaTurno(state, 0, T0 + 1000);
  check('gioca una Carta Magica quando ne ha', mosse.some((m) => m.tipo === 'magia'));
  check('ma una sola per turno, come vuole la regola',
    mosse.filter((m) => m.tipo === 'magia').length === 1);
}

// --- con più turni le usa tutte, non sempre la stessa ---
{
  const magie = [
    { id: 'sorpresa_A', tipo: 'sorpresa', rarita: 3, trigger: 'on_activate',
      effetti: [{ effect: 'danno_diretto', parametro: '10', target: 'avversario' }], durata_turni: 0 },
    { id: 'sorpresa_B', tipo: 'sorpresa', rarita: 3, trigger: 'on_activate',
      effetti: [{ effect: 'danno_diretto', parametro: '10', target: 'avversario' }], durata_turni: 0 },
    { id: 'sorpresa_C', tipo: 'sorpresa', rarita: 3, trigger: 'on_activate',
      effetti: [{ effect: 'cura_diretta', parametro: '10', target: 'se_stesso' }], durata_turni: 0 }
  ];
  const state = createMatch({ chiInizia: 0, now: T0, magiche: [magie, []] });
  const usate = new Set();
  let turni = 0;
  while (state.status === 'in_progress' && turni < 60) {
    const chi = state.currentPlayerIndex;
    for (const m of botGiocaTurno(state, chi, T0 + turni * 1000)) {
      if (chi === 0 && m.tipo === 'magia') usate.add(m.carta.id);
    }
    turni++;
  }
  check('nel giro di una partita le gioca tutte e tre', usate.size === 3,
    'giocate: ' + [...usate].join(', '));
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
