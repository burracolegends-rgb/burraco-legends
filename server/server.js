// ============================================================
// BURRACO LEGENDS — IL SERVER
//
// Si avvia con:   node server/server.js
// Nessuna dipendenza da installare: solo i moduli che Node ha già.
//
// PERCHÉ NON WEBSOCKET
// Il gioco è a turni, con un minuto per mossa. Non servono sessanta
// aggiornamenti al secondo, serve che l'altro veda la mia mossa subito.
// Basta una domanda HTTP tenuta appesa: il client chiede "novità dopo
// la versione N?" e il server risponde nell'istante in cui qualcosa
// cambia, oppure dopo venticinque secondi se non è cambiato niente.
// Stessa reattività, un decimo delle cose che possono rompersi — e
// funziona attraverso qualunque rete, senza negoziazioni.
//
// COSA SERVE
//   POST /api/apri      { nome }                  → codice, segreto
//   POST /api/entra     { codice, nome }          → segreto
//   GET  /api/stato     ?codice&segreto&da=N      → resta appesa fino a novità
//   POST /api/mossa     { codice, segreto, azione }
//   GET  /api/registro  ?codice                   → per rigiocare una partita
//
// Il segreto non compare mai in nessuna risposta destinata all'altro.
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { creaRegistroStanze } from './stanze.js';

// ------------------------------------------------------------
// UN ERRORE IMPREVISTO NON DEVE SPEGNERE IL SERVER PER TUTTI.
// Senza queste due righe, Node fa quello che fa di norma: un'eccezione
// non presa in nessun punto, o una promise rifiutata che nessuno
// aspetta, spengono l'INTERO processo — anche se è successa dentro il
// controllo di un tavolo, o dentro un pacchetto di terze parti, in un
// punto che non ha niente a che fare con chi sta giocando altrove.
// Ogni partita in corso, di chiunque, sparirebbe per un errore che
// magari riguardava un solo tavolo.
//
// Le richieste vere e proprie sono già protette (vedi il try/catch
// attorno alle rotte più sotto, e quello dentro battito() per ogni
// singolo tavolo): questa è la rete sotto la rete, per qualunque altro
// punto che oggi non è ancora protetto o che lo sarà domani per un bug
// non ancora scritto. Si registra l'errore e si va avanti — è la scelta
// giusta per un server che tiene in memoria tavoli indipendenti fra
// loro: uno storto non deve portarsi dietro tutti gli altri.
// ------------------------------------------------------------
process.on('uncaughtException', (e) => {
  console.error('[server] eccezione non gestita, il processo CONTINUA:', e);
});
process.on('unhandledRejection', (e) => {
  console.error('[server] promise rifiutata senza nessuno che l\'aspettasse:', e);
});
import { archivioSuFile } from './archivio.js';
import { creaAnagrafe } from './giocatori.js';
import { creaAccessi, verificatoreGoogle, verificatoreFacebook, FORNITORI } from './identita.js';
import { creaAccessoEmail } from './accesso-email.js';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const RADICE = path.resolve(QUI, '..');
const PORTA = Number(process.env.PORTA || process.env.PORT || 8080);

// ------------------------------------------------------------
// LE SQUADRE
// Finché non c'è la scelta del mazzo, le due squadre sono quelle di
// prova del tavolo: quattro eroi a testa, con le carte magiche già
// scelte. Le carte si leggono da cards/data una volta sola all'avvio.
// ------------------------------------------------------------
function leggiCarte(cartella) {
  const dentro = {};
  const base = path.join(RADICE, 'cards', cartella);
  for (const f of fs.readdirSync(base)) {
    if (f.endsWith('.json')) dentro[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(base, f), 'utf-8'));
  }
  return dentro;
}
const CARTE = leggiCarte('data');

const SQUADRE_DI_PROVA = {
  personaggi: [
    ['personaggio_001', 'personaggio_003', 'personaggio_005', 'personaggio_007'],
    ['personaggio_002', 'personaggio_004', 'personaggio_006', 'personaggio_008']
  ],
  magiche: [
    ['sorpresa_001', 'trappola_001', 'trappola_002'],
    ['sorpresa_002', 'trappola_001', 'trappola_002']
  ]
};

function squadra(ids) {
  const characters = {}, abilities = {};
  for (const id of ids) {
    const p = CARTE[id];
    if (!p) continue;
    characters[p.seme] = {
      // Difesa è centrata su 1: senza il campo sulla carta, è la base
      // neutra (danno pieno), non uno zero che amplificherebbe il danno.
      pv: p.vita, pvMax: p.vita, att: p.att, difesa: p.difesa || 1, carica: 0, cardId: id,
      rarita: p.rarita || 1, turniCarica: p.turniCarica || 4
    };
    if (p.abilita) abilities[p.seme] = p.abilita;
  }
  return { characters, abilities };
}

// ------------------------------------------------------------
// IL MAZZO DEL GIOCATORE, CONTROLLATO QUI
//
// Il mazzo lo sceglie il browser, quindi arriva da fuori: non si puo'
// credere a una riga di quel messaggio. Uno che volesse barare
// chiederebbe quattro volte l'eroe piu' forte, o un eroe con diecimila
// punti vita inventato di sana pianta.
//
// Il controllo e' questo: gli id devono esistere nel catalogo VERO
// (cards/data, letto qui all'avvio), dev'essercene uno per ciascun seme,
// ognuno sul proprio seme, e le Carte Magiche devono essere tre e
// diverse. Le statistiche — vita, attacco, abilita' — non arrivano dal
// messaggio: si prendono dalla carta vera. Del mazzo si ascoltano solo i
// NOMI delle carte, mai i loro numeri.
//
// Se qualcosa non torna, quel giocatore scende in campo con la squadra
// predefinita. Non e' una punizione: e' che una partita cominciata a
// meta' e' peggio di una partita con le squadre di prova.
// ------------------------------------------------------------
const SEMI = ['♥', '♦', '♣', '♠'];

function mazzoValido(mazzo) {
  if (!mazzo || typeof mazzo !== 'object') return null;
  const scelti = mazzo.personaggi;
  if (!scelti || typeof scelti !== 'object') return null;

  const personaggi = [];
  for (const seme of SEMI) {
    const id = scelti[seme];
    if (typeof id !== 'string') return null;
    const carta = CARTE[id];
    if (!carta || carta.seme !== seme) return null;   // inventata, o sul seme sbagliato
    personaggi.push(id);
  }

  const magiche = mazzo.carteMagiche;
  if (!Array.isArray(magiche) || magiche.length !== 3) return null;
  if (new Set(magiche).size !== 3) return null;
  for (const id of magiche) {
    if (typeof id !== 'string') return null;
    const carta = CARTE[id];
    if (!carta || (carta.tipo !== 'sorpresa' && carta.tipo !== 'trappola')) return null;
  }
  return { personaggi, magiche };
}

// Da un mazzo (o dal nulla) alla squadra vera, con le statistiche prese
// dalle carte del server.
//
// LE CARTE MAGICHE NON SI REGALANO PIÙ QUI.
// Prima chi non aveva un mazzo valido riceveva anche tre Carte Magiche
// della squadra di prova. Adesso che le carte si consumano dalla
// collezione, quello sarebbe stato un rubinetto aperto: bastava non
// scegliere un mazzo per averne tre gratis a ogni partita, per sempre.
// Gli EROI restano — senza quattro eroi non si può nemmeno cominciare —
// ma le Carte Magiche arrivano solo da chi le possiede davvero, e chi
// non ne ha gioca senza. Il regalo si fa una volta sola, alla nascita
// del giocatore: vedi engine/dotazione.js.
function squadreDiProva(mazzi) {
  const scelto = [mazzoValido(mazzi && mazzi[0]), mazzoValido(mazzi && mazzi[1])];
  const squadre = [0, 1].map((i) =>
    squadra(scelto[i] ? scelto[i].personaggi : SQUADRE_DI_PROVA.personaggi[i]));
  const magiche = [0, 1].map((i) =>
    (scelto[i] ? scelto[i].magiche : [])
      .map((id) => CARTE[id]).filter(Boolean));

  return {
    characters: [squadre[0].characters, squadre[1].characters],
    abilities: [squadre[0].abilities, squadre[1].abilities],
    magiche
  };
}

// ------------------------------------------------------------
// IL MAZZO CON CUI SI SCENDE IN CAMPO DAVVERO
//
// Tre casi, in ordine:
//
// 1. Ha scelto un mazzo e possiede tutto quello che c'è dentro → gioca
//    con quello.
// 2. Non ha scelto niente (o ha scelto carte che non ha), ma so chi è →
//    gliene costruisco uno con quello che possiede. Serve davvero: un
//    giocatore che ha ricevuto la dotazione ma non è mai passato dalla
//    schermata del mazzo possiede delle Carte Magiche, e sarebbe
//    assurdo farlo giocare senza.
// 3. Non so chi è (nessun gettone) → squadra di prova, zero Carte
//    Magiche. Non c'è nessuna collezione da cui scalare, quindi non c'è
//    niente da giocare.
// ------------------------------------------------------------
function mazzoAutomatico(collezione) {
  const posseduta = (id) => (collezione[id] || 0) > 0;
  const personaggi = {};
  for (const seme of SEMI) {
    // fra quelli che ha su quel seme, il più raro: è la scelta che
    // farebbe lui, e comunque la rifà quando vuole dalla sua schermata
    const suoi = Object.keys(collezione)
      .map((id) => CARTE[id])
      .filter((c) => c && c.seme === seme && posseduta(c.id))
      .sort((a, b) => (b.rarita || 0) - (a.rarita || 0));
    if (!suoi.length) return null;          // gli manca un seme: niente da fare
    personaggi[seme] = suoi[0].id;
  }
  const magiche = Object.keys(collezione)
    .map((id) => CARTE[id])
    .filter((c) => c && !c.seme && posseduta(c.id))
    .sort((a, b) => (b.rarita || 0) - (a.rarita || 0))
    .slice(0, 3)
    .map((c) => c.id);
  return { personaggi, carteMagiche: magiche };
}

async function mazzoDaGiocare(gettone, mazzoChiesto) {
  const suo = await anagrafe.stato(gettone);
  if (!suo || !suo.ok) return null;         // non so chi sei: squadra di prova
  const collezione = suo.collezione || {};

  const pulito = mazzoValido(mazzoChiesto);
  if (pulito) {
    const tutte = [...pulito.personaggi, ...pulito.magiche];
    const possesso = await anagrafe.possiedeTutte(gettone, tutte);
    // Se ha chiesto carte che non possiede non si rifiuta la partita: si
    // scende in campo con quello che ha davvero. Una partita che non
    // comincia è peggio di una partita con un mazzo diverso — e il
    // messaggio glielo dà la sua schermata del mazzo, non il tavolo.
    if (possesso.ok) return mazzoChiesto;
  }
  return mazzoAutomatico(collezione);
}

// STUDIO_SECONDI serve alle prove automatiche, che non possono stare
// trenta secondi ferme ad aspettare. In partita vera non si tocca.
const stanze = creaRegistroStanze({
  squadre: squadreDiProva,
  // Una Carta Magica giocata se ne va anche dalla collezione: vale un
  // solo utilizzo. `anagrafe` nasce qualche riga più sotto, e va bene —
  // questa funzione la si chiama a partita in corso, non adesso.
  cartaGiocata: (gettone, idCarta) => anagrafe.consumaCarta(gettone, idCarta),
  ...(process.env.STUDIO_SECONDI !== undefined
      ? { studioSecondi: Number(process.env.STUDIO_SECONDI) || 0 } : {})
});

// ------------------------------------------------------------
// I GIOCATORI E QUELLO CHE POSSIEDONO
//
// Sharkini, album e apertura dei pacchetti stanno QUI, non nel
// browser. Nel browser erano finti: bastava aprire gli strumenti di
// sviluppo per darsi un milione di sharkini e tutte le carte rare.
//
// Il magazzino è un file, per ora. Il giorno del database si cambia
// questa riga e nient'altro: il resto del programma parla solo con le
// quattro funzioni di archivio.js e non sa dove finiscano i dati.
// ------------------------------------------------------------
const DOVE_SALVO = process.env.MAGAZZINO || path.join(RADICE, 'dati', 'giocatori.json');
const archivio = archivioSuFile(DOVE_SALVO);
const anagrafe = creaAnagrafe({ archivio, catalogo: Object.values(CARTE) });

// ------------------------------------------------------------
// COME SI ENTRA
//
// Da ospite si entra subito, sempre: è il modo normale di cominciare.
// Google e Facebook si accendono SOLO se qualcuno ha messo le chiavi
// dell'applicazione nelle variabili d'ambiente. Senza, i bottoni
// restano spenti e la pagina lo dice — meglio di un bottone che c'è
// e non funziona.
//
// I segreti non stanno nel codice e non finiscono mai nel browser:
// vivono solo qui, nella memoria del server.
// ------------------------------------------------------------
const verificatori = {};
const google = verificatoreGoogle(process.env.GOOGLE_ID_APP);
if (google) verificatori.google = google;
const facebook = verificatoreFacebook(process.env.FACEBOOK_ID_APP, process.env.FACEBOOK_SEGRETO_APP);
if (facebook) verificatori.facebook = facebook;

const accessi = creaAccessi({ archivio, anagrafe, verificatori });

// ------------------------------------------------------------
// EMAIL E PASSWORD
// Finché non c'è un servizio di posta configurato, il collegamento di
// recupero viene scritto nella finestra del server invece di essere
// spedito. Il recupero funziona davvero: manca solo il postino.
// ------------------------------------------------------------
const conti = creaAccessoEmail({
  archivio, anagrafe,
  indirizzoSito: process.env.INDIRIZZO_SITO || 'http://localhost:' + PORTA,
  spedisci: null
});

// il tempo che scorre da solo: i turni scadono anche se nessuno gioca
const battito = setInterval(() => stanze.battito(), 1000);
if (battito.unref) battito.unref();

// ------------------------------------------------------------
// FILE
// Si serve solo da client/: il resto del progetto (motore, carte,
// strumenti) non ha motivo di essere scaricabile.
// ------------------------------------------------------------
const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  // le illustrazioni e le cornici delle carte: WebP, lo stesso formato
  // che il tavolo usa gia' per le carte da burraco
  '.webp': 'image/webp'
};

function serviFile(res, richiesto) {
  const pulito = path.normalize(richiesto).replace(/^(\.\.[/\\])+/, '');
  const dentro = path.join(RADICE, 'client', pulito);
  // controllo esplicito: nessun percorso deve poter uscire da client/
  if (!dentro.startsWith(path.join(RADICE, 'client'))) return rispondi(res, 403, { errore: 'No.' });
  fs.readFile(dentro, (err, dati) => {
    if (err) return rispondi(res, 404, { errore: 'Non trovato: ' + pulito });
    res.writeHead(200, {
      'Content-Type': TIPI[path.extname(dentro)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(dati);
  });
}

function rispondi(res, codice, corpo) {
  const testo = JSON.stringify(corpo);
  res.writeHead(codice, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(testo);
}

function leggiCorpo(req) {
  return new Promise((risolvi) => {
    let pezzi = '', troppo = false;
    req.on('data', (c) => {
      pezzi += c;
      if (pezzi.length > 64 * 1024) { troppo = true; req.destroy(); }   // niente messaggi giganti
    });
    req.on('end', () => {
      if (troppo) return risolvi(null);
      try { risolvi(pezzi ? JSON.parse(pezzi) : {}); } catch (e) { risolvi(null); }
    });
    req.on('error', () => risolvi(null));
  });
}

// ------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'locale'));
  const via = url.pathname;

  if (!via.startsWith('/api/')) {
    return serviFile(res, via === '/' ? 'accedi.html' : via);
  }

  try {
    if (via === '/api/apri' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      // il mazzo si controlla PRIMA di sedersi: dentro la stanza deve
      // entrare solo roba che quel giocatore possiede davvero
      const mazzo = await mazzoDaGiocare(corpo.gettone, corpo.mazzo);
      const r = stanze.apri(nomePulito(corpo.nome), chiChiama(req), mazzo, corpo.gettone);
      return rispondi(res, r.ok ? 200 : 429, r);
    }

    if (via === '/api/entra' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      const mazzo = await mazzoDaGiocare(corpo.gettone, corpo.mazzo);
      const r = stanze.entra(corpo.codice, nomePulito(corpo.nome), mazzo, corpo.gettone);
      return rispondi(res, r.ok ? 200 : 404, r);
    }

    if (via === '/api/stato' && req.method === 'GET') {
      return stanze.guarda(
        url.searchParams.get('codice'),
        url.searchParams.get('segreto'),
        url.searchParams.get('da'),
        (r) => rispondi(res, r.ok ? 200 : 404, r)
      );
    }

    if (via === '/api/mossa' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      const r = stanze.muovi(corpo.codice, corpo.segreto, corpo.azione);
      return rispondi(res, 200, r);           // "mossa rifiutata" non è un errore di rete
    }

    // ---------- CHI SEI E COSA HAI ----------
    // Il gettone viaggia nel corpo della richiesta e non nell'indirizzo:
    // gli indirizzi finiscono nei registri dei server e nella cronologia
    // del browser, il corpo no.
    if (via === '/api/io' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      const r = await anagrafe.entra(corpo.gettone, nomePulito(corpo.nome));
      const suo = await anagrafe.stato(r.gettone);
      // il gettone torna indietro SOLO a chi l'ha appena ricevuto
      return rispondi(res, 200, { ok: true, gettone: r.gettone, nuovo: r.nuovo, ...suo });
    }

    if (via === '/api/premio' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      return rispondi(res, 200, await anagrafe.ritiraIlPremio(corpo.gettone));
    }

    if (via === '/api/compra' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      const quante = Number(corpo.carte);
      return rispondi(res, 200, await anagrafe.compraPacchetto(corpo.gettone, quante, corpo.tipo));
    }

    if (via === '/api/ricarica' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      return rispondi(res, 200, await anagrafe.ricarica(corpo.gettone, corpo.offerta, corpo.ricevuta));
    }

    // ---------- COME SI PUÒ ENTRARE ----------
    // La pagina di accesso lo chiede prima di disegnare i bottoni:
    // così mostra solo quelli che funzionano davvero.
    if (via === '/api/accessi' && req.method === 'GET') {
      return rispondi(res, 200, {
        ok: true,
        ospite: true,
        email: true,
        fornitori: accessi.attivi(),
        // l'identificativo pubblico serve al browser per chiamare
        // Google; il segreto non esce di qui e non serve a lui
        googleIdApp: process.env.GOOGLE_ID_APP || null,
        facebookIdApp: process.env.FACEBOOK_ID_APP || null
      });
    }

    // ---------- REGISTRARSI, ENTRARE, RECUPERARE ----------
    if (via === '/api/registrati' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      const r = await conti.registrati(corpo.email, corpo.password, nomePulito(corpo.nome), corpo.gettone);
      if (!r.ok) return rispondi(res, 400, r);
      const suo = await anagrafe.stato(r.gettone);
      return rispondi(res, 200, { ...r, ...suo });
    }

    if (via === '/api/accedi' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      const r = await conti.accedi(corpo.email, corpo.password);
      if (!r.ok) return rispondi(res, 401, r);
      const suo = await anagrafe.stato(r.gettone);
      return rispondi(res, 200, { ...r, ...suo });
    }

    if (via === '/api/recupera' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      // la risposta è sempre la stessa: non si deve poter capire se
      // quell'indirizzo è registrato
      return rispondi(res, 200, await conti.chiediRecupero(corpo.email));
    }

    if (via === '/api/reimposta' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      const r = await conti.reimposta(corpo.gettoneRecupero, corpo.password);
      if (!r.ok) return rispondi(res, 400, r);
      const suo = await anagrafe.stato(r.gettone);
      return rispondi(res, 200, { ...r, ...suo });
    }

    if (via === '/api/recupero-valido' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false });
      return rispondi(res, 200, await conti.collegamentoValido(corpo.gettoneRecupero));
    }

    if (via === '/api/entra-ospite' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      const r = await accessi.entraComeOspite(nomePulito(corpo.nome));
      const suo = await anagrafe.stato(r.gettone);
      return rispondi(res, 200, { ...r, ...suo });
    }

    if (via === '/api/entra-con' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      if (!FORNITORI.includes(corpo.fornitore)) {
        return rispondi(res, 400, { ok: false, motivo: 'Non so cosa sia "' + String(corpo.fornitore).slice(0, 20) + '".' });
      }
      const r = await accessi.entraCon(corpo.fornitore, corpo.credenziale, corpo.gettone, nomePulito(corpo.nome));
      if (!r.ok) return rispondi(res, 401, r);
      const suo = await anagrafe.stato(r.gettone);
      return rispondi(res, 200, { ...r, ...suo });
    }

    if (via === '/api/chi-sono' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      if (!corpo) return rispondi(res, 400, { ok: false, motivo: 'Messaggio illeggibile.' });
      const social = await accessi.comeSeiEntrato(corpo.gettone);
      const conto = await conti.comeSeiRegistrato(corpo.gettone);
      return rispondi(res, 200, { ...social, ...conto });
    }

    if (via === '/api/carte' && req.method === 'GET') {
      // i testi e i numeri delle carte: pubblici, servono al tavolo per
      // scrivere i nomi degli eroi. Niente di segreto qui dentro.
      return rispondi(res, 200, { ok: true, carte: CARTE });
    }

    if (via === '/api/salute') {
      // Serve all'host per capire se il server è vivo. Non dice niente
      // di nessuno: solo che risponde e da quanto è in piedi.
      return rispondi(res, 200, {
        ok: true,
        tavoliAperti: stanze.quante(),
        giocatoriRegistrati: await anagrafe.quanti(),
        magazzino: archivio.nome,
        accessiAttivi: ['ospite'].concat(accessi.attivi()),
        inPiediDa: Math.round(process.uptime()) + 's'
      });
    }

    if (via === '/api/registro' && req.method === 'GET') {
      const r = stanze.registroDi(url.searchParams.get('codice'));
      return rispondi(res, r ? 200 : 404, r || { errore: 'Tavolo inesistente.' });
    }

    return rispondi(res, 404, { errore: 'Non so cosa sia ' + via });
  } catch (e) {
    console.error('errore inatteso su', via, e);
    return rispondi(res, 500, { ok: false, motivo: 'Qualcosa è andato storto qui dentro.' });
  }
});

// Da quale indirizzo arriva la richiesta. Dietro un host c'è sempre un
// proxy davanti, e l'indirizzo vero lo mette lui in un'intestazione: se
// guardassimo solo la connessione, tutti sembrerebbero lo stesso e il
// limite sui tavoli non servirebbe a niente.
function chiChiama(req) {
  const dietro = req.headers['fly-client-ip'] ||
                 req.headers['x-forwarded-for'] ||
                 req.headers['x-real-ip'];
  if (typeof dietro === 'string' && dietro) return dietro.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

function nomePulito(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[<>&"']/g, '').trim().slice(0, 20);
  return s || null;
}

// una domanda tenuta appesa dura 25 secondi: il server non deve
// chiuderla prima credendola morta
server.headersTimeout = 60000;
server.requestTimeout = 60000;
server.keepAliveTimeout = 65000;

// ------------------------------------------------------------
// DOVE MI TROVA IL MIO AMICO
// "localhost" vale solo per chi sta davanti a questo computer. Se
// l'amico è sulla stessa rete di casa gli serve l'indirizzo della
// scheda di rete, e cercarlo nelle impostazioni di Windows è una
// seccatura: lo stampo io all'avvio.
// ------------------------------------------------------------
function indirizziDiRete() {
  const trovati = [];
  const schede = os.networkInterfaces();
  for (const nome of Object.keys(schede)) {
    for (const s of schede[nome] || []) {
      if (s.family === 'IPv4' && !s.internal) trovati.push(s.address);
    }
  }
  return trovati;
}

if (process.env.NON_AVVIARE !== '1') {
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error('\n  La porta ' + PORTA + ' è già occupata da qualcos\'altro.');
      console.error('  Prova con un\'altra:   set PORTA=8090 && node server/server.js\n');
      process.exit(1);
    }
    throw e;
  });

  server.listen(PORTA, '0.0.0.0', () => {
    // SU UN HOST NON SIAMO SUL COMPUTER DI CASA.
    // Le righe qui sotto parlano di localhost, del wi-fi e di Ctrl+C:
    // in una finestra di registro su Render non vogliono dire niente e
    // confondono chi va a leggersi i log per capire cosa non va.
    const suUnHost = !!(process.env.RENDER || process.env.FLY_APP_NAME || process.env.PORT);
    const riga = '─'.repeat(52);
    console.log('\n' + riga);
    console.log('  BURRACO LEGENDS — il tavolo è aperto');
    console.log(riga);

    if (suUnHost) {
      console.log('\n  In ascolto sulla porta ' + PORTA + '.');
      console.log('  L\'indirizzo pubblico lo assegna l\'host: guardalo nel suo pannello.');
      console.log('\n  Magazzino:          ' + DOVE_SALVO);
      // Il disco effimero e' la cosa che sorprende di piu': meglio
      // scriverlo a ogni avvio che scoprirlo quando spariscono le carte.
      if (!DOVE_SALVO.startsWith('/dati')) {
        console.log('\n  ATTENZIONE: questo magazzino NON sopravvive a un riavvio.');
        console.log('  Sharkini e album ripartono da zero ogni volta che il');
        console.log('  server si riaccende. Va bene per provare, non per giocare');
        console.log('  sul serio: per quello serve un disco vero o un database.');
      }
      console.log(riga + '\n');
      return;
    }

    console.log('\n  Tu apri:            http://localhost:' + PORTA);
    const rete = indirizziDiRete();
    if (rete.length) {
      console.log('\n  Chi è sulla tua stessa rete (wi-fi di casa) apre:');
      for (const ip of rete) console.log('                      http://' + ip + ':' + PORTA);
    }
    console.log('\n  Da fuori casa serve un tunnel: vedi COME-GIOCARE.md');
    console.log('\n  Magazzino:          ' + DOVE_SALVO);
    console.log('\n  Per fermare il server: Ctrl+C in questa finestra.');
    console.log(riga + '\n');
  });
}

// ------------------------------------------------------------
// SPEGNERSI CON GARBO
// Quando l'host aggiorna il server manda un segnale e poi, se non
// rispondi, taglia. Le domande tenute appese vanno chiuse prima, o chi
// sta giocando vede cadere il collegamento senza motivo.
// ------------------------------------------------------------
async function spegni(segnale) {
  console.log('\n  Ricevuto ' + segnale + ': salvo e mi fermo.');
  // PRIMA i dati sul disco. Se il server si spegnesse lasciando in
  // sospeso l'ultimo salvataggio, qualcuno si ritroverebbe senza le
  // carte che ha appena aperto — e sarebbe colpa nostra.
  try { await archivio.chiudi(); } catch (e) { console.error('  non sono riuscito a salvare:', e.message); }

  server.close(() => process.exit(0));

  // POI SI TAGLIANO LE DOMANDE APPESE, ED È LA PARTE CHE MANCAVA.
  // Il tavolo tiene aperta una richiesta per venticinque secondi in
  // attesa che l'altro muova. server.close() aspetta che ogni
  // collegamento aperto finisca da solo: con quelle richieste appese,
  // premere Ctrl+C sembrava non fare NIENTE per parecchi secondi.
  // Chiuderle è corretto anche per chi gioca: il tavolo riprova da
  // solo, mentre un'attesa che muore in silenzio lo lascia fermo.
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();

  console.log('  Fatto. Se la finestra chiede "Terminare il processo batch (S/N)?", rispondi S.\n');

  // se qualcosa resta comunque appeso, dopo qualche secondo si chiude
  const taglio = setTimeout(() => process.exit(0), 3000);
  if (taglio.unref) taglio.unref();
}
if (process.env.NON_AVVIARE !== '1') {
  process.on('SIGTERM', () => spegni('SIGTERM'));
  process.on('SIGINT', () => spegni('SIGINT'));
}

export { server, stanze };
