# ============================================================
# LA CARTA ILLUSTRATA — un pezzo solo, usato da tre pagine
#
# Album, apertura pacchetti e tavolo devono disegnare la STESSA carta:
# stessa cornice, stessa finestra, stesso posto per il nome e per i
# numeri. Se ognuna se la disegnasse per conto suo, basterebbe
# ritoccare una cornice per ritrovarsi tre carte diverse — e la
# differenza si noterebbe proprio passando da una pagina all'altra, che
# e' il momento in cui uno le confronta.
#
# COME E' FATTA (dal basso verso l'alto):
#   1. la FINESTRA, con dentro l'illustrazione ritagliata "a coprire";
#   2. la CORNICE, un WebP col centro trasparente, stesa su tutta la carta;
#   3. il TESTO, in riquadri messi dove la cornice ha i suoi spazi vuoti.
# La cornice sta IN MEZZO, non sopra a tutto: cosi' i suoi bordi
# frastagliati coprono l'illustrazione (che deborda apposta) e il testo
# resta leggibile sopra di lei.
#
# PERCHE' TUTTO IN PERCENTUALE
# La stessa carta si vede larga 120px nell'album e 330px ingrandita. Le
# misure in pixel andrebbero rifatte per ogni posto; le percentuali no.
# I numeri arrivano da strumenti/prepara-immagini.py, che li MISURA
# sull'immagine della cornice invece di fidarsi di quello che ricordiamo.
#
# IL TESTO CHE SI ADATTA
# Le dimensioni del testo sono in "cqw": percentuali della larghezza
# della carta. Cosi' una carta piccola ha un testo piccolo e una grande
# un testo grande, senza scriverlo due volte. Dove i container query non
# ci fossero (browser vecchi) restano i px dichiarati prima: il testo
# non scala, ma si legge lo stesso.
# ============================================================

import json
import os


def dati_illustrazioni(prog):
    """L'elenco delle carte che hanno davvero un'illustrazione.

    Si LEGGE dalla cartella, non si scrive a mano: le illustrazioni
    arrivano una alla volta, e un elenco tenuto a mano sarebbe sbagliato
    dal giorno dopo — con l'effetto peggiore possibile, l'icona di
    immagine rotta al posto di una carta."""
    cartella = os.path.join(prog, 'client', 'immagini')
    if not os.path.isdir(cartella):
        return '\nconst ILLUSTRAZIONI = [];\n'
    presenti = sorted(
        f[:-5] for f in os.listdir(cartella)
        if f.endswith('.webp') and not f.startswith('cornice-'))
    return '\nconst ILLUSTRAZIONI = ' + json.dumps(presenti) + ';\n'


# Le finestre e i riquadri, in percentuale sui lati della carta.
# Misurati su cards/frames/*.png — vedi prepara-immagini.py.
CSS_CARTA_ILLUSTRATA = r'''
  /* ---------- LA CARTA ILLUSTRATA (condivisa fra le pagine) ---------- */
  .carta-illustrata {
    position: relative; aspect-ratio: 0.71; overflow: hidden;
    container-type: inline-size;
    /* Lo sfondo si vede DENTRO la finestra, dietro l'illustrazione:
       le illustrazioni hanno lo sfondo trasparente, quindi il colore
       della carta traspare intorno al personaggio ed e' quello che le
       fa sembrare disegnate dentro la cornice invece che incollate. */
    background:
      radial-gradient(ellipse at 50% 30%, var(--velo, rgba(255,255,255,0.10)), transparent 62%),
      linear-gradient(168deg, #2a2140 0%, #1a1428 60%, #120d1c 100%);
    --fin-x: 15.16%; --fin-y: 13.57%; --fin-w: 69.91%; --fin-h: 51.73%;
    --nome-x: 17.36%; --nome-y: 4.52%; --nome-w: 64.24%; --nome-h: 7.81%;
    /* ERA --desc-x:14.47%/--desc-w:70.02% (bordo destro all'84.49%): sulla
       cornice personaggio la targa di pergamena per la descrizione e'
       piu' stretta di cosi', e il testo finiva a scrivere sopra
       l'intaglio dorato a destra — segnalato con uno screenshot da chi
       lo vedeva davvero sul telefono. Restretto e ricentrato sulla
       stessa mezzeria (~49,5%), bordo destro adesso all'81%. */
    --desc-x: 18%; --desc-y: 67.84%; --desc-w: 63%; --desc-h: 10.28%;
    --statsx-x: 14.47%; --statdx-x: 50.93%; --stat-y: 81.83%;
    --statsx-w: 31.25%; --statdx-w: 33.56%; --stat-h: 8.22%;
  }
  /* La cornice delle Carte Magiche ha proporzioni sue: finestra un
     filo piu' bassa e UN SOLO riquadro in basso, piu' alto (niente
     vita/attacco da scrivere, solo l'effetto). */
  .carta-illustrata.magica {
    --fin-y: 13.31%; --fin-h: 52.44%;
    --nome-x: 19.68%; --nome-y: 4.87%; --nome-w: 61.34%; --nome-h: 7.71%;
    --desc-x: 15.63%; --desc-y: 68.18%; --desc-w: 69.44%; --desc-h: 21.10%;
  }

  .ci-finestra {
    position: absolute; overflow: hidden;
    left: var(--fin-x); top: var(--fin-y); width: var(--fin-w); height: var(--fin-h);
  }
  /* "a coprire": l'illustrazione riempie tutta la finestra e quello che
     avanza si taglia, invece di lasciare bordi vuoti ai lati. */
  .ci-arte { width: 100%; height: 100%; object-fit: cover; display: block; }

  .ci-cornice {
    position: absolute; inset: 0; width: 100%; height: 100%;
    display: block; pointer-events: none;
  }

  /* --- i testi, ognuno nel suo spazio vuoto della cornice --- */
  .ci-testata, .ci-desc, .ci-stat {
    position: absolute; display: flex; align-items: center; justify-content: center;
    text-align: center; overflow: hidden; pointer-events: none;
  }
  .ci-testata {
    left: var(--nome-x); top: var(--nome-y); width: var(--nome-w); height: var(--nome-h);
    flex-direction: column; gap: 0;
  }
  .ci-nome {
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    color: #f0e2c0; line-height: 1.05;
    font-size: 11px; font-size: 6.2cqw;
    text-shadow: 0 1px 2px #000; letter-spacing: 0.2px;
    max-width: 96%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ci-stelle { color: #e2b43c; line-height: 1; font-size: 7px; font-size: 3.6cqw; }
  .ci-seme { color: #c41e28; font-size: 8px; font-size: 4.6cqw; line-height: 1; }
  .ci-seme.nero { color: #2a2830; }

  /* PIU' GRASSA — segnalato da chi la leggeva sul telefono, anche dopo
     che la carta era gia' stata ingrandita al massimo: un serif sottile
     a corpo piccolo si perde contro l'illustrazione sotto. Il peso 700
     la stacca senza dover rimpicciolire la finestra per farcela stare. */
  .ci-desc {
    left: var(--desc-x); top: var(--desc-y); width: var(--desc-w); height: var(--desc-h);
    padding: 0 3%;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; color: #241a10;
    font-size: 7px; font-size: 3.5cqw; line-height: 1.25;
  }
  /* SULLA CORNICE MAGICA il riquadro non e' pergamena ma metallo scuro,
     quindi il testo va chiaro. Era pero' un grigio-lilla tenue su un
     grigio medio: sulla carta si leggeva a fatica, grigio su grigio.
     Adesso e' un bianco caldo pieno, con un'ombra netta sotto che lo
     stacca dal fondo — la stessa che porta il nome nella barra in cima.
     E il corpo cresce un po': quel riquadro e' il doppio piu' alto di
     quello dei personaggi, il testo ci sta comodo. */
  .carta-illustrata.magica .ci-desc {
    color: #f6efdc; font-size: 8px; font-size: 3.9cqw;
    text-shadow: 0 1px 2px rgba(0,0,0,0.9);
  }

  /* TUTTE LE CLASSI QUI DENTRO COMINCIANO PER "ci-", e non e' pignoleria:
     questo pezzo viene incollato dentro pagine che hanno un CSS loro, e
     un nome comune si scontra. E' successo davvero: "etichetta" e'
     anche il bollino NUOVA/DOPPIONE dell'apertura pacchetti, che e'
     position:absolute — l'etichetta VITA se lo prendeva e finiva
     sopra al proprio numero. Con il prefisso non puo' piu' capitare. */
  /* VITA / ATT: l'etichetta SOPRA, il numero SOTTO, e devono restare
     due righe separate. Prima l'altezza del riquadro era fissata al
     riquadro della cornice e il contenuto, se cresceva, ci finiva
     dentro a forza: l'etichetta e il numero si accavallavano.
     Adesso l'altezza e' un MINIMO, non una gabbia — il riquadro parte
     dal punto giusto e si prende quello che gli serve — e le due righe
     hanno un'interlinea dichiarata, cosi' non si toccano mai. */
  .ci-stat {
    top: var(--stat-y); min-height: var(--stat-h); height: auto;
    flex-direction: column; justify-content: center; gap: 0.6cqw; line-height: 1;
  }
  .ci-stat.sx { left: var(--statsx-x); width: var(--statsx-w); }
  .ci-stat.dx { left: var(--statdx-x); width: var(--statdx-w); }
  .ci-stat .ci-et {
    color: #cfc3a6; font-size: 5px; font-size: 2.5cqw;
    letter-spacing: 0.5px; line-height: 1.1; display: block;
  }
  .ci-stat .ci-num {
    font-family: Georgia, serif; font-weight: 800; color: #f7ecd2;
    font-size: 10px; font-size: 5.2cqw; line-height: 1.1;
    text-shadow: 0 1px 2px #000; display: block;
  }

  /* SULLE CARTE PICCOLE il testo minuto non si legge: si toglie invece
     di lasciarlo li' come sporco. Il nome resta — e' quello che serve a
     riconoscere la carta — e i numeri si vedono ingrandendola. */
  @container (max-width: 165px) {
    .ci-desc, .ci-stat { display: none; }
  }

  /* la carta che non si possiede: sagoma spenta */
  .carta-illustrata.manca .ci-arte { filter: grayscale(1) brightness(0.28); }
  .carta-illustrata.manca .ci-cornice { filter: grayscale(0.85) brightness(0.55); }
  .carta-illustrata.manca .ci-nome { color: rgba(255,255,255,0.34); }

  /* SENZA ILLUSTRAZIONE.
     I personaggi segnaposto (001-008) e le carte di esempio sono nati
     prima delle illustrazioni e non ne hanno una: sono la dotazione di
     benvenuto, fuori commercio, destinati a sparire. Mettere il tag
     dell'immagine lo stesso vorrebbe dire l'icona di immagine rotta —
     il modo peggiore di dire "questa carta non ha un disegno". Al suo
     posto il seme, grande, nella finestra: si capisce che e' una carta
     senza figura, non una figura che non si e' caricata. */
  .ci-senza-arte {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    font-size: 34px; font-size: 30cqw; line-height: 1;
    color: rgba(255,255,255,0.13); text-shadow: 0 0 6cqw currentColor;
  }
'''


# Il JavaScript che costruisce una carta illustrata. Uguale ovunque, per
# lo stesso motivo del CSS: tre copie diventerebbero tre carte diverse.
#
# `carta` e' la definizione da cards/data, `testi` quello che si legge
# (nome e descrizione gia' tradotti).
JS_CARTA_ILLUSTRATA = r'''
// Il seme si colora come sulla carta vera: rossi cuori e quadri.
const SEMI_ROSSI = ['♥', '♦'];

// Le carte magiche non hanno seme: il loro tipo si legge dall'id.
function eMagica(carta) {
  return !carta.seme;
}

function immagineCarta(idCarta) {
  return 'immagini/' + idCarta + '.webp';
}

// La carta illustrata: cornice, finestra con l'arte, testi al loro posto.
// `opzioni.posseduta` a false la spegne (sagoma di quello che manca).
function cartaIllustrata(carta, testi, opzioni) {
  const o = opzioni || {};
  const magica = eMagica(carta);
  const cornice = magica ? 'cornice-magica' : 'cornice-personaggio';
  const posseduta = o.posseduta !== false;
  const stelle = o.stelle || '';

  const seme = carta.seme
    ? '<span class="ci-seme' + (SEMI_ROSSI.includes(carta.seme) ? '' : ' nero') + '">' + carta.seme + '</span>'
    : '';

  // Il nome e le stelle stanno nella barra in cima; il seme accanto al nome.
  const testata =
    '<div class="ci-testata">' +
      '<div class="ci-nome">' + (posseduta ? testi.nome : '? ? ?') + (seme ? ' ' + seme : '') + '</div>' +
      (stelle ? '<div class="ci-stelle">' + stelle + '</div>' : '') +
    '</div>';

  // I numeri solo per i personaggi: una Carta Magica non ha vita ne' attacco.
  const numeri = (!magica && posseduta)
    ? '<div class="ci-stat sx"><span class="ci-et">VITA</span><span class="ci-num">' + carta.vita + '</span></div>' +
      '<div class="ci-stat dx"><span class="ci-et">ATT</span><span class="ci-num">' + carta.att + '</span></div>'
    : '';

  const descrizione = (posseduta && testi.descrizione)
    ? '<div class="ci-desc">' + testi.descrizione + '</div>' : '';

  // Non tutte le carte hanno un'illustrazione: l'elenco di quelle che ce
  // l'hanno lo scrive il generatore leggendo la cartella vera, cosi' non
  // si puo' sbagliare (vedi dati_illustrazioni in carta_illustrata.py).
  // loading="lazy": l'album puo' avere decine di carte, e scaricarle
  // tutte insieme all'apertura vorrebbe dire aspettare per vedere le
  // prime. Cosi' arrivano quelle che si guardano.
  const haArte = typeof ILLUSTRAZIONI !== 'undefined' && ILLUSTRAZIONI.indexOf(carta.id) !== -1;
  const dentroFinestra = haArte
    ? '<img class="ci-arte" src="' + immagineCarta(carta.id) + '" alt="" loading="lazy" draggable="false">'
    : '<div class="ci-senza-arte">' + (carta.seme || (carta.tipo === 'trappola' ? '⚡' : '✦')) + '</div>';

  return '<div class="carta-illustrata' + (magica ? ' magica' : '') +
           (posseduta ? '' : ' manca') + '">' +
      '<div class="ci-finestra">' + dentroFinestra + '</div>' +
      '<img class="ci-cornice" src="' + immagineCarta(cornice) + '" alt="" loading="lazy" draggable="false">' +
      testata + numeri + descrizione +
    '</div>';
}
'''
