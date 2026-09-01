// ============================================================
// BURRACO LEGENDS — IL TOUR GUIDATO (home, negozio, album, deck)
//
// PERCHÉ È UN FILE A PARTE, NON GENERATO
// Attraversa cinque pagine scritte in punti diversi (alcune a mano,
// alcune da strumenti/genera-*.py): duplicare la stessa logica in ogni
// generatore vorrebbe dire cinque copie della stessa cosa, destinate a
// divergere. Un solo file, incluso ovunque con lo stesso <script>, resta
// una sola verità — lo stesso principio già usato per le immagini e i
// suoni (client/immagini/, client/audio/), non una prima volta.
//
// NON È UNA FINZIONE. Il tutorial del tavolo (l'altro progetto, "Ultima
// app burraco/tutorial-v1.js") scripta uno stato finto: qui invece ogni
// azione è vera — si spende davvero il bonus di benvenuto, le carte
// finiscono davvero in collezione. Guida un giocatore nuovo attraverso
// la SUA prima volta reale, non una controfigura.
//
// COME FUNZIONA
// Un solo numero in localStorage (bb_tutorial_passo) dice a che punto
// si è. Ogni pagina, al caricamento, guarda se il passo attuale la
// riguarda: se sì mostra il pannello, se no non fa nulla — passare da
// una pagina non prevista per il passo corrente (tasto Indietro del
// browser, per esempio) non è un errore, è solo restare fuori dal
// proprio passo per un momento.
//
// Un passo con `clic` fa avanzare PRIMA che il click prosegua per la
// sua strada normale (aprire il link, salvare il mazzo...): si scrive
// il nuovo numero e si lascia fare al resto della pagina quello che
// avrebbe fatto comunque. Un passo con `aspetta` controlla lo stato
// trenta volte al secondo (stessa idea del tutorial del tavolo) e
// avanza da solo — usato per l'apertura del pacchetto, dove lo
// spettacolo lo fa già la pagina e non serve testo sopra: quel passo
// non ha `titolo`, quindi non mostra nessun pannello, solo l'attesa.
//
// Se il passo dopo un'attesa muta appartiene ANCORA alla stessa pagina
// (l'apertura pacchetto e il suo riepilogo sono la stessa pagina), non
// basta scrivere il nuovo numero: bisogna anche disegnare il pannello
// nuovo senza ricaricare — mostraPassoCorrente() è pensata apposta per
// essere richiamata più volte sulla stessa pagina, non solo all'avvio.
//
// UNA VOLTA SOLA — MA LEGATA ALL'ACCOUNT, NON SOLO AL BROWSER. Finito
// l'ultimo passo, bb_tutorial_completato='si' e non riparte più — a
// meno che, tornando in home, il server non riconosca più il gettone
// salvato (vedi accountNonRiconosciuto più sotto): il flag vive nel
// browser, l'account vive sul server, e se il magazzino del server
// perde i dati i due si disallineano. In quel caso il tour riparte da
// solo, una volta, invece di lasciare chi torna senza carte e senza
// guida.
//
// IL BOTTONE "SALTA TUTTO" C'ERA, ED È STATO TOLTO.
// Serviva solo in sviluppo (il magazzino del server si resetta spesso,
// senza una via di fuga si sarebbe rifatto tutto il tour a ogni prova):
// un giocatore vero non deve poter saltare la sua unica occasione di
// imparare come funziona il negozio. Richiesto esplicitamente: "togli
// il tasto salta tutto prova... ovunque cancellalo".
// Una versione futura, rimandata apposta: un modo per RIFARE il tour a
// volontà dalle impostazioni della home ("come se lo rifaccio essendo a
// capo") — oggi non c'è, se ne riparla quando serve davvero.
// ============================================================
(function () {
  'use strict';


  var CHIAVE_PASSO = 'bb_tutorial_passo';
  var CHIAVE_FATTO = 'bb_tutorial_completato';

  function leggi(chiave) { try { return localStorage.getItem(chiave); } catch (e) { return null; } }
  function scrivi(chiave, v) { try { localStorage.setItem(chiave, v); } catch (e) {} }
  function cancella(chiave) { try { localStorage.removeItem(chiave); } catch (e) {} }

  var pagina = (location.pathname.split('/').pop() || 'home.html');

  // ------------------------------------------------------------
  // IL TOUR RIPARTE DA SOLO SE L'ACCOUNT NON C'È PIÙ
  // Il flag "fatto" vive nel browser, l'account vive sul server
  // (server/giocatori.js): se il magazzino del server perde i dati —
  // succede a ogni nuovo deploy finché non c'è un disco vero, vedi
  // DOVE_SALVO in server/server.js — i due si disallineano.
  //
  // NIENTE CHIAMATA DI RETE PROPRIA — e non per pigrizia. home.html fa
  // già la sua a /api/io all'avvio (per mostrare saldo e collezione), e
  // se il gettone salvato non era più riconosciuto quella stessa
  // chiamata lo sostituisce SUBITO con uno nuovo, in localStorage. Una
  // seconda chiamata di qui, in corsa con quella, leggerebbe quasi
  // sempre il gettone già aggiornato: il confronto risulterebbe sempre
  // "va tutto bene" anche quando non è vero (verificato dal vivo: capita
  // davvero, non è un'ipotesi).
  //
  // Si confronta invece qualcosa che non ha corse: il gettone con cui il
  // tour è stato completato l'ultima volta (salvato in avanza(), qui
  // sotto) contro quello di adesso. Se sono diversi, il server ha dovuto
  // darne uno nuovo da allora — vuol dire che quello vecchio è sparito.
  // ------------------------------------------------------------
  var CHIAVE_GETTONE_AL_COMPLETAMENTO = 'bb_tutorial_gettone';

  function avviaDaCapo() {
    cancella(CHIAVE_FATTO);
    scrivi(CHIAVE_PASSO, '1');
    mostraPassoCorrente();
  }

  function decidiSePartire() {
    // ?tutorial=1 lo riaccende a mano, senza toccare account o carte:
    // serve a chi vuole rivederlo o sta provando questa pagina — stesso
    // meccanismo gia' in uso per il tutorial del tavolo.
    if (new URLSearchParams(location.search).get('tutorial') === '1' && pagina === 'home.html') {
      pulisciPassoPrecedente();
      cancella(CHIAVE_FATTO);
      scrivi(CHIAVE_PASSO, '1');
      mostraPassoCorrente();
      return;
    }
    if (leggi(CHIAVE_FATTO) === 'si') {
      // Già fatto: si ricontrolla SOLO dalla home e SOLO se non c'è già
      // un giro in corso.
      if (pagina !== 'home.html' || leggi(CHIAVE_PASSO)) return;
      var gettoneOra = leggi('bb_gettone');
      var gettoneAllora = leggi(CHIAVE_GETTONE_AL_COMPLETAMENTO);
      // Se non sappiamo con quale gettone si era finito (tour segnato
      // completato prima che questo controllo esistesse, o completato
      // saltandolo prima che anche Salta lo salvasse) non c'è modo di
      // dire se e' cambiato qualcosa: si registra ORA come riferimento,
      // cosi' almeno il PROSSIMO cambio di gettone verra' notato — non
      // si resta scoperti per sempre.
      if (!gettoneAllora) { if (gettoneOra) scrivi(CHIAVE_GETTONE_AL_COMPLETAMENTO, gettoneOra); return; }
      if (gettoneOra && gettoneOra !== gettoneAllora) avviaDaCapo();
      return;
    }
    // La primissima visita di sempre: nessun passo salvato, e siamo in
    // home. È l'UNICO altro punto in cui il tour si accende da solo.
    if (!leggi(CHIAVE_PASSO)) {
      if (pagina !== 'home.html') return;
      scrivi(CHIAVE_PASSO, '1');
    }
    mostraPassoCorrente();
  }

  // ------------------------------------------------------------
  // I PASSI — vedi la spiegazione dei campi in cima al file.
  // ------------------------------------------------------------
  var PASSI = [
    { pagina: 'home.html', titolo: 'Benvenuto a Burraco Legends',
      testo: 'Qui la logica del burraco si unisce alla magia delle carte: eroi che colpiscono ' +
             'con le loro abilità, Carte Magiche a sorpresa, mentre giochi la partita che già conosci.' },
    { pagina: 'home.html', titolo: 'Il premio del giorno',
      testo: 'Ogni giorno che entri ricevi <b>sharkini</b> gratis, la moneta del gioco — di più ' +
             'se torni giorno dopo giorno di fila. Gli sharkini si convertono in carte: eroi e Carte Magiche.',
      illumina: '#premio' },
    { pagina: 'home.html', titolo: 'Non hai ancora nessuna carta',
      testo: 'Per scendere in campo servono eroi e, se vuoi, Carte Magiche — e oggi non ne possiedi ' +
             'ancora nessuna. Hai già un <b>bonus di benvenuto</b> pronto per il primo acquisto: andiamo al negozio.',
      illumina: '.modo[href="negozio.html"]', clic: '.modo[href="negozio.html"]' },

    { pagina: 'negozio.html', titolo: 'Il tuo bonus di benvenuto',
      testo: 'Questi sono i tuoi sharkini di partenza — bastano per cominciare a costruire il tuo mazzo, senza spendere nulla di vero.',
      illumina: '#saldo' },
    // IL TAGLIO E' FISSO A 10, NON A SCELTA — segnalato da chi ci e'
    // rimasto bloccato per davvero: col bonus di benvenuto (36.000)
    // prendendo pacchetti piu' piccoli (due da 5, per esempio) restava
    // senza sharkini per la Carta Magica del passo successivo, e li' il
    // tutorial si impantanava senza modo di proseguire. Il pacchetto da
    // 10 costa 30.000: ne restano sempre 6.000, abbastanza anche per la
    // Carta Magica piu' cara (5 carte, 6.000). Con qualunque altro taglio
    // non e' garantito.
    { pagina: 'negozio.html', titolo: 'Compra il pacchetto da 10 eroi',
      testo: 'Qui sotto trovi i pacchetti di <b>eroi</b>, uno per ogni taglio. Gli eroi restano tuoi per ' +
             'sempre: si riusano partita dopo partita. Prendi quello da <b>10 carte</b>: con questo bonus ti ' +
             'lascia gli sharkini anche per le Carte Magiche, fra un attimo.',
      illumina: '#vetrinaEroi a[href*="carte=10"]', clic: '#vetrinaEroi a[href*="carte=10"]' },

    { pagina: 'spacchetta.html',
      aspetta: function () {
        var r = document.getElementById('riepilogo');
        return !!r && getComputedStyle(r).display !== 'none';
      } },
    { pagina: 'spacchetta.html', titolo: 'Ora le Carte Magiche',
      testo: 'Ecco le tue prime carte! Torniamo al negozio per prendere anche qualche <b>Carta Magica</b>: ' +
             'costano meno degli eroi, perché a differenza loro si usano <b>una sola volta</b> e poi spariscono.',
      illumina: 'a.bottone.principale[href="negozio.html"]', clic: 'a.bottone.principale[href="negozio.html"]' },

    // Stesso motivo del taglio fisso sugli eroi: con 6.000 sharkini
    // rimasti (36.000 − 30.000 del pacchetto da 10 eroi) il taglio da
    // 5 carte (6.000) e' l'unico che li usa tutti senza sforare — quello
    // da 10 (10.000) non sarebbe nemmeno acquistabile a questo punto.
    { pagina: 'negozio.html', titolo: 'Le Carte Magiche costano meno',
      testo: 'Stesso principio, prezzo più basso: un terzo di quello degli eroi. Prendi il pacchetto da ' +
             '<b>5 carte</b>: è quello che i tuoi sharkini rimasti coprono esattamente.',
      illumina: '#vetrinaMagiche a[href*="carte=5"]', clic: '#vetrinaMagiche a[href*="carte=5"]' },

    { pagina: 'spacchetta.html',
      aspetta: function () {
        var r = document.getElementById('riepilogo');
        return !!r && getComputedStyle(r).display !== 'none';
      } },
    { pagina: 'spacchetta.html', titolo: 'Vai a vedere le tue carte',
      testo: 'Adesso hai eroi e Carte Magiche. Andiamo all\'album delle figurine a guardarle da vicino.',
      illumina: 'a.bottone[href="album.html"]', clic: 'a.bottone[href="album.html"]' },

    { pagina: 'album.html', titolo: 'Le tue carte, da vicino',
      testo: 'Ogni carta ha una <b>rarità</b> (le stelle) e, per gli eroi, un\'<b>abilità</b> descritta ' +
             'sotto al nome: leggi cosa fa prima di sceglierla per una partita.',
      illumina: '#sezioni' },
    { pagina: 'album.html', titolo: 'Due tipi di carta, due regole',
      testo: 'Gli <b>eroi</b> restano in squadra per sempre: si attivano spendendo <b>punti magia</b>, ' +
             'che crescono da soli turno dopo turno.<br><br>' +
             'Le <b>Carte Magiche</b> invece non costano punti magia — si giocano gratis — ma ogni copia ' +
             'vale <b>un solo utilizzo</b>: usata, sparisce anche dalla collezione.',
      bottone: { testo: 'Vai al tuo deck', vai: 'selezione.html' } },

    { pagina: 'selezione.html', titolo: 'Scegli i tuoi quattro eroi',
      testo: 'Un eroe per seme: cuori, quadri, fiori, picche. Tocca una casella per scegliere fra quelli che possiedi.',
      illumina: '#suitsRow',
      aspetta: function () {
        try { return Object.values(state.personaggi || {}).filter(Boolean).length === 4; }
        catch (e) { return false; }
      } },
    { pagina: 'selezione.html', titolo: 'Le Carte Magiche sono facoltative',
      testo: 'Puoi portarne da zero a tre. Scegli quelle che hai, poi conferma il mazzo qui sotto.',
      // Il testo chiede di toccare le carte del pescherecio PRIMA di
      // confermare — ma clic (sotto) e' solo il bottone che chiude il
      // passo: senza `libero`, ogni tocco sulla griglia finiva bloccato
      // come "non e' li' che devi toccare", e si poteva solo premere
      // Conferma senza aver scelto nessuna Carta Magica. Segnalato da
      // chi ci ha provato per davvero ("non me le fa selezionare").
      illumina: '#entraBtn', clic: '#entraBtn', libero: '#magicGrid' },

    { pagina: 'home.html', titolo: 'Sei pronto!',
      testo: 'Hai un mazzo, hai capito come funziona il negozio: da qui puoi andare in battaglia quando vuoi.',
      // Senza `clic`, questo era l'UNICO passo di tutto il tour dove
      // toccare l'elemento illuminato non chiudeva il passo — serviva
      // per forza il bottone "Avanti", separato. Chi aveva preso
      // l'abitudine di toccare cio' che luccica (fatta da ogni altro
      // passo prima di questo) finiva dritto al tavolo SENZA che
      // bb_tutorial_completato venisse mai scritto — e il tutorial del
      // tavolo, che aspetta proprio quel flag prima di accendersi da
      // solo, restava spento per sempre. Segnalato da chi ci e' finito:
      // "il tutorial della home va bene... ma quando vado al tavolo non
      // parte". Ora il tocco sull'illuminato chiude il passo come tutti
      // gli altri.
      illumina: '.modo[href="tavolo.html"]', clic: '.modo[href="tavolo.html"]', fine: true }
  ];

  // ------------------------------------------------------------
  // LO STILE, UNA VOLTA SOLA
  // ------------------------------------------------------------
  var stile = document.createElement('style');
  stile.textContent =
    // NIENTE PIU' SCHERMO SCURO INTORNO. C'era un'ombra da 6000px che
    // scuriva tutto tranne l'elemento illuminato — pensata per guidare
    // l'occhio, ma tre segnalazioni vere hanno mostrato il difetto: nel
    // negozio scuriva anche il saldo sharkini (che serve leggere per
    // decidere se comprare), e nella scelta del mazzo scuriva l'intera
    // griglia delle Carte Magiche facendole sembrare spente/non
    // selezionabili proprio mentre lo erano. Resta solo il bagliore
    // intorno all'elemento giusto, il resto della pagina si legge normale.
    '.bb-tut-alone { position: relative; z-index: 9998; outline: 3px solid #e8c46a; ' +
      'outline-offset: 3px; border-radius: 10px; ' +
      'box-shadow: 0 0 22px rgba(232,196,106,0.85); ' +
      'animation: bbTutPulsa 1.6s ease-in-out infinite; }' +
    '@keyframes bbTutPulsa { 0%,100% { outline-color: #e8c46a; } 50% { outline-color: #fff3cf; } }' +
    // POINTER-EVENTS: NONE sul riquadro — segnalato da chi ci ha sbattuto
    // contro davvero: nella schermata del riepilogo il bottone vero
    // "torna al negozio" finisce proprio sotto questo pannello (fisso in
    // basso, a tutta larghezza), e senza questa riga il pannello
    // INTERCETTAVA il tocco al posto del bottone — invisibile, intoccabile,
    // bloccato li' per sempre. Riacceso solo sui bottoni del pannello
    // stesso (Avanti), che devono restare premibili.
    '.bb-tut-pannello { position: fixed; left: 0; right: 0; z-index: 9999; ' +
      'background: linear-gradient(180deg, rgba(30,20,12,0.97), rgba(14,9,5,0.99)); ' +
      'padding: 16px 18px; ' +
      'font-family: "Segoe UI", system-ui, sans-serif; color: #ece3d2; pointer-events: none; }' +
    '.bb-tut-pannello button { pointer-events: auto; }' +
    // IN BASSO O IN ALTO A SECONDA DI DOVE SERVE GUARDARE. Un pannello
    // sempre fisso in basso finiva sopra proprio l'elemento da toccare
    // quando questo stava nella meta' bassa dello schermo (le offerte di
    // Carte Magiche nel negozio, per esempio) — coperto, non solo
    // difficile da vedere. Si sceglie da che parte stare guardando dov'e'
    // l'elemento illuminato, vedi mostraPassoCorrente() piu' sotto.
    '.bb-tut-pannello.in-basso { bottom: 0; border-top: 1px solid #8a6a2a; ' +
      'box-shadow: 0 -10px 30px rgba(0,0,0,0.6); padding-bottom: max(16px, env(safe-area-inset-bottom)); }' +
    '.bb-tut-pannello.in-alto { top: 0; border-bottom: 1px solid #8a6a2a; ' +
      'box-shadow: 0 10px 30px rgba(0,0,0,0.6); padding-top: max(16px, env(safe-area-inset-top)); }' +
    // TOLTO "SALTA TUTTO (PROVA)" — bottone di sviluppo, mai pensato per
    // restare nel gioco vero, richiesto esplicitamente "ovunque
    // cancellalo". Con lui e' sparita anche la riga apposta in fondo al
    // pannello: il bottone "Avanti" si sposta ACCANTO AL TITOLO, in una
    // sola riga in alto (.bb-tut-testa) — una riga di meno da disegnare,
    // il pannello si accorcia ("mettilo più sopra così ridimensioni
    // ulteriormente la finestra").
    '.bb-tut-testa { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }' +
    '.bb-tut-pannello h3 { margin: 0; font-size: 1.05rem; color: #e8c46a; }' +
    '.bb-tut-pannello p { margin: 8px 0 0; font-size: 0.92rem; line-height: 1.5; color: #d8cdb8; }' +
    '.bb-tut-righe { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }' +
    '.bb-tut-btn { background: linear-gradient(180deg, #ffe9ae, #e8c46a); color: #2a1c08; border: none; ' +
      'padding: 10px 20px; border-radius: 10px; font-weight: 800; font-size: 0.9rem; cursor: pointer; flex: 0 0 auto; }' +
    // LO SCUDO NON E' PIU' UN RIQUADRO SOPRA LA PAGINA — segnalato da chi
    // nel riepilogo dell'apertura pacchetti vedeva il bottone illuminato
    // ("Compra un altro pacchetto") bagliore acceso e tocco morto: quel
    // bottone sta dentro .riepilogo, che ha una sua animazione d'entrata
    // (entraRiep, sopra), e un'animazione su opacity/transform crea in
    // CSS un livello di impilamento tutto suo — lo z-index alto messo
    // sull'elemento illuminato (.bb-tut-alone) vale SOLO dentro quel
    // livello, non lo fa uscire per competere con un riquadro-scudo
    // esterno. Il bagliore si vede (e' un effetto locale), il tocco
    // veniva comunque intercettato dallo scudo sopra di lui: bug reale,
    // non un'ipotesi, riprodotto proprio su quel passo.
    // Niente piu' riquadro, quindi: si blocca ogni clic con un solo
    // ascoltatore in fase di cattura su document, e si decide se
    // lasciarlo passare guardando DOVE e' avvenuto nell'albero del DOM
    // (elementoIlluminato.contains / pannelloAttuale.contains) invece di
    // affidarsi a come il browser lo ha dipinto. Attivo su ogni passo che
    // non sia `aspetta` (quelli aspettano un gesto libero del giocatore
    // altrove sulla pagina — aprire il pacchetto, girare la carta — che
    // nessun selettore fisso qui potrebbe prevedere).
    // Toccare fuori non deve sembrare che il gioco si sia bloccato:
    // il pannello scuote la testa per dire "sono io quello da guardare".
    '.bb-tut-scuoti { animation: bbTutScuoti 0.32s ease-in-out; }' +
    '@keyframes bbTutScuoti { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-8px); } ' +
      '75% { transform: translateX(8px); } }';
  document.head.appendChild(stile);

  var pannelloAttuale = null;
  var elementoIlluminato = null;
  var attesaInCorso = null;   // l'intervalId dell'attesa del passo mostrato adesso
  var listenerClicAttuale = null;
  var riprovaAlone = null;    // il setTimeout dei ritentativi di illumina()
  var pannelloEmergenzaAspetta = null;

  function pulisciPassoPrecedente() {
    if (pannelloAttuale) { pannelloAttuale.remove(); pannelloAttuale = null; }
    if (elementoIlluminato) { elementoIlluminato.classList.remove('bb-tut-alone'); elementoIlluminato = null; }
    if (attesaInCorso) { clearInterval(attesaInCorso); attesaInCorso = null; }
    if (listenerClicAttuale) { document.removeEventListener('click', listenerClicAttuale, true); listenerClicAttuale = null; }
    if (riprovaAlone) { clearTimeout(riprovaAlone); riprovaAlone = null; }
    if (pannelloEmergenzaAspetta) { pannelloEmergenzaAspetta.remove(); pannelloEmergenzaAspetta = null; }
  }

  // RETE DI SICUREZZA PER "aspetta" — segnalato da chi ci e' rimasto
  // bloccato per davvero: comprando un pacchetto di eroi piu' piccolo e
  // poi un altro, gli sharkini rimasti non bastavano piu' per la Carta
  // Magica che il passo successivo si aspettava. spacchetta.html mostra
  // una sua schermata "ti mancano N sharkini" — ma quel passo e' MUTO
  // (aspetta solo che compaia il riepilogo dell'apertura, nessun
  // pannello proprio) e il riepilogo, senza acquisto riuscito, non
  // compare mai: si resta li' per sempre, senza nemmeno un pannello da
  // guardare. Dopo un po' di tentativi si mostra comunque un piccolo
  // aiuto, anche sui passi muti, con un modo per tornare indietro.
  function mostraEmergenzaAspetta() {
    if (pannelloEmergenzaAspetta) return;
    pannelloEmergenzaAspetta = document.createElement('div');
    pannelloEmergenzaAspetta.className = 'bb-tut-pannello in-basso';
    pannelloEmergenzaAspetta.innerHTML =
      '<h3>Qualcosa si e\' fermato</h3>' +
      '<p>Forse non hai abbastanza sharkini per questo acquisto, o la pagina ha impiegato piu\' ' +
      'tempo del previsto. Puoi tornare al negozio e riprovare.</p>' +
      '<button class="bb-tut-btn" id="bbTutIndietroEmergenzaAspetta">Torna al negozio</button>';
    document.body.appendChild(pannelloEmergenzaAspetta);
    document.getElementById('bbTutIndietroEmergenzaAspetta').addEventListener('click', function () {
      location.href = 'negozio.html';
    });
  }

  function avanza(def) {
    pulisciPassoPrecedente();
    if (def.fine) {
      scrivi(CHIAVE_FATTO, 'si');
      // con quale gettone si e' finito: vedi CHIAVE_GETTONE_AL_COMPLETAMENTO
      // piu' in alto
      scrivi(CHIAVE_GETTONE_AL_COMPLETAMENTO, leggi('bb_gettone') || '');
      cancella(CHIAVE_PASSO);
      return;
    }
    var nuovo = Number(leggi(CHIAVE_PASSO) || 0) + 1;
    scrivi(CHIAVE_PASSO, String(nuovo));
    mostraPassoCorrente(); // puo' darsi che il passo nuovo sia ANCORA su questa pagina
  }

  // RETE DI SICUREZZA. Se il selettore non trova niente (una vetrina che
  // carica lento, un id rinominato in futuro senza aggiornare questo
  // file...) non ci si ferma al primo colpo: si riprova per qualche
  // secondo, nel caso l'elemento arrivi solo dopo. `onEsito` dice come è
  // andata a finire — serve a decidere se offrire comunque un modo per
  // proseguire, invece di lasciare chi sta imparando bloccato a fissare
  // un pannello che chiede di toccare qualcosa che non c'è.
  function illumina(selettore, onEsito) {
    if (!selettore) { if (onEsito) onEsito(true); return; }
    var tentativi = 0;
    function prova() {
      var el = document.querySelector(selettore);
      if (el) {
        elementoIlluminato = el;
        el.classList.add('bb-tut-alone');
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (onEsito) onEsito(true);
        return;
      }
      tentativi++;
      if (tentativi >= 15) { if (onEsito) onEsito(false); return; } // ~6 secondi, poi si arrende
      riprovaAlone = setTimeout(prova, 400);
    }
    prova();
  }

  function mostraPassoCorrente() {
    var passo = Number(leggi(CHIAVE_PASSO) || 0);
    var def = PASSI[passo - 1];
    if (!def) { scrivi(CHIAVE_FATTO, 'si'); cancella(CHIAVE_PASSO); return; }
    if (def.pagina !== pagina) return; // questo passo e' altrove: qui non si mostra nulla

    illumina(def.illumina, function (trovato) {
      // Il pannello (se previsto) è già a schermo: qui si aggiunge SOLO il
      // bottone di emergenza, se serve — non si ridisegna nulla.
      if (trovato || !pannelloAttuale) return;
      var testa = pannelloAttuale.querySelector('.bb-tut-testa');
      if (!testa || document.getElementById('bbTutEmergenza')) return;
      var emergenza = document.createElement('button');
      emergenza.className = 'bb-tut-btn';
      emergenza.id = 'bbTutEmergenza';
      emergenza.textContent = 'Vai avanti comunque';
      emergenza.title = 'Non trovo l\'elemento da evidenziare: puoi comunque proseguire da qui.';
      emergenza.addEventListener('click', function () { avanza(def); });
      testa.appendChild(emergenza);
    });

    // UN SOLO ASCOLTATORE PER "COSA SI PUO' TOCCARE QUI". Prima erano due
    // cose separate: un ascoltatore per il clic che fa avanzare (solo se
    // def.clic) e un riquadro-scudo trasparente per bloccare il resto,
    // tenuto sopra a tutto con lo z-index. Il riquadro si e' rivelato
    // fragile (vedi il commento sullo scudo, piu' sopra, nel CSS): un
    // antenato con un'animazione puo' intrappolare sotto di se' anche un
    // elemento con z-index altissimo. Con un solo ascoltatore in cattura
    // su document si decide dal DOM, non dal disegno a schermo: se il
    // tocco e' dentro il pannello lo si lascia sempre passare (i suoi
    // bottoni si gestiscono da soli), se e' dentro l'elemento illuminato
    // e questo passo chiede proprio quel tocco si avanza, altrimenti si
    // blocca e il pannello scuote la testa.
    if (!def.aspetta) {
      listenerClicAttuale = function (e) {
        if (pannelloAttuale && pannelloAttuale.contains(e.target)) return;
        if (pannelloEmergenzaAspetta && pannelloEmergenzaAspetta.contains(e.target)) return;
        // IL PREMIO DEL GIORNO NON SI CHIUDEVA PIU'. La festa (#festa, in
        // home.html) e' un popup a parte, indipendente dal passo in corso —
        // segnalato da chi tornava alla home a fine tour e restava incollato
        // li'. Prima dello scudo unico non contava (vinceva per z-index,
        // 10000 contro il 9997 dello scudo), ma un ascoltatore che decide
        // dal DOM non lo sa: senza questa riga bloccava anche lui, come
        // tutto il resto della pagina non illuminato apposta.
        var festa = document.getElementById('festa');
        if (festa && festa.contains(e.target)) return;
        if (def.clic) {
          var bersaglio = e.target.closest ? e.target.closest(def.clic) : null;
          if (bersaglio) { avanza(def); return; }
        } else if (elementoIlluminato && elementoIlluminato.contains(e.target)) {
          return; // passo solo da guardare (illumina senza clic): il tocco resta libero
        }
        // ZONE LIBERE CHE NON FANNO AVANZARE DA SOLE — la griglia delle
        // Carte Magiche in selezione.html, per esempio: il passo si chiude
        // toccando #entraBtn, ma il testo chiede di scegliere le carte
        // PRIMA, e quel tocco non deve essere bloccato solo perche' non e'
        // lui a chiudere il passo. Vedi def.libero nel passo interessato.
        if (def.libero) {
          var zonaLibera = e.target.closest ? e.target.closest(def.libero) : null;
          if (zonaLibera) return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (pannelloAttuale) {
          pannelloAttuale.classList.remove('bb-tut-scuoti');
          void pannelloAttuale.offsetWidth; // fa ripartire l'animazione da capo
          pannelloAttuale.classList.add('bb-tut-scuoti');
        }
      };
      document.addEventListener('click', listenerClicAttuale, true);
    }
    if (def.aspetta) {
      var tentativiAspetta = 0;
      attesaInCorso = setInterval(function () {
        var fatto = false;
        try { fatto = !!def.aspetta(); } catch (e) { fatto = false; }
        if (fatto) { avanza(def); return; }
        tentativiAspetta++;
        if (tentativiAspetta === 30) mostraEmergenzaAspetta(); // ~9 secondi
      }, 300);
    }

    // passo muto: solo l'alone (se previsto) e/o l'attesa, nessun pannello —
    // lo spettacolo lo fa gia' la pagina stessa (l'apertura del pacchetto)
    if (!def.titolo) return;

    // Se l'elemento illuminato sta nella meta' bassa dello schermo, il
    // pannello va in alto — altrimenti lo coprirebbe. Di default resta in
    // basso (comodo da leggere col pollice, e la maggior parte degli
    // elementi illuminati sta in alto o al centro della pagina).
    var inAlto = false;
    if (elementoIlluminato) {
      var rettangolo = elementoIlluminato.getBoundingClientRect();
      inAlto = (rettangolo.top + rettangolo.height / 2) > window.innerHeight / 2;
    }
    pannelloAttuale = document.createElement('div');
    pannelloAttuale.className = 'bb-tut-pannello ' + (inAlto ? 'in-alto' : 'in-basso');
    var html = '<div class="bb-tut-testa"><h3>' + def.titolo + '</h3>';
    if (def.bottone) {
      html += '<button class="bb-tut-btn" id="bbTutAvanti">' + def.bottone.testo + '</button>';
    } else if (!def.clic && !def.aspetta) {
      html += '<button class="bb-tut-btn" id="bbTutAvanti">Avanti</button>';
    } else {
      html += '<span class="bb-tut-btn" style="opacity:0.55;cursor:default;">Tocca l\'elemento illuminato</span>';
    }
    html += '</div><p>' + def.testo + '</p>';
    pannelloAttuale.innerHTML = html;
    document.body.appendChild(pannelloAttuale);

    // IN ALTO NON DEVE COPRIRE NE' IL SALDO NE' L'ELEMENTO DA TOCCARE.
    // Spostare il pannello in cima allo schermo risolveva il negozio che
    // finiva coperto, ma nel negozio proprio in cima c'è il saldo
    // sharkini — serve leggerlo per decidere se comprare — e il
    // pannello, alto quanto basta a scendere sotto di lui, tagliava a
    // sua volta l'offerta illuminata appena sotto: segnalato con uno
    // screenshot da chi vedeva la scritta "10 carte" tagliata a metà.
    // Si scende sotto il saldo MA non oltre l'inizio dell'elemento da
    // toccare: se le due esigenze non ci stanno entrambe, vince la
    // seconda — un saldo un po' coperto si legge comunque scorrendo,
    // un bottone tagliato a meta' no.
    if (inAlto) {
      var minTop = 0;
      var saldoEl = document.getElementById('saldo');
      if (saldoEl) {
        var saldoRect = saldoEl.getBoundingClientRect();
        if (saldoRect.bottom > 0) minTop = saldoRect.bottom + 10;
      }
      var maxTop = null;
      if (elementoIlluminato) {
        var rettIll = elementoIlluminato.getBoundingClientRect();
        var altezzaPannello = pannelloAttuale.getBoundingClientRect().height;
        maxTop = rettIll.top - altezzaPannello - 12;
      }
      var topFinale = minTop;
      if (maxTop !== null && maxTop < topFinale) topFinale = Math.max(0, maxTop);
      pannelloAttuale.style.top = topFinale + 'px';
    }

    var bottoneAvanti = document.getElementById('bbTutAvanti');
    if (bottoneAvanti) {
      bottoneAvanti.addEventListener('click', function () {
        if (def.bottone) { pulisciPassoPrecedente(); scrivi(CHIAVE_PASSO, String(passo + 1)); location.href = def.bottone.vai; }
        else avanza(def);
      });
    }
  }

  decidiSePartire();
})();
