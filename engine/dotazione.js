// ============================================================
// BURRACO LEGENDS — CON COSA SI COMINCIA
//
// PERCHÉ ESISTE QUESTO FILE
// Da quando le Carte Magiche si consumano — una carta, un utilizzo, e
// poi sparisce anche dalla collezione — non si può più scendere in
// campo con carte che non si possiedono. Ma allora chi arriva adesso,
// senza aver mai aperto un pacchetto, non avrebbe niente da giocare.
//
// Prima il buco lo tappava la "squadra di prova": chi non aveva un
// mazzo valido ne riceveva una in regalo, Carte Magiche comprese. Con
// le carte consumabili quello sarebbe diventato un rubinetto aperto —
// bastava non scegliere un mazzo per avere tre carte magiche gratis a
// ogni partita, per sempre.
//
// Quindi il regalo si fa UNA VOLTA SOLA, all'inizio, e finisce nella
// collezione vera: da lì in poi valgono le regole di tutti — le carte
// si consumano e si ricomprano.
//
// QUANTE COPIE
// Una partita se ne porta al massimo tre. Cinque copie a testa di tre
// carte diverse fanno una quindicina di utilizzi, cioè cinque partite
// giocate a carte piene prima di restare a secco: abbastanza per
// capire il gioco senza dover comprare subito. È il numero da girare
// per primo se il ritmo non convince — sta tutto qui.
//
// Gli id qui sotto devono esistere davvero in /cards/data: se qualcuno
// li rinomina, `engine/carte-lint.test.js` se ne accorge e si ferma.
// Senza quel controllo un id sbagliato regalerebbe silenziosamente
// niente, e il giocatore nuovo si troverebbe la collezione vuota senza
// che nessuno protesti.
// ============================================================

// Un eroe per seme, di rarità bassa: la squadra con cui si impara.
export const EROI_DI_PARTENZA = [
  'personaggio_001',   // ♥
  'personaggio_003',   // ♦
  'personaggio_005',   // ♣
  'personaggio_007'    // ♠
];

// Le Carte Magiche di partenza, e quante copie di ciascuna.
export const COPIE_MAGICHE_DI_PARTENZA = 5;
export const MAGICHE_DI_PARTENZA = [
  'sorpresa_001',      // un colpo diretto: la più semplice da capire
  'trappola_001',      // scatta quando l'avversario pesca
  'trappola_002'       // rimanda indietro parte del danno
];

// La dotazione come la vuole la collezione: idCarta → quante copie.
export function dotazioneIniziale() {
  const collezione = {};
  for (const id of EROI_DI_PARTENZA) collezione[id] = 1;
  for (const id of MAGICHE_DI_PARTENZA) collezione[id] = COPIE_MAGICHE_DI_PARTENZA;
  return collezione;
}

// Quante carte ha in più di quelle regalate all'inizio, cioè quante se
// n'è procurate da sé. Serve a distinguere "non ha niente" da "ha solo
// il regalo di benvenuto": adesso che tutti nascono con delle carte, la
// collezione piena non vuol più dire che ci sia qualcosa da perdere.
export function oltreLaDotazione(collezione) {
  const regalo = dotazioneIniziale();
  let quante = 0;
  for (const [id, copie] of Object.entries(collezione || {})) {
    quante += Math.max(0, copie - (regalo[id] || 0));
  }
  return quante;
}

// Aggiunge la dotazione a una collezione che esiste già, SENZA
// sovrascrivere quello che c'è: chi ha già delle copie se le tiene e
// riceve le sue in più. Serve ai giocatori nati prima che la dotazione
// esistesse — la ricevono al primo accesso, senza perdere niente.
export function aggiungiDotazione(collezione) {
  const dentro = { ...(collezione || {}) };
  const regalo = dotazioneIniziale();
  for (const [id, quante] of Object.entries(regalo)) {
    dentro[id] = (dentro[id] || 0) + quante;
  }
  return dentro;
}
