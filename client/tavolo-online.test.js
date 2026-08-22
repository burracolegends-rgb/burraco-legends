// ============================================================
// IL TAVOLO CHIEDE SEMPRE AL SERVER?
//
// PERCHE' QUESTO CONTROLLO ESISTE
// Il tavolo e' una pagina sola che sa giocare in due modi: contro il
// bot, dove la partita vive dentro la pagina e il motore si chiama
// direttamente, e in rete, dove la partita vive sul server e la pagina
// puo' solo CHIEDERE.
//
// Due strade nello stesso file: e' facilissimo scriverne una nuova e
// imboccare quella sbagliata. E' successo con l'abilita' speciale e con
// le Carte Magiche: chiamavano il motore su questa pagina anche quando
// c'era un server. Il risultato era feroce da capire, perche' TUTTO
// SEMBRAVA FUNZIONARE — il colpo si vedeva, i punti magia calavano —
// e poi il primo aggiornamento dal server rimetteva ogni cosa com'era,
// perche' il server non ne aveva mai saputo niente. Chi giocava vedeva
// i danni annullarsi e i punti magia tornare interi, e dall'altra parte
// l'avversario non vedeva proprio nulla.
//
// La regola, in una riga: dentro l'oggetto `ui` il motore non si chiama
// mai direttamente. Si passa da esegui(), che sceglie la strada.
//
// Questo controllo legge la pagina gia' costruita, non il generatore:
// conta quello che finisce davvero nel browser.
// ============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const QUI = dirname(fileURLToPath(import.meta.url));
const PAGINA = readFileSync(join(QUI, 'tavolo.html'), 'utf8');

let falliti = 0;
function check(nome, ok, dettaglio) {
  console.log((ok ? 'OK  ' : 'NO  ') + ' ' + nome + (ok || !dettaglio ? '' : '\n       ' + dettaglio));
  if (!ok) falliti++;
}

console.log('\n--- IL TAVOLO PASSA DAL SERVER PER OGNI MOSSA? ---\n');

// Le funzioni del motore che CAMBIANO la partita. Chiamarne una a mano
// dentro `ui` vuol dire aver giocato senza dirlo al server.
const MOSSE_DEL_MOTORE = [
  'actionDraw', 'actionTakeDiscardPile', 'actionLayMeld',
  'actionAttachToMeld', 'actionDiscard',
  'usaAbilitaSpeciale', 'giocaCartaMagica'
];

// Ritaglia il blocco `const ui = { ... };`, che e' dove stanno tutti i
// gesti del giocatore.
const inizio = PAGINA.indexOf('const ui = {');
check('nella pagina c\'e\' l\'oggetto ui', inizio > 0);
const finePagina = PAGINA.indexOf('window.ui = ui;', inizio);
check('e si riesce a delimitarlo', finePagina > inizio);
const ui = PAGINA.slice(inizio, finePagina);

// Ogni chiamata al motore dentro `ui` deve stare dentro l'argomento di
// esegui(): la forma e' `esegui({...}, () => motore(...))`, che spesso
// va a capo. Invece di ragionare per righe si guarda indietro dal punto
// della chiamata: se prima si incontra `esegui(` senza aver attraversato
// un punto e virgola, la chiamata sta dentro quella esegui().
function dentroEsegui(testo, posizione) {
  const prima = testo.slice(0, posizione);
  const apre = prima.lastIndexOf('esegui(');
  if (apre < 0) return false;
  return !prima.slice(apre).includes(';');
}

const numeroRiga = (testo, posizione) => testo.slice(0, posizione).split('\n').length;

for (const mossa of MOSSE_DEL_MOTORE) {
  const fuoriPosto = [];
  const cerca = new RegExp('\\b' + mossa + '\\s*\\(', 'g');
  let m;
  while ((m = cerca.exec(ui)) !== null) {
    if (dentroEsegui(ui, m.index)) continue;
    const riga = numeroRiga(ui, m.index);
    fuoriPosto.push('riga ' + riga + ': ' + ui.split('\n')[riga - 1].trim().slice(0, 90));
  }
  check(mossa + ' non viene mai chiamata scavalcando esegui()',
        fuoriPosto.length === 0,
        fuoriPosto.join('\n       ') +
        '\n       Cosi\' in rete la mossa non arriva al server: si vede accadere' +
        '\n       e poi torna indietro da sola.');
}

// esegui() deve restituire l'esito, se no chi lo chiama non puo'
// raccontare quello che e' successo e finisce per rifarselo da solo.
check('esegui() restituisce l\'esito anche in locale',
      /\/\/ l'esito torna a chi ha chiamato/.test(PAGINA) && /^\s*return r;$/m.test(PAGINA));

// E le due mosse che si erano perse la strada devono chiedere le
// azioni giuste, con i nomi che il server si aspetta.
check('l\'abilita\' viene chiesta come azione "abilita"',
      /tipo:\s*'abilita',\s*seme:/.test(ui));
check('la carta magica viene chiesta come azione "magia"',
      /tipo:\s*'magia',\s*indice:/.test(ui));

// I nomi delle azioni devono esistere davvero dall'altra parte.
const AZIONI = readFileSync(join(QUI, '..', 'engine', 'azioni.js'), 'utf8');
for (const nome of ['abilita', 'magia', 'pesca', 'prendi_scarti', 'cala', 'aggancia', 'scarta']) {
  check('il server conosce l\'azione "' + nome + '"', AZIONI.includes("'" + nome + "'"));
}

// ------------------------------------------------------------
// LE CARTE APPENA ARRIVATE, IN CODA, ANCHE IN RETE
// La mano si mostra ordinata per valore: senza mettere in fondo quello
// che e' appena arrivato, dopo una pescata non si capisce che cosa sia
// entrato in mano. Contro il bot funzionava; in rete no, perche' la
// lista delle "carte nuove" veniva solo ripulita e mai riempita.
// ------------------------------------------------------------
{
  const accetta = PAGINA.slice(PAGINA.indexOf('function accettaVista'),
                              PAGINA.indexOf('function raccontaLaMossaDellAltro'));
  check('in rete si guarda la mano PRIMA di sostituire lo stato',
        /const manoPrima = S \? S\.players\[0\]\.hand\.map/.test(accetta));
  check('e le carte comparse vengono messe in coda',
        /carteNuove = \[\.\.\.carteNuove, \.\.\.arrivate\]/.test(accetta));
}

// ------------------------------------------------------------
// L'ULTIMO COLPO NON DEVE ESSERE COPERTO DALLA FINE PARTITA
// ------------------------------------------------------------
check('la fine partita aspetta le animazioni in corso',
      /const attesa = Math\.max\(0, animazioneFinoA - Date\.now\(\)\)/.test(PAGINA));
check('e chi mette in scena qualcosa dichiara quanto dura',
      (PAGINA.match(/segnaAnimazione\(/g) || []).length >= 5);

// ------------------------------------------------------------
// LA SPIA DEL POZZETTO
// ------------------------------------------------------------
check('c\'e\' una spia del pozzetto per ciascun giocatore',
      /id="pozzettoMio"/.test(PAGINA) && /id="pozzettoAvv"/.test(PAGINA));
check('e viene tenuta aggiornata insieme agli orologi',
      /aggiornaSpiePozzetto\(\);/.test(PAGINA.slice(PAGINA.indexOf('function aggiornaOrologiTurno'))));

// ------------------------------------------------------------
// LE TRAPPOLE SI DEVONO VEDERE, E PRIMA DI QUELLO CHE FANNO
// In rete non venivano mostrate affatto: la vita calava e basta. E
// anche in locale la carta grande e il danno sulle carte bersaglio
// partivano insieme, cioe' si guardavano tutte e due a meta'.
// ------------------------------------------------------------
check('la trappola viene mostrata anche quando la mossa passa dal server',
      /const attesa = segnalaTrappole\(r, 0\);/.test(PAGINA));
check('e anche a chi la subisce dall\'altra parte',
      /const attesa = segnalaTrappole\(esito, 1\);/.test(PAGINA));
check('il danno sulle carte bersaglio aspetta che la carta sia stata vista',
      /setTimeout\(\(\) => \{ mostraResoconto\(colpo, 1\); lampeggiaColpiti\('battleGiocatore', colpo\); \}, attesa\)/.test(PAGINA));
// e il colpo raccontato dal server deve portarsi dietro QUALI personaggi
// sono stati colpiti, se no non c'e' niente da animare
check('il colpo dell\'avversario porta l\'elenco dei bersagli',
      /colpi: esito\.colpi/.test(PAGINA));
check('e il server lo mette nel resoconto pubblico',
      /r\.colpi = esito\.colpi\.map/.test(readFileSync(join(QUI, '..', 'server', 'stanze.js'), 'utf8')));
check('chi sono lo dice il server, non l\'indirizzo',
      /if \(typeof risposta\.vista\.io === 'number'\) RETE\.io = risposta\.vista\.io;/.test(PAGINA));
check('segnalaTrappole dice quanto dura, invece di far tutto in silenzio',
      /return totale;/.test(PAGINA));
check('il danno riflesso torna indietro con la sua animazione',
      /function mostraRiflesso/.test(PAGINA) && /numeroDanno\(vivo, r\.riflesso\.damage\)/.test(PAGINA));

// il server deve mandare QUALI trappole, non quante: senza i nomi il
// tavolo non puo' mostrare niente
const STANZE = readFileSync(join(QUI, '..', 'server', 'stanze.js'), 'utf8');
check('il server manda quali trappole sono scattate, non solo il numero',
      /r\.trappoleScattate = esito\.trappoleScattate\.map/.test(STANZE));

// ------------------------------------------------------------
// LE CARTE SI MUOVONO
// ------------------------------------------------------------
check('prima di ridisegnare si segna dove stanno le carte',
      /const prima = rettangoliDelleCarte\(\);/.test(PAGINA));
check('e dopo il ridisegno le si fa volare al posto nuovo',
      /faiVolareLeCarte\(prima\);/.test(PAGINA));
check('anche le carte che prima non c\'erano hanno un punto di partenza',
      /function origineDiUnaCartaNuova/.test(PAGINA));

// ------------------------------------------------------------
// LE PAGINE DEVONO USCIRE UGUALI SU OGNI COMPUTER
// Python, su Windows, traduce da solo ogni a-capo in CR+LF. Le pagine
// generate li' venivano fuori diverse byte per byte da quelle generate
// su Linux o Mac — stesso contenuto, altri byte — e il controllo di
// allineamento, che i byte li confronta, gridava che erano tutte
// "rimaste indietro". Non era vero, ed e' il tipo di falso allarme che
// insegna a ignorare gli allarmi.
// ------------------------------------------------------------
{
  const { readdirSync } = await import('node:fs');
  const pagine = readdirSync(QUI).filter((f) => f.endsWith('.html'));
  const conCR = pagine.filter((f) => readFileSync(join(QUI, f)).includes(0x0d));
  check('le pagine generate hanno gli a-capo di un tipo solo (niente CR)',
        conCR.length === 0,
        conCR.join(', ') + ' — chi le ha generate non ha forzato newline=\'\\n\'');
}

// ------------------------------------------------------------
// I COMANDI DEVONO FUNZIONARE ANCHE SU WINDOWS
// "MAGAZZINO=... node prova.js" e' sintassi di Linux: su Windows cmd
// legge MAGAZZINO come il nome di un programma e si ferma. E' successo,
// e si e' fermato all'ULTIMO passo, dopo che tutti gli altri erano
// passati — il momento peggiore per scoprirlo.
// Stessa cosa per "python3", che su Windows non esiste, e per i percorsi
// che cominciano con /tmp.
// ------------------------------------------------------------
{
  const pacchetto = JSON.parse(readFileSync(join(QUI, '..', 'package.json'), 'utf8'));
  const comandi = Object.entries(pacchetto.scripts || {});

  const conVariabili = comandi.filter(([, c]) => /(^|&&\s*)[A-Z_][A-Z0-9_]*=/.test(c));
  check('nessun comando mette variabili davanti come su Linux',
        conVariabili.length === 0,
        conVariabili.map(([n]) => n).join(', ') +
        ' — mettile dentro al file di prova, con process.env');

  const conPython3 = comandi.filter(([, c]) => /\bpython3?\s/.test(c) && !c.includes('lancia-python'));
  check('Python si chiama sempre passando dal lanciatore',
        conPython3.length === 0, conPython3.map(([n]) => n).join(', '));

  const conTmp = comandi.filter(([, c]) => c.includes('/tmp'));
  check('nessun comando usa /tmp, che su Windows non esiste',
        conTmp.length === 0, conTmp.map(([n]) => n).join(', '));
}

// ------------------------------------------------------------
// TUTTO QUELLO CHE IL SERVER MANDA, IL TAVOLO LO DEVE RACCOGLIERE
//
// E' la famiglia di difetti piu' insidiosa di questo progetto, e ci
// siamo cascati tre volte: il server manda un campo, il tavolo non lo
// copia, e il gioco si comporta bene contro il bot e male in rete.
// L'ultima volta e' toccato al conto dei trenta secondi: la regola
// funzionava — la fa rispettare il server — ma il numero a schermo non
// compariva, cioe' il gioco ti bloccava senza dirti quanto mancava.
//
// Contro il bot non si vede mai, perche' li' lo stato E' la partita.
// In rete lo stato viene ricostruito campo per campo, e un campo
// dimenticato semplicemente non esiste.
// ------------------------------------------------------------
{
  const VISTA = readFileSync(join(QUI, '..', 'engine', 'vista.js'), 'utf8');
  // i campi che vistaPer mette nella busta, presi dal codice vero
  const corpo = VISTA.slice(VISTA.indexOf('export function vistaPer'));
  const dentro = corpo.slice(corpo.indexOf('return {') + 8, corpo.indexOf('\n}'));
  const campi = [...new Set(
    dentro.split('\n')
      .map((riga) => (riga.match(/^\s{4}([a-zA-Z][\w]*)\s*:/) || [])[1])
      .filter(Boolean)
  )];

  check('si riescono a leggere i campi della vista', campi.length >= 8,
        'trovati: ' + campi.join(', '));

  // "giocatori" lo apre giocatoreDaVista, non statoDaVista: si guarda
  // che almeno UNA delle due funzioni lo nomini.
  const adattatore = PAGINA.slice(PAGINA.indexOf('function giocatoreDaVista'),
                                  PAGINA.indexOf('let scartoOrologio'));
  // Qualche campo il tavolo lo ignora APPOSTA. L'elenco sta qui e non
  // altrove: aggiungerci un nome dev'essere un gesto consapevole, non
  // una dimenticanza che passa liscia.
  const IGNORATI_APPOSTA = {
    diChiEIlTurno: 'il tavolo ragiona in "io / avversario", non per numero di posto: usa eIlMioTurno'
  };
  const dimenticati = campi.filter((campo) =>
    !IGNORATI_APPOSTA[campo] && !new RegExp('\\bv\\.' + campo + '\\b').test(adattatore));

  check('il tavolo raccoglie ogni campo che la vista gli manda',
        dimenticati.length === 0,
        'mai letti: ' + dimenticati.join(', ') +
        '\n       In rete quei campi non esisteranno, e chi li usa si comportera\'' +
        '\n       diversamente da come fa contro il bot — senza nessun errore.');
}

console.log();
if (falliti) {
  console.log(falliti + ' controlli falliti.\n');
  process.exit(1);
}
console.log('Tutti i controlli passati.\n');
