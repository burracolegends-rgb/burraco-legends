// Verifica del motore di partita: KO via AoE, ridistribuzione, chiusura
// (normale e al volo), timeout di turno, orologio di partita esaurito,
// mazzo esaurito. Uso: node engine/partita.test.js

import { makeCard } from './core-rules.js';
import {
  createMatch, actionDraw, actionLayMeld, actionAttachToMeld, actionDiscard, usaAbilitaSpeciale, giocaCartaMagica,
  checkTurnTimeout, chargeElapsedTime, TURN_SECONDS, MATCH_SECONDS
} from './partita.js';
import { checkAbilityTrigger } from './character-abilities.js';

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('OK   ' + label); }
  else { console.log('FAIL ' + label); failures++; }
}

const T0 = Date.parse('2026-08-04T10:00:00.000Z');
function heartsSeq(values) { return values.map((v) => makeCard('♥', v)); }

// --- 1. AoE (7+) porta a KO se i PV avversari sono già bassi ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5, 6, 7, 8, 9]); // 7 carte, punti = 5*5+10+10 = 45
  attacker.hand = [...meld, ...attacker.hand.slice(0, 4)]; // resto ininfluente
  for (const s of ['♥', '♦', '♣', '♠']) state.players[1].characters[s].pv = 50; // bassi apposta

  const res = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('calata da 7 carte tier corretto (7)', res.tier === 7);
  check('calata da 7 carte è AoE', res.target === 'aoe');
  check('danno delle carte atteso 45 * (100/100) * 1.6 = 72', Math.abs(res.dannoCarte - 72) < 1e-9);
  check('tutti e 4 i personaggi avversari a 0 PV', ['♥', '♦', '♣', '♠'].every((s) => state.players[1].characters[s].pv === 0));
  check('KO rilevato, vince il giocatore 0', state.status === 'finished' && state.winner === 0 && state.winReason === 'ko');
}

// --- 2. Bersaglio singolo già a 0 PV: il danno si ridistribuisce ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5, 6, 7]); // 5 carte, punti = 25, tier 5, singolo
  attacker.hand = [...meld, ...attacker.hand.slice(0, 6)];
  state.players[1].characters['♥'].pv = 0; // bersaglio naturale già morto

  const res = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('calata da 5 carte tier corretto (5), bersaglio singolo', res.tier === 5 && res.target === 'singolo');
  check('danno delle carte atteso 25 * (100/100) * 1 = 25', Math.abs(res.dannoCarte - 25) < 1e-9);
  const others = ['♦', '♣', '♠'].map((s) => state.players[1].characters[s].pv);
  // ognuno incassa la propria fetta dei 25 ridistribuiti PIÙ l'ondata da 10
  check('danno ridistribuito sui 3 superstiti, più l\'ondata', others.every((pv) => Math.abs(pv - (100 - 25 / 3 - 10)) < 1e-6));
  check('nessun KO ancora (i superstiti hanno ancora PV)', state.status === 'in_progress');
}

// --- 2bis. Tris (gruppo): ogni carta colpisce il personaggio del proprio seme ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  // Esempio dalla spec: tris di 3 (cuori, picche, fiori), carte da 5 punti (valore 7, range 3-7)
  const tris = [makeCard('♥', 7), makeCard('♠', 7), makeCard('♣', 7)];
  attacker.hand = [...tris, ...attacker.hand.slice(0, 8)];

  const res = actionLayMeld(state, 0, tris.map((c) => c.id), T0 + 1000);
  check('tris riconosciuto come gruppo', res.meld.type === 'group');
  check('5 punti tolti al personaggio di Cuori', state.players[1].characters['♥'].pv === 95);
  check('5 punti tolti al personaggio di Picche', state.players[1].characters['♠'].pv === 95);
  check('5 punti tolti al personaggio di Fiori', state.players[1].characters['♣'].pv === 95);
  check('nessun danno al personaggio di Quadri (non coinvolto nel tris)', state.players[1].characters['♦'].pv === 100);
  check('danno totale riportato correttamente (5+5+5=15)', Math.abs(res.damage - 15) < 1e-9);
}

// --- 2ter. Gruppo che cresce a 5 carte: bonus +10% sul danno per seme ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  // 5 carte di valore 3 (5pt): due di cuori (due copie dello stesso valore/seme, come da mazzo doppio), una per gli altri 3 semi
  const gruppo = [makeCard('♥', 3), makeCard('♥', 3), makeCard('♦', 3), makeCard('♣', 3), makeCard('♠', 3)];
  attacker.hand = [...gruppo, ...attacker.hand.slice(0, 6)];

  const res = actionLayMeld(state, 0, gruppo.map((c) => c.id), T0 + 1000);
  // Cuori: 2 carte da 5pt = 10, x1.10 (bonus 5 carte) = 11
  check('bonus 5 carte: Cuori (2 carte) perde 11 PV', Math.abs((100 - state.players[1].characters['♥'].pv) - 11) < 1e-9);
  // Quadri/Fiori/Picche: 1 carta da 5pt, x1.10 = 5.5
  check('bonus 5 carte: Quadri perde 5.5 PV', Math.abs((100 - state.players[1].characters['♦'].pv) - 5.5) < 1e-9);
  check('bonus 5 carte: Fiori perde 5.5 PV', Math.abs((100 - state.players[1].characters['♣'].pv) - 5.5) < 1e-9);
  check('bonus 5 carte: Picche perde 5.5 PV', Math.abs((100 - state.players[1].characters['♠'].pv) - 5.5) < 1e-9);
  check('danno totale con bonus (11+5.5+5.5+5.5=27.5)', Math.abs(res.damage - 27.5) < 1e-9);
}

// --- 2quater. Tris: ridistribuzione se il personaggio del seme è già a 0 PV ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  const tris = [makeCard('♥', 7), makeCard('♠', 7), makeCard('♣', 7)];
  attacker.hand = [...tris, ...attacker.hand.slice(0, 8)];
  state.players[1].characters['♥'].pv = 0; // il bersaglio naturale di Cuori è già morto

  actionLayMeld(state, 0, tris.map((c) => c.id), T0 + 1000);
  check('Picche e Fiori colpiti normalmente (5 PV ciascuno, danno diretto)', state.players[1].characters['♠'].pv === 95 && state.players[1].characters['♣'].pv === 95);
  // il danno "di Cuori" (5) non si spalma anche su Picche/Fiori (già colpiti
  // direttamente da questo stesso tris): va tutto sull'unico "spettatore" non coinvolto, Quadri
  check('il danno destinato a Cuori va tutto a Quadri, l\'unico personaggio non coinvolto nel tris', state.players[1].characters['♦'].pv === 95);
}

// --- 2quinquies. Scala corta con pinella: 6♦ + 2♣(come 7) + 8♦ deve fare danno ai Quadri ---
// Riproduce il caso segnalato dal committente: una scala da 3 carte non
// infliggeva nulla, perché la tabella della spec partiva da 5 carte.
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  const sei = makeCard('♦', 6), pinella = makeCard('♣', 2), otto = makeCard('♦', 8);
  const scala = [sei, pinella, otto];
  attacker.hand = [...scala, ...attacker.hand.slice(0, 8)];

  const res = actionLayMeld(state, 0, scala.map((c) => c.id), T0 + 1000);
  check('la scala 6♦-2♣-8♦ è accettata come sequenza', res.ok === true && res.meld.type === 'sequence');
  check('la scala corta ora infligge danno', res.damage > 0);
  // punti: 6♦=5, 8♦=10, pinella=20 → 35; ATT 100; moltiplicatore 1
  check('danno atteso 35 (5+10+20 punti, ATT 100, nessun bonus)', Math.abs(res.damage - 35) < 1e-9);
  check('il danno colpisce il personaggio di QUADRI, il seme della scala', res.suit === '♦' && state.players[1].characters['♦'].pv === 65);
  check('gli altri semi restano intatti', ['♥', '♣', '♠'].every((s) => state.players[1].characters[s].pv === 100));
  check('la calata registra quale carta è la wildcard (serve al tavolo per disporla)', res.meld.wildcardId === pinella.id);
}

// --- 3. Chiusura "al volo": pozzetto già preso, calata da 5+ svuota la mano ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  attacker.pozzettoTaken = true; // pozzetto già usato in precedenza
  const meld = heartsSeq([3, 4, 5, 6, 7]);
  attacker.hand = [...meld]; // SOLO queste carte: la mano si svuota calando

  const res = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('chiusura al volo rilevata', res.matchEnded === true && res.winReason === 'chiusura_al_volo');
  check('vince chi ha chiuso', state.winner === 0 && state.status === 'finished');
}

// --- 4. Chiusura normale via scarto (pozzetto preso + burraco già a terra) ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  attacker.pozzettoTaken = true;
  attacker.melds = [{ id: 'm0', type: 'sequence', suit: '♠', cards: heartsSeq([3, 4, 5, 6, 7]) }]; // burraco già calato prima
  const lastCard = makeCard('♣', 9);
  attacker.hand = [lastCard];

  const res = actionDiscard(state, 0, lastCard.id, T0 + 1000);
  check('chiusura normale rilevata allo scarto dell\'ultima carta', res.matchEnded === true && res.winReason === 'chiusura');
  check('vince chi ha chiuso (scarto)', state.winner === 0);
}

// --- 5. POZZETTO PRESO CON LO SCARTO ---
// Nel Burraco al pozzetto ci si arriva anche scartando l'ultima carta,
// non solo svuotando la mano calando. Prima era vietato per errore.
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  const lastCard = makeCard('♣', 9);
  attacker.hand = [lastCard];          // pozzetto ancora da prendere
  const pozzettoPrima = attacker.pozzetto.length;

  const res = actionDiscard(state, 0, lastCard.id, T0 + 1000);
  check('scartando l\'ultima carta si PUÒ prendere il pozzetto', res.ok === true && res.pozzettoPreso === true);
  check('la mano riparte dalle carte del pozzetto', attacker.hand.length === pozzettoPrima && pozzettoPrima > 0);
  check('il pozzetto risulta preso', attacker.pozzettoTaken === true && attacker.pozzetto.length === 0);
  check('la carta scartata è finita sul monte', state.scarti[state.scarti.length - 1].id === lastCard.id);
  check('il turno passa comunque all\'avversario', state.currentPlayerIndex === 1);
  check('la partita NON è finita: si continua a giocare', state.status === 'in_progress');
}

// --- 5bis. Con il pozzetto già preso e senza gioco da 5+, lo scarto finale è rifiutato ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  attacker.pozzettoTaken = true;
  attacker.pozzetto = [];
  const lastCard = makeCard('♣', 9);
  attacker.hand = [lastCard];          // niente gioco da 5+ carte: non può chiudere

  const res = actionDiscard(state, 0, lastCard.id, T0 + 1000);
  check('senza pozzetto da prendere né gioco da 5+, lo scarto finale è rifiutato', res.ok === false);
  check('la carta resta in mano', attacker.hand.length === 1);
}

// --- 6. Timeout di turno: pesca e scarta d'ufficio, passa il turno ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const before = state.moveCounter;
  const scartiPrima = state.scarti.length;
  const res = checkTurnTimeout(state, T0 + (TURN_SECONDS + 5) * 1000);
  check('timeout rilevato', res.expired === true);
  check('il turno passa al giocatore successivo', state.currentPlayerIndex === 1 && state.moveCounter === before + 1);
  check('è stata scartata una carta d\'ufficio', !!res.scartata && state.scarti.length === scartiPrima + 1);
  check('la carta scartata è finita davvero sul monte', state.scarti[state.scarti.length - 1].id === res.scartata.id);
}

// --- 6bis. Alla scadenza il turno passa SEMPRE, anche nei casi difficili ---
{
  // una carta sola in mano, pozzetto già preso, nessun gioco da 5+:
  // lo scarto normale sarebbe illecito, ma il turno non può restare fermo
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const p = state.players[0];
  p.hasDrawnThisTurn = true;
  p.pozzettoTaken = true;
  p.pozzetto = [];
  p.hand = [makeCard('♣', 9)];
  const res = checkTurnTimeout(state, T0 + (TURN_SECONDS + 5) * 1000);
  check('alla scadenza il tavolo non resta bloccato', res.expired === true);
  check('il turno è comunque passato o la partita è finita', state.currentPlayerIndex === 1 || state.status !== 'in_progress');
}

// --- 7. Orologio di partita esaurito: risoluzione per PV totali, non per chi resta senza tempo ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  state.players[0].clockSecondsLeft = 1;
  for (const s of ['♥', '♦', '♣', '♠']) state.players[1].characters[s].pv = 50; // player 1 ha meno PV totali

  chargeElapsedTime(state, T0 + 5000); // scade l'orologio del giocatore 0 di turno
  check('la partita finisce per orologio esaurito', state.status === 'finished');
  check('vince chi ha più PV totali (giocatore 0), non chi ha finito il tempo', state.winner === 0 && state.winReason === 'timeout');
}

// --- 8. Mazzo esaurito: nessuna pescata possibile, si risolve per PV ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  state.tallone = [];
  state.players[1].characters['♥'].pv = 10; // rende i PV totali asimmetrici, altrimenti è pareggio
  const res = actionDraw(state, 0, T0 + 1000);
  check('pescata su mazzo vuoto chiude la partita', res.matchEnded === true);
  check('motivo: mazzo esaurito', state.winReason === 'mazzo_esaurito');
}

// --- 8bis. Mazzo esaurito con PV pari: pareggio, non un vincitore forzato ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  state.tallone = [];
  const res = actionDraw(state, 0, T0 + 1000);
  check('PV pari a mazzo esaurito → pareggio', res.matchEnded === true && state.winReason === 'pareggio' && state.winner === null);
}

// --- 9. Abilità personaggio agganciate al motore: ciclico_buff attivo dall'inizio partita ---
{
  const abilities = [{ '♥': { trigger: 'ciclico_buff', attivo_turni: 2, pausa_turni: 2, effect: 'boost_att', parametro: '20', target: 'se_stesso' } }, {}];
  const state = createMatch({ now: T0, abilities, rng: () => 0.5 });
  check('ciclico_buff applicato subito alla creazione della partita (ATT 100→120)', state.players[0].characters['♥'].att === 120);
}

// --- 10. Abilità on_infliggo_danno agganciata: si attiva quando quel personaggio infligge danno con una calata ---
{
  const abilities = [{ '♥': { trigger: 'on_infliggo_danno', effect: 'cura_diretta', parametro: '10', target: 'se_stesso' } }, {}];
  const state = createMatch({ now: T0, abilities, rng: () => 0.5 });
  state.players[0].characters['♥'].pv = 80;
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5, 6, 7]); // tier 5, singolo, infligge danno di Cuori
  attacker.hand = [...meld, ...attacker.hand.slice(0, 6)];

  actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('on_infliggo_danno cura il personaggio che ha attaccato (80+10=90)', state.players[0].characters['♥'].pv === 90);
}

// --- 11. Abilità on_subisco_danno agganciata: si attiva quando quel personaggio subisce danno ---
{
  const abilities = [{}, { '♥': { trigger: 'on_subisco_danno', effect: 'boost_difesa', parametro: '15', target: 'se_stesso', durata_turni: 3 } }];
  const state = createMatch({ now: T0, abilities, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5, 6, 7]);
  attacker.hand = [...meld, ...attacker.hand.slice(0, 6)];

  actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('on_subisco_danno reagisce sul personaggio colpito (boost_difesa applicato)', state.players[1].characters['♥'].difesaPercent === 15);
}

// --- 12. I PUNTI MAGIA si accumulano giocando i turni ---
{
  const abilities = [{ '♠': { trigger: 'attivazione_manuale', effect: 'danno_da_attacco', parametro: '30', target: 'personaggio_specifico', costo: 4 } }, {}];
  const state = createMatch({ now: T0, abilities, rng: () => 0.5 });
  const p0 = state.players[0], p1 = state.players[1];

  // Il conteggio dei punti sta in nextTurn, che al primo turno non e'
  // ancora passato: chi apriva giocava con zero punti mentre il secondo
  // ne aveva gia' due. Ora chi inizia riceve subito i suoi.
  check('chi inizia ha i 2 punti del suo primo turno', p0.puntiMagia === 2);
  check('l\'altro ancora no', p1.puntiMagia === 0);
  const subito = usaAbilitaSpeciale(state, 0, '♠', '♦', T0 + 500);
  check('2 punti non bastano per un\'abilità da 4', subito.ok === false && /Punti magia insufficienti/.test(subito.reason));

  const giro = (t) => {
    p0.hasDrawnThisTurn = true; actionDiscard(state, 0, p0.hand[0].id, T0 + t);
    p1.hasDrawnThisTurn = true; actionDiscard(state, 1, p1.hand[0].id, T0 + t + 500);
  };
  giro(1000);
  check('dopo un giro ho 4 punti magia', p0.puntiMagia === 4);
  check('nessun avversario è stato colpito: nulla parte da solo',
    ['♥', '♦', '♣', '♠'].every((s) => p1.characters[s].pv === 100));

  giro(2000);
  check('dopo due giri ne ho 6: bastano per l\'abilità da 4', p0.puntiMagia === 6);

  const res = usaAbilitaSpeciale(state, 0, '♠', '♦', T0 + 5000);
  check('attivandola colpisce il bersaglio scelto', res.ok === true && p1.characters['♦'].pv < 100);
  check('la riserva si consuma del costo', p0.puntiMagia === 2 && res.costo === 4);
}

// --- 12bis. ONDATA D'URTO: le scale lunghe colpiscono anche tutti e 4 ---
{
  // scala da 5 carte, ATT 100 → ondata = 100 × 10% = 10 su ciascun avversario,
  // in aggiunta ai 25 punti di danno sul personaggio di Cuori
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5, 6, 7]);
  a.hand = [...meld, ...a.hand.slice(0, 6)];
  const res = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);

  check('scala da 5: ondata al 10% dell\'ATT', Math.abs(res.ondata - 10) < 1e-9 && res.ondataPercent === 0.10);
  check('scala da 5: il danno carte resta 25', Math.abs(res.dannoCarte - 25) < 1e-9);
  check('Cuori incassa carte + ondata (25+10=35)', Math.abs(state.players[1].characters['♥'].pv - 65) < 1e-9);
  check('gli altri 3 semi incassano solo l\'ondata (10 ciascuno)',
    ['♦', '♣', '♠'].every((s) => Math.abs(state.players[1].characters[s].pv - 90) < 1e-9));
  check('il resoconto elenca tutti e 4 i bersagli', res.colpi.length === 4);
}
{
  // scala da 6 carte → ondata 20%
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5, 6, 7, 8]);
  a.hand = [...meld, ...a.hand.slice(0, 5)];
  const res = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('scala da 6: ondata al 20% dell\'ATT', Math.abs(res.ondata - 20) < 1e-9 && res.ondataPercent === 0.20);
  check('scala da 6: i semi non bersaglio perdono 20', Math.abs(state.players[1].characters['♦'].pv - 80) < 1e-9);
}
{
  // scala da 7 carte → ondata 35%, che si somma all'AoE delle carte
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5, 6, 7, 8, 9]);
  a.hand = [...meld, ...a.hand.slice(0, 4)];
  const res = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('scala da 7: ondata al 35% dell\'ATT', Math.abs(res.ondata - 35) < 1e-9 && res.ondataPercent === 0.35);
  // carte 45pt × 1.6 = 72 (già AoE) + ondata 35 = 107 su ciascuno → tutti a 0 da 100
  check('scala da 7: ogni avversario incassa carte AoE + ondata', state.players[1].characters['♦'].pv === 0);
}
{
  // scala corta: nessuna ondata
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5]);
  a.hand = [...meld, ...a.hand.slice(0, 8)];
  const res = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('scala da 3: nessuna ondata', !res.ondata);
  check('scala da 3: gli altri semi restano intatti', ['♦', '♣', '♠'].every((s) => state.players[1].characters[s].pv === 100));
}
{
  // l'ondata passa per la varianza
  const prova = (r) => {
    const st = createMatch({ now: T0, rng: () => r });
    const a = st.players[0];
    a.hasDrawnThisTurn = true;
    const m = heartsSeq([3, 4, 5, 6, 7]);
    a.hand = [...m, ...a.hand.slice(0, 6)];
    return actionLayMeld(st, 0, m.map((c) => c.id), T0 + 1000).ondata;
  };
  check('ondata al minimo di varianza: 10 × 0,95 = 9,5', Math.abs(prova(0) - 9.5) < 1e-9);
  check('ondata al massimo di varianza: 10 × 1,05 = 10,5', Math.abs(prova(1) - 10.5) < 1e-9);
}

// --- 12ter. IL JOLLY in un tris infligge danno (30 punti, ATT dell'eroe più forte) ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  a.characters['♠'].att = 140;   // il mio eroe più forte: è il suo ATT che deve contare
  const tris = [makeCard('♥', 9), makeCard('♦', 9), makeCard(null, 0, true)];
  a.hand = [...tris, ...a.hand.slice(0, 8)];

  const res = actionLayMeld(state, 0, tris.map((c) => c.id), T0 + 1000);
  check('il tris col jolly è valido', res.ok === true && res.meld.type === 'group');
  check('il jolly infligge danno (prima non ne faceva)', !!res.jolly && res.jolly.damage > 0);
  // 30 punti × (140/100) × 1 (tris da 3 carte, nessun bonus) = 42
  check('danno del jolly: 30 punti × ATT 140 = 42', Math.abs(res.jolly.damage - 42) < 1e-9);
  check('il jolly usa l\'eroe con la spada più alta', res.jolly.semeAttaccante === '♠');
  check('il jolly colpisce un bersaglio avversario', ['♥', '♦', '♣', '♠'].includes(res.jolly.suitBersaglio));
  const totaleInflitto = ['♥', '♦', '♣', '♠'].reduce((t, s) => t + (100 - state.players[1].characters[s].pv), 0);
  // 9♥ = 10pt × ATT 100 = 10 ; 9♦ = 10 ; jolly = 42  → 62
  check('danno totale del tris col jolly = 10 + 10 + 42 = 62', Math.abs(totaleInflitto - 62) < 1e-6);
}
{
  // senza jolly nel gruppo, nessun colpo "jolly"
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const tris = [makeCard('♥', 9), makeCard('♦', 9), makeCard('♣', 9)];
  a.hand = [...tris, ...a.hand.slice(0, 8)];
  const res = actionLayMeld(state, 0, tris.map((c) => c.id), T0 + 1000);
  check('senza jolly non c\'è colpo del jolly', !res.jolly);
}

// --- 13. Varianza del danno: fra 0,95 e 1,05 del valore calcolato ---
{
  // rng = 0 → fattore minimo 0,95; rng = 1 → fattore massimo 1,05
  const prova = (r) => {
    const state = createMatch({ now: T0, rng: () => r });
    const a = state.players[0];
    a.hasDrawnThisTurn = true;
    const meld = heartsSeq([3, 4, 5, 6, 7]);   // 25 punti, ATT 100, tier 5 → base 25
    a.hand = [...meld, ...a.hand.slice(0, 6)];
    return actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000).dannoCarte;
  };
  check('con il minimo della varianza il danno carte è 25 × 0,95 = 23,75', Math.abs(prova(0) - 23.75) < 1e-9);
  check('con il massimo della varianza il danno carte è 25 × 1,05 = 26,25', Math.abs(prova(1) - 26.25) < 1e-9);
  check('a metà varianza il danno carte resta quello base (25)', Math.abs(prova(0.5) - 25) < 1e-9);
  check('la varianza non esce mai dall\'intervallo', prova(0) >= 25 * 0.95 - 1e-9 && prova(1) <= 25 * 1.05 + 1e-9);
}

// --- 14. Il risultato dice CHI ha subito il danno e QUANTO ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5, 6, 7]);
  a.hand = [...meld, ...a.hand.slice(0, 6)];
  const res = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  // con l'ondata la calata da 5 tocca tutti e 4, ma il bersaglio del seme
  // incassa anche il danno delle carte
  check('il risultato elenca i colpi inferti', Array.isArray(res.colpi) && res.colpi.length === 4);
  const colpoCuori = res.colpi.find((c) => c.suit === '♥');
  check('il colpo dice quale seme è stato colpito', !!colpoCuori);
  check('il colpo somma danno carte e ondata (25+10=35)', Math.abs(colpoCuori.damage - 35) < 1e-9);
  check('il colpo dice quanti PV restano al bersaglio', Math.abs(colpoCuori.pvRimasti - 65) < 1e-9);
}

// --- 15. AoE: il resoconto elenca tutti e 4 i bersagli ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5, 6, 7, 8, 9]);
  a.hand = [...meld, ...a.hand.slice(0, 4)];
  const res = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('AoE: il resoconto elenca 4 colpi', res.colpi.length === 4);
}

// --- 16. AGGANCIO a un gioco già in tavola (anche UNA carta per volta) ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const scala = heartsSeq([4, 5, 6]);
  const settedicuori = makeCard('♥', 7);
  a.hand = [...scala, settedicuori, ...a.hand.slice(0, 7)];
  const lay = actionLayMeld(state, 0, scala.map((c) => c.id), T0 + 1000);
  const pvDopoCalata = state.players[1].characters['♥'].pv;

  const res = actionAttachToMeld(state, 0, lay.meld.id, [settedicuori.id], T0 + 2000);
  check('si può agganciare UNA sola carta a un gioco già calato', res.ok === true);
  check('il gioco è cresciuto a 4 carte', lay.meld.cards.length === 4);
  check('la carta è uscita dalla mano', !a.hand.some((c) => c.id === settedicuori.id));
  check('l\'aggancio infligge danno', res.damage > 0);
  // 7♥ vale 5 punti, ATT 100, moltiplicatore ×1 (4 carte) → 5
  check('il danno è quello della sola carta agganciata (5)', Math.abs(res.dannoCarte - 5) < 1e-9);
  check('il bersaglio è il personaggio del seme del gioco', state.players[1].characters['♥'].pv === pvDopoCalata - 5);
}

// --- 17. L'aggancio che porta il gioco a 5 carte scatena l'ondata ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const scala = heartsSeq([4, 5, 6, 7]);         // 4 carte: nessuna ondata
  const quinta = makeCard('♥', 8);
  a.hand = [...scala, quinta, ...a.hand.slice(0, 6)];
  const lay = actionLayMeld(state, 0, scala.map((c) => c.id), T0 + 1000);
  check('la calata da 4 carte non fa ondata', !lay.ondata);

  const res = actionAttachToMeld(state, 0, lay.meld.id, [quinta.id], T0 + 2000);
  check('portando il gioco a 5 carte scatta l\'ondata del 10%', Math.abs(res.ondata - 10) < 1e-9);
  check('l\'ondata colpisce tutti e 4 gli avversari', res.colpi.length === 4);

  // agganciarne un'altra NON deve ripetere l'ondata da 5 carte
  const sesta = makeCard('♥', 9);
  a.hand.push(sesta);
  const res2 = actionAttachToMeld(state, 0, lay.meld.id, [sesta.id], T0 + 3000);
  check('portando il gioco a 6 carte scatta l\'ondata del 20% (fascia nuova)', Math.abs(res2.ondata - 20) < 1e-9);

  const settima = makeCard('♥', 10);
  a.hand.push(settima);
  const res3 = actionAttachToMeld(state, 0, lay.meld.id, [settima.id], T0 + 4000);
  check('a 7 carte scatta l\'ondata del 35%', Math.abs(res3.ondata - 35) < 1e-9);

  const ottava = makeCard('♥', 11);
  a.hand.push(ottava);
  const res4 = actionAttachToMeld(state, 0, lay.meld.id, [ottava.id], T0 + 5000);
  check('l\'ondata NON si ripete restando nella stessa fascia (8 carte)', !res4.ondata);
}

// --- 18. Agganci illeciti rifiutati ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const scala = heartsSeq([4, 5, 6]);
  const estranea = makeCard('♠', 13);
  a.hand = [...scala, estranea, ...a.hand.slice(0, 7)];
  const lay = actionLayMeld(state, 0, scala.map((c) => c.id), T0 + 1000);

  const res = actionAttachToMeld(state, 0, lay.meld.id, [estranea.id], T0 + 2000);
  check('una carta che non lega viene rifiutata', res.ok === false);
  check('la carta rifiutata resta in mano', a.hand.some((c) => c.id === estranea.id));
  check('il gioco resta di 3 carte', lay.meld.cards.length === 3);

  const suGiocoAltrui = actionAttachToMeld(state, 0, 'mNONESISTE', [estranea.id], T0 + 2000);
  check('non si può agganciare a un gioco che non è mio', suGiocoAltrui.ok === false);
}

// --- 19. Aggancio a un tris: la carta colpisce il personaggio del PROPRIO seme ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const tris = [makeCard('♥', 7), makeCard('♦', 7), makeCard('♣', 7)];
  const quarta = makeCard('♠', 7);
  a.hand = [...tris, quarta, ...a.hand.slice(0, 7)];
  const lay = actionLayMeld(state, 0, tris.map((c) => c.id), T0 + 1000);
  check('Picche non è ancora stato toccato', state.players[1].characters['♠'].pv === 100);

  const res = actionAttachToMeld(state, 0, lay.meld.id, [quarta.id], T0 + 2000);
  check('agganciando il 7♠ al tris, il danno va a Picche', state.players[1].characters['♠'].pv === 95);
  check('il gioco è cresciuto a 4 carte', lay.meld.cards.length === 4);
}

// --- 20. ABILITÀ SPECIALE: attivazione manuale a barra piena ---
{
  const abilities = [{ '♠': { trigger: 'attivazione_manuale', effect: 'danno_da_attacco', parametro: '30', target: 'personaggio_specifico' } }, {}];
  const state = createMatch({ now: T0, abilities, rng: () => 0.5 });
  const eroe = state.players[0].characters['♠'];
  eroe.att = 120;

  const nonCarica = usaAbilitaSpeciale(state, 0, '♠', '♥', T0 + 1000);
  check('senza punti magia l\'abilità è rifiutata', nonCarica.ok === false && /Punti magia insufficienti/.test(nonCarica.reason));

  state.players[0].puntiMagia = 4;   // riserva sufficiente
  const res = usaAbilitaSpeciale(state, 0, '♠', '♥', T0 + 2000);
  check('con i punti l\'abilità si attiva', res.ok === true && res.abilita === true);
  // 30% di ATT 120 = 36
  check('il danno è il 30% dell\'ATT dell\'eroe che attiva (36)', Math.abs(res.damage - 36) < 1e-9);
  check('colpisce il bersaglio scelto, non uno a caso', res.semeBersaglio === '♥' && Math.abs(state.players[1].characters['♥'].pv - 64) < 1e-9);
  check('gli altri personaggi restano intatti', ['♦', '♣', '♠'].every((s) => state.players[1].characters[s].pv === 100));
  check('la barra si consuma dei punti spesi', state.players[0].puntiMagia === 0);
  check('il resoconto dice chi ha colpito e quanto', res.colpi.length === 1 && res.colpi[0].suit === '♥');

  const subito = usaAbilitaSpeciale(state, 0, '♠', '♦', T0 + 3000);
  check('non si può riusare subito: i punti sono finiti', subito.ok === false);
}

// --- 21. L'abilità non colpisce un personaggio già morto ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const eroe = state.players[0].characters['♠'];
  state.players[0].puntiMagia = 4;
  state.players[1].characters['♥'].pv = 0;
  const res = usaAbilitaSpeciale(state, 0, '♠', '♥', T0 + 1000);
  check('bersaglio già fuori combattimento: rifiutato', res.ok === false && /già fuori combattimento/.test(res.reason));
  check('i punti non vengono sprecati: restano per riprovare', state.players[0].puntiMagia === 4);
}

// --- 22. L'abilità può dare il KO ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const eroe = state.players[0].characters['♠'];
  eroe.att = 200; state.players[0].puntiMagia = 4;
  for (const s of ['♥', '♦', '♣']) state.players[1].characters[s].pv = 0;
  state.players[1].characters['♠'].pv = 30;   // 30% di 200 = 60, basta
  const res = usaAbilitaSpeciale(state, 0, '♠', '♠', T0 + 1000);
  check('l\'abilità può chiudere la partita per KO', res.matchEnded === true && state.winReason === 'ko' && state.winner === 0);
}

// --- 23. BONUS POZZETTO: chi l'ha preso infligge il 150% ---
{
  const senza = createMatch({ now: T0, rng: () => 0.5 });
  const a1 = senza.players[0];
  a1.hasDrawnThisTurn = true;
  const m1 = heartsSeq([3, 4, 5]);
  a1.hand = [...m1, ...a1.hand.slice(0, 8)];
  const base = actionLayMeld(senza, 0, m1.map((c) => c.id), T0 + 1000).dannoCarte;

  const con = createMatch({ now: T0, rng: () => 0.5 });
  const a2 = con.players[0];
  a2.hasDrawnThisTurn = true;
  a2.pozzettoTaken = true;                       // pozzetto già preso
  const m2 = heartsSeq([3, 4, 5]);
  a2.hand = [...m2, ...a2.hand.slice(0, 8)];
  const conBonus = actionLayMeld(con, 0, m2.map((c) => c.id), T0 + 1000);

  check('col pozzetto preso il danno è il 150% di prima', Math.abs(conBonus.dannoCarte - base * 1.5) < 1e-6);
  check('il risultato segnala il bonus del pozzetto', conBonus.bonusPozzetto === 1.5);
  check('senza pozzetto non c\'è bonus', !actionLayMeld(senza, 0, [], T0 + 2000).bonusPozzetto);
}

// --- 24. EROE CADUTO: i colpi di quel seme valgono l'80% ---
{
  const vivo = createMatch({ now: T0, rng: () => 0.5 });
  const a1 = vivo.players[0];
  a1.hasDrawnThisTurn = true;
  const m1 = heartsSeq([3, 4, 5]);
  a1.hand = [...m1, ...a1.hand.slice(0, 8)];
  const base = actionLayMeld(vivo, 0, m1.map((c) => c.id), T0 + 1000).dannoCarte;

  const morto = createMatch({ now: T0, rng: () => 0.5 });
  const a2 = morto.players[0];
  a2.hasDrawnThisTurn = true;
  a2.characters['♥'].pv = 0;                     // il MIO eroe di Cuori è caduto
  const m2 = heartsSeq([3, 4, 5]);
  a2.hand = [...m2, ...a2.hand.slice(0, 8)];
  const ridotto = actionLayMeld(morto, 0, m2.map((c) => c.id), T0 + 1000);

  check('con il mio eroe di Cuori caduto la scala di Cuori fa l\'80%', Math.abs(ridotto.dannoCarte - base * 0.8) < 1e-6);
  check('il risultato segnala l\'eroe caduto', ridotto.eroeCaduto === '♥');
}

// --- 24bis. La penalità dell'eroe caduto vale anche nei tris, seme per seme ---
{
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  a.characters['♠'].pv = 0;                      // solo Picche è caduto
  const tris = [makeCard('♥', 7), makeCard('♠', 7), makeCard('♣', 7)];
  a.hand = [...tris, ...a.hand.slice(0, 8)];
  actionLayMeld(state, 0, tris.map((c) => c.id), T0 + 1000);

  check('i semi con l\'eroe vivo colpiscono pieno (5 danni)',
    state.players[1].characters['♥'].pv === 95 && state.players[1].characters['♣'].pv === 95);
  check('il seme con l\'eroe caduto colpisce all\'80% (4 danni)',
    Math.abs(state.players[1].characters['♠'].pv - 96) < 1e-6);
}

// --- 25. UN EROE, UN COLPO PER TURNO ---
// Nello stesso turno si puo' colpire piu' volte, ma con eroi DIVERSI:
// ognuno dei quattro ha un colpo a turno. Prima l'unico freno erano i
// punti magia, e con abbastanza punti si faceva picchiare tre volte il
// piu' forte — cosi' la scelta di quale eroe usare non contava niente.
{
  const abil = { trigger: 'attivazione_manuale', effect: 'danno_da_attacco', parametro: '30', target: 'personaggio_specifico', costo: 4 };
  const abilities = [{ '♥': abil, '♦': abil, '♣': abil, '♠': abil }, {}];
  const state = createMatch({ now: T0, abilities, rng: () => 0.5 });
  const io = state.players[0], avv = state.players[1];
  io.puntiMagia = 15;
  for (const s of ['♥', '♦', '♣', '♠']) io.characters[s].att = 100;   // 30 danni a colpo

  const a = usaAbilitaSpeciale(state, 0, '♥', '♥', T0 + 1000);
  check('primo colpo del turno', a.ok === true && io.puntiMagia === 11);

  const b = usaAbilitaSpeciale(state, 0, '♦', '♦', T0 + 2000);
  check('SECONDO colpo nello stesso turno, con un altro eroe', b.ok === true && io.puntiMagia === 7);

  const c = usaAbilitaSpeciale(state, 0, '♥', '♣', T0 + 3000);
  check('lo STESSO eroe non colpisce due volte nello stesso turno',
    c.ok === false && /già usato la sua abilità/.test(c.reason));
  check('e i punti magia non si sprecano', io.puntiMagia === 7);
  check('il bersaglio del colpo rifiutato è intatto', avv.characters['♣'].pv === 100);

  check('i due bersagli colpiti hanno incassato',
    avv.characters['♥'].pv === 70 && avv.characters['♦'].pv === 70);

  // passato il turno, gli eroi tornano pronti
  io.hasDrawnThisTurn = true;
  actionDiscard(state, 0, io.hand[0].id, T0 + 4000);
  const p1 = state.players[1];
  p1.hasDrawnThisTurn = true;
  actionDiscard(state, 1, p1.hand[0].id, T0 + 5000);

  const e = usaAbilitaSpeciale(state, 0, '♥', '♣', T0 + 6000);
  check('col turno nuovo lo stesso eroe torna a colpire', e.ok === true);
}

// --- 26. Le CARTE MAGICHE restano invece una per turno ---
{
  const SORPRESA = { id: 's', tipo: 'sorpresa', effect: 'danno_diretto', parametro: '10', trigger: 'on_activate', target: 'avversario', durata_turni: 0 };
  const TRAPPOLA = { id: 't', tipo: 'trappola', effect: 'scarto_forzato', parametro: '1', trigger: 'avversario_pesca', target: 'avversario', durata_turni: 0 };
  const state = createMatch({ now: T0, rng: () => 0.5, magiche: [[SORPRESA, TRAPPOLA], []] });

  const uno = giocaCartaMagica(state, 0, 0, T0 + 1000);
  check('la prima Carta Magica del turno si gioca', uno.ok === true);
  const due = giocaCartaMagica(state, 0, 1, T0 + 2000);
  check('la seconda Carta Magica nello stesso turno è rifiutata', due.ok === false && /una sola/i.test(due.reason));
  // la carta rifiutata resta al suo posto: non si consuma per un turno
  // sbagliato, altrimenti un tocco distratto costerebbe una copia vera
  check('la carta rifiutata non si consuma', state.players[0].magic.consumate.length === 1);
}

// --- 27. Il monte tempo è di 6 minuti a testa (era 15: troppi) ---
{
  check('il monte tempo vale 6 minuti', MATCH_SECONDS === 360);
  const state = createMatch({ now: T0, rng: () => 0.5 });
  check('ogni giocatore parte con 6 minuti', state.players[0].clockSecondsLeft === 360 && state.players[1].clockSecondsLeft === 360);

  // consumo tutto il monte del giocatore di turno
  state.players[1].characters['♥'].pv = 10;   // PV asimmetrici, così non è pareggio
  chargeElapsedTime(state, T0 + 361 * 1000);
  check('esaurito il monte la partita finisce', state.status === 'finished' && state.winReason === 'timeout');
  check('vince chi ha più PV totali', state.winner === 0);
}

// --- 28. La stat "difesa" del personaggio riduce il danno, su ogni fonte ---
// Prima d'ora "difesa" non esisteva: solo boost_difesa (temporaneo) c'era,
// ma impostava un flag che nessuno leggeva — il danno arrivava sempre
// pieno. Qui si controlla che la riduzione valga per davvero sulle tre
// fonti di danno: calata, abilità speciale, Carta Magica.
{
  // 28a. calata (bersaglio singolo)
  const state = createMatch({ now: T0, rng: () => 0.5 });
  const attacker = state.players[0];
  attacker.hasDrawnThisTurn = true;
  const meld = heartsSeq([3, 4, 5, 6, 7]); // 5 carte, punti = 25, tier 5 → moltiplicatore ×1
  attacker.hand = [...meld, ...attacker.hand.slice(0, 6)];
  state.players[1].characters['♥'].difesa = 20; // 20% di riduzione

  const res = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('il danno lordo delle carte resta 25 (la formula non cambia)', Math.abs(res.dannoCarte - 25) < 1e-9);
  check('a 5 carte scatta anche l\'ondata lorda al 10% (10)', Math.abs(res.ondata - 10) < 1e-9);
  // il colpo REALE su Cuori somma carte+ondata, entrambe scontate del 20%:
  // 25*0.8 + 10*0.8 = 28 (non 25+10=35 come senza difesa)
  check('il colpo REALE è ridotto del 20% su ciascuna componente (28 invece di 35)', Math.abs(res.colpi[0].damage - 28) < 1e-9);
  check('e i PV calano di altrettanto (100 - 28 = 72)', Math.abs(state.players[1].characters['♥'].pv - 72) < 1e-9);
}
{
  // 28b. abilità speciale
  const abil = { trigger: 'attivazione_manuale', effect: 'danno_da_attacco', parametro: '30', target: 'personaggio_specifico', costo: 4 };
  const state = createMatch({ now: T0, abilities: [{ '♥': abil }, {}], rng: () => 0.5 });
  state.players[0].puntiMagia = 15;
  state.players[0].characters['♥'].att = 100;         // 30 danni lordi
  state.players[1].characters['♦'].difesa = 50;       // metà danno

  const res = usaAbilitaSpeciale(state, 0, '♥', '♦', T0 + 1000);
  check('l\'abilità speciale rispetta la difesa del bersaglio (30 → 15)', Math.abs(state.players[1].characters['♦'].pv - 85) < 1e-9);
}
{
  // 28c. Carta Magica (danno_diretto)
  const SORPRESA = { id: 's', tipo: 'sorpresa', effect: 'danno_diretto', parametro: '40', trigger: 'on_activate', target: 'avversario', durata_turni: 0, costo: 4 };
  const state = createMatch({ now: T0, rng: () => 0, magiche: [[SORPRESA], []] });
  state.players[0].puntiMagia = 15;
  for (const s of ['♥', '♦', '♣', '♠']) state.players[1].characters[s].difesa = 25; // -25% ovunque

  giocaCartaMagica(state, 0, 0, T0 + 1000);
  const colpito = Object.values(state.players[1].characters).find((c) => c.pv < 100);
  check('una Carta Magica di danno diretto rispetta la difesa (40 → 30)', !!colpito && Math.abs(colpito.pv - 70) < 1e-9);
}

console.log('\n' + (failures === 0 ? 'Tutti i controlli passati.' : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
