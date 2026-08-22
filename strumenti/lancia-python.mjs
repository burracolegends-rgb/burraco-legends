// ============================================================
// TROVA PYTHON, COMUNQUE SI CHIAMI QUI
//
// Lo stesso programma ha tre nomi diversi a seconda di dove gira:
//   Windows   py        (il lanciatore ufficiale, sceglie la versione)
//   Windows   python    (se e' stato aggiunto al PATH durante l'installazione)
//   Linux/Mac python3   (dove "python" da solo puo' ancora essere il 2)
//
// Nei comandi di npm c'era scritto "python3", che sul computer di chi
// usa Windows non esiste: i controlli si fermavano subito con un
// messaggio che parlava del Microsoft Store e non c'entrava niente.
// Scrivere "python" avrebbe rotto la parte opposta. Quindi si prova, in
// ordine, e si usa il primo che risponde davvero.
//
// Uso:  node strumenti/lancia-python.mjs [--saltabile] script.py [argomenti]
//
// Con --saltabile, se Python non c'e' il controllo si tira da parte
// invece di far fallire tutto. Serve per i CONTROLLI: sono la rete di
// sicurezza di chi sviluppa, e chi vuole solo giocare non deve essere
// costretto a installare Python per farli girare. Senza --saltabile
// (cioe' quando si RICOSTRUISCONO le pagine) l'assenza e' un errore
// vero: senza Python le pagine non si possono rifare.
// ============================================================

import { spawnSync } from 'node:child_process';

const CANDIDATI = [
  ['py', ['-3']],      // Windows: il lanciatore, con la versione 3 esplicita
  ['python3', []],     // Linux, Mac
  ['python', []]       // Windows con python nel PATH
];

function funziona(comando, prefisso) {
  const prova = spawnSync(comando, [...prefisso, '--version'], {
    stdio: 'ignore', shell: process.platform === 'win32'
  });
  return prova.status === 0;
}

let argomenti = process.argv.slice(2);
const saltabile = argomenti[0] === '--saltabile';
if (saltabile) argomenti = argomenti.slice(1);
if (argomenti.length === 0) {
  console.error('Uso: node strumenti/lancia-python.mjs <script.py> [argomenti]');
  process.exit(2);
}

let scelto = null;
for (const [comando, prefisso] of CANDIDATI) {
  if (funziona(comando, prefisso)) { scelto = [comando, prefisso]; break; }
}

if (!scelto && saltabile) {
  console.log('');
  console.log('SALTATO: manca Python, quindi non posso ricostruire le pagine per');
  console.log('confrontarle. Le altre prove girano lo stesso.');
  console.log('Se vuoi anche questa: https://python.org, spuntando');
  console.log('"Add Python to PATH" durante l\'installazione.');
  console.log('');
  process.exit(0);
}

if (!scelto) {
  console.error('');
  console.error('  ============================================');
  console.error('   NON TROVO PYTHON');
  console.error('  ============================================');
  console.error('');
  console.error('   Serve a rigenerare le pagine del gioco dal motore.');
  console.error('   Per GIOCARE non serve: le pagine sono gia' + "'" + ' pronte.');
  console.error('');
  console.error('   Scaricalo da https://python.org');
  console.error('   Durante l' + "'" + 'installazione spunta la casella');
  console.error('   "Add Python to PATH": e' + "'" + ' quella che lo rende');
  console.error('   raggiungibile da qui.');
  console.error('');
  process.exit(1);
}

const [comando, prefisso] = scelto;
const esito = spawnSync(comando, [...prefisso, ...argomenti], {
  stdio: 'inherit', shell: process.platform === 'win32'
});
process.exit(esito.status === null ? 1 : esito.status);
