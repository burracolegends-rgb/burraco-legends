// ============================================================
// BURRACO LEGENDS — IL LIVELLO RANKED
//
// Un numero (ELO, la stessa idea degli scacchi) che sale quando vinci
// contro qualcuno forte, scende quando perdi contro qualcuno debole, e
// si muove poco quando il risultato era quello atteso. Non è la somma
// delle partite giocate: è quanto vale, in questo momento, il modo in
// cui giochi.
//
// SOLO "SFIDA UNO SCONOSCIUTO" CONTA (vedi stanze.js: siediti(), che
// segna stanza.daClassifica = true SOLO sulle stanze nate lì). Una
// partita aperta con un codice per un amico non tocca il livello:
// altrimenti due amici d'accordo potrebbero scambiarsi vittorie a
// comando all'infinito, e il numero non direbbe più niente su quanto
// si gioca bene.
//
// SOLO CHI È REGISTRATO ha un livello che resta — stessa regola già
// vista per la Missione del giorno (server/missioni.js): un ospite
// sparisce al primo cambio di dispositivo, e un numero che sparisce
// con lui non è un livello, è un numero a caso. Se in una partita un
// lato è registrato e l'altro no, il lato registrato aggiorna comunque
// il proprio livello — contro un rating neutro (RATING_INIZIALE) per
// l'avversario ospite, che non ne ha uno vero da usare.
//
// IL K-FATTORE NON È SEMPRE LO STESSO (stessa idea di Chess.com e
// Lichess). Tutti partono da RATING_INIZIALE, che è un numero a caso,
// non il livello vero di nessuno: le primissime partite devono
// spostare parecchio, per arrivare in fretta vicino a dove si merita
// davvero di stare. Dopo, lo stesso spostamento grosso farebbe ballare
// un rating che ha già trovato il suo posto per un risultato isolato
// (una serie fortunata, un avversario disconnesso). Si guarda quante
// partite ha già in archivio chi sta per aggiornarsi (kFattoreDi, più
// sotto): sotto PARTITE_ASSESTAMENTO usa K_FATTORE_INIZIALE, il resto
// del tempo K_FATTORE — e i due lati di una stessa partita possono
// benissimo usare un K diverso l'uno dall'altro, se uno dei due è alla
// sua quinta partita e l'altro alla centesima.
// ============================================================

export const RATING_INIZIALE = 1000;
export const K_FATTORE_INIZIALE = 40;
export const K_FATTORE = 16;
export const PARTITE_ASSESTAMENTO = 10;

export function kFattoreDi(partiteGiaFatte) {
  return partiteGiaFatte < PARTITE_ASSESTAMENTO ? K_FATTORE_INIZIALE : K_FATTORE;
}

// Il "Livello" mostrato in home.html non è il rating grezzo (un neofita
// a "Livello 1000" suonerebbe come un veterano): è lo stesso numero,
// compresso su una scala più piccola. La formula è scelta apposta
// perché al rating di partenza (1000, chi non ha ancora giocato una
// ranked) restituisca 15 — lo stesso numero che stava scritto a mano
// in home.html prima di questo modulo: chi non ha ancora giocato vede
// esattamente quello che vedeva prima, cambia solo per chi gioca
// davvero.
export function livelloDaRating(rating) {
  return Math.max(1, Math.round((rating - 400) / 40));
}

function atteso(ratingMio, ratingSuo) {
  return 1 / (1 + Math.pow(10, (ratingSuo - ratingMio) / 400));
}

export function creaLivelli({ archivio, stanze, eRegistrato, orologio = Date.now }) {
  if (!archivio) throw new Error('Il livello ranked ha bisogno di un magazzino.');
  if (!stanze) throw new Error('Il livello ranked ha bisogno del registro delle stanze.');
  if (typeof eRegistrato !== 'function') {
    throw new Error('Il livello ranked ha bisogno di sapere chi è registrato, per decidere di chi aggiornare il rating.');
  }

  const chiaveLivello = (gettone) => 'livello:' + gettone;

  const LIVELLO_VUOTO = Object.freeze({ rating: RATING_INIZIALE, partite: 0, vittorie: 0, sconfitte: 0, pareggi: 0 });

  // ------------------------------------------------------------
  // "CHE LIVELLO HO?" — per la home e per chiunque altro voglia
  // mostrarlo. Non serve essere registrati per leggerlo: chi non ha mai
  // giocato una ranked vede semplicemente il rating di partenza, uguale
  // per tutti, che è la stessa cosa onesta di "non hai ancora un
  // livello vero".
  // ------------------------------------------------------------
  async function livelloDi(gettone) {
    if (!gettone) return { ...LIVELLO_VUOTO };
    const l = await archivio.leggi(chiaveLivello(gettone));
    return l || { ...LIVELLO_VUOTO };
  }

  // ------------------------------------------------------------
  // DOPO OGNI MOSSA — chiamata da server.js subito dopo stanze.muovi(),
  // esattamente come missioni.registraSeFinita(). Se quel codice non è
  // una partita da classifica, o non è ancora finita, o lo era già
  // stata processata, non fa nulla: per la stragrande maggioranza delle
  // mosse (partite fra amici, partite contro il bot, mosse a metà
  // partita) questa funzione costa una sola lettura di Map.
  // ------------------------------------------------------------
  async function registraSeFinita(codice) {
    const stanza = stanze.stanza(codice);
    if (!stanza || !stanza.daClassifica) return null;
    if (!stanza.partita || stanza.partita.status === 'in_progress') return null;
    if (stanza.livelloRegistrato) return null;   // già fatto: una partita si conta una volta sola
    stanza.livelloRegistrato = true;

    const gettoni = [stanza.posti[0] && stanza.posti[0].gettone, stanza.posti[1] && stanza.posti[1].gettone];
    // Senza il gettone di entrambi i lati non c'è un vero avversario con
    // cui calcolare niente — non dovrebbe capitare su una stanza nata
    // da siediti() (che lo chiede sempre), ma meglio non fidarsi.
    if (!gettoni[0] || !gettoni[1]) return null;

    const registrati = [await eRegistrato(gettoni[0]), await eRegistrato(gettoni[1])];
    if (!registrati[0] && !registrati[1]) return null;   // nessuno dei due ha un livello da tenere

    // Le due letture PRIMA di scrivere niente: se si aggiornasse un lato
    // e poi si leggesse il suo nuovo rating per calcolare l'altro, i due
    // aggiornamenti non sarebbero più simmetrici rispetto alla stessa
    // partita — ognuno deve muoversi in base a come stavano le cose
    // PRIMA che la partita finisse, non a metà ricalcolo.
    const prima = [await livelloDi(gettoni[0]), await livelloDi(gettoni[1])];

    const vincitore = stanza.partita.winner;   // 0, 1, o null (pareggio: mazzo esaurito a PV pari)
    const risultati = [];
    for (let io = 0; io < 2; io++) {
      if (!registrati[io]) continue;
      const altro = io === 0 ? 1 : 0;
      const ratingAvversario = registrati[altro] ? prima[altro].rating : RATING_INIZIALE;
      const punteggio = vincitore === null ? 0.5 : (vincitore === io ? 1 : 0);
      const k = kFattoreDi(prima[io].partite);
      const nuovoRating = Math.round(prima[io].rating + k * (punteggio - atteso(prima[io].rating, ratingAvversario)));
      const aggiornato = {
        rating: nuovoRating,
        partite: prima[io].partite + 1,
        vittorie: prima[io].vittorie + (punteggio === 1 ? 1 : 0),
        sconfitte: prima[io].sconfitte + (punteggio === 0 ? 1 : 0),
        pareggi: prima[io].pareggi + (punteggio === 0.5 ? 1 : 0)
      };
      await archivio.scrivi(chiaveLivello(gettoni[io]), aggiornato);
      risultati.push({ gettone: gettoni[io], prima: prima[io].rating, dopo: nuovoRating, quando: orologio() });
    }
    return risultati.length ? risultati : null;
  }

  return { livelloDi, registraSeFinita };
}
