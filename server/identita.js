// ============================================================
// BURRACO LEGENDS — ENTRARE
//
// Ci sono due modi di essere qualcuno, qui dentro.
//
// 1. OSPITE. Il browser riceve un gettone e da lì in poi il server lo
//    riconosce. Nessuna registrazione, nessuna password, si gioca
//    subito. È quello che serve adesso.
//    Il difetto è uno solo, ma va detto chiaro a chi gioca: se
//    cancelli i dati del browser o cambi telefono, quel gettone non
//    ce l'ha più nessuno e riparti da zero.
//
// 2. COLLEGATO. Lo stesso giocatore attacca al suo gettone un'identità
//    di Google o Facebook. Da quel momento può ritrovarsi ovunque:
//    entra col fornitore, il server risale al gettone, e si riprende
//    sharkini, album e serie di accessi.
//
// IL PUNTO DELICATO, E NON È QUELLO CHE SEMBRA
// Non è verificare la credenziale — quella la verifica il fornitore.
// È COSA SUCCEDE ALLE COSE CHE HAI GIÀ. Chi ha giocato due settimane
// da ospite e poi collega Google non deve perdere niente. E chi
// collega un Google che è già di un altro giocatore non deve poter
// prendere l'account di quello. Sono due casi diversi e vanno tenuti
// separati con attenzione, perché sbagliare vuol dire far sparire
// l'album a qualcuno.
//
// LA VERIFICA SI PASSA DA FUORI
// `verificatori` è un oggetto { google, facebook } di funzioni che
// ricevono una credenziale e restituiscono chi è. Così i test girano
// senza internet, e il giorno in cui Google cambia indirizzo si tocca
// un file solo.
// ============================================================
import { oltreLaDotazione } from '../engine/dotazione.js';

export const FORNITORI = ['google', 'facebook'];

// ------------------------------------------------------------
// I VERIFICATORI VERI
// Nessuna libreria: due chiamate HTTP e basta.
// ------------------------------------------------------------
export function verificatoreGoogle(idApplicazione) {
  if (!idApplicazione) return null;
  return async function (credenziale) {
    if (typeof credenziale !== 'string' || credenziale.length < 20) {
      return { ok: false, motivo: 'Credenziale Google non valida.' };
    }
    let dati;
    try {
      const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' +
                            encodeURIComponent(credenziale));
      dati = await r.json();
    } catch (e) {
      return { ok: false, motivo: 'Non riesco a parlare con Google in questo momento.' };
    }
    // IL CONTROLLO CHE CONTA: il gettone deve essere stato emesso per
    // LA NOSTRA applicazione. Senza questo, chiunque potrebbe portarci
    // un gettone Google preso da un'altra app e farsi riconoscere.
    if (!dati || !dati.sub) return { ok: false, motivo: 'Google non ha riconosciuto questo accesso.' };
    if (dati.aud !== idApplicazione) return { ok: false, motivo: 'Questo accesso non è per questa applicazione.' };
    if (dati.exp && Number(dati.exp) * 1000 < Date.now()) return { ok: false, motivo: 'Accesso scaduto, riprova.' };
    return { ok: true, fornitore: 'google', id: String(dati.sub), nome: dati.name || null };
  };
}

export function verificatoreFacebook(idApplicazione, segretoApplicazione) {
  if (!idApplicazione || !segretoApplicazione) return null;
  return async function (credenziale) {
    if (typeof credenziale !== 'string' || credenziale.length < 20) {
      return { ok: false, motivo: 'Credenziale Facebook non valida.' };
    }
    try {
      const r = await fetch('https://graph.facebook.com/debug_token?input_token=' +
        encodeURIComponent(credenziale) + '&access_token=' +
        encodeURIComponent(idApplicazione + '|' + segretoApplicazione));
      const dati = (await r.json()).data;
      if (!dati || !dati.is_valid || !dati.user_id) {
        return { ok: false, motivo: 'Facebook non ha riconosciuto questo accesso.' };
      }
      if (String(dati.app_id) !== String(idApplicazione)) {
        return { ok: false, motivo: 'Questo accesso non è per questa applicazione.' };
      }
      return { ok: true, fornitore: 'facebook', id: String(dati.user_id), nome: null };
    } catch (e) {
      return { ok: false, motivo: 'Non riesco a parlare con Facebook in questo momento.' };
    }
  };
}

// ------------------------------------------------------------
export function creaAccessi({ archivio, anagrafe, verificatori = {}, orologio = Date.now }) {
  const chiaveIdentita = (fornitore, id) => 'identita:' + fornitore + ':' + id;

  function attivi() {
    return FORNITORI.filter((f) => typeof verificatori[f] === 'function');
  }

  // ----------------------------------------------------------
  // ENTRARE COME OSPITE
  // È già tutto quello che serve per giocare. Non è un ripiego in
  // attesa del "vero" accesso: è il modo normale di cominciare, e chi
  // non vuole collegare niente può restare così per sempre.
  // ----------------------------------------------------------
  async function entraComeOspite(nome) {
    const r = await anagrafe.entra(null, nome);
    return { ok: true, gettone: r.gettone, nuovo: true, ospite: true };
  }

  // ----------------------------------------------------------
  // ENTRARE O COLLEGARSI CON UN FORNITORE
  //
  //   gettone     — chi sei ADESSO (se stai già giocando da ospite)
  //   fornitore   — 'google' | 'facebook'
  //   credenziale — quello che ti ha dato il fornitore
  //
  // Tre casi, e sono tutti importanti:
  //
  //   A) L'identità non risulta a nessuno e tu stai già giocando da
  //      ospite → si attacca al tuo giocatore. NON PERDI NIENTE: è il
  //      motivo per cui l'ospite viene prima e il collegamento dopo.
  //
  //   B) L'identità risulta già a un giocatore → entri in QUELLO. Se
  //      nel frattempo avevi roba da ospite, quella resta dov'è e non
  //      si mescola: unire due borsellini è una decisione che non
  //      posso prendere io in silenzio, e sbagliarla vuol dire far
  //      sparire l'album a qualcuno. Lo dico e basta.
  //
  //   C) Identità nuova e nessun ospite alle spalle → giocatore nuovo.
  // ----------------------------------------------------------
  async function entraCon(fornitore, credenziale, gettoneAttuale, nome) {
    const verifica = verificatori[fornitore];
    if (typeof verifica !== 'function') {
      return { ok: false, motivo: 'L\'accesso con ' + fornitore + ' non è ancora attivo.' };
    }
    const chi = await verifica(credenziale);
    if (!chi || !chi.ok) return { ok: false, motivo: (chi && chi.motivo) || 'Accesso non riuscito.' };

    const chiave = chiaveIdentita(chi.fornitore, chi.id);
    const gia = await archivio.leggi(chiave);

    // --- caso B: quell'identità ha già un giocatore ---
    if (gia && gia.gettone) {
      const suo = await anagrafe.stato(gia.gettone);
      if (suo.ok) {
        const avevaRoba = await portaviRoba(gettoneAttuale);
        return {
          ok: true, gettone: gia.gettone, ospite: false, nuovo: false,
          fornitore: chi.fornitore,
          ritrovato: true,
          // se stavo giocando da ospite e avevo qualcosa, va detto
          ospiteLasciatoIndietro: avevaRoba
        };
      }
      // il giocatore collegato non c'è più: l'identità è orfana, si
      // riparte come se fosse nuova invece di dare un errore
    }

    // --- caso A: attacco l'identità all'ospite che sta già giocando ---
    let gettone = null;
    if (typeof gettoneAttuale === 'string' && gettoneAttuale.length >= 32) {
      const mio = await anagrafe.carica(gettoneAttuale);
      if (mio) {
        gettone = gettoneAttuale;
        mio.identita = mio.identita || [];
        if (!mio.identita.some((i) => i.fornitore === chi.fornitore && i.id === chi.id)) {
          mio.identita.push({ fornitore: chi.fornitore, id: chi.id, collegataIl: orologio() });
        }
        if (!mio.nome && (nome || chi.nome)) mio.nome = nome || chi.nome;
        await archivio.scrivi('giocatore:' + gettone, mio);
      }
    }

    // --- caso C: nessun ospite alle spalle, giocatore nuovo ---
    if (!gettone) {
      const r = await anagrafe.entra(null, nome || chi.nome);
      gettone = r.gettone;
      const mio = await anagrafe.carica(gettone);
      mio.identita = [{ fornitore: chi.fornitore, id: chi.id, collegataIl: orologio() }];
      await archivio.scrivi('giocatore:' + gettone, mio);
    }

    await archivio.scrivi(chiave, { gettone, collegataIl: orologio(), fornitore: chi.fornitore });
    return { ok: true, gettone, ospite: false, nuovo: !gia, fornitore: chi.fornitore, ritrovato: false };
  }

  // Aveva qualcosa da perdere, l'ospite che stiamo abbandonando?
  // "Roba" vuol dire quello che si è GUADAGNATO, non quello che si è
  // ricevuto entrando. Da quando ogni giocatore nasce con una dotazione
  // di carte, contarle tutte avrebbe fatto scattare l'avviso "stai
  // lasciando indietro qualcosa" a chiunque — anche a chi aveva aperto
  // la pagina cinque minuti prima e non aveva fatto niente. E quello
  // che lascia indietro sono le stesse carte che ha già dall'altra
  // parte: avvisarlo sarebbe solo rumore.
  async function portaviRoba(gettone) {
    if (typeof gettone !== 'string' || gettone.length < 32) return null;
    const g = await anagrafe.carica(gettone);
    if (!g) return null;
    const carte = oltreLaDotazione(g.collezione);
    if (!g.serie.saldo && !carte) return null;
    return { sharkini: g.serie.saldo, carte };
  }

  // Con che cosa si è collegato, questo giocatore
  async function comeSeiEntrato(gettone) {
    const g = await anagrafe.carica(gettone);
    if (!g) return { ok: false, motivo: 'Non ti conosco.' };
    const identita = (g.identita || []).map((i) => i.fornitore);
    return { ok: true, ospite: identita.length === 0, collegatoCon: identita, nome: g.nome };
  }

  return { entraComeOspite, entraCon, comeSeiEntrato, attivi };
}
