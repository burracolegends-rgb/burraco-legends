// ============================================================
// BURRACO LEGENDS — Abilità Personaggio (spec §7)
//
// Riusa il catalogo `effect` e l'esecutore `applyEffect` già scritti per
// le Carte Magiche (engine/magic-cards.js), come da principio guida della
// spec: non inventare meccaniche nuove se una validata esiste già.
//
// Tre famiglie di abilità (spec §7):
//   - "ciclico_pulso": ogni N turni del proprietario, un effetto istantaneo
//     scatta una volta (es. "-50 PV a un avversario a caso ogni 4 turni").
//   - "ciclico_buff": il personaggio è "attivo" (buff applicato) per A
//     turni, poi in "pausa" (buff rimosso) per B turni, a ripetizione
//     (es. "buff attivo 2 turni poi pausa 3 turni").
//   - trigger legati a un evento del game loop già esistente (spec: "da
//     agganciare a trigger del game loop già esistenti — pescata pozzetto,
//     chiusura, subito danno, ecc. — invece di essere isolate"):
//     on_pozzetto, on_chiusura, on_subisco_danno, on_infliggo_danno.
//
// Valore consigliato dalla spec: percentuale piccola, 10-20%, per gli
// effetti boost_att/boost_difesa/danno_percentuale — non impedito qui,
// ma da rispettare quando si scrivono le carte vere.
// ============================================================

import { applyEffect } from './magic-cards.js';

export const ABILITY_TRIGGERS = [
  'attivazione_manuale',          // barra piena → la si tocca e si sceglie il bersaglio
  'ciclico_pulso', 'ciclico_buff',
  'on_pozzetto', 'on_chiusura', 'on_subisco_danno', 'on_infliggo_danno'
];

export function validateAbility(ability) {
  if (!ability) return { ok: true }; // un personaggio può non avere abilità
  if (!ABILITY_TRIGGERS.includes(ability.trigger)) {
    return { ok: false, reason: `trigger "${ability.trigger}" non valido.` };
  }
  if (ability.trigger === 'ciclico_pulso' && !(ability.periodo_turni > 0)) {
    return { ok: false, reason: 'ciclico_pulso richiede periodo_turni > 0.' };
  }
  if (ability.trigger === 'ciclico_buff' && !(ability.attivo_turni > 0 && ability.pausa_turni > 0)) {
    return { ok: false, reason: 'ciclico_buff richiede attivo_turni e pausa_turni > 0.' };
  }
  return { ok: true };
}

// Collega la definizione di abilità a un personaggio (l'oggetto
// {pv,pvMax,att,...} dentro partita.js) e inizializza lo stato del
// ciclo. Per "ciclico_buff" applica subito il buff iniziale: si parte in
// fase "attivo" fin dall'inizio della partita.
// Quanti turni servono a riempire la barra di carica, se la carta non lo
// dice. Vale solo come rete di sicurezza: il numero giusto sta sulla carta.
export const TURNI_CARICA_DEFAULT = 4;

// Quanto si riempie la barra a ogni turno del proprietario. La barra è il
// contatore di velocità dell'abilità speciale: un'abilità debole si carica
// in pochi turni, una forte ne richiede di più. Il numero di turni sta sul
// personaggio (`turniCarica`); se manca si usa il periodo dell'abilità.
export function passoCarica(character) {
  const turni = character.turniCarica ||
    (character._ability && character._ability.periodo_turni) || TURNI_CARICA_DEFAULT;
  return 100 / turni;
}

export function attachAbility(character, suit, ability, ctx) {
  character._ability = ability;
  if (ability.trigger === 'attivazione_manuale' || ability.trigger === 'ciclico_pulso') {
    // niente da preparare: l'abilità si paga dai punti magia del giocatore
  } else if (ability.trigger === 'ciclico_buff') {
    character._abilityState = { phase: 'attivo', turnsInPhase: 0 };
    applyEffect({ ...ability, target: ability.target || 'se_stesso' }, { ...ctx, suit });
  }
}

// Da chiamare una volta per turno del PROPRIETARIO del personaggio. Fa
// avanzare i contatori ciclici e scatena l'effetto quando è il momento.
// Le abilità a evento (on_pozzetto ecc.) non passano da qui: vedi
// checkAbilityTrigger sotto.
export function tickCharacterAbility(character, suit, ctx) {
  const ability = character._ability;
  if (!ability) return { fired: false };

  // ATTIVAZIONE MANUALE — gli eroi non si caricano più uno per uno.
  // La vecchia barra blu sulla singola carta è stata tolta: ora esiste
  // una sola riserva di PUNTI MAGIA per giocatore (+2 a turno, massimo
  // 15, vedi partita.js) e l'abilità si paga da lì. Qui non c'è più
  // niente da far avanzare.
  if (ability.trigger === 'attivazione_manuale' || ability.trigger === 'ciclico_pulso') {
    return { fired: false };
  }

  if (ability.trigger === 'ciclico_buff') {
    const st = character._abilityState;
    st.turnsInPhase++;
    const limite = st.phase === 'attivo' ? ability.attivo_turni : ability.pausa_turni;
    if (st.turnsInPhase >= limite) {
      st.turnsInPhase = 0;
      if (st.phase === 'attivo') {
        revertBuff(character, ability); // fine fase attiva: rimuove il buff, passa in pausa
        st.phase = 'pausa';
      } else {
        applyEffect({ ...ability, target: ability.target || 'se_stesso' }, { ...ctx, suit }); // fine pausa: riapplica, torna attivo
        st.phase = 'attivo';
      }
      return { fired: true, phase: st.phase };
    }
    return { fired: false };
  }

  return { fired: false };
}

function revertBuff(character, ability) {
  const param = Number(ability.parametro);
  if (ability.effect === 'boost_att') character.att -= param;
  if (ability.effect === 'boost_difesa') character.difesaPercent = Math.max(0, (character.difesaPercent || 0) - param);
}

// Da chiamare quando accade un evento di gioco per il proprietario di
// questo personaggio (ha appena preso il pozzetto, ha appena chiuso, ha
// subito o inflitto danno). Le abilità a evento non si "consumano":
// scattano ogni volta che l'evento si ripresenta.
export function checkAbilityTrigger(character, suit, eventName, ctx) {
  const ability = character._ability;
  if (!ability || ability.trigger !== eventName) return { fired: false };
  const result = applyEffect(ability, { ...ctx, suit });
  return { fired: true, result };
}
