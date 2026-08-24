// ============================================================
// IL MAZZO SCELTO ARRIVA AL TAVOLO?
//
// La pagina "Deck ed Eroi" faceva scegliere quattro eroi e tre Carte
// Magiche, e poi apriva un riquadro che diceva "qui la selezione
// VERREBBE inviata al matchmaking". Cioe': non succedeva niente, e il
// tavolo continuava a giocare con due squadre fisse scritte nel codice.
//
// Qui si controllano tutte e due le parti:
//   1. la pagina del mazzo mette davvero da parte la scelta
//   2. il tavolo la legge, e la CONTROLLA prima di fidarsi
//
// Il punto 2 conta piu' del primo: quel testo sta nel browser, e puo'
// essere rimasto li' da una versione in cui certe carte esistevano.
// Fidarsi e basta vorrebbe dire partire con una squadra mezza vuota.
// ============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const QUI = dirname(fileURLToPath(import.meta.url));

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch (e) {
  console.log('\n--- IL MAZZO SCELTO ARRIVA AL TAVOLO? ---\n');
  console.log('SALTATO: manca jsdom. Installalo con:  npm install\n');
  process.exit(0);
}

let ko = 0;
const check = (nome, ok, dettaglio) => {
  console.log((ok ? 'OK   ' : 'FAIL ') + nome + (ok || !dettaglio ? '' : '  <- ' + dettaglio));
  if (!ok) ko++;
};
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n--- IL MAZZO SCELTO ARRIVA AL TAVOLO? ---\n');

const HTML_TAVOLO = readFileSync(join(QUI, 'tavolo.html'), 'utf8');

// apre il tavolo con un certo mazzo gia' messo da parte
async function tavoloCon(mazzo) {
  const guasti = [];
  const dom = new JSDOM(HTML_TAVOLO, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'http://localhost:8080/tavolo.html',
    beforeParse(w) {
      w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
      w.onerror = (m, s, r, c, e) => guasti.push(String((e && e.stack) || m));
      if (mazzo !== undefined) {
        try { w.localStorage.setItem('bb_mazzo', typeof mazzo === 'string' ? mazzo : JSON.stringify(mazzo)); } catch (e) {}
      }
    }
  });
  await attendi(500);
  return { w: dom.window, dom, guasti };
}

const semiDi = (stato) => Object.keys(stato.players[0].characters);
const eroiDi = (stato) => {
  const fuori = {};
  for (const s of semiDi(stato)) fuori[s] = stato.players[0].characters[s].cardId;
  return fuori;
};

// ---------- 1. senza mazzo salvato: la squadra predefinita ----------
const senza = await tavoloCon(undefined);
const eroiPredefiniti = eroiDi(senza.w.__tavolo());
check('senza mazzo salvato si gioca con la squadra predefinita',
  Object.values(eroiPredefiniti).every(Boolean));
senza.dom.window.close();

// ---------- 2. con un mazzo scelto: si gioca con quello ----------
const MIO = {
  personaggi: { '♥': 'personaggio_002', '♦': 'personaggio_004', '♣': 'personaggio_006', '♠': 'personaggio_008' },
  carteMagiche: ['sorpresa_002', 'trappola_001', 'trappola_002']
};
const con = await tavoloCon(MIO);
const stato = con.w.__tavolo();
const eroi = eroiDi(stato);
check('col mazzo salvato scendono in campo QUELLI', 
  JSON.stringify(eroi) === JSON.stringify(MIO.personaggi),
  'in campo: ' + JSON.stringify(eroi));
check('e sono diversi dalla squadra predefinita',
  JSON.stringify(eroi) !== JSON.stringify(eroiPredefiniti));
check('il tavolo si apre lo stesso senza errori', con.guasti.length === 0,
  (con.guasti[0] || '').split('\n')[0]);
check('l\'avversario mantiene la sua squadra',
  Object.values(stato.players[1].characters).every((c) => !!c.cardId));
con.dom.window.close();

// ---------- 2b. le Carte Magiche sono facoltative: bastano gli eroi ----------
for (const carteMagiche of [[], ['sorpresa_002'], ['sorpresa_002', 'trappola_001']]) {
  const mazzo = { personaggi: MIO.personaggi, carteMagiche };
  const r = await tavoloCon(mazzo);
  const s = r.w.__tavolo();
  check('un mazzo con ' + carteMagiche.length + ' Carte Magiche viene accettato com\'e\'',
    !!s && r.guasti.length === 0 && JSON.stringify(s.magiche[0]) === JSON.stringify(carteMagiche),
    'magiche in campo: ' + JSON.stringify(s && s.magiche && s.magiche[0]));
  r.dom.window.close();
}

// ---------- 3. mazzi rotti: si torna al predefinito, dicendolo ----------
const ROTTI = [
  ['non e\' nemmeno un oggetto', '"ciao"'],
  ['mancano i personaggi', { carteMagiche: ['sorpresa_001', 'trappola_001', 'trappola_002'] }],
  ['un eroe che non esiste', { personaggi: { '♥': 'personaggio_999', '♦': 'personaggio_004', '♣': 'personaggio_006', '♠': 'personaggio_008' }, carteMagiche: ['sorpresa_002', 'trappola_001', 'trappola_002'] }],
  ['un seme scoperto', { personaggi: { '♥': 'personaggio_002', '♦': 'personaggio_004', '♣': 'personaggio_006' }, carteMagiche: ['sorpresa_002', 'trappola_001', 'trappola_002'] }],
  ['sette Carte Magiche invece che al massimo tre', { personaggi: MIO.personaggi, carteMagiche: ['sorpresa_002', 'trappola_001', 'trappola_002', 'sorpresa_002', 'trappola_001', 'trappola_002', 'sorpresa_002'] }],
  ['una Carta Magica inventata', { personaggi: MIO.personaggi, carteMagiche: ['sorpresa_002', 'trappola_001', 'magia_fantasma'] }],
  ['la stessa Carta Magica tre volte', { personaggi: MIO.personaggi, carteMagiche: ['trappola_001', 'trappola_001', 'trappola_001'] }],
  ['testo che non e\' JSON', '{questo non e\' json']
];

for (const [perche, mazzo] of ROTTI) {
  const r = await tavoloCon(mazzo);
  const s = r.w.__tavolo();
  const ok = !!s && Object.values(eroiDi(s)).every(Boolean) && r.guasti.length === 0;
  check('mazzo rotto (' + perche + '): il tavolo parte lo stesso',
    ok, (r.guasti[0] || '').split('\n')[0]);
  r.dom.window.close();
}

// ---------- 4. la pagina del mazzo salva davvero ----------
{
  const pagina = readFileSync(join(QUI, 'selezione.html'), 'utf8');
  check('la pagina del mazzo mette da parte la scelta',
    /localStorage\.setItem\(DOVE_SI_SALVA_IL_MAZZO/.test(pagina));
  check('confermare riporta da dove si e\' arrivati, non a una partita col computer',
    /const dentroCasa = \['sala\.html'/.test(pagina) &&
    !/window\.location\.href = 'tavolo\.html'/.test(pagina));
  check('e il bottone dice quello che fa',
    /entraBtn: 'Conferma il mazzo'/.test(pagina));
  check('tornandoci, ritrova il mazzo di prima',
    /function riprendiIlMazzoDiPrima/.test(pagina));
  check('non promette piu\' una lista partite che non esiste',
    !/lista partite/i.test(pagina));
  check('il nome della memoria e\' lo stesso nelle due pagine',
    /'bb_mazzo'/.test(pagina) && /'bb_mazzo'/.test(HTML_TAVOLO));
}

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.') + '\n');
process.exit(ko === 0 ? 0 : 1);
