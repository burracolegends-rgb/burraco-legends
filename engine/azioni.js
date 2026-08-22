// ============================================================
// BURRACO LEGENDS — L'UNICA PORTA DA CUI SI ENTRA
//
// Finora le mosse si chiamavano una per una dalla pagina:
// actionDraw(stato, chi), actionDiscard(stato, chi, carta)... Andava
// bene finché "chi" lo decidevamo noi. Sul server "chi" arriva dalla
// rete, e con lui arriva tutto il resto: identificativi di carte, indici,
// semi. Un client scritto male manda campi sbagliati; un client scritto
// male apposta manda campi pensati per far male.
//
// Da qui in poi si passa da una funzione sola, `applica`, che fa tre
// cose prima di lasciar toccare la partita:
//
//   1. CHI SEI LO DECIDO IO. L'indice del giocatore lo passa il server
//      dalla connessione. Se nel messaggio ce n'è un altro, si ignora.
//      È la riga più importante del file.
//   2. IL MESSAGGIO DEVE AVERE LA FORMA GIUSTA. Prima di arrivare al
//      motore, ogni campo viene controllato: è una stringa? è corta? è
//      un numero intero nell'intervallo? Il motore si aspetta dati
//      sensati e non è compito suo diffidare.
//   3. IL TEMPO SCADUTO SI PAGA PRIMA. Se il turno era già scaduto
//      mentre nessuno guardava, si chiude quello prima di aprire il
//      nuovo: altrimenti chi arriva tardi gioca un turno che non è più
//      suo.
//
// Le regole del gioco restano dove sono. Qui non si decide niente su
// come si gioca, solo se questo messaggio merita di essere ascoltato.
// ============================================================
import {
  actionDraw, actionTakeDiscardPile, actionLayMeld, actionAttachToMeld,
  actionDiscard, usaAbilitaSpeciale, giocaCartaMagica, checkTurnTimeout, abbandona
} from './partita.js';
import { SUITS } from './core-rules.js';

// Nessuna mano arriva a tanto: serve solo a fermare i messaggi assurdi
// prima che diventino cicli lunghi.
const MASSIME_CARTE_PER_MOSSA = 30;
const MASSIMA_LUNGHEZZA_ID = 40;

export const AZIONI = [
  'pesca', 'prendi_scarti', 'cala', 'aggancia', 'abilita', 'magia', 'scarta', 'abbandona'
];

// ------------------------------------------------------------
// I CONTROLLI DI FORMA
// Restituiscono il valore ripulito, oppure null se non va bene. Non
// tentano di aggiustare: un messaggio storto è storto.
// ------------------------------------------------------------
function unId(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > MASSIMA_LUNGHEZZA_ID) return null;
  return s;
}

function elencoDiId(v) {
  if (!Array.isArray(v) || v.length === 0 || v.length > MASSIME_CARTE_PER_MOSSA) return null;
  const fuori = [];
  for (const x of v) {
    const id = unId(x);
    if (id === null) return null;
    fuori.push(id);
  }
  // la stessa carta due volte nella stessa calata non esiste
  if (new Set(fuori).size !== fuori.length) return null;
  return fuori;
}

function unSeme(v) { return SUITS.includes(v) ? v : null; }

function unIndice(v, quanti) {
  if (!Number.isInteger(v) || v < 0 || v >= quanti) return null;
  return v;
}

const no = (motivo) => ({ ok: false, motivo });

// ------------------------------------------------------------
// LE CARTE SONO DAVVERO TUE?
// Il motore lo ricontrolla, ma qui il messaggio è ancora "di rete" e un
// rifiuto chiaro adesso vale più di un errore oscuro dopo.
// ------------------------------------------------------------
function tutteInMano(giocatore, ids) {
  const inMano = new Set(giocatore.hand.map((c) => c.id));
  return ids.filter((id) => !inMano.has(id));
}

// ------------------------------------------------------------
// APPLICA
//   stato     — la partita vera, quella del server
//   azione    — { tipo, ... } così com'è arrivato dalla rete
//   giocatore — CHI HA MANDATO IL MESSAGGIO, stabilito dalla connessione
//   adesso    — l'orologio del server
// ------------------------------------------------------------
export function applica(stato, azione, giocatore, adesso = Date.now()) {
  if (!stato) return no('Partita inesistente.');
  if (giocatore !== 0 && giocatore !== 1) return no('Non risulti seduto a questo tavolo.');
  if (!azione || typeof azione !== 'object') return no('Messaggio incomprensibile.');

  const tipo = azione.tipo;
  if (typeof tipo !== 'string' || !AZIONI.includes(tipo)) {
    return no('Non so cosa vuol dire "' + String(tipo).slice(0, 20) + '".');
  }
  if (stato.status !== 'in_progress') return no('La partita è finita.');

  // I TRENTA SECONDI IN CUI SI GUARDA E BASTA.
  // Il rifiuto sta qui, non nel browser: il browser si puo' aggirare, e
  // uno che comincia a giocare mentre l'altro sta ancora guardando avrebbe
  // mezzo turno di vantaggio.
  if (stato.iniziaAlle) {
    const inizio = Date.parse(stato.iniziaAlle);
    if (!isNaN(inizio) && adesso < inizio) {
      return no('Si comincia fra ' + Math.ceil((inizio - adesso) / 1000) + ' secondi: per ora si guarda il tavolo.');
    }
  }

  // Il tempo scaduto si salda prima. Se il turno di qualcuno era già
  // andato, quel turno si chiude adesso — e può darsi che dopo tocchi
  // proprio a chi ha appena scritto, o che non tocchi più a lui.
  const scaduto = checkTurnTimeout(stato, adesso);
  if (stato.status !== 'in_progress') {
    return { ok: false, motivo: 'La partita è finita mentre stavi giocando.', turnoScaduto: true };
  }

  const p = stato.players[giocatore];
  let esito;

  switch (tipo) {
    case 'pesca':
      esito = actionDraw(stato, giocatore, adesso);
      break;

    case 'prendi_scarti':
      esito = actionTakeDiscardPile(stato, giocatore, adesso);
      break;

    case 'cala': {
      const carte = elencoDiId(azione.carte);
      if (!carte) return no('Elenco di carte non valido.');
      const fuori = tutteInMano(p, carte);
      if (fuori.length) return no('Non hai in mano: ' + fuori.join(', ') + '.');
      esito = actionLayMeld(stato, giocatore, carte, adesso);
      break;
    }

    case 'aggancia': {
      const gioco = unId(azione.gioco);
      if (!gioco) return no('Non hai detto a quale gioco.');
      const carte = elencoDiId(azione.carte);
      if (!carte) return no('Elenco di carte non valido.');
      const fuori = tutteInMano(p, carte);
      if (fuori.length) return no('Non hai in mano: ' + fuori.join(', ') + '.');
      esito = actionAttachToMeld(stato, giocatore, gioco, carte, adesso);
      break;
    }

    case 'abilita': {
      const seme = unSeme(azione.seme);
      if (!seme) return no('Quale eroe attacca?');
      // il bersaglio può mancare: alcune abilità se lo scelgono da sole
      const bersaglio = azione.bersaglio === undefined || azione.bersaglio === null
        ? null : unSeme(azione.bersaglio);
      if (azione.bersaglio !== undefined && azione.bersaglio !== null && !bersaglio) {
        return no('Bersaglio non valido.');
      }
      esito = usaAbilitaSpeciale(stato, giocatore, seme, bersaglio, adesso);
      break;
    }

    case 'magia': {
      const quante = p.magic && p.magic.selection ? p.magic.selection.length : 0;
      const indice = unIndice(azione.indice, quante);
      if (indice === null) return no('Quella carta magica non è fra le tue.');
      esito = giocaCartaMagica(stato, giocatore, indice, adesso);
      break;
    }

    // Abbandonare si puo' SEMPRE, anche fuori dal proprio turno: e'
    // l'unica azione che non e' una mossa di gioco ma un modo di
    // alzarsi da tavola. Aspettare il proprio turno per potersene
    // andare non avrebbe senso.
    case 'abbandona': {
      esito = abbandona(stato, giocatore, adesso);
      break;
    }

    case 'scarta': {
      const carta = unId(azione.carta);
      if (!carta) return no('Quale carta vuoi scartare?');
      const fuori = tutteInMano(p, [carta]);
      if (fuori.length) return no('Quella carta non è in mano tua.');
      esito = actionDiscard(stato, giocatore, carta, adesso);
      break;
    }
  }

  return normalizza(esito, scaduto.expired);
}

// Il motore in certi punti dice `reason`, in altri `motivo`: da qui
// esce sempre allo stesso modo, così il server e il tavolo non devono
// ricordarsi quale funzione parla quale lingua.
function normalizza(esito, turnoScaduto) {
  const base = turnoScaduto ? { turnoScaduto: true } : {};
  if (!esito) return { ...base, ok: false, motivo: 'Mossa non eseguita.' };
  if (esito.ok) return { ...base, ...esito, ok: true };
  return { ...base, ...esito, ok: false, motivo: esito.motivo || esito.reason || 'Mossa rifiutata.' };
}

// ------------------------------------------------------------
// IL TEMPO CHE PASSA DA SOLO
// Il turno scade anche se nessuno tocca niente. Il server chiama questa
// a intervalli; è separata da `applica` perché non nasce da un messaggio
// di nessuno — è l'orologio che parla.
// ------------------------------------------------------------
export function faiScorrereIlTempo(stato, adesso = Date.now()) {
  if (!stato || stato.status !== 'in_progress') return { scaduto: false };
  const r = checkTurnTimeout(stato, adesso);
  return {
    scaduto: !!r.expired,
    scartata: r.scartata || null,
    partitaFinita: stato.status !== 'in_progress'
  };
}
