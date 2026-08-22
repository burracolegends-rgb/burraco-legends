// ============================================================
// BURRACO LEGENDS — LE STANZE
//
// Una stanza è una partita fra due persone. Chi apre riceve un codice
// di sei lettere da mandare all'amico su WhatsApp; chi lo digita entra.
// Niente account, niente registrazione: per cercare difetti in due
// bastano un codice e un indirizzo.
//
// LE TRE COSE CHE QUESTO FILE PROTEGGE
//
// 1. CHI SEI. A ognuno dei due, entrando, viene dato un segreto. Il
//    segreto non si mostra mai, non compare in nessuna vista, e serve
//    solo a rispondere alla domanda "questo messaggio da chi arriva?".
//    L'indice del giocatore lo decide la stanza guardando il segreto,
//    mai il messaggio.
//
// 2. COSA VEDI. Lo stato vero non esce mai da qui. Esce solo la vista
//    costruita da engine/vista.js, diversa per i due.
//
// 3. COSA È SUCCESSO. Ogni mossa finisce nel registro, insieme al seme
//    del caso. Con quei due pezzi una partita si rigioca identica: è
//    l'unico modo serio di capire un difetto visto una volta sola,
//    invece di chiedersi "aspetta, cos'avevi fatto?".
// ============================================================
import { randomBytes } from 'node:crypto';
import { createMatch } from '../engine/partita.js';
import { applica, faiScorrereIlTempo } from '../engine/azioni.js';
import { SECONDI_DI_STUDIO } from '../engine/partita.js';
import { vistaPer } from '../engine/vista.js';

// Lettere senza quelle che si confondono a voce o a occhio: niente
// O/0, I/1, L. Il codice si detta al telefono.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LUNGHEZZA_CODICE = 6;

export const STANZA_ABBANDONATA_MS = 2 * 60 * 60 * 1000;   // due ore senza nessuno
export const ATTESA_MASSIMA_MS = 25000;                    // quanto tengo appesa una domanda

// Finché il server girava sul computer di casa, questi due non
// servivano: l'unico che poteva aprire tavoli eri tu. Su internet no.
// Nessuno deve poter riempire la memoria del server aprendo tavoli a
// raffica — non serve nemmeno cattiveria, basta una pagina lasciata a
// ricaricarsi da sola.
export const STANZE_MASSIME = 500;
export const TAVOLI_PER_INDIRIZZO = 20;        // in un'ora, dallo stesso indirizzo
export const FINESTRA_LIMITE_MS = 60 * 60 * 1000;

// ------------------------------------------------------------
// IL CASO RIPETIBILE
// Un generatore che parte da un numero e produce sempre la stessa
// sequenza. Il numero finisce nel registro: con quello si rigioca.
// ------------------------------------------------------------
export function generatoreDaSeme(seme) {
  let x = seme >>> 0;
  return () => {
    // xorshift32: corto, veloce, e soprattutto uguale ovunque giri
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;  x >>>= 0;
    return x / 4294967296;
  };
}

function codiceNuovo() {
  const b = randomBytes(LUNGHEZZA_CODICE);
  let s = '';
  for (let i = 0; i < LUNGHEZZA_CODICE; i++) s += ALFABETO[b[i] % ALFABETO.length];
  return s;
}

const segretoNuovo = () => randomBytes(24).toString('hex');

// ------------------------------------------------------------
// IL REGISTRO DELLE STANZE
// ------------------------------------------------------------
export function creaRegistroStanze({ orologio = Date.now, squadre = null,
                                    stanzeMassime = STANZE_MASSIME,
                                    tavoliPerIndirizzo = TAVOLI_PER_INDIRIZZO,
                                    studioSecondi = SECONDI_DI_STUDIO,
                                    cartaGiocata = null } = {}) {
  const stanze = new Map();
  const aperture = new Map();      // indirizzo → quando ha aperto i suoi tavoli

  // Quanti tavoli ha aperto di recente chi sta chiamando. Le aperture
  // vecchie si dimenticano da sole: non serve tenerne memoria per sempre.
  function troppiTavoli(indirizzo) {
    if (!indirizzo) return false;
    const adesso = orologio();
    const recenti = (aperture.get(indirizzo) || []).filter((q) => adesso - q < FINESTRA_LIMITE_MS);
    if (recenti.length >= tavoliPerIndirizzo) { aperture.set(indirizzo, recenti); return true; }
    recenti.push(adesso);
    aperture.set(indirizzo, recenti);
    return false;
  }

  // Il mazzo arriva da chi si siede. NON viene creduto: chi lo
  // trasforma in una squadra e' `squadre`, che sta dal lato del server e
  // controlla ogni carta contro il catalogo vero. Qui si tiene da parte
  // e basta — le stanze non sanno niente di eroi e carte magiche, ed e'
  // giusto che continuino a non saperlo.
  //
  // Insieme al mazzo si siede anche il GETTONE di chi gioca, e vale la
  // stessa regola: qui dentro e' una stringa opaca, non si legge e non
  // si interpreta. Serve a una cosa sola — dire a chi tiene le
  // collezioni QUALE giocatore ha appena consumato una carta. Non entra
  // in nessuna vista e non finisce nel registro: il registro serve a
  // rigiocare le partite, e per rigiocarle non serve sapere di chi
  // erano le carte.
  function apri(nome, indirizzo, mazzo, gettone = null) {
    if (stanze.size >= stanzeMassime) {
      return { ok: false, motivo: 'Il server è pieno di tavoli in questo momento. Riprova fra poco.' };
    }
    if (troppiTavoli(indirizzo)) {
      return { ok: false, motivo: 'Hai aperto troppi tavoli di seguito. Aspetta un po\'.' };
    }
    let codice;
    do { codice = codiceNuovo(); } while (stanze.has(codice));

    const seme = randomBytes(4).readUInt32BE(0);
    const adesso = orologio();
    const stanza = {
      codice,
      seme,
      creataAlle: adesso,
      ultimoContatto: adesso,
      partita: null,                 // si crea quando entra il secondo
      versione: 0,                   // sale a ogni cambiamento: i client chiedono "novità dopo la N?"
      registro: [],                  // ogni mossa, per rigiocare
      posti: [
        { segreto: segretoNuovo(), nome: nome || 'Giocatore 1', collegatoAlle: adesso, mazzo: mazzo || null, gettone: gettone || null },
        null
      ],
      ultimoEsito: null,          // il resoconto pubblico dell'ultima mossa
      inAttesa: []                   // le domande tenute appese
    };
    stanze.set(codice, stanza);
    return { ok: true, codice, giocatore: 0, segreto: stanza.posti[0].segreto };
  }

  function entra(codice, nome, mazzo, gettone = null) {
    const stanza = stanze.get(String(codice || '').toUpperCase().trim());
    if (!stanza) return { ok: false, motivo: 'Questo codice non corrisponde a nessun tavolo.' };
    if (stanza.posti[1]) return { ok: false, motivo: 'Il tavolo è già al completo.' };

    stanza.posti[1] = { segreto: segretoNuovo(), nome: nome || 'Giocatore 2', collegatoAlle: orologio(), mazzo: mazzo || null, gettone: gettone || null };
    avviaPartita(stanza);
    return { ok: true, codice: stanza.codice, giocatore: 1, segreto: stanza.posti[1].segreto };
  }

  function avviaPartita(stanza) {
    // trenta secondi per guardare il tavolo prima che partano gli orologi
    const opzioni = { now: orologio(), rng: generatoreDaSeme(stanza.seme), studioSecondi };
    // ognuno scende in campo col proprio mazzo, se ne ha uno valido
    const mazzi = [stanza.posti[0] && stanza.posti[0].mazzo, stanza.posti[1] && stanza.posti[1].mazzo];
    if (squadre) Object.assign(opzioni, squadre(mazzi));
    stanza.partita = createMatch(opzioni);
    // lo studio finisce nel registro: rigiocando bisogna sapere quanto
    // durava ALLORA, non quanto dura oggi, se no le mosse registrate
    // cadrebbero in un momento diverso e il confronto non varrebbe niente
    // I MAZZI FINISCONO NEL REGISTRO.
    // Senza, rigiocare una partita vecchia la rifarebbe con le squadre
    // predefinite invece che con quelle di allora: stessi mazzi di
    // carte, altri eroi, altri danni — e il confronto direbbe che il
    // motore si comporta diversamente quando invece e' il registro a
    // essere incompleto.
    stanza.registro.push({
      versione: 0, tipo: 'inizio', seme: stanza.seme, quando: orologio(), studioSecondi, mazzi
    });
    cambiata(stanza);
  }

  // Chi sei lo decide questa funzione, e nient'altro.
  function chiSei(stanza, segreto) {
    if (typeof segreto !== 'string' || !segreto) return -1;
    for (let i = 0; i < 2; i++) {
      if (stanza.posti[i] && stanza.posti[i].segreto === segreto) return i;
    }
    return -1;
  }

  function cambiata(stanza) {
    stanza.versione++;
    const appesi = stanza.inAttesa;
    stanza.inAttesa = [];
    for (const sveglia of appesi) sveglia();
  }

  // ----------------------------------------------------------
  // IL RESOCONTO DELL'ULTIMA MOSSA
  // Chi subisce una mossa vede solo lo stato dopo: i punti vita
  // calano e non si sa perché. Qui si tiene da parte il minimo per
  // raccontarlo — quanto danno, su chi, con cosa — senza far uscire
  // niente di segreto. Le carte calate sono già pubbliche; la mano di
  // chi ha giocato non entra mai qui dentro.
  // ----------------------------------------------------------
  function resocontoPubblico(giocatore, azione, esito) {
    if (!esito || !esito.ok) return null;
    const r = { giocatore, tipo: azione && azione.tipo, quando: orologio() };
    if (esito.damage) r.danno = esito.damage;
    if (esito.ondata) r.ondata = esito.ondata;

    // CHI HA PRESO QUANTO, seme per seme.
    // Senza questo elenco chi subisce vedeva calare i punti vita e basta:
    // niente carta che trema, niente numero, nessuna animazione — perche'
    // il tavolo non sapeva QUALI personaggi erano stati colpiti, e con
    // zero bersagli non c'e' niente da animare.
    // Non e' roba segreta: i punti vita dei personaggi stanno scoperti
    // sul tavolo e si vedono gia' nella vista. Qui si dice solo come si
    // e' arrivati ai numeri nuovi.
    if (Array.isArray(esito.colpi) && esito.colpi.length) {
      r.colpi = esito.colpi.map((c) => ({
        suit: c.suit, damage: c.damage, cardId: c.cardId, pvRimasti: c.pvRimasti
      }));
    }
    if (esito.pozzettoPreso) r.pozzettoPreso = true;
    if (esito.semeAttaccante) r.semeAttaccante = esito.semeAttaccante;
    if (esito.semeBersaglio) r.semeBersaglio = esito.semeBersaglio;
    if (esito.dannoAnnullato) r.dannoAnnullato = true;
    if (esito.dannoRaddoppiato) r.dannoRaddoppiato = true;
    if (esito.riflesso) r.riflesso = esito.riflesso;
    // di una carta magica si dice il nome, non il contenuto della mano
    if (esito.carta) r.carta = { id: esito.carta.id, tipo: esito.carta.tipo };
    // QUALI trappole sono scattate, non quante.
    // Una trappola resta coperta finche' non scatta; nel momento in cui
    // scatta si rivela, ed e' giusto che chi la subisce la veda: e'
    // l'unico modo per capire cosa e' appena successo. Prima usciva solo
    // il numero, e dall'altra parte comparivano danni senza spiegazione.
    if (esito.trappoleScattate && esito.trappoleScattate.length) {
      r.trappoleScattate = esito.trappoleScattate.map((x) => ({
        cardId: x.cardId, effect: x.effect
      }));
    }
    return r;
  }

  // Da quanto non si fa vivo l'altro. Non serve a decidere niente — il
  // turno scade da solo — ma serve a chi sta aspettando: sapere che
  // l'avversario è caduto è molto diverso dal credere che ci stia
  // pensando su.
  function daQuantoNonSiVede(stanza, chi) {
    const posto = stanza.posti[chi];
    if (!posto) return null;
    return Math.round((orologio() - posto.collegatoAlle) / 1000);
  }

  function statoPer(stanza, io) {
    const altro = io === 0 ? 1 : 0;
    return {
      codice: stanza.codice,
      versione: stanza.versione,
      ultimoEsito: stanza.ultimoEsito,
      avversarioVistoSecondiFa: daQuantoNonSiVede(stanza, altro),
      inAttesaDelSecondo: !stanza.posti[1],
      nomi: [stanza.posti[0] ? stanza.posti[0].nome : null,
             stanza.posti[1] ? stanza.posti[1].nome : null],
      vista: stanza.partita ? vistaPer(stanza.partita, io, orologio()) : null
    };
  }

  // ----------------------------------------------------------
  // LEGGERE
  // Se il chiamante ha già la versione N, la domanda resta appesa
  // finché non succede qualcosa: così il tavolo dell'altro si aggiorna
  // subito senza chiedere in continuazione.
  // ----------------------------------------------------------
  function guarda(codice, segreto, daVersione, quandoPronto) {
    const stanza = stanze.get(String(codice || '').toUpperCase().trim());
    if (!stanza) return quandoPronto({ ok: false, motivo: 'Tavolo inesistente.' });
    const io = chiSei(stanza, segreto);
    if (io < 0) return quandoPronto({ ok: false, motivo: 'Non risulti seduto a questo tavolo.' });

    stanza.ultimoContatto = orologio();
    stanza.posti[io].collegatoAlle = stanza.ultimoContatto;

    const attesa = Number(daVersione);
    if (!Number.isFinite(attesa) || attesa < stanza.versione) {
      return quandoPronto({ ok: true, ...statoPer(stanza, io) });
    }

    let risposto = false;
    const rispondi = () => {
      if (risposto) return;
      risposto = true;
      clearTimeout(scadenza);
      quandoPronto({ ok: true, ...statoPer(stanza, io) });
    };
    const scadenza = setTimeout(rispondi, ATTESA_MASSIMA_MS);
    if (scadenza.unref) scadenza.unref();
    stanza.inAttesa.push(rispondi);
  }

  // ----------------------------------------------------------
  // GIOCARE
  // ----------------------------------------------------------
  function muovi(codice, segreto, azione) {
    const stanza = stanze.get(String(codice || '').toUpperCase().trim());
    if (!stanza) return { ok: false, motivo: 'Tavolo inesistente.' };
    const io = chiSei(stanza, segreto);
    if (io < 0) return { ok: false, motivo: 'Non risulti seduto a questo tavolo.' };
    if (!stanza.partita) return { ok: false, motivo: 'Si aspetta ancora il secondo giocatore.' };

    const quando = orologio();
    stanza.ultimoContatto = quando;
    stanza.posti[io].collegatoAlle = quando;

    const esito = applica(stanza.partita, azione, io, quando);

    stanza.registro.push({
      versione: stanza.versione + 1,
      tipo: 'mossa',
      giocatore: io,
      azione,                        // così com'è arrivata, storta compresa
      quando,
      accettata: esito.ok,
      motivo: esito.ok ? null : esito.motivo
    });

    // UNA CARTA MAGICA GIOCATA SE NE VA DAVVERO.
    // Il motore sa che quel posto è speso per questa partita, ma non sa
    // niente di collezioni — ed è giusto: deve restare rigiocabile dal
    // registro senza toccare i dati di nessuno. Quindi il colpo lo
    // batte qui, dove il gettone c'è.
    //
    // Si avvisa SOLO se la mossa è andata a buon fine: una carta
    // rifiutata resta al suo posto e non si paga.
    //
    // Non si aspetta l'esito della scrittura: la partita non deve
    // fermarsi perché il magazzino è lento. Se la scrittura fallisce, la
    // carta resta al giocatore — di due errori possibili, tenersi una
    // carta già giocata è il meno grave: perderne una che si possiede
    // ancora sarebbe una copia sparita nel nulla.
    if (esito.ok && cartaGiocata && esito.carta && esito.carta.id) {
      const chi = stanza.posti[io] && stanza.posti[io].gettone;
      if (chi) {
        Promise.resolve(cartaGiocata(chi, esito.carta.id))
          .catch((e) => console.error('[stanze] la carta giocata non si è potuta scalare:', e && e.message));
      }
    }

    // anche una mossa rifiutata può aver cambiato la partita, se nel
    // frattempo era scaduto un turno: in quel caso l'altro va svegliato
    if (esito.ok) stanza.ultimoEsito = resocontoPubblico(io, azione, esito);
    if (esito.ok || esito.turnoScaduto) cambiata(stanza);

    return { ...esito, versione: stanza.versione, vista: statoPer(stanza, io).vista };
  }

  // ----------------------------------------------------------
  // L'OROLOGIO CHE GIRA DA SOLO
  // Il turno scade anche se nessuno tocca niente. Da chiamare a
  // intervalli: è l'unica cosa che muove la partita senza che nessuno
  // abbia scritto.
  // ----------------------------------------------------------
  // UN TAVOLO ROTTO NON DEVE FERMARE GLI ALTRI.
  // Questa funzione gira una volta al secondo su OGNI tavolo aperto, fuori
  // da qualunque richiesta e quindi fuori dalla protezione che le
  // richieste hanno (vedi server.js). Prima, un errore in un solo tavolo
  // — uno stato imprevisto, un bug in una carta nuova — interrompeva il
  // giro a metà: i tavoli dopo quello rotto non ricevevano il battito
  // quel turno, e se l'errore risaliva fino a chi ha chiamato battito(),
  // faceva cadere l'intero processo. Un giocatore su un tavolo sano non
  // deve pagare per un bug in un tavolo che non è nemmeno il suo.
  function battito() {
    const adesso = orologio();
    let scadenze = 0;
    for (const [codice, stanza] of stanze) {
      try {
        if (stanza.partita && stanza.partita.status === 'in_progress') {
          const r = faiScorrereIlTempo(stanza.partita, adesso);
          if (r.scaduto) {
            scadenze++;
            stanza.registro.push({
              versione: stanza.versione + 1, tipo: 'tempo_scaduto',
              quando: adesso, scartata: r.scartata ? r.scartata.id : null
            });
            stanza.ultimoEsito = {
              giocatore: stanza.partita.currentPlayerIndex === 0 ? 1 : 0,
              tipo: 'tempo_scaduto', quando: adesso,
              scartata: r.scartata ? r.scartata.id : null
            };
            cambiata(stanza);
          }
        }
        if (adesso - stanza.ultimoContatto > STANZA_ABBANDONATA_MS) {
          for (const sveglia of stanza.inAttesa) sveglia();
          stanze.delete(codice);
        }
      } catch (e) {
        console.error('[battito] tavolo', codice, 'in errore, salto solo lui:', e);
      }
    }
    // le aperture vecchie non contano più: via dalla memoria
    for (const [indirizzo, quando] of aperture) {
      const recenti = quando.filter((q) => adesso - q < FINESTRA_LIMITE_MS);
      if (recenti.length) aperture.set(indirizzo, recenti); else aperture.delete(indirizzo);
    }
    return { scadenze, stanzeAperte: stanze.size };
  }

  // ----------------------------------------------------------
  // IL REGISTRO
  // Non contiene mani né mazzo: solo il seme e le mosse. Con quelli la
  // partita si ricostruisce dall'inizio, senza che il registro stesso
  // sia una fuga di informazioni.
  // ----------------------------------------------------------
  function registroDi(codice) {
    const stanza = stanze.get(String(codice || '').toUpperCase().trim());
    if (!stanza) return null;
    return { codice: stanza.codice, seme: stanza.seme, mosse: stanza.registro };
  }

  return {
    apri, entra, guarda, muovi, battito, registroDi,
    quante: () => stanze.size,
    stanza: (codice) => stanze.get(String(codice || '').toUpperCase().trim()) || null
  };
}

// ------------------------------------------------------------
// RIGIOCARE UNA PARTITA DAL REGISTRO
// Prende quello che ha salvato il server e rifà la partita mossa per
// mossa. Se il finale non combacia, il difetto è nel motore; se
// combacia, il difetto era in quello che ci siamo raccontati.
// ------------------------------------------------------------
export function rigioca(registro, squadre = null) {
  const opzioni = { rng: generatoreDaSeme(registro.seme) };
  const inizio = registro.mosse.find((m) => m.tipo === 'inizio');
  if (inizio) opzioni.now = inizio.quando;
  // lo studio di ALLORA, non quello di oggi
  opzioni.studioSecondi = (inizio && typeof inizio.studioSecondi === 'number')
    ? inizio.studioSecondi : SECONDI_DI_STUDIO;
  if (squadre) Object.assign(opzioni, squadre(inizio && inizio.mazzi));

  const partita = createMatch(opzioni);
  const differenze = [];

  for (const riga of registro.mosse) {
    if (riga.tipo === 'mossa') {
      const esito = applica(partita, riga.azione, riga.giocatore, riga.quando);
      if (!!esito.ok !== !!riga.accettata) {
        differenze.push({
          versione: riga.versione,
          azione: riga.azione,
          allora: riga.accettata ? 'accettata' : 'rifiutata: ' + riga.motivo,
          adesso: esito.ok ? 'accettata' : 'rifiutata: ' + esito.motivo
        });
      }
    } else if (riga.tipo === 'tempo_scaduto') {
      faiScorrereIlTempo(partita, riga.quando);
    }
  }
  return { partita, differenze };
}
