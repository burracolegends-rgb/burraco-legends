// ============================================================
// BURRACO LEGENDS — LA MISSIONE DEL GIORNO
//
// Un'idea semplice: ogni giorno, un tentativo solo, sempre contro lo
// stesso bot con LO STESSO MAZZO — non "un bot", ma il mazzo che quel
// giorno hanno affrontato tutti gli altri prima di te. Chi vince la
// classifica di oggi vince un pacchetto. Chi perde una carta soltanto
// non ha giocato peggio "in generale": ha giocato peggio di chi ha
// affrontato ESATTAMENTE lo stesso avversario, con le stesse carte in
// mano fin dall'inizio.
//
// PERCHÉ SERVE UN TAVOLO SUL SERVER (vedi apriControBot in stanze.js)
// Una classifica con un premio vero non puo' fidarsi di un numero che
// manda il browser: chi apre gli strumenti di sviluppo si scriverebbe
// il punteggio che vuole. La partita gira quindi su una stanza vera,
// identica a quelle fra due persone — solo che il secondo posto lo
// tiene un bot che gioca da solo, subito, sul server.
//
// IL SEME DEL GIORNO
// Lo stesso identico numero, per tutti, finché non cambia il giorno a
// Roma (non UTC: e' li' che gioca chi ci gioca). Da quel seme esce un
// mazzo mescolato sempre uguale — le tue undici carte, quelle del bot,
// l'ordine di pesca: tutto identico da un tentativo all'altro. Cambia
// solo come le due parti lo giocano.
//
// LA CLASSIFICA E IL PREMIO
// Il punteggio e' la somma dei PV dei tuoi eroi a fine partita, vinta o
// persa: cosi' anche chi perde ha un piazzamento, non solo un
// fallimento. Non c'e' un lavoro pianificato che chiude la classifica a
// mezzanotte — su Render il servizio puo' riavviarsi in ogni momento, e
// un timer non sopravviverebbe comunque. Si chiude PIGRAMENTE: il primo
// che chiede la classifica di oggi, o gioca la missione di oggi, fa
// anche chiudere quella di ieri se nessuno l'ha ancora fatto — vedi
// chiudiIeriSeServe().
// ============================================================
import { carteDiTipo } from '../engine/pacchetti.js';

const PREMIO_CARTE = 5;
const PREMIO_TIPO = 'eroe';

// 'YYYY-MM-DD' nel fuso di chi gioca davvero, non in UTC: senza questo
// il giorno cambierebbe a mezzanotte di Greenwich, cioè all'una o alle
// due di notte in Italia — la Missione ripartirebbe mentre qualcuno la
// sta ancora giocando.
export function giornoDi(quandoMs, fuso = 'Europe/Rome') {
  // en-CA e' l'unico locale il cui formato breve e' gia' YYYY-MM-DD:
  // un dettaglio, ma evita di rimontare la stringa a mano dai pezzi.
  return new Date(quandoMs).toLocaleDateString('en-CA', { timeZone: fuso });
}

// Un seme di 32 bit dalla data, sempre lo stesso per lo stesso giorno,
// su qualunque macchina giri. FNV-1a: corta, nota, non deve essere
// imprevedibile — anzi, l'opposto: deve essere IDENTICA per tutti.
function semeDelGiorno(giorno) {
  let h = 0x811c9dc5;
  for (let i = 0; i < giorno.length; i++) {
    h ^= giorno.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function giornoPrecedente(giorno) {
  const [a, m, g] = giorno.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function creaMissioni({ archivio, stanze, anagrafe, catalogo, orologio = Date.now, eRegistrato }) {
  if (!archivio) throw new Error('Le missioni hanno bisogno di un magazzino.');
  if (!stanze) throw new Error('Le missioni hanno bisogno del registro delle stanze.');
  if (!anagrafe) throw new Error('Le missioni hanno bisogno dell\'anagrafe, per consegnare il premio.');
  if (typeof eRegistrato !== 'function') {
    throw new Error('Le missioni hanno bisogno di sapere chi è registrato, per decidere chi può parteciparvi.');
  }

  // Il pacchetto in palio deve poter uscire per davvero: se il catalogo
  // non ha nessuna carta 'eroe' in vendita, meglio saperlo ora che il
  // giorno del primo vincitore.
  if (catalogo) carteDiTipo(catalogo, PREMIO_TIPO);

  // codice della stanza → { gettone, giorno }. Serve solo mentre la
  // partita e' in corso, per sapere QUANDO e DI CHI segnare il
  // punteggio finale — non e' un magazzino, sparisce da qui non appena
  // la partita finisce (o quando il server riparte: in quel caso resta
  // semplicemente un tentativo mai concluso, la prossima richiesta di
  // /api/missione/oggi lo trattera' come "non ancora giocato oggi",
  // che e' l'unica cosa ragionevole da fare senza sapere com'e' andata).
  const inCorso = new Map();

  const chiaveTentativo = (giorno, gettone) => 'missione:' + giorno + ':' + gettone;
  const chiaveClassifica = (giorno) => 'classificaMissione:' + giorno;

  // ------------------------------------------------------------
  // "HO GIÀ GIOCATO OGGI?" — SENZA CONSUMARE NIENTE
  // Serve alla pagina appena aperta, per sapere subito se mostrare il
  // bottone "comincia" o il risultato di stamattina, senza che il solo
  // guardare la pagina apra un tentativo. inizia(), qui sotto, fa
  // scattare per davvero la Missione: questa funzione guarda e basta.
  // ------------------------------------------------------------
  async function giocataOggi(gettone, adesso = orologio()) {
    if (!gettone) return null;
    return archivio.leggi(chiaveTentativo(giornoDi(adesso), gettone));
  }

  // ------------------------------------------------------------
  // COMINCIARE
  // ------------------------------------------------------------
  async function inizia(indirizzo, mazzo, gettone) {
    if (!gettone) return { ok: false, motivo: 'Serve sapere chi sei per giocare la Missione: apri prima la home.' };

    // SOLO CHI È REGISTRATO PUÒ PARTECIPARE.
    // Segnalato da chi ci ha provato per davvero: chiedere di scrivere
    // un nome a mano non aveva senso — quel nome esiste già sull'account
    // (lo si è dato registrandosi), e chi entra come ospite non ha un
    // account che duri: cambia dispositivo o cancella i dati del
    // browser e sparisce, portandosi via anche il posto in classifica.
    // Un premio non avrebbe dove arrivare, e una riga di classifica
    // firmata da chiunque scriva "Pietro" non significherebbe niente.
    // La verifica sta fuori da qui (vedi eRegistrato in server.js):
    // questo modulo non deve sapere COME si è registrato uno, solo SE.
    if (!(await eRegistrato(gettone))) {
      return { ok: false, serveRegistrazione: true,
        motivo: 'La Missione del giorno è per chi ha un account registrato: da ospite le tue carte si perdono al primo cambio di dispositivo, e un premio non avrebbe dove arrivare. Registrati — è gratis — e torna qui.' };
    }

    const adesso = orologio();
    const giorno = giornoDi(adesso);
    await chiudiIeriSeServe(adesso);

    const gia = await archivio.leggi(chiaveTentativo(giorno, gettone));
    if (gia) return { ok: true, giaGiocataOggi: true, risultato: gia };

    // Il nome non lo manda il client: è quello vero dell'account, lo
    // stesso che si vede ovunque nel resto del gioco.
    const suo = await anagrafe.stato(gettone);
    const nome = (suo && suo.ok && suo.nome) || 'Giocatore';

    const r = stanze.apriControBot(nome, indirizzo, mazzo, gettone, semeDelGiorno(giorno));
    if (!r.ok) return r;
    inCorso.set(r.codice, { gettone, giorno, nome });
    return { ok: true, giaGiocataOggi: false, codice: r.codice, giocatore: r.giocatore, segreto: r.segreto };
  }

  // ------------------------------------------------------------
  // DOPO OGNI MOSSA — chiamata da server.js subito dopo stanze.muovi(),
  // per lo stesso `codice` che è appena stato mosso. Se quel codice non
  // è una Missione (la stragrande maggioranza delle mosse: le partite
  // vere fra persone), non fa nulla e costa una sola letture di Map.
  // ------------------------------------------------------------
  async function registraSeFinita(codice) {
    const tracciata = inCorso.get(codice);
    if (!tracciata) return null;

    const stanza = stanze.stanza(codice);
    if (!stanza || !stanza.partita || stanza.partita.status === 'in_progress') return null;

    inCorso.delete(codice);   // finita: da qui in poi non se ne parla più

    const pvFinali = Object.values(stanza.partita.players[0].characters)
      .reduce((somma, c) => somma + Math.max(0, c.pv || 0), 0);
    const vinto = stanza.partita.winner === 0;

    const risultato = { quando: orologio(), pvFinali, vinto, nome: tracciata.nome, gettone: tracciata.gettone };
    await archivio.scrivi(chiaveTentativo(tracciata.giorno, tracciata.gettone), risultato);

    const chiave = chiaveClassifica(tracciata.giorno);
    const classifica = (await archivio.leggi(chiave)) || { chiuso: false, righe: [] };
    // un gettone non compare due volte: se per qualche motivo la si
    // rigioca (non dovrebbe: `inizia` lo impedisce), l'ultimo risultato
    // sostituisce il precedente invece di sommarsi
    classifica.righe = classifica.righe.filter((r) => r.gettone !== tracciata.gettone);
    classifica.righe.push({ gettone: tracciata.gettone, nome: tracciata.nome, pvFinali, vinto, quando: risultato.quando });
    await archivio.scrivi(chiave, classifica);

    return risultato;
  }

  // ------------------------------------------------------------
  // LA CHIUSURA PIGRA
  // Nessun lavoro schedulato: il giorno di ieri si chiude — cioè si
  // consegna il premio a chi ha il punteggio più alto — la prima volta
  // che qualcuno tocca le Missioni oggi, a qualunque ora capiti.
  // ------------------------------------------------------------
  async function chiudiIeriSeServe(adesso) {
    const ieri = giornoPrecedente(giornoDi(adesso));
    const chiave = chiaveClassifica(ieri);
    const classifica = await archivio.leggi(chiave);
    if (!classifica || classifica.chiuso || !classifica.righe.length) {
      // niente da chiudere, o già chiuso, o nessuno l'ha giocata: si
      // segna comunque "chiuso" nel secondo caso, se la chiave esiste,
      // così non la si ricontrolla ogni volta finché non arriva oggi
      if (classifica && !classifica.chiuso) {
        classifica.chiuso = true;
        await archivio.scrivi(chiave, classifica);
      }
      return;
    }
    const vincitore = [...classifica.righe].sort((a, b) => b.pvFinali - a.pvFinali)[0];
    const premio = await anagrafe.regalaPacchetto(vincitore.gettone, PREMIO_CARTE, PREMIO_TIPO);
    classifica.chiuso = true;
    classifica.vincitore = { gettone: vincitore.gettone, nome: vincitore.nome, pvFinali: vincitore.pvFinali };
    classifica.premioConsegnato = !!(premio && premio.ok);
    await archivio.scrivi(chiave, classifica);
  }

  // ------------------------------------------------------------
  // LEGGERE LA CLASSIFICA
  // `giorno` e' 'oggi' o 'ieri': non si espone una data a piacere,
  // altrimenti si aprirebbe una piccola API per rovistare nel passato
  // di chiunque abbia giocato. Le uniche due classifiche che contano
  // per chi gioca sono queste due.
  // ------------------------------------------------------------
  async function classificaDi(chi, gettoneMio = null, adesso = orologio()) {
    await chiudiIeriSeServe(adesso);
    const giorno = chi === 'ieri' ? giornoPrecedente(giornoDi(adesso)) : giornoDi(adesso);
    const classifica = (await archivio.leggi(chiaveClassifica(giorno))) || { chiuso: false, righe: [] };
    // Il gettone di ognuno resta dove deve restare: dentro al server. In
    // classifica esce solo un booleano — "questa riga sei tu" — mai
    // l'identificativo di chi ha giocato le altre righe.
    const righe = [...classifica.righe]
      .sort((a, b) => b.pvFinali - a.pvFinali)
      .map((r, i) => ({ posto: i + 1, nome: r.nome, pvFinali: r.pvFinali, vinto: r.vinto,
                         mio: !!gettoneMio && r.gettone === gettoneMio }));
    return {
      ok: true, giorno, righe,
      chiuso: !!classifica.chiuso,
      vincitore: classifica.vincitore || null,
      premioConsegnato: !!classifica.premioConsegnato
    };
  }

  return { inizia, registraSeFinita, classificaDi, giocataOggi, giornoDi: () => giornoDi(orologio()) };
}
