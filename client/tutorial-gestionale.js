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
// SKIP TOTALE — DA TOGLIERE PRIMA DEL LANCIO VERO.
// Il magazzino del server, in sviluppo, non è garantito che sopravviva
// a lungo (si resetta, si riavvia): senza una via di fuga si sarebbe
// costretti a rifare tutto il tour a ogni prova. Il bottone "Salta
// tutto" esiste SOLO per questo. Quando il gioco sarà pubblico, va
// tolto: un giocatore vero non deve poter saltare la sua unica
// occasione di imparare come funziona il negozio. Si toglierà anche
// SKIP_TOTALE_ATTIVO qui sotto, il resto del file non cambia.
// Una versione futura, rimandata apposta: un modo per RIFARE il tour a
// volontà dalle impostazioni della home ("come se lo rifaccio essendo a
// capo") — oggi non c'è, se ne riparla quando serve davvero.
// ============================================================
(function () {
  'use strict';

  var SKIP_TOTALE_ATTIVO = true; // <-- TOGLIERE QUESTA RIGA (e il bottone) prima del lancio vero

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
    { pagina: 'negozio.html', titolo: 'Compra un pacchetto di eroi',
      testo: 'Qui sotto trovi i pacchetti di <b>eroi</b>, uno per ogni taglio. Gli eroi restano tuoi per ' +
             'sempre: si riusano partita dopo partita. Scegline uno da comprare.',
      illumina: '#vetrinaEroi', clic: '#vetrinaEroi .offerta' },

    { pagina: 'spacchetta.html',
      aspetta: function () {
        var r = document.getElementById('riepilogo');
        return !!r && getComputedStyle(r).display !== 'none';
      } },
    { pagina: 'spacchetta.html', titolo: 'Ora le Carte Magiche',
      testo: 'Ecco le tue prime carte! Torniamo al negozio per prendere anche qualche <b>Carta Magica</b>: ' +
             'costano meno degli eroi, perché a differenza loro si usano <b>una sola volta</b> e poi spariscono.',
      illumina: 'a.bottone.principale[href="negozio.html"]', clic: 'a.bottone.principale[href="negozio.html"]' },

    { pagina: 'negozio.html', titolo: 'Le Carte Magiche costano meno',
      testo: 'Stesso principio, prezzo più basso: un terzo di quello degli eroi. Prendine un pacchetto.',
      illumina: '#vetrinaMagiche', clic: '#vetrinaMagiche .offerta' },

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
      illumina: '#entraBtn', clic: '#entraBtn' },

    { pagina: 'home.html', titolo: 'Sei pronto!',
      testo: 'Hai un mazzo, hai capito come funziona il negozio: da qui puoi andare in battaglia quando vuoi.',
      illumina: '.modo[href="tavolo.html"]', fine: true }
  ];

  // ------------------------------------------------------------
  // LO STILE, UNA VOLTA SOLA
  // ------------------------------------------------------------
  var stile = document.createElement('style');
  stile.textContent =
    '.bb-tut-alone { position: relative; z-index: 9998; outline: 3px solid #e8c46a; ' +
      'outline-offset: 3px; border-radius: 10px; ' +
      'box-shadow: 0 0 0 6000px rgba(6,4,10,0.72), 0 0 26px rgba(232,196,106,0.85); ' +
      'animation: bbTutPulsa 1.6s ease-in-out infinite; }' +
    '@keyframes bbTutPulsa { 0%,100% { outline-color: #e8c46a; } 50% { outline-color: #fff3cf; } }' +
    // POINTER-EVENTS: NONE sul riquadro — segnalato da chi ci ha sbattuto
    // contro davvero: nella schermata del riepilogo il bottone vero
    // "torna al negozio" finisce proprio sotto questo pannello (fisso in
    // basso, a tutta larghezza), e senza questa riga il pannello
    // INTERCETTAVA il tocco al posto del bottone — invisibile, intoccabile,
    // bloccato li' per sempre. Riacceso solo sui bottoni del pannello
    // stesso (Avanti/Salta), che devono restare premibili.
    '.bb-tut-pannello { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999; ' +
      'background: linear-gradient(180deg, rgba(30,20,12,0.97), rgba(14,9,5,0.99)); ' +
      'border-top: 1px solid #8a6a2a; padding: 16px 18px max(16px, env(safe-area-inset-bottom)); ' +
      'font-family: "Segoe UI", system-ui, sans-serif; color: #ece3d2; ' +
      'box-shadow: 0 -10px 30px rgba(0,0,0,0.6); pointer-events: none; }' +
    '.bb-tut-pannello button { pointer-events: auto; }' +
    '.bb-tut-pannello h3 { margin: 0 0 6px; font-size: 1.05rem; color: #e8c46a; }' +
    '.bb-tut-pannello p { margin: 0 0 12px; font-size: 0.92rem; line-height: 1.5; color: #d8cdb8; }' +
    '.bb-tut-righe { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }' +
    '.bb-tut-btn { background: linear-gradient(180deg, #ffe9ae, #e8c46a); color: #2a1c08; border: none; ' +
      'padding: 10px 20px; border-radius: 10px; font-weight: 800; font-size: 0.9rem; cursor: pointer; }' +
    '.bb-tut-salta { background: transparent; border: 1px solid rgba(232,196,106,0.4); color: #b8ab8c; ' +
      'padding: 8px 14px; border-radius: 10px; font-size: 0.8rem; cursor: pointer; }';
  document.head.appendChild(stile);

  var pannelloAttuale = null;
  var elementoIlluminato = null;
  var attesaInCorso = null;   // l'intervalId dell'attesa del passo mostrato adesso
  var listenerClicAttuale = null;
  var riprovaAlone = null;    // il setTimeout dei ritentativi di illumina()

  function pulisciPassoPrecedente() {
    if (pannelloAttuale) { pannelloAttuale.remove(); pannelloAttuale = null; }
    if (elementoIlluminato) { elementoIlluminato.classList.remove('bb-tut-alone'); elementoIlluminato = null; }
    if (attesaInCorso) { clearInterval(attesaInCorso); attesaInCorso = null; }
    if (listenerClicAttuale) { document.removeEventListener('click', listenerClicAttuale, true); listenerClicAttuale = null; }
    if (riprovaAlone) { clearTimeout(riprovaAlone); riprovaAlone = null; }
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
      var righe = pannelloAttuale.querySelector('.bb-tut-righe');
      if (!righe || document.getElementById('bbTutEmergenza')) return;
      var emergenza = document.createElement('button');
      emergenza.className = 'bb-tut-btn';
      emergenza.id = 'bbTutEmergenza';
      emergenza.textContent = 'Vai avanti comunque';
      emergenza.title = 'Non trovo l\'elemento da evidenziare: puoi comunque proseguire da qui.';
      emergenza.addEventListener('click', function () { avanza(def); });
      righe.insertBefore(emergenza, righe.lastChild);
    });

    if (def.clic) {
      listenerClicAttuale = function (e) {
        var bersaglio = e.target.closest ? e.target.closest(def.clic) : null;
        if (bersaglio) avanza(def);
      };
      document.addEventListener('click', listenerClicAttuale, true);
    }
    if (def.aspetta) {
      attesaInCorso = setInterval(function () {
        if (def.aspetta()) avanza(def);
      }, 300);
    }

    // passo muto: solo l'alone (se previsto) e/o l'attesa, nessun pannello —
    // lo spettacolo lo fa gia' la pagina stessa (l'apertura del pacchetto)
    if (!def.titolo) return;

    pannelloAttuale = document.createElement('div');
    pannelloAttuale.className = 'bb-tut-pannello';
    var html = '<h3>' + def.titolo + '</h3><p>' + def.testo + '</p><div class="bb-tut-righe">';
    html += SKIP_TOTALE_ATTIVO ? '<button class="bb-tut-salta" id="bbTutSalta">Salta tutto (prova)</button>' : '<span></span>';
    if (def.bottone) {
      html += '<button class="bb-tut-btn" id="bbTutAvanti">' + def.bottone.testo + '</button>';
    } else if (!def.clic && !def.aspetta) {
      html += '<button class="bb-tut-btn" id="bbTutAvanti">Avanti</button>';
    } else {
      html += '<span class="bb-tut-btn" style="opacity:0.55;cursor:default;">Tocca l\'elemento illuminato</span>';
    }
    html += '</div>';
    pannelloAttuale.innerHTML = html;
    document.body.appendChild(pannelloAttuale);

    var bottoneAvanti = document.getElementById('bbTutAvanti');
    if (bottoneAvanti) {
      bottoneAvanti.addEventListener('click', function () {
        if (def.bottone) { pulisciPassoPrecedente(); scrivi(CHIAVE_PASSO, String(passo + 1)); location.href = def.bottone.vai; }
        else avanza(def);
      });
    }
    var bottoneSalta = document.getElementById('bbTutSalta');
    if (bottoneSalta) {
      bottoneSalta.addEventListener('click', function () {
        pulisciPassoPrecedente();
        scrivi(CHIAVE_FATTO, 'si');
        // ANCHE SALTANDO SERVE IL GETTONE DI RIFERIMENTO — dimenticato la
        // prima volta: solo avanza() (il tour finito per davvero) lo
        // salvava. Chi saltava restava con CHIAVE_FATTO='si' ma senza
        // baseline, e decidiSePartire() non aveva più modo di dire "il
        // gettone e' cambiato": il tour non ripartiva mai più, nemmeno
        // dopo che l'account spariva davvero. Bug vero, segnalato da chi
        // aveva usato Salta più volte durante le prove.
        scrivi(CHIAVE_GETTONE_AL_COMPLETAMENTO, leggi('bb_gettone') || '');
        cancella(CHIAVE_PASSO);
        location.href = 'home.html';
      });
    }
  }

  decidiSePartire();
})();
