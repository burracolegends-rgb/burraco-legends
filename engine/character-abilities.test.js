// Verifica del motore Abilità Personaggio. Uso: node engine/character-abilities.test.js

import {
  validateAbility, attachAbility, tickCharacterAbility, checkAbilityTrigger
} from './character-abilities.js';

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

// --- Validazione ---
{
  check('ciclico_pulso valido con periodo_turni', validateAbility({ trigger: 'ciclico_pulso', periodo_turni: 4, effect: 'danno_percentuale', parametro: '15' }).ok === true);
  check('ciclico_pulso senza periodo_turni è rifiutato', validateAbility({ trigger: 'ciclico_pulso', effect: 'danno_percentuale' }).ok === false);
  check('ciclico_buff valido con attivo/pausa turni', validateAbility({ trigger: 'ciclico_buff', attivo_turni: 2, pausa_turni: 3, effect: 'boost_att', parametro: '15' }).ok === true);
  check('trigger sconosciuto è rifiutato', validateAbility({ trigger: 'non_esiste' }).ok === false);
  check('nessuna abilità (null) è valida', validateAbility(null).ok === true);
}

// Le abilita ad attivazione manuale non si caricano piu da sole: gli eroi
// non hanno piu una barra propria. La riserva e una sola per giocatore
// (punti magia) e vive nel motore di partita - vedi engine/magie-in-partita.test.js.
{
  const casterCharacters = freshCharacters();
  const opponentCharacters = freshCharacters();
  const ability = { trigger: 'attivazione_manuale', effect: 'danno_da_attacco', parametro: '30', target: 'personaggio_specifico', costo: 4 };
  const character = casterCharacters['♥'];
  attachAbility(character, '♥', ability, { casterCharacters, opponentCharacters });
  const ctx = { casterCharacters, opponentCharacters };
  const r = tickCharacterAbility(character, '♥', ctx);
  check('un abilita manuale non parte mai da sola col passare dei turni', r.fired === false);
  check('nessun avversario viene toccato', Object.values(opponentCharacters).every((c) => c.pv === 100));
  check('gli eroi non hanno piu una barra di carica propria', character.carica === undefined);
}

// --- ciclico_buff: attivo N turni, poi pausa M turni, a ripetizione ---
{
  const casterCharacters = freshCharacters();
  const opponentCharacters = freshCharacters();
  const ability = { trigger: 'ciclico_buff', attivo_turni: 2, pausa_turni: 1, effect: 'boost_att', parametro: '20', target: 'se_stesso' };
  const character = casterCharacters['♠'];
  attachAbility(character, '♠', ability, { casterCharacters, opponentCharacters });
  check('il buff è applicato subito all\'attacco (fase iniziale "attivo")', character.att === 120);

  const ctx = { casterCharacters, opponentCharacters };
  const t1 = tickCharacterAbility(character, '♠', ctx);
  check('turno 1 di 2 in fase attiva: ancora nessun cambiamento di fase', t1.fired === false && character.att === 120);
  const t2 = tickCharacterAbility(character, '♠', ctx);
  check('turno 2 di 2: la fase attiva finisce, il buff viene rimosso', t2.fired === true && t2.phase === 'pausa' && character.att === 100);
  const t3 = tickCharacterAbility(character, '♠', ctx);
  check('dopo 1 turno di pausa: torna attivo, il buff si riapplica', t3.fired === true && t3.phase === 'attivo' && character.att === 120);
}

// --- Abilità a evento: on_pozzetto, non si consuma, scatta solo sull'evento giusto ---
{
  const casterCharacters = freshCharacters();
  casterCharacters['♦'].pv = 80;
  const opponentCharacters = freshCharacters();
  const ability = { trigger: 'on_pozzetto', effect: 'cura_diretta', parametro: '15', target: 'se_stesso' };
  const character = casterCharacters['♦'];
  attachAbility(character, '♦', ability, { casterCharacters, opponentCharacters });

  const ctx = { casterCharacters, opponentCharacters };
  const miss = checkAbilityTrigger(character, '♦', 'on_chiusura', ctx);
  check('un evento diverso non fa scattare l\'abilità', miss.fired === false && character.pv === 80);

  const hit1 = checkAbilityTrigger(character, '♦', 'on_pozzetto', ctx);
  check('on_pozzetto cura il personaggio (+15 PV)', hit1.fired === true && character.pv === 95);

  const hit2 = checkAbilityTrigger(character, '♦', 'on_pozzetto', ctx);
  check('l\'abilità a evento NON si consuma: scatta di nuovo la volta successiva', hit2.fired === true && character.pv === 100); // 95+15 tetto a pvMax 100
}

console.log('\n' + (failures === 0 ? 'Tutti i controlli passati.' : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
