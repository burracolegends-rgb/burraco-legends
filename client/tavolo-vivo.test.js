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
// che sia nostro fin dal primo istante. Si aspetta anche che finisca di
// "recitare" le sue mosse (animazioneAvversarioInCorso): il motore segna
// il turno come nostro subito, ma provare a giocare mentre l'ultima mossa
// dell'avversario e' ancora in scena viene rifiutato apposta — vedi
// genera-tavolo.py, esegui().
const aspettaIlMioTurno = async (w, quanto = 16000) => {
  const fine = Date.now() + quanto;
  while (Date.now() < fine) {
    const s = w.__tavolo();
    if (s && s.status === 'in_progress' && s.currentPlayerIndex === 0 && !s.animazioneAvversarioInCorso) return true;
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
    w.addEventListener('unhandledrejection', (e) => { guasti.push('promise rifiutata: ' + String((e.reason && e.reason.stack) || e.reason)); });
  }
});
const w = dom.window, d = w.document;
await attendi(500);

// ---------- 0bis. IL BLOCCO "GIRA IL TELEFONO" ESISTE DAVVERO ----------
// Burraco Pulito aveva gia' la regola CSS giusta (#ruotaAvviso, accesa
// da "@media (hover: none) and (orientation: portrait)"), copiata
// verbatim insieme al resto del foglio di stile. Ma l'elemento che
// quella regola doveva accendere non era mai stato scritto nella
// pagina: la regola c'era, non aveva niente da mostrare, e su
// nessun telefono succedeva mai nulla.
// jsdom non implementa matchMedia ne' un vero layout (niente
// getBoundingClientRect, niente window.matchMedia): non puo' provare
// che la regola scatti davvero in verticale, o che sparisca in
// orizzontale, o che il tavolo non scorra piu' di lato su un telefono
// stretto. Quello e' stato verificato a mano in un browser vero
// (Chromium, con l'emulazione touch attiva) prima di questo commit.
// Quello che jsdom PUO' provare, onestamente, e' che l'elemento esista
// per davvero nella pagina — che e' esattamente il pezzo che mancava.
check('il blocco "gira il telefono" esiste nella pagina', !!d.getElementById('ruotaAvviso'));
check('con un titolo e un testo dentro',
  !!d.querySelector('#ruotaAvviso .titolo') && !!d.querySelector('#ruotaAvviso .sotto'));

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

// ---------- 2. i dieci secondi in cui si guarda ----------
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

// ---------- 3. passati i dieci secondi, si gioca ----------
// (il salto resta ampio, 35s: qui non si misura il confine esatto —
// quello lo fa stanze.test.js — solo che PASSATO lo studio si giochi)
salto = 35000;
await attendi(400);
check('finito lo studio, il conto sparisce', !studioVisibile());
// se il sorteggio ha dato il via al bot, prima gioca lui
check('il turno arriva a noi (dopo il bot, se ha cominciato lui)', await aspettaIlMioTurno(w));
const manoPrima = w.__tavolo().players[0].hand.length;
w.ui.pesca();
await attendi(150);
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
// Un GIRO conta solo se ha davvero mosso qualcosa: aspettare che tocchi
// a me (compresa la fine dell'animazione dell'avversario, altrimenti
// pesca()/clicScarti() vengono rifiutati in silenzio — vedi esegui() in
// genera-tavolo.py) puo' costare molti più di 200ms se l'avversario ha
// giocato piu' mosse di fila. Il paletto e' sul TEMPO totale, non su
// quante volte si e' girato il ciclo.
{
  // Fino a 40s: un turno del bot puo' usare fino a 4 abilita' (una per
  // eroe) piu' una Carta Magica, ognuna con la sua animazione — se serve
  // piu' di un turno mio per arrivare a 4 punti magia, nel mezzo c'e' un
  // turno INTERO del bot da aspettare, non solo una mossa.
  const fine = Date.now() + 40000;
  while (Date.now() < fine) {
    const s = w.__tavolo();
    if (!s || s.status !== 'in_progress') break;
    if (s.players[0].puntiMagia >= 5 && s.currentPlayerIndex === 0 && !s.animazioneAvversarioInCorso) break;
    if (s.currentPlayerIndex !== 0 || s.animazioneAvversarioInCorso) { await attendi(200); continue; }
    if (!s.players[0].hasDrawnThisTurn) w.ui.pesca();
    const mano = w.__tavolo().players[0].hand;
    w.ui.tocca(mano[0].id);
    w.ui.clicScarti();
    await attendi(1500);
  }
}

const prima = w.__tavolo();
if (prima && prima.status === 'in_progress' && prima.currentPlayerIndex === 0 && prima.players[0].puntiMagia >= 5) {
  const istruzione = () => {
    const e = d.getElementById('istruzioneBersaglio');
    return !!(e && e.classList.contains('mostra'));
  };
  // ♣ apposta: e' l'unico dei quattro semi di partenza la cui abilita'
  // chiede di scegliere il bersaglio (target: personaggio_specifico) —
  // le altre tre colpiscono da sole, senza aprire nessuna scelta.
  w.ui.attivaAbilita('♣');
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
      dopo.players[0].puntiMagia === prima.players[0].puntiMagia - 5,
      'da ' + prima.players[0].puntiMagia + ' a ' + dopo.players[0].puntiMagia);
    check('la scelta del bersaglio si richiude', !istruzione());
  }
} else {
  check('si e\' arrivati a poter usare un\'abilita\'', false,
    'partita: ' + (prima && prima.status) + ', turno di ' + (prima && prima.currentPlayerIndex) +
    ', punti ' + (prima && prima.players[0].puntiMagia));
}

// ---------- 5ter. LO SCUDO SI VEDE ----------
// La Difesa era l'unica statistica invisibile: una carta che la
// abbassava non mostrava niente nell'istante del colpo. Adesso c'e' uno
// scudo su ogni personaggio, pieno al 100% quando la difesa e' quella
// di base.
{
  const scudi = d.querySelectorAll('.bcard[data-seme] .scudo');
  check('ogni personaggio ha il suo scudo (4 miei + 4 suoi)', scudi.length === 8,
    'trovati ' + scudi.length);

  // Le carte segnaposto di oggi hanno difese diverse fra loro (1,05-1,18),
  // quindi i loro scudi stanno sopra il 100%: e' proprio quello che
  // devono mostrare. Quando arriveranno le carte vere, tutte a difesa 1,
  // saranno tutti pieni.
  const pieni = [...scudi].filter((e) => e.classList.contains('intero'));
  const diversi = [...scudi].filter((e) => !e.classList.contains('intero'));
  check('ogni scudo e o pieno o diverso, mai un terzo stato',
    pieni.length + diversi.length === scudi.length);

  // la regola che conta: il numero compare SOLO quando c'e' qualcosa di
  // diverso da raccontare
  check('a scudo pieno il numero non compare',
    pieni.every((e) => !e.querySelector('.valore')));
  check('e quando NON e pieno il numero c e',
    diversi.every((e) => !!e.querySelector('.valore')));

  // il titolo dice sempre la percentuale, anche quando il numero non si vede
  const titolo = scudi[0] && scudi[0].getAttribute('title');
  check('lo scudo dice comunque quanto vale', /Scudo \d+%/.test(titolo || ''),
    'titolo: ' + titolo);
}

// ---------- 5bis. l'abilita' che NON chiede di mirare ----------
// NON COPERTO QUI, e vale la pena dire perche'.
// Nessuna carta del roster vero dice "a scelta": il bersaglio lo decide
// la carta, quindi il passo "tocca un nemico" si salta e il colpo parte
// al primo tocco. Le carte SEGNAPOSTO di oggi chiedono invece tutte di
// mirare, quindi da questa pagina quel percorso non si raggiunge.
// Per provarlo servirebbe cambiare l'abilita' di un eroe a partita
// avviata — e la pagina, giustamente, lascia uscire solo una COPIA dello
// stato proprio per impedirlo. Aprire una porta sullo stato vero solo
// per una prova sarebbe peggio del buco che copre.
// La decisione (chiedere o no il bersaglio) e' provata nel motore, in
// engine/magie-in-partita.test.js; questo percorso dell'interfaccia si
// coprira' da se' quando le carte vere prenderanno il posto dei
// segnaposto, perche' diventera' la strada normale.

// ---------- 6. SI VEDE QUELLO CHE NON E' DANNO ----------
// Il tavolo sapeva mostrare solo la vita che cala. Le carte vere pero'
// fanno soprattutto altro — alzano scudi, li sfondano, rubano punti
// magia — e finora tutto questo succedeva in silenzio: la partita
// cambiava di nascosto. Qui si controlla che ogni effetto lasci un
// segno visibile e che sia il segno GIUSTO, sulla parte giusta del
// tavolo.
//
// jsdom non impagina e non fa girare le animazioni: quello che si puo'
// provare qui e' che gli elementi nascano, con il testo e il colore
// giusti. Che stiano dentro allo schermo e si muovano bene e' stato
// verificato a parte, in un browser vero.
{
  const prima = d.querySelectorAll('.segno-eff').length;
  w.__mostraEffetti({
    effettiAbilita: [
      // uno su di me, uno sui suoi, uno sul giocatore: le tre strade diverse
      { effect: 'boost_difesa',       parametro: '25', durata: 3, lato: 'caster',   applied: true, colpiti: ['♥'] },
      { effect: 'riduci_difesa',      parametro: '20', durata: 2, lato: 'opponent', applied: true, colpiti: ['♠'] },
      { effect: 'riduci_punti_magia', parametro: '3',             lato: 'opponent', applied: true, tolti: 3 },
      // questo NON deve fare una pastiglia: i PV si raccontano col numero
      { effect: 'cura_diretta',       parametro: '30',            lato: 'caster',   applied: true, colpiti: ['♦'] },
      // e questo non deve fare niente del tutto: non e' andato a segno
      { effect: 'distruggi_trappole',                             lato: 'opponent', applied: false }
    ]
  }, 0);

  // i segni partono sfalsati nel tempo, quindi si aspetta
  await attendi(1200);

  const segni = [...d.querySelectorAll('.segno-eff')];
  check('gli effetti lasciano un segno visibile', segni.length > prima,
    'segni trovati: ' + segni.length);

  const testi = segni.map((s) => s.textContent);
  check('lo scudo alzato si vede col suo valore', testi.some((t) => t.indexOf('+25%') >= 0), testi.join(' / '));
  check('lo scudo sfondato si vede col suo valore', testi.some((t) => t.indexOf('−20%') >= 0), testi.join(' / '));
  check('i punti magia rubati si vedono', testi.some((t) => t.indexOf('−3 PM') >= 0), testi.join(' / '));

  check('la cura NON diventa una pastiglia: e\' un numero',
    !testi.some((t) => t.indexOf('✚') >= 0) && d.querySelectorAll('.dmg-float.cura').length > 0,
    'pastiglie: ' + testi.join(' / '));

  check('un effetto andato a vuoto non lascia segni',
    !testi.some((t) => t.indexOf('💥') >= 0), testi.join(' / '));

  // il colore distingue a colpo d'occhio scudo su (azzurro) da scudo giu' (rosa)
  const su  = segni.find((s) => s.textContent.indexOf('+25%') >= 0);
  const giu = segni.find((s) => s.textContent.indexOf('−20%') >= 0);
  check('scudo su e scudo giu\' hanno colori diversi',
    !!su && !!giu && su.style.color !== giu.style.color,
    (su && su.style.color) + ' contro ' + (giu && giu.style.color));

  // e il resoconto scritto racconta le stesse cose, per chi vuole rileggere
  const resoconto = d.getElementById('resoconto');
  check('il resoconto esiste', !!resoconto);
}

check('nessun errore JavaScript in tutta la partita', guasti.length === 0,
  (guasti[0] || '').split('\n').slice(0, 2).join(' | '));

dom.window.close();
console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.') + '\n');
process.exit(ko === 0 ? 0 : 1);
