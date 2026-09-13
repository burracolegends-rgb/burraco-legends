// ============================================================
// OGNI ABILITÀ DEL ROSTER, PROVATA DAVVERO — non solo scritta bene.
//
// PERCHÉ ESISTE, OLTRE A carte-lint.test.js
// carte-lint.test.js controlla che ogni carta sia scritta bene: effetti
// che esistono, bersagli ammessi, trigger validi. Necessario, non
// basta: una carta può essere perfettamente valida sulla carta e non
// fare quello che promette lo stesso — un effetto che si applica ma non
// nell'ordine giusto, un bersaglio scelto male, un secondo effetto che
// scompare in silenzio (è già successo davvero: vedi il commento su
// Papa Figo in engine/magie-in-partita.test.js, test 18). La lettura del
// codice non lo scopre: bisogna eseguire l'abilità per davvero, come
// farebbe un giocatore, e controllare il risultato.
//
// COSA FA
// Per ogni personaggio_*.json con abilità "attivazione_manuale" (le
// altre famiglie di trigger — ciclico_pulso, ciclico_buff, on_* — hanno
// la loro prova generica in character-abilities.test.js): monta una
// partita sintetica, gli attacca la SUA abilità vera (presa da
// cards/data, non riscritta a mano), la usa una volta con punti magia
// pieni, e controlla che:
//   1. l'attivazione vada a segno (nessun errore, nessun rifiuto muto);
//   2. OGNI effetto dichiarato sulla carta risulti davvero eseguito nel
//      resoconto — non solo il primo, non solo quello con danno.
//
// Non controlla i NUMERI esatti (quanto danno, quanti PV curati): quello
// lo fa già la suite generica sugli effetti (magie-in-partita.test.js).
// Qui si controlla che la carta VERA, così com'è scritta oggi in
// cards/data, non perda per strada nessuno dei suoi effetti — la stessa
// domanda che ha fatto scoprire il guasto di Papa Figo la prima volta,
// ripetuta per le altre 31 carte del roster, e per tutte quelle che
// arriveranno dopo: un file nuovo in cards/data basta a farlo controllare
// da solo, senza scrivere un test apposta ogni volta.
//
// Uso: node engine/roster-abilities-smoke.test.js
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMatch, usaAbilitaSpeciale, abilitaChiedeBersaglio } from './partita.js';
import { elencoEffetti } from './vocabolario.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RADICE = path.join(__dirname, '..');
const DATI = path.join(RADICE, 'cards', 'data');
const NOMI = JSON.parse(fs.readFileSync(path.join(RADICE, 'cards', 'i18n', 'it.json'), 'utf8'));

let failures = 0;
function check(label, cond) {
  console.log((cond ? 'OK   ' : 'FAIL ') + label);
  if (!cond) failures++;
}

const T0 = Date.parse('2026-08-04T10:00:00.000Z');
const SUITS = ['♥', '♦', '♣', '♠'];

const file = fs.readdirSync(DATI)
  .filter((f) => f.startsWith('personaggio_') && f.endsWith('.json'))
  .sort();

console.log('--- OGNI ABILITÀ "ATTIVAZIONE_MANUALE" DEL ROSTER, USATA DAVVERO ---');
let provate = 0;
for (const f of file) {
  const carta = JSON.parse(fs.readFileSync(path.join(DATI, f), 'utf8'));
  const a = carta.abilita;
  if (!a || a.trigger !== 'attivazione_manuale') continue;   // gli altri trigger: character-abilities.test.js
  provate++;

  const nome = (NOMI[carta.id] && NOMI[carta.id].nome) || carta.id;
  const seme = carta.seme;

  // Partita sintetica: personaggi di base ovunque, SOLO l'eroe sotto
  // esame porta la sua abilità vera — presa da cards/data, non
  // ricopiata a mano (altrimenti si proverebbe la copia, non la carta).
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, abilities: [{ [seme]: a }, {}] });
  state.players[0].puntiMagia = 15;
  state.players[1].puntiMagia = 15;

  // Le carte "a scelta" (personaggio_specifico) chiedono un bersaglio:
  // se ne sceglie uno vivo, un seme diverso dall'attaccante — la stessa
  // domanda che fa il tavolo vero (abilitaChiedeBersaglio, condivisa fra
  // client e motore, vedi la nota in partita.js).
  const chiedeScelta = abilitaChiedeBersaglio(a);
  const bersaglio = chiedeScelta ? SUITS.find((s) => s !== seme) : null;

  const r = usaAbilitaSpeciale(state, 0, seme, bersaglio, T0 + 1000);
  check(carta.id + ' "' + nome + '": l\'abilità va a segno senza errori', r.ok === true);
  if (!r.ok) {
    console.log('     motivo del rifiuto: ' + r.reason);
    continue;
  }

  const dichiarati = elencoEffetti(a);
  const eseguiti = (r.effettiAbilita || []).map((e) => e.effect);
  for (let i = 0; i < dichiarati.length; i++) {
    const d = dichiarati[i];
    const dove = dichiarati.length > 1 ? ' (effetto ' + (i + 1) + ' di ' + dichiarati.length + ')' : '';
    check(carta.id + ' "' + nome + '": l\'effetto dichiarato "' + d.effect + '"' + dove + ' risulta eseguito',
          eseguiti.includes(d.effect));
  }
}
check('almeno un\'abilità è stata davvero provata (altrimenti questo test non controlla niente)', provate > 0);
console.log(provate + ' abilità "attivazione_manuale" provate su ' + file.length + ' personaggi.');

console.log('\n' + (failures === 0 ? 'Tutti i controlli passati.' : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
