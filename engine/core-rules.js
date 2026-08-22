// ============================================================
// BURRACO LEGENDS — motore di regole "pure" (mazzo, calate, punti)
//
// Origine: porting da Burraco Pulito (arbitro-PARTE-1.ts), funzioni di
// regole senza alcuna dipendenza da Supabase/DOM/rete. Copiate e adattate
// per questo progetto separato — nessun import dal progetto originale.
//
// Cosa NON c'è qui (va scritto per Battle): personaggi (VITA/ATT/abilità),
// formula danno, Carte Magiche/effect, turno/timer, condizione KO.
// La formula danno di Battle usa `meldLengthTier()` sotto per sapere in che
// fascia (5 / 6 / 7+) ricade una calata.
// ============================================================

export const SUITS = ['♥', '♦', '♣', '♠'];

let cardIdCounter = 0;

export function makeCard(suit, value, isJolly = false, jollyColor = null) {
  return {
    id: 'c' + (cardIdCounter++),
    suit: isJolly ? null : suit,
    value: isJolly ? 0 : value,
    isJolly,
    isPinella: (!isJolly && value === 2),
    jollyColor
  };
}

// Mazzo classico da Burraco: 2 mazzi da 52 + 4 jolly (invariato da Burraco Pulito)
// Il mazzo di una partita ha identificativi suoi, da "k0" a "k107",
// sempre gli stessi e sempre nello stesso ordine di generazione.
//
// Prima usava il contatore globale, e quindi gli identificativi
// dipendevano da quante partite erano già state create nello stesso
// processo. Sul server, dove le partite sono tante e i registri delle
// mosse vanno riletti dopo, quel dettaglio rendeva impossibile
// rigiocare una partita: il registro parlava di carte che nella
// ripetizione avevano un altro nome. Le carte create a mano (nei test,
// e ovunque serva una carta sciolta) continuano a usare il contatore
// globale, così non si pestano i piedi con quelle del mazzo.
export function createFullDeck() {
  const deck = [];
  let n = 0;
  const carta = (...args) => {
    const c = makeCard(...args);
    // 'k' e non 'm': le calate usano già 'm' e le carte costruite a mano
    // usano 'c'. Con tre prefissi distinti nessun identificativo può
    // essere scambiato per un altro — cosa che è già successa una volta,
    // e il controllo delle fughe segnalava carte trapelate che non lo erano.
    c.id = 'k' + (n++);
    return c;
  };
  for (let d = 0; d < 2; d++) {
    for (const s of SUITS) {
      for (let v = 1; v <= 13; v++) { deck.push(carta(s, v)); }
    }
    deck.push(carta(null, 0, true, 'red'));
    deck.push(carta(null, 0, true, 'black'));
  }
  return deck;
}

// Il generatore casuale si passa da fuori. Con Math.random di default
// resta comodo da chiamare, ma chi vuole una partita ripetibile — il
// server, i test — passa il suo e ottiene sempre lo stesso mazzo.
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = interoCasuale(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Un intero da 0 a n-1. Sembra una scemenza, ma serve: Math.random non
// restituisce mai 1, un generatore scritto da noi sì — e con l'1 il
// mescolamento pescava una posizione fuori dal mazzo, lasciando buchi
// al posto delle carte. Meglio che il caso passi tutto da qui.
export function interoCasuale(rng, n) {
  if (n <= 0) return 0;
  const v = Math.floor((typeof rng === 'function' ? rng() : Math.random()) * n);
  return v < 0 ? 0 : (v >= n ? n - 1 : v);
}

export function isWildcard(c) { return c.isJolly || c.isPinella; }

const VALUE_LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
export function valueLabel(v) { return VALUE_LABELS[v] || String(v); }
export function cardLabel(c) { return c.isJolly ? 'JOLLY' : valueLabel(c.value) + c.suit; }

// Punti carta — valori standard Burraco, identici a quelli già in produzione
// su Burraco Pulito. Risolve il punto aperto della spec "valori punti esatti
// per carta": 3-7=5, 8-K=10, Asso=15, pinella(2)=20, jolly=30.
export function cardPointValue(c) {
  if (c.isJolly) return 30;
  if (c.isPinella) return 20;
  if (c.value === 1) return 15; // Asso
  if (c.value >= 8) return 10;  // figure
  return 5;                     // 3-7: valore fisso
}

export function meldPointValue(cards) {
  return cards.reduce((sum, c) => sum + cardPointValue(c), 0);
}

// Tris/gruppo: stesso valore, semi diversi ammessi, massimo una wildcard
export function isValidGroup(cards) {
  if (cards.length < 3) return { ok: false, reason: 'Minimo 3 carte per un gruppo.' };
  const jollyCards = cards.filter((c) => c.isJolly);
  const pinellaCards = cards.filter((c) => c.isPinella);
  const fixedCards = cards.filter((c) => !c.isJolly && !c.isPinella);
  let value;
  if (fixedCards.length > 0) {
    value = fixedCards[0].value;
    if (!fixedCards.every((c) => c.value === value)) return { ok: false, reason: 'Tutte le carte naturali devono avere lo stesso valore.' };
  } else if (pinellaCards.length > 0) {
    value = 2;
    if (jollyCards.length > 0) return { ok: false, reason: 'Un tris di 2 naturali non può contenere Jolly: deve essere formato solo da carte 2 vere.' };
  } else {
    return { ok: false, reason: 'Non può essere un gruppo di soli Jolly.' };
  }
  const wildcardCount = jollyCards.length + pinellaCards.filter((p) => value !== 2).length;
  if (wildcardCount > 1) return { ok: false, reason: 'Massimo una wildcard per gioco.' };
  const wildcardCard = jollyCards[0] || (value !== 2 ? pinellaCards[0] : null) || null;
  return { ok: true, type: 'group', value, wildcardId: wildcardCard ? wildcardCard.id : null };
}

function tryBuildSequence(naturalCards, totalLength, aceHigh) {
  const vals = naturalCards.map((c) => (aceHigh && c.value === 1 ? 14 : c.value)).sort((a, b) => a - b);
  for (let i = 1; i < vals.length; i++) { if (vals[i] === vals[i - 1]) return null; }
  const minV = vals[0], maxV = vals[vals.length - 1];
  const span = maxV - minV + 1;
  if (span > totalLength) return null;
  const missing = totalLength - vals.length;
  const gapsNeeded = span - vals.length;
  if (gapsNeeded > missing) return null;
  const lowBound = aceHigh ? 2 : 1, highBound = aceHigh ? 14 : 13;
  if (minV < lowBound || maxV > highBound) return null;
  return { ok: true, order: { min: minV, max: maxV, aceHigh } };
}

// Scala: stesso seme, consecutive, massimo una wildcard (jolly o pinella "fuori posto")
export function isValidSequence(cards) {
  if (cards.length < 3) return { ok: false, reason: 'Minimo 3 carte per una sequenza.' };
  const jollyCards = cards.filter((c) => c.isJolly);
  const pinellaCards = cards.filter((c) => c.isPinella);
  const otherCards = cards.filter((c) => !c.isJolly && !c.isPinella);
  if (otherCards.length > 0) {
    const suit0 = otherCards[0].suit;
    if (!otherCards.every((c) => c.suit === suit0)) return { ok: false, reason: 'Tutte le carte naturali devono avere lo stesso seme.' };
  }
  const targetSuit = otherCards.length > 0 ? otherCards[0].suit : (pinellaCards[0] ? pinellaCards[0].suit : null);
  if (targetSuit === null) return { ok: false, reason: 'Non può essere una sequenza di soli Jolly.' };
  const forcedWildcardPinelle = pinellaCards.filter((p) => p.suit !== targetSuit);
  const flexPinelle = pinellaCards.filter((p) => p.suit === targetSuit);
  const forcedWildcardCount = jollyCards.length + forcedWildcardPinelle.length;
  if (forcedWildcardCount > 1) return { ok: false, reason: 'Massimo una wildcard per gioco.' };
  const optionsToTry = [flexPinelle];
  if (forcedWildcardCount === 0) {
    for (let i = 0; i < flexPinelle.length; i++) optionsToTry.push(flexPinelle.filter((_, idx) => idx !== i));
  }
  for (const naturalFlexSet of optionsToTry) {
    const naturalCards = [...otherCards, ...naturalFlexSet];
    if (naturalCards.length === 0) continue;
    if (cards.length - naturalCards.length > 1) continue;
    const attempts = [tryBuildSequence(naturalCards, cards.length, false), tryBuildSequence(naturalCards, cards.length, true)];
    const valid = attempts.find((a) => a && a.ok);
    if (valid) {
      const excludedFlexPinella = flexPinelle.find((p) => !naturalFlexSet.includes(p));
      const wildcardCard = jollyCards[0] || forcedWildcardPinelle[0] || excludedFlexPinella || null;
      return { ok: true, type: 'sequence', suit: targetSuit, order: valid.order, wildcardId: wildcardCard ? wildcardCard.id : null };
    }
  }
  return { ok: false, reason: 'Le carte naturali non formano una sequenza consecutiva valida.' };
}

// Valida una calata come gruppo o sequenza, qualunque cosa sia (usato per capire
// se un insieme di carte è calabile prima di applicare la formula danno)
export function validateMeld(cards) {
  const asGroup = isValidGroup(cards);
  if (asGroup.ok) return asGroup;
  const asSequence = isValidSequence(cards);
  if (asSequence.ok) return asSequence;
  return { ok: false, reason: asSequence.reason || asGroup.reason };
}

// ------------------------------------------------------------
// Specifico per Battle: a quale fascia della tabella danni appartiene una
// calata, in base al numero di carte. Non richiede "burraco puro" (senza
// jolly) per la fascia 7+: qualunque combinazione valida da 7+ carte conta,
// come da spec §4.
//   5 carte  → tier 5,  moltiplicatore ×1,   bersaglio singolo
//   6 carte  → tier 6,  moltiplicatore ×1.3, bersaglio singolo
//   7+ carte → tier 7,  moltiplicatore ×1.6, bersaglio AoE (tutti e 4)
// ------------------------------------------------------------
// `aoePercent`: ONDATA D'URTO (regola aggiunta dal committente).
// Oltre al danno delle carte calate, una scala lunga colpisce TUTTI E 4 i
// personaggi avversari per una percentuale dell'ATT del proprio eroe —
// quello dello stesso seme della calata. Non dipende dai punti delle carte:
// è la potenza dell'eroe che si scarica sul campo.
//   5 carte → 10%   ·   6 carte → 20%   ·   7+ carte → 35%
// Anche questo colpo passa per la varianza 0,95-1,05.
export const DAMAGE_TIERS = {
  // Le scale da 3-4 carte infliggono danno anche loro, senza bonus di
  // lunghezza. La tabella della spec §4 partiva da 5 carte e lasciava le
  // scale corte a zero danno: incoerente con i gruppi, dove un tris da 3
  // carte danneggia (regola confermata dal committente). Il moltiplicatore
  // è ×1, lo stesso delle 5 carte: una scala più lunga fa comunque più
  // male perché somma più punti.
  3: { multiplier: 1,   target: 'singolo', aoePercent: 0    },
  5: { multiplier: 1,   target: 'singolo', aoePercent: 0.10 },
  6: { multiplier: 1.3, target: 'singolo', aoePercent: 0.20 },
  7: { multiplier: 1.6, target: 'aoe',     aoePercent: 0.35 }
};

// Accetta l'elenco delle carte oppure direttamente un numero: agli agganci
// serve la fascia della lunghezza RAGGIUNTA dal gioco, non di un mazzetto.
export function meldLengthTier(cards) {
  const n = (typeof cards === 'number') ? cards : cards.length;
  if (n >= 7) return 7;
  if (n === 6) return 6;
  if (n === 5) return 5;
  if (n >= 3) return 3;   // scale corte: danno pieno sui punti, nessun bonus
  return null;            // sotto le 3 carte non esiste una calata valida
}

// Calcolo del danno di una calata, formula spec §4:
// Danno = (somma punti carte) × (ATT/100) × moltiplicatore lunghezza
// Non gestisce qui la ridistribuzione su bersaglio già a 0 PV: quella
// dipende dallo stato dei personaggi avversari, va nel motore di partita Battle.
export function computeMeldDamage(cards, att) {
  const tier = meldLengthTier(cards);
  if (tier === null) return { damage: 0, tier: null, target: null };
  const { multiplier, target } = DAMAGE_TIERS[tier];
  const points = meldPointValue(cards);
  const damage = points * (att / 100) * multiplier;
  return { damage, tier, target, points, multiplier };
}

// Moltiplicatore per lunghezza di un GRUPPO (tris che cresce oltre 3/4
// carte). Confermato dal committente: 3-4 carte nessun bonus, 5 carte
// +10%, 6 carte +20%, 7+ carte +35%. Scala diversa da quella delle
// sequenze (spec §4: 5→×1, 6→×1.3, 7+→×1.6) perché un gruppo da 5+ carte
// dello stesso valore è molto più raro da costruire (in un mazzo doppio
// un valore esiste al massimo 8 volte, 2 per seme).
export function groupLengthMultiplier(cardCount) {
  if (cardCount >= 7) return 1.35;
  if (cardCount === 6) return 1.20;
  if (cardCount === 5) return 1.10;
  return 1.0; // 3 o 4 carte: nessun bonus
}

// ------------------------------------------------------------
// Danno di un GRUPPO (tris di stesso valore, semi diversi per costruzione
// in un mazzo doppio — vedi note in partita.js). Regola confermata:
// ogni singola carta infligge danno al personaggio del PROPRIO seme, in
// base al punteggio di quella carta × (ATT del personaggio attaccante
// dello stesso seme / 100) × moltiplicatore di lunghezza del gruppo (sopra).
// Esempio dalla spec: tris di 3 (cuori, picche, fiori) di carte da 5 punti
// ciascuna, ATT 100 → 5 punti tolti a ciascuno dei 3 semi colpiti (nessun
// bonus perché sono solo 3 carte).
// Un jolly nel gruppo non ha seme: non infligge danno (assunzione, il
// jolly non può "puntare" a nessun personaggio). Una pinella usata come
// wildcard mantiene il proprio seme stampato e infligge danno normalmente.
//
// attackerCharacters: { '♥': {att}, '♦': {att}, '♣': {att}, '♠': {att} }
// del giocatore che cala. Ritorna { seme: danno } solo per i semi colpiti.
// ------------------------------------------------------------
// lunghezzaGioco: quando si AGGANCIANO carte a un gioco già in tavola, il
// bonus di lunghezza si calcola sulla lunghezza raggiunta dal gioco intero,
// non su quante carte si stanno aggiungendo. Se non passato vale
// cards.length, cioè il caso normale della calata nuova.
// Se il MIO eroe di quel seme è caduto, le carte di quel seme picchiano
// all'80%: l'eroe è fuori combattimento e il suo seme si indebolisce.
export const PENALITA_EROE_CADUTO = 0.80;
function penalitaEroe(attackerCharacters, suit) {
  const e = attackerCharacters[suit];
  return (e && e.pv <= 0) ? PENALITA_EROE_CADUTO : 1;
}

export function groupDamageBySuit(cards, attackerCharacters, lunghezzaGioco) {
  const multiplier = groupLengthMultiplier(lunghezzaGioco || cards.length);
  const bySuit = {};
  for (const c of cards) {
    if (c.isJolly) continue; // il jolly non ha seme: vedi groupJollyDamage
    const suit = c.suit;
    const att = (attackerCharacters[suit] && attackerCharacters[suit].att) || 0;
    const dmg = cardPointValue(c) * (att / 100) * multiplier * penalitaEroe(attackerCharacters, suit);
    bySuit[suit] = (bySuit[suit] || 0) + dmg;
  }
  return bySuit;
}

// IL JOLLY IN UN GRUPPO (regola aggiunta dal committente).
// Il jolly non appartiene a nessun seme, quindi non ha un eroe "suo" né un
// bersaglio naturale. Prima veniva semplicemente saltato e non infliggeva
// nulla. Ora conta per i suoi 30 punti, moltiplicati per l'ATT del TUO
// eroe più forte (la spada più alta fra i tuoi quattro), e colpisce un
// personaggio avversario a caso — la scelta del bersaglio la fa il motore
// di partita, che sa chi è ancora vivo.
export function groupJollyDamage(cards, attackerCharacters, lunghezzaGioco) {
  const jolly = cards.filter((c) => c.isJolly);
  if (jolly.length === 0) return 0;
  const multiplier = groupLengthMultiplier(lunghezzaGioco || cards.length);
  const attMigliore = SUITS.reduce((max, s) => {
    const a = (attackerCharacters[s] && attackerCharacters[s].att) || 0;
    return a > max ? a : max;
  }, 0);
  return jolly.reduce((tot, c) => tot + cardPointValue(c), 0) * (attMigliore / 100) * multiplier;
}

// Qual è l'eroe con la spada più alta: serve al tavolo per dire chi ha
// scagliato il colpo del jolly.
export function semeAttaccoMigliore(attackerCharacters) {
  return SUITS.reduce((best, s) => {
    const a = (attackerCharacters[s] && attackerCharacters[s].att) || 0;
    const b = (attackerCharacters[best] && attackerCharacters[best].att) || 0;
    return a > b ? s : best;
  }, SUITS[0]);
}

// ------------------------------------------------------------
// CHI COMINCIA — IL SORTEGGIO
//
// Prima cominciava sempre chi apriva il tavolo (`currentPlayerIndex: 0`
// e basta): un vantaggio regalato a chi mandava per primo il codice su
// WhatsApp. Adesso il mazzo pesca una carta a testa e decide.
//
// COME SI DECIDE
// Vince la carta più alta. L'Asso vale più del Re — è la carta più alta
// del mazzo, non la più bassa, anche se nelle scale può fare da 1 — e un
// jolly batte tutto. A parità di valore decide il SEME, nell'ordine
// stabilito dal committente: ♥ più alto, poi ♦, poi ♣, ♠ più basso.
// (È esattamente l'ordine in cui SUITS è già scritto qui sopra.)
//
// LE CARTE RESTANO NEL MAZZO
// Non si tolgono e non si scartano: si guardano e basta, prendendole dal
// FONDO del tallone. Così il sorteggio non consuma carte, non tocca il
// generatore casuale e non cambia di una virgola la partita che segue —
// pescare davvero e poi rimettere dentro darebbe lo stesso risultato,
// con più giri a vuoto.
//
// DUE JOLLY INSIEME non si possono confrontare: il jolly non ha seme, e
// il pareggio resterebbe tale. In quel caso si guarda la coppia
// successiva, che è il modo in cui a un tavolo vero si ripesca.
// ------------------------------------------------------------

// Quanto vale una carta SOLO per il sorteggio: jolly sopra tutti, poi
// l'Asso, poi Re, Donna, Fante e gli altri per numero.
export function rangoSorteggio(c) {
  if (!c) return -1;
  if (c.isJolly) return 15;
  return c.value === 1 ? 14 : c.value;   // l'Asso è la più alta, non la più bassa
}

// Positivo se vince a, negativo se vince b, zero se non si può decidere.
export function confrontaPerSorteggio(a, b) {
  const differenza = rangoSorteggio(a) - rangoSorteggio(b);
  if (differenza !== 0) return differenza;
  // stesso valore: decide il seme. SUITS è già in ordine dal più alto
  // al più basso, quindi l'indice più BASSO vince.
  const posA = SUITS.indexOf(a && a.suit);
  const posB = SUITS.indexOf(b && b.suit);
  if (posA === -1 || posB === -1) return 0;   // due jolly: non si decide
  return posB - posA;
}

export function sorteggioPrimoTurno(tallone) {
  const scartate = [];   // le coppie che non hanno deciso: servono all'animazione
  for (let i = tallone.length - 1; i >= 1; i -= 2) {
    const mia = tallone[i], sua = tallone[i - 1];
    const esito = confrontaPerSorteggio(mia, sua);
    if (esito !== 0) {
      return {
        carte: [mia, sua],
        vincitore: esito > 0 ? 0 : 1,
        pareggi: scartate
      };
    }
    scartate.push([mia, sua]);
  }
  // Un mazzo che non decide mai non esiste, ma se esistesse la partita
  // deve cominciare lo stesso invece di fermarsi qui.
  return { carte: [], vincitore: 0, pareggi: scartate };
}

// ------------------------------------------------------------
// DIFESA
// Stat fissa della carta personaggio (0-100, in genere 0-30): riduce in
// percentuale QUALSIASI danno in arrivo, da qualunque fonte (calate,
// abilità speciali, Carte Magiche, danno riflesso) — un punto unico, così
// non c'è un tipo di colpo che la ignora per dimenticanza.
// Si somma a `difesaPercent`, il bonus TEMPORANEO che l'effetto
// `boost_difesa` mette sul personaggio (spec §6): stessa unità, stesso
// tetto. Superato il tetto un personaggio sarebbe di fatto invulnerabile,
// il che rompe la partita più di quanto la protegga.
// ------------------------------------------------------------
export const DIFESA_RIDUZIONE_MASSIMA = 80; // %

// E QUANDO LA DIFESA VA SOTTO ZERO?
// Prima si fermava a zero: una difesa "ridotta" non poteva fare altro
// che annullare quella che c'era. Con le carte vere quel pavimento
// rendeva senza effetto sei abilità in un colpo solo — "riduce del 25%
// la difesa di tutti gli avversari" su un personaggio con difesa 1
// voleva dire portarlo da 1% a 0%, cioè un punto percentuale di danno
// in più. Una carta che non fa niente.
//
// Quindi la difesa negativa vale davvero: si incassa PIÙ danno, tanto
// quanto dice il segno meno. È anche la lettura naturale di "ti abbasso
// le difese". Il limite dall'altra parte esiste lo stesso: al massimo
// si arriva a incassare il doppio, non di più.
export const DIFESA_AMPLIFICAZIONE_MASSIMA = 100; // %, cioè danno al massimo raddoppiato

export function riduzioneDifesa(character) {
  if (!character) return 0;
  const base = Number(character.difesa) || 0;
  const bonus = Number(character.difesaPercent) || 0;
  const somma = base + bonus;
  if (somma >= 0) return Math.min(DIFESA_RIDUZIONE_MASSIMA, somma) / 100;
  return Math.max(-DIFESA_AMPLIFICAZIONE_MASSIMA, somma) / 100;
}

// Applica il danno con la difesa già scontata, aggiorna i PV (mai sotto
// zero) e ritorna il danno REALMENTE incassato — quello che si racconta
// al client, non quello lordo calcolato prima della riduzione.
export function infliggiDanno(character, danno) {
  if (!character || !(danno > 0)) return 0;
  const netto = danno * (1 - riduzioneDifesa(character));
  character.pv = Math.max(0, character.pv - netto);
  return netto;
}
