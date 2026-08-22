// Verifica del motore Carte Magiche. Uso: node engine/magic-cards.test.js

import { makeCard } from './core-rules.js';
import {
  validateSelection, makeMagicState, activateSorpresa, armTrappola,
  tickTrapExpiry, checkTrapTrigger, tickActiveEffects, applyEffect, resetTurnoMagie
} from './magic-cards.js';

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('OK   ' + label); }
  else { console.log('FAIL ' + label); failures++; }
}

function freshCharacters() {
  const c = {};
  for (const s of ['♥', '♦', '♣', '♠']) c[s] = { pv: 100, pvMax: 100, att: 100 };
  return c;
}

const sorpresaDanno = { id: 's1', tipo: 'sorpresa', effect: 'danno_diretto', parametro: '30', trigger: 'on_activate', target: 'avversario', durata_turni: 0 };
const sorpresaBoost = { id: 's2', tipo: 'sorpresa', effect: 'boost_att', parametro: '20', trigger: 'on_activate', target: 'se_stesso', durata_turni: 2 };
const trappolaScarto = { id: 't1', tipo: 'trappola', effect: 'scarto_forzato', parametro: '1', trigger: 'avversario_pesca', target: 'avversario', durata_turni: 0 };

// --- Selezione: esattamente 3 carte, mix libero ---
{
  const ok = validateSelection([sorpresaDanno, sorpresaBoost, trappolaScarto]);
  check('selezione di 3 carte miste è valida', ok.ok === true);
  check('selezione di 2 carte è rifiutata', validateSelection([sorpresaDanno, trappolaScarto]).ok === false);
  check('carta con effect sconosciuto è rifiutata', validateSelection([sorpresaDanno, sorpresaBoost, { id: 'x', tipo: 'trappola', effect: 'non_esiste', durata_turni: 0 }]).ok === false);
}

// --- Sorpresa: danno diretto, 1 sola utilizzabile per partita ---
{
  const magicState = makeMagicState([sorpresaDanno, sorpresaBoost, trappolaScarto]);
  const casterCharacters = freshCharacters();
  const opponentCharacters = freshCharacters();
  const ctx = { casterCharacters, opponentCharacters, suit: '♥' };

  const r1 = activateSorpresa(magicState, sorpresaDanno, ctx);
  check('Sorpresa danno_diretto applicata', r1.ok === true && r1.applied === true);
  check('personaggio avversario colpito perde 30 PV', opponentCharacters['♥'].pv === 70);
  check('sorpresaUsed è ora true', magicState.sorpresaUsed === true);

  const r2 = activateSorpresa(magicState, sorpresaBoost, ctx);
  check('seconda Sorpresa nella stessa partita viene rifiutata (anche se diversa)', r2.ok === false);
}

// --- Sorpresa: boost_att applica e poi svanisce con tickActiveEffects ---
{
  const magicState = makeMagicState([sorpresaBoost, trappolaScarto, sorpresaDanno]);
  const casterCharacters = freshCharacters();
  const opponentCharacters = freshCharacters();
  const ctx = { casterCharacters, opponentCharacters, suit: '♥' };

  activateSorpresa(magicState, sorpresaBoost, ctx);
  check('boost_att applicato subito (+20 ATT)', casterCharacters['♥'].att === 120);
  check('effetto attivo registrato con durata 2', magicState.effettiAttivi.length === 1 && magicState.effettiAttivi[0].turniRimasti === 2);

  tickActiveEffects(magicState, casterCharacters, opponentCharacters); // turno 1: ancora attivo
  check('dopo 1 turno il boost è ancora attivo', casterCharacters['♥'].att === 120 && magicState.effettiAttivi.length === 1);

  tickActiveEffects(magicState, casterCharacters, opponentCharacters); // turno 2: scade
  check('dopo 2 turni il boost svanisce e l\'ATT torna a 100', casterCharacters['♥'].att === 100 && magicState.effettiAttivi.length === 0);
}

// --- Trappola: fino a 3 armabili, la quarta viene rifiutata ---
// (con reset del turno fra una e l'altra: se ne gioca una sola per turno)
{
  const magicState = makeMagicState([trappolaScarto, trappolaScarto, trappolaScarto]);
  check('prima trappola armata', armTrappola(magicState, trappolaScarto).ok === true);
  resetTurnoMagie(magicState);
  check('seconda trappola armata (turno successivo)', armTrappola(magicState, trappolaScarto).ok === true);
  resetTurnoMagie(magicState);
  check('terza trappola armata (turno successivo)', armTrappola(magicState, trappolaScarto).ok === true);
  resetTurnoMagie(magicState);
  check('quarta trappola rifiutata (limite 3 per partita)', armTrappola(magicState, trappolaScarto).ok === false);
}

// --- UNA SOLA Carta Magica per turno (regola del committente) ---
{
  const magicState = makeMagicState([sorpresaDanno, trappolaScarto, trappolaScarto]);
  const casterCharacters = freshCharacters(), opponentCharacters = freshCharacters();
  const ctx = { casterCharacters, opponentCharacters, suit: '♥' };

  check('la prima trappola del turno si arma', armTrappola(magicState, trappolaScarto).ok === true);
  const secondaStessoTurno = armTrappola(magicState, trappolaScarto);
  check('una SECONDA carta magica nello stesso turno è rifiutata', secondaStessoTurno.ok === false && /una sola/i.test(secondaStessoTurno.reason));
  const sorpresaStessoTurno = activateSorpresa(magicState, sorpresaDanno, ctx);
  check('nemmeno una Sorpresa si può giocare nello stesso turno', sorpresaStessoTurno.ok === false);

  resetTurnoMagie(magicState);
  check('col turno nuovo si torna a poterne giocare una', activateSorpresa(magicState, sorpresaDanno, ctx).ok === true);
}

// --- Trappola: scade dopo N turni se il trigger non scatta mai ---
{
  const magicState = makeMagicState([trappolaScarto]);
  armTrappola(magicState, trappolaScarto, 3);
  check('trappola armata presente', magicState.trappoleArmate.length === 1);
  tickTrapExpiry(magicState);
  tickTrapExpiry(magicState);
  check('dopo 2 turni la trappola è ancora armata', magicState.trappoleArmate.length === 1);
  const scadute = tickTrapExpiry(magicState);
  check('al terzo turno la trappola scade da sola', magicState.trappoleArmate.length === 0 && scadute.length === 1);
}

// --- Trappola: scatta quando l'evento giusto si verifica, e si consuma ---
{
  const magicState = makeMagicState([trappolaScarto]);
  armTrappola(magicState, trappolaScarto, 5);
  const casterHand = [makeCard('♥', 3)];
  const opponentHand = [makeCard('♦', 5), makeCard('♣', 9)];
  const ctx = { casterCharacters: freshCharacters(), opponentCharacters: freshCharacters(), casterHand, opponentHand, scarti: [] };

  const missed = checkTrapTrigger(magicState, 'evento_sbagliato', trappolaScarto, ctx);
  check('un evento diverso dal trigger non fa scattare la trappola', missed.triggered === false && magicState.trappoleArmate.length === 1);

  const hit = checkTrapTrigger(magicState, 'avversario_pesca', trappolaScarto, ctx);
  check('l\'evento giusto fa scattare la trappola', hit.triggered === true);
  check('la trappola si consuma (non resta armata)', magicState.trappoleArmate.length === 0);
  check('scarto_forzato ha ridotto la mano avversaria di 1 carta', opponentHand.length === 1);
}

// --- Effetti diretti: cura (con tetto al massimo) e brucia_carta ---
{
  const casterCharacters = freshCharacters();
  casterCharacters['♠'].pv = 90;
  const cura = { effect: 'cura_diretta', parametro: '30', target: 'se_stesso', durata_turni: 0 };
  const r = applyEffect(cura, { casterCharacters, opponentCharacters: freshCharacters(), suit: '♠' });
  check('cura_diretta non supera i PV massimi (90+30 → tetto 100)', casterCharacters['♠'].pv === 100 && r.applied === true);

  const scarti = [makeCard('♥', 3), makeCard('♦', 9)];
  const brucia = { effect: 'brucia_carta', parametro: 'ultima_scartata', target: 'avversario', durata_turni: 0 };
  const rb = applyEffect(brucia, { scarti });
  check('brucia_carta rimuove l\'ultima carta scartata', scarti.length === 1 && rb.applied === true);
}

console.log('\n' + (failures === 0 ? 'Tutti i controlli passati.' : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
