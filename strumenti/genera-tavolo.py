# Genera client/tavolo.html per Burraco Legends partendo dal tavolo di
# Burraco Pulito (game.html): il <style> viene copiato VERBATIM, così
# l'aspetto del tavolo resta identico. Cambia solo il corpo (due nuove
# zone per le 7 carte Battle) e lo script (collegato al motore Battle).
import re, io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# L'elenco delle carte che hanno davvero un'illustrazione: si legge
# dalla cartella vera, cosi' non puo' andare fuori sincrono con i file.
from carta_illustrata import dati_illustrazioni, CSS_CARTA_ILLUSTRATA, JS_CARTA_ILLUSTRATA

# game.html di Burraco Pulito: da qui si prende SOLO il foglio di stile.
# Metti il file accanto a questo script, oppure indica il suo percorso.
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'game.html')
DST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'client', 'tavolo.html').replace(os.sep, '/')

CSS_IMPOSTAZIONI = r'''    /* ---------- IMPOSTAZIONI ---------- */
    .velo-impostazioni {
      position: fixed; inset: 0; z-index: 90; display: none;
      align-items: center; justify-content: center; padding: 18px;
      background: rgba(6,4,10,0.82); backdrop-filter: blur(4px);
    }
    .velo-impostazioni.aperto { display: flex; }
    .pannello-impostazioni {
      width: min(460px, 100%); max-height: 88vh; overflow-y: auto;
      border-radius: 16px; padding: 20px; border: 1px solid #9a6f21;
      background: linear-gradient(168deg, rgba(52,38,22,0.97), rgba(20,14,8,0.98));
      box-shadow: 0 18px 50px rgba(0,0,0,0.8);
      display: flex; flex-direction: column; gap: 16px;
      font-family: 'Segoe UI', system-ui, sans-serif; color: #f2e6cc;
    }
    .pannello-impostazioni h2 {
      margin: 0; font-family: Georgia, serif; font-size: 1.05rem;
      letter-spacing: 2.4px; text-transform: uppercase; color: #e8c46a;
    }
    .riga-imp { display: flex; flex-direction: column; gap: 9px; }
    .riga-imp .etichetta {
      font-size: 0.74rem; letter-spacing: 1.3px; text-transform: uppercase; color: #b7a686;
    }
    .spiega-imp { margin: 0; font-size: 0.73rem; color: #8a7e68; line-height: 1.55; }

    .scelte-stile { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); }
    .scelta-stile {
      display: flex; align-items: center; gap: 9px; padding: 8px 10px; cursor: pointer;
      border-radius: 10px; border: 1px solid rgba(255,255,255,0.16); background: rgba(0,0,0,0.32);
      font-size: 0.78rem; font-weight: 600; color: #f2e6cc; text-align: left;
      font-family: inherit; transition: border-color 0.14s, background 0.14s;
    }
    .scelta-stile:hover { border-color: #e8c46a; }
    .scelta-stile.scelto, .bottone-imp.scelto { border-color: #e8c46a; background: rgba(232,196,106,0.14); color: #f3e6c4; }
    .bottone-imp.pericolo { border-color: #b0505f; color: #ffb3bf; }
    .bottone-imp.pericolo:hover { background: rgba(200,60,80,0.22); color: #fff; }
    .bottone-imp.pericolo.sicuro { background: #b0505f; color: #fff; border-color: #ff8fa0; }
    /* l'anteprima è una carta vera in miniatura, non un disegnino */
    .scelta-stile .anteprima {
      --card-w: 30px; --card-h: 43px; --card-radius: 3px;
      flex: 0 0 auto; pointer-events: none;
    }

    .bottone-imp {
      padding: 12px; border-radius: 11px; border: none; cursor: pointer; font-family: inherit;
      font-size: 0.92rem; font-weight: 800; letter-spacing: 0.5px;
      background: linear-gradient(180deg, #fff0c2, #e8c46a 55%, #b98d2c); color: #2a1c08;
    }
'''

PANNELLO_IMPOSTAZIONI = r'''
<!-- ============ IMPOSTAZIONI ============ -->
<div class="velo-impostazioni" id="veloImpostazioni">
  <div class="pannello-impostazioni">
    <h2>Impostazioni</h2>

    <div class="riga-imp">
      <span class="etichetta">Suoni</span>
      <div class="scelte-stile">
        <button class="bottone-imp" id="suoniSi">Accesi</button>
        <button class="bottone-imp" id="suoniNo">Spenti</button>
      </div>
      <p class="spiega-imp">
        Fruscio delle carte, colpi e magie. Non sono file scaricati: il tavolo
        li costruisce mentre gioca, per questo il tonfo cambia a seconda di
        quanto danno arriva.
      </p>
    </div>

    <div class="riga-imp">
      <span class="etichetta">Abbandonare</span>
      <button class="bottone-imp pericolo" id="abbandona">Abbandona la partita</button>
      <p class="spiega-imp">
        Chi abbandona perde: l'avversario vince come se avesse mandato KO
        tutta la squadra. Serve per alzarsi da tavola dicendolo, invece di
        sparire e lasciare l'altro ad aspettare una mossa che non arriva.
      </p>
    </div>

    <div class="riga-imp">
      <button class="bottone-imp chiudi" id="chiudiImpostazioni">Chiudi</button>
    </div>
  </div>
</div>
'''

src = io.open(SRC, encoding='utf-8').read()
css = re.search(r'<style>(.*?)</style>', src, re.S).group(1)

BATTLE_CSS = r'''
    /* =========================================================
       BURRACO LEGENDS — aggiunte al tavolo originale.
       Tutto quello che sta sopra è il CSS di Burraco Pulito, copiato
       senza modifiche: il tavolo (feltro, mano a ventaglio, colonne dei
       giochi, mazzo/scarti) resta esattamente com'era.
       ========================================================= */
    :root {
      /* Le misure di base sono pensate per un monitor. Su un telefono in
         orizzontale l'altezza dello schermo e' la metà o meno (350-430px
         contro 700-1000px) — e' l'ALTEZZA a mancare, non la larghezza,
         quindi la regola guarda min-height, non lo schermo stretto.
         Tutto il resto (font, barre, scudo) e' calc() su --battle-w e
         --battle-h: cambiando solo questi due, il resto segue da solo. */
      /* Le carte dei personaggi e delle magie sono il posto dove si
         guarda per capire come va la partita: erano troppo piccole per
         leggerle senza avvicinarsi. Portate al 120%. Le misure stanno
         qui e una sola volta: tutto il resto (semi, nomi, barre) e'
         calcolato in proporzione, quindi cresce da solo.

         FLUIDE CON L'ALTEZZA, non a scatto. Prima erano un numero fisso
         (107px) sostituito da un altro numero fisso (58px) sotto una
         soglia di 480px di altezza — chi aveva uno schermo appena SOPRA
         quella soglia (un'app installata a schermo intero su un
         telefono grande, senza la barra del browser a rubare pixel,
         puo' benissimo superare 480px anche in orizzontale) restava
         sulla misura "da monitor" e si ritrovava la fascia di
         mazzo/scarti/mano enorme, con la zona centrale del tavolo
         schiacciata sopra — esattamente il "troppo spazio" segnalato
         giocando. clamp() cresce insieme allo schermo invece di saltare
         da una taglia all'altra: chi ha 520px di altezza prende una
         misura di mezzo, non la piu' grande delle due. */
      --battle-h: clamp(58px, 15vh, 107px);
      --battle-w: clamp(40px, 10.35vh, 74px);
      --hp: #e05266; --charge: #45b6ff; --oro: #e8c46a; --blu: #5cc0ff;
      --pergamena: #f0e2c0;
    }
    /* Un telefono in orizzontale è basso, non stretto: 350-430px di
       altezza contro i 700-1000px di un monitor. Qui si guarda solo
       l'altezza — su un monitor stretto ma alto (finestra ridimensionata)
       non deve succedere niente, il problema è un altro. */
    @media (max-height: 480px), (hover: none) and (orientation: portrait) {
      /* --battle-w/--battle-h non servono più qui: sono già fluidi con
         clamp() qui sopra, e scendono da soli fino al minimo (40/58) su
         uno schermo bassissimo. Quello che resta da fare sotto questa
         soglia è solo stringere il resto — padding e cronometro. */
      .top-shelf, .bottom-shelf, .table-resources-row { padding-top: 2px; padding-bottom: 2px; }

      /* IL CRONOMETRO STRABORDAVA DALLO SCHERMO.
         .tabellone (il suo contenitore) sa restringersi — min-width:0,
         flex-shrink — ma .turni-box, dentro, non lo ha mai imparato:
         min-width:132px per riga lo teneva rigido a 177px anche quando
         il contenitore intorno crollava a 55px. Su un monitor c'è
         sempre spazio a sufficienza e non si vedeva; su un telefono in
         orizzontale, dove ogni pezzo della fascia superiore si contende
         un'altezza bassa e una manciata di larghezza, quei 177px
         uscivano letteralmente fuori dal bordo destro dello schermo —
         la causa dello scorrimento orizzontale.
         Qui si lascia che si stringa davvero, e si comprime il
         contenuto perché stia comunque leggibile in meno spazio. */
      .tabellone, .turni-box { min-width: 0; }
      .riga-turno {
        min-width: 0; padding: 2px 5px; gap: 4px; border-radius: 5px;
      }
      .riga-turno .chi { font-size: 8px; }
      .riga-turno .orologio { font-size: 11px; }
      .riga-turno .spia-pozzetto { font-size: 7px; padding: 0 3px; }

      /* LE CARTE MAGICHE COPERTE DELL'AVVERSARIO non hanno niente da
         mostrare oltre a un punto interrogativo: tenerle alla stessa
         misura delle carte vere è spazio speso per non dire nulla. Si
         ridefinisce --battle-w/--battle-h solo su di loro: essendo una
         custom property, tutto quello che dentro la carta è calc() su
         queste due misure (il simbolo, i margini) si restringe da solo,
         senza toccare un'altra regola. Questa puo' stare qui, sul primo
         blocco: nessun'altra regola successiva tocca --battle-w su
         QUESTO selettore, quindi non perde la gara di specificita'. */
      .bcard.magica.coperta {
        --battle-w: calc(var(--battle-w) * 0.68);
        --battle-h: calc(var(--battle-h) * 0.68);
      }
    }

    /* IL RIQUADRO DEL VENTAGLIO AVVERSARIO ERA LARGO A PRESCINDERE.
       game.html lo tiene a larghezza fissa (--larghezza-ventaglio) per
       un motivo preciso: undici dorsi accavallati cambiano larghezza
       "vera" a ogni carta pescata o calata, e senza un riquadro fisso
       il tavolo ballava. Da quando i dorsi mostrati sono sempre TRE,
       fissi, quel motivo non c'è più — e il riquadro restava largo lo
       stesso, con dello spazio vuoto fra le carte (poche, piccole) e il
       numero scritto lì accanto, che sembrava sganciato da loro. Ora si
       stringe intorno al mucchietto vero. */
    .opp-hand-box { width: auto; flex: 0 0 auto; }

    /* --- Striscia delle 7 carte Battle (4 personaggi + 3 magiche) --- */
    .battle-strip { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
    .battle-strip .divisore {
      width: 2px; height: calc(var(--battle-h) * 0.75); flex: 0 0 auto; margin: 0 3px; border-radius: 2px;
      background: linear-gradient(180deg, transparent, var(--oro), transparent); opacity: 0.6;
    }

    /* --- Carta Battle: aspetto fantasy --- */
    .bcard {
      width: var(--battle-w); height: var(--battle-h); border-radius: 5px;
      box-sizing: border-box; position: relative; flex: 0 0 auto;
      padding: 3px 3px 2px; overflow: hidden;
      display: flex; flex-direction: column; align-items: center;
      background:
        radial-gradient(ellipse at 50% 12%, rgba(255,220,150,0.20), transparent 62%),
        linear-gradient(168deg, #3b2c58 0%, #2a1f42 48%, #1b1430 100%);
      border: 1px solid #7a6099;
      box-shadow: inset 0 0 0 1px rgba(232,196,106,0.28), inset 0 -8px 14px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.5);
      cursor: default;
      transition: transform 0.14s ease-out, box-shadow 0.14s;
    }
    /* cornice dorata interna, come una miniatura incorniciata */
    .bcard::before {
      content: ''; position: absolute; inset: 2px; border-radius: 3px;
      border: 1px solid rgba(232,196,106,0.34); pointer-events: none;
    }
    /* alone del seme sullo sfondo */
    .bcard::after {
      content: attr(data-seme); position: absolute; right: -6px; bottom: -10px;
      font-size: calc(var(--battle-w) * 0.78); line-height: 1;
      color: rgba(255,255,255,0.06); pointer-events: none;
    }

    /* ------------------------------------------------------------
       IL RITRATTO SULLA CARTA DA COMBATTIMENTO
       Al tavolo le carte sono larghe 40-74px: la cornice ornata, che
       nell'album e' bellissima, a quella misura diventa un ricamo
       illeggibile e per giunta si porta via meta' della carta in
       riquadri vuoti — riquadri che qui non servono, perche' vita e
       difesa hanno gia' la loro barra e il loro scudo, molto piu'
       leggibili di un numero da tre pixel.
       Quindi al tavolo l'illustrazione NON sta dentro una finestra:
       riempie la carta. Cosi' l'eroe si riconosce a colpo d'occhio,
       che e' l'unica cosa che serve mentre si gioca. La cornice resta
       dov'e' utile: album e apertura pacchetti, dove la carta e' grande
       e la si guarda invece di usarla.
       ------------------------------------------------------------ */
    .bcard .ritratto {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; z-index: 0; pointer-events: none;
    }
    /* Sopra il ritratto ci vanno nome, stelle e barra della vita: senza
       una velatura finirebbero su un disegno chiaro e non si
       leggerebbero piu'. Scura sopra e sotto, trasparente in mezzo —
       dove sta la faccia del personaggio. */
    .bcard .velo-ritratto {
      position: absolute; inset: 0; z-index: 0; pointer-events: none;
      background: linear-gradient(180deg,
        rgba(12,9,20,0.82) 0%, rgba(12,9,20,0.25) 26%,
        rgba(12,9,20,0.12) 52%, rgba(12,9,20,0.88) 100%);
    }
    /* col ritratto, il semone sfumato di sfondo non serve piu': sarebbe
       solo sporco sopra il disegno */
    .bcard.con-ritratto::after { display: none; }
    .bcard:hover { transform: translateY(-3px); box-shadow: inset 0 0 0 1px rgba(232,196,106,0.5), 0 6px 16px rgba(0,0,0,0.65), 0 0 14px rgba(232,196,106,0.35); }

    .bcard .seme {
      font-size: calc(var(--battle-w) * 0.42); line-height: 1; margin-top: 1px;
      text-shadow: 0 0 8px currentColor, 0 1px 2px #000; position: relative; z-index: 1;
    }
    .bcard .seme.rosso { color: #ff7b8e; }
    .bcard .seme.nero  { color: #dfe6ff; }

    .bcard .nome {
      font-size: calc(var(--battle-w) * 0.115); line-height: 1.15; font-weight: 700;
      color: var(--pergamena); text-align: center; letter-spacing: 0.2px;
      width: 100%; max-height: calc(var(--battle-w) * 0.30); overflow: hidden;
      text-shadow: 0 1px 2px #000; position: relative; z-index: 1; margin-top: 1px;
    }
    .bcard .stelle { font-size: calc(var(--battle-w) * 0.13); color: var(--oro); line-height: 1; position: relative; z-index: 1; }
    /* le descrizioni NON stanno più dentro la carta: finirebbero fuori dai bordi.
       Vanno nel pannello #bcardPop, che si apre accanto alla carta. */
    .bcard .desc, .bcard .stat { display: none; }

    .bcard .barra {
      width: 84%; height: 4px; border-radius: 3px; margin-top: 2px; overflow: hidden;
      background: rgba(0,0,0,0.6); box-shadow: inset 0 1px 2px rgba(0,0,0,0.8);
      position: relative; z-index: 1;
    }
    .bcard .barra i {
      display: block; height: 100%; border-radius: 3px;
      /* tre volte piu' lenta di prima (era 0,35s): a quella velocita' la
         barra era gia' arrivata prima che l'occhio la trovasse, e non si
         vedeva QUANTA vita fosse andata via, solo quanta ne restava. */
      transition: width 1.05s cubic-bezier(0.22, 0.61, 0.36, 1);
    }
    .bcard .barra.vita i   { background: linear-gradient(180deg, #ff8a9b, var(--hp)); box-shadow: 0 0 5px rgba(224,82,102,0.8); }
    .bcard .barra.carica i { background: linear-gradient(180deg, #9adcff, var(--charge)); box-shadow: 0 0 5px rgba(69,182,255,0.8); }
    /* barra piena: l'abilità speciale è pronta e si può attivare */
    .bcard .barra.carica.piena { box-shadow: 0 0 10px var(--charge); animation: caricaPiena 1s ease-in-out infinite; }
    @keyframes caricaPiena { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }

    /* ------------------------------------------------------------
       LO SCUDO
       La Difesa era l'unica statistica che non si vedeva mai. Risultato:
       una carta che toglie il 25% di difesa non mostrava NIENTE nel
       momento in cui colpiva — niente numero, niente barra, niente. Chi
       la subiva se ne accorgeva solo al colpo dopo, che faceva più male
       senza una ragione visibile.
       Adesso c'è uno scudo, pieno al 100% quando la Difesa è quella di
       base. Scende se qualcuno indebolisce le difese, sale se qualcuno
       le rinforza — e in tutti e due i casi si vede succedere.
       ------------------------------------------------------------ */
    .bcard .scudo {
      position: absolute; top: 2px; left: 2px; z-index: 3;
      width: calc(var(--battle-w) * 0.30); height: calc(var(--battle-w) * 0.30);
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.5s;
    }
    .bcard .scudo svg { width: 100%; height: 100%; display: block; overflow: visible; }
    /* il riempimento sale e scende: è il pieno dello scudo */
    .bcard .scudo .riempi { transition: transform 0.8s cubic-bezier(0.22,0.61,0.36,1); transform-origin: 50% 100%; }
    /* a scudo pieno il numero non serve: si vede solo l'icona, pulita.
       Compare quando c'è qualcosa di diverso da raccontare — che è
       esattamente il momento in cui deve attirare l'occhio. */
    .bcard .scudo .valore {
      position: absolute; font-size: calc(var(--battle-w) * 0.135); font-weight: 900;
      color: #fff; text-shadow: 0 1px 2px #000, 0 0 4px #000; letter-spacing: -0.3px;
    }
    .bcard .scudo.intero { opacity: 0.55; }              /* pieno: presente ma discreto */
    .bcard .scudo.rotto  { animation: scudoColpito 0.6s ease-out; }
    @keyframes scudoColpito {
      0%   { transform: scale(1); }
      35%  { transform: scale(1.35); }
      100% { transform: scale(1); }
    }

    /* La carta con l'abilità pronta si accende e diventa cliccabile */
    .bcard.pronta {
      cursor: pointer; border-color: var(--charge);
      box-shadow: inset 0 0 0 1px rgba(69,182,255,0.6), 0 0 16px rgba(69,182,255,0.75);
      animation: eroePronto 1.4s ease-in-out infinite;
    }
    @keyframes eroePronto {
      0%,100% { box-shadow: inset 0 0 0 1px rgba(69,182,255,0.5), 0 0 12px rgba(69,182,255,0.6); }
      50%     { box-shadow: inset 0 0 0 1px rgba(69,182,255,0.9), 0 0 24px rgba(69,182,255,1); }
    }
    .bcard.pronta::after { color: rgba(69,182,255,0.16); }
    /* etichetta PRONTA sopra la carta */
    .bcard .pronta-tag {
      position: absolute; top: -1px; left: 0; right: 0; z-index: 2;
      font-size: calc(var(--battle-w) * 0.115); font-weight: 800; letter-spacing: 0.5px;
      text-align: center; color: #0b2233; background: var(--charge);
      border-radius: 3px 3px 0 0; padding: 1px 0;
    }

    /* Modalità "scegli il bersaglio": si spegne il resto e si accendono
       solo i personaggi avversari ancora vivi */
    body.scelta-bersaglio .bcard:not(.mirabile) { opacity: 0.35; }
    body.scelta-bersaglio .bcard.mirabile {
      cursor: crosshair; opacity: 1; border-color: #ff7b8e;
      box-shadow: inset 0 0 0 1px rgba(255,123,142,0.7), 0 0 18px rgba(255,123,142,0.85);
      animation: bersaglio 0.9s ease-in-out infinite;
    }
    @keyframes bersaglio { 0%,100% { transform: none; } 50% { transform: translateY(-4px); } }
    #istruzioneBersaglio {
      position: fixed; left: 50%; top: 8%; transform: translateX(-50%); z-index: 850;
      display: none; padding: 10px 20px; border-radius: 10px; text-align: center;
      background: linear-gradient(165deg, rgba(20,50,70,0.97), rgba(10,25,38,0.97));
      border: 2px solid var(--charge); box-shadow: 0 8px 28px rgba(0,0,0,0.7), 0 0 22px rgba(69,182,255,0.5);
      font-family: 'Segoe UI', system-ui, sans-serif; color: #dff2ff; font-size: 0.95rem;
    }
    #istruzioneBersaglio.mostra { display: block; }
    #istruzioneBersaglio b { color: var(--charge); }
    #istruzioneBersaglio .annulla {
      display: inline-block; margin-left: 12px; font-size: 0.8rem; color: #9fb8c9;
      border: 1px solid #40607a; border-radius: 6px; padding: 2px 10px; cursor: pointer;
    }
    #istruzioneBersaglio .annulla:hover { color: #fff; border-color: var(--charge); }
    .bcard.ko { opacity: 0.32; filter: grayscale(1); }

    /* Carte magiche: oro "fuoco" per la Sorpresa, blu "elettrico" per la Trappola (spec §6) */
    .bcard.magica { justify-content: flex-start; cursor: pointer; padding-top: 2px; }
    .bcard.magica .sigillo {
      font-size: calc(var(--battle-w) * 0.38); font-weight: 900; line-height: 1;
      position: relative; z-index: 1; text-shadow: 0 0 10px currentColor, 0 2px 3px #000;
    }
    .bcard.magica .etichetta { font-size: calc(var(--battle-w) * 0.10); letter-spacing: 1px; opacity: 0.8; position: relative; z-index: 1; margin-top: 1px; }
    /* oltre al tipo si legge anche il NOME della carta */
    .bcard.magica .nome-magia {
      font-size: calc(var(--battle-w) * 0.115); line-height: 1.15; font-weight: 700;
      color: var(--pergamena); text-align: center; width: 100%; margin-top: 2px;
      max-height: calc(var(--battle-w) * 0.42); overflow: hidden;
      text-shadow: 0 1px 2px #000; position: relative; z-index: 1;
    }
    .bcard.magica.sorpresa { border-color: var(--oro); color: var(--oro);
      background: radial-gradient(ellipse at 50% 30%, rgba(232,196,106,0.28), transparent 65%), linear-gradient(168deg, #4a3620, #2a1d12); }
    .bcard.magica.trappola { border-color: var(--blu); color: var(--blu);
      background: radial-gradient(ellipse at 50% 30%, rgba(92,192,255,0.24), transparent 65%), linear-gradient(168deg, #1e3348, #131f2e); }
    .bcard.magica.usata { opacity: 0.28; cursor: not-allowed; }
    .bcard.magica.armata { animation: pulsaTrappola 1.6s ease-in-out infinite; }
    @keyframes pulsaTrappola {
      0%,100% { box-shadow: inset 0 0 0 1px rgba(92,192,255,0.4), 0 0 6px rgba(92,192,255,0.5); }
      50%     { box-shadow: inset 0 0 0 1px rgba(92,192,255,0.7), 0 0 16px rgba(92,192,255,0.95); }
    }
    .bcard.magica.coperta {
      color: #6f7fa8; border-color: #4a3d70; cursor: default;
      background: repeating-linear-gradient(45deg, #2e2547 0 4px, #241d38 4px 8px);
    }
    .bcard.magica.coperta .sigillo { text-shadow: none; opacity: 0.75; }
    /* ------------------------------------------------------------
       IL SORTEGGIO DI CHI COMINCIA
       Il mazzo pesca una carta a testa e la più alta decide. Prima
       cominciava sempre chi apriva il tavolo, senza che si vedesse
       niente: adesso lo si guarda succedere.
       ------------------------------------------------------------ */
    #sorteggio {
      position: fixed; inset: 0; z-index: 60; display: none;
      background: rgba(6,10,18,0.82); backdrop-filter: blur(3px);
      flex-direction: column; align-items: center; justify-content: center;
      gap: 18px; text-align: center; cursor: pointer;
    }
    #sorteggio.mostra { display: flex; }
    #sorteggio .titolo {
      font-size: clamp(18px, 3.4vw, 30px); font-weight: 800; letter-spacing: 0.04em;
      color: #ffe6a8; text-shadow: 0 3px 18px rgba(0,0,0,0.9);
    }
    #sorteggio .coppia { display: flex; gap: clamp(18px, 6vw, 60px); align-items: flex-start; }
    #sorteggio .posto { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    #sorteggio .chi {
      font-size: clamp(11px, 1.8vw, 15px); letter-spacing: 0.1em;
      text-transform: uppercase; color: #b9c6e4;
    }
    /* la carta arriva dal mazzo e si gira */
    #sorteggio .card {
      transform: rotateY(90deg) translateY(-40px); opacity: 0;
      animation: sorteggioGira 0.55s cubic-bezier(.2,.8,.3,1.2) forwards;
    }
    #sorteggio .posto:nth-child(2) .card { animation-delay: 0.45s; }
    @keyframes sorteggioGira {
      60%  { opacity: 1; transform: rotateY(-12deg) translateY(0); }
      100% { opacity: 1; transform: rotateY(0) translateY(0); }
    }
    /* chi ha vinto si accende */
    #sorteggio .posto.vince .card {
      box-shadow: 0 0 0 3px #ffcf5c, 0 0 34px rgba(255,207,92,0.9);
      border-radius: 8px;
    }
    #sorteggio .posto.perde { opacity: 0.5; filter: saturate(0.6); }
    #sorteggio .esito {
      min-height: 1.4em;
      font-size: clamp(16px, 3vw, 26px); font-weight: 800; color: #fff;
      opacity: 0; animation: sorteggioEsito 0.5s ease-out 1.15s forwards;
    }
    @keyframes sorteggioEsito { to { opacity: 1; } }
    #sorteggio .nota { font-size: 12px; color: #8c9ab8; }
    /* le coppie pari che non hanno deciso (due jolly): si mostrano piccole */
    #sorteggio .ripescate { display: flex; gap: 10px; opacity: 0.55; transform: scale(0.6); }

    /* Le Carte Magiche non costano più punti magia: al posto del vecchio
       gettone col prezzo, una fascia che dice che quella carta è finita.
       Vale un solo utilizzo, e dopo sparisce anche dalla collezione. */
    .bcard .segno-usata {
      position: absolute; top: 50%; left: 0; right: 0; z-index: 2;
      transform: translateY(-50%) rotate(-12deg);
      text-align: center; letter-spacing: 0.12em;
      font-size: calc(var(--battle-w) * 0.15); font-weight: 900;
      color: #ffdada; background: rgba(120,20,30,0.78);
      padding: 2px 0; box-shadow: 0 0 8px rgba(0,0,0,0.5);
    }
    .bcard.coperta:hover { transform: none; }

    /* --- Pannello che si apre accanto alla carta ---
       Prima la carta veniva semplicemente ingrandita e il testo usciva dai
       bordi. Ora nome, statistiche e descrizione vanno qui, in un riquadro
       di larghezza propria: il testo non può più sbordare. */
    #bcardPop {
      position: fixed; z-index: 800; display: none; width: 200px; padding: 10px 12px;
      border-radius: 8px; pointer-events: none;
      background: linear-gradient(168deg, #3b2c58, #1b1430);
      border: 1px solid var(--oro);
      box-shadow: 0 10px 30px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(232,196,106,0.25);
      font-family: 'Segoe UI', system-ui, sans-serif; color: #ece7f7;
    }
    #bcardPop.mostra { display: block; animation: popIn 0.13s ease-out; }
    @keyframes popIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    #bcardPop .pnome { font-weight: 800; font-size: 13px; color: var(--oro); margin-bottom: 2px; }
    #bcardPop .pstelle { font-size: 11px; color: var(--oro); margin-bottom: 5px; }
    #bcardPop .pstat { font-size: 11px; color: #d9cdf2; margin-bottom: 5px; }
    #bcardPop .pcarica { font-size: 11px; color: var(--charge); margin-bottom: 5px; font-weight: 600; }
    #bcardPop .pdesc { font-size: 11px; color: #b9acd6; line-height: 1.45; }
    #bcardPop .ptipo { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.7; }

    /* COL DITO, IL PANNELLINO DA 200px ACCANTO ALLA CARTA NON SI LEGGE.
       Su schermo grande basta avvicinare l'occhio; su telefono il testo
       a 11px sotto un pollice che ha appena toccato e' troppo piccolo.
       Diventa un pannello centrato che occupa quasi tutta l'altezza:
       la posizione calcolata in JS (accanto alla carta) viene scavalcata
       qui con !important — l'inline style di li' perde sempre contro una
       regola del foglio che dichiara !important, anche se scritto dopo. */
    @media (hover: none), (pointer: coarse) {
      #bcardPop {
        left: 50% !important; top: 50% !important; right: auto !important; bottom: auto !important;
        transform: translate(-50%, -50%);
        width: min(88vw, 420px) !important; max-height: 82vh; overflow-y: auto;
        padding: 20px 22px; border-radius: 16px;
      }
      /* l'animazione di ingresso spostava la carta con translateY, che
         avrebbe cancellato il centraggio sopra: qui basta una dissolvenza */
      #bcardPop.mostra { animation: popInCentrato 0.15s ease-out; }
      @keyframes popInCentrato { from { opacity: 0; } to { opacity: 1; } }
      #bcardPop .pnome { font-size: 22px; margin-bottom: 6px; }
      #bcardPop .pstelle { font-size: 17px; margin-bottom: 10px; }
      #bcardPop .pstat { font-size: 16px; margin-bottom: 10px; }
      #bcardPop .pcarica { font-size: 16px; margin-bottom: 10px; }
      #bcardPop .pdesc { font-size: 17px; line-height: 1.55; }
      #bcardPop .ptipo { font-size: 13px; margin-bottom: 4px; }
    }

    /* Le mie 7 carte stanno nella riga di mazzo e scarti, a destra.
       Il monte scarti ha flex:1 1 auto, quindi si restringe da solo man mano
       che cresce, senza mai invadere questa zona (che è flex:0 0 auto). */
    .table-resources-row .battle-strip { margin-left: auto; }

    /* Le carte dell'avversario stanno in alto, fra il tasto impostazioni e la sua mano. */
    .top-shelf .battle-strip { margin: 0 8px 0 4px; }

    /* =========================================================
       SFONDO: TAVOLO FATATO
       Il feltro verde piatto dell'originale diventa una radura incantata.
       Tutto disegnato con CSS (nessuna immagine da scaricare): alone di
       luce lunare al centro, bagliori colorati agli angoli, venature e
       lucciole che fluttuano piano.
       ========================================================= */
    /* ============================================================
       LO SFONDO
       Era il verde da circolo del burraco: giusto per un'app di burraco,
       fuori posto per una partita fra eroi. Adesso e' pietra scura con
       due bracieri agli angoli — uno caldo, uno freddo — e una luce che
       cade dall'alto sul centro, dove si gioca. Il verde resta, ma solo
       come riflesso lontano: si riconosce che e' un tavolo da carte
       senza che sembri un tappeto verde.
       Tutto disegnato dal foglio di stile: nessuna immagine da scaricare,
       la pagina continua ad aprirsi col doppio clic anche senza rete.
       ============================================================ */
    /* IL MARGINE DI SICUREZZA MANCAVA PROPRIO DOVE SERVE ORA.
       game.html (sopra) mette il margine di sicurezza solo sopra e
       sotto: "ai lati no", dice il commento, perche' Burraco Pulito si
       gioca anche in verticale e in orizzontale il notch della fotocamera
       lascia gia' una fascia nera sua. Ma il tavolo di Burraco Legends
       e' bloccato in orizzontale FORZATO — e ruotando il telefono, la
       barra dei gesti (quella del sistema, in basso quando si tiene il
       telefono dritto) finisce a SINISTRA o a DESTRA dello schermo, non
       più sotto. Il margine di sicurezza si sposta con lei: e' scritto
       nel CSS del sistema operativo, non lo decidiamo noi. Tenendo
       fissi i 4px sui lati, quella barra tagliava le carte proprio li'.
       Qui si mettono TUTTI E QUATTRO i lati sotto env(): quello vero, il
       sistema lo aggiorna da solo a seconda di come il telefono è girato
       in quel momento; dove non serve (desktop, o il lato senza barra)
       env() vale zero e resta il minimo di 4px. */
    body {
      padding: max(4px, env(safe-area-inset-top)) max(4px, env(safe-area-inset-right))
               max(4px, env(safe-area-inset-bottom)) max(4px, env(safe-area-inset-left)) !important;
    }

    /* Seconda difesa contro il pinch-to-zoom, per i browser che
       ignorano maximum-scale nel viewport: senza gesti di zoom/pan a
       due dita sulla pagina, il doppio tocco e lo scorrimento normale
       restano intatti (manipulation li lascia passare, blocca solo il
       resto). */
    html, body { touch-action: manipulation; }

    /* ============================================================
       ORIZZONTALE FORZATO ANCHE CON LA ROTAZIONE DEL TELEFONO BLOCCATA.
       screen.orientation.lock() (script in fondo alla pagina) chiede al
       sistema di ruotare da solo, ma SE la rotazione automatica del
       telefono è disattivata, il sistema ignora la richiesta: nessuna
       pagina web, nessuna app, può scavalcare quell'interruttore — è
       una scelta di Android/iOS, non un limite di questo codice.
       Qui si aggira il problema, non lo si risolve: si ruota il DISEGNO
       della pagina di 90° con un transform, lasciando il telefono
       fisicamente fermo in verticale. Al sistema operativo il telefono
       resta "in verticale" (la barra di stato eccetera non si accorge
       di niente): quello che cambia è solo cosa la pagina disegna
       dentro quello spazio verticale — un rettangolo Wp×Hp che dentro
       contiene un gioco disegnato come se fosse Hp×Wp, ruotato.
       LA GEOMETRIA (per chi la deve ritoccare):
         - <html> diventa largo quanto lo schermo è ALTO (100vh) e alto
           quanto lo schermo è LARGO (100vw): le sue dimensioni vere,
           prima di ruotare, sono già quelle "orizzontali" che vogliamo.
         - transform-origin in alto a sinistra: il punto (0,0) resta
           fermo mentre tutto il resto gira attorno a lui.
         - ruotando 90° in senso orario, il rettangolo finisce spostato
           a sinistra dell'origine (fuori schermo): "left:100%" lo
           riporta esattamente al suo posto. La matematica è nei
           commenti del changelog per chi vuole verificarla a mano.
       COSA NON è PERFETTO: le tacche di sicurezza (env(safe-area-*))
       restano calcolate sull'orientamento VERO del telefono, non su
       quello disegnato — su un telefono col notch il margine potrebbe
       non essere dal lato esatto. Accettabile: meglio un margine un
       po' impreciso che nessun gioco giocabile affatto. */
    @media (hover: none) and (orientation: portrait) {
      html {
        width: 100vh; height: 100vw;
        transform: rotate(90deg); transform-origin: top left;
        position: absolute; top: 0; left: 100%;
        overflow: hidden;
      }
      /* body eredita la forma "orizzontale" del genitore, non i suoi
         100vh originali (quelli sono l'altezza VERA del telefono, qui
         diventerebbe uno stiramento fuori misura). */
      html body { width: 100%; height: 100%; }
      /* il riquadro "gira il telefono" non serve più: il gioco si è già
         girato da solo. Resta nel documento (torna a servire se un
         giorno questo trucco smettesse di funzionare da qualche parte)
         ma non si mostra. */
      #ruotaAvviso { display: none !important; }
    }
    body {
      background:
        /* la luce che cade sul tavolo */
        radial-gradient(ellipse 62% 48% at 50% 38%, rgba(190,220,255,0.10), transparent 68%),
        /* braciere caldo a sinistra, luce fredda a destra */
        radial-gradient(ellipse 46% 42% at 6% 88%, rgba(255,140,60,0.16), transparent 70%),
        radial-gradient(ellipse 46% 42% at 96% 10%, rgba(110,140,255,0.16), transparent 70%),
        /* un ricordo di feltro verde, molto in fondo */
        radial-gradient(ellipse 70% 46% at 50% 56%, rgba(40,120,90,0.22), transparent 72%),
        /* la camera di pietra vera, illustrata — prima era solo un gradiente */
        url('immagini/decorazioni/sfondo-tavolo.webp') center / cover no-repeat,
        linear-gradient(168deg, #171426 0%, #1d1a2f 34%, #15121f 68%, #0b0912 100%) !important;
    }
    /* venature della pietra: due griglie storte e quasi invisibili */
    body::before {
      content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background:
        repeating-linear-gradient(64deg, rgba(255,255,255,0.014) 0 1px, transparent 1px 42px),
        repeating-linear-gradient(-26deg, rgba(0,0,0,0.10) 0 1px, transparent 1px 58px);
    }
    /* bordi scuriti: l'occhio va al centro e ci resta */
    body::after {
      content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
      box-shadow: inset 0 0 22vh rgba(0,0,0,0.62), inset 0 0 6vh rgba(0,0,0,0.35);
    }
    .table-battlefield {
      position: relative;
      background:
        /* il cerchio inciso al centro del campo: due anelli sottilissimi,
           si notano solo quando si guarda, ed e' giusto cosi' */
        radial-gradient(circle at 50% 50%, transparent 0 27%, rgba(232,196,106,0.09) 27% 27.4%, transparent 27.4%),
        radial-gradient(circle at 50% 50%, transparent 0 33%, rgba(232,196,106,0.06) 33% 33.3%, transparent 33.3%),
        radial-gradient(ellipse 62% 58% at 50% 50%, rgba(190,255,225,0.10), transparent 72%),
        repeating-linear-gradient(102deg, rgba(255,255,255,0.022) 0 2px, transparent 2px 26px),
        repeating-linear-gradient(-14deg, rgba(0,0,0,0.05) 0 3px, transparent 3px 34px),
        /* il feltro vero: pietra illustrata al posto del solo effetto di luce */
        url('immagini/decorazioni/feltro-tavolo.webp') center / cover no-repeat;
      box-shadow: inset 0 0 120px rgba(0,0,0,0.42), inset 0 0 40px rgba(126,255,204,0.06);
    }
    /* cerchio rituale al centro del tavolo */
    .table-battlefield::before {
      content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
      width: min(46vh, 340px); height: min(46vh, 340px); border-radius: 50%;
      border: 1px solid rgba(190,255,225,0.16);
      box-shadow: 0 0 40px rgba(126,255,204,0.10), inset 0 0 60px rgba(126,255,204,0.06);
      pointer-events: none;
    }
    .table-battlefield::after {
      content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
      width: min(30vh, 220px); height: min(30vh, 220px); border-radius: 50%;
      border: 1px dashed rgba(232,196,106,0.16);
      animation: ruotaCerchio 90s linear infinite; pointer-events: none;
    }
    @keyframes ruotaCerchio { to { transform: translate(-50%,-50%) rotate(360deg); } }

    /* lucciole */
    .lucciole { position: fixed; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }
    .lucciola {
      position: absolute; width: 3px; height: 3px; border-radius: 50%;
      background: #dfffe9; box-shadow: 0 0 8px 2px rgba(190,255,225,0.75);
      opacity: 0; animation: fluttua linear infinite;
    }
    @keyframes fluttua {
      0%   { opacity: 0; transform: translate(0, 0) scale(0.7); }
      12%  { opacity: 0.85; }
      50%  { transform: translate(22px, -46px) scale(1.15); }
      88%  { opacity: 0.7; }
      100% { opacity: 0; transform: translate(-14px, -96px) scale(0.6); }
    }

    /* le fasce restano leggibili sopra lo sfondo fatato */
    .top-shelf, .bottom-shelf, .table-resources-row {
      background: linear-gradient(180deg, rgba(8,36,26,0.92), rgba(6,26,19,0.92)) !important;
      backdrop-filter: blur(2px);
      border-color: rgba(232,196,106,0.35) !important;
    }

    /* =========================================================
       LA CARTA MAGICA CHE SI APRE A SCHERMO
       Una sola animazione, usata da tutte e tre le occasioni: quando
       giochi una Sorpresa, quando posi una Trappola e quando una Trappola
       scatta (lì la carta si rivela). La carta ha forma di carta e occupa
       circa un quarto dello schermo: arriva ruotando da lontano, atterra
       con un colpo, resta ferma il tempo di leggerla e poi si dissolve.
       ========================================================= */
    #sorpresaOverlay {
      position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
      z-index: 900; background: radial-gradient(ellipse at center, rgba(30,22,10,0.72), rgba(0,0,0,0.9));
      perspective: 1200px;
    }
    #sorpresaOverlay.mostra { display: flex; animation: velaIn 0.3s ease-out; }
    @keyframes velaIn { from { opacity: 0; } to { opacity: 1; } }

    /* raggi che ruotano dietro la carta */
    #sorpresaOverlay .raggi {
      position: absolute; width: 170vmax; height: 170vmax; pointer-events: none;
      background: repeating-conic-gradient(from 0deg, rgba(232,196,106,0.15) 0deg 5deg, transparent 5deg 15deg);
      animation: giraRaggi 16s linear infinite; opacity: 0;
    }
    #sorpresaOverlay.mostra .raggi { animation: giraRaggi 16s linear infinite, raggiIn 0.6s ease-out 0.25s forwards; }
    @keyframes giraRaggi { to { transform: rotate(360deg); } }
    @keyframes raggiIn { to { opacity: 0.5; } }
    #sorpresaOverlay.trappola .raggi { background: repeating-conic-gradient(from 0deg, rgba(92,192,255,0.15) 0deg 5deg, transparent 5deg 15deg); }

    /* onda d'urto nel momento in cui la carta si pianta */
    #sorpresaOverlay .botto {
      position: absolute; width: 20vh; height: 20vh; border-radius: 50%; pointer-events: none;
      border: 3px solid var(--oro); opacity: 0;
    }
    #sorpresaOverlay.mostra .botto { animation: bottoOnda 0.7s ease-out 0.42s forwards; }
    #sorpresaOverlay.trappola .botto { border-color: var(--blu); }
    @keyframes bottoOnda {
      0%   { opacity: 0.95; transform: scale(0.35); }
      100% { opacity: 0; transform: scale(3.6); }
    }

    /* LA CARTA: forma di carta (alta più che larga), circa un quarto di schermo */
    .sorpresa-grande {
      position: relative; width: calc(58vh * 0.7); height: 58vh;
      min-width: 240px; max-width: 92vw;
      padding: 4.5vh 3vh; text-align: center; box-sizing: border-box;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.4vh;
      border-radius: 2.2vh; border: 0.5vh solid var(--oro);
      background:
        radial-gradient(ellipse at 50% 22%, rgba(255,220,150,0.28), transparent 62%),
        linear-gradient(168deg, #4a3620 0%, #2a1d12 55%, #1b1430 100%);
      box-shadow: 0 0 12vh rgba(232,196,106,0.8), inset 0 0 5vh rgba(232,196,106,0.25), 0 2vh 6vh rgba(0,0,0,0.7);
      animation: cartaEntra 3.4s cubic-bezier(.2,.9,.25,1) forwards;
      transform-style: preserve-3d;
    }
    #sorpresaOverlay.trappola .sorpresa-grande {
      border-color: var(--blu);
      background:
        radial-gradient(ellipse at 50% 22%, rgba(92,192,255,0.26), transparent 62%),
        linear-gradient(168deg, #1e3348 0%, #142434 55%, #101a28 100%);
      box-shadow: 0 0 12vh rgba(92,192,255,0.8), inset 0 0 5vh rgba(92,192,255,0.25), 0 2vh 6vh rgba(0,0,0,0.7);
    }

    /* Arriva da lontano ruotando su sé stessa, si pianta con un rimbalzo,
       resta ferma il tempo di leggerla, poi si allontana svanendo. */
    @keyframes cartaEntra {
      0%   { transform: translateZ(-900px) rotateY(-220deg) rotate(-18deg) scale(0.4); opacity: 0; }
      10%  { opacity: 1; }
      13%  { transform: translateZ(60px) rotateY(0deg) rotate(2deg) scale(1.14); opacity: 1; }
      18%  { transform: translateZ(0) rotateY(0deg) rotate(0deg) scale(0.98); }
      22%  { transform: translateZ(0) scale(1); }
      88%  { transform: translateZ(0) scale(1); opacity: 1; }
      100% { transform: translateZ(200px) scale(1.1) translateY(-4vh); opacity: 0; }
    }

    /* cornice interna, come una carta incorniciata */
    .sorpresa-grande::before {
      content: ''; position: absolute; inset: 1.1vh; border-radius: 1.4vh;
      border: 1px solid rgba(255,255,255,0.28); pointer-events: none;
    }
    /* alone del simbolo sullo sfondo */
    .sorpresa-grande::after {
      content: attr(data-simbolo); position: absolute; right: -1vh; bottom: -3vh;
      font-size: 26vh; line-height: 1; color: rgba(255,255,255,0.05); pointer-events: none;
    }

    .sorpresa-grande .chi { font-size: 1.5vh; letter-spacing: 0.35vh; text-transform: uppercase; color: #ffe9b0; opacity: 0.85; }
    .sorpresa-grande .sigillone {
      font-size: 8vh; line-height: 1; color: var(--oro);
      text-shadow: 0 0 4vh var(--oro), 0 0 1vh #fff;
      animation: pulsaSigillo 1.5s ease-in-out infinite;
    }
    #sorpresaOverlay.trappola .sigillone { color: var(--blu); text-shadow: 0 0 4vh var(--blu), 0 0 1vh #fff; }
    @keyframes pulsaSigillo { 0%,100% { transform: scale(1) rotate(0); } 50% { transform: scale(1.16) rotate(4deg); } }

    .sorpresa-grande .tit { font-size: 3.2vh; font-weight: 900; color: var(--oro); text-shadow: 0 0.3vh 1.2vh rgba(0,0,0,0.9); line-height: 1.15; }
    #sorpresaOverlay.trappola .tit { color: #bfe6ff; }
    .sorpresa-grande .txt { color: #f0e2c0; font-size: 1.9vh; line-height: 1.45; max-width: 92%; }
    .sorpresa-grande .esito { font-size: 2vh; color: #ff9db0; font-weight: 800; min-height: 2.4vh; line-height: 1.3; }
    .sorpresa-grande .costo-grande {
      position: absolute; top: 1.6vh; right: 1.6vh;
      width: 4.6vh; height: 4.6vh; border-radius: 50%;
      background: var(--charge); color: #06202f; font-weight: 900; font-size: 2.2vh;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 2vh rgba(69,182,255,0.9);
    }

    /* scintille che schizzano via quando la carta atterra */
    #sorpresaOverlay .scintilla {
      position: absolute; width: 0.8vh; height: 0.8vh; border-radius: 50%;
      background: var(--oro); box-shadow: 0 0 1.4vh var(--oro); opacity: 0;
    }
    #sorpresaOverlay.trappola .scintilla { background: var(--blu); box-shadow: 0 0 1.4vh var(--blu); }
    #sorpresaOverlay.mostra .scintilla { animation: scintillaVia 0.9s ease-out 0.42s forwards; }
    @keyframes scintillaVia {
      0%   { opacity: 1; transform: translate(0,0) scale(1); }
      100% { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(0.2); }
    }

    /* --- Resoconto del danno: chi ha subito quanto --- */
    #resoconto {
      position: fixed; left: 50%; top: 12%; transform: translateX(-50%);
      z-index: 700; display: none; pointer-events: none; text-align: center;
      padding: 12px 22px; border-radius: 12px;
      background: linear-gradient(165deg, rgba(60,20,28,0.96), rgba(30,10,16,0.96));
      border: 2px solid #ff7b8e; box-shadow: 0 10px 34px rgba(0,0,0,0.7), 0 0 26px rgba(255,123,142,0.4);
      font-family: 'Segoe UI', system-ui, sans-serif; color: #ffe9ec;
    }
    #resoconto.mostra { display: block; animation: resocontoIn 0.3s ease-out; }
    @keyframes resocontoIn { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%); } }
    #resoconto .riga { font-size: 1rem; margin: 3px 0; }
    #resoconto .riga b { color: #fff; }
    #resoconto .riga .num { color: #ff9db0; font-weight: 800; }
    #resoconto .titolo { font-size: 0.75rem; letter-spacing: 2px; text-transform: uppercase; opacity: 0.7; margin-bottom: 6px; }

    /* Pozzetto già preso: resta al suo posto ma spento, così si vede a
       colpo d'occhio chi lo ha ancora da prendere. */
    .pozzetto-card.preso { opacity: 0.25; filter: grayscale(1); }

    /* IL VECCHIO "SCIVOLAMENTO" DI game.html QUI FA PIÙ DANNO CHE BENE.
       Su cellulare, game.html abbassa .table-resources-row di un sesto
       di carta (position:relative + top) e compensa con un margine
       negativo della stessa misura, cosi' la riga sotto non si sposta.
       Un nudge innocuo quando quella riga era solo pozzetti+mazzo+scarti,
       alta poco più di una carta. Da quando ci sono passate anche le 7
       carte Battle e la barra magia, la riga è alta il doppio o più: lo
       stesso scivolamento (il top verso il basso, il margine negativo
       che tira su la mano sotto) si somma ed ecco una sovrapposizione
       vera — misurata: ~17px di .bottom-shelf finiti dentro
       .table-resources-row su un telefono in orizzontale. Qui si
       annulla: con carte già alte quanto bastano, il nudge di un sesto
       di carta non serve più a nessuno. */
    .table-resources-row { position: static; top: auto; margin-bottom: 0; }

    /* I MIEI GIOCHI CALATI: ANCORATI IN CIMA, COME QUELLI DELL'AVVERSARIO.
       C'era stato un tentativo di ancorarli in basso (vicino alla mano,
       lasciando il vuoto in alto) per non sembrare spazio sprecato a
       inizio partita. Ma un gioco che cresce da sotto in su, mentre lo si
       costruisce carta dopo carta, e' confuso da vedere: le carte
       nuove finiscono sotto quelle vecchie invece che sopra, ed e'
       innaturale. Meglio la regola di Burraco Pulito, uguale per me e
       per l'avversario: si cresce dall'alto verso il basso, sempre. */

    /* IL PADDING SOPRA LA MANO NON SI RIDUCEVA MAI, SU NESSUN TELEFONO.
       Il foglio di Burraco Pulito ha già la regola giusta — .hand-center-box
       passa da 20px/6px (da monitor) a 10px/2px (touch) — ma la scrive
       PRIMA della regola generale invece che dopo. A parità di
       specificità vince chi è scritto per ultimo nel foglio, quindi la
       versione "da monitor" (più bassa nel file) sovrascriveva sempre
       quella touch, schermo o non schermo: chi giocava da telefono si
       ritrovava comunque 20px di vuoto sopra la mano, un terzo
       dell'altezza della fascia sprecato. Qui la regola si riscrive DOPO
       tutto il resto — in Legends questo blocco è l'ultima parola —
       cosi' vince per davvero.

       LO STESSO IDENTICO BUG, PERO', COLPIVA ANCHE .card.selected.
       Il foglio base riduce ANCHE il sollevamento della carta selezionata
       da 16px (da monitor) a 9px (touch) — apposta perche' 10px di
       padding bastino a non tagliarla in cima — ma scrive pure quella
       regola PRIMA di quella generale, quindi perdeva allo stesso modo.
       Prima di questo fix la carta si sollevava comunque di 16px dentro
       un padding di 20px (appena 4px di margine, gia' risicato); dopo
       aver corretto SOLO il padding a 10px, il margine per una carta che
       si alzava ancora di 16px e' diventato negativo — la carta finiva
       tagliata in cima, un problema nuovo creato riparandone un altro.
       Va corretta la stessa identica cosa, nello stesso posto. */
    @media (hover: none), (pointer: coarse) {
      .hand-center-box { padding-top: 10px !important; padding-bottom: 2px !important; }
      .card.selected { transform: translateY(-9px) !important; }
    }

    /* IL DORSO DELLE CARTE, ILLUSTRATO INVECE DEL GRADIENTE ROSSO-ORO.
       --back-bg/--back-border/--rombo-dorso sono le tre variabili che
       Burraco Pulito usa ovunque si veda un dorso — mano dell'avversario,
       mazzo, pozzetti, carte in volo durante la distribuzione — proprio
       per poterle cambiare tutte insieme da un punto solo, senza toccare
       il resto. Il rombo al centro si spegne (--rombo-dorso: none) perché
       l'illustrazione ha già il suo motivo decorativo: il rombo sopra
       sarebbe un ornamento in più su un disegno che non ne ha bisogno. */
    :root {
      --back-bg: url('immagini/decorazioni/dorso-carta.webp') center / cover no-repeat;
      --back-border: #8a6a2a;
      --rombo-dorso: none;
    }

    /* PERSONAGGI E MAGIA DELL'AVVERSARIO PIÙ VICINI AL TASTO IMPOSTAZIONI.
       .top-shelf (Burraco Pulito) usa justify-content:space-between su
       SEI figli — tasto impostazioni, le sue carte Battle, la sua barra
       magia, il gruppo avatar/mano coperta, il tabellone dei due
       cronometri, il timer di partita — e distribuisce lo spazio vuoto
       fra tutti loro in parti uguali. Il vuoto fra "carte + magia" e
       "avatar/mano coperta" cresceva quanto quello fra qualunque altra
       coppia, anche se qui in mezzo non c'è niente da separare: sono
       tutte informazioni DELL'AVVERSARIO, hanno senso vicine. Il divario
       vero che serve — fra "cose dell'avversario" e "i due cronometri" —
       lo fa da solo il margin-left:auto sul tabellone: flex-start più
       quello sposta il vuoto tutto dove serve, non spalmato ovunque. */
    .top-shelf { justify-content: flex-start; gap: 8px; }
    .top-shelf .tabellone { margin-left: auto; }

    /* LE CARTE COPERTE DELL'AVVERSARIO, PIÙ GRANDI (+20%, richiesto).
       --opp-card-w/h su schermo touch partono da 19×27,7px: lo spazio
       liberato spostando tutto a sinistra qui sopra va proprio a loro,
       che restavano le più piccole della fascia pur essendo l'unica
       cosa lì che si guarda per capire quante carte ha in mano
       l'avversario. Cresce anche .top-shelf di conseguenza (la sua
       altezza minima è calc(--opp-card-h + 4px)): è il prezzo di carte
       più leggibili, non uno scatto accidentale. */
    @media (hover: none), (pointer: coarse) {
      :root { --opp-card-w: 22.8px; --opp-card-h: 33.24px; }
    }

    /* --- BARRA DEI PUNTI MAGIA ---
       Una sola riserva per giocatore, sotto le sue sette carte. Sale di 2
       a ogni proprio turno, si ferma a 15, e si svuota quando si gioca una
       Carta Magica o un'abilità speciale. Ha preso il posto delle vecchie
       barre azzurre che stavano su ogni singolo eroe.

       UNA SOLA COLONNA PIENA, non 15 tacche impilate. Le tacche singole
       erano leggibili ma avevano un difetto strutturale: 15 segmenti più
       etichetta più conteggio finivano sempre più alti delle carte
       Battle accanto — anche al minimo leggibile (2,5px a tacca) restava
       un'eccedenza di quasi 20px, l'unico pezzo della fascia che non si
       poteva più stringere con un numero. Qui l'altezza è `var(--battle-h)`,
       LA STESSA delle carte accanto: per costruzione non può mai superarle,
       a qualunque dimensione di schermo — non serve più nessuna soglia da
       aggiustare a mano. Il numero sta dentro la colonna stessa, non su
       una riga a parte: quel "a parte" era il resto dell'eccedenza. */
    .barra-magia { display: flex; flex-direction: column; align-items: center; flex: 0 0 auto; }
    .barra-magia .pila {
      position: relative; width: 20px; height: var(--battle-h); border-radius: 4px;
      background: rgba(0,0,0,0.55); border: 1px solid rgba(69,182,255,0.28);
      box-sizing: border-box; overflow: hidden; display: flex; align-items: flex-end;
    }
    .barra-magia .riempimento {
      width: 100%; background: linear-gradient(180deg, var(--charge), #9adcff);
      box-shadow: 0 0 6px rgba(69,182,255,0.7); transition: height 0.4s ease;
    }
    .barra-magia .conta {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 11px; font-weight: 800; color: #eaf6ff; font-variant-numeric: tabular-nums;
      text-shadow: 0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9);
    }
    .barra-magia.piena .conta { animation: caricaPiena 1.2s ease-in-out infinite; }

    /* Quella dell'avversario si guarda meno da vicino: basta un po' più
       stretta, non serve il numero preciso quanto la propria. */
    #magiaAvversario .pila { width: 15px; }
    #magiaAvversario .conta { font-size: 9px; }

    /* --- I due cronometri del minuto a turno --- */
    .turni-box { display: flex; flex-direction: column; gap: 3px; }
    .riga-turno {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 3px 9px; border-radius: 7px; min-width: 132px;
      background: rgba(0,0,0,0.32); border: 1px solid rgba(232,196,106,0.22);
      transition: border-color 0.2s, background 0.2s;
    }
    .riga-turno .chi { font-size: 10px; color: #d6c9a8; letter-spacing: 0.3px; white-space: nowrap; }
    .riga-turno .orologio { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; color: #f0e2c0; }
    /* riga di chi sta giocando: si accende */
    .riga-turno.attiva { background: rgba(232,196,106,0.16); border-color: var(--oro); }
    .riga-turno.attiva .chi { color: #fff3d4; }
    .riga-turno.attiva .orologio { color: var(--oro); }
    /* ultimi 15 secondi: rosso e pulsante */
    .riga-turno.agli-sgoccioli { border-color: #ff7b8e; background: rgba(255,123,142,0.18); }
    .riga-turno.agli-sgoccioli .orologio { color: #ff9db0; animation: battito 1s ease-in-out infinite; }
    @keyframes battito { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
    /* chi non è di turno ha il cronometro fermo e spento */
    .riga-turno:not(.attiva) .orologio { opacity: 0.45; }

    /* pozzetto ancora da prendere: presente ma spento. Preso: acceso.
       Due stati, uno sguardo. */
    .riga-turno .spia-pozzetto {
      font-size: 9px; font-weight: 800; letter-spacing: 0.4px;
      padding: 1px 5px; border-radius: 7px; white-space: nowrap;
      border: 1px solid rgba(232,196,106,0.28); color: #8d8268;
      background: rgba(0,0,0,0.22);
    }
    .riga-turno .spia-pozzetto.preso {
      border-color: var(--verde, #6ecb8b); color: #0f1a12;
      background: var(--verde, #6ecb8b);
    }

    /* IL CRONOMETRO STRABORDAVA DALLO SCHERMO SU TELEFONO IN ORIZZONTALE.
       .tabellone (il suo contenitore) sa restringersi — min-width:0,
       flex-shrink — ma .turni-box, dentro, non lo aveva mai imparato:
       min-width:132px per riga lo teneva rigido a 177px anche quando il
       contenitore intorno crollava a 55px. Su un monitor c'è sempre
       spazio a sufficienza e non si vedeva; qui quei 177px uscivano
       letteralmente fuori dal bordo destro dello schermo — la causa
       dello scorrimento orizzontale.
       QUESTA REGOLA VA SCRITTA QUI, DOPO quella sopra: a parità di
       specificità vince chi è scritto dopo nel foglio, e mettendola
       altrove (per esempio vicino a --battle-w) perdeva sempre. */
    @media (max-height: 480px), (hover: none) and (orientation: portrait) {
      .tabellone, .turni-box { min-width: 0; }
      .riga-turno {
        min-width: 0; padding: 2px 5px; gap: 4px; border-radius: 5px;
      }
      /* Un figlio flex ha di suo un min-width implicito pari alla
         larghezza del proprio contenuto — per un testo non va a capo,
         quindi coincide con l'intero testo disteso. Restringere il
         genitore non basta: senza azzerarlo qui, esplicitamente, sopra
         ognuno dei tre pezzi, uno di loro prima o poi torna a
         straboccare. È lo stesso identico difetto di `.turni-box`
         qui sopra, un piano più in profondità. */
      .riga-turno .chi { font-size: 8px; min-width: 0; }
      .riga-turno .orologio { font-size: 11px; min-width: 0; }
      .riga-turno .spia-pozzetto { font-size: 7px; padding: 0 3px; min-width: 0; }
    }

    /* contatore carte accanto alla mano */
    .conta-carte.mia { flex: 0 0 auto; margin-left: 8px; }

    /* --- LA MATTA NELLA COLONNA ---
       Prima veniva mostrata ruotata di 90°: stava storta, rubava spazio in
       verticale e non diceva niente di utile. Ora resta dritta e si
       riconosce dalla cornice dorata. */
    .card-column .e-matta { position: relative; }
    .card-column .e-matta .card {
      box-shadow: 0 0 0 2px var(--oro), 0 1px 4px rgba(0,0,0,0.5);
      border-color: var(--oro);
    }

    /* --- TARGHETTA DELLA POTENZA ---
       Sotto la colonna: dice di quanto quel gioco picchia più forte per la
       sua lunghezza (5 carte +10%, 6 +20%, 7+ +35%). */
    .targhetta-potenza {
      margin-top: 5px; align-self: center; white-space: nowrap;
      font-family: 'Segoe UI', system-ui, sans-serif; font-weight: 900;
      font-size: 10px; letter-spacing: 0.3px; line-height: 1;
      padding: 3px 7px; border-radius: 8px; color: #14100c;
      background: linear-gradient(180deg, #ffe9a8, var(--oro));
      box-shadow: 0 0 8px rgba(232,196,106,0.6), 0 1px 3px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.35);
    }
    /* più è alto il bonus, più la targhetta si fa notare */
    .targhetta-potenza.liv20 { background: linear-gradient(180deg, #ffd08a, #f0a63c); box-shadow: 0 0 10px rgba(240,166,60,0.7), 0 1px 3px rgba(0,0,0,0.5); }
    .targhetta-potenza.liv35 {
      background: linear-gradient(180deg, #ffb3c0, #ff5f78); color: #2a0810;
      box-shadow: 0 0 14px rgba(255,95,120,0.85), 0 1px 3px rgba(0,0,0,0.5);
      animation: targhettaForte 1.6s ease-in-out infinite;
    }
    @keyframes targhettaForte { 0%,100% { transform: scale(1); } 50% { transform: scale(1.09); } }

    /* Le mie colonne calate si possono allungare: quando ho delle carte
       selezionate si illuminano, per far capire che ci si può agganciare. */
    .meld-side.mine .card-column { cursor: pointer; border-radius: 6px; transition: box-shadow 0.15s, transform 0.15s; }
    body.ho-selezione .meld-side.mine .card-column {
      box-shadow: 0 0 0 2px rgba(126,255,204,0.55), 0 0 14px rgba(126,255,204,0.4);
    }
    body.ho-selezione .meld-side.mine .card-column:hover { transform: translateY(-3px); box-shadow: 0 0 0 2px #7effcc, 0 0 20px rgba(126,255,204,0.8); }

    /* --- Prima colonna riservata alle Carte Trappola --- */
    .slot-trappole {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      width: var(--card-w); flex: 0 0 auto; margin-right: 10px; align-self: flex-start;
    }
    .slot-trappole .etichetta {
      font-size: 7px; letter-spacing: 0.5px; color: rgba(255,255,255,0.55);
      text-transform: uppercase; text-align: center;
    }
    .slot-trappole .posto {
      width: var(--card-w); height: var(--card-h); border-radius: var(--card-radius);
      box-sizing: border-box;
      display: flex; align-items: center; justify-content: center;
      /* la cornice ornamentale sostituisce il bordo tratteggiato: stesso
         "qui potrebbe scattare una trappola", ma disegnata invece che
         un rettangolo di puntini */
      background: url('immagini/decorazioni/cornice-trappole.webp') center / contain no-repeat;
    }
    .trappola-posata {
      width: var(--card-w); height: var(--card-h); border-radius: var(--card-radius);
      box-sizing: border-box; border: 2px solid var(--blu); position: relative;
      background: repeating-linear-gradient(45deg, #1e3348 0 4px, #131f2e 4px 8px);
      display: flex; align-items: center; justify-content: center;
      color: var(--blu); font-size: calc(var(--card-w) * 0.5); font-weight: 900;
      animation: pulsaTrappola 1.8s ease-in-out infinite;
      cursor: default;
    }

    /* Scossone della carta colpita: più ampio e più lungo di prima, era
       troppo veloce per accorgersene. */
    @keyframes colpita {
      0%   { transform: none; }
      10%  { transform: translateX(-9px) rotate(-5deg) scale(1.1); }
      25%  { transform: translateX(8px)  rotate(4deg)  scale(1.08); }
      40%  { transform: translateX(-6px) rotate(-3deg) scale(1.05); }
      55%  { transform: translateX(5px)  rotate(2deg); }
      70%  { transform: translateX(-3px); }
      85%  { transform: translateX(2px); }
      100% { transform: none; }
    }
    /* eroe che ha gia' colpito in questo turno: c'e', ma e' scarico */
    .bcard.esausta { filter: saturate(0.45) brightness(0.72); }
    .bcard.esausta::after {
      content: 'FATTO'; position: absolute; bottom: 2px; left: 0; right: 0;
      font-size: 7px; font-weight: 900; letter-spacing: 1px; text-align: center;
      color: #cbbf9f; text-shadow: 0 1px 2px #000;
    }

    .bcard.colpita {
      animation: colpita 1.1s ease-out;
      border-color: var(--hp) !important;
      box-shadow: 0 0 22px var(--hp), inset 0 0 14px rgba(255,80,100,0.6) !important;
      z-index: 300;
    }
    /* velo rosso che passa sulla carta nel momento del colpo */
    .bcard.colpita::before { background: rgba(255,80,100,0.42); border-color: rgba(255,140,160,0.9); }

    /* LAMPO ROSSO SU TUTTO LO SCHERMO quando incasso io */
    .lampo-danno {
      position: fixed; inset: 0; pointer-events: none; z-index: 860;
      box-shadow: inset 0 0 22vh rgba(255,60,90,0.55);
      animation: lampoVia 0.7s ease-out forwards;
    }
    @keyframes lampoVia {
      0%   { opacity: 0; }
      12%  { opacity: 1; }
      100% { opacity: 0; }
    }

    /* ============================================================
       IL JOLLY
       Si riconosce da lontano senza dover leggere niente: fondo bianco
       come una carta vera, bordo e stella d'oro, e la parola JOLLY di
       taglio sul fianco — che resta visibile anche quando la carta e'
       quasi tutta coperta dalla successiva nel ventaglio.
       Un tentativo con un'illustrazione vera (la maschera del burlante
       fra i rovi) e' stato tolto: il genere "carta normale" si legge
       meglio in mezzo alle altre, dove tutto il resto e' testo e numeri
       su fondo chiaro. La carta bianca resta un'eccezione voluta anche
       oggi — le altre carte del mazzo restano scure — ma "eccezione
       bianca su un mazzo scuro" e' proprio il modo in cui si riconosce
       da lontano, non una stonatura. */
    .card.jolly {
      background: #ffffff !important;
      border-color: var(--oro, #e8c46a) !important;
      box-shadow: inset 0 0 0 1px rgba(232,196,106,0.55), 0 0 10px rgba(232,196,106,0.35);
    }

    /* --- NUMERO DEL DANNO CHE SALE DALLA CARTA ---
       Va in un elemento a parte agganciato alla pagina, non dentro la
       carta: la carta ha overflow nascosto e il numero verrebbe tagliato. */
    .dmg-float {
      position: fixed; z-index: 880; pointer-events: none;
      font-family: 'Segoe UI', system-ui, sans-serif; font-weight: 900;
      font-size: 34px; line-height: 1; white-space: nowrap;
      -webkit-text-stroke: 1px rgba(0,0,0,0.55);
      text-shadow: 0 3px 6px #000, 0 0 20px currentColor;
      animation: dmgSale 1.9s cubic-bezier(.16,.84,.44,1) forwards;
    }
    .dmg-float.danno { color: #ff5f78; }
    .dmg-float.cura  { color: #6bf0a5; }
    .dmg-float.grosso { font-size: 48px; }
    /* più lento e con una sosta a mezz'aria: prima saliva e spariva in un
       attimo, non si faceva in tempo a leggerlo */
    @keyframes dmgSale {
      0%   { opacity: 0; transform: translate(-50%, 6px) scale(0.4); }
      12%  { opacity: 1; transform: translate(-50%, -14px) scale(1.5); }
      22%  { transform: translate(-50%, -20px) scale(1.05); }
      30%  { transform: translate(-50%, -22px) scale(1.15); }
      40%  { transform: translate(-50%, -24px) scale(1); }
      72%  { opacity: 1; transform: translate(-50%, -34px) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -78px) scale(0.9); }
    }
    /* LO STESSO NUMERO, MA VERSO IL BASSO.
       Le carte dell'avversario stanno in cima allo schermo: un numero che
       sale da li' esce dalla finestra e viene tagliato a meta'. Quando il
       colpo e' in alto, il numero scende verso il centro del tavolo —
       dove c'e' spazio e dove uno sta gia' guardando. */
    .dmg-float.verso-giu { animation-name: dmgScende; }
    @keyframes dmgScende {
      0%   { opacity: 0; transform: translate(-50%, -6px) scale(0.4); }
      12%  { opacity: 1; transform: translate(-50%, 14px) scale(1.5); }
      22%  { transform: translate(-50%, 20px) scale(1.05); }
      30%  { transform: translate(-50%, 22px) scale(1.15); }
      40%  { transform: translate(-50%, 24px) scale(1); }
      72%  { opacity: 1; transform: translate(-50%, 34px) scale(1); }
      100% { opacity: 0; transform: translate(-50%, 78px) scale(0.9); }
    }

    /* ============================================================
       LA CARTA INGRANDITA
       Al tavolo le carte sono minuscole per forza: ci sono quattordici
       carte, due mani e il tavolo da burraco nello stesso schermo. Ma
       prima di usare una carta uno vuole GUARDARLA — leggere cosa fa,
       vedere l'illustrazione. Qui la carta si apre grande, con la sua
       cornice (che a questa misura finalmente si vede), e sotto il
       bottone per usarla.
       PER LE CARTE MAGICHE E' ANCHE UNA PROTEZIONE: prima bastava un
       tocco per giocarne una, e una Carta Magica giocata e' spesa per
       sempre — un dito storto costava una carta. Adesso il tocco apre
       e basta; per usarla si preme USA, che e' una decisione separata.
       ============================================================ */
    #veloCarta {
      position: fixed; inset: 0; z-index: 895; display: none;
      align-items: center; justify-content: center; padding: 3vh 4vw;
      background: rgba(6,4,10,0.82); backdrop-filter: blur(4px);
    }
    #veloCarta.mostra { display: flex; animation: veloCartaIn 0.18s ease-out; }
    @keyframes veloCartaIn { from { opacity: 0; } to { opacity: 1; } }
    #veloCarta .colonna {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      max-height: 100%;
    }
    /* La carta e' alta quanto lo consente lo schermo, non larga quanto
       lo consente: in orizzontale su un telefono e' l'altezza a mancare,
       e una carta che esce sopra e sotto non si legge comunque. */
    #veloCarta .carta-illustrata {
      height: min(74vh, 420px); width: auto; aspect-ratio: 0.71;
      border-radius: 12px;
      box-shadow: 0 18px 50px rgba(0,0,0,0.85), 0 0 44px rgba(232,196,106,0.28);
      animation: cartaGrandeIn 0.28s cubic-bezier(.2,1.25,.4,1) both;
    }
    @keyframes cartaGrandeIn {
      from { opacity: 0; transform: scale(0.78) translateY(14px); }
      to   { opacity: 1; transform: none; }
    }
    #veloCarta .bottoni { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center; }
    #veloCarta button {
      font-family: inherit; font-size: 0.9rem; font-weight: 800; letter-spacing: 0.6px;
      padding: 9px 24px; border-radius: 10px; cursor: pointer;
      border: 1px solid var(--oro, #e8c46a); color: #f0e2c0;
      background: linear-gradient(180deg, rgba(74,53,32,0.95), rgba(32,22,13,0.95));
    }
    #veloCarta button.usa {
      background: linear-gradient(180deg, #ffe9ae, var(--oro, #e8c46a)); color: #2a1c08;
      box-shadow: 0 4px 16px rgba(0,0,0,0.6), 0 0 22px rgba(232,196,106,0.45);
    }
    #veloCarta button:active { transform: translateY(1px); }
    #veloCarta .nota-carta { font-size: 0.75rem; color: #b7a686; text-align: center; max-width: 300px; }

    /* ------------------------------------------------------------
       IL LAMPO DELLA CARTA MAGICA
       Una Carta Magica finora si vedeva solo come una carta grande al
       centro dello schermo: poi spariva e i punti vita cambiavano da
       soli, senza che niente collegasse le due cose. Il lampo e' quel
       collegamento — parte da dove stava la carta e arriva sul
       bersaglio, cosi' si vede CHI ha colpito CHI.
       Disegnato in SVG e non in CSS perche' un fulmine e' una linea
       spezzata: con dei rettangoli non si fa.
       ------------------------------------------------------------ */
    .lampo-magico {
      position: fixed; inset: 0; z-index: 878; pointer-events: none;
      overflow: visible;
    }
    .lampo-magico path {
      fill: none; stroke-linecap: round; stroke-linejoin: round;
      /* si "disegna" da sola: la linea tratteggiata lunga quanto tutto
         il percorso, e lo scostamento che va a zero */
      stroke-dasharray: var(--lung); stroke-dashoffset: var(--lung);
      animation: lampoCorre 0.5s cubic-bezier(.2,.7,.3,1) forwards;
    }
    /* il tratto largo e sfocato sotto: e' il bagliore */
    .lampo-magico path.alone {
      stroke: rgba(255,214,120,0.55); stroke-width: 9;
      filter: blur(4px);
    }
    .lampo-magico path.nucleo { stroke: #fff6d8; stroke-width: 2.4; }
    .lampo-magico path.oro    { stroke: #ffd36b; stroke-width: 4.4; opacity: 0.95; }
    @keyframes lampoCorre {
      0%   { stroke-dashoffset: var(--lung); opacity: 1; }
      42%  { stroke-dashoffset: 0; opacity: 1; }
      66%  { opacity: 0.85; }
      100% { stroke-dashoffset: 0; opacity: 0; }
    }
    /* lo schiocco sul bersaglio, quando il lampo arriva */
    .lampo-botto {
      position: fixed; z-index: 879; pointer-events: none;
      width: 12px; height: 12px; border-radius: 50%;
      border: 2.5px solid rgba(255,214,120,0.95);
      box-shadow: 0 0 18px 4px rgba(255,196,80,0.75);
      animation: lampoBotto 0.5s ease-out 0.34s forwards; opacity: 0;
    }
    @keyframes lampoBotto {
      0%   { opacity: 1; transform: translate(-50%,-50%) scale(0.3); }
      100% { opacity: 0; transform: translate(-50%,-50%) scale(7); }
    }

    /* alone che si espande dal punto colpito */
    .dmg-onda {
      position: fixed; z-index: 870; pointer-events: none;
      width: 10px; height: 10px; border-radius: 50%;
      border: 2px solid rgba(255,95,120,0.9);
      animation: dmgOnda 0.75s ease-out forwards;
    }
    @keyframes dmgOnda {
      0%   { opacity: 0.9; transform: translate(-50%,-50%) scale(0.6); }
      100% { opacity: 0; transform: translate(-50%,-50%) scale(11); }
    }

    /* --- I SEGNI DI QUELLO CHE CAMBIA ---
       Il danno aveva il suo numero rosso; tutto il RESTO non si vedeva
       affatto. Una cura, uno scudo alzato, i punti magia rubati, la
       difesa sfondata: la carta cambiava di nascosto e al giocatore
       toccava fidarsi — o peggio, accorgersene tre turni dopo quando il
       colpo arrivava piu' forte senza un motivo visibile.
       Questi sono i segni di quelle cose. Hanno la forma di una
       pastiglia, non di un numero nudo, e la differenza e' voluta: il
       numero nudo vuol dire sempre e solo vita che se ne va, la
       pastiglia vuol dire "e' cambiato qualcos'altro". Si distinguono
       con la coda dell'occhio, senza doverli leggere. */
    .segno-eff {
      position: fixed; z-index: 885; pointer-events: none;
      display: flex; align-items: center; gap: 6px;
      padding: 5px 12px 5px 9px; border-radius: 999px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-weight: 800; font-size: 17px; line-height: 1; white-space: nowrap;
      background: linear-gradient(180deg, rgba(22,17,30,0.97), rgba(9,7,14,0.97));
      border: 1.5px solid currentColor;
      box-shadow: 0 4px 16px rgba(0,0,0,0.7), 0 0 20px -3px currentColor;
      animation: segnoSale 2.3s cubic-bezier(.16,.84,.44,1) forwards;
    }
    .segno-eff .glifo { font-size: 18px; line-height: 1; filter: drop-shadow(0 0 7px currentColor); }
    .segno-eff .val   { color: #fff; text-shadow: 0 0 9px currentColor, 0 1px 2px #000; }
    /* sosta a mezz'aria come il numero del danno: sale, si ferma il
       tempo di essere letto, poi svanisce */
    @keyframes segnoSale {
      0%   { opacity: 0; transform: translate(-50%, 12px) scale(0.5); }
      14%  { opacity: 1; transform: translate(-50%, -8px)  scale(1.2); }
      26%  { transform: translate(-50%, -15px) scale(0.97); }
      36%  { transform: translate(-50%, -18px) scale(1.05); }
      76%  { opacity: 1; transform: translate(-50%, -30px) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -70px) scale(0.93); }
    }
    /* verso il basso quando la carta sta in cima allo schermo, per lo
       stesso motivo del numero del danno: altrimenti esce dalla finestra */
    .segno-eff.verso-giu { animation-name: segnoScende; }
    @keyframes segnoScende {
      0%   { opacity: 0; transform: translate(-50%, -12px) scale(0.5); }
      14%  { opacity: 1; transform: translate(-50%, 8px)  scale(1.2); }
      26%  { transform: translate(-50%, 15px) scale(0.97); }
      36%  { transform: translate(-50%, 18px) scale(1.05); }
      76%  { opacity: 1; transform: translate(-50%, 30px) scale(1); }
      100% { opacity: 0; transform: translate(-50%, 70px) scale(0.93); }
    }

    /* L'ALONE SULLA CARTA TOCCATA.
       Il segno che vola dice COSA e' successo; questo dice A CHI. Il
       colore lo passa lo script, cosi' la stessa regola vale per tutte
       le famiglie di effetto invece di sei regole quasi uguali. */
    .bcard.aura-eff { animation: auraEff 1.1s ease-out; }
    @keyframes auraEff {
      0%   { box-shadow: 0 0 0 0 transparent; }
      30%  { box-shadow: 0 0 24px 6px var(--c-eff, #fff), inset 0 0 28px -6px var(--c-eff, #fff); }
      100% { box-shadow: 0 0 0 0 transparent; }
    }

    /* la barra dei punti magia che si accende quando qualcuno la tocca */
    .barra-magia.tocca-magia { animation: magiaTocca 1.1s ease-out; }
    @keyframes magiaTocca {
      0%   { box-shadow: 0 0 0 0 transparent; }
      30%  { box-shadow: 0 0 20px 4px var(--c-eff, #b98cff); }
      100% { box-shadow: 0 0 0 0 transparent; }
    }

    /* Fine partita */

    /* ============================================================
       IL COLPO CHE ARRIVA
       Prima il danno si vedeva solo dopo: la carta tremava e compariva
       un numero. Non si capiva CHE COSA fosse successo, e sulla mossa
       che chiudeva la partita si passava dal nulla a "hai perso".
       Qui il colpo si vede partire, attraversare il tavolo e schiantarsi
       sulla carta: e' la stessa informazione, ma raccontata.
       ============================================================ */
    .proiettile {
      position: fixed; z-index: 880; pointer-events: none;
      width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #fff, var(--oro) 45%, rgba(255,120,60,0.9) 70%, rgba(255,60,60,0) 72%);
      box-shadow: 0 0 18px var(--oro), 0 0 34px rgba(255,120,60,0.8);
    }
    .proiettile.magico {
      background: radial-gradient(circle at 35% 35%, #fff, var(--blu) 45%, rgba(90,160,255,0.9) 70%, rgba(90,160,255,0) 72%);
      box-shadow: 0 0 18px var(--blu), 0 0 34px rgba(90,160,255,0.8);
    }
    .proiettile .scia {
      position: absolute; inset: -6px; border-radius: 50%;
      background: radial-gradient(circle, rgba(255,220,150,0.5), transparent 65%);
      animation: sciaPulsa 0.25s ease-in-out infinite alternate;
    }
    @keyframes sciaPulsa { to { transform: scale(1.45); opacity: 0.45; } }

    /* lo schianto: un anello che si allarga e un lampo bianco */
    .impatto {
      position: fixed; z-index: 885; pointer-events: none;
      width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%;
      border: 3px solid rgba(255,235,190,0.95);
      animation: impattoVia 0.7s cubic-bezier(0.15, 0.7, 0.3, 1) forwards;
    }
    @keyframes impattoVia {
      0%   { transform: scale(0.4); opacity: 1; border-width: 5px; }
      100% { transform: scale(9);   opacity: 0; border-width: 1px; }
    }
    .squarcio {
      position: fixed; z-index: 886; pointer-events: none;
      width: 74px; height: 5px; margin: -2px 0 0 -37px; border-radius: 3px;
      background: linear-gradient(90deg, transparent, #fff, transparent);
      animation: squarcioVia 0.45s ease-out forwards;
    }
    @keyframes squarcioVia {
      0%   { transform: rotate(-28deg) scaleX(0.2); opacity: 0; }
      35%  { opacity: 1; }
      100% { transform: rotate(-28deg) scaleX(1.5); opacity: 0; }
    }

    /* ============================================================
       I TRENTA SECONDI IN CUI SI GUARDA IL TAVOLO
       Non copre niente: sta in alto, grande, e lascia vedere le carte
       — sono proprio quelle che si deve avere il tempo di guardare.
       ============================================================ */
    #studio {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 900; display: none; pointer-events: none; text-align: center;
    }
    #studio.mostra { display: block; animation: studioEntra 0.5s ease-out; }
    @keyframes studioEntra { from { opacity: 0; transform: translate(-50%,-50%) scale(0.8); } }
    #studio .numero {
      font-size: 108px; font-weight: 900; line-height: 1;
      color: var(--oro); font-variant-numeric: tabular-nums;
      text-shadow: 0 0 30px rgba(232,196,106,0.75), 0 6px 22px rgba(0,0,0,0.9);
    }
    #studio .numero.poco { color: #ff9db0; text-shadow: 0 0 30px rgba(255,120,150,0.8), 0 6px 22px rgba(0,0,0,0.9); animation: battito 1s ease-in-out infinite; }
    /* Il testo "Guarda il tavolo" e la spiegazione sotto sono spariti:
       il riquadro sta al centro dello schermo, proprio sopra le carte
       che dovrebbe far guardare — coprivano quello che c'era da vedere.
       Resta solo il numero, che basta a dire "hai ancora questo tempo". */
    /* mentre si guarda, le carte dei personaggi si fanno notare */
    body.in-studio .bcard[data-seme] {
      animation: respiroStudio 2.2s ease-in-out infinite;
      box-shadow: inset 0 0 0 1px rgba(232,196,106,0.55), 0 0 18px rgba(232,196,106,0.35);
    }
    @keyframes respiroStudio { 50% { transform: translateY(-4px); } }

    #finePartita { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.75); z-index: 950; }
    #finePartita.mostra { display: flex; }
    #finePartita .box { text-align: center; padding: 30px 40px; background: #1b1430; border: 3px solid var(--oro); border-radius: 16px; }
    #finePartita .box h2 { margin: 0 0 8px; color: var(--oro); }
    #finePartita .box p { margin: 0; color: #c9bce6; }
    #finePartita .box .conto { margin-top: 18px; font-size: 0.82rem; color: #8d81a8; }
    #finePartita .box .conto b { color: var(--oro); font-variant-numeric: tabular-nums; }
    #finePartita .box .subito {
      display: inline-block; margin-top: 12px; padding: 8px 18px; border-radius: 9px;
      background: var(--oro); color: #1b1220; font-weight: 800; text-decoration: none; font-size: 0.88rem;
    }
'''

BODY = r'''
<div class="lucciole" id="lucciole"></div>
<div class="toast" id="toast"></div>
<div id="resoconto"></div>

<!-- ============ FASCIA SUPERIORE: AVVERSARIO ============
     Struttura identica al tavolo originale. L'unica aggiunta sono le 7 carte
     Battle dell'avversario, messe fra il tasto impostazioni e la sua mano,
     come richiesto. -->
<div class="top-shelf">
    <button class="btn-fullscreen-top" onclick="ui.impostazioni()" title="Impostazioni" aria-label="Impostazioni">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="7"  x2="14" y2="7"/>  <circle cx="17.5" cy="7"  r="2.5" fill="currentColor" stroke="none"/>
            <line x1="3" y1="12" x2="8"  y2="12"/> <circle cx="11.5" cy="12" r="2.5" fill="currentColor" stroke="none"/>
            <line x1="3" y1="17" x2="16" y2="17"/> <circle cx="19.5" cy="17" r="2.5" fill="currentColor" stroke="none"/>
        </svg>
    </button>

    <div class="battle-strip in-alto" id="battleAvversario"></div>
    <div class="barra-magia" id="magiaAvversario"></div>

    <div class="opp-groups-stack">
        <div class="opp-center-group" id="oppSeatGroup1">
            <div class="opp-profile">
                <div class="avatar-ring" id="oppAvatarRing"><div class="opp-avatar">👤</div></div>
                <div class="opp-text-col">
                    <span class="opp-name" id="oppName">Avversario</span>
                    <span class="opp-live-score" id="oppLiveScore">0 pt</span>
                </div>
            </div>
            <div class="opp-hand-box" id="oppHandBox"></div>
            <div class="conta-carte" id="oppConta">11 carte</div>
        </div>
    </div>

    <!-- I DUE TIMER DEL TURNO
         "Smazzata unica" è stato tolto: la smazzata è sempre una sola, era
         un'informazione inutile. Al suo posto i due cronometri del minuto a
         turno, uno per giocatore, così si vede sempre a chi sta scorrendo
         il tempo e quanto ne resta. -->
    <div class="tabellone">
        <div class="turni-box">
            <!-- La spia del pozzetto sta qui, accanto all'orologio, perché
                 è la stessa domanda: a che punto è l'altro. Il mazzetto
                 disegnato in tavola cambia aspetto quando viene preso, ma
                 è piccolo e in un angolo: durante la partita non lo si
                 guarda. Sapere se il pozzetto è già stato preso, e da chi,
                 cambia come si gioca. -->
            <div class="riga-turno" id="rigaTurnoAvv">
                <span class="chi">Avversario</span>
                <span class="spia-pozzetto" id="pozzettoAvv">poz</span>
                <span class="orologio" id="turnoAvv">1:00</span>
            </div>
            <div class="riga-turno" id="rigaTurnoMio">
                <span class="chi">Tu</span>
                <span class="spia-pozzetto" id="pozzettoMio">poz</span>
                <span class="orologio" id="turnoMio">1:00</span>
            </div>
        </div>
    </div>

    <div class="corner-stack">
        <div class="match-timer" id="oppMatchTimer">6:00</div>
        <div class="turn-indicator" id="turnIndicator">—</div>
    </div>
</div>

<!-- ============ TAVOLO CENTRALE: le due colonne dei giochi calati ============ -->
<div class="table-battlefield">
    <div class="lato-giocatore" id="latoSinistro"></div>
    <div class="meld-side left mine" id="myMelds"></div>
    <div class="meld-side right" id="oppMelds"></div>
    <div class="lato-giocatore" id="latoDestro"></div>
</div>

<div class="selection-hint" id="selectionHint"></div>

<!-- ============ RIGA RISORSE: pozzetti, mazzo, scarti, + le MIE 7 carte ============
     Il monte scarti ha flex:1 1 auto: cresce e si restringe da solo nello spazio
     che avanza, quindi non arriva mai a invadere le 7 carte a destra. -->
<div class="table-resources-row">
    <div class="pozzetti-cross" id="pozzettiCross"></div>
    <div class="pile mazzo-tallone" id="palTallone" onclick="ui.pesca()">MAZZO<div class="pile-count" id="talloneCount">0</div></div>
    <div class="discard-pile" id="palScarti" onclick="ui.clicScarti()"></div>
    <div class="battle-strip" id="battleGiocatore"></div>
    <div class="barra-magia" id="magiaGiocatore"></div>
</div>

<!-- ============ FASCIA INFERIORE: la mia mano ============ -->
<div class="bottom-shelf">
    <div class="hand-center-box" id="handBox"></div>
    <!-- C'ERA UNA SCRITTA "11 carte" QUI, DOPPIA CON QUELLA DENTRO
         .hud-controls due passi più in là (stesso numero, stesso testo,
         calcolato dalla stessa riga di script): due volte la stessa
         informazione e zero motivo per i pulsanti di riordino, che
         restavano relegati nella fascia in alto affollata di tutto il
         resto. Il conteggio unico resta nel hud-controls; questo posto
         lo prendono i pulsanti — su cellulare è lo spazio naturale,
         proprio accanto alla mano che riordinano. -->
    <div class="sort-controls-mobile">
        <button class="btn-sort-premium" title="Ordina per Seme" onclick="ui.ordina('suit')">
            <div class="suit-grid"><span class="red">♥</span><span class="red">♦</span><span class="black">♣</span><span class="black">♠</span></div>
        </button>
        <button class="btn-sort-premium" title="Ordina per Valore" onclick="ui.ordina('value')">
            <div class="value-flow">3→A</div>
        </button>
    </div>

    <div class="sort-controls-desktop">
        <div class="sort-buttons-row">
            <button class="btn-sort-premium" title="Ordina per Seme" onclick="ui.ordina('suit')">
                <div class="suit-grid"><span class="red">♥</span><span class="red">♦</span><span class="black">♣</span><span class="black">♠</span></div>
            </button>
            <button class="btn-sort-premium" title="Ordina per Valore" onclick="ui.ordina('value')">
                <div class="value-flow">3→A</div>
            </button>
        </div>
        <div class="avatar-ring my-avatar-ring"><div class="my-avatar">🙂</div></div>
    </div>

    <div class="hud-controls">
        <div class="avatar-ring my-avatar-ring" id="myAvatarBasso"><div class="my-avatar">🙂</div></div>
        <div class="conta-carte" id="mieCarte">11 carte</div>
        <div class="match-timer" id="myMatchTimer">6:00</div>
    </div>
</div>

<div id="bcardPop"></div>
<div id="veloCarta">
  <div class="colonna">
    <div id="cartaGrandeDentro"></div>
    <div class="nota-carta" id="notaCarta"></div>
    <div class="bottoni" id="bottoniCarta"></div>
  </div>
</div>
<div id="istruzioneBersaglio"></div>
<div id="sorpresaOverlay">
  <div class="raggi"></div>
  <div class="botto"></div>
  <div class="sorpresa-grande" id="sorpresaCarta" data-simbolo="✦">
    <div class="costo-grande" id="sorpresaCosto">4</div>
    <div class="chi" id="sorpresaChi"></div>
    <div class="sigillone" id="sorpresaSigillo">✦</div>
    <div class="tit" id="sorpresaTit"></div>
    <div class="txt" id="sorpresaTxt"></div>
    <div class="esito" id="sorpresaEsito"></div>
  </div>
</div>
<!-- Il tavolo è pensato in orizzontale: in verticale la mano non ci sta
     e il gioco diventa impraticabile. La regola CSS che accende questo
     riquadro (#ruotaAvviso, in @media hover:none + orientation:portrait)
     viene da Burraco Pulito ed era già corretta — mancava solo questo
     elemento da mostrare: senza, la regola non aveva niente da accendere
     e non succedeva mai nulla, su nessun telefono. -->
<div id="ruotaAvviso">
  <div class="icona">📱</div>
  <div class="titolo">Gira il telefono</div>
  <div class="sotto">Il tavolo si gioca in orizzontale: ruota lo schermo per continuare a vedere la partita.</div>
</div>
<div id="sorteggio">
  <div class="titolo">Chi comincia?</div>
  <div class="ripescate" id="sorteggioPari"></div>
  <div class="coppia" id="sorteggioCarte"></div>
  <div class="esito" id="sorteggioEsito"></div>
  <div class="nota">Le carte tornano nel mazzo · tocca per saltare</div>
</div>

<div id="studio">
  <div class="numero" id="studioNumero">30</div>
</div>

<div id="finePartita"><div class="box">
  <h2 id="fineTit"></h2>
  <p id="fineTxt"></p>
  <a class="subito" href="home.html">Torna alla home</a>
  <div class="conto">Il tavolo si chiude fra <b id="fineConto">10</b> secondi</div>
</div></div>

<!-- RETE DI SICUREZZA
     La pagina è autosufficiente e non carica nulla dall'esterno, quindi
     col doppio clic funziona. Se però per un qualunque motivo il tavolo
     restasse vuoto, meglio dirlo che lasciare uno schermo muto. -->
<div id="avvisoServer"></div>
<script>
(function(){
  setTimeout(function(){
    var box = document.getElementById('handBox');
    if(box && box.children.length > 0) return;   // tutto a posto
    document.getElementById('avvisoServer').innerHTML =
      '<div id="avvisoServerBox" style="position:fixed;inset:0;z-index:1000;background:#14100c;color:#f2ead9;'+
      'display:flex;align-items:center;justify-content:center;text-align:center;padding:30px;'+
      'font-family:system-ui,Segoe UI,sans-serif;line-height:1.6">'+
      '<div style="max-width:520px">'+
      '<div style="font-size:2.4rem;margin-bottom:6px">🃏</div>'+
      '<h2 style="color:#d9ad4f;margin:0 0 12px">Il tavolo non è partito</h2>'+
      '<p>Le carte non sono state distribuite. Prova a ricaricare la pagina '+
      '(Ctrl+Shift+R); se non basta, apri la Console del browser con F12 e riferisci '+
      'l\'errore che compare in rosso.</p>'+
      '</div></div>';
  }, 3000);
})();
</script>
'''

SCRIPT = r'''
// ============================================================
// BURRACO LEGENDS — tavolo di gioco.
//
// L'IMPAGINAZIONE E IL CSS SONO QUELLI DI BURRACO PULITO (game.html),
// copiati senza modifiche: feltro, mano a ventaglio, colonne dei giochi,
// mazzo e scarti restano identici. Le uniche due aggiunte sono le due
// strisce di 7 carte Battle (4 personaggi + 3 magiche):
//   - le MIE nella riga di mazzo/scarti, a destra;
//   - quelle dell'AVVERSARIO in alto, fra il tasto impostazioni e la sua mano.
//
// ATTENZIONE: QUESTO FILE È GENERATO da strumenti/genera-tavolo.py.
// Non modificarlo a mano: le modifiche andrebbero perse alla prossima
// generazione. Il motore (engine/*.js) e i dati carta (cards/*) vengono
// INCORPORATI qui dentro al momento della generazione, così la pagina si
// apre col doppio clic senza bisogno di alcun server.
// Se cambi il motore o le carte, rigenera:  python strumenti/genera-tavolo.py
//
// Il motore è quello vero del progetto, non un mockup: è lo stesso codice
// coperto dai test automatici in engine/*.test.js.
//
// Modalità "hotseat": si gioca a turni alternati sullo stesso schermo.
// Non c'è ancora rete né IA per l'avversario.
// ============================================================
const SEMI = ['♥', '♦', '♣', '♠'];
const SUIT_CLASS = { '♥': 'cuori', '♦': 'quadri', '♣': 'fiori', '♠': 'picche' };
const IDS_PERSONAGGI = {
  io:  ['personaggio_001', 'personaggio_003', 'personaggio_005', 'personaggio_007'],
  avv: ['personaggio_002', 'personaggio_004', 'personaggio_006', 'personaggio_008']
};
const IDS_MAGICHE = {
  io:  ['sorpresa_001', 'trappola_001', 'trappola_002'],
  avv: ['sorpresa_002', 'trappola_001', 'trappola_002']
};

// ------------------------------------------------------------
// IL MAZZO SCELTO DAL GIOCATORE
//
// La pagina "Il tuo mazzo" mette da parte quattro eroi (uno per seme) e
// tre Carte Magiche. Qui si rileggono, ma NON si prendono per buone:
// quel testo sta nel browser, chiunque puo' riscriverlo, e soprattutto
// puo' essere rimasto li' da una versione in cui certe carte esistevano
// e adesso non piu'. Si controlla tutto contro le carte vere; al primo
// dubbio si torna alla squadra predefinita, e lo si dice.
//
// (Nota per dopo: la pagina del mazzo ha un suo elenco di carte scritto
// a mano, copia di cards/data. Due elenchi della stessa cosa prima o poi
// divergono. Andrebbe generata come le altre pagine — e' il motivo per
// cui questo controllo qui non e' un lusso.)
// ------------------------------------------------------------
function mazzoScelto() {
  let salvato = null;
  try { salvato = JSON.parse(localStorage.getItem('bb_mazzo') || 'null'); } catch (e) { return null; }
  if (!salvato || typeof salvato !== 'object') return null;

  const perche = (motivo) => {
    setTimeout(() => avviso('Mazzo salvato non valido (' + motivo + '): gioco con la squadra predefinita.'), 500);
    return null;
  };

  const scelti = salvato.personaggi;
  if (!scelti || typeof scelti !== 'object') return perche('mancano i personaggi');
  const personaggi = [];
  for (const seme of SEMI) {
    const id = scelti[seme];
    if (typeof id !== 'string' || !dati.personaggi[id]) return perche('manca o non esiste l\'eroe di ' + seme);
    if (dati.personaggi[id].seme !== seme) return perche('un eroe e\' finito sul seme sbagliato');
    personaggi.push(id);
  }

  // Le Carte Magiche sono facoltative: da zero a tre, bastano gli eroi.
  const magicheScelte = salvato.carteMagiche;
  if (!Array.isArray(magicheScelte) || magicheScelte.length > 3) return perche('massimo 3 Carte Magiche');
  for (const id of magicheScelte) {
    if (typeof id !== 'string' || !dati.magiche[id]) return perche('una Carta Magica non esiste piu\'');
  }
  if (new Set(magicheScelte).size !== magicheScelte.length) return perche('la stessa Carta Magica e\' ripetuta');

  return { personaggi, carteMagiche: magicheScelte };
}

let S = null;              // stato di partita (motore)
let magie = null;          // [magicState giocatore 0, magicState giocatore 1]
let dati = null;           // { i18n, personaggi, magiche }
const selezione = new Set();
let ordinamento = 'suit';
// seme dell'eroe che sta per usare l'abilità speciale, mentre si sceglie
// il bersaglio; null quando non si sta scegliendo nulla
let bersaglioAttivo = null;

const $ = (id) => document.getElementById(id);
const testo = (id) => (dati.i18n[id] || { nome: id, descrizione: '' });

// ============================================================
// GLI OVERLAY "A COORDINATE" SOTTO L'ORIZZONTALE FORZATO
//
// Popup, numeri di danno, pastiglie degli effetti, il colpo che vola da
// una carta all'altra: tutti calcolano un punto con getBoundingClientRect
// (che resta sempre giusto, in coordinate del vero schermo) e poi lo
// scrivono in style.left/top su un elemento "position:fixed".
//
// Il guaio nasce quando <html> è ruotato (vedi il trucco dell'orizzontale
// forzato, più sopra nel CSS): un antenato con transform diventa il
// "containing block" di chi dentro di lui usa position:fixed — non è più
// il vero schermo, è il riquadro LOCALE di quell'antenato. E siccome
// l'elemento eredita la STESSA rotazione, anche il suo angolo in
// alto-a-sinistra locale finisce per apparire altrove sullo schermo (gli
// angoli scorrono di un passo per ogni 90°: alto-sx diventa alto-dx).
// Scrivere lì dentro le stesse coordinate calcolate per uno schermo
// normale mandava i popup "in finestre sparse a caso".
//
// Le funzioni qui sotto fanno il conto al contrario una volta sola,
// verificato per davvero in un browser (non solo sulla carta): il resto
// del codice continua a pensare in coordinate normali, come se la pagina
// non fosse mai stata ruotata, e chiama queste invece di scrivere
// style.left/top direttamente.
function paginaRuotata() {
  return getComputedStyle(document.documentElement).transform !== 'none';
}
// Piazza l'angolo in alto a sinistra di un elemento fixed nel punto
// visivo (vx,vy). larghezzaVisiva è quella dell'elemento COSÌ COME SI
// VEDE (cioè quella che restituirebbe già oggi getBoundingClientRect,
// prima ancora di spostarlo) — sotto rotazione è la sua ALTEZZA locale,
// quella che serve al conto, quindi va passata quando la si ha già a
// portata di mano da un gBCR fatto per altri motivi.
function puntoFissoVisivo(vx, vy, larghezzaVisiva) {
  if (!paginaRuotata()) return { left: vx, top: vy };
  return { left: vy, top: window.innerWidth - larghezzaVisiva - vx };
}
// Stessa correzione, ma per uno SPOSTAMENTO (un translate d'animazione)
// invece che per un punto fisso: un vettore locale (dx,dy) appare sullo
// schermo come (−dy,dx), quindi per ottenere lo spostamento VISIVO
// (vdx,vdy) voluto va chiesto quello locale che, ruotato, ci arriva.
function spostamentoVisivo(vdx, vdy) {
  if (!paginaRuotata()) return { dx: vdx, dy: vdy };
  return { dx: vdy, dy: -vdx };
}

function squadra(ids) {
  const characters = {}, abilities = {};
  for (const id of ids) {
    const p = dati.personaggi[id];
    characters[p.seme] = {
      // Difesa è centrata su 1: senza il campo sulla carta, è la base
      // neutra (danno pieno), non uno zero che amplificherebbe il danno.
      pv: p.vita, pvMax: p.vita, att: p.att, difesa: p.difesa || 1, carica: 0, cardId: id, rarita: p.rarita || 1,
      turniCarica: p.turniCarica || 4   // quanti turni per riempire la barra dell'abilità
    };
    if (p.abilita) abilities[p.seme] = p.abilita;
  }
  return { characters, abilities };
}

function stelle(n) { return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)); }

// quanti punti magia costa l'abilità speciale di questo eroe
// Il costo vero lo calcola il motore (costoAbilitaDi), non questa
// funzione: deve sommare il sovrapprezzo del morso di Boitatá
// (costoExtra) e fermarsi al tetto di 7 PM. Prima qui c'era una copia
// che leggeva solo il costo base — il bottone "USA ABILITÀ" mostrava
// sempre lo stesso numero anche dopo il morso, come se non fosse
// successo niente.
function costoAbilita(ch) {
  return costoAbilitaDi(ch);
}

// ------------------------------------------------------------
// DISEGNO DELLE CARTE DA GIOCO
// Stessa struttura HTML del tavolo originale, stile "striscia" (la carta
// disegnata con CSS invece che con un'immagine): identica a vedersi, ma
// non servono i 375 KB di immagini di Burraco Pulito.
// ------------------------------------------------------------
// ------------------------------------------------------------
// LO STILE DELLE CARTE
//
// Stesso sistema di Circolo Burraco, e non per pigrizia: il foglio di
// stile che questo tavolo eredita da lì contiene GIÀ tutti questi
// stili, completi e provati. Riscriverli sarebbe stato rifare una cosa
// che esiste, con la certezza di farla un po' diversa.
//
// PREDEFINITO: L'ANGOLO GRANDE.
// A ventaglio le carte si coprono a vicenda e resta visibile solo una
// striscia sul lato sinistro: l'angolo grande mette lì dentro tutto
// quello che serve — valore e seme, grandi — mentre gli stili che
// puntano sul centro della carta lo perdono proprio quando servirebbe.
// ------------------------------------------------------------
// SEI STILI ERANO TROPPI: la scelta stessa era un problema, non solo
// quale fosse la migliore. Chi apriva le impostazioni doveva decidere
// fra sei anteprime senza sapere qual e' quella "giusta", e uno stile
// mai provato a fondo (gli altri cinque restavano "in prova" fin dal
// primo giorno) poteva finire scelto per sbaglio e restare lì, salvato
// in locale, a far sembrare rotto qualcosa che non lo era.
// Resta un solo stile, fisso: l'angolo grande, l'unico pensato apposta
// per il ventaglio (a carte accavallate resta visibile solo la striscia
// di sinistra, ed è lì che l'angolo grande mette valore e seme).
function stileCarte() { return 'angolo'; }

// Il corpo della carta, senza il riquadro esterno.
function corpoCarta(valore, seme, stile) {
  if (stile === 'filigrana') {
    return '<div class="fil">' + seme + '</div>' +
           '<div class="angv"><span class="v">' + valore + '</span><span class="s">' + seme + '</span></div>';
  }
  if (stile === 'numero') {
    // "10" è largo il doppio di "7" e "JLY" il triplo: con una misura
    // sola uno dei tre esce dalla carta. La classe dice quanto è lungo,
    // il foglio di stile decide quanto rimpicciolire.
    const lung = valore.length >= 3 ? ' lungo' : (valore.length === 2 ? ' medio' : '');
    return '<div class="numgrande' + lung + '">' + valore + '</div>' +
           '<span class="semino su">' + seme + '</span>' +
           '<span class="semino giu">' + seme + '</span>';
  }
  if (stile === 'angolo' || stile === 'angolocolori') {
    return '<div class="ang"><span class="v">' + valore + '</span><span class="s">' + seme + '</span></div>' +
           '<div class="centro">' + seme + '</div>';
  }
  // 'striscia' e 'colori' hanno la stessa struttura: cambia solo il colore
  return '<div class="banda"><span class="v">' + valore + '</span><span class="s">' + seme + '</span></div>' +
         '<div class="centro">' + seme + '</div>';
}

function cartaHtml(c, selezionabile) {
  const cls = c.isJolly ? (c.jollyColor === 'red' ? 'cuori' : 'picche') : SUIT_CLASS[c.suit];
  // IL JOLLY.
  // Diceva "JLY", che a occhio e' un "J" con del rumore intorno: in una
  // mano stretta a ventaglio si scambiava per un fante. Ora non ha piu'
  // ne' un numero ne' un seme da leggere — ha una stella, e la carta
  // intera cambia aspetto: fondo scuro e bordo dorato. Non e' una carta
  // come le altre e non deve sembrarlo.
  const valore = c.isJolly ? '★' : valueLabel(c.value);
  const seme = c.isJolly ? '★' : c.suit;
  const sel = selezionabile && selezione.has(c.id);
  const stile = stileCarte();
  return '<div class="card ' + cls + (c.isJolly ? ' jolly' : '') + ' disegnata st-' + stile +
         (selezionabile ? ' selectable' : '') + (sel ? ' selected' : '') +
         '" data-cid="' + c.id + '"' + (selezionabile ? ' onclick="ui.tocca(\'' + c.id + '\')"' : '') + '>' +
           corpoCarta(valore, seme, stile) +
           (c.isJolly ? '<div class="scritta-jolly">JOLLY</div>' : '') +
         '</div>';
}

// Sovrapposizione a ventaglio: stessa formula del tavolo originale.
// Se le carte ci stanno larghe si lascia un filo di spazio fra una e
// l'altra; se non ci stanno si stringono, senza mai ridursi a meno di
// una striscia visibile.
function fanOverlap(n, itemSize, gapMin, containerSize, minVisibleStrip) {
  if (n <= 1) return 0;
  const naturale = n * itemSize + (n - 1) * gapMin;
  if (naturale <= containerSize) return gapMin;
  const serve = (containerSize - itemSize) / (n - 1) - itemSize;
  const limite = -(itemSize - minVisibleStrip);
  if (serve >= limite) return serve;
  const largAlLimite = itemSize + (n - 1) * (itemSize + limite);
  return (largAlLimite <= containerSize) ? limite : serve;
}

function misuraCarta(nome, fallback) {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(nome));
  return v || fallback;
}

// Le "matte" (jolly e pinelle, cioè i 2) stanno SEMPRE a sinistra della mano,
// staccate dal resto e in qualunque ordinamento: sono le carte jolly del
// Burraco e vanno tenute sott'occhio a parte, non sparse fra le altre.
//
// L'ASSO VALE PIÙ DEL K. Nel mazzo l'asso è la carta numero 1, ma a
// vederlo in mano sta in fondo al proprio seme, dopo il K: è lì che uno
// lo cerca. Vale solo per la disposizione a schermo — nelle scale l'asso
// può ancora fare sia l'1 sia il 14, quello lo decide il motore.
const VALORE_ORDINE = (c) => (c.value === 1 ? 14 : c.value);

function ordinaCarte(carte) {
  const ordineSemi = { '♠': 0, '♦': 1, '♣': 2, '♥': 3 };   // ordine semi di Burraco Pulito
  const matta = (c) => c.isJolly || c.isPinella;
  const matte = carte.filter(matta).sort((a, b) => (a.isJolly ? 1 : 0) - (b.isJolly ? 1 : 0) || (ordineSemi[a.suit] ?? 9) - (ordineSemi[b.suit] ?? 9));
  const resto = carte.filter((c) => !matta(c)).sort((a, b) => {
    if (ordinamento === 'value') return (VALORE_ORDINE(a) - VALORE_ORDINE(b)) || (ordineSemi[a.suit] - ordineSemi[b.suit]);
    return (ordineSemi[a.suit] - ordineSemi[b.suit]) || (VALORE_ORDINE(a) - VALORE_ORDINE(b));
  });
  return [...matte, ...resto];
}

// LE CARTE APPENA ARRIVATE RESTANO IN FONDO.
// Pescando dal mazzo o raccogliendo il monte, le carte nuove non vanno
// infilate al loro posto: restano in coda finché non si ripreme un
// pulsante di ordinamento. Così si vede a colpo d'occhio cosa è appena
// arrivato, invece di doverlo ricercare in mezzo alla mano.
let carteNuove = [];        // id delle carte arrivate e non ancora riordinate

// Chi ha fatto l'ultima mossa: serve a far volare una carta scartata dal
// punto giusto (vedi origineDiUnaCartaNuova piu' sotto). 0 = io, 1 = avversario.
let ultimoAgente = 0;

// L'AVVERSARIO STA ANCORA "RECITANDO" IL SUO TURNO?
// Il motore risolve tutto il turno del bot in un colpo solo — quando
// botGiocaTurno() torna, S.currentPlayerIndex e' gia' il mio. Ma passo()
// (vedi turnoBot piu' sotto) mostra le sue mosse una alla volta, scaglionate
// nel tempo per poterle leggere: un colpo d'abilita' puo' restare in coda
// per secondi dopo che, sulla carta, e' gia' tocca a me. Senza questo
// paletto potevo pescare mentre l'ultima mossa dell'avversario doveva
// ancora andare in scena, e mi vedevo arrivare addosso un colpo suo
// mentre credevo di stare gia' giocando il mio turno.
let animazioneAvversarioInCorso = false;

function manoDaMostrare(mano) {
  if (!carteNuove.length) return ordinaCarte(mano);
  const nuoveSet = new Set(carteNuove);
  const vecchie = mano.filter((c) => !nuoveSet.has(c.id));
  // le nuove restano nell'ordine in cui sono arrivate
  const nuove = carteNuove.map((id) => mano.find((c) => c.id === id)).filter(Boolean);
  return [...ordinaCarte(vecchie), ...nuove];
}

// ------------------------------------------------------------
// DISPOSIZIONE DI UNA COLONNA CALATA
// Porting fedele di orderMeldForDisplay/buildColumnDisplay del tavolo
// originale: carta più alta in cima, e la wildcard messa al posto della
// carta che sta sostituendo (non buttata in fondo). Le carte si
// sovrappongono, mostrando solo una striscia di ciascuna: senza questo la
// colonna diventava una fila di carte intere, alta quanto tutto il tavolo.
// ------------------------------------------------------------
function wildcardDiMeld(m) {
  if (m.wildcardId) { const t = m.cards.find((c) => c.id === m.wildcardId); if (t) return t; }
  if (m.type === 'group') return m.cards.find((c) => c.isJolly || (c.isPinella && m.value !== 2)) || null;
  return m.cards.find((c) => c.isJolly || (c.isPinella && c.suit !== m.suit)) || null;
}

function ordinaMeldPerColonna(m) {
  const w = wildcardDiMeld(m);
  const naturali = m.cards.filter((c) => c !== w);
  if (m.type !== 'sequence') return w ? [...naturali, w] : naturali;

  const aceHigh = m.order ? m.order.aceHigh : false;
  const val = (c) => (aceHigh && c.value === 1) ? 14 : c.value;
  naturali.sort((a, b) => val(b) - val(a));            // decrescente: la più alta in cima
  if (!w) return naturali;

  // la wildcard tappa un buco? allora va messa in quel punto preciso
  const vals = naturali.map(val);
  let mancante = null;
  for (let v = vals[0]; v >= vals[vals.length - 1]; v--) { if (!vals.includes(v)) { mancante = v; break; } }
  if (mancante === null) return [...naturali, w];      // scala già completa: la wildcard sta in coda
  let dove = naturali.findIndex((c) => val(c) < mancante);
  if (dove === -1) dove = naturali.length;
  const out = naturali.slice();
  out.splice(dove, 0, w);
  return out;
}

// ------------------------------------------------------------
// DISEGNO DELLE 7 CARTE BATTLE
// ------------------------------------------------------------
function bcardPersonaggio(ch, seme, mio) {
  const t = testo(ch.cardId);
  const pct = Math.max(0, (ch.pv / ch.pvMax) * 100);
  const rosso = (seme === '♥' || seme === '♦');
  // "pronta" non dipende più da una carica sulla singola carta: l'abilità
  // si paga dalla riserva comune di punti magia
  // "pronta" adesso vuol dire anche: non ha ancora colpito in questo
  // turno. Un tasto acceso che poi rifiuta e' peggio di un tasto spento.
  const giaUsata = mio && (S.players[0].abilitaUsate || []).includes(seme);
  const pronta = mio && ch.pv > 0 && !giaUsata && S.players[0].puntiMagia >= costoAbilita(ch);
  // in modalità "scegli il bersaglio" si accendono i personaggi avversari vivi
  const mirabile = !mio && bersaglioAttivo && ch.pv > 0;
  // I dati per il pannello viaggiano negli attributi: così il riquadro si
  // riempie senza dover ricercare la carta a ogni passaggio del cursore.
  // IL RITRATTO. Non tutte le carte hanno un'illustrazione (i segnaposto
  // storici no): quelle restano com'erano, col semone sfumato di sfondo.
  const haRitratto = ILLUSTRAZIONI.indexOf(ch.cardId) !== -1;
  const ritratto = haRitratto
    ? '<img class="ritratto" src="immagini/' + ch.cardId + '.webp" alt="" draggable="false">' +
      '<div class="velo-ritratto"></div>'
    : '';

  return '<div class="bcard' + (ch.pv <= 0 ? ' ko' : '') + (pronta ? ' pronta' : '') +
      (giaUsata && ch.pv > 0 ? ' esausta' : '') + (mirabile ? ' mirabile' : '') +
      (haRitratto ? ' con-ritratto' : '') +
      '" data-seme="' + seme + '" data-lato="' + (mio ? 'mio' : 'avv') + '"' +
      // Durante la scelta del bersaglio il tocco su un nemico DEVE
      // colpire, non aprire la carta: si e' gia' nel mezzo di una
      // decisione, aprire un'altra finestra la interromperebbe.
      // Fuori da quel momento, toccare una carta la apre e basta.
      (mirabile ? ' onclick="ui.colpisci(\'' + seme + '\')"'
                : ' onclick="ui.guarda(\'' + (mio ? 'mio' : 'avv') + '\',\'' + seme + '\')"') +
      ' data-nome="' + esc(t.nome) + '" data-desc="' + esc(t.descrizione) + '"' +
      ' data-stelle="' + stelle(ch.rarita) + '"' +
      // La Difesa non si mostra a schermo (richiesta del committente):
      // conta lo stesso nel motore, ma con lo stesso valore su ogni
      // carta di questo roster non c'e' niente da leggere confrontandola.
      ' data-stat="VITA ' + Math.round(ch.pv) + '/' + ch.pvMax + ' · ATT ' + Math.round(ch.att) + '"' +
      ' data-carica="Abilità speciale: costa ' + costoAbilita(ch) + ' punti magia' +
        (giaUsata ? ' · ha già colpito in questo turno' : '') +
        (ch.pv <= 0 ? ' · eroe caduto: i suoi colpi valgono l\'80%' : '') + '">' +
      ritratto +
      (pronta ? '<div class="pronta-tag">USA</div>' : '') +
      '<div class="seme ' + (rosso ? 'rosso' : 'nero') + '">' + seme + '</div>' +
      '<div class="nome">' + t.nome + '</div>' +
      '<div class="stelle">' + stelle(ch.rarita) + '</div>' +
      scudoHtml(ch) +
      '<div class="barra vita"><i style="width:' + pct + '%"></i></div>' +
    '</div>';
}

// LO SCUDO DI UN PERSONAGGIO.
// La Difesa vive centrata su 1: 1 e' lo scudo pieno (danno pieno, nessuno
// sconto), sotto si incassa di piu', sopra di meno. Qui si traduce quel
// numero in qualcosa che si guarda: 1 -> 100%, 0,75 -> 75%, 1,25 -> 125%.
// Ci si mette dentro anche il bonus/malus temporaneo (difesaPercent), che
// e' proprio quello che le carte muovono: senza, lo scudo resterebbe
// fermo mentre la partita cambia sotto.
function scudoPercento(ch) {
  const base = Number(ch.difesa);
  const centro = Number.isFinite(base) ? base : 1;
  const bonus = (Number(ch.difesaPercent) || 0) / 100;
  return Math.round((centro + bonus) * 100);
}

function scudoHtml(ch) {
  const v = scudoPercento(ch);
  const pieno = v === 100;
  // quanto e' "riempito" lo scudo: oltre il 100% resta pieno e a dirlo e'
  // il numero, non si puo' riempire piu' del pieno
  const quota = Math.max(0, Math.min(1, v / 100));
  const colore = v > 100 ? '#8ad6ff' : (v < 100 ? '#ff9db0' : '#cbd6f5');
  return '<div class="scudo ' + (pieno ? 'intero' : 'rotto') + '" ' +
           'title="Scudo ' + v + '%">' +
         '<svg viewBox="0 0 24 26" aria-hidden="true">' +
           '<defs><clipPath id="sc' + (ch.cardId || '') + '">' +
             '<path d="M12 1 L22 5 V13 C22 19 17 23 12 25 C7 23 2 19 2 13 V5 Z"/>' +
           '</clipPath></defs>' +
           '<path d="M12 1 L22 5 V13 C22 19 17 23 12 25 C7 23 2 19 2 13 V5 Z" ' +
                 'fill="rgba(0,0,0,0.55)" stroke="' + colore + '" stroke-width="1.4"/>' +
           '<g clip-path="url(#sc' + (ch.cardId || '') + ')">' +
             '<rect class="riempi" x="0" y="0" width="24" height="26" fill="' + colore + '" ' +
                   'opacity="0.45" style="transform:scaleY(' + quota + ')"/>' +
           '</g>' +
         '</svg>' +
         (pieno ? '' : '<span class="valore">' + v + '%</span>') +
       '</div>';
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function disegnaStriscia(contenitore, indiceGiocatore, mie) {
  const g = S.players[indiceGiocatore];
  const ms = magie[indiceGiocatore];
  let html = '';
  for (const s of SEMI) html += bcardPersonaggio(g.characters[s], s, mie);
  html += '<div class="divisore"></div>';

  // Una carta già giocata sparisce dal tavolo. Restava lì, spenta ma
  // presente, e sembrava ancora disponibile. L'indice non si tocca:
  // ui.magica(i) punta dentro selection, e rinumerare le carte
  // rimaste farebbe giocare quella sbagliata.
  const giocate = ms.giocate || [];
  ms.selection.forEach((carta, i) => {
    if (giocate.includes(carta.id)) return;
    if (!mie) {
      // Le Carte Magiche dell'avversario non si possono conoscere: sempre coperte.
      html += '<div class="bcard magica coperta" data-nome="Carta Magica sconosciuta"' +
              ' data-desc="Non puoi sapere quale carta ha scelto l\'avversario finché non la gioca.">' +
              '<div class="sigillo">?</div></div>';
      return;
    }
    const t = testo(carta.id);
    const armata = ms.trappoleArmate.some((x) => x.cardId === carta.id);
    // OGNI CARTA VALE UN SOLO UTILIZZO: spenta quando il suo posto è
    // speso. Prima si guardava "sorpresaUsed", che diceva CHE una
    // sorpresa era stata giocata ma non QUALE — e le Trappole non si
    // spegnevano affatto.
    const usata = (ms.consumate || []).includes(i);
    const stato = usata ? ' — già usata, non torna' : (armata ? ' — armata, in attesa che scatti' : '');
    html += '<div class="bcard magica ' + carta.tipo + (usata ? ' usata' : '') + (armata ? ' armata' : '') +
            '" data-nome="' + esc(t.nome) + '" data-desc="' + esc(t.descrizione + stato) + '"' +
            ' data-carica="' + (usata ? 'Già usata: ogni Carta Magica vale un solo utilizzo.'
                                      : 'Non costa punti magia. Vale un solo utilizzo: giocata, sparisce anche dalla tua collezione.') + '"' +
            ' data-tipo="' + carta.tipo + '"' +
            ' data-stelle="' + stelle(carta.rarita || 1) + '"' +
            // il tocco APRE la carta; per giocarla si preme USA nella
            // finestra grande (una Carta Magica giocata e' spesa per
            // sempre: non deve dipendere da un dito storto)
            ' onclick="ui.guardaMagica(' + i + ')">' +
            '<div class="sigillo">' + (carta.tipo === 'sorpresa' ? '✦' : '⚡') + '</div>' +
            '<div class="etichetta">' + (carta.tipo === 'sorpresa' ? 'SORPRESA' : 'TRAPPOLA') + '</div>' +
            '<div class="nome-magia">' + t.nome + '</div>' +
            (usata ? '<div class="segno-usata">USATA</div>' : '') +
          '</div>';
  });
  contenitore.innerHTML = html;
}

// ------------------------------------------------------------
// PANNELLO DI DETTAGLIO
// Un solo riquadro riusato da tutte le carte: si apre accanto a quella
// sotto il cursore. Prima il testo stava dentro la carta ingrandita e
// usciva dai bordi; qui ha una larghezza propria e non può sbordare.
// ------------------------------------------------------------
function agganciaPannello() {
  const pop = $('bcardPop');
  document.addEventListener('mouseover', (e) => {
    const c = e.target.closest ? e.target.closest('.bcard') : null;
    if (!c) return;
    const tipo = c.getAttribute('data-tipo');
    pop.innerHTML =
      (tipo ? '<div class="ptipo">' + (tipo === 'sorpresa' ? 'Carta Sorpresa' : 'Carta Trappola') + '</div>' : '') +
      '<div class="pnome">' + (c.getAttribute('data-nome') || '') + '</div>' +
      (c.getAttribute('data-stelle') ? '<div class="pstelle">' + c.getAttribute('data-stelle') + '</div>' : '') +
      (c.getAttribute('data-stat') ? '<div class="pstat">' + c.getAttribute('data-stat') + '</div>' : '') +
      (c.getAttribute('data-carica') ? '<div class="pcarica">' + c.getAttribute('data-carica') + '</div>' : '') +
      '<div class="pdesc">' + (c.getAttribute('data-desc') || '') + '</div>';
    pop.classList.add('mostra');

    const r = c.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    // sotto la carta se sta in alto, sopra se sta in basso; sempre dentro lo schermo
    const sotto = r.top < window.innerHeight / 2;
    let top = sotto ? r.bottom + 8 : r.top - pr.height - 8;
    let left = r.left + r.width / 2 - pr.width / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - pr.width - 6));
    top = Math.max(6, Math.min(top, window.innerHeight - pr.height - 6));
    const punto = puntoFissoVisivo(left, top, pr.width);
    pop.style.left = punto.left + 'px';
    pop.style.top = punto.top + 'px';
  });
  document.addEventListener('mouseout', (e) => {
    const c = e.target.closest ? e.target.closest('.bcard') : null;
    if (c) pop.classList.remove('mostra');
  });
  // COL DITO, "mouseover"/"mouseout" NON BASTANO.
  // Un tocco sulla carta genera spesso un mouseover sintetico che apre
  // il pannello, ma il mouseout che lo richiuderebbe a volte non arriva
  // mai: resta appiccicato sopra il tavolo finché non capita un altro
  // evento a caso. Un tocco FUORI da una carta lo chiude sempre, quindi,
  // qualunque cosa faccia (o non faccia) il mouseover/mouseout sintetico.
  document.addEventListener('touchstart', (e) => {
    const c = e.target.closest ? e.target.closest('.bcard') : null;
    if (!c) pop.classList.remove('mostra');
  }, { passive: true });
}

// ------------------------------------------------------------
// DISEGNO COMPLETO
// ------------------------------------------------------------
// ============================================================
// LE CARTE SI MUOVONO
//
// Il tavolo si ridisegna tutto intero a ogni cambiamento, quindi le
// carte non si spostavano: sparivano da una parte e ricomparivano
// dall'altra. Funzionava, ma non si capiva che cosa fosse successo —
// quale carta avevo pescato, dove era finita quella scartata, quali
// erano scese in tavola.
//
// Il modo di rimediare e' vecchio e si chiama FLIP. Si segna DOVE sta
// ogni carta PRIMA di ridisegnare; dopo il ridisegno la si trova nel
// posto nuovo, le si dice "fai finta di essere ancora dov'eri" e poi si
// toglie la finzione. Il browser ci mette in mezzo il movimento. Nessuna
// carta si sposta davvero: si disegna il salto all'indietro e lo si
// annulla, e questo e' il motivo per cui non tocca nulla della partita.
//
// Le carte che PRIMA non c'erano (una pescata dal mazzo coperto, una
// calata dell'avversario che esce dalla sua mano) non hanno un "dove
// stavano": gli si assegna un punto di partenza sensato — il mazzo, il
// monte scarti, la mano di chi ha giocato.
// ============================================================
const DURATA_VOLO_CARTA = 420;

function rettangoliDelleCarte() {
  const mappa = new Map();
  if (typeof document === 'undefined') return mappa;
  for (const el of document.querySelectorAll('[data-cid]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) mappa.set(el.dataset.cid, r);
  }
  return mappa;
}

// Da dove arriva una carta che prima non c'era, a seconda di dove e'
// atterrata. Non si puo' sapere con certezza, ma indovinare bene copre
// tutti i casi che capitano davvero.
function origineDiUnaCartaNuova(el) {
  const rettangolo = (id) => {
    const n = $(id);
    return n ? n.getBoundingClientRect() : null;
  };
  if (el.closest('#handBox')) return rettangolo('palTallone') || rettangolo('palScarti');
  // Una carta nuova sul monte scarti arriva dalla mano di CHI l'ha
  // scartata — la mia se l'ho scartata io, quella dell'avversario se
  // l'ha scartata lui. Prima veniva sempre da 'handBox' (la mia), quindi
  // uno scarto dell'avversario sembrava volare da un punto a caso invece
  // che dalla sua mano.
  if (el.closest('#palScarti')) return rettangolo(ultimoAgente === 1 ? 'oppHandBox' : 'handBox');
  if (el.closest('#myMelds')) return rettangolo('handBox');
  if (el.closest('#oppMelds')) return rettangolo('oppHandBox');
  return null;
}

function faiVolareLeCarte(prima) {
  if (!prima || typeof document === 'undefined') return;
  if (!document.querySelectorAll) return;
  for (const el of document.querySelectorAll('[data-cid]')) {
    const dopo = el.getBoundingClientRect();
    if (dopo.width <= 0) continue;
    const da = prima.get(el.dataset.cid) || origineDiUnaCartaNuova(el);
    if (!da) continue;

    const dx = da.left - dopo.left;
    const dy = da.top - dopo.top;
    const scala = dopo.width > 0 ? Math.min(2, Math.max(0.3, da.width / dopo.width)) : 1;
    // se non si e' mossa quasi per niente, meglio non animare: un
    // tremolio a ogni ridisegno stanca e non racconta niente
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && Math.abs(scala - 1) < 0.05) continue;

    if (!el.animate) continue;
    const zPrima = el.style.zIndex;
    el.style.zIndex = '400';
    const anim = el.animate([
      { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scala + ')' },
      { transform: 'none' }
    ], { duration: DURATA_VOLO_CARTA, easing: 'cubic-bezier(0.22, 0.72, 0.26, 1)' });
    const rimetti = () => { el.style.zIndex = zPrima; };
    if (anim.finished) anim.finished.then(rimetti).catch(rimetti);
    else setTimeout(rimetti, DURATA_VOLO_CARTA + 40);
  }
}

// Il disegno vero sta in disegnaTutto(); qui intorno c'e' solo il
// movimento. Cosi' ogni chiamata a disegna(), da qualunque punto del
// tavolo arrivi, anima le carte senza doversene ricordare.
function disegna() {
  const prima = rettangoliDelleCarte();
  disegnaTutto();
  faiVolareLeCarte(prima);
}

function disegnaTutto() {
  const io = S.players[0], avv = S.players[1];

  // LA SCELTA DEL BERSAGLIO NON SOPRAVVIVE AL TURNO.
  // Restava aperta: si premeva un eroe, non si sceglieva nessun
  // bersaglio, e la scritta "scegli chi colpire" rimaneva li' anche dopo
  // aver passato la mano — chiedendo una cosa che non si poteva piu'
  // fare. Se non e' piu' il mio turno, o la partita e' finita, si chiude.
  if (bersaglioAttivo && (S.currentPlayerIndex !== 0 || S.status !== 'in_progress')) {
    bersaglioAttivo = null;
    const nota = $('istruzioneBersaglio');
    if (nota) nota.classList.remove('mostra');
  }

  // mia mano: ventaglio in basso, carte sovrapposte come nel tavolo originale
  const mano = manoDaMostrare(io.hand);
  const cw = misuraCarta('--card-w', 40.25);
  const largh = $('handBox').clientWidth || 320;
  const ov = fanOverlap(mano.length, cw, 4, largh, 8);
  $('handBox').innerHTML = mano.map((c, i) =>
    '<div style="margin-right:' + (i === mano.length - 1 ? 0 : ov) + 'px">' + cartaHtml(c, true) + '</div>'
  ).join('');
  const etichettaCarte = (n) => n + (n === 1 ? ' carta' : ' carte');
  $('mieCarte').textContent = etichettaCarte(io.hand.length);
  $('oppConta').textContent = etichettaCarte(avv.hand.length);

  // mano avversario: solo dorsi, non si vede mai cosa ha
  // QUANTE CARTE HA L'AVVERSARIO NON SI PUÒ VEDERLE UNA A UNA: sono
  // coperte, e non importa se sono 2 o 11 — il numero esatto lo dice già
  // #oppConta, scritto lì accanto. Un ventaglio di undici dorsi che si
  // accavallano non aggiungeva nessuna informazione in più, solo un
  // pacchetto di carte disegnato più largo. Bastano tre dorsi fissi,
  // sempre la stessa mucchietta, a dire "ha delle carte in mano" — la
  // stessa idea di un mazziere che mostra un ventaglio simbolico.
  const DORSI_SIMBOLICI = 3;
  // Un po' più grandi delle carte "vere" del ventaglio (che tanto non
  // esiste più): sono solo tre, c'è spazio, e il mucchietto si legge
  // meglio se le carte si vedono bene invece di restare minuscole.
  const dorsoW = Math.round(misuraCarta('--opp-card-w', 19) * 1.35);
  const dorsoH = Math.round(misuraCarta('--opp-card-h', 27.7) * 1.35);
  const quanteMostrare = Math.min(avv.hand.length, DORSI_SIMBOLICI);
  // Sovrapposte per davvero: margine NEGATIVO, non uno spazio fra loro.
  // Ogni carta successiva viene disegnata dopo nel DOM, quindi copre da
  // sola un pezzo di quella prima — l'aspetto di un mucchietto di carte
  // appoggiate una sull'altra, non un ventaglio aperto.
  const sovrapposizione = -Math.round(dorsoW * 0.55);
  $('oppHandBox').innerHTML = new Array(quanteMostrare).fill(0).map((_, i) =>
    '<div style="margin-right:' + (i === quanteMostrare - 1 ? 0 : sovrapposizione) + 'px">' +
      '<div class="card back" style="width:' + dorsoW + 'px; height:' + dorsoH + 'px;"></div>' +
    '</div>'
  ).join('');

  // colonne dei giochi calati, precedute dallo spazio riservato alle Trappole
  $('myMelds').innerHTML  = slotTrappole(0) + io.melds.map((m) => colonnaMeld(m, $('myMelds'))).join('');
  $('oppMelds').innerHTML = slotTrappole(1) + avv.melds.map((m) => colonnaMeld(m, $('oppMelds'))).join('');

  // I due pozzetti, a sinistra del mazzo (come nel tavolo originale).
  // Uno per giocatore: si prendono automaticamente quando la mano si
  // svuota. Restano visibili anche dopo, ma spenti.
  $('pozzettiCross').innerHTML =
    pozzettoHtml(io, 'sotto', 'Il tuo pozzetto') +
    pozzettoHtml(avv, 'sopra', 'Pozzetto avversario');

  // mazzo e scarti
  $('talloneCount').textContent = S.tallone.length;
  const scarti = $('palScarti');
  if (S.scarti.length === 0) {
    scarti.className = 'discard-pile empty';
    scarti.innerHTML = '<div class="segnaposto-scarti"></div>';
  } else {
    scarti.className = 'discard-pile';
    // Le scartate si sovrappongono con la stessa formula del ventaglio: più
    // ce ne sono, più si stringono dentro lo spazio che hanno. Quello spazio
    // è quello che avanza nella riga, perché le 7 carte Battle a destra non
    // sono comprimibili: il monte non arriva mai a invaderle.
    const n = S.scarti.length;
    const spazio = scarti.clientWidth || 240;
    const cwS = misuraCarta('--card-w', 40.25);
    const ovS = fanOverlap(n, cwS, 2, spazio - 34, 7); // -34: lascia posto al contatore
    scarti.innerHTML = S.scarti.map((c, i) =>
      '<div style="margin-right:' + (i === n - 1 ? 0 : ovS) + 'px">' + cartaHtml(c, false) + '</div>'
    ).join('') + '<div class="pile-count">' + n + '</div>';
  }

  // strisce Battle e riserve di punti magia
  disegnaStriscia($('battleGiocatore'), 0, true);
  disegnaStriscia($('battleAvversario'), 1, false);
  disegnaMagia($('magiaGiocatore'), io);
  disegnaMagia($('magiaAvversario'), avv);

  // intestazioni
  $('turnIndicator').textContent = S.status !== 'in_progress' ? 'Fine' : (S.currentPlayerIndex === 0 ? 'Tocca a te' : 'Avversario');
  $('oppName').textContent = 'Avversario';
  $('oppLiveScore').textContent = Math.round(SEMI.reduce((t, s) => t + avv.characters[s].pv, 0)) + ' PV';
  aggiornaMonteTempo();

  const g = S.players[S.currentPlayerIndex];
  document.body.classList.toggle('ho-selezione', selezione.size > 0 && S.status === 'in_progress');
  document.body.classList.toggle('scelta-bersaglio', !!bersaglioAttivo);
  $('selectionHint').textContent = S.status !== 'in_progress' ? ''
    : (!g.hasDrawnThisTurn ? 'Pesca dal mazzo o prendi il monte scarti.'
       : (selezione.size
          ? (io.melds.length
             ? 'Tocca un gioco già calato per agganciarci le carte (anche una sola), lo spazio vuoto per calarne uno nuovo, o gli scarti per scartare.'
             : 'Tocca lo spazio delle calate per calare (minimo 3 carte), o gli scarti per scartare.')
          : 'Scegli le carte da giocare, oppure scarta.'));

  if (S.status === 'finished') mostraFine();
}

// La riserva di punti magia: una colonna sola che si riempie dal basso,
// alta quanto le carte accanto — non più 15 tacche impilate.
function disegnaMagia(box, giocatore) {
  const punti = Math.max(0, Math.min(15, giocatore.puntiMagia || 0));
  const percento = Math.round((punti / 15) * 100);
  box.className = 'barra-magia' + (punti >= 15 ? ' piena' : '');
  box.title = 'Punti magia: ' + punti + ' su 15 — crescono di 2 a ogni tuo turno e si spendono per le Carte Magiche e le abilità speciali';
  box.innerHTML = '<div class="pila"><div class="riempimento" style="height:' + percento + '%"></div><span class="conta">' + punti + '</span></div>';
}

// ------------------------------------------------------------
// PRIMA COLONNA RISERVATA ALLE CARTE TRAPPOLA
// La trappola resta coperta (l'avversario non sa QUALE sia), ma deve
// vedersi CHE c'è: altrimenti non avrebbe modo di accorgersene. Perciò
// la prima colonna dell'area delle calate resta sempre libera e ospita
// le trappole armate, a faccia in giù. Solo le Trappole finiscono qui:
// le Sorprese si risolvono subito, non restano sul tavolo.
// ------------------------------------------------------------
function slotTrappole(indiceGiocatore) {
  const armate = magie[indiceGiocatore].trappoleArmate;
  const contenuto = armate.length === 0
    ? '<div class="posto"></div>'
    : armate.map(() => '<div class="trappola-posata" title="Carta Trappola armata: attiva, ma non si sa quale sia">⚡</div>').join('');
  return '<div class="slot-trappole">' + contenuto +
         '<div class="etichetta">' + (armate.length ? 'TRAPPOLE ATTIVE' : 'trappole') + '</div></div>';
}

function pozzettoHtml(giocatore, posizione, titolo) {
  const preso = giocatore.pozzettoTaken;
  return '<div class="pozzetto-card ' + posizione + (preso ? ' preso' : '') + '" title="' + titolo +
         (preso ? ' — già preso' : ' — ancora da prendere') + '"></div>';
}

function colonnaMeld(m, contenitore) {
  const cardH = misuraCarta('--card-h', 58.65);
  const cardW = misuraCarta('--card-w', 40.25);
  const ordinate = ordinaMeldPerColonna(m);
  const w = wildcardDiMeld(m);

  // quanto spazio in verticale si lascia a ogni carta oltre la prima: solo
  // una striscia. Se la colonna non ci sta in altezza, la striscia si
  // assottiglia finché rientra (stessa idea del tavolo originale).
  const PASSO = 20;
  const dispH = (contenitore && contenitore.clientHeight) || 260;
  const spazioTarghetta = bonusLunghezza(m.cards.length) ? 22 : 0;   // la targhetta occupa il suo posto
  const costo = (ordinate.length - 1) * PASSO;
  const utile = Math.max(cardH, dispH - 12 - spazioTarghetta) - cardH;
  const scala = (costo > 0 && costo > utile) ? Math.max(0.28, utile / costo) : 1;
  const passo = PASSO * scala;

  // La wildcard NON si mostra più colcata a 90°: stava storta e basta, e
  // rubava spazio in verticale. Ora resta dritta come le altre e si
  // riconosce da una cornice dorata.
  const html = ordinate.map((c, i) => {
    const stile = i === 0 ? '' : 'margin-top:' + (passo - cardH) + 'px;';
    const marchio = (c === w) ? ' class="e-matta"' : '';
    return '<div' + marchio + ' style="' + stile + '">' + cartaHtml(c, false) + '</div>';
  }).join('');

  return '<div class="card-column" data-meld-id="' + m.id + '">' + html +
         targhettaPotenza(m) + '</div>';
}

// ------------------------------------------------------------
// TARGHETTA DELLA POTENZA
// Al posto della carta storta, sotto la colonna si legge quanto quel
// gioco picchia più forte per la sua lunghezza: 5 carte +10%, 6 carte
// +20%, 7 o più +35%. Sotto le 5 carte non c'è bonus e non si scrive nulla.
// Vale per entrambi: nei tris è il moltiplicatore sul danno di ogni carta,
// nelle scale è l'ondata d'urto che colpisce tutti e quattro.
// ------------------------------------------------------------
function bonusLunghezza(n) {
  if (n >= 7) return 35;
  if (n === 6) return 20;
  if (n === 5) return 10;
  return 0;
}

function targhettaPotenza(m) {
  const bonus = bonusLunghezza(m.cards.length);
  if (!bonus) return '';
  const aoe = (m.type === 'sequence');
  const spiega = aoe
    ? 'Scala da ' + m.cards.length + ' carte: ondata d\'urto del ' + bonus + '% su tutti e quattro i personaggi avversari'
    : 'Gruppo da ' + m.cards.length + ' carte: +' + bonus + '% di danno su ogni carta';
  return '<div class="targhetta-potenza liv' + bonus + '" title="' + spiega + '">+' + bonus + '%</div>';
}

function mmss(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// ------------------------------------------------------------
// I DUE CRONOMETRI DEL MINUTO A TURNO
// Il motore non tiene un timer che scorre: registra quando è iniziato il
// turno e ricostruisce il tempo passato quando serve. Qui si legge quel
// valore quattro volte al secondo per mostrarlo, e si chiede al motore di
// far scattare la scadenza quando il minuto è finito.
// ------------------------------------------------------------
// ------------------------------------------------------------
// IL MONTE TEMPO DEI SEI MINUTI
// Il motore non lo fa scorrere: tiene in cassa i secondi e li scala
// tutti insieme quando arriva la mossa dopo. Come conto è esatto, ma a
// schermo si vedeva fermo per tutto il turno e poi calare di colpo di
// quaranta secondi — ecco l'andare "a tratti".
// Qui il numero viene ricostruito a ogni disegno: quello che il motore
// ha in cassa, meno i secondi passati dall'ultima mossa, e solo per chi
// ha il turno. Il valore che conta resta quello del motore — questo è
// soltanto il modo di mostrarlo, e per questo non tocca lo stato.
// ------------------------------------------------------------
function monteTempo(indice) {
  let sec = S.players[indice].clockSecondsLeft;
  if (S.status === 'in_progress' && S.currentPlayerIndex === indice) {
    const da = Date.parse(S.lastMoveAt);
    if (!isNaN(da)) sec -= Math.max(0, Math.floor((adessoVero() - da) / 1000));
  }
  return Math.max(0, sec);
}

function aggiornaMonteTempo() {
  if (!S) return;
  const mio = $('myMatchTimer'), suo = $('oppMatchTimer');
  if (!mio || !suo) return;
  mio.textContent = mmss(monteTempo(0));
  suo.textContent = mmss(monteTempo(1));
}

function aggiornaSpiePozzetto() {
  if (!S) return;
  const spie = [['pozzettoMio', 0], ['pozzettoAvv', 1]];
  for (const [id, chi] of spie) {
    const el = $(id);
    if (!el) continue;
    const preso = !!S.players[chi].pozzettoTaken;
    el.classList.toggle('preso', preso);
    el.textContent = preso ? 'POZZETTO PRESO' : 'pozzetto';
    el.title = preso
      ? 'Il pozzetto è già stato preso: le sue carte valgono il 150%'
      : 'Il pozzetto è ancora lì da prendere';
  }
}

// ------------------------------------------------------------
// LO STUDIO DEL TAVOLO
// Non e' un conto alla rovescia del browser: e' l'istante scritto nella
// partita. Qui si legge e si mostra, come per gli altri due orologi —
// cosi' i due giocatori vedono lo stesso numero, e chiudere e riaprire
// la pagina non regala secondi a nessuno.
// ------------------------------------------------------------
function secondiDiStudioRimasti() {
  if (!S || !S.iniziaAlle || S.status !== 'in_progress') return 0;
  const inizio = Date.parse(S.iniziaAlle);
  if (isNaN(inizio)) return 0;
  return Math.max(0, Math.ceil((inizio - adessoVero()) / 1000));
}

// ------------------------------------------------------------
// L'ANIMAZIONE DEL SORTEGGIO
// Il mazzo pesca una carta per giocatore e la più alta decide chi
// comincia (a parità decide il seme: ♥ ♦ ♣ ♠). Prima cominciava sempre
// chi apriva il tavolo e non si vedeva niente: qui lo si guarda.
//
// È SOLO UNA MESSA IN SCENA: la decisione l'ha già presa il motore, e
// le due carte arrivano dalla vista senza il loro identificativo —
// restano nel mazzo, e farne uscire l'id rivelerebbe un pezzo di
// tallone. Qui si disegnano e basta.
// ------------------------------------------------------------
const SORTEGGIO_MS = 3400;
let sorteggioMostrato = false;

function cartaSorteggio(c) {
  if (!c) return '';
  const cls = c.isJolly ? (c.jollyColor === 'red' ? 'cuori' : 'picche') : SUIT_CLASS[c.suit];
  const valore = c.isJolly ? '★' : valueLabel(c.value);
  const seme = c.isJolly ? '★' : c.suit;
  const stile = stileCarte();
  return '<div class="card ' + cls + (c.isJolly ? ' jolly' : '') + ' disegnata st-' + stile + '">' +
           corpoCarta(valore, seme, stile) +
           (c.isJolly ? '<div class="scritta-jolly">JOLLY</div>' : '') +
         '</div>';
}

function chiudiSorteggio() {
  const box = $('sorteggio');
  if (box) box.classList.remove('mostra');
}

function mostraSorteggio() {
  if (sorteggioMostrato) return;
  sorteggioMostrato = true;

  const box = $('sorteggio');
  const s = S && S.sorteggio;
  // se chi comincia e' stato imposto (o la vista non lo racconta) non
  // c'e' nessuna pescata da mostrare: si salta e si va allo studio
  if (!box || !s || !s.carte || s.carte.length !== 2) return;

  // Dentro questo tavolo il giocatore 0 è SEMPRE chi sta guardando —
  // contro il bot per costruzione, in rete perché statoDaVista ribalta
  // tutto. Quindi qui non serve chiedersi chi si è: il posto 0 è il mio.
  const vince = s.vincitore;
  const posto = (chi) =>
    '<div class="posto ' + (chi === vince ? 'vince' : 'perde') + '">' +
      '<div class="chi">' + (chi === 0 ? 'Tu' : 'Avversario') + '</div>' +
      cartaSorteggio(s.carte[chi]) +
    '</div>';

  $('sorteggioCarte').innerHTML = posto(0) + posto(1);
  $('sorteggioPari').innerHTML = (s.pareggi || [])
    .map((coppia) => coppia.map(cartaSorteggio).join('')).join('');
  $('sorteggioEsito').textContent = vince === 0 ? 'Cominci tu' : 'Comincia l\'avversario';

  box.classList.add('mostra');
  box.onclick = chiudiSorteggio;
  setTimeout(chiudiSorteggio, SORTEGGIO_MS);
}

// SE IL SORTEGGIO HA DATO IL VIA AL BOT, QUALCUNO DEVE SVEGLIARLO.
// Il bot parte solo dopo una mossa del giocatore (o dopo un tempo
// scaduto): finché cominciava sempre il giocatore andava bene. Adesso
// che chi comincia lo decide il mazzo, una partita su due toccherebbe
// al bot per primo — e senza questa spinta il tavolo resterebbe fermo,
// in attesa di un giocatore che non può muovere perché non è il suo
// turno. Si fa una volta sola, appena finito lo studio.
let botSvegliato = false;
function svegliaIlBotSeTocca() {
  if (botSvegliato || ONLINE) return;            // in rete muove l'altro, non il bot
  if (!S || S.status !== 'in_progress') return;
  if (S.currentPlayerIndex !== 1) return;
  botSvegliato = true;
  setTimeout(turnoBot, 900);
}

// l'ultimo secondo suonato del conto alla rovescia: senza, il tic
// suonerebbe fino a quattro volte per secondo (il giro dell'orologio
// e' ogni 250ms), non una volta sola come si sente un vero countdown.
let ultimoTicStudio = null;
function aggiornaStudio() {
  const box = $('studio');
  if (!box) return;
  const restano = secondiDiStudioRimasti();
  const dentro = restano > 0;
  box.classList.toggle('mostra', dentro);
  document.body.classList.toggle('in-studio', dentro);
  if (!dentro) { ultimoTicStudio = null; svegliaIlBotSeTocca(); return; }
  const n = $('studioNumero');
  n.textContent = restano;
  const poco = restano <= 5;
  n.classList.toggle('poco', poco);
  if (poco && restano !== ultimoTicStudio) { ultimoTicStudio = restano; SUONI.countdown(); }
}

function rigiaMiaSpenta() {
  for (const id of ['rigaTurnoMio', 'rigaTurnoAvv']) {
    const r = $(id);
    if (r) r.classList.remove('attiva', 'agli-sgoccioli');
  }
}

function aggiornaOrologiTurno() {
  // Puo' scattare prima che il primo aggiornamento sia arrivato dal
  // server: senza questa riga qui sotto si legge S.status con S ancora
  // vuoto, e l'orologio si ferma prima di cominciare.
  if (!S) return;
  aggiornaMonteTempo();
  aggiornaSpiePozzetto();
  aggiornaStudio();
  const rigaMia = $('rigaTurnoMio'), rigaAvv = $('rigaTurnoAvv');
  if (!rigaMia || S.status !== 'in_progress') {
    if (rigaMia) { rigaMia.classList.remove('attiva', 'agli-sgoccioli'); rigaAvv.classList.remove('attiva', 'agli-sgoccioli'); }
    return;
  }
  const passati = Math.max(0, Math.floor((adessoVero() - Date.parse(S.turnStartedAt)) / 1000));
  const restano = Math.max(0, TURN_SECONDS - passati);
  // durante lo studio il minuto non e' ancora cominciato: si mostra intero
  if (secondiDiStudioRimasti() > 0) {
    $('turnoMio').textContent = mmss(TURN_SECONDS);
    $('turnoAvv').textContent = mmss(TURN_SECONDS);
    rigiaMiaSpenta();
    return;
  }
  const mioTurno = S.currentPlayerIndex === 0;

  $('turnoMio').textContent = mioTurno ? mmss(restano) : mmss(TURN_SECONDS);
  $('turnoAvv').textContent = mioTurno ? mmss(TURN_SECONDS) : mmss(restano);
  rigaMia.classList.toggle('attiva', mioTurno);
  rigaAvv.classList.toggle('attiva', !mioTurno);
  rigaMia.classList.toggle('agli-sgoccioli', mioTurno && restano <= 15);
  rigaAvv.classList.toggle('agli-sgoccioli', !mioTurno && restano <= 15);

  // minuto finito: il motore pesca e scarta d'ufficio una carta a caso e
  // passa il turno all'avversario.
  // In rete non lo decide questo tavolo: lo decide il server, e la
  // novità arriva da sola. Se lo facesse anche qui, i due tavoli
  // scadrebbero in momenti diversi e si sfaserebbero.
  if (restano === 0 && mioTurno && !ONLINE) {
    const r = checkTurnTimeout(S, Date.now());
    if (r.expired) {
      avviso(r.scartata
        ? 'Tempo scaduto: pescata e scartata d\'ufficio una carta a caso.'
        : 'Tempo scaduto: turno passato all\'avversario.');
      selezione.clear();
      disegna();
      if (S.currentPlayerIndex === 1 && S.status === 'in_progress') setTimeout(turnoBot, 900);
    }
  }
}

function avviso(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('mostra');
  t.style.opacity = '1';
  clearTimeout(avviso._t);
  avviso._t = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

// ------------------------------------------------------------
// L'ULTIMO COLPO SI DEVE VEDERE
// La schermata di fine partita si apriva nello stesso istante in cui
// partiva l'animazione del colpo che aveva chiuso la partita: il colpo
// decisivo — l'unico che uno vuole davvero vedere — era l'unico che non
// si vedeva mai. Peggio ancora quando finiva per KO: si scopriva di
// aver vinto senza aver visto quanto danno fosse arrivato.
// Ora chi mette in scena un'animazione dice fin quando dura, e la
// schermata aspetta il suo turno.
// ------------------------------------------------------------
let animazioneFinoA = 0;
function segnaAnimazione(durataMs) {
  animazioneFinoA = Math.max(animazioneFinoA, Date.now() + durataMs);
}

let fineGiaProgrammata = false;
function mostraFine() {
  if (fineGiaProgrammata) return;
  fineGiaProgrammata = true;
  // se non c'è niente in scena, l'attesa è zero e si apre subito
  const attesa = Math.max(0, animazioneFinoA - Date.now());
  setTimeout(apriSchermataFine, attesa);
}

// Dieci secondi e si torna in home. Il tavolo di una partita finita non
// serve piu' a niente: restare li' a guardarlo e' solo un vicolo cieco,
// e su telefono non c'e' nemmeno un tasto indietro comodo. Chi vuole
// andarsene prima ha il bottone.
const SECONDI_PRIMA_DI_TORNARE_A_CASA = 10;
function contoAllaRovescia() {
  let restano = SECONDI_PRIMA_DI_TORNARE_A_CASA;
  const spia = $('fineConto');
  if (spia) spia.textContent = restano;
  const battito = setInterval(() => {
    restano--;
    if (spia) spia.textContent = Math.max(0, restano);
    if (restano <= 0) {
      clearInterval(battito);
      ancoraQui = false;          // smetti di stare in ascolto: si va via
      window.location.href = 'home.html';
    }
  }, 1000);
}

function apriSchermataFine() {
  if (ONLINE) dimenticaIlTavolo();
  $('fineTit').textContent = S.winner === null ? 'Pareggio' : (S.winner === 0 ? 'Hai vinto!' : 'Hai perso');
  const motivi = { chiusura: 'Chiusura', chiusura_al_volo: 'Chiusura al volo', ko: 'KO: tutti i personaggi azzerati',
                   timeout: 'Tempo scaduto: vince chi ha più PV totali', mazzo_esaurito: 'Mazzo esaurito: vince chi ha più PV totali', pareggio: 'PV totali pari',
                   abbandono: S.winner === 0 ? 'L\'avversario ha abbandonato il tavolo' : 'Hai abbandonato il tavolo' };
  $('fineTxt').textContent = motivi[S.winReason] || S.winReason || '';
  SUONI.fine(S.winner === 0);
  $('finePartita').classList.add('mostra');
  contoAllaRovescia();
}

// ============================================================
// LA RETE
//
// Se nell'indirizzo (dopo il cancelletto) ci sono codice e segreto,
// questo tavolo non possiede più la partita: la chiede al server. Il
// disegno resta identico, cambia solo da dove arriva lo stato.
//
// IL TRUCCO CHE TIENE TUTTO IN PIEDI
// Il tavolo è scritto dando per scontato che players[0] sia sempre "io"
// e players[1] "l'avversario". Il server invece parla di giocatore 0 e
// giocatore 1 in assoluto. Allora la vista si ribalta all'ingresso: chi
// gioca come secondo si ritrova comunque sé stesso in posizione 0, e
// nessuna riga del disegno ha dovuto cambiare.
// ============================================================
const RETE = (function () {
  // Le credenziali stanno nel frammento, dopo il cancelletto: quella
  // parte dell'indirizzo il browser non la manda a nessun server.
  const p = new URLSearchParams(location.hash.slice(1));
  let codice = p.get('codice'), segreto = p.get('segreto'), chi = p.get('giocatore');

  // SE L'INDIRIZZO NON CE LE HA, SI GUARDA NEL BROWSER.
  // Serve a chi cade: chiude la scheda per sbaglio, va via la rete, si
  // spegne il telefono. Senza questo, l'indirizzo lungo col cancelletto
  // se ne andrebbe con la scheda e non ci sarebbe modo di rientrare in
  // una partita già cominciata.
  if (!codice || !segreto) {
    try {
      const messoDaParte = JSON.parse(localStorage.getItem('bb_tavolo') || 'null');
      if (messoDaParte && messoDaParte.codice && messoDaParte.segreto) {
        codice = messoDaParte.codice;
        segreto = messoDaParte.segreto;
        chi = String(messoDaParte.giocatore);
      }
    } catch (e) {}
  }
  if (!codice || !segreto) return null;

  // e si rimettono da parte, così valgono anche per la prossima volta
  try {
    localStorage.setItem('bb_tavolo', JSON.stringify({
      codice, segreto, giocatore: chi === '1' ? 1 : 0, quando: Date.now()
    }));
  } catch (e) {}

  return { codice, segreto, io: chi === '1' ? 1 : 0, versione: -1, nomi: [null, null] };
})();

// Quando la partita è finita — o il tavolo non c'è più — le credenziali
// si buttano: rientrare in una partita conclusa non serve a nessuno, e
// lasciarle in giro farebbe riaprire un tavolo morto a ogni visita.
function dimenticaIlTavolo() {
  try { localStorage.removeItem('bb_tavolo'); } catch (e) {}
}
const ONLINE = RETE !== null;

// una carta che non si può vedere: il disegno le mostra a faccia in giù
function cartaCoperta(prefisso, i) {
  return { id: prefisso + i, suit: null, value: 0, isJolly: false, isPinella: false, coperta: true };
}

function giocatoreDaVista(g, mio, prefisso) {
  return {
    hand: mio ? g.mano : Array.from({ length: g.manoQuante }, (_, i) => cartaCoperta(prefisso + 'h', i)),
    pozzetto: Array.from({ length: g.pozzettoQuante }, (_, i) => cartaCoperta(prefisso + 'p', i)),
    pozzettoTaken: g.pozzettoPreso,
    melds: g.calate,
    characters: g.personaggi,
    clockSecondsLeft: g.secondiRimasti,
    hasDrawnThisTurn: g.haPescato,
    abilitaUsate: g.abilitaUsate || [],
    puntiMagia: g.puntiMagia,
    magic: g.magia ? {
      selection: g.magia.selezione || [],
      // quali posti sono spesi. Del mio lato arriva l'elenco; di quello
      // avversario arriva solo il numero, e la selezione è coperta.
      consumate: g.magia.consumate || [],
      consumateQuante: g.magia.consumateQuante || 0,
      trappoleArmate: g.magia.trappoleArmate || Array.from({ length: g.magia.trappoleArmateQuante || 0 }, () => ({ coperta: true })),
      giocateQuestoTurno: g.magia.giocateQuestoTurno,
      giocate: g.magia.giocate || [],
      effettiAttivi: g.magia.effettiAttivi || [],
      quanteCoperte: g.magia.selezioneQuante || 0
    } : null,
    effettiSubiti: g.effettiSubiti || []
  };
}

function statoDaVista(v) {
  const io = v.io, avv = io === 0 ? 1 : 0;
  return {
    status: v.stato,
    // anche il vincitore si ribalta: qui 0 vuol dire sempre "io"
    winner: v.vincitore === null || v.vincitore === undefined ? null : (v.vincitore === io ? 0 : 1),
    winReason: v.motivo,
    tallone: Array.from({ length: v.talloneQuante }, (_, i) => cartaCoperta('t', i)),
    scarti: v.scarti,
    players: [giocatoreDaVista(v.giocatori[io], true, 'mia'),
              giocatoreDaVista(v.giocatori[avv], false, 'avv')],
    currentPlayerIndex: v.eIlMioTurno ? 0 : 1,
    // Questo mancava, ed e' il motivo per cui il conto alla rovescia dei
    // trenta secondi non si vedeva IN RETE. Contro il bot lo stato E' la
    // partita, quindi il campo c'era; in rete lo stato viene ricostruito
    // qui dalla vista, e un campo non copiato semplicemente non esiste.
    // La regola intanto funzionava lo stesso — la fa rispettare il
    // server — quindi il gioco ti bloccava senza mai dirti quanto
    // mancava: il modo peggiore di avere ragione.
    iniziaAlle: v.iniziaAlle || null,
    // IL SORTEGGIO SI RIBALTA COME IL VINCITORE.
    // Arriva dal server con gli indici del server; qui dentro 0 vuol
    // dire sempre "io", quindi vanno girati sia chi ha vinto sia
    // l'ordine delle due carte — altrimenti i due schermi mostrerebbero
    // la stessa pescata attribuita alla persona sbagliata.
    sorteggio: v.sorteggio ? {
      carte: [v.sorteggio.carte[io], v.sorteggio.carte[avv]],
      vincitore: v.sorteggio.vincitore === io ? 0 : 1,
      pareggi: (v.sorteggio.pareggi || []).map((coppia) => [coppia[io], coppia[avv]]),
      imposto: !!v.sorteggio.imposto
    } : null,
    turnStartedAt: v.turnoIniziatoAlle,
    lastMoveAt: v.ultimaMossaAlle,
    moveCounter: v.numeroMossa,
    // lo scarto fra l'orologio del server e quello di questo computer:
    // i timer devono contare sul tempo dell'arbitro, non sul nostro
    scartoOrologio: Date.parse(v.adesso) - Date.now()
  };
}

let scartoOrologio = 0;
const adessoVero = () => Date.now() + scartoOrologio;

function accettaVista(risposta) {
  if (!risposta || !risposta.vista) return;
  const primaVolta = S === null;
  const turnoPrima = S ? S.currentPlayerIndex : null;
  const manoPrima = S ? S.players[0].hand.map((c) => c.id) : [];
  // CHI SONO LO DICE IL SERVER.
  // Prima veniva preso dall'indirizzo (?giocatore=0 o 1). Se quel
  // numero e' sbagliato o manca, il tavolo si disegna lo stesso — la
  // vista dice gia' chi e' chi — ma tutto quello che confronta "sono
  // stato io?" sbaglia in silenzio: chi subisce un colpo lo scambia per
  // uno suo e non mostra nessuna animazione. La vista porta la risposta
  // giusta a ogni aggiornamento: si usa quella.
  if (typeof risposta.vista.io === 'number') RETE.io = risposta.vista.io;
  S = statoDaVista(risposta.vista);
  scartoOrologio = S.scartoOrologio;
  magie = [S.players[0].magic, S.players[1].magic];
  if (risposta.nomi) RETE.nomi = risposta.nomi;
  if (typeof risposta.versione === 'number') RETE.versione = risposta.versione;

  // le carte appena arrivate vanno in coda alla mano, come in locale
  // LE CARTE APPENA ARRIVATE VANNO IN CODA, ANCHE IN RETE.
  // Qui prima si filtrava soltanto, non si aggiungeva mai niente: la
  // coda funzionava contro il bot e non in rete. La carta pescata
  // finiva mescolata fra le altre in ordine di valore, e dopo una
  // pescata — peggio ancora dopo aver raccolto il monte scarti — non si
  // capiva più che cosa fosse appena entrato in mano.
  if (!primaVolta) {
    const arrivate = S.players[0].hand.filter((c) => !manoPrima.includes(c.id)).map((c) => c.id);
    if (arrivate.length) carteNuove = [...carteNuove, ...arrivate];
  }
  carteNuove = carteNuove.filter((id) => S.players[0].hand.some((c) => c.id === id));
  selezione.clear();
  disegna();
  // in rete lo stato arriva dal server: il sorteggio si può mostrare
  // solo adesso, quando la prima vista è finalmente qui (la funzione si
  // protegge da sola dal ripetersi a ogni aggiornamento)
  mostraSorteggio();
  return { primaVolta, turnoPrima };
}

// Racconta a chi ha subito la mossa che cosa è appena successo: senza,
// i punti vita calerebbero e basta.
function raccontaLaMossaDellAltro(esito) {
  if (!esito || esito.giocatore === RETE.io) return;
  const nome = RETE.nomi[esito.giocatore] || 'L\'avversario';
  if (esito.tipo === 'tempo_scaduto') { avviso('Tempo scaduto per ' + nome + '.'); return; }
  if (esito.pozzettoPreso) avviso(nome + ' ha preso il pozzetto!');
  if (esito.dannoAnnullato) avviso('Una tua Trappola ha annullato il danno!');
  if (esito.dannoRaddoppiato) avviso('Danno raddoppiato!');
  // le trappole scattate arrivano con il loro nome: chi le subisce (o
  // chi se le vede scattare a favore) deve vedere QUALE carta era
  const attesa = segnalaTrappole(esito, 1);
  if (esito.danno) {
    // L'elenco dei colpi arriva dal server: senza, qui non si sapeva
    // QUALI personaggi erano stati colpiti e non si animava niente.
    const colpo = {
      damage: esito.danno, ondata: esito.ondata, colpi: esito.colpi,
      abilita: esito.tipo === 'abilita',
      semeAttaccante: esito.semeAttaccante, semeBersaglio: esito.semeBersaglio
    };
    setTimeout(() => { mostraResoconto(colpo, 1); lampeggiaColpiti('battleGiocatore', colpo); }, attesa);
  }
  mostraRiflesso(esito, 1, attesa + 700);
  // gli effetti non-danno dell'avversario: se non si vedessero, i suoi
  // scudi e i suoi malus arriverebbero senza spiegazione
  mostraEffetti(esito, 1, attesa + (esito.danno ? 1300 : 300));
  if (!esito.danno) setTimeout(() => mostraResoconto(esito, 1), attesa + 300);
}

async function eseguiInRete(azione) {
  let r;
  try {
    const risposta = await fetch('/api/mossa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice: RETE.codice, segreto: RETE.segreto, azione })
    });
    r = await risposta.json();
  } catch (e) {
    avviso('Il server non risponde. La mossa non è passata.');
    return { ok: false, motivo: 'Il server non risponde.' };
  }
  if (!r.ok) { avviso(r.motivo || 'Mossa non valida.'); return r; }
  SUONI.perAzione(azione && azione.tipo);

  // il server rimanda la vista aggiornata: si ridisegna da quella
  if (r.vista) { accettaVista({ vista: r.vista, versione: r.versione, nomi: RETE.nomi }); }
  if (r.pozzettoPreso) { SUONI.pozzetto(); avviso('Hai preso il pozzetto!'); }
  // In rete le trappole non venivano mostrate affatto: si vedeva calare
  // la vita e basta. Adesso passano di qui come in locale.
  const attesa = segnalaTrappole(r, 0);
  if (r.dannoAnnullato) avviso('Una Trappola ha annullato il tuo danno!');
  if (r.dannoRaddoppiato) avviso('Danno raddoppiato!');
  if (r.damage) setTimeout(() => { mostraResoconto(r, 0); lampeggiaColpiti('battleAvversario', r); }, attesa);
  mostraRiflesso(r, 0, attesa + 700);
  mostraEffetti(r, 0, attesa + (r.damage ? 1300 : 300));
  if (!r.damage) setTimeout(() => mostraResoconto(r, 0), attesa + 300);
  if (S.status !== 'in_progress') mostraFine();
  return r;
}

// Se l'avversario è caduto, meglio dirlo. Aspettare una mossa che non
// arriverà mai credendo che stia pensando è la cosa più frustrante che
// possa capitare — e il minuto scade lo stesso, quindi non è nemmeno
// una notizia inutile.
let avvisatoCheECaduto = false;
function guardaSeCEAncora(r) {
  const fermo = r.avversarioVistoSecondiFa;
  if (typeof fermo !== 'number') return;
  if (fermo > 45 && !avvisatoCheECaduto) {
    avvisatoCheECaduto = true;
    const nome = RETE.nomi[RETE.io === 0 ? 1 : 0] || 'L\'avversario';
    avviso(nome + ' non risponde da ' + fermo + ' secondi. Il suo turno scadrà da solo.');
  } else if (fermo <= 20 && avvisatoCheECaduto) {
    avvisatoCheECaduto = false;
    const nome = RETE.nomi[RETE.io === 0 ? 1 : 0] || 'L\'avversario';
    avviso(nome + ' è tornato.');
  }
}

// Sta in ascolto: una domanda sola, tenuta appesa dal server, che torna
// nell'istante in cui l'altro muove. Se cade, si riprova.
// Quando la pagina se ne va, l'ascolto deve smettere. Sembra ovvio, e
// in un browser vero chiudere la scheda spegne tutto — ma la richiesta
// tenuta appesa può tornare mentre la pagina sta già morendo, e allora
// si prova a disegnare su un documento che non c'è più. Meglio una
// bandierina e un controllo in mezzo al giro.
let ancoraQui = true;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { ancoraQui = false; });
  window.addEventListener('beforeunload', () => { ancoraQui = false; });
}
const laPaginaCEAncora = () => ancoraQui && typeof document !== 'undefined' && !!document.documentElement;

async function ascolta() {
  while (ONLINE && laPaginaCEAncora()) {
    let r;
    try {
      const risposta = await fetch('/api/stato?codice=' + encodeURIComponent(RETE.codice) +
        '&segreto=' + encodeURIComponent(RETE.segreto) + '&da=' + RETE.versione);
      r = await risposta.json();
    } catch (e) {
      await new Promise((ok) => setTimeout(ok, 2000));
      continue;
    }
    if (!laPaginaCEAncora()) return;                 // la pagina se n'è andata mentre aspettavo
    if (!r.ok) { avviso(r.motivo || 'Il tavolo non c\'è più.'); return; }
    guardaSeCEAncora(r);
    if (r.versione === RETE.versione) continue;      // solo il tempo scaduto dell'attesa
    const esito = r.ultimoEsito;
    const eraMioTurno = S ? S.currentPlayerIndex === 0 : false;
    accettaVista(r);
    if (!eraMioTurno && S && S.currentPlayerIndex === 0 && S.status === 'in_progress') SUONI.tuoTurno();
    raccontaLaMossaDellAltro(esito);
    if (S && S.status !== 'in_progress') { mostraFine(); return; }
  }
}

// ------------------------------------------------------------
// AZIONI
// ------------------------------------------------------------
// In rete la mossa non si esegue qui: si CHIEDE. Il server decide, e
// quello che torna indietro è già la nuova verità. Il resto della
// funzione — le carte nuove in coda alla mano, gli avvisi, le
// animazioni — resta identico, perché l'esito ha la stessa forma.
async function esegui(azione, fn) {
  // Contro il bot le azioni non passano da applica(), quindi il divieto
  // di giocare durante lo studio va ripetuto qui. In rete lo dice il
  // server e questo e' solo cortesia: si evita un viaggio inutile e si
  // risponde subito.
  const attesa = secondiDiStudioRimasti();
  if (attesa > 0) {
    avviso('Si comincia fra ' + attesa + ' second' + (attesa === 1 ? 'o' : 'i') + ': per ora guarda il tavolo.');
    return { ok: false, reason: 'studio' };
  }
  if (animazioneAvversarioInCorso) {
    avviso('Aspetta: l\'avversario sta ancora giocando.');
    return { ok: false, reason: 'avversario-in-scena' };
  }
  if (ONLINE) return eseguiInRete(azione);
  const chiAgisce = S.currentPlayerIndex;
  const turnoPrima = S.currentPlayerIndex;
  const manoPrima = S.players[0].hand.map((c) => c.id);
  const r = fn();
  // le carte arrivate con questa mossa vanno in coda alla mano
  if (chiAgisce === 0) {
    const arrivate = S.players[0].hand.filter((c) => !manoPrima.includes(c.id)).map((c) => c.id);
    if (arrivate.length) carteNuove = [...carteNuove.filter((id) => S.players[0].hand.some((c) => c.id === id)), ...arrivate];
    // le carte giocate spariscono anche dall'elenco delle "nuove"
    carteNuove = carteNuove.filter((id) => S.players[0].hand.some((c) => c.id === id));
  }
  if (!r.ok) { avviso(r.reason || 'Mossa non valida.'); return r; }
  SUONI.perAzione(azione && azione.tipo);
  if (r.pozzettoPreso) { SUONI.pozzetto(); avviso('Hai preso il pozzetto!'); }
  // PRIMA LA CARTA, POI QUELLO CHE FA. Se le due cose partono insieme si
  // guardano tutte e due a metà e non se ne capisce nessuna.
  const attesaTrappole = segnalaTrappole(r, chiAgisce);
  if (r.dannoAnnullato) avviso('Una Trappola ha annullato il tuo danno!');
  if (r.dannoRaddoppiato) avviso('Danno raddoppiato!');
  if (r.damage) setTimeout(() => mostraResoconto(r, chiAgisce), attesaTrappole);
  else setTimeout(() => mostraResoconto(r, chiAgisce), attesaTrappole + 300);
  mostraRiflesso(r, chiAgisce, attesaTrappole + 700);
  selezione.clear();
  // se il turno è passato, il nuovo giocatore torna a poter usare una magia
  if (S.currentPlayerIndex !== turnoPrima) resetTurnoMagie(magie[S.currentPlayerIndex]);
  ultimoAgente = chiAgisce;
  disegna();
  if (r.damage) setTimeout(() => lampeggiaColpiti(chiAgisce === 0 ? 'battleAvversario' : 'battleGiocatore', r), attesaTrappole);
  // DOPO il colpo, non insieme: il danno e gli effetti raccontano due
  // cose diverse e sovrapposte non si leggono ne' l'una ne' l'altra.
  mostraEffetti(r, chiAgisce, attesaTrappole + (r.damage ? 1300 : 300));
  // passato il turno, tocca al bot
  if (S.currentPlayerIndex === 1 && S.status === 'in_progress') setTimeout(turnoBot, 900);
  // l'esito torna a chi ha chiamato: abilità e carte magiche hanno da
  // raccontare cose loro (il costo pagato, quali PV sono cambiati) e
  // devono poterlo fare senza scavalcare questa funzione.
  return r;
}

// ------------------------------------------------------------
// IL BOT GIOCA IL SUO TURNO
// Il motore risolve il turno tutto insieme; qui lo si mostra a pezzi, con
// una pausa fra una mossa e l'altra, altrimenti si vedrebbe solo il
// risultato finale e non si capirebbe cosa ha fatto l'avversario.
// ------------------------------------------------------------
function turnoBot() {
  if (ONLINE) return;                     // dall'altra parte c'è una persona
  if (S.status !== 'in_progress' || S.currentPlayerIndex !== 1) return;
  avviso('L\'avversario sta giocando…');
  ultimoAgente = 1;
  animazioneAvversarioInCorso = true;
  const mosse = botGiocaTurno(S, 1, Date.now());
  disegna();

  let i = 0;
  const passo = () => {
    if (i >= mosse.length) {
      animazioneAvversarioInCorso = false;
      if (S.status === 'in_progress') { resetTurnoMagie(magie[0]); avviso('Tocca a te.'); }
      disegna();
      return;
    }
    const m = mosse[i++];
    if (m.tipo === 'pesca')  avviso('L\'avversario pesca ' + m.quante + ' carte.');
    if (m.tipo === 'monte')  avviso('L\'avversario raccoglie il monte scarti.');
    if (m.tipo === 'cala')     avviso('L\'avversario cala ' + m.carte + ' carte' + (m.pozzetto ? ' e prende il pozzetto!' : '') + '.');
    if (m.tipo === 'aggancia') avviso('L\'avversario aggancia una carta a un suo gioco.');
    if (m.tipo === 'abilita')  avviso('L\'avversario usa l\'abilità speciale di ' + testo(S.players[1].characters[m.semeAttaccante].cardId).nome + '!');
    // Una Carta Magica dell'avversario si deve capire: le Trappole
    // soprattutto, che restano sul campo e scatteranno dopo — vederla
    // arrivare adesso è l'unico avviso che si ha.
    if (m.tipo === 'magia')    avviso('L\'avversario gioca una Carta Magica: ' + testo(m.carta.id).nome + (m.magiaTipo === 'trappola' ? ' (Trappola)' : '') + '!');
    if (m.tipo === 'scarta')   avviso('L\'avversario scarta.');

    // PRIMA si ridisegna il tavolo, POI parte l'animazione del colpo.
    // Invertendo l'ordine il ridisegno buttava via le carte appena
    // animate e il colpo restava invisibile.
    disegna();
    const suo = { colpi: m.colpi, damage: m.danno, abilita: m.tipo === 'abilita',
                  effettiAbilita: m.effettiAbilita || [] };
    if (m.danno) {
      mostraResoconto(suo, 1);
      lampeggiaColpiti('battleGiocatore', { colpi: m.colpi });
    } else if (suo.effettiAbilita.length) {
      setTimeout(() => mostraResoconto(suo, 1), 200);
    }
    mostraEffetti(suo, 1, m.danno ? 1300 : 250);
    // con un colpo a schermo si aspetta di più: c'è da guardarlo. E se
    // l'abilità ha fatto solo effetti, servono comunque i secondi per
    // vederli passare.
    const conEffetti = suo.effettiAbilita.length > 0;
    setTimeout(passo, m.danno ? 2600 : (conEffetti ? 2400 : 850));
  };
  passo();
}

// ------------------------------------------------------------
// RESOCONTO DEL DANNO — chi ha subito quanto, per nome.
// Prima si leggeva solo il totale ("Danno inflitto: 40"), senza sapere
// quale personaggio l'avesse incassato.
// ------------------------------------------------------------
// Quando una Trappola scatta lo si deve capire: fino a ieri non
// succedeva proprio nulla, quindi ora si annuncia a chiare lettere.
function segnalaTrappole(r, chiAgisce) {
  const scattate = r.trappoleScattate || [];
  if (!scattate.length) return 0;
  const mia = chiAgisce !== 0;      // la trappola è di chi NON ha appena agito

  // Quanto dura tutto lo spettacolo. Serve a chi chiama: il danno sulle
  // carte bersaglio non deve partire mentre la carta è ancora a mezzo
  // schermo, se no si guardano due cose insieme e non se ne vede
  // nessuna. Prima si vede LA CARTA, poi si vede COSA FA.
  const durataUna = 2800;
  const totale = (scattate.length - 1) * 3000 + durataUna;
  segnaAnimazione(totale + 900);

  scattate.forEach((t, i) => {
    const info = (t.cardId && dati.i18n[t.cardId]) || { nome: 'Trappola', descrizione: '' };
    setTimeout(() => {
      // scattando la trappola si rivela: ora si vede quale era
      apriCartaMagica({
        tipo: 'trappola',
        chi: mia ? 'La tua Trappola scatta!' : 'Trappola avversaria!',
        nome: info.nome, descrizione: info.descrizione,
        esito: 'Era nascosta fino a ora',
        durata: durataUna
      });
      avviso('È scattata una Trappola ' + (mia ? 'tua' : 'dell\'avversario') + ': ' + info.nome + '!');
    }, i * 3000);
  });
  return totale;
}

// ------------------------------------------------------------
// IL DANNO CHE TORNA INDIETRO
// Lo Specchio di Ritorsione rimanda a chi ha colpito metà di quello che
// ha inflitto. Finora lo diceva solo una scritta di passaggio: si vedeva
// calare la propria vita senza capire da dove arrivasse. Ora il colpo si
// vede tornare, sulla carta giusta e col suo numero.
// ------------------------------------------------------------
function mostraRiflesso(r, chiAgisce, ritardo) {
  if (!r || !r.riflesso) return;
  // il rimbalzo colpisce chi ha attaccato: se ho attaccato io, colpisce me
  const striscia = chiAgisce === 0 ? 'battleGiocatore' : 'battleAvversario';
  segnaAnimazione((ritardo || 0) + 2200);
  setTimeout(() => {
    const el = $(striscia) && $(striscia).querySelector('.bcard[data-seme="' + r.riflesso.suit + '"]');
    if (!el) return;
    volaColpo(chiAgisce === 0 ? 'battleAvversario' : 'battleGiocatore', el, true, () => {
      const vivo = $(striscia).querySelector('.bcard[data-seme="' + r.riflesso.suit + '"]') || el;
      vivo.classList.remove('colpita');
      void vivo.offsetWidth;
      vivo.classList.add('colpita');
      setTimeout(() => vivo.classList.remove('colpita'), 1100);
      SUONI.danno(r.riflesso.damage);
      numeroDanno(vivo, r.riflesso.damage);
    });
  }, ritardo || 0);
}

// LE PAROLE PER QUELLO CHE NON E' DANNO.
// Le pastiglie che volano si vedono per un attimo; il resoconto resta li'
// qualche secondo e serve a rileggere con calma cos'e' successo. Prima
// elencava solo i colpi, quindi un'abilita' che non faceva danno non
// compariva affatto: sembrava non fosse successo niente.
function descriviEffetti(r, chiAgisce) {
  const esiti = [].concat(r.effettiAbilita || [], r.esiti || []);
  const righe = [];
  esiti.forEach((e) => {
    if (!e || e.applied === false || e.giaApplicato) return;
    const def = SEGNI_EFFETTO[e.effect];
    const cura = e.effect === 'cura_diretta' || e.effect === 'cura_percentuale';
    if (!def && !cura) return;               // il danno ha gia' le sue righe

    let riga;
    if (cura) {
      const tot = e.guarigione
        ? Object.keys(e.guarigione).reduce((a, s) => a + e.guarigione[s], 0)
        : Number(e.parametro || 0) * ((e.colpiti || []).length || 1);
      riga = '✚ curati <span class="num">' + Math.round(tot) + '</span> PV su ' + (e.colpiti || []).join(' ');
    } else if (def.suGiocatore) {
      const mio = (chiAgisce === 0) === (e.lato !== 'opponent');
      const q = e.tolti || e.dati || e.distrutte || e.parametro;
      riga = def.glifo + ' ' + def.parola + (q ? ' <span class="num">' + q + '</span>' : '') +
             ' · ' + (mio ? 'tu' : 'avversario');
    } else {
      const q = (def.segno || '') + e.parametro + (def.percento ? '%' : (def.suffisso || ''));
      riga = def.glifo + ' ' + def.parola + ' <span class="num">' + q + '</span> su ' + (e.colpiti || []).join(' ');
    }
    if (e.durata) riga += ' · per ' + e.durata + ' turn' + (e.durata === 1 ? 'o' : 'i');
    righe.push('<div class="riga" style="opacity:.92">' + riga + '</div>');
  });
  return righe.join('');
}

function mostraResoconto(r, chiAgisce) {
  const colpi = r.colpi || [];
  const testoEffetti = descriviEffetti(r, chiAgisce);
  if (!colpi.length && !testoEffetti) return;
  segnaAnimazione(2600);   // la fine partita aspetta che si sia visto
  const box = $('resoconto');
  const righe = colpi.map((c) => {
    const nome = c.cardId ? testo(c.cardId).nome : ('personaggio ' + c.suit);
    return '<div class="riga"><b>' + nome + '</b> (' + c.suit + ') subisce <span class="num">' +
           Math.round(c.damage) + '</span> danni · restano ' + Math.round(c.pvRimasti) + ' PV</div>';
  }).join('') + testoEffetti;
  const titolo = r.abilita
    ? (chiAgisce === 0 && r.semeAttaccante
        ? 'Abilità speciale — ' + testo(S.players[0].characters[r.semeAttaccante].cardId).nome
        : 'Abilità speciale avversaria')
    : (chiAgisce === 0 ? 'Il tuo attacco' : 'Attacco avversario');
  box.innerHTML = '<div class="titolo">' + titolo + '</div>' + righe +
    (r.jolly ? '<div class="riga" style="opacity:.85">colpo del <b>Jolly</b> (' + Math.round(r.jolly.damage) + ') scagliato dal tuo eroe di ' + r.jolly.semeAttaccante + '</div>' : '') +
    (r.ondata ? '<div class="riga" style="opacity:.85">ondata d\'urto: ' + Math.round(r.ondataPercent * 100) + '% su tutti e quattro</div>' : '');
  box.classList.add('mostra');
  clearTimeout(mostraResoconto._t);
  // 4,6s: un secondo in più rispetto a prima, per fare in tempo a leggere
  mostraResoconto._t = setTimeout(() => box.classList.remove('mostra'), 4600);
}

// La barra blu è il CONTATORE DI VELOCITÀ dell'abilità speciale: la
// riempie il motore, una fetta a ogni turno del proprietario, in base a
// `turniCarica` scritto sulla carta (abilità debole = pochi turni, forte =
// tanti). Quando è piena l'abilità scatta da sola e la barra riparte.
// Qui non c'è nulla da calcolare: si legge e basta.


// ============================================================
// I SUONI
//
// Da qui in poi la voce vera e' quella registrata (client/audio/*.mp3):
// piu' ricca di quanto un oscillatore possa fare. Ma la pagina deve
// restare in piedi anche SENZA quella cartella accanto — aperta col
// doppio clic da uno zip spacchettato a meta', o offline, o con un
// singolo file mp3 mancante — quindi ogni suono registrato ha ancora
// il suo equivalente generato al volo come rete di sicurezza: se il
// file non c'e' o non carica, si sente comunque qualcosa, mai silenzio.
// Il tonfo del danno, generato, cambia inoltre con QUANTO danno e' —
// una clip fissa non potrebbe mai farlo — quindi li' la voce registrata
// e quella dinamica suonano insieme, non una al posto dell'altra.
//
// I browser non lasciano suonare niente finche' l'utente non ha toccato
// la pagina — regola sacrosanta, se no i siti urlerebbero da soli. Il
// primo tocco sveglia l'audio, e da li' in poi funziona.
// ============================================================
const SUONI = (function () {
  // le clip registrate: create una sola volta, riusate ad ogni chiamata.
  // Se un file manca o non carica il fallimento arriva async (evento
  // 'error' o rifiuto della promise di play()): troppo tardi per far
  // scattare la voce generata ALLA PRIMA chiamata di quel suono, ma da
  // quella chiamata in poi 'ok' resta falso e si passa dritti al
  // generato, senza ritentare un file che si sa gia' rotto.
  const clip = {};
  function suonaClip(nome, volume) {
    if (!acceso) return false;
    let el = clip[nome];
    if (!el) {
      el = new Audio('audio/' + nome + '.mp3');
      el.preload = 'auto';
      el._ok = true;
      el.addEventListener('error', () => { el._ok = false; });
      clip[nome] = el;
    }
    if (!el._ok) return false;
    try {
      el.currentTime = 0;
      el.volume = volume === undefined ? 1 : volume;
      const p = el.play();
      if (p && p.catch) p.catch(() => { el._ok = false; });
    } catch (e) { el._ok = false; return false; }
    return true;
  }
  let ctx = null, svegliato = false;
  let acceso = true;
  try { acceso = localStorage.getItem('bb_suoni') !== 'no'; } catch (e) {}

  function contesto() {
    if (ctx) return ctx;
    const A = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!A) return null;
    try { ctx = new A(); } catch (e) { return null; }
    return ctx;
  }

  // Il primo gesto dell'utente, qualunque sia, sveglia l'audio.
  function sveglia() {
    if (svegliato) return;
    svegliato = true;
    const c = contesto();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }
  if (typeof window !== 'undefined') {
    for (const evento of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(evento, sveglia, { once: false, passive: true });
    }
  }

  const fra = (a, b) => a + Math.random() * (b - a);

  // Una nota: parte da una frequenza e ci scivola su un'altra.
  function tono({ da, a, durata, tipo = 'sine', volume = 0.12, ritardo = 0 }) {
    const c = contesto();
    if (!c || !acceso) return;
    const t0 = c.currentTime + ritardo;
    const osc = c.createOscillator(), gua = c.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(da, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, a), t0 + durata);
    gua.gain.setValueAtTime(0.0001, t0);
    gua.gain.exponentialRampToValueAtTime(volume, t0 + Math.min(0.02, durata / 4));
    gua.gain.exponentialRampToValueAtTime(0.0001, t0 + durata);
    osc.connect(gua).connect(c.destination);
    osc.start(t0); osc.stop(t0 + durata + 0.02);
  }

  // Un soffio: rumore bianco fatto passare per un filtro che si muove.
  // E' quello che da' il fruscio della carta e il crepitio del colpo.
  function soffio({ durata, filtroDa, filtroA, volume = 0.1, q = 1, ritardo = 0 }) {
    const c = contesto();
    if (!c || !acceso) return;
    const t0 = c.currentTime + ritardo;
    const campioni = Math.max(1, Math.floor(c.sampleRate * durata));
    const buffer = c.createBuffer(1, campioni, c.sampleRate);
    const dati = buffer.getChannelData(0);
    for (let i = 0; i < campioni; i++) dati[i] = Math.random() * 2 - 1;
    const sorgente = c.createBufferSource();
    sorgente.buffer = buffer;
    const filtro = c.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = q;
    filtro.frequency.setValueAtTime(filtroDa, t0);
    filtro.frequency.exponentialRampToValueAtTime(Math.max(60, filtroA), t0 + durata);
    const gua = c.createGain();
    gua.gain.setValueAtTime(0.0001, t0);
    gua.gain.exponentialRampToValueAtTime(volume, t0 + durata * 0.15);
    gua.gain.exponentialRampToValueAtTime(0.0001, t0 + durata);
    sorgente.connect(filtro).connect(gua).connect(c.destination);
    sorgente.start(t0); sorgente.stop(t0 + durata + 0.02);
  }

  return {
    acceso: () => acceso,
    accendi(si) {
      acceso = !!si;
      try { localStorage.setItem('bb_suoni', acceso ? 'si' : 'no'); } catch (e) {}
      if (acceso) { sveglia(); this.pesca(); }
    },

    // carta che scivola via dal mazzo
    pesca() {
      if (suonaClip('pesca', 0.7)) return;
      soffio({ durata: 0.16, filtroDa: fra(900, 1200), filtroA: fra(2200, 3000), volume: 0.075, q: 0.8 });
    },

    // carta che atterra sul monte: fruscio piu' corto e un colpetto secco
    scarta() {
      if (suonaClip('scarta', 0.7)) return;
      soffio({ durata: 0.13, filtroDa: fra(1800, 2400), filtroA: fra(500, 700), volume: 0.07, q: 0.9 });
      tono({ da: 190, a: 90, durata: 0.09, tipo: 'triangle', volume: 0.055, ritardo: 0.05 });
    },

    // il monte scarti raccolto tutto insieme: molte carte, non una.
    // Resta sempre generato: e' l'unico caso di piu' carte in fila, e
    // nessuna delle clip registrate rende quella ripetizione.
    monte() {
      for (let i = 0; i < 5; i++) {
        soffio({ durata: 0.11, filtroDa: fra(800, 1600), filtroA: fra(1800, 2600), volume: 0.05, q: 0.8, ritardo: i * 0.045 });
      }
    },

    // le carte scendono in tavola: un accordo che sale
    cala() {
      if (suonaClip('cala', 0.7)) return;
      tono({ da: 300, a: 460, durata: 0.16, tipo: 'triangle', volume: 0.07 });
      tono({ da: 450, a: 690, durata: 0.2, tipo: 'sine', volume: 0.055, ritardo: 0.05 });
      soffio({ durata: 0.14, filtroDa: 1400, filtroA: 2600, volume: 0.05, q: 0.9 });
    },

    // il colpo che parte e attraversa il tavolo: resta generato, e'
    // solo il fruscio del volo, non l'impatto (quello e' danno() sotto)
    colpoParte(magico) {
      if (magico) {
        tono({ da: 700, a: 1500, durata: 0.26, tipo: 'sine', volume: 0.075 });
        tono({ da: 1050, a: 2250, durata: 0.26, tipo: 'sine', volume: 0.04, ritardo: 0.02 });
      } else {
        soffio({ durata: 0.3, filtroDa: 400, filtroA: 2000, volume: 0.085, q: 1.4 });
      }
    },

    // lo schianto sulla carta bersaglio: la clip registrata da' il corpo
    // dell'impatto, ma il tonfo generato resta ATTACCATO per i colpi
    // forti — e' l'unico modo in cui trenta danni e centoventi continuano
    // a non fare lo stesso rumore, cosa che una clip fissa non puo' dare.
    danno(quanto) {
      const forza = Math.max(0, Math.min(1, (Number(quanto) || 10) / 90));
      const claccata = suonaClip('colpo', 0.6);
      if (!claccata) {
        const grave = 130 - forza * 60;
        tono({ da: grave, a: grave * 0.45, durata: 0.16 + forza * 0.24, tipo: 'sine', volume: 0.11 + forza * 0.09 });
        soffio({ durata: 0.1 + forza * 0.1, filtroDa: 2600 - forza * 900, filtroA: 320, volume: 0.07 + forza * 0.06, q: 0.7 });
      }
      if (forza > 0.55) tono({ da: 70, a: 40, durata: 0.34, tipo: 'sine', volume: 0.1, ritardo: 0.03 });
    },

    // lo scudo che assorbe (la difesa sale) o si spacca (la difesa scende)
    scudoRegge() {
      if (suonaClip('scudo-regge', 0.65)) return;
      tono({ da: 700, a: 1100, durata: 0.22, tipo: 'sine', volume: 0.08 });
    },
    scudoRotto() {
      if (suonaClip('scudo-rotto', 0.65)) return;
      soffio({ durata: 0.18, filtroDa: 3200, filtroA: 600, volume: 0.08, q: 1.3 });
      tono({ da: 500, a: 200, durata: 0.2, tipo: 'triangle', volume: 0.07, ritardo: 0.03 });
    },

    // la cura che risana
    cura() {
      if (suonaClip('cura', 0.65)) return;
      [0, 0.09].forEach((r, i) => tono({ da: 520 + i * 160, a: 780 + i * 160, durata: 0.28, tipo: 'sine', volume: 0.07, ritardo: r }));
    },

    // la carta magica che si apre a mezzo schermo: sorpresa e trappola
    // hanno ciascuna la sua voce, non piu' la stessa intonata diverso
    magia(trappola) {
      const base = trappola ? 520 : 660;
      if (suonaClip(trappola ? 'trappola' : 'sorpresa', 0.65)) return;
      [0, 0.07, 0.14].forEach((r, i) => {
        tono({ da: base * (1 + i * 0.26), a: base * (1 + i * 0.26) * 1.5, durata: 0.5, tipo: 'sine', volume: 0.07, ritardo: r });
      });
      if (trappola) soffio({ durata: 0.22, filtroDa: 2800, filtroA: 700, volume: 0.06, q: 1.2, ritardo: 0.05 });
    },

    pozzetto() {
      [0, 0.11, 0.22, 0.36].forEach((r, i) => tono({ da: 520 + i * 180, a: 560 + i * 200, durata: 0.3, tipo: 'triangle', volume: 0.08, ritardo: r }));
    },

    fine(vinto) {
      if (suonaClip(vinto ? 'vittoria' : 'sconfitta', 0.75)) return;
      const note = vinto ? [523, 659, 784, 1047] : [523, 466, 392, 294];
      note.forEach((n, i) => tono({ da: n, a: n, durata: 0.5, tipo: vinto ? 'triangle' : 'sine', volume: 0.09, ritardo: i * 0.17 }));
    },

    // il proprio turno che comincia
    tuoTurno() {
      if (suonaClip('notifica', 0.6)) return;
      tono({ da: 660, a: 880, durata: 0.18, tipo: 'sine', volume: 0.06 });
    },

    // gli ultimi secondi del conto alla rovescia iniziale
    countdown() {
      if (suonaClip('countdown', 0.55)) return;
      tono({ da: 880, a: 660, durata: 0.12, tipo: 'square', volume: 0.05 });
    },

    // un bottone dell'interfaccia, generico: aprire le impostazioni,
    // ordinare la mano, confermare — non le azioni di gioco, che hanno
    // gia' la loro voce
    click() {
      if (suonaClip('click', 0.5)) return;
      tono({ da: 500, a: 380, durata: 0.05, tipo: 'triangle', volume: 0.045 });
    },

    perAzione(tipo) {
      if (tipo === 'pesca') this.pesca();
      else if (tipo === 'scarta') this.scarta();
      else if (tipo === 'prendi_scarti') this.monte();
      else if (tipo === 'cala' || tipo === 'aggancia') this.cala();
    }
  };
})();

// Ogni <button> vero dell'interfaccia (impostazioni, ordina la mano,
// accendi/spegni i suoni, abbandona, chiudi, usa la carta magica) fa lo
// stesso clic. Un solo ascoltatore per tutti, invece di scriverlo undici
// volte: se domani nasce un dodicesimo bottone, suona da solo.
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('button')) SUONI.click();
});

// ------------------------------------------------------------
// IL COLPO CHE ATTRAVERSA IL TAVOLO
// Parte dalla striscia di chi attacca, arriva sulla carta bersaglio e
// si schianta. Non cambia niente nei conti — il danno l'ha gia' deciso
// il motore — ma senza, il colpo che chiude la partita si vedeva solo
// come uno schermo che dice "hai perso".
// ------------------------------------------------------------
function volaColpo(idStrisciaPartenza, elBersaglio, magico, poiFai) {
  const partenza = $(idStrisciaPartenza);
  if (!partenza || !elBersaglio || !document.body) { if (poiFai) poiFai(); return; }
  const a = partenza.getBoundingClientRect();
  const b = elBersaglio.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
  const x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;

  SUONI.colpoParte(magico);
  const p = document.createElement('div');
  p.className = 'proiettile' + (magico ? ' magico' : '');
  p.innerHTML = '<div class="scia"></div>';
  const puntoPartenza = puntoFissoVisivo(x0, y0, 0);
  p.style.left = puntoPartenza.left + 'px';
  p.style.top = puntoPartenza.top + 'px';
  document.body.appendChild(p);

  const DURATA = 380;
  // Il tragitto e' un translate, non un punto fermo: sotto l'orizzontale
  // forzato uno spostamento locale appare ruotato sullo schermo esattamente
  // come un punto fermo — va corretto allo stesso modo, con l'altra meta'
  // dell'aiuto (spostamentoVisivo invece di puntoFissoVisivo).
  const meta = spostamentoVisivo((x1 - x0) * 0.5, (y1 - y0) * 0.5 - 46);
  const fine = spostamentoVisivo(x1 - x0, y1 - y0);
  // un arco, non una linea dritta: il colpo si vede partire e cadere
  const anim = p.animate([
    { transform: 'translate(0px, 0px) scale(0.6)' },
    { transform: 'translate(' + meta.dx + 'px, ' + meta.dy + 'px) scale(1.15)', offset: 0.55 },
    { transform: 'translate(' + fine.dx + 'px, ' + fine.dy + 'px) scale(0.85)' }
  ], { duration: DURATA, easing: 'cubic-bezier(0.3, 0, 0.7, 1)' });

  const schianta = () => {
    p.remove();
    const puntoImpatto = puntoFissoVisivo(x1, y1, 0);
    for (const classe of ['impatto', 'squarcio']) {
      const e = document.createElement('div');
      e.className = classe;
      e.style.left = puntoImpatto.left + 'px';
      e.style.top = puntoImpatto.top + 'px';
      document.body.appendChild(e);
      setTimeout(() => e.remove(), 800);
    }
    if (poiFai) poiFai();
  };
  if (anim && anim.finished) anim.finished.then(schianta).catch(schianta);
  else setTimeout(schianta, DURATA);
}

function lampeggiaColpiti(idStriscia, r) {
  segnaAnimazione(2600);
  const colpi = (r.colpi && r.colpi.length) ? r.colpi : null;
  // In ordine: l'elenco dei colpi, il danno diviso per seme, il seme
  // dell'attaccante, quello del bersaglio, e infine tutti e quattro se
  // era un colpo ad area. L'ultima spiaggia — "so che c'e' stato del
  // danno ma non so dove" — vale comunque piu' del niente: prima si
  // usciva in silenzio e il colpo subito non si vedeva affatto.
  const semi = colpi ? colpi.map((c) => c.suit)
             : (r.dannoPerSeme ? Object.keys(r.dannoPerSeme)
             : (r.suit ? [r.suit]
             : (r.semeBersaglio ? [r.semeBersaglio]
             : ((r.target === 'aoe' || r.damage) ? SEMI : []))));
  if (!semi.length) return;

  // Se a essere colpito sono io, tutto lo schermo lampeggia di rosso: un
  // colpo incassato non deve poter passare inosservato.
  if (idStriscia === 'battleGiocatore') setTimeout(lampoSchermo, 380);

  semi.forEach((s, i) => {
    // Il nodo va ricercato DENTRO il timer, non prima: fra un colpo e
    // l'altro il tavolo si ridisegna e la carta di prima non è più nella
    // pagina. Cercandola prima si finiva per animare un elemento staccato
    // — invisibile — ed era il motivo per cui i colpi del bot sulle mie
    // carte non si vedevano affatto.
    setTimeout(() => {
      const el = $(idStriscia).querySelector('.bcard[data-seme="' + s + '"]');
      if (!el) return;
      // da dove parte il colpo: dalla striscia OPPOSTA a quella colpita
      const daDove = idStriscia === 'battleGiocatore' ? 'battleAvversario' : 'battleGiocatore';
      volaColpo(daDove, el, !!r.abilita, () => {
        const vivo = $(idStriscia).querySelector('.bcard[data-seme="' + s + '"]') || el;
        vivo.classList.remove('colpita');
        void vivo.offsetWidth;
        vivo.classList.add('colpita');
        setTimeout(() => vivo.classList.remove('colpita'), 1100);
        const colpo = colpi ? colpi.find((c) => c.suit === s) : null;
        const quanto = colpo ? colpo.damage : (r.dannoPerSeme ? r.dannoPerSeme[s] : r.damage);
        if (quanto) { SUONI.danno(quanto); numeroDanno(vivo, quanto); }
      });
    }, i * 240);
  });
}

// Lampo rosso ai bordi dello schermo: "hai incassato".
function lampoSchermo() {
  const v = document.createElement('div');
  v.className = 'lampo-danno';
  document.body.appendChild(v);
  setTimeout(() => v.remove(), 700);
}

// ------------------------------------------------------------
// LA CARTA MAGICA SI APRE A SCHERMO
// Una sola funzione per tutte e tre le occasioni: Sorpresa giocata,
// Trappola posata, Trappola che scatta. La carta arriva ruotando, si
// pianta al centro con un colpo e delle scintille, resta ferma il tempo
// di leggerla e se ne va.
// ------------------------------------------------------------
function apriCartaMagica({ tipo, chi, nome, descrizione, esito, costo, durata = 3400 }) {
  const ov = $('sorpresaOverlay');
  const sorpresa = (tipo === 'sorpresa');
  SUONI.magia(!sorpresa);
  const simbolo = sorpresa ? '✦' : '⚡';

  ov.classList.toggle('trappola', !sorpresa);
  $('sorpresaCarta').setAttribute('data-simbolo', simbolo);
  $('sorpresaSigillo').textContent = simbolo;
  $('sorpresaChi').textContent = chi || (sorpresa ? 'Carta Sorpresa' : 'Carta Trappola');
  $('sorpresaTit').textContent = nome || '';
  $('sorpresaTxt').textContent = descrizione || '';
  $('sorpresaEsito').textContent = esito || '';
  $('sorpresaCosto').textContent = (costo === undefined || costo === null) ? '' : costo;
  $('sorpresaCosto').style.display = (costo === undefined || costo === null) ? 'none' : 'flex';

  // scintille che schizzano via dal punto d'atterraggio, tutte diverse
  ov.querySelectorAll('.scintilla').forEach((s) => s.remove());
  for (let i = 0; i < 18; i++) {
    const ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
    const dist = 18 + Math.random() * 26;
    const s = document.createElement('div');
    s.className = 'scintilla';
    s.style.setProperty('--sx', (Math.cos(ang) * dist).toFixed(1) + 'vh');
    s.style.setProperty('--sy', (Math.sin(ang) * dist).toFixed(1) + 'vh');
    ov.appendChild(s);
  }

  ov.classList.remove('mostra');
  void ov.offsetWidth;              // fa ripartire l'animazione da capo
  ov.classList.add('mostra');
  clearTimeout(apriCartaMagica._t);
  apriCartaMagica._t = setTimeout(() => ov.classList.remove('mostra'), durata);
}

// ============================================================
// LA CARTA INGRANDITA
// Si apre toccando una carta del tavolo. Mostra la carta grande, con la
// cornice, e sotto il bottone per usarla — se e' una carta che si puo'
// usare adesso. Il perche' del bottone e non del tocco diretto: una
// Carta Magica giocata e' spesa per sempre, e prima bastava un dito
// storto per buttarla via.
// ============================================================
function chiudiCartaGrande() {
  $('veloCarta').classList.remove('mostra');
}

// `azione` = { etichetta, fai } oppure niente, se la carta non si puo'
// usare in questo momento. `nota` spiega PERCHE' non si puo': un bottone
// che manca senza spiegazione sembra un guasto.
function apriCartaGrande(carta, testi, opzioni) {
  const o = opzioni || {};
  $('cartaGrandeDentro').innerHTML = cartaIllustrata(carta, testi, { stelle: o.stelle || '' });
  $('notaCarta').textContent = o.nota || '';
  const bottoni = [];
  if (o.azione) {
    bottoni.push('<button class="usa" id="bottoneUsaCarta">' + o.azione.etichetta + '</button>');
  }
  bottoni.push('<button id="bottoneChiudiCarta">Chiudi</button>');
  $('bottoniCarta').innerHTML = bottoni.join('');
  if (o.azione) {
    $('bottoneUsaCarta').onclick = (e) => {
      e.stopPropagation();
      chiudiCartaGrande();
      o.azione.fai();
    };
  }
  $('bottoneChiudiCarta').onclick = (e) => { e.stopPropagation(); chiudiCartaGrande(); };
  $('veloCarta').classList.add('mostra');
}

// ------------------------------------------------------------
// IL LAMPO DORATO DELLA CARTA MAGICA
// Parte da un punto (dove stava la carta magica) e arriva su una carta
// bersaglio. Se i bersagli sono piu' d'uno partono piu' lampi, sfalsati
// di un soffio: un ventaglio di scariche invece di un colpo solo.
// ------------------------------------------------------------
function spezzata(x0, y0, x1, y1, quanti) {
  // I punti stanno sulla linea fra partenza e arrivo, ma scostati di
  // lato a caso: e' quello che rende un fulmine un fulmine invece di
  // una freccia. Lo scostamento e' massimo a meta' strada e nullo agli
  // estremi, altrimenti il lampo non toccherebbe ne' la carta di
  // partenza ne' quella di arrivo.
  const dx = x1 - x0, dy = y1 - y0;
  const lunghezza = Math.hypot(dx, dy) || 1;
  const nx = -dy / lunghezza, ny = dx / lunghezza;   // perpendicolare
  const ampiezza = Math.min(34, lunghezza * 0.16);
  let d = 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1);
  for (let i = 1; i < quanti; i++) {
    const t = i / quanti;
    const smorza = Math.sin(t * Math.PI);           // 0 ai capi, 1 a meta'
    const scarto = (Math.random() * 2 - 1) * ampiezza * smorza;
    d += ' L' + (x0 + dx * t + nx * scarto).toFixed(1) +
         ' ' + (y0 + dy * t + ny * scarto).toFixed(1);
  }
  return d + ' L' + x1.toFixed(1) + ' ' + y1.toFixed(1);
}

function lampoMagico(daVisivo, aElemento, ritardo) {
  if (!aElemento || !aElemento.isConnected) return;
  const r = aElemento.getBoundingClientRect();
  // le coordinate si convertono come per ogni altro strato "fisso":
  // sotto l'orizzontale forzato il riferimento non e' lo schermo vero
  const p0 = puntoFissoVisivo(daVisivo.x, daVisivo.y, 0);
  const p1 = puntoFissoVisivo(r.left + r.width / 2, r.top + r.height / 2, 0);

  segnaAnimazione((ritardo || 0) + 900);
  setTimeout(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'lampo-magico');
    document.body.appendChild(svg);

    const d = spezzata(p0.left, p0.top, p1.left, p1.top, 9);
    // la lunghezza del tratteggio dev'essere almeno quanto il percorso,
    // o il lampo si "disegnerebbe" solo a meta'
    const lung = Math.hypot(p1.left - p0.left, p1.top - p0.top) * 1.6;
    for (const classe of ['alone', 'oro', 'nucleo']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', classe);
      path.setAttribute('d', d);
      path.style.setProperty('--lung', lung.toFixed(0));
      svg.appendChild(path);
    }
    setTimeout(() => svg.remove(), 700);

    const botto = document.createElement('div');
    botto.className = 'lampo-botto';
    botto.style.left = p1.left + 'px';
    botto.style.top = p1.top + 'px';
    document.body.appendChild(botto);
    setTimeout(() => botto.remove(), 900);
  }, ritardo || 0);
}

// Tutti i lampi di una carta magica: dal centro dello schermo (dove la
// carta si e' appena mostrata) verso ogni bersaglio.
function lampiSuBersagli(bersagli) {
  if (!bersagli || !bersagli.length) return;
  SUONI.colpoParte(true);
  const partenza = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  bersagli.forEach((b, i) => {
    const el = $(b.striscia) && $(b.striscia).querySelector('.bcard[data-seme="' + b.seme + '"]');
    lampoMagico(partenza, el, i * 110);
  });
}

// ------------------------------------------------------------
// NUMERO DEL DANNO CHE SALE DALLA CARTA
// Vedere la barra della vita accorciarsi non dice DI QUANTO: il numero
// che parte dalla carta colpita lo dice subito. Verde e col segno più se
// invece sono PV recuperati.
// ------------------------------------------------------------
function numeroDanno(cardEl, valore) {
  const r = cardEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const cura = valore < 0;
  const n = Math.round(Math.abs(valore));
  if (n === 0) return;

  const onda = document.createElement('div');
  onda.className = 'dmg-onda';
  // centrato con translate(-50%,-50%) in CSS: un punto solo, nessuna
  // larghezza da compensare — la correzione dell'orizzontale forzato
  // vale anche qui, senza il terzo argomento.
  const puntoOnda = puntoFissoVisivo(cx, cy, 0);
  onda.style.left = puntoOnda.left + 'px';
  onda.style.top = puntoOnda.top + 'px';
  if (cura) onda.style.borderColor = 'rgba(107,240,165,0.9)';
  document.body.appendChild(onda);
  setTimeout(() => onda.remove(), 700);

  // DA CHE PARTE MANDARLO.
  // Il numero saliva sempre. Sulle carte dell'avversario, che stanno in
  // cima allo schermo, saliva fuori dalla finestra e si vedeva tagliato a
  // meta': proprio il colpo subito, quello che interessa di piu'.
  // Se la carta e' nella meta' alta il numero scende, se e' nella meta'
  // bassa sale: in tutti e due i casi va verso il centro del tavolo.
  const altezza = (typeof window !== 'undefined' && window.innerHeight) || 800;
  const larghezza = (typeof window !== 'undefined' && window.innerWidth) || 1200;
  const versoGiu = cy < altezza * 0.45;

  const el = document.createElement('div');
  el.className = 'dmg-float ' + (cura ? 'cura' : 'danno') + (n >= 40 ? ' grosso' : '') +
                 (versoGiu ? ' verso-giu' : '');
  el.textContent = (cura ? '+' : '−') + n;
  // e nemmeno di lato: sui semi ai bordi il numero usciva dalla finestra
  const puntoNum = puntoFissoVisivo(
    Math.min(larghezza - 52, Math.max(52, cx)),
    (versoGiu ? r.bottom + 6 : r.top - 6), 0);
  el.style.left = puntoNum.left + 'px';
  el.style.top = puntoNum.top + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ============================================================
// FAR VEDERE QUELLO CHE NON E' DANNO
//
// Il tavolo sapeva mostrare una cosa sola: la vita che se ne va. Tutto
// il resto succedeva in silenzio. Le carte vere pero' fanno soprattutto
// altro — alzano scudi, li sfondano, rubano punti magia, marchiano un
// nemico per il resto della partita — e un gioco in cui meta' di quello
// che fai non si vede non si capisce: si perde senza sapere perche'.
//
// LA REGOLA, una sola e valida ovunque:
//   i NUMERI che volano sono la vita (rossi se cala, verdi se sale);
//   le PASTIGLIE sono tutto il resto.
// Cosi' con la coda dell'occhio si sa gia' di che si tratta, prima
// ancora di leggere.
// ============================================================
const SEGNI_EFFETTO = {
  boost_att:             { glifo: '⚔', colore: '#ffb057', segno: '+',                  parola: 'attacco' },
  boost_att_percentuale: { glifo: '⚔', colore: '#ffb057', segno: '+', percento: true,  parola: 'attacco' },
  boost_difesa:          { glifo: '🛡', colore: '#7ec8ff', segno: '+', percento: true,  parola: 'difesa' },
  riduci_difesa:         { glifo: '🛡', colore: '#ff7ad9', segno: '−', percento: true,  parola: 'difesa' },
  pulisci_malus_difesa:  { glifo: '✨', colore: '#ffe9a8', soloGlifo: true,             parola: 'difese risanate' },
  costo_abilita_extra:   { glifo: '⛓', colore: '#d9a441', segno: '+', suffisso: ' PM', parola: 'abilità più cara' },
  // questi non stanno su una carta: stanno sul giocatore
  riduci_punti_magia:    { glifo: '🔮', colore: '#b98cff', segno: '−', suffisso: ' PM', suGiocatore: true, parola: 'magia drenata' },
  aumenta_punti_magia:   { glifo: '🔮', colore: '#b98cff', segno: '+', suffisso: ' PM', suGiocatore: true, parola: 'magia recuperata' },
  distruggi_trappole:    { glifo: '💥', colore: '#ff9f6b', soloGlifo: true, suGiocatore: true, parola: 'trappole distrutte' },
  boost_danno:           { glifo: '🎯', colore: '#ffb057', segno: '+', percento: true, suGiocatore: true, parola: 'colpi potenziati' },
  pesca_extra:           { glifo: '🂠', colore: '#a8d8ff', segno: '+', suGiocatore: true, parola: 'carte in più' }
};
// gli effetti che muovono i PV si raccontano col numero, non con la pastiglia
const EFFETTI_VITA = ['danno_diretto', 'danno_percentuale', 'cura_diretta', 'cura_percentuale'];

// Da che parte del tavolo e' finito un effetto. `lato` lo dice il motore
// dal punto di vista di CHI AGISCE, qui si traduce nella striscia giusta.
function strisciaPerLato(chiAgisce, lato) {
  const daMe = (chiAgisce === 0) === (lato !== 'opponent');
  return daMe ? 'battleGiocatore' : 'battleAvversario';
}

function segnoEffetto(ancora, def, valore) {
  // "staccato dalla pagina" si chiede con isConnected, non guardando se
  // ha larghezza zero: fra un ridisegno e l'altro la carta di prima non
  // e' piu' nel documento, ed e' quello il caso da saltare. La misura a
  // zero non vuol dire la stessa cosa — un elemento attaccato ma non
  // ancora impaginato misura zero anche lui, e verrebbe scartato per
  // sbaglio.
  if (!ancora || !ancora.isConnected) return;
  const r = ancora.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const altezza = (typeof window !== 'undefined' && window.innerHeight) || 800;
  const larghezza = (typeof window !== 'undefined' && window.innerWidth) || 1200;
  const versoGiu = (r.top + r.height / 2) < altezza * 0.45;

  const el = document.createElement('div');
  el.className = 'segno-eff' + (versoGiu ? ' verso-giu' : '');
  el.style.color = def.colore;
  const puntoSegno = puntoFissoVisivo(
    Math.min(larghezza - 72, Math.max(72, cx)),
    (versoGiu ? r.bottom + 6 : r.top - 6), 0);
  el.style.left = puntoSegno.left + 'px';
  el.style.top = puntoSegno.top + 'px';
  const etichetta = def.soloGlifo || valore === null || valore === undefined || valore === ''
    ? '' : '<span class="val">' + (def.segno || '') + valore + (def.percento ? '%' : (def.suffisso || '')) + '</span>';
  el.innerHTML = '<span class="glifo">' + def.glifo + '</span>' + etichetta;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);

  // l'alone sull'elemento toccato: dice A CHI, mentre la pastiglia dice COSA
  const classeAura = ancora.classList.contains('barra-magia') ? 'tocca-magia' : 'aura-eff';
  ancora.style.setProperty('--c-eff', def.colore);
  ancora.classList.remove(classeAura);
  void ancora.offsetWidth;
  ancora.classList.add(classeAura);
  setTimeout(() => ancora.classList.remove(classeAura), 1200);
}

// Mostra, uno dopo l'altro, tutti gli effetti non-danno di una mossa.
// Sfalsati nel tempo: tre pastiglie tutte insieme sono un pasticcio, in
// fila si leggono. `r.effettiAbilita` arriva dalle abilita' degli eroi,
// `r.esiti` dalle Carte Magiche: stessa forma, stesso trattamento.
function mostraEffetti(r, chiAgisce, ritardo) {
  const esiti = [].concat(r.effettiAbilita || [], r.esiti || []);
  if (!esiti.length) return 0;
  let passo = 0;
  const base = ritardo || 0;

  esiti.forEach((e) => {
    if (!e || e.applied === false || e.giaApplicato) return;

    // --- i PV si raccontano col numero che vola ---
    if (EFFETTI_VITA.includes(e.effect)) {
      const cura = e.effect.startsWith('cura');
      const striscia = strisciaPerLato(chiAgisce, e.lato);
      (e.colpiti || []).forEach((s) => {
        const quando = base + passo * 260; passo++;
        segnaAnimazione(quando + 2000);
        setTimeout(() => {
          const el = $(striscia) && $(striscia).querySelector('.bcard[data-seme="' + s + '"]');
          if (!el) return;
          const quanto = e.guarigione ? e.guarigione[s] : Number(e.parametro);
          if (!quanto) return;
          if (cura) SUONI.cura(); else SUONI.danno(quanto);
          numeroDanno(el, cura ? -Math.abs(quanto) : Math.abs(quanto));
        }, quando);
      });
      return;
    }

    const def = SEGNI_EFFETTO[e.effect];
    if (!def) return;                       // effetto senza faccia: meglio niente che un simbolo a caso

    // --- quelli del giocatore: sulla barra della magia ---
    if (def.suGiocatore) {
      const mio = (chiAgisce === 0) === (e.lato !== 'opponent');
      const quando = base + passo * 260; passo++;
      segnaAnimazione(quando + 2400);
      setTimeout(() => {
        const box = $(mio ? 'magiaGiocatore' : 'magiaAvversario');
        segnoEffetto(box, def, e.tolti || e.dati || e.distrutte || e.parametro || null);
      }, quando);
      return;
    }

    // --- quelli sui personaggi: sulla carta toccata ---
    const striscia = strisciaPerLato(chiAgisce, e.lato);
    (e.colpiti || []).forEach((s) => {
      const quando = base + passo * 220; passo++;
      segnaAnimazione(quando + 2400);
      setTimeout(() => {
        const el = $(striscia) && $(striscia).querySelector('.bcard[data-seme="' + s + '"]');
        if (e.effect === 'boost_difesa') SUONI.scudoRegge();
        else if (e.effect === 'riduci_difesa') SUONI.scudoRotto();
        segnoEffetto(el, def, e.parametro);
      }, quando);
    });
  });
  return passo * 260;
}

const ui = {
  tocca(cid) {
    if (selezione.has(cid)) selezione.delete(cid); else selezione.add(cid);
    // QUI NIENTE VOLO DELLE CARTE.
    // Selezionare non sposta niente: la carta si solleva, e il
    // sollevamento lo fa il foglio di stile con la sua transizione.
    // Passando da disegna() si sovrapponevano due movimenti sulla stessa
    // carta — prima il "torna dov'eri e rivieni" del riposizionamento,
    // poi il sollevamento del CSS che partiva solo dopo. Da fuori era un
    // tentennamento: partiva, si fermava, ripartiva. Il riposizionamento
    // serve quando una carta cambia posto davvero; qui non succede.
    disegnaTutto();
  },
  pesca() { esegui({ tipo: 'pesca' }, () => actionDraw(S, S.currentPlayerIndex, Date.now())); },
  clicScarti() {
    const g = S.players[S.currentPlayerIndex];
    // stessa logica del tavolo originale: se non ho ancora pescato il monte
    // si prende, altrimenti il clic sugli scarti serve a scartare la carta scelta
    if (!g.hasDrawnThisTurn) { esegui({ tipo: 'prendi_scarti' }, () => actionTakeDiscardPile(S, S.currentPlayerIndex, Date.now())); return; }
    if (selezione.size !== 1) { avviso('Seleziona una sola carta da scartare.'); return; }
    esegui({ tipo: 'scarta', carta: [...selezione][0] }, () => actionDiscard(S, S.currentPlayerIndex, [...selezione][0], Date.now()));
  },
  cala() {
    if (!selezione.size) { avviso('Seleziona le carte da calare.'); return; }
    esegui({ tipo: 'cala', carte: [...selezione] }, () => actionLayMeld(S, S.currentPlayerIndex, [...selezione], Date.now()));
  },
  // Aggancio: clic su una colonna già calata. Basta anche UNA carta sola —
  // il minimo di tre vale solo per aprire un gioco nuovo.
  aggancia(meldId) {
    if (!selezione.size) { avviso('Scegli prima le carte da agganciare a questo gioco.'); return; }
    esegui({ tipo: 'aggancia', gioco: meldId, carte: [...selezione] }, () => actionAttachToMeld(S, S.currentPlayerIndex, meldId, [...selezione], Date.now()));
  },
  // riordinare rimette al loro posto anche le carte appena arrivate
  ordina(modo) { ordinamento = modo; carteNuove = []; disegna(); },

  // ------------------------------------------------------------
  // IMPOSTAZIONI
  // ------------------------------------------------------------
  impostazioni() {
    $('veloImpostazioni').classList.add('aperto');
  },

  // ------------------------------------------------------------
  // ABILITÀ SPECIALE, in due tempi
  // 1) tocchi il TUO eroe con la barra piena  → si entra in "scegli il bersaglio"
  // 2) tocchi un personaggio AVVERSARIO vivo  → il colpo parte
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // GUARDARE UNA CARTA
  // Toccare una carta del tavolo la apre grande. Se e' una mia carta e
  // l'abilita' si puo' usare adesso, sotto compare il bottone; se non
  // si puo', compare il motivo — un bottone che manca senza spiegazione
  // sembra un guasto del gioco.
  // ------------------------------------------------------------
  guarda(lato, seme) {
    const mio = lato === 'mio';
    const eroe = S.players[mio ? 0 : 1].characters[seme];
    if (!eroe) return;
    const carta = dati.personaggi[eroe.cardId];
    if (!carta) return;
    const t = testo(eroe.cardId);

    let azione = null, nota = '';
    if (mio) {
      const costo = costoAbilita(eroe);
      const giaUsata = (S.players[0].abilitaUsate || []).includes(seme);
      if (eroe.pv <= 0)                         nota = 'Questo eroe è fuori combattimento.';
      else if (S.currentPlayerIndex !== 0)      nota = 'Non è il tuo turno.';
      else if (giaUsata)                        nota = 'Ha già usato la sua abilità in questo turno.';
      else if (S.players[0].puntiMagia < costo) nota = 'Servono ' + costo + ' punti magia, ne hai ' + S.players[0].puntiMagia + '.';
      else azione = { etichetta: 'USA ABILITÀ · ' + costo + ' PM', fai: () => ui.attivaAbilita(seme) };
    }
    apriCartaGrande(carta, t, { stelle: stelle(eroe.rarita), azione, nota });
  },

  // La Carta Magica: stessa finestra, ma il bottone qui conta di piu' —
  // giocata, la carta e' spesa per sempre, anche dalla collezione.
  guardaMagica(i) {
    const ms = magie[0], carta = ms.selection[i];
    if (!carta) return;
    const t = testo(carta.id);
    const usata = (ms.consumate || []).includes(i);
    const armata = ms.trappoleArmate.some((x) => x.cardId === carta.id);

    let azione = null, nota = '';
    if (usata)                              nota = 'Già usata: ogni Carta Magica vale un solo utilizzo.';
    else if (armata)                        nota = 'È armata sul campo: scatterà da sola quando serve.';
    else if (S.currentPlayerIndex !== 0)    nota = 'Non è il tuo turno.';
    else if (ms.giocateQuestoTurno >= 1)    nota = 'Hai già giocato una Carta Magica in questo turno.';
    else azione = {
      etichetta: carta.tipo === 'trappola' ? 'ARMA LA TRAPPOLA' : 'USA',
      fai: () => ui.magica(i)
    };
    if (!nota && azione) {
      nota = 'Non costa punti magia. Vale un solo utilizzo: giocata, sparisce anche dalla tua collezione.';
    }
    apriCartaGrande(carta, t, { stelle: stelle(carta.rarita || 1), azione, nota });
  },

  attivaAbilita(seme) {
    if (S.currentPlayerIndex !== 0) { avviso('Non è il tuo turno.'); return; }
    const eroe = S.players[0].characters[seme];
    const costo = costoAbilita(eroe);
    if (S.players[0].puntiMagia < costo) {
      avviso('Punti magia insufficienti: servono ' + costo + ', ne hai ' + S.players[0].puntiMagia + '.');
      return;
    }
    // LA MAGGIOR PARTE DELLE ABILITA' NON CHIEDE DI MIRARE.
    // Per quasi tutto il roster il bersaglio lo decide la carta (uno a
    // caso, tutti, i propri...) e il colpo parte subito. Sei carte pero'
    // dicono "a scelta" (Papa Figo, Boto Felipe, Onca-Pintada, Mapinguari,
    // Caipora, Boitata): per quelle serve il passo "tocca un nemico".
    // Chi decide se serve e' il motore, non questa pagina.
    if (!abilitaChiedeBersaglio(eroe._ability)) { this.colpisci(null, seme); return; }

    bersaglioAttivo = seme;
    const t = testo(eroe.cardId);
    const pct = (eroe._ability && eroe._ability.parametro) || 30;
    $('istruzioneBersaglio').innerHTML =
      '<b>' + t.nome + '</b>: scegli quale personaggio avversario colpire ' +
      '(' + pct + '% del suo attacco, ' + Math.round(eroe.att * pct / 100) + ' danni circa · costa ' + costo + ' punti magia)' +
      '<span class="annulla" onclick="ui.annullaBersaglio()">annulla</span>';
    $('istruzioneBersaglio').classList.add('mostra');
    disegna();
  },
  annullaBersaglio() {
    bersaglioAttivo = null;
    $('istruzioneBersaglio').classList.remove('mostra');
    disegna();
  },
  // IN RETE LA MOSSA NON SI FA QUI.
  // Prima l'abilità veniva applicata direttamente allo stato di questa
  // pagina. In locale andava bene, perché questa pagina È la partita. In
  // rete no: il colpo si vedeva, i punti magia calavano, e poi il primo
  // aggiornamento dal server rimetteva tutto com'era — perché il server
  // non ne aveva mai saputo niente, e la verità è la sua. Dall'altra
  // parte l'avversario non vedeva proprio nulla.
  // Ora passa da esegui(), che in locale chiama il motore e in rete
  // chiede al server. Stessa forma dell'esito, un solo percorso.
  // `attaccanteDiretto` arriva quando l'abilita' non chiede di mirare:
  // si salta il passo della scelta e si va dritti al colpo.
  async colpisci(semeBersaglio, attaccanteDiretto) {
    if (!bersaglioAttivo && !attaccanteDiretto) return;
    const attaccante = attaccanteDiretto || bersaglioAttivo;
    bersaglioAttivo = null;
    $('istruzioneBersaglio').classList.remove('mostra');
    const r = await esegui(
      { tipo: 'abilita', seme: attaccante, bersaglio: semeBersaglio },
      () => usaAbilitaSpeciale(S, 0, attaccante, semeBersaglio, Date.now()));
    // Un rifiuto muto e' peggio di un rifiuto: premi, non succede niente,
    // e non sai se hai sbagliato tu o se e' rotto il gioco.
    if (!r || !r.ok) { avviso((r && (r.reason || r.motivo)) || 'Non si e\' potuto usare l\'abilita\'.'); disegna(); return; }
    avviso('Abilità usata: -' + r.costo + ' punti magia (te ne restano ' + r.puntiRimasti + ').');
  },
  // Stessa storia dell'abilità: anche la Carta Magica passa dal server.
  // Il confronto "PV prima / PV dopo" continua a funzionare in tutte e
  // due le modalità, perché in rete lo stato viene sostituito da quello
  // che risponde il server: prima e dopo restano confrontabili.
  async magica(i) {
    if (S.currentPlayerIndex !== 0) { avviso('Non è il tuo turno.'); return; }
    const ms = magie[0], carta = ms.selection[i];
    if (!carta) return;
    if (ms.giocateQuestoTurno >= 1) { avviso('Puoi giocare una sola Carta Magica per turno.'); return; }
    if ((ms.consumate || []).includes(i)) { avviso('Questa carta l\'hai già usata: ogni Carta Magica vale un solo utilizzo.'); return; }
    const t = testo(carta.id);

    const pvPrima = {};
    for (const s of SEMI) pvPrima[s] = { mio: S.players[0].characters[s].pv, suo: S.players[1].characters[s].pv };

    const r = await esegui({ tipo: 'magia', indice: i },
                           () => giocaCartaMagica(S, 0, i, Date.now()));
    if (!r || !r.ok) { avviso((r && (r.reason || r.motivo)) || 'Non si e\' potuta giocare la carta.'); disegna(); return; }

    if (carta.tipo === 'sorpresa') {

      // che cosa è successo, in parole: chi ha perso o guadagnato PV
      const cambi = [], numeri = [];
      for (const s of SEMI) {
        const dSuo = pvPrima[s].suo - S.players[1].characters[s].pv;
        const dMio = pvPrima[s].mio - S.players[0].characters[s].pv;
        if (Math.abs(dSuo) > 0.01) {
          cambi.push(testo(S.players[1].characters[s].cardId).nome + ' (' + s + ') ' + (dSuo > 0 ? 'subisce ' + Math.round(dSuo) + ' danni' : 'recupera ' + Math.round(-dSuo) + ' PV'));
          numeri.push({ striscia: 'battleAvversario', seme: s, valore: dSuo });
        }
        if (Math.abs(dMio) > 0.01) {
          cambi.push(testo(S.players[0].characters[s].cardId).nome + ' (' + s + ') ' + (dMio > 0 ? 'subisce ' + Math.round(dMio) + ' danni' : 'recupera ' + Math.round(-dMio) + ' PV'));
          numeri.push({ striscia: 'battleGiocatore', seme: s, valore: dMio });
        }
      }

      segnaAnimazione(3600);   // la carta resta grande 3,2s, poi i numeri
      apriCartaMagica({
        tipo: 'sorpresa', chi: 'Carta Sorpresa',
        nome: t.nome, descrizione: t.descrizione,
        esito: cambi.length ? cambi.join(' · ') : 'Effetto attivato',
        costo: r.costo
      });
      disegna();
      // PRIMA IL LAMPO, POI I NUMERI.
      // Il lampo parte da dove la carta si e' appena tolta di mezzo e
      // arriva sui bersagli: e' quello che collega la carta giocata ai
      // punti vita che cambiano. Senza, la carta spariva e i numeri
      // comparivano da soli, come due cose scollegate.
      setTimeout(() => lampiSuBersagli(numeri.map((n) => ({ striscia: n.striscia, seme: n.seme }))), 3050);
      // i numeri partono quando il lampo e' arrivato
      setTimeout(() => {
        numeri.forEach((n, i) => setTimeout(() => {
          const el = $(n.striscia).querySelector('.bcard[data-seme="' + n.seme + '"]');
          if (!el) return;
          if (n.valore > 0) { el.classList.add('colpita'); setTimeout(() => el.classList.remove('colpita'), 440); }
          numeroDanno(el, n.valore);
        }, i * 130));
      }, 3450);
      // 3,2s: il tempo di vedere la carta ingrandirsi, restare ferma e leggerla
      clearTimeout(ui._sorpresaT);
      ui._sorpresaT = setTimeout(() => ov.classList.remove('mostra'), 3200);
    } else {
      apriCartaMagica({
        tipo: 'trappola', chi: 'Trappola posata',
        nome: t.nome, descrizione: t.descrizione,
        esito: 'Resta coperta: l\'avversario la vede, ma non sa quale sia',
        costo: r.costo, durata: 2600
      });
      avviso('Trappola posata: scatterà da sola quando serve.');
      disegna();
    }
  }
};
// ------------------------------------------------------------
// ABBANDONARE
// Due tocchi, non uno: il primo chiede conferma, il secondo va. Un
// bottone che chiude la partita al primo colpo, dentro un pannello che
// si apre col dito su un telefono, e' una trappola.
// Il tempo per ripensarci e' di cinque secondi, poi torna com'era.
// ------------------------------------------------------------
if ($('abbandona')) {
  let sicuro = false;
  $('abbandona').addEventListener('click', async () => {
    const b = $('abbandona');
    if (!S || S.status !== 'in_progress') { avviso('La partita è già finita.'); return; }
    if (!sicuro) {
      sicuro = true;
      b.classList.add('sicuro');
      b.textContent = 'Sicuro? Premi di nuovo';
      setTimeout(() => {
        sicuro = false;
        b.classList.remove('sicuro');
        b.textContent = 'Abbandona la partita';
      }, 5000);
      return;
    }
    sicuro = false;
    b.classList.remove('sicuro');
    b.textContent = 'Abbandona la partita';
    $('veloImpostazioni').classList.remove('aperto');
    await esegui({ tipo: 'abbandona' }, () => abbandona(S, 0, Date.now()));
    disegna();
  });
}

// interruttore dei suoni
function aggiornaBottoniSuoni() {
  const si = $('suoniSi'), no = $('suoniNo');
  if (!si || !no) return;
  si.classList.toggle('scelto', SUONI.acceso());
  no.classList.toggle('scelto', !SUONI.acceso());
}
if ($('suoniSi')) $('suoniSi').addEventListener('click', () => { SUONI.accendi(true); aggiornaBottoniSuoni(); });
if ($('suoniNo')) $('suoniNo').addEventListener('click', () => { SUONI.accendi(false); aggiornaBottoniSuoni(); });
aggiornaBottoniSuoni();

// il pannello si chiude col bottone, toccando fuori, o con Esc
$('chiudiImpostazioni').addEventListener('click', () => $('veloImpostazioni').classList.remove('aperto'));
$('veloImpostazioni').addEventListener('click', (e) => {
  if (e.target === $('veloImpostazioni')) $('veloImpostazioni').classList.remove('aperto');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('veloImpostazioni').classList.remove('aperto'); chiudiCartaGrande(); }
});
// toccare il velo (fuori dalla carta) chiude: e' il gesto che tutti
// provano per primo, e non deve far partire niente
$('veloCarta').addEventListener('click', (e) => {
  if (e.target === $('veloCarta')) chiudiCartaGrande();
});

window.ui = ui;
// una finestra sullo stato, per le verifiche automatiche: restituisce
// una copia, così nessuno può muovere la partita passando di qui
window.__tavolo = () => (S ? JSON.parse(JSON.stringify({
  status: S.status, winner: S.winner, winReason: S.winReason,
  currentPlayerIndex: S.currentPlayerIndex, scarti: S.scarti, tallone: S.tallone,
  animazioneAvversarioInCorso,
  players: S.players.map((p) => ({
    hand: p.hand, melds: p.melds, characters: p.characters,
    hasDrawnThisTurn: p.hasDrawnThisTurn, puntiMagia: p.puntiMagia,
    pozzettoTaken: p.pozzettoTaken
  })),
  magiche: magie ? magie.map((m) => (m ? m.selection.map((c) => c.id) : [])) : null
})) : null);
window.__inRete = ONLINE;
// I segni degli effetti si vedono per due secondi e poi spariscono: per
// provarli servirebbe una partita col personaggio giusto, il turno
// giusto e i punti magia giusti. Questa porta di servizio li fa partire
// da soli su un esito finto — la usa client/tavolo-vivo.test.js per
// verificare che si disegnino davvero, invece di fidarsi.
window.__mostraEffetti = (esito, chiAgisce) => mostraEffetti(esito, chiAgisce || 0, 0);

// Clic nell'area delle mie calate:
//  - su una colonna già in tavola → AGGANCIA lì le carte selezionate
//  - nello spazio vuoto           → cala un gioco NUOVO
document.getElementById('myMelds').addEventListener('click', (e) => {
  const col = e.target.closest ? e.target.closest('.card-column') : null;
  if (col && col.dataset.meldId) ui.aggancia(col.dataset.meldId);
  else ui.cala();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') ui.cala();
  if (e.key === 'p' || e.key === 'P') ui.pesca();
});

(async function avvia() {
  dati = DATI_CARTE;   // incorporati alla generazione: nessun caricamento da rete

  if (ONLINE) {
    // La partita non è nostra: esiste già sul server, con le carte già
    // distribuite. Qui si chiede solo com'è messa e si comincia a
    // guardare. Se il tavolo non risponde, meglio dirlo che restare su
    // uno schermo vuoto.
    document.body.classList.add('in-rete');
    let r;
    try {
      const risposta = await fetch('/api/stato?codice=' + encodeURIComponent(RETE.codice) +
        '&segreto=' + encodeURIComponent(RETE.segreto) + '&da=-1');
      r = await risposta.json();
    } catch (e) { r = null; }

    if (!r || !r.ok || !r.vista) {
      dimenticaIlTavolo();
      avviso((r && r.motivo) || 'Questo tavolo non c\'è più. Torna alla sala.');
      setTimeout(() => (location.href = 'sala.html'), 2500);
      return;
    }
    accettaVista(r);
    agganciaPannello();
    accendiLucciole();
    setInterval(aggiornaOrologiTurno, 250);
    window.addEventListener('resize', () => disegna());
    const nome = RETE.nomi[RETE.io === 0 ? 1 : 0];
    avviso(nome ? 'Giochi contro ' + nome : 'Partita in corso');
    ascolta();                                  // resta in ascolto delle sue mosse
    return;
  }

  // IL MAZZO SCELTO NELLA PAGINA "IL TUO MAZZO"
  // Se c'e', si gioca con quello. Se non c'e', o se e' scritto male, o se
  // contiene carte che non esistono piu', si torna alla squadra
  // predefinita dicendolo — perche' partire in silenzio con eroi diversi
  // da quelli scelti e' il modo migliore per far credere che sia rotto
  // il gioco quando invece e' rotto il mazzo salvato.
  const mio = mazzoScelto();
  const a = squadra(mio ? mio.personaggi : IDS_PERSONAGGI.io);
  const b = squadra(IDS_PERSONAGGI.avv);
  const mieMagiche = (mio ? mio.carteMagiche : IDS_MAGICHE.io).map((id) => dati.magiche[id]);
  // le Carte Magiche vivono ora DENTRO lo stato di partita: così il motore
  // può far scattare le trappole e rispettare gli effetti sul flusso
  S = createMatch({
    characters: [a.characters, b.characters],
    abilities: [a.abilities, b.abilities],
    magiche: [mieMagiche, IDS_MAGICHE.avv.map((id) => dati.magiche[id])],
    // gli stessi trenta secondi anche contro il bot: e' il momento in cui
    // si guarda chi si ha davanti, e vale in tutte e due le modalita'
    studioSecondi: SECONDI_DI_STUDIO
  });
  magie = [S.players[0].magic, S.players[1].magic];
  disegna();
  mostraSorteggio();          // il mazzo dice chi comincia, e lo si guarda
  agganciaPannello();
  accendiLucciole();
  if (mio) setTimeout(() => avviso('Giochi con il tuo mazzo.'), 400);
  setInterval(aggiornaOrologiTurno, 250);   // i due cronometri del minuto
  window.addEventListener('resize', () => disegna());  // il ventaglio si ricalcola sulla larghezza vera
})();

// Lucciole dello sfondo fatato: puntini luminosi che salgono piano, con
// tempi e posizioni diversi così non si vede la ripetizione.
function accendiLucciole() {
  const box = $('lucciole');
  if (!box) return;
  let html = '';
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 100, y = 25 + Math.random() * 70;
    const durata = 7 + Math.random() * 9, ritardo = Math.random() * 10;
    const dim = 2 + Math.random() * 2.5;
    html += '<div class="lucciola" style="left:' + x.toFixed(2) + '%; top:' + y.toFixed(2) + '%;' +
            'width:' + dim.toFixed(1) + 'px; height:' + dim.toFixed(1) + 'px;' +
            'animation-duration:' + durata.toFixed(1) + 's; animation-delay:-' + ritardo.toFixed(1) + 's"></div>';
  }
  box.innerHTML = html;
}
'''

# ------------------------------------------------------------
# INCORPORAZIONE DEL MOTORE (mini-impacchettatore)
# Ogni modulo del motore viene chiuso in una funzione a sé, che restituisce
# le sue "export". Serve davvero: due moduli diversi possono dichiarare lo
# stesso nome (per esempio SUITS sta sia in core-rules.js sia in
# magic-cards.js) e incollandoli uno dietro l'altro il browser si ferma con
# "Identifier 'SUITS' has already been declared". Isolandoli, ognuno tiene
# i suoi nomi e si scambiano solo quello che si esportano davvero.
# Il codice delle funzioni non viene toccato: è lo stesso coperto dai test.
# ------------------------------------------------------------
PROG = DST.rsplit('/client/', 1)[0]

# Ordine di impacchettamento: ogni modulo deve venire DOPO quelli da cui
# dipende. `vocabolario.js` non dipende da nessuno e deve stare per primo.
ORDINE = ['vocabolario.js', 'core-rules.js', 'magic-cards.js', 'character-abilities.js', 'partita.js', 'bot.js']
def var_modulo(nome): return '__M_' + re.sub(r'[^a-zA-Z0-9]', '_', nome[:-3])

def impacchetta(nome):
    testo = io.open(os.path.join(PROG, 'engine', nome), encoding='utf-8').read()

    # 1. i nomi che il modulo esporta
    esportati = re.findall(r'^export\s+(?:function|const|let|class)\s+([A-Za-z0-9_$]+)', testo, flags=re.M)

    # 2. gli import diventano un prelievo dal modulo già impacchettato
    def sostituisci_import(m):
        nomi, da = m.group(1), m.group(2)
        return 'const {%s} = %s;' % (nomi, var_modulo(os.path.basename(da)))
    testo = re.sub(r'^import\s*\{([^}]*)\}\s*from\s*[\'"]([^\'"]+)[\'"];?\s*$',
                   sostituisci_import, testo, flags=re.M)

    # 3. via la parola "export", che ha senso solo fra file separati
    testo = re.sub(r'^export\s+', '', testo, flags=re.M)

    return ('\n// ===== engine/%s (incorporato) =====\nconst %s = (function(){\n%s\nreturn {%s};\n})();\n'
            % (nome, var_modulo(nome), testo, ', '.join(esportati)))

# CONTROLLO PRIMA DI IMPACCHETTARE
# Se un modulo del motore importa un file che non è in ORDINE, il tavolo
# generato si rompe all'avvio: il nome importato resta indefinito e la
# pagina muore senza dire niente ("Il tavolo non è partito"). È già
# successo aggiungendo vocabolario.js. Meglio fermarsi qui e dirlo.
def controlla_ordine():
    mancanti = []
    for nome in ORDINE:
        testo = io.open(os.path.join(PROG, 'engine', nome), encoding='utf-8').read()
        for dip in re.findall(r'^import\s*\{[^}]*\}\s*from\s*[\'"]\./([^\'"]+)[\'"]', testo, flags=re.M):
            if dip not in ORDINE:
                mancanti.append('engine/%s importa %s, che non è in ORDINE' % (nome, dip))
            elif ORDINE.index(dip) > ORDINE.index(nome):
                mancanti.append('engine/%s importa %s, che in ORDINE viene DOPO: va spostato prima' % (nome, dip))
    if mancanti:
        raise SystemExit('IMPACCHETTAMENTO INTERROTTO — il tavolo sarebbe nato rotto:\n  - ' + '\n  - '.join(mancanti))

controlla_ordine()
motore = ''.join(impacchetta(n) for n in ORDINE)

# I NOMI CHE LA PAGINA USA, prelevati dai moduli impacchettati.
# Questo elenco e' l'unica porta fra il motore e il tavolo: quello che
# non passa di qui, nella pagina non esiste.
PRELIEVI = [
    ('partita.js', ['createMatch', 'actionDraw', 'actionTakeDiscardPile', 'actionLayMeld',
                    'actionAttachToMeld', 'actionDiscard', 'usaAbilitaSpeciale',
                    'giocaCartaMagica', 'haEffetto', 'checkTurnTimeout',
                    'TURN_SECONDS', 'SECONDI_DI_STUDIO',
                    'abbandona', 'abilitaChiedeBersaglio', 'costoAbilitaDi']),
    ('magic-cards.js', ['makeMagicState', 'activateSorpresa', 'armTrappola', 'resetTurnoMagie']),
    ('core-rules.js', ['valueLabel']),
    ('bot.js', ['botGiocaTurno'])
]
NOMI_PRELEVATI = set(n for _, nomi in PRELIEVI for n in nomi)
motore += ''.join('\nconst {%s} = %s;' % (', '.join(nomi), var_modulo(mod))
                  for mod, nomi in PRELIEVI) + '\n'

# dati carta incorporati
import json as _json
carte = {}
for f in sorted(os.listdir(os.path.join(PROG, 'cards', 'data'))):
    if f.endswith('.json'):
        carte[f[:-5]] = _json.loads(io.open(os.path.join(PROG, 'cards', 'data', f), encoding='utf-8').read())
i18n = _json.loads(io.open(os.path.join(PROG, 'cards', 'i18n', 'it.json'), encoding='utf-8').read())

personaggi = {k: v for k, v in carte.items() if k.startswith('personaggio_')}
magiche    = {k: v for k, v in carte.items() if not k.startswith('personaggio_')}

DATI = ('\n// ===== dati carta incorporati da cards/data e cards/i18n =====\n'
        'const DATI_CARTE = {\n'
        '  i18n: ' + _json.dumps(i18n, ensure_ascii=False) + ',\n'
        '  personaggi: ' + _json.dumps(personaggi, ensure_ascii=False) + ',\n'
        '  magiche: ' + _json.dumps(magiche, ensure_ascii=False) + '\n};\n')

# ------------------------------------------------------------
# I NOMI DEL MOTORE CHE LA PAGINA USA SENZA AVERLI PRESI
#
# Il motore viene impacchettato dentro la pagina, ma i suoi nomi non
# sono automaticamente disponibili: vanno prelevati uno per uno nella
# riga qui sopra. Dimenticarne uno non da' nessun errore in fase di
# costruzione — la pagina si scrive benissimo — e poi al primo
# caricamento muore con un "non definito" alla prima riga che lo usa.
# Muore TUTTA: il tavolo resta vuoto e non si capisce perche'.
# E' successo con SECONDI_DI_STUDIO.
# Qui si controlla prima di scrivere il file.
# ------------------------------------------------------------
def controlla_nomi_prelevati():
    esportati = set()
    for nome in ORDINE:
        sorgente = io.open(os.path.join(PROG, 'engine', nome), encoding='utf-8').read()
        esportati.update(re.findall(r'export\s+(?:const|let|function)\s+([A-Za-z_$][\w$]*)', sorgente))
    # SCRIPT e' il codice scritto a mano della pagina: e' li' che si usano
    usati = set(re.findall(r'\b([A-Za-z_$][\w$]*)\b', SCRIPT))
    dimenticati = sorted((esportati & usati) - NOMI_PRELEVATI)
    # i nomi definiti anche dentro la pagina non contano
    definiti_qui = set(re.findall(r'(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)', SCRIPT))
    dimenticati = [d for d in dimenticati if d not in definiti_qui]
    if dimenticati:
        raise SystemExit(
            'COSTRUZIONE INTERROTTA — la pagina nascerebbe morta.\n'
            'Questi nomi del motore vengono usati nel tavolo ma non sono fra\n'
            'quelli prelevati dai moduli impacchettati:\n  - ' +
            '\n  - '.join(dimenticati) +
            '\nAggiungili alla riga "i nomi che la pagina usa" in questo file.')

controlla_nomi_prelevati()

out = []
out.append('<!DOCTYPE html>\n<html lang="it">\n<head>\n<meta charset="UTF-8">\n')
# Il pinch-to-zoom sul tavolo non serve a niente di buono: il layout e'
# gia' pensato per starci tutto, e zoomare rompe la vista bloccata in
# orizzontale (si vede un pezzo solo, e il gesto per rimettere a posto
# la mano nel resto del gioco non c'e'). Su questa pagina, e solo qui,
# si toglie: maximum-scale=1 blocca lo zoom su Chrome/Safari moderni,
# user-scalable=no e' il fratello vecchio che copre i browser piu' datati.
out.append('<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">\n')
out.append('<title>Burraco Legends — Tavolo</title>\n')
out.append('<link rel="manifest" href="manifest.json">\n<meta name="theme-color" content="#2a1e12">\n<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n')
out.append('<style>')
out.append(css)
out.append(BATTLE_CSS)
out.append(CSS_IMPOSTAZIONI)
out.append(CSS_CARTA_ILLUSTRATA)
out.append('</style>\n</head>\n<body>\n')
out.append(BODY)
# Il pannello va PRIMA dello script: lo script cerca i suoi bottoni
# appena parte, e se l'HTML venisse dopo non li troverebbe.
out.append(PANNELLO_IMPOSTAZIONI)
out.append('\n<script>\n(function(){\n"use strict";\n'
  # ORDINE OBBLIGATO: prima lo schermo intero, POI il blocco
  # dell'orientamento. Su Chrome/Android screen.orientation.lock()
  # RIFIUTA se la pagina non è già a schermo intero — provarlo prima,
  # come si faceva, falliva sempre in silenzio (il catch lo copriva, ma
  # non scattava mai). Ora si prova il blocco SOLO dopo che lo schermo
  # intero è stato concesso (o comunque tentato): nei contesti che lo
  # permettono l'orientamento si blocca davvero, altrove resta il
  # riquadro #ruotaAvviso a chiedere di ruotare il telefono a mano.
  "function provaOrientamento() {\n"
  "  try {\n"
  "    if (screen.orientation && screen.orientation.lock) {\n"
  "      screen.orientation.lock('landscape').catch(function(){});\n"
  "    }\n"
  "  } catch (e) {}\n"
  "}\n"
  # LA BARRA DI SISTEMA (ora, batteria, rete) NON È LA BARRA DEL
  # BROWSER. Quella del browser spariva già installando l'app
  # (manifest "standalone"); questa è dell'operatore Android/iOS e resta
  # anche dentro un'app vera — a meno di chiedere lo schermo intero.
  # requestFullscreen() quasi ovunque PRETENDE un gesto dell'utente: al
  # solo caricamento della pagina i browser la rifiutano in silenzio.
  # Si tenta comunque subito (nei contesti che lo concedono, tipo alcune
  # PWA già installate, funziona) e si riprova al primo tocco sul
  # tavolo, che è il gesto che serve.
  "function provaSchermoIntero() {\n"
  "  var el = document.documentElement;\n"
  "  if (document.fullscreenElement || document.webkitFullscreenElement) { provaOrientamento(); return; }\n"
  "  try {\n"
  "    var richiesta = el.requestFullscreen ? el.requestFullscreen()\n"
  "                  : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null);\n"
  "    if (richiesta && richiesta.then) richiesta.then(provaOrientamento).catch(provaOrientamento);\n"
  # webkitRequestFullscreen (Safari/vecchio Android) non restituisce una
  # promise: si prova comunque il blocco un attimo dopo, dandogli il
  # tempo di entrare in modalita' schermo intero.
  "    else setTimeout(provaOrientamento, 60);\n"
  "  } catch (e) { provaOrientamento(); }\n"
  "}\n"
  "provaSchermoIntero();\n"
  "document.addEventListener('pointerdown', provaSchermoIntero, { once: true, passive: true });\n")
out.append(motore)
out.append(DATI)
out.append(dati_illustrazioni(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
out.append(JS_CARTA_ILLUSTRATA)
out.append(SCRIPT)
out.append('\n})();\n</script>\n</body>\n</html>\n')

os.makedirs(os.path.dirname(DST), exist_ok=True)
# newline='\n' NON e' un dettaglio: senza, su Windows Python traduce
# ogni a-capo in CR+LF e la pagina esce diversa da quella generata su
# Linux o Mac, byte per byte. Il controllo di allineamento confronta
# proprio i byte, quindi segnalava tutte le pagine come 'rimaste
# indietro' su un computer e non sull'altro — e non era vero.
# Le pagine sono le stesse ovunque, e devono esserlo davvero.
io.open(DST, 'w', encoding='utf-8', newline='\n').write(''.join(out))
print('scritto', DST, os.path.getsize(DST), 'byte')
