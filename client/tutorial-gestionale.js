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
// UNA VOLTA SOLA. Finito l'ultimo passo, bb_tutorial_completato='si' e
// non riparte mai più — nemmeno cancellando bb_tutorial_passo a mano,
// perché sono due chiavi diverse.
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

  if (leggi(CHIAVE_FATTO) === 'si') return;

  var pagina = (location.pathname.split('/').pop() || 'home.html');

  // La primissima visita di sempre: nessun passo salvato, e siamo in
  // home. È l'UNICO punto in cui il tour si accende da solo.
  if (!leggi(CHIAVE_PASSO)) {
    if (pagina !== 'home.html') return;
    scrivi(CHIAVE_PASSO, '1');
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
    '.bb-tut-pannello { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999; ' +
      'background: linear-gradient(180deg, rgba(30,20,12,0.97), rgba(14,9,5,0.99)); ' +
      'border-top: 1px solid #8a6a2a; padding: 16px 18px max(16px, env(safe-area-inset-bottom)); ' +
      'font-family: "Segoe UI", system-ui, sans-serif; color: #ece3d2; ' +
      'box-shadow: 0 -10px 30px rgba(0,0,0,0.6); }' +
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

  function pulisciPassoPrecedente() {
    if (pannelloAttuale) { pannelloAttuale.remove(); pannelloAttuale = null; }
    if (elementoIlluminato) { elementoIlluminato.classList.remove('bb-tut-alone'); elementoIlluminato = null; }
    if (attesaInCorso) { clearInterval(attesaInCorso); attesaInCorso = null; }
    if (listenerClicAttuale) { document.removeEventListener('click', listenerClicAttuale, true); listenerClicAttuale = null; }
  }

  function avanza(def) {
    pulisciPassoPrecedente();
    if (def.fine) { scrivi(CHIAVE_FATTO, 'si'); cancella(CHIAVE_PASSO); return; }
    var nuovo = Number(leggi(CHIAVE_PASSO) || 0) + 1;
    scrivi(CHIAVE_PASSO, String(nuovo));
    mostraPassoCorrente(); // puo' darsi che il passo nuovo sia ANCORA su questa pagina
  }

  function illumina(selettore) {
    if (!selettore) return;
    var el = document.querySelector(selettore);
    if (!el) return; // l'elemento non c'e' ancora: niente alone, non e' un errore
    elementoIlluminato = el;
    el.classList.add('bb-tut-alone');
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function mostraPassoCorrente() {
    var passo = Number(leggi(CHIAVE_PASSO) || 0);
    var def = PASSI[passo - 1];
    if (!def) { scrivi(CHIAVE_FATTO, 'si'); cancella(CHIAVE_PASSO); return; }
    if (def.pagina !== pagina) return; // questo passo e' altrove: qui non si mostra nulla

    illumina(def.illumina);

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
        cancella(CHIAVE_PASSO);
        location.href = 'home.html';
      });
    }
  }

  mostraPassoCorrente();
})();
