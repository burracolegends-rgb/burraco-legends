// ============================================================
// BURRACO LEGENDS — IL PANNELLO DI CHI IL GIOCO LO MANDA AVANTI
//
// Una pagina riservata a chi gestisce il gioco: quanti giocano, quanto
// girano gli sharkini, chi ha comprato, e il modo per fermare chi si
// comporta male. Non è una parte del gioco — è lo strumento di chi lo
// tiene in piedi, e va trattato come tale: chiuso a chiave, e con le
// mani legate corte anche a chi entra.
//
// LE CREDENZIALI STANNO NELLE VARIABILI D'AMBIENTE, NON NEL MAGAZZINO.
// Sembra un dettaglio e non lo è. Il magazzino dei giocatori, finché
// non sta su un disco vero, si azzera a ogni pubblicazione: un account
// amministratore tenuto lì dentro sparirebbe ogni volta — e nella
// finestra dopo il riavvio CHIUNQUE potrebbe registrarsi con la nostra
// email e ritrovarsi amministratore. Le variabili d'ambiente invece le
// legge solo chi ha le chiavi dell'host, e sopravvivono a tutto.
//
//   ADMIN_EMAIL      le email ammesse, separate da virgola
//   ADMIN_PASSWORD   la password del pannello
//
// Senza tutt'e due il pannello NON ESISTE: le rotte rispondono come se
// non fossero mai state scritte. Su un sito pubblico non si annuncia
// nemmeno l'esistenza di una porta di servizio.
//
// DUE CANCELLI, NON UNO.
// L'email dice CHI SEI, e per dimostrarla devi già essere entrato nel
// tuo account di gioco con la sua password. La password del pannello
// dice che sei DAVVERO tu: è una seconda chiave, custodita in un posto
// diverso. Chi rubasse l'account di gioco resterebbe fuori di qui.
//
// LA SESSIONE VIAGGIA NEL CORPO DELLA RICHIESTA, NON IN UN COOKIE.
// Stessa scelta del gettone di gioco (vedi server.js, /api/io). Un
// cookie il browser lo allega da solo a ogni richiesta, comprese quelle
// partite da una pagina qualunque di internet: è il modo classico in
// cui si fa fare a un amministratore, a sua insaputa, una cosa che non
// voleva fare. Un gettone che la pagina allega a mano non ha quel
// problema, e non finisce negli indirizzi né nei registri del server.
//
// IL PANNELLO NON VEDE MAI UN GETTONE DI GIOCO.
// Il gettone di un giocatore non è un identificativo: è la sua chiave
// di casa — chi ce l'ha È lui. Un elenco che li mostrasse tutti
// trasformerebbe una password del pannello rubata nel furto di ogni
// account insieme. Quindi qui dentro i giocatori si chiamano con le
// prime dieci cifre del gettone, che bastano a distinguerli e non
// aprono niente; il gettone intero resta nel magazzino.
//
// LE SESSIONI VIVONO IN MEMORIA e muoiono insieme al server: dopo un
// aggiornamento si rientra. Sono minuti nostri, non di chi gioca.
// ============================================================
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const INATTIVITA_MS = 2 * 60 * 60 * 1000;         // due ore ferme e la sessione scade
export const DURATA_MASSIMA_MS = 12 * 60 * 60 * 1000;    // e comunque mai oltre mezza giornata
export const TENTATIVI_PRIMA_DI_ASPETTARE = 5;
export const ATTESA_DOPO_I_TENTATIVI_MS = 15 * 60 * 1000;
export const CIFRE_ID = 10;
// Quanto si può tenere fermo un giocatore. L'ultima voce è la
// sospensione senza scadenza: si scrive `null` invece di una data
// lontanissima, così chi legge il magazzino capisce cosa vuol dire.
export const DURATE_SOSPENSIONE = [1, 3, 7, 30, null];

// Il sommario legge TUTTO il magazzino: con due giocatori non si
// sente, con duemila sì. Si tiene da parte per un quarto di minuto —
// un pannello aggiornato a quindici secondi fa è aggiornato abbastanza.
const VALIDITA_SOMMARIO_MS = 15 * 1000;

const GIORNO_MS = 24 * 60 * 60 * 1000;
const PREFISSO_GIOCATORE = 'giocatore:';
const chiaveSospensione = (gettone) => 'sospeso:' + gettone;

// La stessa frase per ogni modo di sbagliare l'ingresso. Se dicesse
// "questa email non è fra gli amministratori" regalerebbe a chiunque
// la conferma di quali lo sono.
const NON_TORNA = 'Credenziali non valide.';

// Confronto che impiega lo stesso tempo sia quando la password è giusta
// sia quando è sbagliata. Un confronto normale si ferma alla prima
// lettera diversa, e quella differenza di tempo — piccolissima, ma
// misurabile — si può usare per indovinare la password una lettera
// alla volta.
function stessaCosa(a, b) {
  const uno = Buffer.from(String(a || ''), 'utf-8');
  const due = Buffer.from(String(b || ''), 'utf-8');
  if (uno.length !== due.length) {
    // Lunghezze diverse: la risposta è già no, ma si confronta lo
    // stesso qualcosa, per non farlo capire dalla velocità.
    timingSafeEqual(uno, uno);
    return false;
  }
  return timingSafeEqual(uno, due);
}

export function creaAmministrazione({
  archivio, anagrafe, orologio = Date.now,
  emailAmmesse = '', password = '',
  tavoliAperti = () => 0
}) {
  if (!archivio) throw new Error('Il pannello ha bisogno di un magazzino.');
  if (!anagrafe) throw new Error('Il pannello ha bisogno dell\'anagrafe, per sapere chi è chi.');

  const ammesse = String(emailAmmesse || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const chiave = String(password || '');
  // Senza email ammesse o senza password il pannello resta spento. Non
  // è un errore da segnalare: è la condizione normale di chi ha scaricato
  // il progetto e lo sta solo facendo girare.
  const acceso = ammesse.length > 0 && chiave.length > 0;

  const sessioni = new Map();    // gettone di sessione → { email, apertaIl, ultimoUso }
  const tentativi = new Map();   // da chi arriva → { quanti, bloccatoFino }
  let sommarioTenutoDaParte = null;

  const idDi = (gettone) => String(gettone || '').slice(0, CIFRE_ID);

  // ----------------------------------------------------------
  // CHI PUÒ VEDERE LA PORTA
  // La home e il profilo lo chiedono per decidere se mostrare la voce
  // "Amministrazione". Sapere che la porta c'è non apre niente: per
  // entrare serve comunque la password del pannello.
  // ----------------------------------------------------------
  async function eAmministratore(gettone) {
    if (!acceso || !gettone) return false;
    const g = await anagrafe.carica(gettone);
    if (!g || !g.email) return false;
    return ammesse.includes(String(g.email).trim().toLowerCase());
  }

  // ----------------------------------------------------------
  // I TENTATIVI SI CONTANO, come per gli accessi normali
  // (server/accesso-email.js): senza, provare password a raffica è solo
  // questione di pazienza.
  // ----------------------------------------------------------
  function quantoDeviAspettare(da) {
    const t = tentativi.get(da);
    if (!t || !t.bloccatoFino) return 0;
    return Math.max(0, t.bloccatoFino - orologio());
  }

  function sbagliato(da) {
    const t = tentativi.get(da) || { quanti: 0, bloccatoFino: 0 };
    t.quanti += 1;
    if (t.quanti >= TENTATIVI_PRIMA_DI_ASPETTARE) {
      t.bloccatoFino = orologio() + ATTESA_DOPO_I_TENTATIVI_MS;
      t.quanti = 0;
    }
    tentativi.set(da, t);
  }

  // ----------------------------------------------------------
  // ENTRARE
  // ----------------------------------------------------------
  async function entra(gettone, passwordData, da = '?') {
    if (!acceso) return { ok: false, motivo: NON_TORNA };

    const aspetta = quantoDeviAspettare(da);
    if (aspetta > 0) {
      return {
        ok: false,
        motivo: 'Troppi tentativi. Riprova fra ' + Math.ceil(aspetta / 60000) + ' minuti.'
      };
    }

    const suo = await eAmministratore(gettone);
    const giusta = stessaCosa(passwordData, chiave);
    // Si controllano TUTTE E DUE le cose prima di rispondere, sempre:
    // uscire subito quando l'email non è ammessa direbbe, col solo
    // tempo di risposta, quali email lo sono.
    if (!suo || !giusta) {
      sbagliato(da);
      return { ok: false, motivo: NON_TORNA };
    }

    tentativi.delete(da);
    const g = await anagrafe.carica(gettone);
    const email = String(g.email).trim().toLowerCase();
    const sessione = randomBytes(32).toString('hex');
    sessioni.set(sessione, { email, apertaIl: orologio(), ultimoUso: orologio() });
    await annota(email, 'accesso', null, 'è entrato nel pannello');
    return { ok: true, sessione, email };
  }

  function esci(sessione) {
    sessioni.delete(String(sessione || ''));
    return { ok: true };
  }

  // Restituisce chi è, oppure null. Chiamata a ogni richiesta del
  // pannello: è lei il vero cancello, non il bottone "entra".
  function chiSei(sessione) {
    if (!acceso || typeof sessione !== 'string') return null;
    const s = sessioni.get(sessione);
    if (!s) return null;
    const adesso = orologio();
    if (adesso - s.ultimoUso > INATTIVITA_MS || adesso - s.apertaIl > DURATA_MASSIMA_MS) {
      sessioni.delete(sessione);
      return null;
    }
    s.ultimoUso = adesso;
    return { email: s.email };
  }

  // ----------------------------------------------------------
  // IL REGISTRO DELLE AZIONI
  // Siamo in più di uno a poter fermare un giocatore: ognuno deve
  // vedere cosa ha fatto l'altro, e quando. Vale anche per sé stessi,
  // fra un mese, quando arriva la domanda "perché questo è sospeso?".
  // ----------------------------------------------------------
  async function annota(chi, azione, bersaglio, dettaglio) {
    const quando = orologio();
    await archivio.scrivi(
      'registro-admin:' + String(quando).padStart(14, '0') + '-' + randomBytes(4).toString('hex'),
      { quando, chi, azione, bersaglio, dettaglio }
    );
  }

  async function registro(quante = 40) {
    const chiavi = (await archivio.tutte())
      .filter((k) => k.startsWith('registro-admin:'))
      .sort()
      .reverse()
      .slice(0, quante);
    const voci = [];
    for (const k of chiavi) {
      const v = await archivio.leggi(k);
      if (v) voci.push(v);
    }
    return voci;
  }

  // ----------------------------------------------------------
  // SOSPENDERE, E RIMETTERE DENTRO
  //
  // DETTO ONESTAMENTE: contro un ospite questa è un dosso, non un muro.
  // L'identità di chi non si è registrato è un gettone nel suo browser,
  // e "cancella i dati del sito" gliene fa nascere uno nuovo. Ferma chi
  // combina guai per noia, non chi ci tiene. Su un account registrato
  // invece serve davvero: per rifarsi da capo gli serve un'altra email.
  //
  // Riattivare NON cancella niente: scrive una scadenza già passata. Il
  // magazzino non sa cancellare (vedi archivio.js: quattro funzioni e
  // basta) e comunque è meglio così — resta scritto che quel giocatore
  // era stato fermato e che poi è stato rimesso dentro.
  // ----------------------------------------------------------
  async function gettoneDaId(id) {
    const cercato = String(id || '').trim();
    if (cercato.length < 4) return null;
    const trovati = (await archivio.tutte())
      .filter((k) => k.startsWith(PREFISSO_GIOCATORE) && k.slice(PREFISSO_GIOCATORE.length).startsWith(cercato))
      .map((k) => k.slice(PREFISSO_GIOCATORE.length));
    // Due giocatori diversi con lo stesso inizio di gettone: non capita
    // mai davvero (dieci cifre esadecimali sono un milione di miliardi
    // di possibilità), ma indovinare a chi si riferiva sarebbe l'unico
    // errore imperdonabile qui dentro — si preferisce non fare niente.
    return trovati.length === 1 ? trovati[0] : null;
  }

  async function sospensioneDi(gettone) {
    const s = await archivio.leggi(chiaveSospensione(gettone));
    if (!s) return null;
    if (s.fino !== null && s.fino !== undefined && s.fino <= orologio()) return null;
    return { fino: s.fino === undefined ? null : s.fino, motivo: s.motivo, daChi: s.daChi, quando: s.quando };
  }

  // Quello che chiedono le rotte di gioco prima di far sedere qualcuno
  // a un tavolo: `null` vuol dire "passa pure".
  async function bloccato(gettone) {
    if (!gettone) return null;
    const s = await sospensioneDi(gettone);
    if (!s) return null;
    const quando = s.fino === null
      ? 'Questa sospensione non ha una scadenza.'
      : 'Potrai rientrare il ' + new Date(s.fino).toLocaleDateString('it-IT') + '.';
    return {
      ok: false, sospeso: true, fino: s.fino,
      motivo: 'Il tuo accesso alle partite è sospeso' + (s.motivo ? ': ' + s.motivo + '.' : '.') + ' ' + quando
    };
  }

  async function sospendi(id, giorni, motivo, chi) {
    const gettone = await gettoneDaId(id);
    if (!gettone) return { ok: false, motivo: 'Nessun giocatore con questo identificativo.' };
    const durata = giorni === null || giorni === undefined || giorni === '' ? null : Number(giorni);
    if (durata !== null && !(durata > 0)) return { ok: false, motivo: 'La durata non ha senso.' };
    const perche = String(motivo || '').trim().slice(0, 200);
    if (!perche) return { ok: false, motivo: 'Scrivi perché lo stai sospendendo: fra un mese servirà a te.' };

    const adesso = orologio();
    const fino = durata === null ? null : adesso + durata * GIORNO_MS;
    await archivio.scrivi(chiaveSospensione(gettone), { fino, motivo: perche, daChi: chi, quando: adesso });
    await annota(chi, 'sospensione', idDi(gettone),
      (durata === null ? 'sospeso senza scadenza' : 'sospeso per ' + durata + ' giorni') + ': ' + perche);
    sommarioTenutoDaParte = null;
    return { ok: true, id: idDi(gettone), fino };
  }

  async function riattiva(id, chi) {
    const gettone = await gettoneDaId(id);
    if (!gettone) return { ok: false, motivo: 'Nessun giocatore con questo identificativo.' };
    const vecchia = await archivio.leggi(chiaveSospensione(gettone));
    if (!vecchia) return { ok: false, motivo: 'Questo giocatore non è sospeso.' };
    const adesso = orologio();
    await archivio.scrivi(chiaveSospensione(gettone), {
      ...vecchia, fino: adesso, riattivatoIl: adesso, riattivatoDa: chi
    });
    await annota(chi, 'riattivazione', idDi(gettone), 'rimesso dentro');
    sommarioTenutoDaParte = null;
    return { ok: true, id: idDi(gettone) };
  }

  // ----------------------------------------------------------
  // I NUMERI
  // Tutti ricavati da quello che il magazzino già tiene: niente
  // contatori nuovi da mantenere allineati, che è il modo più facile
  // per ritrovarsi due verità diverse sullo stesso fatto.
  // ----------------------------------------------------------
  async function leggiTuttiIGiocatori() {
    const chiavi = (await archivio.tutte()).filter((k) => k.startsWith(PREFISSO_GIOCATORE));
    const fuori = [];
    for (const k of chiavi) {
      const g = await archivio.leggi(k);
      if (!g) continue;
      const gettone = k.slice(PREFISSO_GIOCATORE.length);
      fuori.push({ gettone, g, sospensione: await sospensioneDi(gettone) });
    }
    return fuori;
  }

  async function sommario() {
    const adesso = orologio();
    if (sommarioTenutoDaParte && adesso - sommarioTenutoDaParte.quando < VALIDITA_SOMMARIO_MS) {
      return sommarioTenutoDaParte.dati;
    }

    const tutti = await leggiTuttiIGiocatori();
    const n = {
      giocatori: tutti.length, registrati: 0, ospiti: 0, sospesi: 0,
      attiviOggi: 0, attivi7Giorni: 0, attivi30Giorni: 0, nuoviOggi: 0, nuovi7Giorni: 0,
      sharkiniInGiro: 0, pacchettiAperti: 0, carteAperte: 0,
      ricariche: 0, ricaricheEuro: 0, ricaricheVerificate: 0
    };
    const ultimeRicariche = [];

    for (const { g, sospensione } of tutti) {
      if (g.email) n.registrati++; else n.ospiti++;
      if (sospensione) n.sospesi++;

      const visto = Number(g.ultimaVisita) || 0;
      if (adesso - visto < GIORNO_MS) n.attiviOggi++;
      if (adesso - visto < 7 * GIORNO_MS) n.attivi7Giorni++;
      if (adesso - visto < 30 * GIORNO_MS) n.attivi30Giorni++;

      const nato = Number(g.creatoIl) || 0;
      if (adesso - nato < GIORNO_MS) n.nuoviOggi++;
      if (adesso - nato < 7 * GIORNO_MS) n.nuovi7Giorni++;

      n.sharkiniInGiro += Number(g.serie && g.serie.saldo) || 0;
      n.pacchettiAperti += Number(g.pacchettiAperti) || 0;
      n.carteAperte += Number(g.carteAperte) || 0;

      for (const r of (g.ricariche || [])) {
        n.ricariche++;
        n.ricaricheEuro += Number(r.euro) || 0;
        if (r.verificata) n.ricaricheVerificate++;
        ultimeRicariche.push({ quando: r.quando, euro: r.euro, sharkini: r.sharkini,
                               verificata: !!r.verificata, nome: g.nome || null });
      }
    }

    ultimeRicariche.sort((a, b) => (b.quando || 0) - (a.quando || 0));
    n.ricaricheEuro = Math.round(n.ricaricheEuro * 100) / 100;

    const dati = {
      ok: true, adesso,
      ...n,
      tavoliApertiOra: tavoliAperti(),
      ultimeRicariche: ultimeRicariche.slice(0, 10),
      // Detto qui, non lasciato capire dai numeri: finché non c'è un
      // sistema di pagamento collegato, "ricariche" vuol dire "volte
      // che qualcuno ha premuto compra", non euro incassati.
      ricaricheDiProva: n.ricaricheVerificate === 0,
      magazzino: archivio.nome || '?'
    };
    sommarioTenutoDaParte = { quando: adesso, dati };
    return dati;
  }

  // ----------------------------------------------------------
  // L'ELENCO
  // Ordinato per ultima visita: chi c'è adesso sta in cima, che è quello
  // che serve guardare quando si va a vedere "chi sta giocando".
  // ----------------------------------------------------------
  async function elenco({ cerca = '', quanti = 50, salta = 0 } = {}) {
    const parola = String(cerca || '').trim().toLowerCase();
    const tutti = await leggiTuttiIGiocatori();

    const righe = tutti
      .map(({ gettone, g, sospensione }) => ({
        id: idDi(gettone),
        nome: g.nome || null,
        email: g.email || null,
        registrato: !!g.email,
        creatoIl: Number(g.creatoIl) || 0,
        ultimaVisita: Number(g.ultimaVisita) || 0,
        saldo: Number(g.serie && g.serie.saldo) || 0,
        pacchettiAperti: Number(g.pacchettiAperti) || 0,
        carteAperte: Number(g.carteAperte) || 0,
        carteDiverse: Object.keys(g.collezione || {}).length,
        ricariche: (g.ricariche || []).length,
        sospensione
      }))
      .filter((r) => !parola ||
        (r.nome && r.nome.toLowerCase().includes(parola)) ||
        (r.email && r.email.toLowerCase().includes(parola)) ||
        r.id.startsWith(parola))
      .sort((a, b) => b.ultimaVisita - a.ultimaVisita);

    return {
      ok: true, quantiInTutto: righe.length,
      giocatori: righe.slice(salta, salta + Math.min(Number(quanti) || 50, 200))
    };
  }

  return {
    acceso: () => acceso,
    eAmministratore, entra, esci, chiSei,
    sommario, elenco, sospendi, riattiva, registro,
    sospensioneDi, bloccato,
    idDi
  };
}
