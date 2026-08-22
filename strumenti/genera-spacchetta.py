# Genera client/spacchetta.html — la schermata di apertura pacchetti.
# Come per il tavolo, il motore (engine/pacchetti.js) e i dati carta
# vengono incorporati: la pagina si apre col doppio clic.
import re, io, os, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import PONTE

QUI = os.path.dirname(os.path.abspath(__file__))
# Il percorso del progetto si ricava da dove sta questo file, non si
# scrive a mano: così la cartella si può rinominare o spostare senza
# che nessuno se ne accorga.
PROG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(PROG, 'client', 'spacchetta.html')

# ---------- motore incorporato ----------
def impacchetta(nome):
    testo = io.open(os.path.join(PROG, 'engine', nome), encoding='utf-8').read()
    esportati = re.findall(r'^export\s+(?:function|const|let|class)\s+([A-Za-z0-9_$]+)', testo, flags=re.M)
    testo = re.sub(r'^import\s*\{[^}]*\}\s*from\s*[\'"]([^\'"]+)[\'"];?\s*$', '', testo, flags=re.M)
    testo = re.sub(r'^export\s+', '', testo, flags=re.M)
    guscio = '__' + nome[:3].upper()
    return ('\nconst %s = (function(){\n%s\nreturn {%s};\n})();\n' % (guscio, testo, ', '.join(esportati)) +
            'const {%s} = %s;\n' % (', '.join(esportati), guscio))

motore = impacchetta('sharkini.js') + impacchetta('pacchetti.js')

# ---------- l'involucro e la linea dello strappo ----------
# La dentellatura è a y=50 su un disegno alto 280, con i denti che
# scendono a y=57. Le stesse coordinate servono in due posti: nel
# disegno (in unità SVG) e nei clip-path (in percentuale). Le calcolo
# qui una volta sola, così non possono andare fuori sincrono.
ALTEZZA, LARGHEZZA = 280.0, 200.0
Y_ALTO, Y_BASSO = 50.0, 57.0
DENTI = [10 + 16 * i for i in range(12)]          # 10, 26, ... 186

def _linea_svg():
    d = 'M10 50'
    for i in range(1, len(DENTI)):
        d += ' l16 %d' % (7 if i % 2 else -7)
    return d + ' l14 -6'

LINEA_SVG = _linea_svg()

def _punti_linea():
    p = [(0.0, Y_ALTO)]
    for i, x in enumerate(DENTI):
        p.append((x, Y_ALTO if i % 2 == 0 else Y_BASSO))
    p.append((LARGHEZZA, Y_ALTO))
    return [(x / LARGHEZZA * 100, y / ALTEZZA * 100) for x, y in p]

def _pct(punti):
    return ', '.join('%.3f%% %.3f%%' % (x, y) for x, y in punti)

_L = _punti_linea()
TAGLIO_ALTO  = '0% 0%, 100% 0%, ' + _pct(list(reversed(_L)))
TAGLIO_BASSO = _pct(_L) + ', 100% 100%, 0% 100%'

INVOLUCRO = '''<svg viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="180" height="260" rx="14" fill="url(#busta)" stroke="url(#oroGrad)" stroke-width="4"/>
        <rect x="10" y="10" width="180" height="260" rx="14" fill="url(#lucido)"/>
        <rect x="22" y="22" width="156" height="236" rx="9" fill="none" stroke="rgba(255,240,200,0.28)" stroke-width="1.4"/>
        <text x="100" y="40" font-size="13" text-anchor="middle" fill="url(#oroGrad)"
              font-family="Georgia, serif" letter-spacing="4">STRAPPA QUI</text>
        <g transform="translate(100 158)">
          <circle r="54" fill="none" stroke="url(#oroGrad)" stroke-width="2.6" opacity="0.75"/>
          <circle r="42" fill="rgba(0,0,0,0.3)"/>
          <text y="-24" font-size="26" text-anchor="middle" fill="#ff6b81" font-family="Georgia, serif">&#9829;</text>
          <text y="34"  font-size="26" text-anchor="middle" fill="#ff6b81" font-family="Georgia, serif">&#9830;</text>
          <text x="-27" y="12" font-size="26" text-anchor="middle" fill="#e8e6f0" font-family="Georgia, serif">&#9827;</text>
          <text x="27"  y="12" font-size="26" text-anchor="middle" fill="#e8e6f0" font-family="Georgia, serif">&#9824;</text>
          <circle r="9" fill="url(#oroGrad)"/>
        </g>
        <text x="100" y="250" font-size="15" text-anchor="middle" fill="url(#oroGrad)"
              font-family="Georgia, serif" letter-spacing="3">PACCHETTO</text>
        <!-- il bordo dello strappo: a pacchetto chiuso le due copie si
             sovrappongono e sembra una perforazione, appena si aprono
             ognuna mostra la sua meta di frastagliatura -->
        <path class="dentellatura" d="__LINEA__" fill="none"
              stroke="rgba(255,240,200,0.5)" stroke-width="2.2" stroke-dasharray="5 4"/>
        <path class="orlo" d="__LINEA__" fill="none" stroke="#ffe9ae" stroke-width="2" opacity="0"/>
      </svg>'''.replace('__LINEA__', LINEA_SVG)

# ---------- dati carta incorporati ----------
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
<title>Burraco Legends — Apri il pacchetto</title>
<style>
  /* ============================================================
     APERTURA DEI PACCHETTI
     È il momento più emozionante del gioco: il pacchetto si strappa,
     le carte escono una alla volta e si girano, e più la carta è rara
     più la messinscena cresce. Tutto disegnato in CSS e SVG.
     ============================================================ */
  :root {
    --oro: #e8c46a; --oro-chiaro: #fff0c2; --oro-scuro: #9a6f21;
    --pergamena: #f2e6cc; --tenue: #b7a686; --notte: #0b0810;
    /* un colore per ogni grado di rarità: più stelle, più acceso */
    --r1: #8d93a3; --r2: #63c27e; --r3: #4aa3f0; --r4: #b070f5; --r5: #ffb347;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; overflow: hidden; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif; color: var(--pergamena);
    background: radial-gradient(ellipse at 50% 42%, #241a35 0%, #120d1c 55%, var(--notte) 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    user-select: none;
  }

  /* stelle di fondo */
  .stelle { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
  .stella { position: absolute; border-radius: 50%; background: #fff; animation: brilla ease-in-out infinite; }
  @keyframes brilla { 0%,100% { opacity: 0.12; } 50% { opacity: 0.6; } }

  /* raggi che ruotano, si accendono solo per le carte rare */
  .raggi {
    position: fixed; width: 200vmax; height: 200vmax; z-index: 1; pointer-events: none;
    left: 50%; top: 50%; margin-left: -100vmax; margin-top: -100vmax;
    background: repeating-conic-gradient(from 0deg, rgba(255,255,255,0.14) 0deg 4deg, transparent 4deg 13deg);
    animation: gira 24s linear infinite; opacity: 0; transition: opacity 0.6s;
  }
  @keyframes gira { to { transform: rotate(360deg); } }

  .schermo { position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center; gap: 2.4vh; width: 100%; }

  /* ---------- 1. IL PACCHETTO CHIUSO ---------- */
  .pacchetto {
    position: relative; width: min(30vh, 74vw); cursor: pointer;
    animation: ondeggia 3.4s ease-in-out infinite;
  }
  .pacchetto:hover { animation-play-state: paused; }
  .pacchetto svg { width: 100%; display: block; }
  @keyframes ondeggia {
    0%,100% { transform: translateY(0) rotate(-1.4deg); }
    50%     { transform: translateY(-1.6vh) rotate(1.4deg); }
  }
  /* ---------- LO STRAPPO DELL'INVOLUCRO ----------
     L'involucro è disegnato DUE VOLTE, uno sopra l'altro, e ogni copia
     è ritagliata lungo la dentellatura con clip-path: sopra resta solo
     la linguetta, sotto solo il corpo. Sono due <div> normali, non
     gruppi SVG: prima le animazioni erano su <g> con clip-path e il
     browser non le mostrava, per questo si vedeva solo lo scuotimento.
     Ora lo strappo si apre lento, poi la linguetta vola e il corpo cade. */
  .meta {
    position: absolute; inset: 0; transform-origin: 50% 18%;
    filter: drop-shadow(0 2vh 3vh rgba(0,0,0,0.7));
  }
  .meta-alta  { clip-path: polygon(__TAGLIO_ALTO__); z-index: 2; }
  .meta-bassa { clip-path: polygon(__TAGLIO_BASSO__); z-index: 1; }
  /* una copia invisibile tiene l'altezza del contenitore */
  .meta-misura { position: relative; visibility: hidden; }
  /* la perforazione sparisce nel momento in cui si strappa e al suo
     posto resta l'orlo lacerato, pieno */
  .pacchetto.strappato .dentellatura { opacity: 0; }
  .pacchetto.strappato .orlo { opacity: 0.9; }

  .pacchetto.strappato { animation: none; }
  .pacchetto.strappato .meta-alta  { animation: linguettaVia 1.05s ease-in both; }
  .pacchetto.strappato .meta-bassa { animation: corpoGiu    1.05s ease-in both; }

  /* la linguetta: prima si solleva piano da un lato (lo strappo che si
     apre e si vede), poi parte di scatto verso l'alto a destra */
  @keyframes linguettaVia {
    0%   { transform: translate(0,0) rotate(0deg); opacity: 1; }
    14%  { transform: translate(-1%, -1%) rotate(-3deg); opacity: 1; }
    30%  { transform: translate(1%, -4%) rotate(-9deg); opacity: 1; }
    46%  { transform: translate(4%, -9%) rotate(-15deg); opacity: 1; }
    100% { transform: translate(74%, -125%) rotate(-62deg); opacity: 0; }
  }
  /* il corpo resiste, si inclina dall'altra parte e poi sprofonda */
  @keyframes corpoGiu {
    0%   { transform: translate(0,0) rotate(0deg); opacity: 1; }
    14%  { transform: translate(1%, 1%) rotate(2deg); opacity: 1; }
    30%  { transform: translate(-1%, 2%) rotate(4deg); opacity: 1; }
    46%  { transform: translate(-3%, 4%) rotate(7deg); opacity: 1; }
    100% { transform: translate(-26%, 118%) rotate(24deg) scale(0.88); opacity: 0; }
  }
  /* bagliore che esce dallo squarcio mentre le due metà si separano */
  .squarcio {
    position: absolute; left: 4%; right: 4%; top: 17.4%; height: 3%;
    border-radius: 50%; pointer-events: none; opacity: 0; z-index: 3;
    background: radial-gradient(ellipse, #ffffff 0%, #fff6d0 30%, #ffd97a 55%, transparent 78%);
  }
  .pacchetto.strappato .squarcio { animation: squarcioLuce 1s ease-out both; }
  @keyframes squarcioLuce {
    0%   { opacity: 0;    transform: scaleY(0.2) scaleX(0.5); }
    30%  { opacity: 0.85; transform: scaleY(2.2) scaleX(1); }
    50%  { opacity: 1;    transform: scaleY(6)   scaleX(1.15); }
    100% { opacity: 0;    transform: scaleY(16)  scaleX(1.35); }
  }

  .invito { font-size: 1.05rem; letter-spacing: 2.4px; text-transform: uppercase; color: var(--oro);
            animation: pulsaInvito 1.9s ease-in-out infinite; }
  @keyframes pulsaInvito { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
  .quante-dentro { font-size: 1.15rem; color: var(--pergamena); letter-spacing: 1px; }
  .quante-dentro b { color: var(--oro-chiaro); font-size: 1.5rem; }
  .costo-pacchetto {
    display: flex; align-items: center; gap: 6px; font-size: 1rem;
    color: var(--oro); font-variant-numeric: tabular-nums;
  }

  /* il borsellino, sempre in vista in alto a destra */
  .borsellino {
    position: fixed; top: 2vh; right: 2vh; z-index: 9;
    display: flex; align-items: center; gap: 7px; padding: 6px 13px 6px 7px;
    border-radius: 999px; border: 1px solid var(--oro-scuro);
    background: linear-gradient(168deg, rgba(74,53,32,0.92), rgba(24,17,10,0.95));
    box-shadow: 0 3px 12px rgba(0,0,0,0.6);
  }
  .borsellino .cifra { font-size: 0.98rem; font-weight: 800; color: var(--oro-chiaro); font-variant-numeric: tabular-nums; }
  .borsellino .etichetta-moneta {
    font-size: 0.58rem; letter-spacing: 1px; text-transform: uppercase;
    color: var(--tenue); font-weight: 600;
  }
  .borsellino .cifra.scesa { animation: saldoScende 0.8s ease-out; }
  @keyframes saldoScende {
    0%   { transform: scale(1.18); color: #ffb0a8; }
    100% { transform: scale(1); color: var(--oro-chiaro); }
  }

  /* quando gli sharkini non bastano */
  .niente-soldi {
    display: flex; flex-direction: column; align-items: center; gap: 1.8vh;
    text-align: center; max-width: 34rem; padding: 0 1.5rem;
  }
  .niente-soldi .lucchetto { opacity: 0.85; filter: grayscale(0.55); }
  .niente-soldi h2 { margin: 0; font-family: Georgia, serif; font-size: 2.7vh; color: var(--oro-chiaro); }
  .niente-soldi p { margin: 0; font-size: 1.6vh; color: var(--tenue); line-height: 1.6; }
  .niente-soldi .consiglio { color: #b6ffd4; }
  .niente-soldi .consiglio b { color: #d9ffe9; }
  .niente-soldi .bottoni { display: flex; gap: 1.2vh; flex-wrap: wrap; justify-content: center; margin-top: 1vh; }
  .contatore-pity { font-size: 0.78rem; color: var(--tenue); }
  .contatore-pity b { color: var(--oro); }

  /* ---------- 2. LA CARTA CHE SI GIRA ---------- */
  /* Il palco resta a zero finché non arrivano le carte: se tiene i suoi
     62vh anche a pacchetto chiuso, spinge il pacchetto in cima allo
     schermo e non è più centrato. */
  .palco { position: relative; width: 100%; display: flex; align-items: center; justify-content: center; min-height: 0; }
  .palco.attivo { min-height: 62vh; }
  .scena-carta { perspective: 1400px; display: none; }
  .scena-carta.viva { display: block; }

  .carta3d {
    position: relative; width: calc(52vh * 0.7); height: 52vh; max-width: 86vw;
    transform-style: preserve-3d; cursor: pointer;
    animation: cartaArriva 0.55s cubic-bezier(.2,.9,.3,1) both;
  }
  @keyframes cartaArriva {
    0%   { transform: translateY(34vh) scale(0.4) rotateZ(-14deg); opacity: 0; }
    70%  { transform: translateY(-1.6vh) scale(1.05) rotateZ(2deg); opacity: 1; }
    100% { transform: translateY(0) scale(1) rotateZ(0); opacity: 1; }
  }
  .carta3d.girata .faccia-interna { transform: rotateY(180deg); }
  .faccia-interna {
    position: relative; width: 100%; height: 100%; transform-style: preserve-3d;
    transition: transform 0.72s cubic-bezier(.4,.1,.2,1);
  }
  .faccia {
    position: absolute; inset: 0; backface-visibility: hidden; border-radius: 2.2vh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    overflow: hidden; box-sizing: border-box;
  }

  /* dorso */
  .dorso {
    border: 0.45vh solid var(--oro-scuro);
    background:
      repeating-linear-gradient(45deg, #2c2140 0 1.2vh, #241a35 1.2vh 2.4vh),
      #241a35;
    box-shadow: inset 0 0 6vh rgba(0,0,0,0.75);
  }
  .dorso .marchio { width: 40%; opacity: 0.9; }

  /* fronte */
  .fronte {
    transform: rotateY(180deg); padding: 3vh 2.4vh; gap: 1.2vh; text-align: center;
    border: 0.45vh solid var(--bordo, var(--r1));
    background: radial-gradient(ellipse at 50% 20%, var(--velo, rgba(255,255,255,0.12)), transparent 62%),
                linear-gradient(168deg, #2a2140 0%, #1a1428 60%, #120d1c 100%);
    box-shadow: inset 0 0 4vh rgba(0,0,0,0.6), 0 0 6vh var(--alone, transparent);
  }
  .fronte .simbolo { font-size: 9vh; line-height: 1; text-shadow: 0 0 4vh currentColor, 0 0 1vh #fff; }
  .fronte .nome { font-family: Georgia, serif; font-size: 3vh; font-weight: 700; line-height: 1.15; color: var(--oro-chiaro); }
  .fronte .stelle-carta { font-size: 2.4vh; color: var(--bordo, var(--r1)); letter-spacing: 0.3vh; }
  .fronte .desc { font-size: 1.65vh; color: var(--tenue); line-height: 1.4; max-width: 94%; }
  .fronte .stat { font-size: 1.8vh; color: #d9cdf2; }
  .fronte .etichetta {
    position: absolute; top: 1.4vh; left: 50%; transform: translateX(-50%);
    font-size: 1.35vh; font-weight: 900; letter-spacing: 0.25vh; text-transform: uppercase;
    padding: 0.5vh 1.6vh; border-radius: 2vh; white-space: nowrap;
  }
  .etichetta.nuova { background: linear-gradient(180deg, #9dffc4, #35c46f); color: #05301a; box-shadow: 0 0 2.4vh rgba(53,196,111,0.85); }
  .etichetta.doppia { background: rgba(0,0,0,0.55); color: var(--tenue); border: 1px solid rgba(255,255,255,0.22); }

  /* alone dietro la carta, tanto più forte quanto è rara */
  .aura {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
    width: 84vh; height: 84vh; border-radius: 50%; pointer-events: none; z-index: -1;
    background: radial-gradient(circle, var(--alone, transparent) 0%, transparent 62%);
    opacity: 0; transition: opacity 0.5s;
  }
  .aura.accesa { opacity: 1; animation: respiroAura 2.6s ease-in-out infinite; }
  @keyframes respiroAura { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.09); } }

  /* ---------- coriandoli e scintille ---------- */
  .particella {
    position: fixed; z-index: 6; pointer-events: none; border-radius: 50%;
    animation: schizza cubic-bezier(.15,.7,.4,1) forwards;
  }
  @keyframes schizza {
    0%   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.2); }
  }
  .coriandolo {
    position: fixed; z-index: 6; pointer-events: none; width: 0.9vh; height: 1.6vh; border-radius: 1px;
    animation: cade linear forwards;
  }
  @keyframes cade {
    0%   { opacity: 1; transform: translate(-50%,-50%) rotate(0); }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), 92vh) rotate(var(--giro)); }
  }

  /* ---------- barra di avanzamento delle carte ---------- */
  .segnaposti { display: flex; gap: 1vh; }
  .segnaposto {
    width: 1.5vh; height: 1.5vh; border-radius: 50%; background: rgba(255,255,255,0.16);
    border: 1px solid rgba(255,255,255,0.25); transition: background 0.3s, transform 0.3s;
  }
  .segnaposto.fatto { background: var(--oro); box-shadow: 0 0 1.4vh var(--oro); }
  .segnaposto.corrente { transform: scale(1.5); background: var(--oro-chiaro); box-shadow: 0 0 2vh var(--oro-chiaro); }

  .suggerimento { font-size: 0.86rem; color: var(--tenue); letter-spacing: 1.4px; min-height: 1.3em; }

  /* ---------- 3. RIEPILOGO ---------- */
  .riepilogo { display: none; flex-direction: column; align-items: center; gap: 2vh; animation: entraRiep 0.5s ease-out; }
  .riepilogo.viva { display: flex; }
  @keyframes entraRiep { from { opacity: 0; transform: translateY(2.4vh); } to { opacity: 1; } }
  .riepilogo h2 { margin: 0; font-family: Georgia, serif; font-size: 3.4vh; color: var(--oro-chiaro); letter-spacing: 0.3vh; }
  .griglia { display: flex; gap: 1.4vh; flex-wrap: wrap; justify-content: center; }
  .mini {
    width: 13vh; height: 18.5vh; border-radius: 1.2vh; padding: 1.2vh 0.8vh;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5vh;
    text-align: center; border: 2px solid var(--bordo); position: relative;
    background: linear-gradient(168deg, #2a2140, #14101f);
    box-shadow: 0 0 2.4vh var(--alone, transparent);
    animation: miniEntra 0.4s backwards;
  }
  @keyframes miniEntra { from { opacity: 0; transform: translateY(2vh) scale(0.9); } }
  .mini .sim { font-size: 3.4vh; line-height: 1; }
  .mini .nm { font-size: 1.35vh; font-weight: 700; line-height: 1.15; }
  .mini .st { font-size: 1.2vh; color: var(--bordo); }
  .mini .tag { position: absolute; top: -0.9vh; font-size: 1vh; font-weight: 900; padding: 0.25vh 0.9vh; border-radius: 1vh; letter-spacing: 0.1vh; }
  .mini .tag.nuova { background: #35c46f; color: #05301a; }
  .mini .tag.doppia { background: #3b3550; color: var(--tenue); }

  .incasso { font-size: 1rem; color: var(--tenue); }
  .incasso b { color: var(--oro); }

  .bottoni { display: flex; gap: 1.4vh; flex-wrap: wrap; justify-content: center; }
  .bottone {
    padding: 1.4vh 3vh; border-radius: 1.2vh; border: 2px solid var(--oro-scuro); cursor: pointer;
    font-size: 1rem; font-weight: 700; letter-spacing: 0.1vh; text-decoration: none;
    background: linear-gradient(180deg, #4a3520, #2a1c10); color: var(--pergamena);
    box-shadow: inset 0 1px 0 rgba(255,224,160,0.22), 0 0.6vh 1.8vh rgba(0,0,0,0.55);
    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
  }
  .bottone:hover { transform: translateY(-2px); border-color: var(--oro); box-shadow: 0 1vh 2.4vh rgba(0,0,0,0.6), 0 0 2vh rgba(232,196,106,0.35); }
  .bottone.principale { background: linear-gradient(180deg, var(--oro-chiaro), var(--oro)); color: #1b1208; border-color: var(--oro-chiaro); }

  .torna { position: fixed; top: 2vh; left: 2vh; z-index: 8; font-size: 0.85rem; color: var(--tenue); text-decoration: none; }
  .torna:hover { color: var(--oro); }
</style>
</head>
<body>

<a class="torna" href="home.html">← Torna alla home</a>
<div class="borsellino" id="borsellino" title="I tuoi sharkini">
  <span id="moneta-saldo"></span><span class="cifra" id="saldo">0</span><span class="etichetta-moneta">sharkini</span>
</div>
<div class="stelle" id="stelle"></div>
<div class="raggi" id="raggi"></div>

<div class="schermo">

  <!-- 1. pacchetto chiuso -->
  <div id="fase-chiuso" style="display:flex;flex-direction:column;align-items:center;gap:2.4vh">
    <div class="pacchetto" id="pacchetto" title="Tocca per aprire">
      <!-- i colori dell'involucro, dichiarati una volta sola -->
      <svg width="0" height="0" style="position:absolute" xmlns="http://www.w3.org/2000/svg"><defs>
        <linearGradient id="busta" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stop-color="#5b3fa8"/>
          <stop offset="45%"  stop-color="#38246e"/>
          <stop offset="100%" stop-color="#1d1240"/>
        </linearGradient>
        <linearGradient id="oroGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#fff2c8"/>
          <stop offset="50%"  stop-color="#e8c46a"/>
          <stop offset="100%" stop-color="#8a6118"/>
        </linearGradient>
        <linearGradient id="lucido" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stop-color="#fff" stop-opacity="0"/>
          <stop offset="45%" stop-color="#fff" stop-opacity="0.22"/>
          <stop offset="60%" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
      </defs></svg>
      <!-- copia invisibile: serve solo a dare l'altezza al contenitore -->
      <div class="meta-misura">__INVOLUCRO__</div>
      <!-- corpo del pacchetto: ritagliato sotto la dentellatura -->
      <div class="meta meta-bassa">__INVOLUCRO__</div>
      <!-- linguetta: ritagliata sopra la dentellatura -->
      <div class="meta meta-alta">__INVOLUCRO__</div>
      <div class="squarcio"></div>
    </div>
    <div class="quante-dentro" id="quante-dentro"></div>
    <div class="costo-pacchetto" id="costo-pacchetto"></div>
    <div class="invito" id="invito">Tocca per strappare</div>
    <div class="contatore-pity" id="pity"></div>
  </div>

  <!-- 2. carte una alla volta -->
  <div class="palco" id="palco">
    <div class="aura" id="aura"></div>
    <div class="scena-carta" id="scena">
      <div class="carta3d" id="carta3d">
        <div class="faccia-interna">
          <div class="faccia dorso">
            <svg class="marchio" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#e8c46a" stroke-width="2.4" opacity="0.7"/>
              <text x="50" y="40" font-size="20" text-anchor="middle" fill="#ff6b81" font-family="Georgia, serif">♥</text>
              <text x="50" y="76" font-size="20" text-anchor="middle" fill="#ff6b81" font-family="Georgia, serif">♦</text>
              <text x="28" y="60" font-size="20" text-anchor="middle" fill="#e8e6f0" font-family="Georgia, serif">♣</text>
              <text x="72" y="60" font-size="20" text-anchor="middle" fill="#e8e6f0" font-family="Georgia, serif">♠</text>
            </svg>
          </div>
          <div class="faccia fronte" id="fronte"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="segnaposti" id="segnaposti"></div>
  <div class="suggerimento" id="suggerimento"></div>

  <!-- 3. riepilogo -->
  <div class="riepilogo" id="riepilogo">
    <h2 id="titoloRiep">Il tuo bottino</h2>
    <div class="griglia" id="griglia"></div>
    <div class="incasso" id="incasso"></div>
    <div class="bottoni">
      <a class="bottone principale" href="negozio.html">Compra un altro pacchetto</a>
      <a class="bottone" href="album.html">Vedi l'album</a>
      <a class="bottone" href="home.html">Torna alla home</a>
    </div>
  </div>

</div>

<script>
(function () {
"use strict";
__MOTORE__
__DATI__

// ------------------------------------------------------------
// COLORI DELLE RARITÀ
// Più stelle, più il colore è caldo e l'alone forte. È il segnale che
// fa capire al volo se è uscito qualcosa di grosso, prima ancora di
// leggere il nome.
// ------------------------------------------------------------
const STILE_RARITA = {
  1: { colore: '#8d93a3', alone: 'rgba(141,147,163,0.30)', velo: 'rgba(200,210,230,0.10)', nome: 'Comune',      particelle: 10, raggi: 0,    scossa: false },
  2: { colore: '#63c27e', alone: 'rgba(99,194,126,0.38)',  velo: 'rgba(120,240,160,0.14)', nome: 'Non comune',  particelle: 18, raggi: 0,    scossa: false },
  3: { colore: '#4aa3f0', alone: 'rgba(74,163,240,0.48)',  velo: 'rgba(120,190,255,0.18)', nome: 'Rara',        particelle: 30, raggi: 0.18, scossa: false },
  4: { colore: '#b070f5', alone: 'rgba(176,112,245,0.60)', velo: 'rgba(200,150,255,0.24)', nome: 'Epica',       particelle: 48, raggi: 0.34, scossa: true  },
  5: { colore: '#ffb347', alone: 'rgba(255,179,71,0.75)',  velo: 'rgba(255,215,150,0.32)', nome: 'Leggendaria', particelle: 80, raggi: 0.55, scossa: true  }
};

const $ = (id) => document.getElementById(id);
const testo = (id) => TESTI[id] || { nome: id, descrizione: '' };
const stelle = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

// La collezione e il contatore della garanzia vivono nel browser: senza
// un account non c'è dove salvarli. Quando ci sarà il server, questi due
// valori vanno di là — sono il tipo di dato che un giocatore non deve
// poter modificare.
function leggi(chiave, fallback) {
  try { const v = localStorage.getItem(chiave); return v === null ? fallback : JSON.parse(v); }
  catch (e) { return fallback; }
}
function scrivi(chiave, valore) {
  try { localStorage.setItem(chiave, JSON.stringify(valore)); } catch (e) {}
}

__PONTE__

// Quello che possiedo lo dice il server. Qui si tiene solo l'ultima
// risposta ricevuta, per poterla mostrare.
let mio = { saldo: 0, alleCarteAllaGaranzia: SOGLIA_PITY };

// Quante carte contiene questo pacchetto: lo dice il negozio
// nell'indirizzo (spacchetta.html?carte=10). Senza indicazione vale il
// taglio normale. Il valore viene ripulito: un indirizzo modificato a
// mano non deve poter regalare cento carte.
const QUANTE = (function () {
  const n = parseInt(new URLSearchParams(location.search).get('carte'), 10);
  const ammesse = OFFERTE.map((o) => o.carte);
  return ammesse.includes(n) ? n : CARTE_PER_PACCHETTO;
})();
let risultato = null, indice = 0, girata = false;

// ---------- fondo stellato ----------
(function stelleDiSfondo() {
  let html = '';
  for (let i = 0; i < 90; i++) {
    const d = (0.8 + Math.random() * 2).toFixed(1);
    html += '<div class="stella" style="left:' + (Math.random() * 100).toFixed(1) + '%;top:' +
            (Math.random() * 100).toFixed(1) + '%;width:' + d + 'px;height:' + d + 'px;' +
            'animation-duration:' + (2 + Math.random() * 4).toFixed(1) + 's;' +
            'animation-delay:-' + (Math.random() * 6).toFixed(1) + 's"></div>';
  }
  $('stelle').innerHTML = html;
})();

// ------------------------------------------------------------
// IL CONTO
// Il pacchetto si paga in sharkini, e si paga QUI, nel momento in cui
// si strappa. Metterlo nel negozio sembrava più comodo, ma chi arriva
// direttamente a questo indirizzo passerebbe alla cassa senza pagare.
// ------------------------------------------------------------
const OFFERTA = offertaPerCarte(QUANTE);
if (!OFFERTA) location.replace('negozio.html');

// la moneta: un tondo d'oro con una pinna incisa. Disegnata, non
// scaricata — questa pagina deve aprirsi anche senza rete.
function monetaSvg(dim) {
  const u = 'm' + Math.random().toString(36).slice(2, 8);
  return '<svg viewBox="0 0 40 40" width="' + dim + '" height="' + dim + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="' + u + '" x1="0" y1="0" x2="0.5" y2="1">' +
      '<stop offset="0%" stop-color="#fff3cc"/><stop offset="45%" stop-color="#e8c46a"/>' +
      '<stop offset="100%" stop-color="#8a6118"/></linearGradient></defs>' +
    '<circle cx="20" cy="20" r="18" fill="url(#' + u + ')" stroke="#6b4a10" stroke-width="1.6"/>' +
    '<circle cx="20" cy="20" r="14" fill="none" stroke="rgba(107,74,16,0.5)" stroke-width="1.1"/>' +
    '<path d="M20 9 C25 15 28 21 29 26 C25 24 22 23.5 20 23.5 C18 23.5 15 24 11 26 C12 21 15 15 20 9 Z" fill="#6b4a10" opacity="0.82"/>' +
    '<path d="M10 29 q2.6 -2 5.2 0 t5.2 0 t5.2 0 t4.4 0" fill="none" stroke="#6b4a10" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>' +
  '</svg>';
}

$('moneta-saldo').innerHTML = monetaSvg(22);
function aggiornaBorsellino(scesa) {
  const c = $('saldo');
  c.textContent = formattaSharkini(mio.saldo);
  if (scesa !== false) { c.classList.remove('scesa'); void c.offsetWidth; c.classList.add('scesa'); }
}
aggiornaBorsellino(false);

function saldoInsufficiente() {
  const manca = OFFERTA.costo - mio.saldo;
  $('fase-chiuso').innerHTML =
    '<div class="niente-soldi">' +
      '<div class="lucchetto">' + monetaSvg(72) + '</div>' +
      '<h2>Ti ' + (manca === 1 ? 'manca 1 sharkino' : 'mancano ' + conNome(manca)) + '</h2>' +
      '<p>Il pacchetto da ' + QUANTE + (QUANTE === 1 ? ' carta' : ' carte') + ' costa ' +
        conNome(OFFERTA.costo) + '. Tu ne hai ' + formattaSharkini(mio.saldo) + '.</p>' +
      '<p class="consiglio">Entrando ogni giorno guadagni fino a ' + conNome(PREMIO_MASSIMO) +
        ': ti bastano <b>' + giorniPerRaccogliere(manca) + ' giorni</b> di accessi di fila.</p>' +
      '<div class="bottoni">' +
        '<a class="bottone principale" href="home.html#premio">Ritira il premio di oggi</a>' +
        '<a class="bottone" href="negozio.html">Torna al negozio</a>' +
      '</div>' +
    '</div>';
}

$('invito').textContent = 'Tocca per strappare';
$('quante-dentro').innerHTML = '<b>' + QUANTE + '</b> ' + (QUANTE === 1 ? 'carta' : 'carte') + ' dentro';
$('costo-pacchetto').innerHTML = monetaSvg(19) + conNome(OFFERTA.costo);

// Si comincia chiedendo al server chi sono e cosa ho. Finché non
// risponde, il pacchetto non si tocca: sennò si toccherebbe senza
// sapere se ci sono gli sharkini per pagarlo.
(async function chiediChiSono() {
  const r = await SCORTA.io();
  if (r && r.ok) mio = r;
  aggiornaBorsellino(false);
  $('pity').innerHTML = 'Ancora <b>' + mio.alleCarteAllaGaranzia + '</b> carte alla ★5 garantita';
  avvisaSeDiProva();
  if (!saldoPuoPagare(mio.saldo, OFFERTA.costo)) saldoInsufficiente();
})();

// ------------------------------------------------------------
// PARTICELLE
// ------------------------------------------------------------
function scintille(x, y, quante, colore) {
  for (let i = 0; i < quante; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 340;
    const d = document.createElement('div');
    d.className = 'particella';
    const dim = 2 + Math.random() * 5;
    d.style.cssText =
      'left:' + x + 'px;top:' + y + 'px;width:' + dim + 'px;height:' + dim + 'px;' +
      'background:' + colore + ';box-shadow:0 0 ' + (dim * 3) + 'px ' + colore + ';' +
      '--dx:' + (Math.cos(ang) * dist).toFixed(0) + 'px;--dy:' + (Math.sin(ang) * dist).toFixed(0) + 'px;' +
      'animation-duration:' + (0.7 + Math.random() * 0.8).toFixed(2) + 's';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }
}

function coriandoli(quanti) {
  const colori = ['#ffd97a', '#ff8fa3', '#8fd8ff', '#c0ff9b', '#e0a9ff'];
  for (let i = 0; i < quanti; i++) {
    const d = document.createElement('div');
    d.className = 'coriandolo';
    d.style.cssText =
      'left:' + (Math.random() * 100) + 'vw;top:-4vh;' +
      'background:' + colori[i % colori.length] + ';' +
      '--dx:' + (Math.random() * 200 - 100).toFixed(0) + 'px;' +
      '--giro:' + (Math.random() * 1200 - 600).toFixed(0) + 'deg;' +
      'animation-duration:' + (2.2 + Math.random() * 2).toFixed(2) + 's;' +
      'animation-delay:' + (Math.random() * 0.5).toFixed(2) + 's';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 5200);
  }
}

function scuotiSchermo(forza) {
  const b = document.body;
  let t = 0;
  const passo = () => {
    t += 1;
    if (t > 12) { b.style.transform = ''; return; }
    const f = forza * (1 - t / 12);
    b.style.transform = 'translate(' + ((Math.random() - 0.5) * f).toFixed(1) + 'px,' +
                                       ((Math.random() - 0.5) * f).toFixed(1) + 'px)';
    requestAnimationFrame(passo);
  };
  passo();
}

// ------------------------------------------------------------
// APERTURA
// ------------------------------------------------------------
// se il saldo non basta il pacchetto non è nemmeno stato disegnato:
// non c'è niente da toccare
if ($('pacchetto')) $('pacchetto').addEventListener('click', apriIlPacchetto, { once: true });

// LE CARTE LE ESTRAE IL SERVER, non questa pagina. Qui si chiede di
// aprire un pacchetto e si mette in scena quello che risponde: se
// l'estrazione avvenisse qui, basterebbe cambiare due righe nel browser
// per farsi uscire solo carte a cinque stelle.
async function apriIlPacchetto() {
  $('pacchetto').style.pointerEvents = 'none';

  // LO STRAPPO PARTE SUBITO, la domanda al server viaggia insieme.
  // Se aspettassimo la risposta prima di muovere il pacchetto, fra il
  // dito e l'animazione ci sarebbe il tempo della rete — un ritardo
  // che non si capisce e che fa sembrare la pagina rotta. Così invece
  // lo strappo dura il suo secondo abbondante e la risposta arriva
  // dentro quel tempo, senza che nessuno se ne accorga.
  const inArrivo = SCORTA.compra(QUANTE);
  avviaLoStrappo();

  const r = await inArrivo;
  if (!r || !r.ok) {
    // Il server ha detto di no: si torna indietro. Meglio un passo
    // all'indietro brutto che far vedere carte che non sono tue.
    if (r) mio = { ...mio, ...r };
    $('pacchetto').classList.remove('strappato');
    saldoInsufficiente();
    return;
  }
  risultato = r;
  mio = r;
  aggiornaBorsellino();

  // segnaposti: uno per carta (li disegno appena so quante sono)
  if (QUANTE <= 12) {
    $('segnaposti').innerHTML = Array.from({ length: QUANTE }, () => '<div class="segnaposto"></div>').join('');
  } else {
    $('segnaposti').innerHTML = '';
  }

  setTimeout(() => {
    $('fase-chiuso').style.display = 'none';
    mostraCarta(0);
  }, 1050);   // il tempo che linguetta e corpo escano di scena
}

// La messinscena dello strappo, staccata dalla richiesta al server.
function avviaLoStrappo() {
  const p = $('pacchetto').getBoundingClientRect();
  $('pacchetto').classList.add('strappato');
  // le scintille partono dalla linea dello strappo, non dal centro
  const yStrappo = p.top + p.height * 0.19;
  setTimeout(() => {
    for (let i = 0; i < 9; i++) {
      scintille(p.left + p.width * (0.1 + 0.1 * i), yStrappo, 7, '#ffd97a');
    }
    scuotiSchermo(16);
  }, 150);

}

// ------------------------------------------------------------
// UNA CARTA ALLA VOLTA
// Arriva coperta, si tocca, si gira. Più è rara più l'attesa vale.
// ------------------------------------------------------------
function mostraCarta(i) {
  indice = i;
  girata = false;
  $('palco').classList.add('attivo');
  const c = risultato.carte[i];
  const st = STILE_RARITA[c.rarita] || STILE_RARITA[1];
  const t = testo(c.carta.id);

  // segnaposti
  [...$('segnaposti').children].forEach((s, k) => {
    s.className = 'segnaposto' + (k < i ? ' fatto' : (k === i ? ' corrente' : ''));
  });

  // prepara il fronte, ancora nascosto
  const simbolo = c.carta.seme || (c.carta.tipo === 'sorpresa' ? '✦' : '⚡');
  const stat = c.carta.vita
    ? 'VITA ' + c.carta.vita + ' · ATT ' + c.carta.att + (c.carta.difesa ? ' · DIF ' + c.carta.difesa + '%' : '')
    : 'Costa ' + (c.carta.costo != null ? c.carta.costo : 4) + ' punti magia';

  $('fronte').style.setProperty('--bordo', st.colore);
  $('fronte').style.setProperty('--alone', st.alone);
  $('fronte').style.setProperty('--velo', st.velo);
  $('fronte').innerHTML =
    '<div class="etichetta ' + (c.nuova ? 'nuova' : 'doppia') + '">' +
      (c.nuova ? 'NUOVA' : 'DOPPIONE · +' + c.rimborso + ' monete') + '</div>' +
    '<div class="simbolo" style="color:' + st.colore + '">' + simbolo + '</div>' +
    '<div class="nome">' + t.nome + '</div>' +
    '<div class="stelle-carta">' + stelle(c.rarita) + ' ' + st.nome + '</div>' +
    '<div class="stat">' + stat + '</div>' +
    '<div class="desc">' + t.descrizione + '</div>';

  const scena = $('scena');
  const carta = $('carta3d');
  carta.classList.remove('girata');
  scena.classList.add('viva');
  // fa ripartire l'animazione di arrivo
  carta.style.animation = 'none';
  void carta.offsetWidth;
  carta.style.animation = '';

  $('aura').className = 'aura';
  $('raggi').style.opacity = '0';
  $('suggerimento').textContent = 'Tocca la carta per girarla  ·  ' + (i + 1) + ' di ' + risultato.carte.length;

  carta.onclick = () => giraCarta(c, st);
}

function giraCarta(c, st) {
  if (girata) { avanti(); return; }
  girata = true;

  const carta = $('carta3d');
  carta.classList.add('girata');

  // a metà giro, quando la faccia si scopre, parte lo spettacolo
  setTimeout(() => {
    const r = carta.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;

    $('aura').style.setProperty('--alone', st.alone);
    $('aura').className = 'aura accesa';
    scintille(cx, cy, st.particelle, st.colore);
    if (st.raggi) $('raggi').style.opacity = String(st.raggi);
    if (st.scossa) scuotiSchermo(c.rarita === 5 ? 22 : 12);
    if (c.rarita === 5) coriandoli(90);

    $('suggerimento').textContent = indice + 1 < risultato.carte.length
      ? 'Tocca ancora per la prossima carta'
      : 'Tocca ancora per vedere il bottino';
  }, 360);
}

function avanti() {
  if (indice + 1 < risultato.carte.length) {
    $('scena').classList.remove('viva');
    $('aura').className = 'aura';
    $('raggi').style.opacity = '0';
    setTimeout(() => mostraCarta(indice + 1), 120);
  } else {
    mostraRiepilogo();
  }
}

// ------------------------------------------------------------
// RIEPILOGO
// ------------------------------------------------------------
function mostraRiepilogo() {
  // la collezione si aggiorna solo ora, a pacchetto visto
  // l'album l'ha già aggiornato il server: qui non si scrive niente

  $('scena').classList.remove('viva');
  $('aura').className = 'aura';
  $('raggi').style.opacity = '0';
  $('segnaposti').style.display = 'none';
  $('suggerimento').textContent = '';
  $('palco').classList.remove('attivo');

  const migliore = risultato.carte[risultato.carte.length - 1];
  $('titoloRiep').textContent = risultato.pityScattato
    ? 'Pacchetto garantito!'
    : (migliore.rarita >= 4 ? 'Che fortuna!' : 'Il tuo bottino');

  $('griglia').innerHTML = risultato.carte.map((c, i) => {
    const st = STILE_RARITA[c.rarita] || STILE_RARITA[1];
    const t = testo(c.carta.id);
    const sim = c.carta.seme || (c.carta.tipo === 'sorpresa' ? '✦' : '⚡');
    return '<div class="mini" style="--bordo:' + st.colore + ';--alone:' + st.alone +
           ';animation-delay:' + (i * 0.09).toFixed(2) + 's">' +
      '<div class="tag ' + (c.nuova ? 'nuova' : 'doppia') + '">' + (c.nuova ? 'NUOVA' : 'DOPPIA') + '</div>' +
      '<div class="sim" style="color:' + st.colore + '">' + sim + '</div>' +
      '<div class="nm">' + t.nome + '</div>' +
      '<div class="st">' + stelle(c.rarita) + '</div>' +
    '</div>';
  }).join('');

  const nuove = risultato.carte.filter((c) => c.nuova).length;
  const monete = rimborsoTotale(risultato);
  $('incasso').innerHTML =
    '<b>' + nuove + '</b> carte nuove su ' + risultato.carte.length +
    (monete ? ' · doppioni convertiti in <b>' + monete + '</b> monete' : '') +
    ' · ancora <b>' + Math.max(0, SOGLIA_PITY - contatore) + '</b> carte alla ★5 garantita';

  $('riepilogo').classList.add('viva');
  if (migliore.rarita >= 4) coriandoli(60);
}

// per i controlli automatici
window.__prova = {
  apri: apriIlPacchetto,
  gira: () => $('carta3d').click(),
  stato: () => ({ indice, girata, totale: risultato ? risultato.carte.length : 0 })
};
})();
</script>
</body>
</html>
'''

pagina = (PAGINA
          .replace('__PONTE__', PONTE)
          .replace('__MOTORE__', motore)
          .replace('__DATI__', DATI)
          .replace('__TAGLIO_ALTO__', TAGLIO_ALTO)
          .replace('__TAGLIO_BASSO__', TAGLIO_BASSO)
          .replace('__INVOLUCRO__', INVOLUCRO))
for segnaposto in ('__MOTORE__', '__DATI__', '__PONTE__', '__TAGLIO_ALTO__', '__TAGLIO_BASSO__', '__INVOLUCRO__'):
    assert segnaposto not in pagina, 'segnaposto non sostituito: ' + segnaposto
# newline='\n' NON e' un dettaglio: senza, su Windows Python traduce
# ogni a-capo in CR+LF e la pagina esce diversa da quella generata su
# Linux o Mac, byte per byte. Il controllo di allineamento confronta
# proprio i byte, quindi segnalava tutte le pagine come 'rimaste
# indietro' su un computer e non sull'altro — e non era vero.
# Le pagine sono le stesse ovunque, e devono esserlo davvero.
io.open(DST, 'w', encoding='utf-8', newline='\n').write(pagina)
print('scritto', DST, os.path.getsize(DST), 'byte')
