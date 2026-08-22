// ============================================================
// BURRACO LEGENDS — IL MAGAZZINO
//
// Il posto dove il server tiene le cose che devono sopravvivere allo
// spegnimento: chi è ogni giocatore, quanti sharkini ha, quali carte
// possiede, a che punto è la serie di accessi.
//
// PERCHÉ UN'INTERFACCIA E NON DIRETTAMENTE UN DATABASE
// Oggi basta un file su disco: siamo in due a giocare e un file lo si
// legge, si copia e si guarda con qualunque editor. Domani servirà un
// database vero — quando i giocatori saranno tanti, o quando due
// server dovranno leggere gli stessi dati.
//
// Se il resto del programma parlasse direttamente col file, quel giorno
// andrebbe riscritto tutto. Parlando invece con QUESTE quattro funzioni,
// il giorno del cambio si scrive una nuova realizzazione qui dentro e
// non si tocca una riga altrove. È tutto il senso di questo file.
//
//     leggi(chiave)          → i dati, oppure null
//     scrivi(chiave, dati)   → li mette via
//     tutte()                → tutte le chiavi (serve per i conti)
//     chiudi()               → si assicura che sia tutto sul disco
//
// Sono volutamente poche e stupide. Più sono semplici, più è facile
// che il database di domani sappia farle tutte.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

// ------------------------------------------------------------
// IN MEMORIA
// Per i test: veloce, non lascia tracce, e mette in chiaro che il resto
// del programma non sa e non deve sapere dove finiscono i dati.
// ------------------------------------------------------------
export function archivioInMemoria(iniziale = {}) {
  const dentro = new Map(Object.entries(iniziale));
  return {
    nome: 'memoria',
    leggi: async (chiave) => {
      const v = dentro.get(chiave);
      // una copia, non l'originale: chi legge non deve poter cambiare
      // il magazzino per sbaglio, tenendosi il riferimento
      return v === undefined ? null : JSON.parse(JSON.stringify(v));
    },
    scrivi: async (chiave, dati) => { dentro.set(chiave, JSON.parse(JSON.stringify(dati))); },
    tutte: async () => [...dentro.keys()],
    chiudi: async () => {}
  };
}

// ------------------------------------------------------------
// SU FILE
// Tutto in un file solo, scritto per intero a ogni salvataggio.
// Con due giocatori è più che sufficiente e ha un pregio grosso: il
// file lo si apre e si legge, quindi quando qualcosa non torna si
// guarda invece di indovinare.
//
// LA SCRITTURA È IN DUE TEMPI e non è pignoleria: se il computer si
// spegne mentre stai scrivendo sopra il file buono, ti ritrovi un file
// a metà e hai perso tutto. Si scrive prima accanto, e solo quando è
// finito si rinomina — quel passaggio il sistema operativo lo fa tutto
// o niente.
// ------------------------------------------------------------
export function archivioSuFile(percorso, { attesaScrittura = 400 } = {}) {
  let dentro = new Map();
  let caricato = false;
  let daSalvare = false;
  let orologioSalvataggio = null;
  let salvataggioInCorso = null;

  function carica() {
    if (caricato) return;
    caricato = true;
    try {
      const testo = fs.readFileSync(percorso, 'utf-8');
      const letto = JSON.parse(testo);
      dentro = new Map(Object.entries(letto.giocatori || letto));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // Il file c'è ma non si legge. NON lo sovrascrivo: lo metto da
        // parte con la data e riparto da zero. Se ci fossero dentro dati
        // recuperabili, cancellarli sarebbe il danno peggiore.
        const salvagente = percorso + '.rotto-' + Date.now();
        try { fs.renameSync(percorso, salvagente); } catch (e2) {}
        console.error('  Il magazzino non si leggeva: l\'ho messo da parte in ' + salvagente);
      }
      dentro = new Map();
    }
  }

  function salvaOra() {
    const provvisorio = percorso + '.tmp';
    const contenuto = JSON.stringify({
      versione: 1,
      salvatoIl: new Date().toISOString(),
      giocatori: Object.fromEntries(dentro)
    }, null, 2);
    fs.mkdirSync(path.dirname(percorso), { recursive: true });
    fs.writeFileSync(provvisorio, contenuto, 'utf-8');
    fs.renameSync(provvisorio, percorso);   // questo passaggio è tutto o niente
    daSalvare = false;
  }

  // Non si scrive sul disco a ogni singola modifica: si aspetta un
  // attimo e si scrive una volta sola. Chi apre un pacchetto da 50
  // carte fa decine di cambiamenti in un istante, e scriverli uno per
  // uno vorrebbe dire decine di file riscritti per niente.
  function programmaSalvataggio() {
    daSalvare = true;
    if (orologioSalvataggio) return;
    orologioSalvataggio = setTimeout(() => {
      orologioSalvataggio = null;
      if (daSalvare) salvaOra();
    }, attesaScrittura);
    if (orologioSalvataggio.unref) orologioSalvataggio.unref();
  }

  return {
    nome: 'file:' + percorso,
    leggi: async (chiave) => {
      carica();
      const v = dentro.get(chiave);
      return v === undefined ? null : JSON.parse(JSON.stringify(v));
    },
    scrivi: async (chiave, dati) => {
      carica();
      dentro.set(chiave, JSON.parse(JSON.stringify(dati)));
      programmaSalvataggio();
    },
    tutte: async () => { carica(); return [...dentro.keys()]; },
    // Da chiamare prima di spegnersi: se c'è qualcosa in attesa, va sul
    // disco adesso. Senza, un aggiornamento del server perderebbe gli
    // ultimi secondi di gioco.
    chiudi: async () => {
      if (orologioSalvataggio) { clearTimeout(orologioSalvataggio); orologioSalvataggio = null; }
      if (daSalvare) salvaOra();
    },
    // solo per i test e per i conti: quante cose ci sono dentro
    quanti: () => { carica(); return dentro.size; }
  };
}

// ------------------------------------------------------------
// QUANDO SI PASSERÀ AL DATABASE
//
// Basterà aggiungere qui una `archivioSuPostgres(collegamento)` che
// esponga le stesse quattro funzioni — una tabella con due colonne,
// chiave e contenuto, è già abbastanza per cominciare — e cambiare
// UNA riga in server.js, quella che sceglie il magazzino.
//
// Il resto del programma non si accorgerà di niente, e questo è il
// modo di controllarlo: i test di `giocatori.js` girano con il
// magazzino in memoria. Se un giorno passano con quello e falliscono
// con un altro, vuol dire che qualcuno ha barato e ha guardato dentro
// il magazzino invece di passare da queste quattro funzioni.
// ------------------------------------------------------------
