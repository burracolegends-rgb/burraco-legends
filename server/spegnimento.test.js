// ============================================================
// CTRL+C DEVE FERMARE IL SERVER SUBITO
//
// Il tavolo tiene aperta una richiesta per venticinque secondi, in
// attesa che l'avversario muova: e' il modo in cui la novita' arriva
// nell'istante in cui succede, senza chiedere ogni secondo "e' cambiato
// qualcosa?". Il prezzo e' che in qualunque momento ci sono
// collegamenti aperti che non stanno facendo niente.
//
// server.close() aspetta che ogni collegamento aperto finisca da solo.
// Con quelle attese appese, premere Ctrl+C sembrava non fare NIENTE per
// parecchi secondi — e chi guarda una finestra che non risponde pensa
// che si sia bloccata, non che stia aspettando con pazienza.
//
// Qui si apre davvero un'attesa lunga, si manda il segnale, e si conta
// quanto ci mette a chiudersi. Deve essere questione di un attimo.
// ============================================================

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rmSync } from 'node:fs';

const QUI = dirname(fileURLToPath(import.meta.url));
const PORTA = 8391;
const MAGAZZINO = join(QUI, '..', 'dati', 'prova-spegnimento.json');
const LIMITE_MS = 6000;      // largo: si vuole scoprire "non finisce mai"

let ko = 0;
const check = (l, c, d) => {
  console.log((c ? 'OK   ' : 'FAIL ') + l + (c || !d ? '' : '  <- ' + d));
  if (!c) ko++;
};

console.log('\n--- CTRL+C FERMA IL SERVER SUBITO? ---');

const figlio = spawn(process.execPath, [join(QUI, 'server.js')], {
  env: { ...process.env, PORTA: String(PORTA), MAGAZZINO },
  stdio: ['ignore', 'pipe', 'pipe']
});

let uscito = null;
figlio.on('exit', () => { uscito = Date.now(); });

const aspetta = (ms) => new Promise((ok) => setTimeout(ok, ms));

// aspetta che risponda
let inPiedi = false;
for (let i = 0; i < 60 && !inPiedi; i++) {
  await aspetta(100);
  try {
    const r = await fetch('http://127.0.0.1:' + PORTA + '/api/salute');
    inPiedi = r.ok;
  } catch (e) { /* non ancora */ }
}
check('il server si accende', inPiedi);

if (inPiedi) {
  // un tavolo con un'attesa lunga appesa, come quando si aspetta
  // che l'altro giocatore muova
  const apri = await (await fetch('http://127.0.0.1:' + PORTA + '/api/apri', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Prova' })
  })).json();
  check('si apre un tavolo', apri.ok === true);

  // NON si aspetta questa: deve restare appesa
  const appesa = fetch('http://127.0.0.1:' + PORTA + '/api/stato?codice=' +
    apri.codice + '&segreto=' + encodeURIComponent(apri.segreto) + '&da=0')
    .catch(() => null);
  await aspetta(400);

  const inizio = Date.now();
  figlio.kill('SIGINT');

  for (let i = 0; i < LIMITE_MS / 100 && uscito === null; i++) await aspetta(100);

  const quanto = uscito === null ? null : uscito - inizio;
  check('e si ferma senza restare appeso alle attese lunghe',
    quanto !== null,
    'dopo ' + LIMITE_MS + 'ms era ancora vivo: Ctrl+C sembra non funzionare');
  if (quanto !== null) {
    console.log('       ci ha messo ' + quanto + ' ms');
    check('in un tempo che non sembra un blocco (sotto i 3 secondi)', quanto < 3000);
  }
  await appesa;
}

if (uscito === null) figlio.kill('SIGKILL');
try { rmSync(MAGAZZINO, { force: true }); } catch (e) {}

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.') + '\n');
process.exit(ko === 0 ? 0 : 1);
