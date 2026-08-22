// ============================================================
// IL TAVOLO SI APRE E SI PUO' GIOCARE DAVVERO?
//
// PERCHE' ESISTE
// Fino a ieri i controlli sul tavolo leggevano la pagina come un testo:
// "c'e' scritta questa cosa?". Utile, ma cieco davanti al guasto piu'
// brutto di tutti — la pagina che si costruisce benissimo e poi, aperta,
// muore alla prima riga. E' successo con una costante del motore usata
// nel tavolo ma mai prelevata: nessun errore in costruzione, e poi
// schermo vuoto.
//
// Qui la pagina viene APERTA per davvero in un browser finto (jsdom) e
// giocata: si pesca, si scarta, si usa l'abilita' di un eroe. Se
// qualcosa e' rotto, si vede subito e si vede DOVE.
//
// jsdom e' l'unica dipendenza del progetto, e serve solo alle prove: il
// gioco e il server continuano a non averne nessuna. Se non e'
// installato questo controllo si tira da parte invece di far fallire
// tutto — ma lo dice a voce alta.
// ============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const QUI = dirname(fileURLToPath(import.meta.url));

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch (e) {
  console.log('\n--- IL TAVOLO SI APRE E SI GIOCA? ---\n');
  console.log('SALTATO: manca jsdom. Installalo con:  npm install');
  console.log('(il gioco e il server funzionano lo stesso: jsdom serve solo a provare)\n');
  process.exit(0);
}

let ko = 0;
const check = (nome, ok, dettaglio) => {
  console.log((ok ? 'OK   ' : 'FAIL ') + nome + (ok || !dettaglio ? '' : '  <- ' + dettaglio));
  if (!ok) ko++;
};
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// CHI COMINCIA LO DECIDE IL MAZZO, non piu' sempre il giocatore.
// Se il sorteggio da' il via al bot, il tavolo lo fa giocare da solo:
// qui si aspetta che il turno torni a noi, invece di dare per scontato
// che sia nostro fin dal primo istante.
const aspettaIlMioTurno = async (w, quanto = 6000) => {
  const fine = Date.now() + quanto;
  while (Date.now() < fine) {
    const s = w.__tavolo();
    if (s && s.status === 'in_progress' && s.currentPlayerIndex === 0) return true;
    await attendi(80);
  }
  return false;
};

console.log('\n--- IL TAVOLO SI APRE E SI GIOCA? ---\n');

const html = readFileSync(join(QUI, 'tavolo.html'), 'utf8');
const guasti = [];
let salto = 0;                    // per spostare in avanti l'orologio della pagina

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost:8080/tavolo.html',
  beforeParse(w) {
    // jsdom non sa animare: le animazioni si fingono già finite. Non e'
    // una perdita — qui si prova che il gioco funzioni, non che sia bello.
    w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
    const veroAdesso = w.Date.now.bind(w.Date);
    w.Date.now = () => veroAdesso() + salto;
    w.onerror = (msg, src, riga, col, err) => { guasti.push(String((err && err.stack) || msg)); };
  }
});
const w = dom.window, d = w.document;
await attendi(500);

// ---------- 1. si apre senza morire ----------
check('la pagina si apre senza errori', guasti.length === 0, (guasti[0] || '').split('\n')[0]);
check('la partita viene creata', !!(w.__tavolo && w.__tavolo()));
check('le carte in mano sono undici', d.querySelectorAll('#handBox .card').length === 11);
check('gli otto personaggi sono in tavola', d.querySelectorAll('.bcard[data-seme]').length === 8);

// ---------- 1bis. il sorteggio di chi comincia ----------
// Prima cominciava sempre chi apriva il tavolo, senza che si vedesse
// niente. Adesso il mazzo pesca una carta a testa davanti a tutti e due.
{
  const box = d.getElementById('sorteggio');
  check('il sorteggio si vede all-apertura', !!box && box.classList.contains('mostra'));
  check('con una carta per giocatore',
    d.querySelectorAll('#sorteggioCarte .posto').length === 2 &&
    d.querySelectorAll('#sorteggioCarte .card').length === 2);
  check('una delle due e- segnata come vincente',
    d.querySelectorAll('#sorteggioCarte .posto.vince').length === 1);

  // e chi vince a schermo e- lo stesso che il motore fa muovere per primo
  const vinceASchermo = [...d.querySelectorAll('#sorteggioCarte .posto')]
    .findIndex((e) => e.classList.contains('vince'));
  check('e- lo stesso che comincia davvero',
    vinceASchermo === w.__tavolo().currentPlayerIndex);
  check('e lo dice a parole',
    /cominci tu|comincia l/i.test(d.getElementById('sorteggioEsito').textContent));

  // toccando si salta
  box.onclick();
  check('toccando, il sorteggio si chiude', !box.classList.contains('mostra'));
}

// ---------- 2. i trenta secondi in cui si guarda ----------
const toast = () => (d.getElementById('toast') || {}).textContent || '';
const studioVisibile = () => {
  const s = d.getElementById('studio');
  return !!(s && s.classList.contains('mostra'));
};
check('all\'inizio il conto dello studio e\' a schermo', studioVisibile());
w.ui.pesca();
await attendi(60);
check('e provando a pescare il tavolo dice di aspettare', /si comincia fra/i.test(toast()));
check('infatti in mano ce ne sono ancora undici',
  w.__tavolo().players[0].hand.length === 11);

// ---------- 3. passati i trenta secondi, si gioca ----------
salto = 35000;
await attendi(400);
check('finito lo studio, il conto sparisce', !studioVisibile());
// se il sorteggio ha dato il via al bot, prima gioca lui
check('il turno arriva a noi (dopo il bot, se ha cominciato lui)', await aspettaIlMioTurno(w));
const manoPrima = w.__tavolo().players[0].hand.length;
w.ui.pesca();
await attendi(60);
check('e la pescata funziona', w.__tavolo().players[0].hand.length === manoPrima + 1);
check('la carta pescata e\' l\'ultima della mano, per riconoscerla',
  d.querySelectorAll('#handBox .card').length === manoPrima + 1);

// ---------- 4. si scarta ----------
{
  const mano = w.__tavolo().players[0].hand;
  w.ui.tocca(mano[0].id);
  w.ui.clicScarti();
  await attendi(120);
  check('si scarta e la carta finisce sul monte',
    w.__tavolo().players[0].hand.length === manoPrima &&
    w.__tavolo().scarti.some((c) => c.id === mano[0].id));
}

// ---------- 5. l'abilita' di un eroe ----------
// I punti magia crescono di 2 a turno: si gioca finche' non bastano.
for (let giro = 0; giro < 10; giro++) {
  const s = w.__tavolo();
  if (!s || s.status !== 'in_progress') break;
  if (s.players[0].puntiMagia >= 4 && s.currentPlayerIndex === 0) break;
  if (s.currentPlayerIndex !== 0) { await attendi(200); continue; }
  if (!s.players[0].hasDrawnThisTurn) w.ui.pesca();
  const mano = w.__tavolo().players[0].hand;
  w.ui.tocca(mano[0].id);
  w.ui.clicScarti();
  await attendi(1500);
}

const prima = w.__tavolo();
if (prima && prima.status === 'in_progress' && prima.currentPlayerIndex === 0 && prima.players[0].puntiMagia >= 4) {
  const istruzione = () => {
    const e = d.getElementById('istruzioneBersaglio');
    return !!(e && e.classList.contains('mostra'));
  };
  w.ui.attivaAbilita('♥');
  check('premendo un eroe si apre la scelta del bersaglio', istruzione());

  const avversaria = d.querySelector('#battleAvversario .bcard[data-seme]');
  check('e le carte avversarie diventano cliccabili',
    !!(avversaria && avversaria.getAttribute('onclick')));

  if (avversaria && avversaria.getAttribute('onclick')) {
    const seme = avversaria.getAttribute('data-seme');
    const pvPrima = prima.players[1].characters[seme].pv;
    w.ui.colpisci(seme);
    await attendi(400);
    const dopo = w.__tavolo();
    check('il colpo toglie punti vita al bersaglio',
      dopo.players[1].characters[seme].pv < pvPrima,
      'era ' + Math.round(pvPrima) + ', e\' ' + Math.round(dopo.players[1].characters[seme].pv));
    check('e i punti magia vengono spesi',
      dopo.players[0].puntiMagia === prima.players[0].puntiMagia - 4,
      'da ' + prima.players[0].puntiMagia + ' a ' + dopo.players[0].puntiMagia);
    check('la scelta del bersaglio si richiude', !istruzione());
  }
} else {
  check('si e\' arrivati a poter usare un\'abilita\'', false,
    'partita: ' + (prima && prima.status) + ', turno di ' + (prima && prima.currentPlayerIndex) +
    ', punti ' + (prima && prima.players[0].puntiMagia));
}

check('nessun errore JavaScript in tutta la partita', guasti.length === 0,
  (guasti[0] || '').split('\n').slice(0, 2).join(' | '));

dom.window.close();
console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.') + '\n');
process.exit(ko === 0 ? 0 : 1);
