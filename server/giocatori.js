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
import {
  OFFERTE, offertaPerCarte, apriPacchetto, apriPacchettoGarantito,
  SOGLIA_PITY, carteInVendita, carteDiTipo
} from '../engine/pacchetti.js';
import {
  dotazioneIniziale, aggiungiDotazione,
  BONUS_BENVENUTO_SHARKINI, CODA_PACCHETTO_BENVENUTO
} from '../engine/dotazione.js';

const gettoneNuovo = () => randomBytes(32).toString('hex');

// Come nasce un giocatore. Le CARTE no: senza una dotazione
// iniziale non avrebbe niente con cui scendere in campo, ora che si
// gioca solo con le carte che si possiedono davvero.
//
// Gli SHARKINI invece partono da BONUS_BENVENUTO_SHARKINI, non da zero:
// il premio giornaliero da solo impiegherebbe una settimana intera per
// dare meno di quanto costa una singola carta. Il bonus di benvenuto
// serve a far vedere SUBITO come funziona comprare un pacchetto — e le
// carte che ne escono sono garantite (vedi codaBenvenuto sotto), non
// lasciate al caso: un giocatore nuovo deve vedere coperti tutti e
// quattro i semi, non sperarci.
function giocatoreNuovo(nome, quando, bonusBenvenuto, codaBenvenuto) {
  return {
    creatoIl: quando,
    ultimaVisita: quando,
    nome: nome || null,
    serie: { ...SERIE_NUOVA, saldo: bonusBenvenuto },
    collezione: dotazioneIniziale(),  // idCarta → quante copie
    dotazioneRicevuta: true,       // il regalo si fa una volta sola
    codaBenvenuto: [...codaBenvenuto],  // le prossime carte "vinte" dai pacchetti, in ordine
    contatorePity: 0,              // carte aperte dall'ultima garanzia
    pacchettiAperti: 0,
    carteAperte: 0,
    ricariche: []                  // storico: servirà quando i soldi saranno veri
  };
}

export function creaAnagrafe({
  archivio, catalogo, orologio = Date.now, caso = Math.random,
  // I due valori veri stanno in engine/dotazione.js. Configurabili qui
  // solo perché i test dell'economia usano un catalogo finto (carta_1_0,
  // carta_2_3...) apposta per restare indipendenti dal roster vero: una
  // coda di ID reali (personaggio_102...) lì dentro non troverebbe le
  // carte e romperebbe apriPacchettoGarantito. In produzione nessuno
  // passa questi due argomenti: si usano sempre i valori veri.
  bonusBenvenuto = BONUS_BENVENUTO_SHARKINI,
  codaBenvenuto = CODA_PACCHETTO_BENVENUTO
}) {
  if (!archivio) throw new Error('L\'anagrafe ha bisogno di un magazzino.');
  if (!Array.isArray(catalogo) || !catalogo.length) throw new Error('L\'anagrafe ha bisogno del catalogo delle carte.');

  // Dai pacchetti esce solo quello che è in vendita: i segnaposto della
  // dotazione di benvenuto restano fuori (vedi carteInVendita).
  const inVendita = carteInVendita(catalogo);
  if (!inVendita.length) throw new Error('Nessuna carta in vendita: i pacchetti uscirebbero vuoti.');

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
        // CHI C'ERA GIÀ PRIMA DELLA DOTAZIONE.
        // Chi si è iscritto quando le carte non si possedevano ancora
        // ha la collezione vuota: senza questo, dopo l'aggiornamento
        // non potrebbe più giocare — non possiede niente da schierare.
        // Il regalo si aggiunge a quello che ha, non lo sostituisce, e
        // il segno resta scritto: non si riceve due volte.
        if (!trovato.dotazioneRicevuta) {
          trovato.collezione = aggiungiDotazione(trovato.collezione);
          trovato.dotazioneRicevuta = true;
        }
        // CHI C'ERA GIÀ PRIMA DEL BONUS DI BENVENUTO.
        // Stesso discorso della dotazione, ma per gli sharkini e la coda
        // garantita: si aggiunge quello che manca, una volta sola, senza
        // toccare il saldo che ha già (non glielo si azzera).
        if (trovato.codaBenvenuto === undefined) {
          trovato.serie = { ...trovato.serie, saldo: trovato.serie.saldo + bonusBenvenuto };
          trovato.codaBenvenuto = [...codaBenvenuto];
        }
        await archivio.scrivi(chiaveDi(gettone), trovato);
        return { ok: true, gettone, nuovo: false, giocatore: trovato };
      }
      // Gettone sconosciuto: NON gli do il suo. Chi arriva con un
      // gettone inventato non deve poterselo far registrare — sennò
      // basterebbe presentarsi con un gettone a scelta per crearsi
      // un'identità che poi qualcun altro potrebbe indovinare.
    }
    const mio = gettoneNuovo();
    const g = giocatoreNuovo(nome, adesso, bonusBenvenuto, codaBenvenuto);
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
  // `tipo` è facoltativo: 'eroe' o 'magia' restringono il catalogo da cui
  // si pesca, niente (o 'tutti') pesca come sempre da tutto quello che è
  // in vendita. Cambia anche il prezzario: 'magia' costa un terzo — una
  // Carta Magica si consuma con un solo utilizzo, un eroe no (vedi
  // OFFERTE_MAGIA in engine/pacchetti.js).
  async function compraPacchetto(gettone, quanteCarte, tipo) {
    const g = await carica(gettone);
    if (!g) return { ok: false, motivo: 'Non ti conosco.' };

    const offerta = offertaPerCarte(quanteCarte, tipo);
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

    let bacino;
    try { bacino = carteDiTipo(inVendita, tipo); }
    catch (e) { return { ok: false, motivo: e.message }; }
    if (!bacino.length) return { ok: false, motivo: 'Nessuna carta di quel tipo è ancora in vendita.' };

    // LA CODA DI BENVENUTO SI CONSUMA PRIMA DEL CASO.
    // Vale solo per i pacchetti che possono contenere eroi (misti o
    // 'eroe': la coda e' fatta di personaggio_*, non di Carte Magiche —
    // un pacchetto 'magia' non la tocca). Se il taglio comprato e' piu'
    // grande di quel che resta in coda, il resto si estrae a sorte come
    // sempre, nello stesso acquisto: chi compra uno scrigno da dieci con
    // in coda solo tre carte garantite si ritrova tre carte sicure e
    // sette vere.
    let carte, contatorePityDopo = g.contatorePity, pityScattato = false;
    const dallaCoda = (tipo === 'magia') ? 0 : Math.min(offerta.carte, (g.codaBenvenuto || []).length);
    if (dallaCoda > 0) {
      const ids = g.codaBenvenuto.slice(0, dallaCoda);
      g.codaBenvenuto = g.codaBenvenuto.slice(dallaCoda);
      carte = apriPacchettoGarantito(inVendita, g.collezione, ids).carte;
      const restano = offerta.carte - dallaCoda;
      if (restano > 0) {
        const conteggioProvvisorio = { ...g.collezione };
        for (const c of carte) conteggioProvvisorio[c.carta.id] = (conteggioProvvisorio[c.carta.id] || 0) + 1;
        const resto = apriPacchetto(bacino, conteggioProvvisorio, g.contatorePity, caso, restano);
        carte = carte.concat(resto.carte);
        contatorePityDopo = resto.contatore;
        pityScattato = resto.pityScattato;
      }
    } else {
      const risultato = apriPacchetto(bacino, g.collezione, g.contatorePity, caso, offerta.carte);
      carte = risultato.carte;
      contatorePityDopo = risultato.contatore;
      pityScattato = risultato.pityScattato;
    }

    // il conto si aggiorna tutto insieme
    const dopo = spendi(g.serie.saldo, offerta.costo);
    g.serie = { ...g.serie, saldo: dopo.saldo };
    g.contatorePity = contatorePityDopo;
    g.pacchettiAperti += 1;
    g.carteAperte += offerta.carte;
    for (const c of carte) {
      g.collezione[c.carta.id] = (g.collezione[c.carta.id] || 0) + 1;
    }
    await salva(gettone, g);

    return {
      ok: true,
      costo: offerta.costo,
      carte,
      pityScattato,
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
  // POSSIEDI DAVVERO QUESTE CARTE?
  // Si chiede prima di sedersi al tavolo. Il mazzo lo manda il browser,
  // quindi non si crede a una riga: gli id devono corrispondere a copie
  // vere nella collezione tenuta qui.
  //
  // Un mazzo può nominare la stessa carta più volte? Per le Carte
  // Magiche no (devono essere tre diverse), ma il controllo conta
  // comunque le ripetizioni: se domani quella regola cambiasse, questo
  // non diventerebbe di colpo il punto debole.
  // ----------------------------------------------------------
  async function possiedeTutte(gettone, ids) {
    const g = await carica(gettone);
    if (!g) return { ok: false, motivo: 'Non ti conosco.' };
    const servono = {};
    for (const id of ids) servono[id] = (servono[id] || 0) + 1;
    const mancanti = Object.keys(servono).filter((id) => (g.collezione[id] || 0) < servono[id]);
    if (mancanti.length) return { ok: false, motivo: 'Non possiedi: ' + mancanti.join(', '), mancanti };
    return { ok: true };
  }

  // ----------------------------------------------------------
  // UNA CARTA MAGICA SI CONSUMA
  // Giocata una volta, sparisce dalla collezione: è il prezzo, adesso
  // che non costano più punti magia.
  //
  // IL PAVIMENTO A ZERO NON È PIGNOLERIA. Chi apre due tavoli in
  // parallelo con lo stesso mazzo passa il controllo del possesso tutte
  // e due le volte — quel controllo si fa quando ci si siede, e in quel
  // momento la copia c'è ancora. Poi la gioca in tutte e due le
  // partite. Senza pavimento la collezione andrebbe sotto zero e la
  // stessa copia sarebbe stata spesa due volte; con il pavimento, la
  // seconda volta semplicemente non c'è più niente da togliere, e chi
  // legge il registro se ne accorge dal `mancava`.
  // ----------------------------------------------------------
  async function consumaCarta(gettone, idCarta) {
    const g = await carica(gettone);
    if (!g) return { ok: false, motivo: 'Non ti conosco.' };
    const quante = g.collezione[idCarta] || 0;
    if (quante <= 0) return { ok: true, consumata: false, mancava: true, rimaste: 0 };
    const rimaste = quante - 1;
    if (rimaste > 0) g.collezione[idCarta] = rimaste;
    else delete g.collezione[idCarta];   // zero copie = non ce l'hai, non "ne hai zero"
    await salva(gettone, g);
    return { ok: true, consumata: true, rimaste };
  }

  // ----------------------------------------------------------
  async function quanti() { return (await archivio.tutte()).filter((k) => k.startsWith('giocatore:')).length; }

  return { entra, stato, ritiraIlPremio, compraPacchetto, ricarica, quanti, vetrina, carica,
           possiedeTutte, consumaCarta };
}

export { OFFERTE, RICARICHE };
