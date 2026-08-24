# Genera client/negozio.html — il negozio.
#
# Due banchi distinti, e la distinzione è il punto:
#   - i PACCHETTI si pagano in sharkini, e basta;
#   - gli SHARKINI si ricaricano con gli euro.
# Sulle carte non compare mai un prezzo in euro.
import re, io, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import PONTE

# Il percorso del progetto si ricava da dove sta questo file, non si
# scrive a mano: così la cartella si può rinominare o spostare senza
# che nessuno se ne accorga.
PROG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(PROG, 'client', 'negozio.html')

def impacchetta(nome):
    testo = io.open(os.path.join(PROG, 'engine', nome), encoding='utf-8').read()
    esportati = re.findall(r'^export\s+(?:function|const|let|class)\s+([A-Za-z0-9_$]+)', testo, flags=re.M)
    testo = re.sub(r'^import\s*\{[^}]*\}\s*from\s*[\'"]([^\'"]+)[\'"];?\s*$', '', testo, flags=re.M)
    testo = re.sub(r'^export\s+', '', testo, flags=re.M)
    return ('\nconst __%s = (function(){\n%s\nreturn {%s};\n})();\n' % (nome[:3].upper(), testo, ', '.join(esportati)) +
            'const {%s} = __%s;\n' % (', '.join(esportati), nome[:3].upper()))

motore = impacchetta('sharkini.js') + impacchetta('pacchetti.js')

# IL CATALOGO, per il ponte di ripiego (pagina aperta col doppio clic,
# senza server). Senza questo la funzione compra() del ponte di
# ripiego chiamava apriPacchetto(CATALOGO, ...) con CATALOGO non
# definito — moriva silenziosa alla prima prova d'acquisto offline.
# Stesso identico procedimento di genera-spacchetta.py, che il
# catalogo lo usa per lo stesso motivo.
carte = {}
for f in sorted(os.listdir(os.path.join(PROG, 'cards', 'data'))):
    if f.endswith('.json'):
        carte[f[:-5]] = json.loads(io.open(os.path.join(PROG, 'cards', 'data', f), encoding='utf-8').read())
motore += '\nconst CATALOGO = ' + json.dumps(list(carte.values()), ensure_ascii=False) + ';\n'

PAGINA = r'''<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Burraco Legends — Negozio</title>
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#2a1e12">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>
  :root {
    --oro: #e8c46a; --oro-chiaro: #fff0c2; --oro-scuro: #9a6f21;
    --pergamena: #f2e6cc; --tenue: #b7a686; --notte: #0d0a13;
    --verde: #58c48a; --blu: #5cc0ff; --rosso: #f0736b;
  }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; margin: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif; color: var(--pergamena);
    background:
      radial-gradient(ellipse at 50% 0%, #2a1d3d 0%, transparent 62%),
      radial-gradient(ellipse at 50% 100%, #3a2410 0%, transparent 58%),
      var(--notte);
    padding: max(14px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
    display: flex; flex-direction: column; align-items: center; gap: 18px;
  }

  /* ---------- barra in alto: dove torno, e quanto ho ---------- */
  .barra {
    width: 100%; max-width: 980px; display: flex; align-items: center;
    justify-content: space-between; gap: 12px;
  }
  .torna { font-size: 0.85rem; color: var(--tenue); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
  .torna .icona-torna { width: 20px; height: 20px; object-fit: contain; }
  .torna:hover { color: var(--oro); }

  .borsellino {
    display: flex; align-items: center; gap: 8px; padding: 7px 14px 7px 8px;
    border-radius: 999px; border: 1px solid var(--oro-scuro);
    background: linear-gradient(168deg, rgba(74,53,32,0.9), rgba(24,17,10,0.95));
    box-shadow: inset 0 1px 0 rgba(255,224,160,0.2), 0 3px 12px rgba(0,0,0,0.5);
  }
  .borsellino .moneta { width: 26px; height: 26px; flex: 0 0 auto; }
  .borsellino .cifra {
    font-size: 1.06rem; font-weight: 800; color: var(--oro-chiaro);
    font-variant-numeric: tabular-nums; letter-spacing: 0.3px;
  }
  .borsellino .cifra.cambiata { animation: saldoSale 0.7s ease-out; }
  @keyframes saldoSale {
    0% { transform: scale(1); color: var(--oro-chiaro); }
    35% { transform: scale(1.22); color: #b6ffd4; }
    100% { transform: scale(1); color: var(--oro-chiaro); }
  }
  .moneta-piccola { width: 15px; height: 15px; vertical-align: -3px; }
  .etichetta-moneta {
    font-size: 0.66rem; letter-spacing: 1.1px; text-transform: uppercase;
    color: var(--tenue); font-weight: 600;
  }
  .moneta-nome {
    font-size: 0.62rem; font-style: normal; letter-spacing: 1px; text-transform: uppercase;
    color: var(--tenue); font-weight: 600; margin-left: 1px;
  }

  .insegna { text-align: center; }
  .insegna h1 {
    margin: 0; font-family: Georgia, serif; font-size: clamp(1.5rem, 4.2vw, 2.3rem);
    letter-spacing: 3px; font-weight: 700;
    background: linear-gradient(180deg, #fff6d8, var(--oro) 45%, var(--oro-scuro) 75%, #ffe9ae);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 2px 0 rgba(0,0,0,0.7));
  }
  .insegna .sotto { font-size: 0.82rem; color: var(--tenue); margin-top: 5px; letter-spacing: 0.6px; }

  /* ---------- titoli dei due banchi ---------- */
  .banco { width: 100%; max-width: 980px; display: flex; flex-direction: column; gap: 13px; }
  .titolo-banco {
    display: flex; align-items: center; gap: 12px; margin-top: 6px;
    font-family: Georgia, serif; font-size: 1.02rem; letter-spacing: 2.4px;
    text-transform: uppercase; color: var(--oro);
  }
  .titolo-banco::after {
    content: ''; flex: 1; height: 1px;
    background: linear-gradient(90deg, rgba(232,196,106,0.45), transparent);
  }
  .titolo-banco .spiega {
    font-family: 'Segoe UI', system-ui, sans-serif; font-size: 0.73rem;
    letter-spacing: 0.4px; text-transform: none; color: var(--tenue); flex: 0 0 auto;
  }

  .garanzia {
    display: flex; align-items: center; gap: 10px; padding: 9px 16px; border-radius: 12px;
    background: linear-gradient(168deg, rgba(74,53,32,0.85), rgba(28,19,12,0.9));
    border: 1px solid var(--oro-scuro); font-size: 0.83rem; color: var(--tenue);
  }
  .garanzia b { color: var(--oro); }
  .garanzia > svg { width: 20px; height: 20px; color: var(--oro); flex: 0 0 auto; }

  .vetrina {
    display: grid; gap: 13px; width: 100%;
    grid-template-columns: repeat(auto-fit, minmax(min(285px, 100%), 1fr));
  }


  /* ---------- una voce di listino ---------- */
  .offerta {
    position: relative; display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; border-radius: 14px; cursor: pointer; overflow: hidden;
    border: 1px solid var(--oro-scuro); text-decoration: none; color: inherit;
    background: linear-gradient(100deg, rgba(52,38,22,0.95), rgba(26,18,11,0.95));
    box-shadow: inset 0 1px 0 rgba(255,224,160,0.18), 0 5px 16px rgba(0,0,0,0.55);
    transition: transform 0.16s cubic-bezier(.2,.9,.3,1), box-shadow 0.16s, border-color 0.16s;
  }
  .offerta::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(105deg, transparent 38%, rgba(255,238,190,0.15) 50%, transparent 62%);
    transform: translateX(-130%); transition: transform 0.55s ease;
  }
  .offerta:hover { transform: translateY(-3px); border-color: var(--oro);
    box-shadow: 0 10px 26px rgba(0,0,0,0.7), 0 0 24px rgba(232,196,106,0.25); }
  .offerta:hover::after { transform: translateX(130%); }

  /* quello che non ti puoi ancora permettere resta visibile, ma spento:
     deve far venire voglia, non sembrare rotto */
  .offerta.spenta { opacity: 0.52; filter: saturate(0.45); }
  .offerta.spenta:hover { transform: none; border-color: var(--oro-scuro); box-shadow: inset 0 1px 0 rgba(255,224,160,0.18), 0 5px 16px rgba(0,0,0,0.55); }
  .offerta.spenta:hover::after { transform: translateX(-130%); }

  .offerta .involucro { width: 78px; flex: 0 0 auto; }
  .offerta .involucro svg { width: 100%; display: block; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.6)); }

  .offerta .dati { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .offerta .quante { font-family: Georgia, serif; font-size: 1.28rem; font-weight: 700; color: var(--oro-chiaro); letter-spacing: 0.5px; }
  .offerta .nome-taglio { font-size: 0.75rem; color: var(--tenue); text-transform: uppercase; letter-spacing: 1.4px; }
  .offerta .unitario { font-size: 0.74rem; color: var(--tenue); margin-top: 3px; }
  .offerta .manca { font-size: 0.74rem; color: var(--rosso); margin-top: 3px; }
  .offerta .regalo { font-size: 0.75rem; color: var(--verde); margin-top: 3px; font-weight: 600; }

  .offerta .prezzo-blocco { text-align: right; flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .offerta .prezzo {
    display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 0 5px;
    font-size: 1.18rem; font-weight: 800; color: var(--oro-chiaro); font-variant-numeric: tabular-nums;
  }
  /* la parola va sotto la cifra: accanto allungherebbe troppo la riga */
  .offerta .prezzo .moneta-nome { flex: 0 0 100%; text-align: right; line-height: 1.3; }
  .offerta .prezzo.euro { font-size: 1.3rem; }
  .offerta .sconto {
    font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 10px;
    background: linear-gradient(180deg, #9dffc4, var(--verde)); color: #05301a;
  }

  .bandiera {
    position: absolute; top: 0; right: 0; z-index: 2;
    font-size: 0.6rem; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase;
    padding: 4px 12px; border-bottom-left-radius: 10px; color: #1b1208;
  }
  .bandiera.popolare { background: linear-gradient(180deg, #bfe6ff, var(--blu)); color: #06202f; }
  .bandiera.conviene { background: linear-gradient(180deg, var(--oro-chiaro), var(--oro)); }
  .offerta.evidenziata { border-color: var(--oro); box-shadow: inset 0 1px 0 rgba(255,240,200,0.25), 0 0 22px rgba(232,196,106,0.3); }

  /* il richiamo al premio quotidiano, per chi non vuole spendere */
  .strada-gratis {
    width: 100%; max-width: 980px; display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; border-radius: 13px; text-decoration: none; color: inherit;
    border: 1px dashed rgba(88,196,138,0.55); background: rgba(30,60,44,0.35);
    transition: border-color 0.16s, background 0.16s;
  }
  .strada-gratis:hover { border-color: var(--verde); background: rgba(38,78,56,0.5); }
  .strada-gratis .testo { flex: 1; font-size: 0.85rem; line-height: 1.5; }
  .strada-gratis .testo b { color: #b6ffd4; }
  .strada-gratis .freccia { color: var(--verde); font-size: 1.2rem; }

  .nota {
    max-width: 720px; font-size: 0.72rem; color: #8a7e68; line-height: 1.55; text-align: center;
    border-top: 1px solid rgba(232,196,106,0.18); padding-top: 12px;
  }
  .nota b { color: var(--tenue); }
  .tabella-prob { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 7px 0; }
  .tabella-prob span { font-size: 0.72rem; padding: 2px 9px; border-radius: 9px; background: rgba(255,255,255,0.05); }
</style>
</head>
<body>

<div class="barra">
  <a class="torna" href="home.html"><img src="immagini/decorazioni/torna-home.webp" alt="" class="icona-torna">Torna alla home</a>
  <div class="borsellino" id="borsellino" title="I tuoi sharkini">
    <span class="moneta" id="moneta-saldo"></span>
    <span class="cifra" id="saldo">0</span>
    <span class="etichetta-moneta">sharkini</span>
  </div>
</div>

<div class="insegna">
  <h1>NEGOZIO</h1>
  <div class="sotto">Le carte si pagano in sharkini</div>
</div>

<!-- BANCO 1a e 1b: i pacchetti, in sharkini — due banchi distinti, non
     un filtro sopra uno solo, perché sono due acquisti diversi: chi vuole
     completare gli eroi non deve nemmeno vedere l'offerta delle magie, e
     viceversa. -->
<div class="garanzia" id="garanzia"></div>

<div class="banco">
  <div class="titolo-banco">Pacchetti Eroi <span class="spiega">solo personaggi</span></div>
  <div class="vetrina" id="vetrinaEroi"></div>
</div>

<div class="banco">
  <div class="titolo-banco">Pacchetti Carte Magiche <span class="spiega">solo Sorpresa e Trappola</span></div>
  <div class="vetrina" id="vetrinaMagiche"></div>
</div>

<a class="strada-gratis" href="home.html#premio">
  <span class="moneta" id="moneta-gratis" style="width:30px;height:30px;flex:0 0 auto"></span>
  <span class="testo" id="testo-gratis"></span>
  <span class="freccia">›</span>
</a>

<!-- BANCO 2: gli sharkini, in euro -->
<div class="banco">
  <div class="titolo-banco">Ricarica sharkini <span class="spiega">qui si usano gli euro</span></div>
  <div class="vetrina" id="ricariche"></div>
</div>

<div class="nota">
  <b>Probabilità di estrazione per ogni carta</b>
  <div class="tabella-prob" id="probabilita"></div>
  Ogni carta è estratta a sorte con le probabilità qui sopra, uguali per tutti i tagli.
  La garanzia scatta in base al numero di carte aperte, quindi comprare un taglio grande
  o tanti piccoli dà esattamente le stesse possibilità.
  <br><br>
  <b>Prezzi provvisori</b>, in attesa dei sistemi di pagamento di App Store e Play Store —
  che applicano una commissione e vanno decisi prima di pubblicare.
</div>

<script>
(function () {
"use strict";
__MOTORE__

__PONTE__

const $ = (id) => document.getElementById(id);
const euro = (n) => n.toFixed(2).replace('.', ',') + ' €';

// ------------------------------------------------------------
// LA MONETA
// Uno sharkino è una moneta d'oro con una pinna incisa sopra.
// Disegnata, non scaricata: la pagina deve aprirsi senza rete.
// ------------------------------------------------------------
function monetaSvg(dim) {
  const u = 'm' + Math.random().toString(36).slice(2, 8);
  return '<svg viewBox="0 0 40 40" width="' + dim + '" height="' + dim + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="' + u + '" x1="0" y1="0" x2="0.5" y2="1">' +
      '<stop offset="0%" stop-color="#fff3cc"/><stop offset="45%" stop-color="#e8c46a"/>' +
      '<stop offset="100%" stop-color="#8a6118"/></linearGradient></defs>' +
    '<circle cx="20" cy="20" r="18" fill="url(#' + u + ')" stroke="#6b4a10" stroke-width="1.6"/>' +
    '<circle cx="20" cy="20" r="14" fill="none" stroke="rgba(107,74,16,0.5)" stroke-width="1.1"/>' +
    // la pinna
    '<path d="M20 9 C25 15 28 21 29 26 C25 24 22 23.5 20 23.5 C18 23.5 15 24 11 26 C12 21 15 15 20 9 Z" fill="#6b4a10" opacity="0.82"/>' +
    // l onda sotto
    '<path d="M10 29 q2.6 -2 5.2 0 t5.2 0 t5.2 0 t4.4 0" fill="none" stroke="#6b4a10" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>' +
  '</svg>';
}
const MONETINA = () => '<span class="moneta-piccola">' + monetaSvg(15) + '</span>';

// ------------------------------------------------------------
// IL BORSELLINO, salvato sul dispositivo
// ------------------------------------------------------------
// Quello che possiedo lo dice il server, non questo browser.
let mio = { saldo: 0, contatorePity: 0, alleCarteAllaGaranzia: SOGLIA_PITY };

$('moneta-saldo').innerHTML = monetaSvg(26);
$('moneta-gratis').innerHTML = monetaSvg(30);

// ------------------------------------------------------------
// GLI INVOLUCRI DEI PACCHETTI
// ------------------------------------------------------------
const NOMI = { busta: 'Busta', trio: 'Terzetto', pacco: 'Pacco',
               scrigno: 'Scrigno', forziere: 'Forziere', tesoro: 'Tesoro' };
const COLORI = {
  busta:    ['#5b3fa8', '#2a1a5e'], trio:     ['#3f6ba8', '#1a3a5e'],
  pacco:    ['#3fa87e', '#1a5e42'], scrigno:  ['#a87f3f', '#5e441a'],
  forziere: ['#a83f6b', '#5e1a38'], tesoro:   ['#c9a24a', '#6b4a10']
};

function involucroSvg(id, quante) {
  const [chiaro, scuro] = COLORI[id] || COLORI.busta;
  const g = 'g_' + id;
  return '<svg viewBox="0 0 100 132" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="' + chiaro + '"/><stop offset="100%" stop-color="' + scuro + '"/>' +
    '</linearGradient></defs>' +
    '<rect x="5" y="5" width="90" height="122" rx="8" fill="url(#' + g + ')" stroke="#e8c46a" stroke-width="2.6"/>' +
    '<rect x="12" y="12" width="76" height="108" rx="5" fill="none" stroke="rgba(255,240,200,0.3)" stroke-width="1"/>' +
    '<path d="M5 27 l8 -4 l8 4 l8 -4 l8 4 l8 -4 l8 4 l8 -4 l8 4 l8 -4 l8 4 l7 -3" fill="none" stroke="rgba(255,240,200,0.5)" stroke-width="1.8" stroke-dasharray="3 3"/>' +
    '<g transform="translate(50 76)" font-family="Georgia, serif" text-anchor="middle">' +
      '<circle r="27" fill="rgba(0,0,0,0.28)"/>' +
      '<text y="-9" font-size="14" fill="#ff6b81">&#9829;</text>' +
      '<text y="21" font-size="14" fill="#ff6b81">&#9830;</text>' +
      '<text x="-16" y="6" font-size="14" fill="#e8e6f0">&#9827;</text>' +
      '<text x="16" y="6" font-size="14" fill="#e8e6f0">&#9824;</text>' +
    '</g>' +
    '<text x="50" y="118" font-size="15" text-anchor="middle" fill="#fff0c2" font-family="Georgia, serif" font-weight="bold">' + quante + '</text>' +
  '</svg>';
}

// il sacchetto di monete, per le ricariche
function sacchettoSvg(indice) {
  const g = 'sac_' + indice;
  const monete = Math.min(6, 1 + indice);
  let mucchio = '';
  for (let i = 0; i < monete; i++) {
    const x = 22 + (i % 3) * 19 + (i > 2 ? 9 : 0);
    const y = 34 - Math.floor(i / 3) * 13;
    mucchio += '<circle cx="' + x + '" cy="' + y + '" r="8.5" fill="#e8c46a" stroke="#8a6118" stroke-width="1.4"/>';
  }
  return '<svg viewBox="0 0 100 132" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0.6" y2="1">' +
      '<stop offset="0%" stop-color="#6b5236"/><stop offset="100%" stop-color="#33251533"/>' +
    '</linearGradient></defs>' +
    '<g transform="translate(0 78)">' + mucchio + '</g>' +
    '<path d="M30 52 q-14 22 -12 44 q2 26 32 26 q30 0 32 -26 q2 -22 -12 -44 Z"' +
      ' fill="url(#' + g + ')" stroke="#e8c46a" stroke-width="2.4"/>' +
    '<path d="M30 52 q20 -9 40 0" fill="none" stroke="#e8c46a" stroke-width="3.2" stroke-linecap="round"/>' +
  '</svg>';
}

// ------------------------------------------------------------
// BANCO 1a e 1b — I PACCHETTI, IN SHARKINI
//
// Due vetrine, non una vetrina con un filtro: sono due acquisti
// diversi. Stessi tagli, agli stessi prezzi, ma una pesca solo fra gli
// eroi e l'altra solo fra le Carte Magiche — chi vuole completare un
// seme, o mettere insieme le magie che gli mancano, prima era
// costretto a comprare pacchetti misti e sperare: metà delle carte non
// gli servivano mai.
// ------------------------------------------------------------
function disegnaVetrina(elId, tipo) {
  $(elId).innerHTML = OFFERTE.map((o) => {
    const sconto = scontoPercentuale(o);
    const posso = saldoPuoPagare(mio.saldo, o.costo);
    const manca = o.costo - mio.saldo;
    return '<a class="offerta' + (o.etichetta ? ' evidenziata' : '') + (posso ? '' : ' spenta') +
             '" href="spacchetta.html?carte=' + o.carte + '&tipo=' + tipo + '">' +
      (o.etichetta ? '<span class="bandiera ' + o.etichetta + '">' +
        (o.etichetta === 'popolare' ? 'Il più scelto' : 'Conviene di più') + '</span>' : '') +
      '<div class="involucro">' + involucroSvg(o.id, o.carte) + '</div>' +
      '<div class="dati">' +
        '<span class="quante">' + o.carte + (o.carte === 1 ? ' carta' : ' carte') + '</span>' +
        '<span class="nome-taglio">' + (NOMI[o.id] || o.id) + '</span>' +
        (posso
          ? '<span class="unitario">' + conNome(costoPerCarta(o)) + ' a carta</span>'
          : '<span class="manca">Ti ' + (manca === 1 ? 'manca 1 sharkino' : 'mancano ' + conNome(manca)) + '</span>') +
      '</div>' +
      '<div class="prezzo-blocco">' +
        '<span class="prezzo">' + MONETINA() + formattaSharkini(o.costo) +
          '<em class="moneta-nome">sharkini</em></span>' +
        (sconto > 0 ? '<span class="sconto">−' + sconto + '%</span>' : '') +
      '</div>' +
    '</a>';
  }).join('');
}
disegnaVetrina('vetrinaEroi', 'eroe');
disegnaVetrina('vetrinaMagiche', 'magia');

// ------------------------------------------------------------
// LA STRADA GRATIS
// Chi non vuole spendere deve sapere che esiste, e quanto ci mette.
// ------------------------------------------------------------
{
  const pacco = offertaPerCarte(CARTE_PER_PACCHETTO);
  $('testo-gratis').innerHTML =
    'Entra ogni giorno e ricevi <b>100 sharkini</b> il primo giorno, fino a <b>' +
    conNome(PREMIO_MASSIMO) + '</b> dal settimo in poi. ' +
    'In <b>un mese</b> di accessi di fila ti paghi il pacco da ' + CARTE_PER_PACCHETTO +
    ' carte, senza spendere un euro.';
}

// ------------------------------------------------------------
// BANCO 2 — GLI SHARKINI, IN EURO
// ------------------------------------------------------------
$('ricariche').innerHTML = RICARICHE.map((r, i) => {
  return '<a class="offerta' + (r.etichetta ? ' evidenziata' : '') + '" href="#" data-ricarica="' + r.id + '">' +
    (r.etichetta ? '<span class="bandiera ' + r.etichetta + '">' +
      (r.etichetta === 'popolare' ? 'Il più scelto' : 'Conviene di più') + '</span>' : '') +
    '<div class="involucro">' + sacchettoSvg(i) + '</div>' +
    '<div class="dati">' +
      '<span class="quante">' + MONETINA() + ' ' + conNome(r.sharkini) + '</span>' +
      '<span class="nome-taglio">nel borsellino</span>' +
      (r.extra > 0
        ? '<span class="regalo">+' + conNome(r.extra) + ' in regalo</span>'
        : '<span class="unitario">Ricarica minima</span>') +
    '</div>' +
    '<div class="prezzo-blocco">' +
      '<span class="prezzo euro">' + euro(r.euro) + '</span>' +
      (r.bonus > 0 ? '<span class="sconto">+' + Math.round(r.bonus * 100) + '%</span>' : '') +
    '</div>' +
  '</a>';
}).join('');

// Il pagamento vero passerà da App Store e Play Store. Finché non c'è,
// la ricarica accredita e basta, così il resto del gioco si può provare.
document.querySelectorAll('[data-ricarica]').forEach((nodo) => {
  nodo.addEventListener('click', async (e) => {
    e.preventDefault();
    nodo.style.pointerEvents = 'none';
    const r = await SCORTA.ricarica(nodo.getAttribute('data-ricarica'));
    nodo.style.pointerEvents = '';
    if (!r.ok) { return; }
    mio = r;
    aggiornaSaldo();
  });
});

function aggiornaSaldo() {
  const c = $('saldo');
  c.textContent = formattaSharkini(mio.saldo);
  c.classList.remove('cambiata');
  void c.offsetWidth;
  c.classList.add('cambiata');
  // i pacchetti che ora posso permettermi si riaccendono, in tutte e due le vetrine
  document.querySelectorAll('#vetrinaEroi .offerta, #vetrinaMagiche .offerta').forEach((nodo, i) => {
    const o = OFFERTE[i % OFFERTE.length];
    const posso = saldoPuoPagare(mio.saldo, o.costo);
    nodo.classList.toggle('spenta', !posso);
    const riga = nodo.querySelector('.unitario, .manca');
    if (posso) {
      riga.className = 'unitario';
      riga.textContent = conNome(costoPerCarta(o)) + ' a carta';
    } else {
      riga.className = 'manca';
      const m = o.costo - mio.saldo;
      riga.textContent = 'Ti ' + (m === 1 ? 'manca 1 sharkino' : 'mancano ' + conNome(m));
    }
  });
}

// ------------------------------------------------------------
// LA GARANZIA E LE PROBABILITÀ
// ------------------------------------------------------------
function disegnaGaranzia() {
$('garanzia').innerHTML =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 6.2L21 9.6l-4.8 4.3L17.6 21 12 17.6 6.4 21l1.4-7.1L3 9.6l6.6-1.4z"/></svg>' +
  '<span>Ogni <b>' + SOGLIA_PITY + '</b> carte aperte ricevi la garanzia: <b>1 carta ★5</b> e <b>2 carte ★4</b>. ' +
  'Te ne mancano <b>' + mio.alleCarteAllaGaranzia + '</b>.</span>';
}

// IL GIOCO HA TRE LIVELLI, NON CINQUE (vedi engine/pacchetti.js): questa
// riga girava ancora su [5,4,3,2,1], da quando i livelli erano cinque.
// PROBABILITA[1] e PROBABILITA[2] non esistono più: .toString() su
// undefined mandava in errore l'intero script a questo punto, e tutto
// quello che veniva dopo — la garanzia, il saldo vero dal server —
// non partiva mai. Ora si elencano solo i livelli che esistono davvero,
// dal più raro al più comune.
$('probabilita').innerHTML = [...LIVELLI_RARITA].reverse().map((r) =>
  '<span>' + '★'.repeat(r) + ' ' + PROBABILITA[r].toString().replace('.', ',') + '%</span>'
).join('');

// ------------------------------------------------------------
// SI PARTE CHIEDENDO CHI SONO E COSA HO
// ------------------------------------------------------------
(async function avvia() {
  const r = await SCORTA.io();
  if (r && r.ok) mio = r;
  aggiornaSaldo();
  disegnaGaranzia();
  avvisaSeDiProva();
})();

window.__prova = { offerte: OFFERTE, ricariche: RICARICHE, saldo: () => mio.saldo, dove: () => SCORTA.dove };
})();
</script>
</body>
</html>
'''

pagina = PAGINA.replace('__MOTORE__', motore).replace('__PONTE__', PONTE)
assert '__PONTE__' not in pagina and '__MOTORE__' not in pagina
# newline='\n' NON e' un dettaglio: senza, su Windows Python traduce
# ogni a-capo in CR+LF e la pagina esce diversa da quella generata su
# Linux o Mac, byte per byte. Il controllo di allineamento confronta
# proprio i byte, quindi segnalava tutte le pagine come 'rimaste
# indietro' su un computer e non sull'altro — e non era vero.
# Le pagine sono le stesse ovunque, e devono esserlo davvero.
io.open(DST, 'w', encoding='utf-8', newline='\n').write(pagina)
print('scritto', DST, os.path.getsize(DST), 'byte')
