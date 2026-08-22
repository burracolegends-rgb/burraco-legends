// ============================================================
// BURRACO LEGENDS — I GIOCATORI, E QUELLO CHE POSSIEDONO
//
// Fino a ieri sharkini, album e apertura dei pacchetti stavano nel
// browser. Erano finti: chiunque apra gli strumenti di sviluppo può
// scriversi un milione di sharkini e tutte le carte a cinque stelle.
// Finché giocavamo in due non importava. Il giorno in cui qualcuno paga
// davvero, importa moltissimo — e rifare le cose dopo costa dieci volte
// di più che farle adesso.
//
// DA QUI IN POI IL BROWSER NON DECIDE PIÙ NIENTE.
// Chiede e mostra. Il conto lo tiene il server, le carte le estrae il
// server, la garanzia la conta il server. Se il browser dice "ho aperto
// un pacchetto e mi è uscita una ★5", il server nemmeno lo ascolta:
// il pacchetto lo apre lui e comunica il risultato.
//
// L'IDENTITÀ SENZA PASSWORD
// Alla prima visita ognuno riceve un gettone lungo, che il suo browser
// si tiene. Da lì in poi il server lo riconosce. Niente registrazione,
// niente email, niente password da dimenticare — e niente password da
// custodire, che è la cosa che preferisco.
//
// Il limite, detto chiaro: chi cancella i dati del browser o cambia
// dispositivo riparte da zero. È il prezzo di non avere account veri, e
// va bene per la prova. Quando servirà, questo stesso gettone diventerà
// l'account anonimo da collegare ad Apple o Google, e chi lo collega si
// porta dietro tutto quello che ha già.
// ============================================================
import { randomBytes } from 'node:crypto';
import {
  SERIE_NUOVA, statoSerie, ritiraPremio as ritiraDalMotore,
  saldoPuoPagare, spendi, RICARICHE
} from '../engine/sharkini.js';
import { OFFERTE, offertaPerCarte, apriPacchetto, SOGLIA_PITY } from '../engine/pacchetti.js';

const gettoneNuovo = () => randomBytes(32).toString('hex');

// Come nasce un giocatore. Tutto a zero: niente sharkini in regalo
// alla partenza — il primo premio giornaliero è lì apposta.
function giocatoreNuovo(nome, quando) {
  return {
    creatoIl: quando,
    ultimaVisita: quando,
    nome: nome || null,
    serie: { ...SERIE_NUOVA },     // saldo, giorno, ultimoRitiro
    collezione: {},                // idCarta → quante copie
    contatorePity: 0,              // carte aperte dall'ultima garanzia
    pacchettiAperti: 0,
    carteAperte: 0,
    ricariche: []                  // storico: servirà quando i soldi saranno veri
  };
}

export function creaAnagrafe({ archivio, catalogo, orologio = Date.now, caso = Math.random }) {
  if (!archivio) throw new Error('L\'anagrafe ha bisogno di un magazzino.');
  if (!Array.isArray(catalogo) || !catalogo.length) throw new Error('L\'anagrafe ha bisogno del catalogo delle carte.');

  const chiaveDi = (gettone) => 'giocatore:' + gettone;

  // ----------------------------------------------------------
  // CHI SEI
  // Col gettone giusto ti ritrovo; senza, te ne do uno nuovo. Il
  // gettone non si indovina: sono 32 byte a caso.
  // ----------------------------------------------------------
  async function entra(gettone, nome) {
    const adesso = orologio();
    if (typeof gettone === 'string' && gettone.length >= 32) {
      const trovato = await archivio.leggi(chiaveDi(gettone));
      if (trovato) {
        trovato.ultimaVisita = adesso;
        if (nome && !trovato.nome) trovato.nome = nome;
        await archivio.scrivi(chiaveDi(gettone), trovato);
        return { ok: true, gettone, nuovo: false, giocatore: trovato };
      }
      // Gettone sconosciuto: NON gli do il suo. Chi arriva con un
      // gettone inventato non deve poterselo far registrare — sennò
      // basterebbe presentarsi con un gettone a scelta per crearsi
      // un'identità che poi qualcun altro potrebbe indovinare.
    }
    const mio = gettoneNuovo();
    const g = giocatoreNuovo(nome, adesso);
    await archivio.scrivi(chiaveDi(mio), g);
    return { ok: true, gettone: mio, nuovo: true, giocatore: g };
  }

  async function carica(gettone) {
    if (typeof gettone !== 'string' || gettone.length < 32) return null;
    return archivio.leggi(chiaveDi(gettone));
  }

  const salva = (gettone, g) => archivio.scrivi(chiaveDi(gettone), g);

  // Quello che si può far vedere al browser. Il gettone non c'è
  // dentro: quello lo sa già chi lo possiede, e non deve girare in
  // risposte che potrebbero finire altrove.
  function vetrina(g, adesso) {
    const stato = statoSerie(g.serie, adesso);
    return {
      nome: g.nome,
      saldo: g.serie.saldo,
      collezione: g.collezione,
      carteDiverse: Object.keys(g.collezione).length,
      carteInTutto: Object.values(g.collezione).reduce((a, b) => a + b, 0),
      contatorePity: g.contatorePity,
      alleCarteAllaGaranzia: Math.max(0, SOGLIA_PITY - g.contatorePity),
      premio: {
        puoRitirare: stato.puoRitirare,
        giorno: stato.giorno,
        quanto: stato.premio,
        serieRotta: stato.serieRotta,
        giaRitiratoOggi: stato.giaRitiratoOggi
      },
      pacchettiAperti: g.pacchettiAperti,
      carteAperte: g.carteAperte
    };
  }

  async function stato(gettone) {
    const g = await carica(gettone);
    if (!g) return { ok: false, motivo: 'Non ti conosco.' };
    return { ok: true, ...vetrina(g, orologio()) };
  }

  // ----------------------------------------------------------
  // IL PREMIO DEL GIORNO
  // Le regole stanno nel motore; qui si controlla solo che sia
  // davvero passato un giorno, e si mette via il risultato. Il
  // browser non può dire "sono al settimo giorno": lo dice il server
  // guardando quando ha ritirato l'ultima volta.
  // ----------------------------------------------------------
  async function ritiraIlPremio(gettone) {
    const g = await carica(gettone);
    if (!g) return { ok: false, motivo: 'Non ti conosco.' };
    const adesso = orologio();
    const esito = ritiraDalMotore(g.serie, adesso);
    if (esito.guadagno === 0) {
      return { ok: false, motivo: 'Il premio di oggi l\'hai già ritirato.', ...vetrina(g, adesso) };
    }
    g.serie = esito.serie;
    await salva(gettone, g);
    return {
      ok: true, guadagno: esito.guadagno, giorno: esito.stato.giorno,
      serieRotta: esito.stato.serieRotta, ...vetrina(g, adesso)
    };
  }

  // ----------------------------------------------------------
  // COMPRARE E APRIRE UN PACCHETTO
  // Sono la stessa cosa, e devono esserlo: se fossero due passaggi
  // separati, fra il pagamento e l'apertura ci sarebbe un buco in cui
  // qualcosa può andare storto — e chi ha pagato resterebbe senza
  // carte. Qui si toglie il prezzo, si estraggono le carte e si
  // aggiorna l'album in un colpo solo.
  //
  // Soprattutto: LE CARTE LE ESTRAE IL SERVER. Il browser riceve il
  // risultato e lo mette in scena. Non può nemmeno provare a dire
  // cosa gli è uscito.
  // ----------------------------------------------------------
  async function compraPacchetto(gettone, quanteCarte) {
    const g = await carica(gettone);
    if (!g) return { ok: false, motivo: 'Non ti conosco.' };

    const offerta = offertaPerCarte(quanteCarte);
    if (!offerta) return { ok: false, motivo: 'Quel pacchetto non esiste.' };

    if (!saldoPuoPagare(g.serie.saldo, offerta.costo)) {
      return {
        ok: false,
        motivo: 'Ti mancano ' + (offerta.costo - g.serie.saldo) + ' sharkini.',
        manca: offerta.costo - g.serie.saldo,
        costo: offerta.costo,
        saldo: g.serie.saldo
      };
    }

    const risultato = apriPacchetto(catalogo, g.collezione, g.contatorePity, caso, offerta.carte);

    // il conto si aggiorna tutto insieme
    const dopo = spendi(g.serie.saldo, offerta.costo);
    g.serie = { ...g.serie, saldo: dopo.saldo };
    g.contatorePity = risultato.contatore;
    g.pacchettiAperti += 1;
    g.carteAperte += offerta.carte;
    for (const c of risultato.carte) {
      g.collezione[c.carta.id] = (g.collezione[c.carta.id] || 0) + 1;
    }
    await salva(gettone, g);

    return {
      ok: true,
      costo: offerta.costo,
      carte: risultato.carte,
      pityScattato: risultato.pityScattato,
      ...vetrina(g, orologio())
    };
  }

  // ----------------------------------------------------------
  // RICARICARE
  // Finché non ci sono i pagamenti veri questa accredita e basta, ma
  // passa già da qui e lascia traccia nello storico. Il giorno in cui
  // arriveranno le ricevute di Apple e Google, il controllo si
  // aggiunge in questo punto e nient'altro cambia.
  // ----------------------------------------------------------
  async function ricarica(gettone, idRicarica, ricevuta = null) {
    const g = await carica(gettone);
    if (!g) return { ok: false, motivo: 'Non ti conosco.' };
    const r = RICARICHE.find((x) => x.id === idRicarica);
    if (!r) return { ok: false, motivo: 'Quella ricarica non esiste.' };

    // QUI andrà il controllo della ricevuta. Finché non c'è, lo dico
    // apertamente invece di far finta: questa ricarica è di prova.
    const verificata = false;

    g.serie = { ...g.serie, saldo: g.serie.saldo + r.sharkini };
    g.ricariche.push({
      quando: orologio(), offerta: r.id, euro: r.euro,
      sharkini: r.sharkini, verificata, ricevuta: ricevuta ? '(presente)' : null
    });
    await salva(gettone, g);
    return { ok: true, accreditati: r.sharkini, diProva: !verificata, ...vetrina(g, orologio()) };
  }

  // ----------------------------------------------------------
  async function quanti() { return (await archivio.tutte()).filter((k) => k.startsWith('giocatore:')).length; }

  return { entra, stato, ritiraIlPremio, compraPacchetto, ricarica, quanti, vetrina, carica };
}

export { OFFERTE, RICARICHE };
