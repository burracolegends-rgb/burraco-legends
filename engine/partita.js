// ============================================================
// BURRACO LEGENDS — motore di partita (l'"arbitro" di Battle)
//
// Turno: pesca → attacco → scarto (spec §2). Doppia condizione di
// vittoria: Chiusura o KO (spec §3). Pattern del tempo server-authoritative
// ripreso da Burraco Pulito (arbitro-PARTE-1.ts: turnStartedAt/lastMoveAt
// ricostruiti a ogni chiamata, non un timer che scorre da solo).
//
// ASSUNZIONI PRESE QUI perché la spec non le fissa — da confermare:
//
// 1. ATT usato nella formula danno = ATT del personaggio dell'attaccante
//    DELLO STESSO SEME della calata (non un ATT "di squadra" generico).
// 2. CONFERMATO dal committente — i GRUPPI (tris di stesso valore, semi
//    diversi per costruzione in un mazzo doppio) infliggono danno anche
//    loro, ma in modo diverso dalle sequenze: ogni singola carta colpisce
//    il personaggio del PROPRIO seme per il proprio punteggio (vedi
//    `groupDamageBySuit` in core-rules.js). Se il gruppo cresce oltre 3/4
//    carte, un moltiplicatore di lunghezza dedicato si applica: 5 carte
//    +10%, 6 carte +20%, 7+ carte +35% (scala diversa da quella delle
//    sequenze, §4: 5→×1, 6→×1.3, 7+→×1.6).
// 3. Ridistribuzione (bersaglio singolo già a 0 PV): il danno si divide in
//    parti uguali fra i personaggi avversari ancora vivi.
// 4. AoE (7+): il danno pieno calcolato colpisce ciascuno dei 4 personaggi
//    avversari (non diviso per 4).
// 5. Il monte tempo è PER GIOCATORE (come il monte a squadra di Burraco
//    Pulito), non un unico orologio condiviso: 1 minuto a turno, 6 minuti
//    totali a testa.
// 6. Orologio a zero (6 minuti) senza chiusura né KO → vince chi ha più PV
//    totali rimasti sui propri 4 personaggi. CONFERMATO dal committente.
//    Stessa regola estesa anche al caso "mazzo esaurito" (non coperto dalla
//    spec, ma è lo stesso scenario: partita finita senza vincitore netto).
//    Pareggio se i PV totali sono uguali — non ancora confermato esplicitamente.
// 7. Personaggi: possono essere iniettati veri (VITA/ATT/abilità) tramite
//    createMatch({ characters, abilities }); di default restano placeholder
//    PV 100 / ATT 100 su tutti e 4 i semi.
// 8. Trigger delle abilità personaggio (spec §7: "da agganciare a trigger
//    del game loop già esistenti") agganciati qui a: inizio del proprio
//    turno (cicliche), presa del pozzetto, chiusura, infliggere/subire
//    danno da una calata. Vocabolario di eventi non elencato dalla spec,
//    stesso principio già usato per i trigger delle Carte Trappola.
// ============================================================

import { SUITS, createFullDeck, shuffle, interoCasuale, validateMeld, meldLengthTier, meldPointValue, DAMAGE_TIERS, ONDATA_BONUS_COLPO_SOLO, cardPointValue, groupDamageBySuit, groupJollyDamage, semeAttaccoMigliore, infliggiDanno, sorteggioPrimoTurno } from './core-rules.js';
import { attachAbility, tickCharacterAbility, checkAbilityTrigger } from './character-abilities.js';
import { makeMagicState, checkTrapTrigger, tickTrapExpiry, resetTurnoMagie, activateSorpresa, armTrappola, applyEffect, cartaConsumata, risolviBersaglio, tickActiveEffects } from './magic-cards.js';
import { elencoEffetti, CONDIZIONI, EFFETTI_DIFFERITI } from './vocabolario.js';

export const TURN_SECONDS = 60;      // spec §2: 1 minuto per turno a giocatore
// Monte tempo dell'intera partita, per giocatore. Era 15 minuti: troppi,
// una partita non ci arriva mai e l'orologio non conta niente. Con 6
// minuti a testa il tempo torna a essere una risorsa vera.
export const MATCH_SECONDS = 6 * 60;
export const HAND_SIZE = 11;          // invariato da Burraco Pulito
export const POZZETTO_SIZE = 11;      // invariato da Burraco Pulito

// Dal tallone si pesca UNA carta, come nel burraco vero. Qui c'erano
// due carte a turno: il mazzo si consumava al doppio della velocità e
// le mani crescevano troppo in fretta. Le carte magiche che parlano di
// pesca ("pesca_ridotta", "pesca_extra") contano da qui, non da un 2
// scritto in mezzo al codice.
export const CARTE_PER_PESCATA = 1;

// ------------------------------------------------------------
// I TRENTA SECONDI PRIMA DI COMINCIARE
// Appena distribuite le carte si e' gia' dentro il proprio minuto, e
// bisogna decidere in fretta senza aver nemmeno guardato chi si ha
// davanti: quali eroi ha schierato l'avversario, con che vita e che
// attacco, e quali sono i propri. Trenta secondi in cui il tavolo si
// puo' solo guardare.
//
// Non e' un timer che gira nel browser: e' un istante scritto nello
// stato della partita. Il minuto del turno e il monte dei sei minuti
// partono da LI', non dalla distribuzione — se no lo studio si
// pagherebbe col proprio tempo, che e' esattamente il contrario.
// Sta a zero per difetto: le prove del motore misurano le regole, non
// l'attesa, e chiedere l'attesa e' un gesto del gioco, non del motore.
// ------------------------------------------------------------
export const SECONDI_DI_STUDIO = 30;

function defaultCharacters() {
  const chars = {};
  // Difesa è centrata su 1: è la base neutra (danno pieno), non uno zero.
  for (const s of SUITS) chars[s] = { pv: 100, pvMax: 100, att: 100, difesa: 1 };
  return chars;
}

// ------------------------------------------------------------
// PUNTI MAGIA
// Sostituiscono la vecchia barra di carica sui singoli eroi: non si
// caricano più le carte una per una, c'è UNA riserva sola per giocatore.
// Cresce di 2 a ogni proprio turno e non supera i 15.
//
// SI PAGANO SOLO LE ABILITÀ DEGLI EROI.
// Le Carte Magiche costavano punti magia anche loro (spec §7bis). Non
// più: il prezzo di una Carta Magica è la carta stessa, che si spende
// per sempre dalla collezione di chi la gioca. Erano due monete per la
// stessa cosa, e quella vera è la carta.
// ------------------------------------------------------------
export const PUNTI_MAGIA_MAX = 15;
export const PUNTI_MAGIA_PER_TURNO = 2;

// IL PRIMISSIMO TURNO NE VALE UNO SOLO.
// Chi comincia gioca un turno in più di chi risponde: se prendesse due
// punti come tutti, si porterebbe avanti di due per tutta la partita
// senza aver fatto niente per meritarseli. Un punto invece di due
// all'apertura pareggia il conto, e da lì in poi valgono due per tutti a
// ogni turno.
export const PUNTI_MAGIA_PRIMO_TURNO = 1;
export const COSTO_MAGIA_DEFAULT = 4;   // provvisorio, uguale per tutte per le prove

// PIU' CARA PER SEMPRE (il morso del Boitatà).
// Un personaggio colpito da `costo_abilita_extra` si porta dietro un
// sovrapprezzo sulla propria abilità per tutto il resto della partita.
// Il tetto sta qui e non dove il sovrapprezzo si accumula: così due
// morsi si sommano davvero nel conto, e il limite lo mette solo chi
// paga — "fino a un massimo di 7 punti magia", come dice la carta.
export const COSTO_ABILITA_MASSIMO = 7;

export function costoAbilitaDi(character) {
  const base = costoDiCarta(character && character._ability);
  const extra = (character && character.costoExtra) || 0;
  return Math.min(COSTO_ABILITA_MASSIMO, base + extra);
}

// Quanto costa in punti magia l'abilità speciale di un eroe.
export function costoDiCarta(abilita) {
  const c = abilita && (abilita.costo ?? abilita.puntiMagia);
  return (c === undefined || c === null) ? COSTO_MAGIA_DEFAULT : Number(c);
}

// BONUS DEL POZZETTO
// Da quando prende il pozzetto, quel giocatore infligge il 150% del danno
// — cioè una volta e mezza — per tutto il resto della partita e su
// qualunque colpo (calate, agganci, abilità speciali). Premia chi arriva
// per primo a svuotare la mano.
export const MOLTIPLICATORE_POZZETTO = 1.5;
function moltiplicatorePozzetto(player) {
  return player.pozzettoTaken ? MOLTIPLICATORE_POZZETTO : 1;
}

// EROE CADUTO
// Se il MIO personaggio di un seme è a 0 PV, i colpi che partono da quel
// seme valgono l'80%: l'eroe è fuori combattimento e le sue carte
// picchiano meno. Perdere un personaggio indebolisce quel seme senza
// azzerarlo del tutto.
export const PENALITA_EROE_CADUTO = 0.80;
function moltiplicatoreEroe(player, suit) {
  const eroe = player.characters[suit];
  return (eroe && eroe.pv <= 0) ? PENALITA_EROE_CADUTO : 1;
}

function makePlayer() {
  return {
    hand: [],
    pozzetto: [],
    pozzettoTaken: false,
    melds: [],           // { id, type, suit|null, value|null, cards: [...] }
    characters: defaultCharacters(),
    clockSecondsLeft: MATCH_SECONDS,
    hasDrawnThisTurn: false,
    puntiMagia: 0,       // riserva condivisa: +2 a turno, massimo 15
    magic: null,         // stato delle Carte Magiche (vedi magic-cards.js)
    // Effetti SUBITI e ancora in corso: ci finiscono gli effetti che
    // cambiano il flusso del gioco (salta il turno, pesca ridotta, blocca
    // il monte scarti, annulla il danno...). Prima venivano registrati e
    // basta, senza che nessuno li leggesse: le carte si attivavano e non
    // succedeva niente. Ora il motore li consulta nelle fasi giuste.
    effettiSubiti: [],   // { effect, parametro, turniRimasti }
    // Quali eroi hanno gia' usato l'abilita' in QUESTO turno. Si svuota
    // all'inizio di ogni proprio turno.
    abilitaUsate: []
  };
}

// ------------------------------------------------------------
// EFFETTI IN CORSO
// ------------------------------------------------------------
export function haEffetto(player, nome) {
  return (player.effettiSubiti || []).find((e) => e.effect === nome) || null;
}
function consumaEffetto(player, nome) {
  const i = (player.effettiSubiti || []).findIndex((e) => e.effect === nome);
  if (i === -1) return null;
  return player.effettiSubiti.splice(i, 1)[0];
}
export function imponiEffetto(player, effect, parametro, turniRimasti = 1) {
  player.effettiSubiti = player.effettiSubiti || [];
  player.effettiSubiti.push({ effect, parametro, turniRimasti });
}

// ------------------------------------------------------------
// I BUFF A TEMPO SCADONO DAVVERO
//
// Un buff con durata (boost_att, boost_difesa, boost_att_percentuale,
// riduci_difesa) non è un effetto "di flusso": cambia SUBITO un numero
// sul personaggio, e per scadere qualcuno deve rimettere quel numero
// com'era. Quel qualcuno è `tickActiveEffects`, che esisteva, era
// provata da sola... e non veniva chiamata da nessuna parte in partita.
// Risultato: "+25% difesa per 3 turni" era +25% PER SEMPRE, e il +100%
// di attacco della Mula non se ne andava più. Nessuno se n'era accorto
// perché finora nessuna carta usava davvero le durate.
//
// I buff stanno in DUE posti, e non è un caso:
//   - quelli delle Carte Magiche nello stato magico di chi le gioca
//     (ce li mette activateSorpresa);
//   - quelli delle ABILITÀ sul giocatore, perché un giocatore può
//     benissimo non avere carte magiche in mano e l'abilità funziona
//     lo stesso.
// Un effetto sta sempre in uno solo dei due, quindi invecchiano insieme
// senza rischio di essere annullati due volte.
function invecchiaBuffATempo(player, opponent) {
  const scaduti = [];
  scaduti.push(...tickActiveEffects(player.magic, player.characters, opponent.characters));
  scaduti.push(...tickActiveEffects(player, player.characters, opponent.characters));
  return scaduti;
}

// Registra un buff a tempo prodotto da un'ABILITÀ, così che scada.
// Durata zero (o assente) vuol dire "istantaneo": non c'è niente da far
// scadere e non va messo in lista, o resterebbe lì per sempre in attesa
// di un turno che non lo consuma mai.
function registraBuffAbilita(player, effettoAttivo, cardId) {
  if (!effettoAttivo || !(effettoAttivo.turniRimasti > 0)) return;
  player.effettiAttivi = player.effettiAttivi || [];
  player.effettiAttivi.push({ ...effettoAttivo, cardId });
}
// A ogni turno del giocatore gli effetti che lo riguardano invecchiano.
function invecchiaEffetti(player) {
  player.effettiSubiti = (player.effettiSubiti || []).filter((e) => {
    e.turniRimasti -= 1;
    return e.turniRimasti > 0;
  });
}

let meldIdCounter = 0;

// VARIANZA DEL DANNO (richiesta dal committente): il danno non è mai un
// numero fisso, viene moltiplicato per un fattore casuale fra 0,95 e 1,05.
// Serve a rendere gli scambi meno prevedibili senza stravolgere i valori.
export const VARIANZA_MIN = 0.95;
export const VARIANZA_MAX = 1.05;

function fattoreVarianza(state) {
  const r = (state && state.rng) ? state.rng() : Math.random();
  return VARIANZA_MIN + r * (VARIANZA_MAX - VARIANZA_MIN);
}

// abilities: [ { '♥': abilityDef|undefined, '♦': ..., '♣': ..., '♠': ... }, <stesso per players[1]> ]
// rng: sorgente casuale iniettabile — i test passano una funzione fissa per
//      avere danni prevedibili; in partita vale Math.random.
// magiche: [ [3 definizioni carta per il giocatore 0], [3 per il giocatore 1] ]
// `chiInizia` serve per FORZARE chi comincia, saltando il sorteggio.
// Non lo usa il gioco: lo usano i controlli automatici, che devono poter
// dire "adesso muove il giocatore 0" invece di dover indovinare come è
// andata la pescata. In partita vera resta sempre il mazzo a decidere.
export function createMatch({ now = Date.now(), characters = null, abilities = null, rng = null, magiche = null, studioSecondi = 0, chiInizia = null } = {}) {
  // Il generatore si sceglie PRIMA di mescolare: se lo si prendeva
  // dopo, il mazzo usciva da Math.random e la partita non era
  // ripetibile nemmeno passando un seme.
  const caso = rng || Math.random;
  const deck = shuffle(createFullDeck(), caso);
  const players = [makePlayer(), makePlayer()];
  players[0].hand = deck.splice(0, HAND_SIZE);
  players[1].hand = deck.splice(0, HAND_SIZE);
  const pozzetti = [deck.splice(0, POZZETTO_SIZE), deck.splice(0, POZZETTO_SIZE)];
  players[0].pozzetto = pozzetti[0];
  players[1].pozzetto = pozzetti[1];
  if (characters) {
    // permette di iniettare personaggi veri (VITA/ATT reali) quando esisteranno
    players[0].characters = characters[0];
    players[1].characters = characters[1];
  }
  if (abilities) {
    for (let i = 0; i < 2; i++) {
      const opponent = players[opponentIndex(i)];
      for (const s of SUITS) {
        const def = abilities[i] && abilities[i][s];
        if (def) attachAbility(players[i].characters[s], s, def, { casterCharacters: players[i].characters, opponentCharacters: opponent.characters });
      }
    }
  }
  if (magiche) {
    players[0].magic = makeMagicState(magiche[0] || []);
    players[1].magic = makeMagicState(magiche[1] || []);
  }
  const scarti = deck.length ? [deck.splice(0, 1)[0]] : [];

  // CHI COMINCIA LO DECIDE IL MAZZO, non chi ha aperto il tavolo.
  // Una carta a testa, la più alta vince (vedi sorteggioPrimoTurno in
  // core-rules.js). Le carte restano dove sono: si guardano dal fondo
  // del tallone, non si tolgono. Il risultato viaggia nello stato
  // perché i due schermi devono poter mostrare la STESSA pescata — e
  // perché una partita rigiocata dal registro deve ricominciare dallo
  // stesso giocatore.
  const sorteggio = chiInizia === null || chiInizia === undefined
    ? sorteggioPrimoTurno(deck)
    : { carte: [], vincitore: chiInizia === 1 ? 1 : 0, pareggi: [], imposto: true };
  const primo = sorteggio.vincitore;

  // il gioco comincia dopo lo studio: da quell'istante partono tutti e
  // due gli orologi
  const inizio = now + Math.max(0, Number(studioSecondi) || 0) * 1000;
  const iso = new Date(inizio).toISOString();
  // chi comincia riceve subito il punto del suo primo turno: uno solo,
  // perché gioca un turno in più dell'altro (vedi PUNTI_MAGIA_PRIMO_TURNO)
  players[primo].puntiMagia = PUNTI_MAGIA_PRIMO_TURNO;
  return {
    status: 'in_progress',
    rng: caso,
    tallone: deck,
    scarti,
    players,
    sorteggio,
    currentPlayerIndex: primo,
    // I punti magia crescono all'INIZIO di ogni proprio turno, e quel
    // conteggio sta in nextTurn(): che però al primo turno non è ancora
    // passato di lì. Chi apriva la partita giocava con zero punti,
    // mentre il secondo ne aveva già due — un turno in meno di magia,
    // per il solo fatto di iniziare. Il primo turno deve essere un
    // turno come tutti gli altri.
    turnStartedAt: iso,
    lastMoveAt: iso,
    moveCounter: 0,
    iniziaAlle: iso,          // prima di questo momento si guarda e basta
    winner: null,
    winReason: null // 'chiusura' | 'chiusura_al_volo' | 'ko' | 'timeout' | 'mazzo_esaurito' | 'pareggio'
  };
}

function opponentIndex(playerIndex) { return playerIndex === 0 ? 1 : 0; }

function aliveCharacters(characters) {
  return SUITS.filter((s) => characters[s].pv > 0);
}

function totalPV(characters) {
  return SUITS.reduce((sum, s) => sum + characters[s].pv, 0);
}

function hasQualifyingMeld(player) {
  return player.melds.some((m) => m.cards.length >= 5);
}

// ------------------------------------------------------------
// TEMPO — stesso principio di Burraco Pulito: non un timer che scorre da
// solo, ma ricostruito confrontando l'ora con l'ultimo istante noto.
// Va chiamata prima di applicare qualunque azione.
// ------------------------------------------------------------
export function chargeElapsedTime(state, nowMs) {
  if (state.status !== 'in_progress') return state;
  const started = Date.parse(state.lastMoveAt);
  const elapsed = isNaN(started) ? 0 : Math.max(0, Math.floor((nowMs - started) / 1000));
  const player = state.players[state.currentPlayerIndex];
  player.clockSecondsLeft = Math.max(0, player.clockSecondsLeft - elapsed);
  state.lastMoveAt = new Date(nowMs).toISOString();
  if (player.clockSecondsLeft <= 0) {
    resolveByAttrition(state, 'timeout');
  }
  return state;
}

function secondsSinceTurnStart(state, nowMs) {
  const started = Date.parse(state.turnStartedAt);
  return isNaN(started) ? 0 : Math.max(0, Math.floor((nowMs - started) / 1000));
}

// Fine partita senza chiusura né KO (mazzo esaurito o orologio a zero):
// vince chi ha più PV totali rimasti sui propri 4 personaggi (assunzione #6).
function resolveByAttrition(state, reason) {
  if (state.status !== 'in_progress') return;
  const pv0 = totalPV(state.players[0].characters);
  const pv1 = totalPV(state.players[1].characters);
  state.status = 'finished';
  state.winReason = pv0 === pv1 ? 'pareggio' : reason;
  state.winner = pv0 === pv1 ? null : (pv0 > pv1 ? 0 : 1);
}

// ------------------------------------------------------------
// ABBANDONARE
//
// Chi se ne va perde, e l'altro vince come se avesse mandato KO tutta
// la squadra. Non e' una regola inventata per punire: e' che un tavolo
// abbandonato senza dirlo lascia l'altro ad aspettare una mossa che non
// arrivera' mai, con il proprio orologio che intanto scorre. Meglio un
// modo esplicito di alzarsi da tavola.
//
// I personaggi di chi abbandona vengono azzerati davvero, cosi' il
// risultato regge anche a rigiocare la partita dal registro: il finale
// non e' una scritta appiccicata sopra, e' lo stato del tavolo.
// ------------------------------------------------------------
export function abbandona(state, playerIndex, nowMs = Date.now()) {
  if (!state) return { ok: false, reason: 'Partita inesistente.' };
  if (state.status !== 'in_progress') return { ok: false, reason: 'La partita è già finita.' };
  if (playerIndex !== 0 && playerIndex !== 1) return { ok: false, reason: 'Non risulti seduto a questo tavolo.' };

  const chiSeNeVa = state.players[playerIndex];
  for (const s of SUITS) chiSeNeVa.characters[s].pv = 0;

  state.status = 'finished';
  state.winner = opponentIndex(playerIndex);
  state.winReason = 'abbandono';
  state.lastMoveAt = new Date(nowMs).toISOString();
  state.moveCounter++;
  return { ok: true, abbandono: true, matchEnded: true, chiHaAbbandonato: playerIndex };
}

function checkKO(state, defenderIndex) {
  const defender = state.players[defenderIndex];
  if (aliveCharacters(defender.characters).length === 0) {
    state.status = 'finished';
    state.winner = opponentIndex(defenderIndex);
    state.winReason = 'ko';
    return true;
  }
  return false;
}

// Applica danno al personaggio di un dato seme; se è già a 0 PV, lo
// ridistribuisce in parti uguali sui superstiti (assunzione #3, "mai
// danno sprecato" spec §4). Usata sia dalle sequenze (bersaglio singolo)
// sia dai gruppi (bersaglio per-seme). Ritorna i semi effettivamente
// colpiti, per agganciare le abilità "on_subisco_danno".
// Ritorna l'elenco dei colpi davvero inferti: [{ suit, damage, cardId, pvRimasti }].
// Serve al tavolo per scrivere "chi ha subito quanto", non solo il totale.
function applyDamageToSuit(defenderCharacters, suit, damage) {
  const colpo = (s, dmg) => {
    const netto = infliggiDanno(defenderCharacters[s], dmg);
    return { suit: s, damage: netto, cardId: defenderCharacters[s].cardId, pvRimasti: defenderCharacters[s].pv };
  };
  if (defenderCharacters[suit].pv > 0) return [colpo(suit, damage)];
  const alive = aliveCharacters(defenderCharacters);
  if (alive.length === 0) return [];
  const share = damage / alive.length;
  return alive.map((s) => colpo(s, share));
}

// ------------------------------------------------------------
// TRAPPOLE — il pezzo che mancava.
// Le trappole si armavano e restavano sul tavolo, ma NESSUNO controllava
// mai se il loro trigger si verificasse: non scattavano mai. Ora ogni
// azione del gioco chiama questa funzione con il nome dell'evento
// appena successo, e le trappole del giocatore indicato che ascoltano
// quell'evento partono (una sola volta: poi sono consumate).
//
// proprietario = chi ha armato la trappola. L'evento lo provoca l'altro.
// ------------------------------------------------------------
// `dettagli` serve a un solo tipo di trappola, ma cambia la natura di
// questo meccanismo: fino a ieri a una trappola bastava sapere CHE cosa
// era successo ("l'avversario ha pescato"), e reagiva sempre allo stesso
// modo. La Conversione invece deve sapere anche COME: quale bonus o
// malus di difesa è stato appena messo, di quanto, e su chi — perché la
// sua risposta è fatta di quei numeri lì. Chi non lo usa non se ne
// accorge: il campo resta vuoto.
function scattaTrappole(state, proprietarioIndex, evento, dettagli = null) {
  const proprietario = state.players[proprietarioIndex];
  const ms = proprietario && proprietario.magic;
  if (!ms || !ms.trappoleArmate || ms.trappoleArmate.length === 0) return [];
  const vittimaIndex = opponentIndex(proprietarioIndex);
  const vittima = state.players[vittimaIndex];

  const scattate = [];
  // si lavora su una copia: checkTrapTrigger toglie la trappola dall'elenco
  const daControllare = ms.trappoleArmate.filter((t) => t.trigger === evento);
  for (const t of daControllare) {
    const ctx = {
      casterCharacters: proprietario.characters,
      opponentCharacters: vittima.characters,
      casterHand: proprietario.hand,
      opponentHand: vittima.hand,
      scarti: state.scarti,
      tallone: state.tallone,
      magicStateCaster: ms,
      magicStateOpponent: vittima.magic,
      casterPlayer: proprietario, opponentPlayer: vittima,
      puntiMagiaMax: PUNTI_MAGIA_MAX,
      dettagliEvento: dettagli,
      rng: state.rng          // il caso della partita, non quello del processo
    };
    const esito = checkTrapTrigger(ms, evento, null, ctx);
    if (!esito.triggered) continue;
    // gli effetti che cambiano il flusso vanno messi addosso a chi li subisce
    const eff = esito.trap.effect;
    if (EFFETTI_DI_FLUSSO.includes(eff)) {
      const bersaglio = (esito.trap.target === 'se_stesso') ? proprietario : vittima;
      imponiEffetto(bersaglio, eff, esito.trap.parametro, 1);
    }
    scattate.push({ cardId: esito.trap.cardId, effect: eff, risultato: esito.result });
  }
  return scattate;
}

// ------------------------------------------------------------
// CONDIZIONI
// Alcune carte funzionano solo se il tavolo si trova in una certa
// situazione ("solo se hai già preso il pozzetto", "solo se ti restano
// poche carte"). Se la condizione non è vera la carta non parte, e i
// punti magia NON si spendono.
// ------------------------------------------------------------
export function condizioneSoddisfatta(state, playerIndex, cond) {
  if (!cond) return { ok: true };
  const def = CONDIZIONI[cond.tipo];
  if (!def) return { ok: false, motivo: 'condizione sconosciuta: ' + cond.tipo };

  const io = state.players[playerIndex];
  const avv = state.players[opponentIndex(playerIndex)];
  const chi = (cond.chi === 'avversario') ? avv : io;
  const n = Number(cond.parametro);
  const eroiCaduti = SUITS.filter((s) => chi.characters[s].pv <= 0).length;
  const pvTot = SUITS.reduce((t, s) => t + chi.characters[s].pv, 0);
  const pvMax = SUITS.reduce((t, s) => t + chi.characters[s].pvMax, 0);

  let vero;
  switch (cond.tipo) {
    case 'pozzetto_preso':           vero = chi.pozzettoTaken; break;
    case 'pozzetto_non_preso':       vero = !chi.pozzettoTaken; break;
    case 'carte_in_mano_almeno':     vero = chi.hand.length >= n; break;
    case 'carte_in_mano_al_massimo': vero = chi.hand.length <= n; break;
    case 'eroi_caduti_almeno':       vero = eroiCaduti >= n; break;
    case 'pv_totali_sotto':          vero = pvMax > 0 && (pvTot / pvMax) * 100 < n; break;
    case 'punti_magia_almeno':       vero = (chi.puntiMagia || 0) >= n; break;
    case 'giochi_calati_almeno':     vero = chi.melds.length >= n; break;
    case 'mazzo_sotto':              vero = state.tallone.length < n; break;
    default: return { ok: false, motivo: 'condizione non gestita: ' + cond.tipo };
  }
  return vero ? { ok: true } : { ok: false, motivo: descriviCondizione(cond, def) };
}

function descriviCondizione(cond, def) {
  const chi = cond.chi === 'avversario' ? 'l\'avversario' : 'tu';
  const testo = def.descrizione.replace('N', cond.parametro);
  return def.senzaChi ? ('la carta si può giocare solo se ' + testo)
                      : ('la carta si può giocare solo se ' + chi + ' ' + testo);
}

// Effetti che non si applicano subito ma condizionano una fase futura:
// vengono depositati sul giocatore e letti al momento giusto.
//
// L'ELENCO NON SI SCRIVE PIU' A MANO.
// Qui c'era una copia scritta a mano di quello che il vocabolario
// dichiara gia': due fonti per la stessa verita', ed erano gia' andate
// fuori sincrono — boost_danno era nel vocabolario e mancava qui, cioe'
// la carta che lo usa (Cao-do-Mato, "Ricerca del bersaglio") si sarebbe
// giocata senza che succedesse niente. E' esattamente il guasto che
// vocabolario.js esiste per impedire, ricomparso a un piano piu' sotto.
// Adesso l'elenco lo si chiede a chi lo sa.
const EFFETTI_DI_FLUSSO = EFFETTI_DIFFERITI;

// Fa scattare un'abilità a evento su ciascuno dei 4 personaggi del
// proprietario (spec §7: agganciata a trigger del game loop già esistenti).
function fireAbilityEvent(ownerCharacters, otherCharacters, eventName, ownerMagic, otherMagic, ownerPlayer, otherPlayer) {
  const ctx = {
    casterCharacters: ownerCharacters, opponentCharacters: otherCharacters,
    magicStateCaster: ownerMagic, magicStateOpponent: otherMagic,
    casterPlayer: ownerPlayer, opponentPlayer: otherPlayer,
    puntiMagiaMax: PUNTI_MAGIA_MAX
  };
  for (const s of SUITS) checkAbilityTrigger(ownerCharacters[s], s, eventName, ctx);
}

function nextTurn(state, nowMs) {
  const chiHaFinito = state.currentPlayerIndex;

  // TURNO EXTRA: chi ha appena finito rigioca invece di passare la mano
  if (consumaEffetto(state.players[chiHaFinito], 'turno_extra')) {
    state.players[chiHaFinito].hasDrawnThisTurn = false;
    state.players[chiHaFinito].abilitaUsate = [];
    state.turnStartedAt = new Date(nowMs).toISOString();
    state.moveCounter++;
    return;
  }

  state.currentPlayerIndex = opponentIndex(state.currentPlayerIndex);

  // SALTA IL TURNO INTERO: il turno rimbalza subito indietro
  if (consumaEffetto(state.players[state.currentPlayerIndex], 'skip_turno_intero')) {
    state.currentPlayerIndex = chiHaFinito;
    state.players[chiHaFinito].hasDrawnThisTurn = false;
    state.players[chiHaFinito].abilitaUsate = [];
    state.turnStartedAt = new Date(nowMs).toISOString();
    state.moveCounter++;
    return;
  }

  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[opponentIndex(state.currentPlayerIndex)];
  player.hasDrawnThisTurn = false;
  player.abilitaUsate = [];        // turno nuovo, eroi di nuovo pronti
  state.turnStartedAt = new Date(nowMs).toISOString();
  state.moveCounter++;

  // i punti magia crescono a ogni proprio turno, fino al tetto
  player.puntiMagia = Math.min(PUNTI_MAGIA_MAX, (player.puntiMagia || 0) + PUNTI_MAGIA_PER_TURNO);

  // le Carte Magiche: una per turno, e le trappole invecchiano
  if (player.magic) resetTurnoMagie(player.magic);
  if (opponent.magic) tickTrapExpiry(opponent.magic);
  invecchiaEffetti(opponent);
  // I buff a tempo di chi comincia adesso invecchiano di un turno: una
  // durata "2 turni" vuol dire due TUOI turni, che è come la legge chi
  // gioca. Valgono anche per i malus che hai messo tu addosso all'altro
  // (li tieni tu, con la sponda già segnata dentro l'effetto).
  invecchiaBuffATempo(player, opponent);
  // Le abilità cicliche del giocatore di turno avanzano di un passo
  // all'inizio del proprio turno (spec §7: cicliche a turni fissi).
  const ctx = {
    casterCharacters: player.characters, opponentCharacters: opponent.characters,
    magicStateCaster: player.magic, magicStateOpponent: opponent.magic,
    casterPlayer: player, opponentPlayer: opponent,
    puntiMagiaMax: PUNTI_MAGIA_MAX
  };
  for (const s of SUITS) tickCharacterAbility(player.characters[s], s, ctx);
}

// ------------------------------------------------------------
// FASE 1: PESCA
// ------------------------------------------------------------
export function actionDraw(state, playerIndex, nowMs) {
  chargeElapsedTime(state, nowMs);
  if (state.status !== 'in_progress') return { ok: false, reason: 'Partita conclusa.' };
  if (playerIndex !== state.currentPlayerIndex) return { ok: false, reason: 'Non è il tuo turno.' };
  const player = state.players[playerIndex];
  if (player.hasDrawnThisTurn) return { ok: false, reason: 'Hai già pescato in questo turno.' };

  // effetti magici sulla pesca
  const blocco = haEffetto(player, 'restrict_draw_source');
  if (blocco && blocco.parametro === 'nessuna_pesca') {
    consumaEffetto(player, 'restrict_draw_source');
    player.hasDrawnThisTurn = true;   // il turno prosegue, ma senza pescare
    return { ok: true, drawn: 0, bloccatoDa: 'restrict_draw_source' };
  }

  if (state.tallone.length === 0) {
    resolveByAttrition(state, 'mazzo_esaurito');
    return { ok: true, matchEnded: true };
  }

  let quante = CARTE_PER_PESCATA;
  // "pesca ridotta" vuol dire una carta in meno del normale: con la
  // pescata a una sola carta, il turno si gioca senza pescare.
  const ridotta = consumaEffetto(player, 'pesca_ridotta');
  if (ridotta) quante = Math.max(0, CARTE_PER_PESCATA - (Number(ridotta.parametro) || 1));
  const extra = consumaEffetto(player, 'pesca_extra');
  if (extra) quante += Number(extra.parametro) || 1;

  const n = Math.min(quante, state.tallone.length);
  player.hand.push(...state.tallone.splice(0, n));
  player.hasDrawnThisTurn = true;

  const scattate = scattaTrappole(state, opponentIndex(playerIndex), 'avversario_pesca');
  return { ok: true, drawn: n, modificata: !!(ridotta || extra), trappoleScattate: scattate };
}

export function actionTakeDiscardPile(state, playerIndex, nowMs) {
  chargeElapsedTime(state, nowMs);
  if (state.status !== 'in_progress') return { ok: false, reason: 'Partita conclusa.' };
  if (playerIndex !== state.currentPlayerIndex) return { ok: false, reason: 'Non è il tuo turno.' };
  const player = state.players[playerIndex];
  if (player.hasDrawnThisTurn) return { ok: false, reason: 'Hai già pescato in questo turno.' };
  if (state.scarti.length === 0) return { ok: false, reason: 'Il monte scarti è vuoto.' };

  if (consumaEffetto(player, 'blocca_monte_scarti')) {
    return { ok: false, reason: 'Una Carta Magica ti impedisce di prendere il monte scarti in questo turno.' };
  }
  const limite = haEffetto(player, 'restrict_draw_source');
  if (limite && limite.parametro === 'solo_ultima_carta_scarti') {
    consumaEffetto(player, 'restrict_draw_source');
    player.hand.push(state.scarti.pop());
    player.hasDrawnThisTurn = true;
    const scattate = scattaTrappole(state, opponentIndex(playerIndex), 'avversario_pesca');
    return { ok: true, soloUltima: true, trappoleScattate: scattate };
  }

  player.hand.push(...state.scarti.splice(0));
  player.hasDrawnThisTurn = true;
  const scattate = scattaTrappole(state, opponentIndex(playerIndex), 'avversario_pesca');
  return { ok: true, trappoleScattate: scattate };
}

// ------------------------------------------------------------
// FASE 2: ATTACCO — cala una combinazione, eventualmente infligge danno
// ------------------------------------------------------------
export function actionLayMeld(state, playerIndex, cardIds, nowMs) {
  chargeElapsedTime(state, nowMs);
  if (state.status !== 'in_progress') return { ok: false, reason: 'Partita conclusa.' };
  if (playerIndex !== state.currentPlayerIndex) return { ok: false, reason: 'Non è il tuo turno.' };
  const player = state.players[playerIndex];
  if (!player.hasDrawnThisTurn) return { ok: false, reason: 'Devi pescare prima di attaccare.' };
  if (haEffetto(player, 'skip_fase_attacco')) return { ok: false, reason: 'Una Carta Magica ti impedisce di calare in questo turno.' };

  const cards = [];
  for (const id of cardIds) {
    const c = player.hand.find((h) => h.id === id);
    if (!c) return { ok: false, reason: `Carta ${id} non è in mano.` };
    cards.push(c);
  }
  const validation = validateMeld(cards);
  if (!validation.ok) return { ok: false, reason: validation.reason };

  player.hand = player.hand.filter((h) => !cardIds.includes(h.id));
  // wildcardId e order servono al client per disporre la colonna: la pinella
  // o il jolly vanno mostrati al posto della carta che stanno sostituendo.
  const meld = { id: 'm' + (meldIdCounter++), type: validation.type, suit: validation.suit || null,
                 value: validation.value ?? null, wildcardId: validation.wildcardId || null,
                 order: validation.order || null, cards };
  player.melds.push(meld);

  let result = { ok: true, meld, damage: 0 };
  const defenderIndex = opponentIndex(playerIndex);
  const defender = state.players[defenderIndex];
  meld.tierRaggiunto = meldLengthTier(cards);   // serve agli agganci: l'ondata non si ripete

  // una calata nuova non ha ancora scaricato niente: parte da zero
  applicaDanno(state, playerIndex, result, cards, validation.type, validation.suit, cards.length, 0);
  if (result.matchEnded) return result;

  // Pozzetto: si prende SUBITO appena la mano si svuota (spec §5)
  return concludiCalata(state, playerIndex, result);
}

// ------------------------------------------------------------
// DANNO DI UNA CALATA (o di un aggancio)
// Estratta perché serve identica in due punti: quando si cala un gioco
// nuovo e quando si agganciano carte a un gioco già in tavola.
//   cards           = le carte che infliggono il danno (solo quelle nuove,
//                     nel caso dell'aggancio)
//   lunghezzaGioco  = la lunghezza del gioco RISULTANTE, da cui dipendono
//                     moltiplicatore e ondata
//   ondataConsentita = false quando il gioco non ha cambiato fascia: senza
//                     questo si potrebbe ripetere l'ondata all'infinito
//                     agganciando una carta per volta
// ------------------------------------------------------------
// Applica al danno gli effetti magici che lo riguardano:
//  - raddoppia_danno sull'attaccante  → ×2
//  - annulla_danno sul difensore      → 0
//  - riflette_danno sul difensore     → una % torna indietro all'attaccante
// Sono tutti "una volta sola": si consumano appena usati.
function modificaDanno(state, playerIndex, damage, result) {
  const player = state.players[playerIndex];
  const defender = state.players[opponentIndex(playerIndex)];

  // chi ha già preso il pozzetto picchia più forte, da lì in avanti
  if (player.pozzettoTaken) {
    damage *= moltiplicatorePozzetto(player);
    result.bonusPozzetto = MOLTIPLICATORE_POZZETTO;
  }

  if (consumaEffetto(player, 'raddoppia_danno')) {
    damage *= 2;
    result.dannoRaddoppiato = true;
  }

  // BONUS AL DANNO CHE DURA NEL TEMPO (Cão-do-Mato, "Ricerca del
  // bersaglio": +25% al danno di calate e abilità).
  // Non si consuma come raddoppia_danno: vale per tutti i colpi finché
  // non scade da sola, e invecchia col passare dei turni come gli altri
  // effetti addosso a un giocatore.
  const potenziato = haEffetto(player, 'boost_danno');
  if (potenziato) {
    const pct = Number(potenziato.parametro) || 0;
    damage *= (1 + pct / 100);
    result.dannoPotenziato = pct;
  }
  if (consumaEffetto(defender, 'annulla_danno')) {
    result.dannoAnnullato = true;
    return 0;
  }
  const riflesso = consumaEffetto(defender, 'riflette_danno');
  if (riflesso) {
    const pct = Number(riflesso.parametro) || 50;
    const indietro = damage * (pct / 100);
    // il rimbalzo colpisce l'eroe che ha attaccato, se ancora in piedi
    const vivi = aliveCharacters(player.characters);
    if (vivi.length > 0) {
      const s = vivi.includes(result.suit) ? result.suit : vivi[0];
      const nettoRiflesso = infliggiDanno(player.characters[s], indietro);
      result.riflesso = { damage: nettoRiflesso, suit: s, percentuale: pct };
    }
  }
  return damage;
}

// `pctOndataGiaPagata`: quanto ATT-percento di ondata questo GIOCO ha già
// scaricato PRIMA di questa mossa (0 per una calata nuova, che parte
// sempre da zero). Non è un sì/no: le fasce (5→10%, 6→20%, 7→35%) sono
// SOGLIE CUMULATIVE, non premi indipendenti — salire da 5 a 6 vale la
// DIFFERENZA (10 punti, non 20 pieni), salire da 6 a 7 vale la differenza
// (15, non 35). Costruire un gioco a gradini deve scaricare in totale la
// stessa ondata di chi lo cala già completo in un colpo solo: se ogni
// aggancio pagasse la percentuale intera della fascia nuova, tre agganci
// di fila (5→6→7) frutterebbero 10+20+35=65% invece di 35% — quasi il
// doppio del colpo secco, e senza nessun motivo per cui costruire a
// pezzi dovrebbe rendere di più che calare tutto insieme.
function applicaDanno(state, playerIndex, result, cards, tipo, suitGioco, lunghezzaGioco, pctOndataGiaPagata) {
  const player = state.players[playerIndex];
  const defenderIndex = opponentIndex(playerIndex);
  const defender = state.players[defenderIndex];

  // LE TRAPPOLE CHE ASPETTANO UN COLPO DEVONO SCATTARE PRIMA DEL COLPO.
  // Stavano in fondo, dopo che il danno era già stato applicato. Per
  // quasi tutte non cambiava niente, ma lo Specchio di Ritorsione —
  // "metà del danno torna a chi lo ha inflitto" — si armava un istante
  // troppo tardi: buono per il colpo DOPO, cioè inutile. Chi la giocava
  // la vedeva scattare e non succedeva niente.
  const trappoleDelColpo = scattaTrappole(state, defenderIndex, 'subisco_danno');

  if (tipo === 'sequence') {
    const tier = meldLengthTier(lunghezzaGioco);
    if (tier !== null) {
      const suit = suitGioco;
      const attackerChar = player.characters[suit];
      const points = meldPointValue(cards);
      const varianza = fattoreVarianza(state);
      const penalitaEroe = moltiplicatoreEroe(player, suit);   // 80% se il mio eroe di quel seme è caduto
      if (penalitaEroe < 1) result.eroeCaduto = suit;
      let damage = points * (attackerChar.att / 100) * DAMAGE_TIERS[tier].multiplier * varianza * penalitaEroe;

      // il seme di chi attacca va saputo PRIMA: e' su di lui che torna
      // indietro il danno riflesso
      result.suit = suit;
      // effetti magici sul danno: prima li registravamo e basta
      damage = modificaDanno(state, playerIndex, damage, result);
      if (damage === 0 && result.dannoAnnullato) {
        result.damage = 0; result.dannoCarte = 0; result.tier = tier; result.colpi = [];
        result.trappoleScattate = trappoleDelColpo;
        return result;
      }

      let colpi;
      if (DAMAGE_TIERS[tier].target === 'aoe') {
        colpi = SUITS.map((s) => {
          const netto = infliggiDanno(defender.characters[s], damage);
          return { suit: s, damage: netto, cardId: defender.characters[s].cardId, pvRimasti: defender.characters[s].pv };
        });
      } else {
        // bersaglio singolo: personaggio dello stesso seme della calata (con ridistribuzione se già a 0)
        colpi = applyDamageToSuit(defender.characters, suit, damage);
      }
      // ONDATA D'URTO: percentuale dell'ATT dell'eroe di quel seme, su tutti
      // e 4 gli avversari, in aggiunta al danno delle carte (spec §4).
      // Solo la parte NUOVA di ondata rispetto a quella già scaricata da
      // questo gioco: mai negativa (le fasce salgono sempre, non
      // scendono, ma un controllo costa poco ed evita sorprese).
      // ECCEZIONE: le 7 carte in un colpo solo — nessuna ondata ancora
      // scaricata da questo gioco (parte da zero) e la mossa arriva già
      // a 7 — valgono il premio, non la soglia normale.
      const diColpo = tier === 7 && (pctOndataGiaPagata || 0) === 0;
      const pct = diColpo ? ONDATA_BONUS_COLPO_SOLO
        : Math.max(0, (DAMAGE_TIERS[tier].aoePercent || 0) - (pctOndataGiaPagata || 0));
      if (pct > 0) {
        const ondata = attackerChar.att * pct * fattoreVarianza(state) * penalitaEroe * moltiplicatorePozzetto(player);
        for (const s of SUITS) {
          const nettoOndata = infliggiDanno(defender.characters[s], ondata);
          const gia = colpi.find((c) => c.suit === s);
          if (gia) { gia.damage += nettoOndata; gia.pvRimasti = defender.characters[s].pv; }
          else colpi.push({ suit: s, damage: nettoOndata, cardId: defender.characters[s].cardId, pvRimasti: defender.characters[s].pv });
        }
        result.ondata = ondata;
        result.ondataPercent = pct;
      }

      result.damage = damage + (result.ondata ? result.ondata * SUITS.length : 0);
      result.dannoCarte = damage;
      result.varianza = varianza;
      result.tier = tier;
      result.target = DAMAGE_TIERS[tier].target;
      result.suit = suit; // seme del personaggio che ha attaccato (utile lato client, es. per la barra "carica")
      result.colpi = colpi;

      checkAbilityTrigger(player.characters[suit], suit, 'on_infliggo_danno', { casterCharacters: player.characters, opponentCharacters: defender.characters });
      for (const c of colpi) checkAbilityTrigger(defender.characters[c.suit], c.suit, 'on_subisco_danno', { casterCharacters: defender.characters, opponentCharacters: player.characters });

      // trappole del difensore che aspettavano proprio questo
      result.trappoleScattate = [
        ...trappoleDelColpo,
        ...(tier === 7 ? scattaTrappole(state, defenderIndex, 'avversario_cala_7piu') : [])
      ];

      if (checkKO(state, defenderIndex)) { result.matchEnded = true; return result; }
    }
  } else if (tipo === 'group') {
    // Confermato: ogni carta del gruppo colpisce il personaggio del proprio
    // seme per il proprio punteggio, con bonus di lunghezza a 5/6/7+ carte
    // (vedi groupDamageBySuit in core-rules.js).
    const varianza = fattoreVarianza(state);
    const grezzo = groupDamageBySuit(cards, player.characters, lunghezzaGioco);

    // IL GRUPPO PASSA DAGLI EFFETTI SUL DANNO COME LA SCALA.
    // Qui non ci passava: raddoppia, annulla e riflette funzionavano
    // sulle scale e non sui tris. Il gruppo colpisce seme per seme, ma
    // gli effetti valgono sul colpo INTERO — quindi si somma tutto, si
    // passa una volta sola dagli effetti, e il rapporto fra prima e dopo
    // si riporta su ogni seme. (Il bonus del pozzetto lo mette
    // modificaDanno: applicarlo anche qui lo conterebbe due volte.)
    const jollyGrezzo = groupJollyDamage(cards, player.characters, lunghezzaGioco) * varianza;
    let totaleGrezzo = jollyGrezzo;
    for (const s of Object.keys(grezzo)) totaleGrezzo += grezzo[s] * varianza;

    result.suit = semeAttaccoMigliore(player.characters);
    const totaleModificato = modificaDanno(state, playerIndex, totaleGrezzo, result);
    if (result.dannoAnnullato) {
      result.damage = 0; result.tier = 'gruppo'; result.colpi = [];
      result.trappoleScattate = trappoleDelColpo;
      return result;
    }
    const fattore = totaleGrezzo > 0 ? (totaleModificato / totaleGrezzo) : 0;

    const bySuit = {};
    for (const s of Object.keys(grezzo)) bySuit[s] = grezzo[s] * varianza * fattore;
    const touchedSuits = Object.keys(bySuit);
    const aliveBefore = {};
    for (const s of SUITS) aliveBefore[s] = defender.characters[s].pv > 0;

    let totalDamage = 0;
    const wasted = []; // danno verso semi già morti PRIMA di questa calata
    const colpiti = new Set();
    const dannoSubito = {};   // seme → danno totale incassato, per il resoconto
    for (const suit of touchedSuits) {
      const dmg = bySuit[suit];
      totalDamage += dmg;
      if (aliveBefore[suit]) {
        const netto = infliggiDanno(defender.characters[suit], dmg);
        colpiti.add(suit);
        dannoSubito[suit] = (dannoSubito[suit] || 0) + netto;
      } else {
        wasted.push(dmg);
      }
    }
    // Assunzione #3 estesa ai gruppi: il danno verso un seme già morto si
    // ridistribuisce sui superstiti NON colpiti direttamente da questo
    // stesso tris (per non concentrare due volte il danno sugli stessi
    // personaggi); se non ce ne sono, si ridistribuisce su tutti i superstiti.
    if (wasted.length > 0) {
      const bystanders = SUITS.filter((s) => aliveBefore[s] && !touchedSuits.includes(s));
      const pool = bystanders.length > 0 ? bystanders : aliveCharacters(defender.characters);
      for (const dmg of wasted) {
        if (pool.length === 0) continue;
        const share = dmg / pool.length;
        for (const s of pool) {
          const netto = infliggiDanno(defender.characters[s], share);
          colpiti.add(s);
          dannoSubito[s] = (dannoSubito[s] || 0) + netto;
        }
      }
    }

    // IL JOLLY: non ha seme, quindi picchia con l'ATT del mio eroe più forte
    // e sceglie un bersaglio avversario a caso fra quelli ancora vivi.
    const dannoJolly = jollyGrezzo * fattore;
    if (dannoJolly > 0) {
      const vivi = aliveCharacters(defender.characters);
      if (vivi.length > 0) {
        const scelto = vivi[interoCasuale(state.rng, vivi.length)] || vivi[0];
        const nettoJolly = infliggiDanno(defender.characters[scelto], dannoJolly);
        dannoSubito[scelto] = (dannoSubito[scelto] || 0) + nettoJolly;
        colpiti.add(scelto);
        totalDamage += dannoJolly;
        result.jolly = { damage: nettoJolly, suitBersaglio: scelto, semeAttaccante: semeAttaccoMigliore(player.characters) };
      }
    }

    result.damage = totalDamage;
    result.dannoPerSeme = bySuit;
    result.varianza = varianza;
    result.tier = 'gruppo';
    result.target = 'per_seme';
    result.colpi = Object.keys(dannoSubito).map((s) => ({
      suit: s, damage: dannoSubito[s], cardId: defender.characters[s].cardId, pvRimasti: defender.characters[s].pv
    }));

    for (const s of touchedSuits) checkAbilityTrigger(player.characters[s], s, 'on_infliggo_danno', { casterCharacters: player.characters, opponentCharacters: defender.characters });
    for (const s of colpiti) checkAbilityTrigger(defender.characters[s], s, 'on_subisco_danno', { casterCharacters: defender.characters, opponentCharacters: player.characters });
    result.trappoleScattate = trappoleDelColpo;

    if (touchedSuits.length > 0 && checkKO(state, defenderIndex)) { result.matchEnded = true; return result; }
  }
  return result;
}

// Coda comune a calata e aggancio: presa del pozzetto e chiusura al volo.
function concludiCalata(state, playerIndex, result) {
  const player = state.players[playerIndex];
  const defender = state.players[opponentIndex(playerIndex)];

  // Pozzetto: si prende SUBITO appena la mano si svuota (spec §5)
  if (player.hand.length === 0) {
    if (!player.pozzettoTaken && player.pozzetto.length > 0) {
      player.hand = player.pozzetto;
      player.pozzetto = [];
      player.pozzettoTaken = true;
      result.pozzettoPreso = true;
      fireAbilityEvent(player.characters, defender.characters, 'on_pozzetto', player.magic, defender.magic, player, defender);
    } else if (player.pozzettoTaken) {
      // seconda volta a zero carte, dopo aver già usato il pozzetto: chiusura
      if (hasQualifyingMeld(player)) {
        state.status = 'finished';
        state.winner = playerIndex;
        state.winReason = 'chiusura_al_volo';
        result.matchEnded = true;
        result.winReason = 'chiusura_al_volo';
        fireAbilityEvent(player.characters, defender.characters, 'on_chiusura', player.magic, defender.magic, player, defender);
      }
      // se non ha ancora un burraco da 5+, resta a mani vuote: dovrà scartare
      // dell'ultima carta pescata al turno successivo — caso limite, non
      // gestito oltre qui (evidenziato come punto da playtestare)
    }
  }

  return result;
}

// ------------------------------------------------------------
// AGGANCIO A UN GIOCO GIÀ IN TAVOLA
// Regola base del Burraco che mancava: una volta calato un tris o una
// scala, si possono aggiungere altre carte a quel gioco, anche UNA sola
// per volta. Il minimo di tre carte vale solo per aprire un gioco nuovo.
//
// Il danno lo fanno le carte aggiunte, ma moltiplicatore e ondata si
// calcolano sulla lunghezza raggiunta dal gioco intero: completare un
// burraco vale come averlo calato tutto insieme. L'ondata però scatta
// una volta sola per fascia — `meld.tierRaggiunto` tiene il conto —
// altrimenti basterebbe agganciare una carta per volta per ripeterla.
// ------------------------------------------------------------
export function actionAttachToMeld(state, playerIndex, meldId, cardIds, nowMs) {
  chargeElapsedTime(state, nowMs);
  if (state.status !== 'in_progress') return { ok: false, reason: 'Partita conclusa.' };
  if (playerIndex !== state.currentPlayerIndex) return { ok: false, reason: 'Non è il tuo turno.' };
  const player = state.players[playerIndex];
  if (!player.hasDrawnThisTurn) return { ok: false, reason: 'Devi pescare prima di attaccare.' };
  if (haEffetto(player, 'skip_fase_attacco')) return { ok: false, reason: 'Una Carta Magica ti impedisce di calare in questo turno.' };
  if (!cardIds || cardIds.length === 0) return { ok: false, reason: 'Scegli almeno una carta da agganciare.' };

  const meld = player.melds.find((m) => m.id === meldId);
  if (!meld) return { ok: false, reason: 'Quel gioco non è fra i tuoi.' };

  const nuove = [];
  for (const id of cardIds) {
    const c = player.hand.find((h) => h.id === id);
    if (!c) return { ok: false, reason: `Carta ${id} non è in mano.` };
    nuove.push(c);
  }

  // il gioco risultante deve restare valido
  const insieme = [...meld.cards, ...nuove];
  const validation = validateMeld(insieme);
  if (!validation.ok) return { ok: false, reason: 'Quelle carte non si legano a questo gioco: ' + validation.reason };
  if (validation.type !== meld.type) return { ok: false, reason: 'Le carte non si legano a questo gioco.' };

  // applica
  player.hand = player.hand.filter((h) => !cardIds.includes(h.id));
  meld.cards = insieme;
  meld.wildcardId = validation.wildcardId || null;
  meld.order = validation.order || null;
  if (validation.suit) meld.suit = validation.suit;
  if (validation.value !== undefined) meld.value = validation.value ?? meld.value;

  const tierPrima = meld.tierRaggiunto || null;
  const tierOra = meldLengthTier(insieme);
  meld.tierRaggiunto = tierOra;
  // quanto ATT-percento ha già scaricato questo gioco fino ad ora: si
  // paga solo la differenza con la fascia raggiunta adesso (vedi
  // applicaDanno). Prima di qualunque fascia (tierPrima null) vale zero.
  const pctOndataGiaPagata = tierPrima !== null ? (DAMAGE_TIERS[tierPrima].aoePercent || 0) : 0;

  const result = { ok: true, meld, damage: 0, agganciate: nuove.length };
  applicaDanno(state, playerIndex, result, nuove, meld.type, meld.suit, insieme.length, pctOndataGiaPagata);
  if (result.matchEnded) return result;

  return concludiCalata(state, playerIndex, result);
}

// ------------------------------------------------------------
// ABILITÀ SPECIALE — attivazione manuale a barra piena
//
// La barra blu di ogni eroe si riempie di una fetta a ogni proprio turno
// (quante fette lo dice `turniCarica` sulla carta). Arrivata a 100 NON
// parte da sola: il giocatore tocca la carta e sceglie quale personaggio
// avversario colpire. Il danno è una percentuale dell'ATT dell'eroe che
// attiva — non dei punti delle carte, non dei PV del bersaglio.
// La percentuale sta sulla carta (`abilita.parametro`); di riferimento 30%.
// Come ogni altro danno passa per la varianza 0,95-1,05.
// ------------------------------------------------------------
export const ABILITA_PERCENT_DEFAULT = 30;

// QUESTA ABILITA' CHIEDE AL GIOCATORE DI MIRARE?
// Quasi mai: nessuna carta del roster dice "a scelta", quindi il
// bersaglio lo decide la carta. Resta possibile scriverne una che lo
// chieda (target "personaggio_specifico") — e allora il tavolo deve
// entrare in "scegli il bersaglio" invece di far partire il colpo
// subito. Lo decide il motore, non il client: cosi' la risposta e' la
// stessa in locale e in rete, e non si sfasa se un giorno cambia.
export function abilitaChiedeBersaglio(ability) {
  return elencoEffetti(ability).some((e) => e.target === 'personaggio_specifico');
}

export function usaAbilitaSpeciale(state, playerIndex, semeAttaccante, semeBersaglio, nowMs = Date.now()) {
  chargeElapsedTime(state, nowMs);
  if (state.status !== 'in_progress') return { ok: false, reason: 'Partita conclusa.' };
  if (playerIndex !== state.currentPlayerIndex) return { ok: false, reason: 'Non è il tuo turno.' };

  const player = state.players[playerIndex];
  const defenderIndex = opponentIndex(playerIndex);
  const defender = state.players[defenderIndex];
  const eroe = player.characters[semeAttaccante];
  if (!eroe) return { ok: false, reason: 'Eroe non valido.' };
  if (eroe.pv <= 0) return { ok: false, reason: 'Questo eroe è fuori combattimento.' };
  // Gli eroi non si caricano più uno per uno: l'abilità si paga dalla
  // riserva di punti magia, come le Carte Magiche.
  // UN EROE, UN COLPO PER TURNO.
  // Prima, con abbastanza punti magia, si poteva far picchiare lo stesso
  // eroe due o tre volte nello stesso turno: i punti magia erano l'unico
  // limite, e la scelta di QUALE eroe usare non contava piu' niente —
  // tanto valeva usare sempre il piu' forte. Adesso ogni eroe puo'
  // colpire una volta sola a turno: quattro colpi al massimo, ma
  // ciascuno dal suo seme.
  player.abilitaUsate = player.abilitaUsate || [];
  if (player.abilitaUsate.includes(semeAttaccante)) {
    return { ok: false, reason: 'Questo eroe ha già usato la sua abilità in questo turno.' };
  }

  const costoAbilita = costoAbilitaDi(eroe);
  if ((player.puntiMagia || 0) < costoAbilita) {
    return { ok: false, reason: 'Punti magia insufficienti: servono ' + costoAbilita + ', ne hai ' + (player.puntiMagia || 0) + '.' };
  }

  // CHI SCEGLIE IL BERSAGLIO, LO DICE LA CARTA.
  // Per la maggior parte del roster il giocatore sceglie QUALE suo eroe
  // attiva e basta: il bersaglio lo decide la carta (uno a caso, tutti,
  // i propri...). Sei carte invece dicono "a scelta" — Papa Figo, Boto
  // Felipe, Onça-Pintada, Mapinguari, Caipora e Boitatá — e per quelle
  // `semeBersaglio` è la scelta vera del giocatore, che va controllata.
  // Un eroe senza abilità dichiarata colpisce comunque, alla percentuale
  // di riferimento: è il comportamento di sempre dei personaggi
  // segnaposto, e toglierlo li lascerebbe con un pulsante che spende
  // punti magia e non fa niente.
  const dichiarati = elencoEffetti(eroe._ability);
  const effetti = dichiarati.length ? dichiarati
    : [{ effect: 'danno_da_attacco', parametro: String(ABILITA_PERCENT_DEFAULT), target: 'avversario' }];
  const serveScelta = effetti.some((e) => e.target === 'personaggio_specifico');
  if (serveScelta) {
    const scelto = defender.characters[semeBersaglio];
    if (!scelto) return { ok: false, reason: 'Bersaglio non valido.' };
    if (scelto.pv <= 0) return { ok: false, reason: 'Quel personaggio è già fuori combattimento: scegline un altro.' };
  }

  const result = {
    ok: true, abilita: true,
    costo: costoAbilita, semeAttaccante,
    suit: semeAttaccante        // su di lui torna indietro il danno riflesso
  };
  if (serveScelta) result.semeBersaglio = semeBersaglio;

  // PRIMA le trappole, POI gli effetti.
  // Usare l'abilità di un eroe fa scattare le trappole dell'avversario
  // (regola del committente): schierarle serve anche a punire chi tira
  // fuori i colpi speciali. E devono scattare adesso, non dopo: una
  // trappola che rimanda indietro il danno, se si arma a colpo già dato,
  // non serve a niente.
  result.trappoleScattate = [
    ...scattaTrappole(state, defenderIndex, 'avversario_usa_abilita'),
    ...scattaTrappole(state, defenderIndex, 'subisco_danno')
  ];

  // GLI EFFETTI SI ESEGUONO NELL'ORDINE IN CUI SONO SCRITTI SULLA CARTA.
  // Prima c'era una divisione fissa — "il colpo" da una parte, "gli altri
  // effetti" dall'altra, questi ultimi sempre prima — e con essa
  // l'impossibilità di scrivere "fa danno E POI indebolisce chi ha
  // colpito": il malus veniva applicato prima che il colpo scegliesse
  // qualcuno. Adesso l'ordine sulla carta è l'ordine in partita.
  let damage = 0;
  const colpi = [];
  let bersaglioColpito = [];      // chi ha già incassato: lo riusa "bersaglio_colpito"
  const esiti = [];

  for (const e of effetti) {
    // IL COLPO DI SPADA passa dalla catena completa del danno: varianza,
    // bonus del pozzetto, raddoppia/annulla/riflette. Gli altri effetti
    // no — un "danno_diretto" scritto su un'abilità è un numero fisso,
    // come su una Carta Magica, e non deve consumare il raddoppio.
    if (e.effect === 'danno_da_attacco') {
      const pct = Number(e.parametro) || ABILITA_PERCENT_DEFAULT;
      const { pool, suits } = risolviBersaglio(
        e.target, { casterCharacters: player.characters, opponentCharacters: defender.characters,
                    suit: serveScelta ? semeBersaglio : null, bersaglioColpito, rng: state.rng },
        'avversario', state.rng);

      let lordo = eroe.att * (pct / 100) * fattoreVarianza(state);
      lordo = modificaDanno(state, playerIndex, lordo, result);

      const presi = [];
      for (const s of suits) {
        const netto = infliggiDanno(pool[s], lordo);
        damage += netto;
        if (netto > 0) {
          colpi.push({ suit: s, damage: netto, cardId: pool[s].cardId, pvRimasti: pool[s].pv });
          presi.push(s);
          checkAbilityTrigger(pool[s], s, 'on_subisco_danno',
            { casterCharacters: defender.characters, opponentCharacters: player.characters });
        }
      }
      if (presi.length) bersaglioColpito = presi;
      esiti.push({ effect: e.effect, percentuale: pct, colpiti: presi });
      continue;
    }

    // EFFETTI CHE CAMBIANO IL FLUSSO DI GIOCO.
    // Non si "applicano" a un personaggio: si depositano addosso a un
    // giocatore e il motore li rispetta più tardi, nel punto giusto
    // (pesca, attacco, calcolo del danno). Le Carte Magiche lo facevano
    // già; le abilità no, e passavano da applyEffect — che per questi
    // non ha un caso e rispondeva "effetto non riconosciuto". In pratica
    // l'abilità spendeva i punti magia e non faceva niente: è il guasto
    // che il vocabolario esiste apposta per impedire, e qui era rientrato
    // dalla finestra perché le due strade non erano la stessa.
    if (EFFETTI_DI_FLUSSO.includes(e.effect)) {
      const suDiMe = e.target === 'se_stesso' || e.target === 'alleato_casuale' || e.target === 'tutti_alleati';
      imponiEffetto(suDiMe ? player : defender, e.effect, e.parametro, e.durata_turni || 1);
      esiti.push({ effect: e.effect, differito: true, su: suDiMe ? 'io' : 'avversario' });
      continue;
    }

    const ctxEffetto = {
      casterCharacters: player.characters, opponentCharacters: defender.characters,
      casterHand: player.hand, opponentHand: defender.hand,
      scarti: state.scarti, tallone: state.tallone,
      magicStateCaster: player.magic, magicStateOpponent: defender.magic,
      casterPlayer: player, opponentPlayer: defender,
      puntiMagiaMax: PUNTI_MAGIA_MAX,
      // "se_stesso" su un'abilità vuol dire l'eroe che la sta usando;
      // se la carta chiede un bersaglio scelto, è quello.
      suit: e.target === 'se_stesso' ? semeAttaccante : (serveScelta ? semeBersaglio : null),
      bersaglioColpito,
      rng: state.rng
    };
    const res = applyEffect(e, ctxEffetto);
    // Se l'effetto ha una durata, va messo in lista o non scadrà mai:
    // "+100% attacco per 2 turni" senza questa riga è +100% per sempre.
    registraBuffAbilita(player, res.effettoAttivo, eroe.cardId);
    const reazioni = avvisaChiGuardaLeDifese(state, playerIndex, e, { ...res, lato: res.effettoAttivo && res.effettoAttivo.pool });
    // `parametro` e `durata_turni` viaggiano con l'esito perché è il
    // tavolo a doverli mostrare ("+25% per 3 turni"): senza, il client
    // saprebbe che è successo qualcosa ma non di quanto.
    esiti.push({ effect: e.effect, parametro: e.parametro, durata: e.durata_turni,
                 ...res, ...(reazioni.length ? { trappoleScattate: reazioni } : {}) });
  }

  player.puntiMagia -= costoAbilita;
  player.abilitaUsate.push(semeAttaccante);

  result.damage = damage;
  result.puntiRimasti = player.puntiMagia;
  result.colpi = colpi;
  result.effettiAbilita = esiti;
  // quanta parte dell'ATT ha pesato il primo colpo: serve al tavolo per
  // raccontare "il 30% del suo attacco"
  const primoColpo = esiti.find((x) => x.effect === 'danno_da_attacco');
  if (primoColpo) result.percentuale = primoColpo.percentuale;

  if (checkKO(state, defenderIndex)) result.matchEnded = true;
  return result;
}


// ------------------------------------------------------------
// CARTE MAGICHE — attivazione dentro la partita
// Passano di qui invece che dal client, così gli effetti che cambiano il
// flusso vengono depositati sul giocatore giusto e il motore li rispetta.
// ------------------------------------------------------------
export function giocaCartaMagica(state, playerIndex, indiceCarta, nowMs = Date.now()) {
  chargeElapsedTime(state, nowMs);
  if (state.status !== 'in_progress') return { ok: false, reason: 'Partita conclusa.' };
  if (playerIndex !== state.currentPlayerIndex) return { ok: false, reason: 'Non è il tuo turno.' };
  const player = state.players[playerIndex];
  const ms = player.magic;
  if (!ms) return { ok: false, reason: 'Nessuna Carta Magica in gioco.' };
  const carta = ms.selection[indiceCarta];
  if (!carta) return { ok: false, reason: 'Carta non trovata.' };

  // UNA CARTA, UN UTILIZZO.
  // Le Carte Magiche non costano più punti magia (quelli restano alle
  // abilità degli eroi): il loro prezzo è la carta stessa, che si spende
  // per sempre. Quindi l'unico limite è il posto — giocato una volta,
  // quel posto è vuoto fino a fine partita.
  if (cartaConsumata(ms, indiceCarta)) {
    return { ok: false, reason: 'Questa Carta Magica l\'hai già usata: ogni carta vale un solo utilizzo.' };
  }

  // la condizione si controlla PRIMA di consumare: se non è vera la
  // carta resta al suo posto e non si spende niente
  const cond = condizioneSoddisfatta(state, playerIndex, carta.condizione);
  if (!cond.ok) return { ok: false, reason: cond.motivo };

  const avversario = state.players[opponentIndex(playerIndex)];
  const ctx = {
    casterCharacters: player.characters, opponentCharacters: avversario.characters,
    casterHand: player.hand, opponentHand: avversario.hand,
    scarti: state.scarti, tallone: state.tallone, magicStateCaster: ms,
    magicStateOpponent: avversario.magic,   // serve a chi distrugge le Trappole altrui
    // I GIOCATORI, non solo i loro personaggi: i punti magia sono una
    // riserva unica del giocatore, non stanno su una carta.
    casterPlayer: player, opponentPlayer: avversario,
    puntiMagiaMax: PUNTI_MAGIA_MAX,
    rng: state.rng            // il caso della partita, non quello del processo
  };

  if (carta.tipo === 'sorpresa') {
    const r = activateSorpresa(ms, carta, ctx);
    if (!r.ok) return r;
    ms.consumate.push(indiceCarta);
    // il PRIMO effetto l'ha già applicato activateSorpresa: se toccava le
    // difese, la Conversione va avvisata anche per quello
    const primo = elencoEffetti(carta)[0];
    if (primo) avvisaChiGuardaLeDifese(state, playerIndex, primo, { ...r, lato: r.effettoAttivo && r.effettoAttivo.pool });
    // UNA CARTA PUÒ FARE PIÙ COSE: si scorrono tutti i suoi effetti
    const esiti = applicaEffettiCarta(state, playerIndex, carta, ctx);
    if (checkKO(state, opponentIndex(playerIndex))) r.matchEnded = true;
    return { ...r, tipo: 'sorpresa', carta, esiti, consumata: indiceCarta };
  }

  // TRAPPOLA: si spende quando la si schiera sul campo, non quando
  // scatta. Se scade senza mai partire, è comunque spesa.
  const r = armTrappola(ms, carta);
  if (!r.ok) return r;
  ms.consumate.push(indiceCarta);
  return { ...r, tipo: 'trappola', carta, consumata: indiceCarta };
}

// ------------------------------------------------------------
// APPLICA TUTTI GLI EFFETTI DI UNA CARTA
// Gli immediati si risolvono subito; quelli che cambiano il flusso
// vengono depositati sul giocatore che li subirà.
// (Il primo effetto lo ha già applicato activateSorpresa: qui si parte
// dal secondo, per non farlo due volte.)
// ------------------------------------------------------------
// CHI TOCCA LE DIFESE SI FA SENTIRE DALL'ALTRA PARTE.
// La Conversione aspetta esattamente questo momento. Va chiamata DOPO
// che l'effetto e' stato applicato, perche' quello che la trappola
// ribalta e' un bonus (o un malus) che sul tavolo c'e' gia': se
// scattasse prima non ci sarebbe ancora niente da spostare.
const EFFETTI_DIFESA = ['boost_difesa', 'riduci_difesa'];

function avvisaChiGuardaLeDifese(state, playerIndex, effetto, esito) {
  if (!EFFETTI_DIFESA.includes(effetto.effect)) return [];
  if (!esito || !esito.colpiti || !esito.colpiti.length) return [];
  const altro = opponentIndex(playerIndex);
  return scattaTrappole(state, altro, 'avversario_tocca_difesa', {
    effect: effetto.effect,
    parametro: effetto.parametro,
    colpiti: esito.colpiti,
    // dal punto di vista di chi ha armato la trappola: quel bonus/malus
    // e' finito sui SUOI personaggi, o su quelli di chi l'ha giocato?
    suProprietario: esito.lato === 'opponent' || esito.pool === 'opponent'
  });
}

function applicaEffettiCarta(state, playerIndex, carta, ctx, dalPrimo = false) {
  const player = state.players[playerIndex];
  const avversario = state.players[opponentIndex(playerIndex)];
  const effetti = elencoEffetti(carta);
  const esiti = [];

  effetti.forEach((e, i) => {
    if (EFFETTI_DI_FLUSSO.includes(e.effect)) {
      const bersaglio = (e.target === 'se_stesso') ? player : avversario;
      imponiEffetto(bersaglio, e.effect, e.parametro, (e.durata_turni || 1));
      esiti.push({ effect: e.effect, differito: true });
      return;
    }
    if (i === 0 && !dalPrimo) { esiti.push({ effect: e.effect, giaApplicato: true }); return; }
    const res = applyEffect(e, ctx);
    esiti.push({ effect: e.effect, parametro: e.parametro, durata: e.durata_turni, ...res });
    const reazioni = avvisaChiGuardaLeDifese(state, playerIndex, e, { ...res, lato: res.effettoAttivo && res.effettoAttivo.pool });
    if (reazioni.length) esiti.push({ effect: e.effect, trappoleScattate: reazioni });
  });
  return esiti;
}

// ------------------------------------------------------------
// FASE 3: SCARTO — chiude il turno, oppure la partita se è chiusura
// ------------------------------------------------------------
export function actionDiscard(state, playerIndex, cardId, nowMs) {
  chargeElapsedTime(state, nowMs);
  if (state.status !== 'in_progress') return { ok: false, reason: 'Partita conclusa.' };
  if (playerIndex !== state.currentPlayerIndex) return { ok: false, reason: 'Non è il tuo turno.' };
  const player = state.players[playerIndex];
  if (!player.hasDrawnThisTurn) return { ok: false, reason: 'Devi pescare prima di scartare.' };
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) return { ok: false, reason: `Carta ${cardId} non è in mano.` };

  // COSA SUCCEDE SCARTANDO L'ULTIMA CARTA
  // Nel Burraco al pozzetto ci si arriva in due modi: "al volo", svuotando
  // la mano calando, oppure proprio con lo scarto. Il secondo caso prima
  // era vietato per errore — si diceva "non puoi scartare l'ultima carta"
  // anche a chi il pozzetto doveva ancora prenderlo, e restava bloccato.
  const wouldEmptyHand = player.hand.length === 1;
  const puoPrenderePozzetto = !player.pozzettoTaken && player.pozzetto.length > 0;
  const puoChiudere = player.pozzettoTaken && hasQualifyingMeld(player);
  if (wouldEmptyHand && !puoPrenderePozzetto && !puoChiudere) {
    return { ok: false, reason: 'Non puoi scartare la tua ultima carta: hai già preso il pozzetto e ti manca un gioco da 5+ carte per chiudere.' };
  }

  player.hand = player.hand.filter((c) => c.id !== cardId);
  state.scarti.push(card);

  if (wouldEmptyHand && puoPrenderePozzetto) {
    // pozzetto preso CON LO SCARTO: la mano riparte, ma il turno finisce qui
    player.hand = player.pozzetto;
    player.pozzetto = [];
    player.pozzettoTaken = true;
    fireAbilityEvent(player.characters, state.players[opponentIndex(playerIndex)].characters, 'on_pozzetto',
      player.magic, state.players[opponentIndex(playerIndex)].magic,
      player, state.players[opponentIndex(playerIndex)]);
    nextTurn(state, nowMs);
    return { ok: true, pozzettoPreso: true };
  }

  if (wouldEmptyHand) {
    state.status = 'finished';
    state.winner = playerIndex;
    state.winReason = 'chiusura';
    fireAbilityEvent(player.characters, state.players[opponentIndex(playerIndex)].characters, 'on_chiusura',
      player.magic, state.players[opponentIndex(playerIndex)].magic,
      player, state.players[opponentIndex(playerIndex)]);
    return { ok: true, matchEnded: true, winReason: 'chiusura' };
  }

  nextTurn(state, nowMs);
  return { ok: true };
}

// ------------------------------------------------------------
// SCADENZA DEL MINUTO
// Finito il tempo si pesca e si scarta d'ufficio una carta A CASO, e il
// turno passa all'avversario. Il turno deve passare SEMPRE: se lo scarto
// scelto fosse illecito (per esempio l'ultima carta in mano quando non si
// può né prendere il pozzetto né chiudere) si provano le altre, altrimenti
// il tavolo resterebbe fermo per sempre su un giocatore che non risponde.
// ------------------------------------------------------------
export function checkTurnTimeout(state, nowMs) {
  if (state.status !== 'in_progress') return { ok: true, expired: false };
  if (secondsSinceTurnStart(state, nowMs) <= TURN_SECONDS) return { ok: true, expired: false };

  const playerIndex = state.currentPlayerIndex;
  const player = state.players[playerIndex];
  if (!player.hasDrawnThisTurn) actionDraw(state, playerIndex, nowMs);
  if (state.status !== 'in_progress') return { ok: true, expired: true, matchEnded: true };

  let scartata = null;
  if (player.hand.length > 0) {
    // ordine casuale: si scarta una carta qualsiasi, non la più cara
    const mescolate = shuffle(player.hand, state.rng);
    for (const c of mescolate) {
      const r = actionDiscard(state, playerIndex, c.id, nowMs);
      if (r.ok) { scartata = c; break; }
    }
  }
  // Rete di sicurezza: esiste un caso in cui NESSUNO scarto è lecito — una
  // carta sola in mano, pozzetto già preso e nessun gioco da 5+ per
  // chiudere. Senza questa riga il turno non passava e il tavolo restava
  // congelato per sempre su chi non aveva risposto. La carta resta in mano
  // e si tira avanti.
  if (!scartata && state.status === 'in_progress' && state.currentPlayerIndex === playerIndex) {
    nextTurn(state, nowMs);
  }
  return { ok: true, expired: true, scartata, matchEnded: state.status !== 'in_progress' };
}

export function checkVictory(state) {
  if (state.status !== 'finished') return null;
  return { winner: state.winner, reason: state.winReason };
}
