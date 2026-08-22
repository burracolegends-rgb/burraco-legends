// Verifica rapida del port: mazzo, punti carta, validazione calate, fasce danno.
// Uso: node engine/core-rules.test.js  (nessuna dipendenza esterna)

import {
  createFullDeck, cardPointValue, isValidGroup, isValidSequence,
  validateMeld, meldLengthTier, computeMeldDamage, makeCard
} from './core-rules.js';

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('OK   ' + label); }
  else { console.log('FAIL ' + label); failures++; }
}

// --- Mazzo ---
const deck = createFullDeck();
check('mazzo ha 108 carte (2x52 + 4 jolly)', deck.length === 108);
check('mazzo ha 4 jolly', deck.filter(c => c.isJolly).length === 4);

// --- Punti carta (tabella spec §4) ---
check('carta 3-7 vale 5pt', cardPointValue(makeCard('♥', 5)) === 5);
check('figura (8-K) vale 10pt', cardPointValue(makeCard('♠', 12)) === 10);
check('Asso vale 15pt', cardPointValue(makeCard('♦', 1)) === 15);
check('pinella (2) vale 20pt', cardPointValue(makeCard('♣', 2)) === 20);
check('jolly vale 30pt', cardPointValue(makeCard(null, 0, true)) === 30);

// --- Validazione gruppo (tris) ---
const trisValido = [makeCard('♥', 7), makeCard('♠', 7), makeCard('♦', 7)];
check('tris di 7 dello stesso valore è valido', isValidGroup(trisValido).ok === true);

const trisInvalido = [makeCard('♥', 7), makeCard('♠', 8), makeCard('♦', 7)];
check('tris con valori diversi non è valido', isValidGroup(trisInvalido).ok === false);

// --- Validazione sequenza (scala) ---
const scalaValida = [makeCard('♥', 4), makeCard('♥', 5), makeCard('♥', 6)];
check('scala 4-5-6 di cuori è valida', isValidSequence(scalaValida).ok === true);

const scalaSemiMisti = [makeCard('♥', 4), makeCard('♠', 5), makeCard('♥', 6)];
check('scala con semi misti non è valida', isValidSequence(scalaSemiMisti).ok === false);

const scalaConJolly = [makeCard('♥', 4), makeCard('♥', 5), makeCard(null, 0, true), makeCard('♥', 7)];
check('scala con un buco coperto da jolly è valida', isValidSequence(scalaConJolly).ok === true);

// --- Fasce danno Battle (spec §4) ---
const cinque = [makeCard('♥', 3), makeCard('♥', 4), makeCard('♥', 5), makeCard('♥', 6), makeCard('♥', 7)];
check('calata da 5 carte è tier 5', meldLengthTier(cinque) === 5);
check('calata da 5 carte è valida come sequenza', validateMeld(cinque).ok === true);

const sette = [...cinque, makeCard('♥', 8), makeCard('♥', 9)];
check('calata da 7 carte è tier 7 (AoE)', meldLengthTier(sette) === 7);

// Scale corte: infliggono danno anche loro, senza bonus di lunghezza
const tre = [makeCard('♥', 4), makeCard('♥', 5), makeCard('♥', 6)];
check('scala da 3 carte è tier 3 (danno pieno, nessun bonus)', meldLengthTier(tre) === 3);
const dannoTre = computeMeldDamage(tre, 100);
check('scala da 3 carte infligge danno (15 punti × ATT 100 × 1)', Math.abs(dannoTre.damage - 15) < 1e-9);
check('scala da 3 carte colpisce un bersaglio singolo', dannoTre.target === 'singolo');
const quattro = [...tre, makeCard('♥', 7)];
check('scala da 4 carte resta tier 3 (nessun bonus fino a 5 carte)', meldLengthTier(quattro) === 3);
check('sotto le 3 carte non c\'è calata valida', meldLengthTier([makeCard('♥', 4), makeCard('♥', 5)]) === null);

const dannoSette = computeMeldDamage(sette, 150); // ATT 150 di esempio
// punti: 3-7=5pt x5 + 8=10 + 9=10 = 45; danno = 45 * (150/100) * 1.6 = 108
check('danno calcolato per calata da 7 con ATT 150 è 108', Math.abs(dannoSette.damage - 108) < 1e-9);
check('calata da 7 ha bersaglio aoe', dannoSette.target === 'aoe');

console.log('\n' + (failures === 0 ? 'Tutti i controlli passati.' : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
