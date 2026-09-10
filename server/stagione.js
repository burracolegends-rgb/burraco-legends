// ============================================================
// BURRACO LEGENDS — IL PASS STAGIONALE
//
// Una traccia di 30 livelli che dura due settimane: si guadagnano
// punti giocando, e ogni livello sblocca un premio. Alla fine delle
// due settimane la stagione si azzera e ne comincia una nuova, con la
// sua tabella di premi — così c'è un motivo per tornare anche a
// stagione finita, non solo mentre è in corso.
//
// PERCHÉ NIENTE LAVORO SCHEDULATO (stessa idea di missioni.js)
// Su Render il servizio può riavviarsi in ogni momento, e un timer non
// sopravviverebbe comunque. La stagione "cambia" da sola: il numero di
// stagione si calcola dalla data, non da un evento che qualcuno deve
// far scattare. Chi gioca il primo giorno della stagione 5 e chi
// gioca l'ultimo vedono lo stesso numero, senza che nessuno abbia
// dovuto "chiudere" la 4.
//
// SOLO CHI È REGISTRATO ACCUMULA PUNTI — stessa regola della Missione
// del giorno e del livello ranked: un ospite sparisce al primo cambio
// di dispositivo, e un progresso che sparisce con lui non è un
// progresso, è tempo perso. Chi non è registrato vede comunque la
// tabella dei premi (per sapere cosa si perde), ma resta sempre a
// punti zero.
//
// OGNI PARTITA CHE IL SERVER VEDE FINIRE CONTA — non solo quelle da
// classifica come per il livello ranked (server/livelli.js): qui non
// c'è nessun rating da proteggere dal boosting fra amici, solo un
// progresso che cresce giocando. "Sfida uno sconosciuto", "Gioca con
// un amico" e la Missione del giorno passano tutte da qui
// (registraPartitaFinita, più sotto, si aggancia a /api/mossa).
//
// "GIOCA CONTRO IL PC" IN LOCALE NON CONTA, ED È UNA SCELTA. Quella
// modalità gira tutta dentro il telefono apposta (funziona anche
// offline): il server non la vede mai finire, quindi non ha modo di
// sapere — in modo che non si possa falsificare — se è stata vinta o
// persa. Farla contare vorrebbe dire fidarsi di un numero mandato dal
// browser, esattamente il problema che la Missione del giorno risolve
// già giocando su un tavolo vero lato server (vedi apriControBot in
// stanze.js). Chi vuole punti stagione gioca contro un avversario
// vero, o la Missione — il PC in locale resta la modalità veloce e
// senza rischio per imparare, non quella che fa progredire il pass.
// ============================================================
import { giornoDi } from './missioni.js';

// Il lunedì della settimana in cui è nato questo modulo: non ha altro
// significato, serve solo perché tutti calcolino lo stesso numero di
// stagione dalla stessa data, ovunque giri il server — e perché la
// prima stagione vera si chiami "Stagione 1", non un numero già alto.
const EPOCA_MS = Date.parse('2026-09-07T00:00:00+02:00');
const GIORNO_MS = 24 * 60 * 60 * 1000;

export const DURATA_STAGIONE_GIORNI = 14;
export const LIVELLI_TOTALI = 30;
export const PUNTI_PER_LIVELLO = 100;

export const PUNTI_PARTITA = 10;          // per ogni partita giocata fino alla fine, vinta o persa
export const PUNTI_VITTORIA_BONUS = 15;   // in più, solo a chi vince (quindi vittoria = 25, sconfitta = 10)
export const PUNTI_ACCESSO_GIORNALIERO = 5;
export const PUNTI_MISSIONE_BONUS = 20;   // in più, solo per le partite della Missione del giorno

// ------------------------------------------------------------
// LA TABELLA DELLA STAGIONE 1
//
// Le skin del tavolo (tavolo-blu, tavolo-circolo, tavolo-bordeaux) sono
// CSS già scritte — arrivate da Burraco Pulito insieme al resto del
// foglio di stile — mai collegate a nessuna interfaccia: qui diventano
// i tre traguardi principali del pass (10/20/30), il resto sono
// sharkini e pacchetti a scalare.
//
// UNA STAGIONE NON DEFINITA RIUSA L'ULTIMA TABELLA SCRITTA (vedi
// tabellaPremi più sotto): il sistema non si rompe mai in attesa che
// qualcuno scriva la tabella della prossima stagione, semplicemente si
// ripete finché non se ne aggiunge una nuova.
// ------------------------------------------------------------
const PREMI_STAGIONE_1 = {
  2:  { tipo: 'sharkini', quanto: 300 },
  3:  { tipo: 'pacchetto', carte: 1, cartaTipo: 'eroe' },
  4:  { tipo: 'sharkini', quanto: 300 },
  5:  { tipo: 'pacchetto', carte: 1, cartaTipo: 'magia' },
  6:  { tipo: 'sharkini', quanto: 400 },
  7:  { tipo: 'pacchetto', carte: 3, cartaTipo: 'eroe' },
  8:  { tipo: 'sharkini', quanto: 400 },
  9:  { tipo: 'sharkini', quanto: 500 },
  10: { tipo: 'skin-tavolo', skin: 'blu', nome: 'Blu notte' },
  11: { tipo: 'pacchetto', carte: 1, cartaTipo: 'eroe' },
  12: { tipo: 'sharkini', quanto: 500 },
  13: { tipo: 'pacchetto', carte: 1, cartaTipo: 'magia' },
  14: { tipo: 'sharkini', quanto: 600 },
  15: { tipo: 'pacchetto', carte: 5, cartaTipo: 'eroe' },
  16: { tipo: 'sharkini', quanto: 600 },
  17: { tipo: 'pacchetto', carte: 3, cartaTipo: 'magia' },
  18: { tipo: 'sharkini', quanto: 700 },
  19: { tipo: 'sharkini', quanto: 700 },
  20: { tipo: 'skin-tavolo', skin: 'circolo', nome: 'Verde da circolo' },
  21: { tipo: 'pacchetto', carte: 3, cartaTipo: 'eroe' },
  22: { tipo: 'sharkini', quanto: 800 },
  23: { tipo: 'pacchetto', carte: 1, cartaTipo: 'magia' },
  24: { tipo: 'sharkini', quanto: 800 },
  25: { tipo: 'pacchetto', carte: 10, cartaTipo: 'eroe' },
  26: { tipo: 'sharkini', quanto: 900 },
  27: { tipo: 'pacchetto', carte: 3, cartaTipo: 'magia' },
  28: { tipo: 'sharkini', quanto: 900 },
  29: { tipo: 'pacchetto', carte: 5, cartaTipo: 'magia' },
  30: { tipo: 'skin-tavolo', skin: 'bordeaux', nome: 'Bordeaux', extra: { tipo: 'sharkini', quanto: 2000 } }
};

const STAGIONI = { 1: PREMI_STAGIONE_1 };

export function creaStagione({ archivio, stanze, anagrafe, eRegistrato, orologio = Date.now }) {
  if (!archivio) throw new Error('Il pass stagionale ha bisogno di un magazzino.');
  if (!stanze) throw new Error('Il pass stagionale ha bisogno del registro delle stanze.');
  if (!anagrafe) throw new Error('Il pass stagionale ha bisogno dell\'anagrafe, per consegnare i premi.');
  if (typeof eRegistrato !== 'function') {
    throw new Error('Il pass stagionale ha bisogno di sapere chi è registrato, per decidere chi accumula punti.');
  }

  function numeroStagione(adesso) {
    return Math.floor((adesso - EPOCA_MS) / (DURATA_STAGIONE_GIORNI * GIORNO_MS)) + 1;
  }
  function confiniStagione(numero) {
    const inizio = EPOCA_MS + (numero - 1) * DURATA_STAGIONE_GIORNI * GIORNO_MS;
    return { inizio, fine: inizio + DURATA_STAGIONE_GIORNI * GIORNO_MS };
  }
  // La stagione più recente per cui esiste davvero una tabella scritta
  // a mano: numeroStagione() può restituire un numero più alto (il
  // tempo continua a passare anche senza che nessuno scriva la
  // prossima tabella), e in quel caso si ripiega su questa.
  function tabellaPremi(numero) {
    if (STAGIONI[numero]) return STAGIONI[numero];
    const ultima = Math.max(...Object.keys(STAGIONI).map(Number));
    return STAGIONI[ultima];
  }

  function livelloDaPunti(punti) {
    return Math.min(LIVELLI_TOTALI, 1 + Math.floor(Math.max(0, punti) / PUNTI_PER_LIVELLO));
  }

  const chiaveProgresso = (numero, gettone) => 'stagione:' + numero + ':' + gettone;

  async function progressoGrezzo(numero, gettone) {
    const p = await archivio.leggi(chiaveProgresso(numero, gettone));
    // livelloRiscosso parte da 1, non da 0: il livello 1 è il punto di
    // partenza di tutti, non un traguardo — il primo premio vero sta al
    // livello 2 (vedi PREMI_STAGIONE_1).
    return p || { punti: 0, livelloRiscosso: 1, ultimoAccessoGiorno: null };
  }

  async function aggiungiPunti(gettone, quanti, adesso) {
    const numero = numeroStagione(adesso);
    const p = await progressoGrezzo(numero, gettone);
    p.punti += quanti;
    await archivio.scrivi(chiaveProgresso(numero, gettone), p);
  }

  // ------------------------------------------------------------
  // "SEI ENTRATO OGGI" — chiamata da progressoDi() ogni volta che
  // qualcuno guarda il proprio pass: non serve un tasto apposta, il
  // solo aprire la pagina vale come esserci. giornoDi() viene da
  // missioni.js: stesso identico fuso orario (Europe/Rome), stessa
  // stringa 'YYYY-MM-DD' — non ha senso avere due modi diversi di
  // dire "che giorno è" nello stesso programma.
  // ------------------------------------------------------------
  async function accessoGiornaliero(gettone, adesso) {
    const numero = numeroStagione(adesso);
    const p = await progressoGrezzo(numero, gettone);
    const oggi = giornoDi(adesso);
    if (p.ultimoAccessoGiorno === oggi) return;   // già dato oggi
    p.punti += PUNTI_ACCESSO_GIORNALIERO;
    p.ultimoAccessoGiorno = oggi;
    await archivio.scrivi(chiaveProgresso(numero, gettone), p);
  }

  async function consegnaPremio(gettone, premio) {
    if (premio.tipo === 'sharkini') await anagrafe.regalaSharkini(gettone, premio.quanto);
    else if (premio.tipo === 'pacchetto') await anagrafe.regalaPacchetto(gettone, premio.carte, premio.cartaTipo);
    else if (premio.tipo === 'skin-tavolo') await anagrafe.sbloccaSkinTavolo(gettone, premio.skin);
    // Un premio può portarsene dietro un secondo (vedi il livello 30
    // della stagione 1: la skin più uno sharkini extra) — generico,
    // non solo per le skin, così una futura tabella può usarlo per
    // qualunque combinazione senza inventare un terzo campo.
    if (premio.extra) await consegnaPremio(gettone, premio.extra);
  }

  // ------------------------------------------------------------
  // DÀ TUTTI I PREMI ANCORA NON RITIRATI, in ordine, dal livello
  // successivo all'ultimo consegnato fino a quello attuale — non solo
  // l'ultimo: chi guadagna tre livelli in un colpo solo (una serie di
  // vittorie) deve ricevere tutti e tre i premi, non solo l'ultimo.
  //
  // UN LIMITE ACCETTATO, DETTO CHIARO: se qualcuno sale di livello
  // proprio nelle ultime ore di una stagione e non riapre il gioco
  // prima che scatti quella nuova, quei premi restano nella tabella
  // della stagione vecchia — la chiave in cui erano scritti non viene
  // più guardata da nessuno, perché numeroStagione() ormai punta alla
  // stagione dopo. Meglio un limite raro e onesto (si perde qualche
  // premio in un caso limite) che una macchina di recupero fra
  // stagioni per un evento che capita a pochissimi.
  // ------------------------------------------------------------
  async function riscuotiPremi(gettone, adesso) {
    const numero = numeroStagione(adesso);
    const p = await progressoGrezzo(numero, gettone);
    const livelloAttuale = livelloDaPunti(p.punti);
    const tabella = tabellaPremi(numero);
    const consegnati = [];
    for (let l = p.livelloRiscosso + 1; l <= livelloAttuale; l++) {
      const premio = tabella[l];
      if (!premio) continue;
      await consegnaPremio(gettone, premio);
      consegnati.push({ livello: l, premio });
    }
    if (livelloAttuale > p.livelloRiscosso) {
      p.livelloRiscosso = livelloAttuale;
      await archivio.scrivi(chiaveProgresso(numero, gettone), p);
    }
    return consegnati;
  }

  // ------------------------------------------------------------
  // DOPO OGNI MOSSA — chiamata da server.js subito dopo stanze.muovi(),
  // esattamente come missioni.registraSeFinita() e livelli.registraSeFinita().
  // ------------------------------------------------------------
  async function registraPartitaFinita(codice) {
    const stanza = stanze.stanza(codice);
    if (!stanza || !stanza.partita || stanza.partita.status === 'in_progress') return null;
    if (stanza.stagioneRegistrata) return null;   // già contata: una partita vale una volta sola
    stanza.stagioneRegistrata = true;

    const adesso = orologio();
    const vincitore = stanza.partita.winner;
    for (let io = 0; io < 2; io++) {
      const posto = stanza.posti[io];
      if (!posto || !posto.gettone) continue;          // il bot, per esempio: non ha un gettone
      if (!(await eRegistrato(posto.gettone))) continue;
      let punti = PUNTI_PARTITA;
      if (vincitore === io) punti += PUNTI_VITTORIA_BONUS;
      if (stanza.eMissione) punti += PUNTI_MISSIONE_BONUS;
      await aggiungiPunti(posto.gettone, punti, adesso);
    }
    return true;
  }

  // ------------------------------------------------------------
  // LA VISTA COMPLETA — quello che vede il client. Un ospite vede la
  // tabella (sa cosa perde) ma resta sempre a punti zero: non accumula,
  // niente da riscuotere.
  // ------------------------------------------------------------
  async function progressoDi(gettone, adesso = orologio()) {
    const numero = numeroStagione(adesso);
    const { fine } = confiniStagione(numero);
    const giorniRimasti = Math.max(0, Math.ceil((fine - adesso) / GIORNO_MS));
    const tabella = tabellaPremi(numero);

    if (!gettone || !(await eRegistrato(gettone))) {
      return {
        ok: true, registrato: false, numero, giorniRimasti,
        punti: 0, livello: 1, livelloMax: LIVELLI_TOTALI, puntiPerLivello: PUNTI_PER_LIVELLO,
        tabella, premiAppenaSbloccati: []
      };
    }

    await accessoGiornaliero(gettone, adesso);
    const premiAppenaSbloccati = await riscuotiPremi(gettone, adesso);
    const p = await progressoGrezzo(numero, gettone);

    return {
      ok: true, registrato: true, numero, giorniRimasti,
      punti: p.punti, livello: livelloDaPunti(p.punti), livelloMax: LIVELLI_TOTALI, puntiPerLivello: PUNTI_PER_LIVELLO,
      tabella, premiAppenaSbloccati
    };
  }

  return { progressoDi, registraPartitaFinita, numeroStagione, livelloDaPunti };
}
