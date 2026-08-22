// ============================================================
// BURRACO LEGENDS — CHE COSA VEDE OGNI GIOCATORE
//
// Finora la partita girava tutta dentro la pagina: il tavolo creava il
// mazzo, teneva la mano dell'avversario, sapeva cosa c'era nel pozzetto.
// Contro il bot va benissimo. Fra due persone no: al secondo giocatore
// basta aprire gli strumenti di sviluppo del browser per leggere la mano
// del primo. E non è (solo) questione di lealtà — se stiamo cercando
// difetti, un bug e un vantaggio involontario si confondono, e si passa
// la serata a inseguire fantasmi.
//
// Da qui in poi il server tiene lo stato vero e a ciascuno manda SOLO
// questa vista. Quello che non c'è dentro, il client non può mostrarlo
// nemmeno per sbaglio: è la differenza fra nascondere e non avere.
//
// LA REGOLA, IN UNA RIGA
// Una carta si vede solo se è già stata mostrata a tutti (calate, scarti)
// o se è in mano tua. Di tutto il resto si sa quante sono, non quali.
//
// Il pozzetto resta coperto ANCHE al suo proprietario: è una pila che si
// scopre solo quando la si prende, e sapere in anticipo cosa contiene
// cambierebbe il gioco.
// ============================================================

// Quante carte, senza dire quali.
function conta(mazzo) { return Array.isArray(mazzo) ? mazzo.length : 0; }

// I personaggi sono pubblici (punti vita e attacco si vedono sul tavolo),
// ma _ability porta dentro la definizione completa dell'abilità e
// _abilityState i suoi contatori: quelli restano di chi li possiede.
function personaggiVisibili(characters, proprio) {
  const fuori = {};
  for (const seme of Object.keys(characters)) {
    const c = characters[seme];
    // quale carta-eroe è schierata è pubblico: sta scoperta sul tavolo,
    // la si vede. Senza questo il tavolo non saprebbe che nome scriverci.
    fuori[seme] = {
      pv: c.pv, pvMax: c.pvMax, att: c.att,
      cardId: c.cardId || null, rarita: c.rarita || 1,
      turniCarica: c.turniCarica || null
    };
    if (c.difesa !== undefined) fuori[seme].difesa = c.difesa;
    // dell'abilità avversaria si mostra il nome, non i numeri: serve a
    // capire cosa è appena successo, non a calcolarlo in anticipo
    if (c._ability) {
      fuori[seme].abilita = proprio
        ? c._ability
        : { id: c._ability.id || null, nome: c._ability.nome || null };
    }
    if (proprio && c._abilityState) fuori[seme].abilitaStato = c._abilityState;
  }
  return fuori;
}

// Lo stato delle carte magiche. La selezione dell'avversario è coperta
// (era una richiesta esplicita: "le carte magiche dell'avversario sempre
// coperte"), e una trappola armata si vede come carta girata a faccia in
// giù — si sa che c'è, non che cosa fa.
function magiaVisibile(magic, proprio) {
  if (!magic) return null;
  if (proprio) {
    return {
      selezione: magic.selection,
      // QUALI posti sono spesi: ogni carta vale un solo utilizzo, e il
      // tavolo deve poterle mostrare spente. Prima qui c'erano
      // "sorpresaUsata" e "trappoleUsate", che contavano quante carte
      // erano state giocate ma non quali — con l'uno-per-carta serve
      // sapere esattamente quale posto è vuoto.
      consumate: magic.consumate || [],
      trappoleArmate: magic.trappoleArmate,
      giocateQuestoTurno: magic.giocateQuestoTurno,
      giocate: magic.giocate || [],
      effettiAttivi: magic.effettiAttivi
    };
  }
  return {
    // solo quelle ancora in mano: una carta giocata sparisce dal tavolo
    // anche dal posto dell'avversario, dove si vedeva come carta coperta
    selezioneQuante: Math.max(0, conta(magic.selection) - conta(magic.giocate)),
    // di lui si sa QUANTE ne ha spese, non quali: la selezione
    // dell'avversario resta coperta
    consumateQuante: conta(magic.consumate),
    // solo il numero di trappole in campo: quale sia si scopre quando scatta
    trappoleArmateQuante: conta(magic.trappoleArmate),
    giocateQuestoTurno: magic.giocateQuestoTurno,
    // gli effetti già in corso invece si vedono: il loro risultato è
    // sul tavolo, nasconderli renderebbe il gioco incomprensibile
    effettiAttivi: magic.effettiAttivi
  };
}

// La pescata che ha deciso chi comincia, senza gli identificativi.
// Del sorteggio serve sapere COSA è uscito e a chi, non QUALI carte del
// mazzo sono: quelle restano nel tallone, e farne uscire l'id
// significherebbe rivelare un pezzo di mazzo. Basta la faccia — seme e
// valore — che è tutto quello che serve per disegnarle a schermo.
function faccia(c) {
  if (!c) return null;
  return { suit: c.suit, value: c.value, isJolly: !!c.isJolly, jollyColor: c.jollyColor || null };
}

function sorteggioVisibile(s) {
  if (!s) return null;
  return {
    carte: (s.carte || []).map(faccia),
    vincitore: s.vincitore,
    // quante volte è uscito un pareggio impossibile da sciogliere (due
    // jolly): serve al tavolo per mostrare le ripescate
    pareggi: (s.pareggi || []).map((coppia) => coppia.map(faccia)),
    imposto: !!s.imposto
  };
}

function giocatoreVisibile(p, proprio) {
  const fuori = {
    manoQuante: conta(p.hand),
    pozzettoQuante: conta(p.pozzetto),
    pozzettoPreso: p.pozzettoTaken,
    calate: p.melds,                       // pubbliche per definizione
    personaggi: personaggiVisibili(p.characters, proprio),
    secondiRimasti: p.clockSecondsLeft,
    haPescato: p.hasDrawnThisTurn,
    // quali eroi hanno gia' usato l'abilita' in questo turno: serve al
    // tavolo per spegnere il tasto invece di lasciarlo acceso a vuoto
    abilitaUsate: p.abilitaUsate || [],
    puntiMagia: p.puntiMagia,
    magia: magiaVisibile(p.magic, proprio),
    effettiSubiti: p.effettiSubiti         // cambiano cosa può fare: vanno visti
  };
  // la mano è l'unica cosa che si vede solo di sé stessi
  if (proprio) fuori.mano = p.hand;
  return fuori;
}

// ------------------------------------------------------------
// LA VISTA
// `io` è l'indice del giocatore a cui stiamo per spedire.
// ------------------------------------------------------------
export function vistaPer(stato, io, adesso = Date.now()) {
  const altro = io === 0 ? 1 : 0;
  return {
    io,
    stato: stato.status,
    vincitore: stato.winner,
    motivo: stato.winReason,
    diChiEIlTurno: stato.currentPlayerIndex,
    eIlMioTurno: stato.currentPlayerIndex === io,
    iniziaAlle: stato.iniziaAlle || null,   // prima di allora si guarda e basta
    // IL SORTEGGIO DI CHI COMINCIA.
    // Esce uguale per tutti e due: è il momento in cui il mazzo decide
    // davanti a entrambi, e i due schermi devono mostrare la STESSA
    // pescata. Ma esce solo la FACCIA delle carte, mai il loro
    // identificativo: quelle carte restano nel tallone, e un id del
    // tallone che viaggia sul filo è comunque un pezzo di mazzo
    // rivelato — c'è un controllo automatico che lo vieta, ed è giusto
    // che valga anche qui.
    sorteggio: sorteggioVisibile(stato.sorteggio),
    turnoIniziatoAlle: stato.turnStartedAt,
    ultimaMossaAlle: stato.lastMoveAt,
    numeroMossa: stato.moveCounter,
    adesso: new Date(adesso).toISOString(),   // l'orologio buono è quello del server
    // del tallone si sa quanto è alto, mai cosa contiene: è il mazzo da
    // cui si pesca, conoscerlo vorrebbe dire conoscere il futuro
    talloneQuante: conta(stato.tallone),
    scarti: stato.scarti,                     // il monte scarti si vede, è scoperto
    giocatori: [
      giocatoreVisibile(stato.players[0], io === 0),
      giocatoreVisibile(stato.players[1], io === 1)
    ]
    // NOTA: stato.rng è una funzione e non finisce qui dentro. Se ci
    // finisse, JSON.stringify la butterebbe via in silenzio e nessuno se
    // ne accorgerebbe: meglio che non ci sia proprio.
  };
}

// ------------------------------------------------------------
// IL CONTROLLO
// Raccoglie gli identificativi di tutte le carte che quel giocatore NON
// deve vedere. Serve al test — e serve anche in esercizio, se un giorno
// vorremo tenerlo acceso in prova: costa poco e stana subito una fuga.
// ------------------------------------------------------------
export function carteDaNonMostrare(stato, io) {
  const altro = io === 0 ? 1 : 0;
  const nascoste = [];
  for (const c of stato.tallone) nascoste.push(c.id);
  for (const c of stato.players[altro].hand) nascoste.push(c.id);
  // i pozzetti sono coperti per entrambi finché non vengono presi
  for (let i = 0; i < 2; i++) {
    if (!stato.players[i].pozzettoTaken) {
      for (const c of stato.players[i].pozzetto) nascoste.push(c.id);
    }
  }
  return nascoste;
}

// Rovista nella vista già pronta e restituisce gli identificativi
// trapelati. Vuoto = tutto a posto.
export function carteTrapelate(stato, io) {
  const testo = JSON.stringify(vistaPer(stato, io));
  return carteDaNonMostrare(stato, io).filter((id) =>
    new RegExp('"' + id + '"').test(testo));
}
