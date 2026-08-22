# Genera client/album.html — l'album delle figurine.
#
# Un album non è un elenco di cose che hai: è un elenco di cose che TI
# MANCANO, disposte in modo che si veda il buco. Le carte che non hai
# stanno al loro posto, come sagome vuote col nome coperto, così sai
# sempre quante e quali ti separano dalla pagina completa.
#
# Come le altre pagine: motore e dati incorporati, si apre col doppio clic.
import re, io, os, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import PONTE

# Il percorso del progetto si ricava da dove sta questo file, non si
# scrive a mano: così la cartella si può rinominare o spostare senza
# che nessuno se ne accorga.
PROG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(PROG, 'client', 'album.html')


def impacchetta(nome):
    testo = io.open(os.path.join(PROG, 'engine', nome), encoding='utf-8').read()
    esportati = re.findall(r'^export\s+(?:function|const|let|class)\s+([A-Za-z0-9_$]+)', testo, flags=re.M)
    testo = re.sub(r'^import\s*\{[^}]*\}\s*from\s*[\'"]([^\'"]+)[\'"];?\s*$', '', testo, flags=re.M)
    testo = re.sub(r'^export\s+', '', testo, flags=re.M)
    guscio = '__' + nome[:3].upper()
    return ('\nconst %s = (function(){\n%s\nreturn {%s};\n})();\n' % (guscio, testo, ', '.join(esportati)) +
            'const {%s} = %s;\n' % (', '.join(esportati), guscio))


motore = impacchetta('sharkini.js') + impacchetta('pacchetti.js')

carte = {}
for f in sorted(os.listdir(os.path.join(PROG, 'cards', 'data'))):
    if f.endswith('.json'):
        carte[f[:-5]] = json.loads(io.open(os.path.join(PROG, 'cards', 'data', f), encoding='utf-8').read())
i18n = json.loads(io.open(os.path.join(PROG, 'cards', 'i18n', 'it.json'), encoding='utf-8').read())

DATI = ('\nconst CATALOGO = ' + json.dumps(list(carte.values()), ensure_ascii=False) + ';\n' +
        'const TESTI = ' + json.dumps(i18n, ensure_ascii=False) + ';\n')

PAGINA = r'''<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Burraco Legends — Album</title>
<style>
  :root {
    --oro: #e8c46a; --oro-chiaro: #fff0c2; --oro-scuro: #9a6f21;
    --pergamena: #f2e6cc; --tenue: #b7a686; --notte: #0d0a13;
    --verde: #58c48a;
    --r1: #8d93a3; --r2: #63c27e; --r3: #4aa3f0; --r4: #b070f5; --r5: #ffb347;
  }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; margin: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif; color: var(--pergamena);
    background:
      radial-gradient(ellipse at 50% 0%, #2a1d3d 0%, transparent 60%),
      radial-gradient(ellipse at 50% 100%, #3a2410 0%, transparent 55%),
      var(--notte);
    padding: max(14px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
    display: flex; flex-direction: column; align-items: center; gap: 16px;
    user-select: none;
  }

  .barra { width: 100%; max-width: 1000px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .torna { font-size: 0.85rem; color: var(--tenue); text-decoration: none; }
  .torna:hover { color: var(--oro); }
  .borsellino {
    display: flex; align-items: center; gap: 7px; padding: 6px 13px 6px 7px; border-radius: 999px;
    border: 1px solid var(--oro-scuro); text-decoration: none; color: inherit;
    background: linear-gradient(168deg, rgba(74,53,32,0.9), rgba(24,17,10,0.95));
  }
  .borsellino .cifra { font-size: 0.98rem; font-weight: 800; color: var(--oro-chiaro); font-variant-numeric: tabular-nums; }
  .borsellino .etichetta-moneta { font-size: 0.58rem; letter-spacing: 1px; text-transform: uppercase; color: var(--tenue); font-weight: 600; }

  .insegna { text-align: center; }
  .insegna h1 {
    margin: 0; font-family: Georgia, serif; font-size: clamp(1.5rem, 4.2vw, 2.3rem);
    letter-spacing: 3px; font-weight: 700;
    background: linear-gradient(180deg, #fff6d8, var(--oro) 45%, var(--oro-scuro) 75%, #ffe9ae);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 2px 0 rgba(0,0,0,0.7));
  }
  .insegna .sotto { font-size: 0.82rem; color: var(--tenue); margin-top: 5px; letter-spacing: 0.6px; }

  /* ---------- quanto manca ---------- */
  .avanzamento {
    width: 100%; max-width: 1000px; padding: 14px 16px; border-radius: 14px;
    border: 1px solid var(--oro-scuro);
    background: linear-gradient(168deg, rgba(52,38,22,0.9), rgba(22,15,9,0.95));
    display: flex; flex-direction: column; gap: 10px;
  }
  .avanzamento .riga { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .avanzamento .quanto { font-family: Georgia, serif; font-size: 1.4rem; color: var(--oro-chiaro); }
  .avanzamento .quanto b { font-size: 1.9rem; }
  .avanzamento .commento { font-size: 0.8rem; color: var(--tenue); }
  .sbarra { height: 9px; border-radius: 99px; background: rgba(0,0,0,0.45); overflow: hidden; }
  .sbarra i {
    display: block; height: 100%; border-radius: 99px; width: 0;
    background: linear-gradient(90deg, var(--oro-scuro), var(--oro) 60%, #fff3cc);
    transition: width 0.9s cubic-bezier(.2,.9,.3,1);
  }
  .per-rarita { display: flex; gap: 8px; flex-wrap: wrap; }
  .per-rarita span {
    font-size: 0.72rem; padding: 3px 10px; border-radius: 9px;
    background: rgba(255,255,255,0.05); border: 1px solid transparent;
  }
  .per-rarita span.completa { border-color: var(--verde); color: #b6ffd4; }

  /* ---------- filtri ---------- */
  .filtri { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .filtro {
    padding: 7px 15px; border-radius: 99px; cursor: pointer; font-family: inherit;
    font-size: 0.8rem; font-weight: 700; letter-spacing: 0.4px;
    border: 1px solid var(--oro-scuro); background: rgba(0,0,0,0.35); color: var(--tenue);
    transition: color 0.14s, border-color 0.14s, background 0.14s;
  }
  .filtro:hover { color: var(--pergamena); }
  .filtro.scelto { background: linear-gradient(180deg, #fff0c2, var(--oro)); color: #2a1c08; border-color: var(--oro-chiaro); }

  /* ---------- le pagine dell'album ---------- */
  /* IL CONTENITORE DEVE AVERE UNA LARGHEZZA.
     Il body è una colonna flessibile centrata: i suoi figli, se non
     dicono quanto sono larghi, si stringono sul contenuto. #sezioni non
     lo diceva, così la griglia dentro non aveva spazio da spartire e
     incolonnava tutte le figurine una sotto l'altra. Le altre fasce
     della pagina non davano problemi solo perché la larghezza ce
     l'avevano già. */
  #sezioni { width: 100%; max-width: 1000px; display: flex; flex-direction: column; gap: 6px; }
  .sezione { width: 100%; display: flex; flex-direction: column; gap: 11px; }
  .titolo-sezione {
    display: flex; align-items: center; gap: 12px; margin-top: 8px;
    font-family: Georgia, serif; font-size: 1rem; letter-spacing: 2.4px;
    text-transform: uppercase; color: var(--oro);
  }
  .titolo-sezione::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(232,196,106,0.45), transparent); }
  .titolo-sezione .conteggio {
    font-family: 'Segoe UI', system-ui, sans-serif; font-size: 0.75rem;
    letter-spacing: 0.4px; text-transform: none; color: var(--tenue); flex: 0 0 auto;
  }

  /* Tante per riga, quante ce ne stanno. Niente min() qui dentro: la
     misura minima resta una lunghezza secca, così la riga non può
     essere scartata da nessun browser e ritrovarsi a colonna sola. */
  .griglia {
    display: grid; gap: 13px 11px;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    align-items: start;
  }
  @media (min-width: 700px) { .griglia { grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); } }

  /* La figurina. Quella che hai è a colori e ha il numero di copie;
     quella che manca resta al suo posto, spenta, col nome coperto. */
  .figurina {
    position: relative; aspect-ratio: 0.7; border-radius: 11px; overflow: hidden; cursor: pointer;
    border: 1.5px solid var(--bordo, var(--r1));
    background:
      radial-gradient(ellipse at 50% 18%, var(--velo, rgba(255,255,255,0.1)), transparent 62%),
      linear-gradient(168deg, #2a2140 0%, #1a1428 60%, #120d1c 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 5px; padding: 9px 7px; text-align: center;
    transition: transform 0.16s cubic-bezier(.2,.9,.3,1), box-shadow 0.16s;
  }
  /* Un album di figurine non è una tabella: le figurine si attaccano a
     mano e stanno un po' storte, ognuna a modo suo. L'inclinazione è
     minima (meno di due gradi) e sempre la stessa per la stessa carta,
     così la pagina non balla a ogni ridisegno. */
  .figurina { transform: rotate(var(--storta, 0deg)) translateY(var(--sbalzo, 0px)); }
  .figurina:hover {
    transform: rotate(0deg) translateY(-5px) scale(1.04);
    box-shadow: 0 10px 24px rgba(0,0,0,0.65), 0 0 20px var(--alone, transparent);
    z-index: 2;
  }

  .figurina .simbolo { font-size: 2.4rem; line-height: 1; text-shadow: 0 0 18px currentColor; }
  .figurina .nome { font-family: Georgia, serif; font-size: 0.78rem; line-height: 1.2; color: var(--oro-chiaro); }
  .figurina .stelle { font-size: 0.68rem; color: var(--bordo, var(--r1)); letter-spacing: 1px; }
  .figurina .stat { font-size: 0.66rem; color: var(--tenue); }

  .figurina .copie {
    position: absolute; top: 6px; right: 6px; font-size: 0.64rem; font-weight: 900;
    padding: 2px 7px; border-radius: 9px; background: rgba(0,0,0,0.62);
    border: 1px solid var(--bordo, var(--r1)); color: var(--oro-chiaro);
  }
  .figurina .nuova {
    position: absolute; top: 6px; left: 6px; font-size: 0.58rem; font-weight: 900;
    letter-spacing: 1px; padding: 2px 7px; border-radius: 9px;
    background: linear-gradient(180deg, #9dffc4, var(--verde)); color: #05301a;
  }

  /* la sagoma di quello che manca */
  .figurina.manca {
    border-style: dashed; border-color: rgba(255,255,255,0.16);
    background: rgba(255,255,255,0.026);
  }
  .figurina.manca .simbolo { color: rgba(255,255,255,0.13); text-shadow: none; }
  .figurina.manca .nome { color: rgba(255,255,255,0.2); letter-spacing: 2px; }
  .figurina.manca .stelle { color: rgba(255,255,255,0.16); }
  .figurina.manca .stat { visibility: hidden; }
  .figurina.manca:hover { transform: none; box-shadow: none; }

  /* ---------- la carta ingrandita ---------- */
  .lente {
    position: fixed; inset: 0; z-index: 40; display: none;
    align-items: center; justify-content: center; padding: 22px;
    background: rgba(6,4,10,0.84); backdrop-filter: blur(5px);
  }
  .lente.viva { display: flex; animation: entraLente 0.25s ease-out; }
  @keyframes entraLente { from { opacity: 0; } to { opacity: 1; } }
  .lente .grande {
    width: min(330px, 86vw); aspect-ratio: 0.7; border-radius: 18px; padding: 22px 18px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
    text-align: center; border: 2px solid var(--bordo, var(--r1));
    background:
      radial-gradient(ellipse at 50% 18%, var(--velo, rgba(255,255,255,0.14)), transparent 62%),
      linear-gradient(168deg, #2a2140 0%, #1a1428 60%, #120d1c 100%);
    box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 60px var(--alone, transparent);
    animation: arrivaLente 0.4s cubic-bezier(.2,1.3,.4,1) both;
  }
  @keyframes arrivaLente { 0% { transform: scale(0.7) rotateY(-18deg); opacity: 0; } 100% { transform: scale(1) rotateY(0); opacity: 1; } }
  .lente .simbolo { font-size: 5rem; line-height: 1; text-shadow: 0 0 34px currentColor, 0 0 8px #fff; }
  .lente .nome { font-family: Georgia, serif; font-size: 1.5rem; color: var(--oro-chiaro); line-height: 1.15; }
  .lente .stelle { font-size: 1.1rem; color: var(--bordo, var(--r1)); letter-spacing: 3px; }
  .lente .desc { font-size: 0.83rem; color: var(--tenue); line-height: 1.5; max-width: 90%; }
  .lente .numeri { display: flex; gap: 16px; font-size: 0.9rem; color: #d9cdf2; }
  .lente .numeri b { color: var(--oro-chiaro); }
  .lente .quante { font-size: 0.78rem; color: var(--verde); }

  .vuoto { font-size: 0.85rem; color: var(--tenue); text-align: center; padding: 30px 0; }
  .nota { max-width: 640px; font-size: 0.72rem; color: #8a7e68; line-height: 1.55; text-align: center; }
</style>
</head>
<body>

<div class="barra">
  <a class="torna" href="home.html">← Torna alla home</a>
  <a class="borsellino" href="negozio.html" title="I tuoi sharkini">
    <span id="moneta"></span><span class="cifra" id="saldo">0</span><span class="etichetta-moneta">sharkini</span>
  </a>
</div>

<div class="insegna">
  <h1>ALBUM</h1>
  <div class="sotto">Tutte le carte del gioco, e quelle che ti mancano</div>
</div>

<div class="avanzamento">
  <div class="riga">
    <span class="quanto"><b id="quante">0</b> <span id="suQuante">su 0</span></span>
    <span class="commento" id="commento"></span>
  </div>
  <div class="sbarra"><i id="sbarra"></i></div>
  <div class="per-rarita" id="perRarita"></div>
</div>

<div class="filtri" id="filtri"></div>

<div id="sezioni"></div>

<div class="nota">
  Le carte doppie non si buttano: serviranno a potenziare quelle che hai già.
  Per ora restano contate qui, in attesa di quella parte del gioco.
</div>

<div class="lente" id="lente"><div class="grande" id="grande"></div></div>

<script>
(function () {
"use strict";
__MOTORE__
__DATI__

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------
// COSA POSSIEDO
// Lo stesso cassetto che riempie l'apertura dei pacchetti.
// ------------------------------------------------------------
__PONTE__

function leggi(chiave, valorePredefinito) {
  try { const v = localStorage.getItem(chiave); return v === null ? valorePredefinito : JSON.parse(v); }
  catch (e) { return valorePredefinito; }
}

// L'album è quello che il SERVER dice che possiedi. Prima stava nel
// browser, e chi voleva poteva scriversi dentro tutte le carte.
let posseduto = {};
let saldo = 0;

// le carte aperte da poco si segnalano finché non le si guarda
const viste = leggi('bb_album_viste', {});

// ------------------------------------------------------------
const STILE = {
  1: { colore: 'var(--r1)', velo: 'rgba(141,147,163,0.16)', alone: 'transparent' },
  2: { colore: 'var(--r2)', velo: 'rgba(99,194,126,0.18)', alone: 'rgba(99,194,126,0.35)' },
  3: { colore: 'var(--r3)', velo: 'rgba(74,163,240,0.2)',  alone: 'rgba(74,163,240,0.45)' },
  4: { colore: 'var(--r4)', velo: 'rgba(176,112,245,0.22)', alone: 'rgba(176,112,245,0.55)' },
  5: { colore: 'var(--r5)', velo: 'rgba(255,179,71,0.26)',  alone: 'rgba(255,179,71,0.7)' }
};
const SIMBOLO = { personaggio: null, sorpresa: '✦', trappola: '◈' };

function tipoDi(c) {
  if (c.seme) return 'personaggio';
  return c.tipo || 'sorpresa';
}
function simboloDi(c) {
  return c.seme ? c.seme : (SIMBOLO[tipoDi(c)] || '✦');
}
function testo(id) {
  const t = TESTI && TESTI[id];
  return { nome: (t && t.nome) || id, desc: (t && t.desc) || '' };
}
function stelle(r) { return '★'.repeat(r) + '☆'.repeat(5 - r); }

function monetaSvg(dim) {
  const u = 'm' + Math.random().toString(36).slice(2, 8);
  return '<svg viewBox="0 0 40 40" width="' + dim + '" height="' + dim + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="' + u + '" x1="0" y1="0" x2="0.5" y2="1">' +
      '<stop offset="0%" stop-color="#fff3cc"/><stop offset="45%" stop-color="#e8c46a"/>' +
      '<stop offset="100%" stop-color="#8a6118"/></linearGradient></defs>' +
    '<circle cx="20" cy="20" r="18" fill="url(#' + u + ')" stroke="#6b4a10" stroke-width="1.6"/>' +
    '<path d="M20 9 C25 15 28 21 29 26 C25 24 22 23.5 20 23.5 C18 23.5 15 24 11 26 C12 21 15 15 20 9 Z" fill="#6b4a10" opacity="0.82"/>' +
  '</svg>';
}
$('moneta').innerHTML = monetaSvg(22);


// ------------------------------------------------------------
// LE SEZIONI DELL'ALBUM
// Diviso per tipo, e dentro ogni tipo per rarità crescente: la pagina
// finisce con le carte più rare, che sono quelle che si guardano.
// ------------------------------------------------------------
const SEZIONI = [
  { id: 'personaggio', titolo: 'Eroi' },
  { id: 'sorpresa',    titolo: 'Sorprese' },
  { id: 'trappola',    titolo: 'Trappole' }
];
let filtro = 'tutte';

const ordinate = CATALOGO.slice().sort((a, b) =>
  (a.rarita || 1) - (b.rarita || 1) || String(a.id).localeCompare(String(b.id)));

const quante = (c) => posseduto[c.id] || 0;
const ho = (c) => quante(c) > 0;

// ------------------------------------------------------------
function figurina(c) {
  const r = c.rarita || 1;
  const st = STILE[r] || STILE[1];
  const t = testo(c.id);
  const n = quante(c);
  // Due numeretti ricavati dal nome della carta: sempre gli stessi per
  // la stessa carta, ma molto diversi fra una carta e l'altra.
  // Il primo tentativo sommava i caratteri, e con nomi consecutivi
  // (personaggio_001, _002, _003...) usciva una scaletta di angoli quasi
  // uguali: le figurine sembravano allineate col righello. Serve un
  // mescolamento vero, che da nomi vicini tiri fuori numeri lontani.
  let h = 2166136261;
  for (let i = 0; i < c.id.length; i++) {
    h ^= c.id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = h >>> 0;
  const storta = ((h % 1000) / 999 * 3.6 - 1.8).toFixed(2);        // fra -1,8° e +1,8°
  const sbalzo = (((h >>> 11) % 1000) / 999 * 7 - 3.5).toFixed(1); // qualche pixel su o giù

  const stile = 'style="--bordo:' + st.colore + ';--velo:' + st.velo + ';--alone:' + st.alone +
                ';--storta:' + storta + 'deg;--sbalzo:' + sbalzo + 'px"';

  if (!n) {
    return '<div class="figurina manca" ' + stile + ' data-id="' + c.id + '">' +
      '<span class="simbolo">' + simboloDi(c) + '</span>' +
      '<span class="nome">? ? ?</span>' +
      '<span class="stelle">' + stelle(r) + '</span>' +
      '<span class="stat">—</span>' +
    '</div>';
  }
  return '<div class="figurina" ' + stile + ' data-id="' + c.id + '">' +
    (viste[c.id] ? '' : '<span class="nuova">nuova</span>') +
    (n > 1 ? '<span class="copie">×' + n + '</span>' : '') +
    '<span class="simbolo" style="color:' + st.colore + '">' + simboloDi(c) + '</span>' +
    '<span class="nome">' + t.nome + '</span>' +
    '<span class="stelle">' + stelle(r) + '</span>' +
    // Difesa non si mostra (richiesta del committente): conta nel motore, non a schermo.
    '<span class="stat">' + (c.seme ? c.vita + ' PV · ' + c.att + ' ATT' : (c.tipo === 'trappola' ? 'Trappola' : 'Sorpresa')) + '</span>' +
  '</div>';
}

function disegna() {
  let html = '';
  for (const sez of SEZIONI) {
    const dentro = ordinate.filter((c) => tipoDi(c) === sez.id);
    if (!dentro.length) continue;
    const mostrate = dentro.filter((c) =>
      filtro === 'tutte' || (filtro === 'mie' && ho(c)) || (filtro === 'mancanti' && !ho(c)) ||
      (filtro === 'doppie' && quante(c) > 1));
    if (!mostrate.length) continue;
    const avute = dentro.filter(ho).length;
    html += '<div class="sezione">' +
      '<div class="titolo-sezione">' + sez.titolo +
        '<span class="conteggio">' + avute + ' su ' + dentro.length + '</span></div>' +
      '<div class="griglia">' + mostrate.map(figurina).join('') + '</div>' +
    '</div>';
  }
  $('sezioni').innerHTML = html || '<div class="vuoto">Qui non c\'è niente da mostrare con questo filtro.</div>';

  for (const nodo of document.querySelectorAll('.figurina')) {
    nodo.addEventListener('click', () => ingrandisci(nodo.getAttribute('data-id')));
  }
}

// ------------------------------------------------------------
// L'AVANZAMENTO
// ------------------------------------------------------------
function aggiornaAvanzamento() {
  const totale = CATALOGO.length;
  const avute = CATALOGO.filter(ho).length;
  $('quante').textContent = avute;
  $('suQuante').textContent = 'su ' + totale;
  $('sbarra').style.width = (totale ? (avute / totale) * 100 : 0).toFixed(1) + '%';

  const mancano = totale - avute;
  $('commento').textContent = mancano === 0
    ? 'Album completo. Non manca più niente.'
    : (mancano === 1 ? 'Ti manca una carta sola.' : 'Ti mancano ' + mancano + ' carte.');

  const perRarita = [1, 2, 3, 4, 5].map((r) => {
    const gruppo = CATALOGO.filter((c) => (c.rarita || 1) === r);
    if (!gruppo.length) return '';
    const a = gruppo.filter(ho).length;
    return '<span class="' + (a === gruppo.length ? 'completa' : '') + '" style="color:' +
      (a === gruppo.length ? '' : STILE[r].colore) + '">' + stelle(r).slice(0, r) + ' ' + a + '/' + gruppo.length + '</span>';
  }).join('');
  $('perRarita').innerHTML = perRarita;
}

// ------------------------------------------------------------
// LA CARTA INGRANDITA
// ------------------------------------------------------------
function ingrandisci(id) {
  const c = CATALOGO.find((x) => x.id === id);
  if (!c) return;
  const n = quante(c);
  const r = c.rarita || 1;
  const st = STILE[r] || STILE[1];
  const t = testo(c.id);

  // guardarla la smette di essere "nuova"
  if (n && !viste[id]) {
    viste[id] = true;
    try { localStorage.setItem('bb_album_viste', JSON.stringify(viste)); } catch (e) {}
  }

  $('grande').setAttribute('style',
    '--bordo:' + (n ? st.colore : 'rgba(255,255,255,0.2)') +
    ';--velo:' + (n ? st.velo : 'transparent') +
    ';--alone:' + (n ? st.alone : 'transparent'));

  $('grande').innerHTML = n
    ? '<span class="simbolo" style="color:' + st.colore + '">' + simboloDi(c) + '</span>' +
      '<span class="nome">' + t.nome + '</span>' +
      '<span class="stelle">' + stelle(r) + '</span>' +
      (t.desc ? '<span class="desc">' + t.desc + '</span>' : '') +
      (c.seme ? '<span class="numeri"><span><b>' + c.vita + '</b> PV</span><span><b>' + c.att + '</b> ATT</span></span>' : '') +
      (n > 1 ? '<span class="quante">Ne hai ' + n + ' copie</span>' : '<span class="quante">La tua unica copia</span>')
    : '<span class="simbolo" style="color:rgba(255,255,255,0.16)">' + simboloDi(c) + '</span>' +
      '<span class="nome" style="color:rgba(255,255,255,0.3)">? ? ?</span>' +
      '<span class="stelle">' + stelle(r) + '</span>' +
      '<span class="desc">Questa carta non ce l\'hai ancora. Si trova nei pacchetti: ' +
        'a ' + stelle(r).slice(0, r) + ' esce nel ' + (PROBABILITA[r] || 0).toString().replace('.', ',') + '% dei casi.</span>';

  $('lente').classList.add('viva');
  disegna();
  aggiornaAvanzamento();
}

$('lente').addEventListener('click', () => $('lente').classList.remove('viva'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('lente').classList.remove('viva'); });

// ------------------------------------------------------------
// I FILTRI
// ------------------------------------------------------------
const FILTRI = [
  { id: 'tutte', nome: 'Tutte' },
  { id: 'mie', nome: 'Che ho' },
  { id: 'mancanti', nome: 'Che mi mancano' },
  { id: 'doppie', nome: 'Doppie' }
];
function disegnaFiltri() {
  $('filtri').innerHTML = FILTRI.map((f) => {
    const quanti = f.id === 'tutte' ? CATALOGO.length
      : f.id === 'mie' ? CATALOGO.filter(ho).length
      : f.id === 'mancanti' ? CATALOGO.filter((c) => !ho(c)).length
      : CATALOGO.filter((c) => quante(c) > 1).length;
    return '<button class="filtro' + (filtro === f.id ? ' scelto' : '') + '" data-f="' + f.id + '">' +
      f.nome + ' (' + quanti + ')</button>';
  }).join('');
  for (const b of document.querySelectorAll('.filtro')) {
    b.addEventListener('click', () => { filtro = b.getAttribute('data-f'); disegnaFiltri(); disegna(); });
  }
}

(async function avvia() {
  const r = await SCORTA.io();
  if (r && r.ok) { posseduto = r.collezione || {}; saldo = r.saldo || 0; }
  $('saldo').textContent = formattaSharkini(saldo);
  disegnaFiltri();
  disegna();
  aggiornaAvanzamento();
  avvisaSeDiProva();
})();

window.__prova = {
  posseduto: () => posseduto, filtro: () => filtro, dove: () => SCORTA.dove,
  imposta: (p) => {
    posseduto = { ...p };
    disegnaFiltri(); disegna(); aggiornaAvanzamento();
  }
};
})();
</script>
</body>
</html>
'''

pagina = PAGINA.replace('__PONTE__', PONTE).replace('__MOTORE__', motore).replace('__DATI__', DATI)
for segnaposto in ('__MOTORE__', '__DATI__', '__PONTE__'):
    assert segnaposto not in pagina, 'segnaposto non sostituito: ' + segnaposto

# newline='\n' NON e' un dettaglio: senza, su Windows Python traduce
# ogni a-capo in CR+LF e la pagina esce diversa da quella generata su
# Linux o Mac, byte per byte. Il controllo di allineamento confronta
# proprio i byte, quindi segnalava tutte le pagine come 'rimaste
# indietro' su un computer e non sull'altro — e non era vero.
# Le pagine sono le stesse ovunque, e devono esserlo davvero.
io.open(DST, 'w', encoding='utf-8', newline='\n').write(pagina)
print('scritto', DST, os.path.getsize(DST), 'byte')
