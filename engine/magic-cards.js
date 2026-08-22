// ============================================================
// BURRACO LEGENDS — Carte Magiche: Sorpresa e Trappola (spec §6)
//
// Catalogo `effect` fisso (tabella spec §6) + regole di selezione e
// attivazione. Le carte vere vivranno come JSON in /cards/data
// (trappola_NNN.json, sorpresa_NNN.json) — vedi cards/data/esempio-*.json
// per il formato.
//
// COSA È GIÀ COMPLETO E TESTATO QUI (effetti immediati, meccanici):
//   danno_diretto, danno_percentuale, cura_diretta, scarto_forzato,
//   scambio_carte, brucia_carta, boost_att, boost_difesa, ricarica_sorpresa
//
// COSA È SOLO "ARMATO" QUI (il flag/la durata sono corretti e testati,
// ma serve un aggancio nel motore di partita per avere effetto reale —
// vedi "PUNTI DI INTEGRAZIONE CON partita.js" in fondo al file):
//   raddoppia_danno, riflette_danno, annulla_danno, restrict_draw_source,
//   pesca_ridotta, pesca_extra, blocca_monte_scarti, skip_fase_attacco,
//   skip_turno_intero, turno_extra
// ============================================================

// Se il trigger di una Trappola non si verifica mai, scade dopo N turni.
// Spec: "da definire tra 3 o 5" — punto ancora aperto, default provvisorio.
import { interoCasuale, infliggiDanno } from './core-rules.js';

export const TRAP_EXPIRY_TURNS_DEFAULT = 3;

export const EFFECT_CATALOG = {
  // --- Danno e cura ---
  danno_diretto:       { categoria: 'danno_cura', descrizione: 'Danno fisso a un personaggio' },
  danno_percentuale:   { categoria: 'danno_cura', descrizione: 'Danno in % dei PV massimi' },
  cura_diretta:        { categoria: 'danno_cura', descrizione: 'Restituisce PV fissi' },
  raddoppia_danno:     { categoria: 'danno_cura', descrizione: 'Prossima calata vale doppio' },
  riflette_danno:      { categoria: 'danno_cura', descrizione: 'Rimanda % danno subito all\'attaccante' },
  annulla_danno:       { categoria: 'danno_cura', descrizione: 'Blocca il prossimo danno' },
  // --- Fase di pesca ---
  restrict_draw_source:{ categoria: 'pesca', descrizione: 'Limita cosa può pescare l\'avversario' },
  pesca_ridotta:       { categoria: 'pesca', descrizione: 'Pesca meno carte del normale' },
  pesca_extra:         { categoria: 'pesca', descrizione: 'Pesca carte in più' },
  blocca_monte_scarti: { categoria: 'pesca', descrizione: 'Non può prendere il mazzetto scarti' },
  // --- Fase di attacco / turno ---
  skip_fase_attacco:   { categoria: 'turno', descrizione: 'Salta la fase d\'attacco' },
  skip_turno_intero:   { categoria: 'turno', descrizione: 'Salta l\'intero turno' },
  turno_extra:         { categoria: 'turno', descrizione: 'Turno aggiuntivo' },
  // --- Carte in mano ---
  scarto_forzato:      { categoria: 'mano', descrizione: 'Scarta una carta a caso' },
  scambio_carte:       { categoria: 'mano', descrizione: 'Scambia una carta a caso tra le mani' },
  brucia_carta:        { categoria: 'mano', descrizione: 'Rimuove una carta da scarti/mazzo' },
  // --- Personaggi ---
  boost_att:           { categoria: 'personaggi', descrizione: 'Aumenta ATT di un personaggio (temporaneo)' },
  boost_difesa:        { categoria: 'personaggi', descrizione: 'Riduce danno subito (temporaneo)' },
  ricarica_sorpresa:   { categoria: 'personaggi', descrizione: 'Rende di nuovo giocabile una Carta Magica già spesa in questa partita' }
};

const TARGETS = ['avversario', 'se_stesso', 'personaggio_specifico', 'tutti'];
const SUITS = ['♥', '♦', '♣', '♠'];

// Una carta può portare un solo `effect` (forma vecchia) oppure una lista
// `effetti: [...]`. Questa restituisce il primo, qualunque forma abbia.
function primoEffetto(card) {
  if (!card) return null;
  if (Array.isArray(card.effetti) && card.effetti.length) return card.effetti[0];
  return card.effect ? card : null;
}

// ------------------------------------------------------------
// Validazione di una definizione carta (formato /cards/data/*.json)
// ------------------------------------------------------------
export function validateCardDefinition(card) {
  if (!card || (card.tipo !== 'sorpresa' && card.tipo !== 'trappola')) {
    return { ok: false, reason: 'tipo deve essere "sorpresa" o "trappola".' };
  }
  if (!EFFECT_CATALOG[card.effect]) {
    return { ok: false, reason: `effect "${card.effect}" non è nel catalogo.` };
  }
  if (card.target && !TARGETS.includes(card.target)) {
    return { ok: false, reason: `target "${card.target}" non valido.` };
  }
  if (typeof card.durata_turni !== 'number' || card.durata_turni < 0) {
    return { ok: false, reason: 'durata_turni deve essere un numero >= 0.' };
  }
  return { ok: true };
}

// Selezione pre-partita: 3 carte totali, mix libero (spec §6)
export function validateSelection(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) {
    return { ok: false, reason: 'Vanno selezionate esattamente 3 Carte Magiche.' };
  }
  for (const c of cards) {
    const v = validateCardDefinition(c);
    if (!v.ok) return v;
  }
  return { ok: true };
}

// ------------------------------------------------------------
// Stato Carte Magiche di un giocatore (da affiancare a un player di
// partita.js, non ancora incorporato lì)
// ------------------------------------------------------------
export function makeMagicState(selectedCards) {
  return {
    selection: selectedCards,      // le 3 carte scelte, definizioni complete
    trappoleArmate: [],            // { cardId, effect, parametro, trigger, target, turniRimasti }
    giocateQuestoTurno: 0,         // UNA SOLA carta magica per turno (regola del committente)
    // QUALI POSTI SONO SPESI.
    // Ogni carta portata in partita vale UN SOLO utilizzo: giocata, quel
    // posto è vuoto per il resto della partita. Prima non c'era: i limiti
    // erano "una Sorpresa in tutto" e "tre Trappole in tutto", che però
    // contavano QUANTE carte, non QUALI — e la stessa Trappola si poteva
    // armare tre volte di fila. Con le carte che si consumano davvero
    // dalla collezione, quel buco costerebbe copie vere al giocatore.
    // Si segnano gli INDICI, non gli id: è il posto a essere speso.
    consumate: [],
    // Quali carte sono già state giocate, per id. Serve al tavolo per
    // mostrarle spente: una carta usata che resta al suo posto fa
    // credere di averla ancora.
    giocate: [],
    effettiAttivi: []              // buff/debuff con durata: { effect, parametro, target, suit, turniRimasti, ownerIndex }
  };
}

// Quel posto è già stato speso in questa partita?
export function cartaConsumata(magicState, indiceCarta) {
  return !!magicState && (magicState.consumate || []).includes(indiceCarta);
}

// Da chiamare all'inizio del turno del proprietario: sblocca la carta
// magica del turno nuovo. Senza, se ne potrebbe giocare una sola per partita.
export function resetTurnoMagie(magicState) { magicState.giocateQuestoTurno = 0; }

// Il caso, quando serve, arriva dal contesto della partita. Se manca si
// usa Math.random: comodo per le prove sciolte, ma in partita il
// generatore è quello dello stato, altrimenti la partita non si può
// rigiocare uguale e i registri delle mosse non servono a niente.
function caso(ctx) { return (ctx && ctx.rng) ? ctx.rng : Math.random; }

function resolveTargetCharacters(target, casterCharacters, opponentCharacters, suit, rng = Math.random) {
  if (target === 'se_stesso') {
    return suit ? [suit] : SUITS.filter((s) => casterCharacters[s].pv > 0);
  }
  if (target === 'tutti') return SUITS;
  if (target === 'personaggio_specifico') return suit ? [suit] : [];
  // 'avversario' (default): un personaggio avversario specifico se indicato,
  // altrimenti uno scelto a caso fra quelli ancora vivi
  if (suit) return [suit];
  const alive = SUITS.filter((s) => opponentCharacters[s].pv > 0);
  if (alive.length === 0) return [];
  return [alive[interoCasuale(rng, alive.length)]];
}

// ------------------------------------------------------------
// Esecuzione dell'effect. ctx = {
//   casterCharacters, opponentCharacters,   // oggetti characters (vedi partita.js)
//   casterHand, opponentHand,               // array di carte (per scarto_forzato/scambio_carte)
//   scarti, tallone,                        // per brucia_carta
//   magicStateCaster,                        // per ricarica_sorpresa
//   suit                                     // seme bersaglio scelto dal giocatore, se applicabile
// }
// Ritorna { ok, applied, note } — "note" spiega se l'effetto richiede un
// aggancio nel motore di partita per avere effetto reale (vedi in fondo).
// ------------------------------------------------------------
export function applyEffect(card, ctx) {
  const { effect, parametro, target, durata_turni } = card;
  const param = parametro !== undefined ? Number(parametro) : undefined;

  switch (effect) {
    case 'danno_diretto': {
      const suits = resolveTargetCharacters(target || 'avversario', ctx.casterCharacters, ctx.opponentCharacters, ctx.suit, caso(ctx));
      const pool = (target === 'se_stesso') ? ctx.casterCharacters : ctx.opponentCharacters;
      for (const s of suits) infliggiDanno(pool[s], param);
      return { ok: true, applied: true, colpiti: suits };
    }
    case 'danno_percentuale': {
      const suits = resolveTargetCharacters(target || 'avversario', ctx.casterCharacters, ctx.opponentCharacters, ctx.suit, caso(ctx));
      const pool = (target === 'se_stesso') ? ctx.casterCharacters : ctx.opponentCharacters;
      for (const s of suits) infliggiDanno(pool[s], pool[s].pvMax * (param / 100));
      return { ok: true, applied: true, colpiti: suits };
    }
    // Danno calcolato sull'ATT di un PROPRIO eroe, non sui PV del bersaglio
    // né sui punti delle carte. È quello che usano le abilità speciali, ma
    // può usarlo anche una Carta Magica: `semeAttaccante` dice da quale
    // eroe parte il colpo, altrimenti si prende quello con la spada più alta.
    case 'danno_da_attacco': {
      const semeAtt = ctx.semeAttaccante ||
        SUITS.reduce((best, s) => (ctx.casterCharacters[s].att > ctx.casterCharacters[best].att ? s : best), SUITS[0]);
      const attaccante = ctx.casterCharacters[semeAtt];
      if (!attaccante) return { ok: true, applied: false, note: 'eroe attaccante non trovato' };
      const suits = resolveTargetCharacters(target || 'avversario', ctx.casterCharacters, ctx.opponentCharacters, ctx.suit, caso(ctx));
      const pool = (target === 'se_stesso') ? ctx.casterCharacters : ctx.opponentCharacters;
      const danno = attaccante.att * (param / 100);
      for (const s of suits) infliggiDanno(pool[s], danno);
      return { ok: true, applied: true, colpiti: suits, danno, semeAttaccante: semeAtt };
    }
    case 'cura_diretta': {
      const suits = resolveTargetCharacters(target || 'se_stesso', ctx.casterCharacters, ctx.opponentCharacters, ctx.suit, caso(ctx));
      const pool = (target === 'avversario') ? ctx.opponentCharacters : ctx.casterCharacters;
      for (const s of suits) pool[s].pv = Math.min(pool[s].pvMax, pool[s].pv + param);
      return { ok: true, applied: true, colpiti: suits };
    }
    case 'scarto_forzato': {
      const hand = (target === 'se_stesso') ? ctx.casterHand : ctx.opponentHand;
      const n = Math.min(param || 1, hand.length);
      const scartate = [];
      for (let i = 0; i < n; i++) {
        const idx = interoCasuale(caso(ctx), hand.length);
        scartate.push(hand.splice(idx, 1)[0]);
      }
      if (ctx.scarti) ctx.scarti.push(...scartate);
      return { ok: true, applied: true, scartate };
    }
    case 'scambio_carte': {
      if (ctx.casterHand.length === 0 || ctx.opponentHand.length === 0) return { ok: true, applied: false, note: 'una delle due mani è vuota' };
      const i = interoCasuale(caso(ctx), ctx.casterHand.length);
      const j = interoCasuale(caso(ctx), ctx.opponentHand.length);
      const tmp = ctx.casterHand[i];
      ctx.casterHand[i] = ctx.opponentHand[j];
      ctx.opponentHand[j] = tmp;
      return { ok: true, applied: true };
    }
    case 'brucia_carta': {
      if (parametro === 'ultima_scartata') {
        if (!ctx.scarti || ctx.scarti.length === 0) return { ok: true, applied: false, note: 'monte scarti vuoto' };
        const bruciata = ctx.scarti.pop();
        return { ok: true, applied: true, bruciata };
      }
      return { ok: true, applied: false, note: `parametro brucia_carta "${parametro}" non gestito` };
    }
    case 'boost_att': {
      const suits = resolveTargetCharacters(target || 'se_stesso', ctx.casterCharacters, ctx.opponentCharacters, ctx.suit, caso(ctx));
      const pool = (target === 'avversario') ? ctx.opponentCharacters : ctx.casterCharacters;
      for (const s of suits) pool[s].att += param;
      return { ok: true, applied: true, colpiti: suits, effettoAttivo: { effect, parametro: param, colpiti: suits, pool: (target === 'avversario') ? 'opponent' : 'caster', turniRimasti: durata_turni } };
    }
    case 'boost_difesa': {
      const suits = resolveTargetCharacters(target || 'se_stesso', ctx.casterCharacters, ctx.opponentCharacters, ctx.suit, caso(ctx));
      const pool = (target === 'avversario') ? ctx.opponentCharacters : ctx.casterCharacters;
      for (const s of suits) pool[s].difesaPercent = (pool[s].difesaPercent || 0) + param;
      return { ok: true, applied: true, colpiti: suits, effettoAttivo: { effect, parametro: param, colpiti: suits, pool: (target === 'avversario') ? 'opponent' : 'caster', turniRimasti: durata_turni } };
    }
    // RECUPERA UNA CARTA GIÀ SPESA.
    // Prima rimetteva a "non usata" il flag della Sorpresa, quando il
    // limite era "una Sorpresa per partita". Quel limite non c'è più:
    // lasciato com'era, questo effetto non avrebbe fatto più niente —
    // e una carta che non fa niente è esattamente il guasto che il
    // vocabolario esiste per impedire. Adesso libera il posto speso più
    // recente, così quella carta torna giocabile in questa partita.
    // Non tocca la collezione: la copia consumata resta consumata,
    // quello che si recupera è l'uso dentro la partita in corso.
    case 'ricarica_sorpresa': {
      const ms = ctx.magicStateCaster;
      if (!ms || !(ms.consumate || []).length) {
        return { ok: true, applied: false, note: 'nessuna Carta Magica da recuperare' };
      }
      const recuperata = ms.consumate.pop();
      const carta = ms.selection && ms.selection[recuperata];
      if (carta) {
        const i = ms.giocate.lastIndexOf(carta.id);
        if (i !== -1) ms.giocate.splice(i, 1);
      }
      return { ok: true, applied: true, recuperata };
    }
    // Effetti che modificano il FLUSSO di gioco: qui vengono "armati" come
    // effetto attivo con la sua durata, ma serve un aggancio nel motore di
    // partita per essere davvero rispettati (vedi note in fondo al file).
    case 'raddoppia_danno':
    case 'riflette_danno':
    case 'annulla_danno':
    case 'restrict_draw_source':
    case 'pesca_ridotta':
    case 'pesca_extra':
    case 'blocca_monte_scarti':
    case 'skip_fase_attacco':
    case 'skip_turno_intero':
    case 'turno_extra': {
      return {
        ok: true, applied: true,
        note: 'effetto armato ma non ancora agganciato al motore di partita — vedi PUNTI DI INTEGRAZIONE',
        effettoAttivo: { effect, parametro, target, turniRimasti: durata_turni || 1 }
      };
    }
    default:
      return { ok: false, reason: `effect "${effect}" non riconosciuto.` };
  }
}

// ------------------------------------------------------------
// SORPRESA — usabile quando si vuole, una volta sola: giocata, quel
// posto è speso (il conto lo tiene `giocaCartaMagica`, che sa l'indice).
//
// NON c'è più il limite "una sola Sorpresa per partita": le carte
// portate in campo sono tre e ognuna vale un utilizzo, quindi il limite
// vero è quante ne hai. E non costano più punti magia: quelli restano
// per le abilità degli eroi.
// ------------------------------------------------------------
export function activateSorpresa(magicState, card, ctx) {
  if (card.tipo !== 'sorpresa') return { ok: false, reason: 'Non è una Carta Sorpresa.' };
  if (magicState.giocateQuestoTurno >= 1) return { ok: false, reason: 'Puoi giocare una sola Carta Magica per turno.' };
  // Una carta può avere più effetti (`effetti: [...]`). Qui si applica il
  // PRIMO; gli altri li applica il motore di partita, che sa anche dove
  // depositare quelli differiti. Con la forma vecchia a un solo `effect`
  // non cambia niente.
  const primo = primoEffetto(card);
  if (!primo) return { ok: false, reason: 'La carta non dichiara nessun effetto.' };
  const result = applyEffect(primo, ctx);
  if (!result.ok) return result;
  magicState.giocate = magicState.giocate || [];
  magicState.giocate.push(card.id);
  magicState.giocateQuestoTurno++;
  if (result.effettoAttivo) {
    magicState.effettiAttivi.push({ ...result.effettoAttivo, cardId: card.id });
  }
  return result;
}

// ------------------------------------------------------------
// TRAPPOLA — si schiera coperta e scade dopo N turni se il trigger non
// si verifica mai (spec §6).
//
// Il vecchio limite "massimo 3 Trappole per partita" non serve più, e
// soprattutto contava male: contava QUANTE trappole erano state armate,
// non QUALI — così la stessa carta si poteva armare tre volte. Adesso
// ogni carta portata in campo vale un solo utilizzo, e il conto lo
// tiene `giocaCartaMagica` sull'indice del posto.
//
// SI CONSUMA QUANDO LA SCHIERI, non quando scatta (regola del
// committente): se scade senza mai partire, è comunque spesa.
// ------------------------------------------------------------
export function armTrappola(magicState, card, expiryTurns = TRAP_EXPIRY_TURNS_DEFAULT) {
  if (card.tipo !== 'trappola') return { ok: false, reason: 'Non è una Carta Trappola.' };
  if (magicState.giocateQuestoTurno >= 1) return { ok: false, reason: 'Puoi giocare una sola Carta Magica per turno.' };
  magicState.giocateQuestoTurno++;
  magicState.trappoleArmate.push({
    cardId: card.id, effect: card.effect, parametro: card.parametro,
    trigger: card.trigger || 'on_activate', target: card.target,
    turniRimasti: expiryTurns
  });
  magicState.giocate = magicState.giocate || [];
  magicState.giocate.push(card.id);
  return { ok: true };
}

// Da chiamare una volta per turno del proprietario della trappola: fa
// scadere le trappole armate che non sono mai scattate.
export function tickTrapExpiry(magicState) {
  const scadute = [];
  magicState.trappoleArmate = magicState.trappoleArmate.filter((t) => {
    t.turniRimasti -= 1;
    if (t.turniRimasti <= 0) { scadute.push(t); return false; }
    return true;
  });
  return scadute;
}

// Da chiamare quando accade un evento di gioco (es. "avversario_pesca",
// "avversario_cala_7piu", "subisco_danno", ...): se una trappola armata
// ascolta quell'evento, scatta e viene consumata.
export function checkTrapTrigger(magicState, eventName, card, ctx) {
  const idx = magicState.trappoleArmate.findIndex((t) => t.trigger === eventName);
  if (idx === -1) return { ok: true, triggered: false };
  const trap = magicState.trappoleArmate[idx];
  magicState.trappoleArmate.splice(idx, 1);
  const result = applyEffect({ effect: trap.effect, parametro: trap.parametro, target: trap.target, durata_turni: 0 }, ctx);
  return { ok: true, triggered: true, trap, result };
}

// Da chiamare a ogni turno: fa scadere i buff/debuff con durata (boost_att,
// boost_difesa, ...) e ne annulla l'effetto quando finiscono.
export function tickActiveEffects(magicState, casterCharacters, opponentCharacters) {
  const scaduti = [];
  magicState.effettiAttivi = magicState.effettiAttivi.filter((e) => {
    e.turniRimasti -= 1;
    if (e.turniRimasti > 0) return true;
    // revert dell'effetto se era una modifica diretta a un personaggio
    if (e.effect === 'boost_att' || e.effect === 'boost_difesa') {
      const pool = e.pool === 'opponent' ? opponentCharacters : casterCharacters;
      for (const s of e.colpiti || []) {
        if (!pool[s]) continue;
        if (e.effect === 'boost_att') pool[s].att -= e.parametro;
        if (e.effect === 'boost_difesa') pool[s].difesaPercent = Math.max(0, (pool[s].difesaPercent || 0) - e.parametro);
      }
    }
    scaduti.push(e);
    return false;
  });
  return scaduti;
}

// ============================================================
// PUNTI DI INTEGRAZIONE CON partita.js (non ancora cablati)
//
// Per rendere reali gli effetti "armati", il motore di partita dovrebbe
// chiamare questo modulo nei punti seguenti:
//
// 1. Inizio turno del giocatore di turno:
//      tickTrapExpiry(magicState-avversario)  // le trappole scadono per turni passati, non i propri
//      tickActiveEffects(magicState, ...)
// 2. Prima di actionDraw / actionTakeDiscardPile:
//      checkTrapTrigger('avversario_pesca', ...) e rispettare eventuali
//      restrict_draw_source / pesca_ridotta / pesca_extra / blocca_monte_scarti
//      attivi su chi sta per pescare
// 3. Dentro actionLayMeld, prima di applicare il danno:
//      se il caster ha un raddoppia_danno attivo → moltiplicare per 2 e
//      consumarlo; se il difensore ha annulla_danno attivo → azzerare il
//      danno e consumarlo; se ha riflette_danno → rimandare la % al caster
// 4. Dopo che il danno è stato applicato:
//      checkTrapTrigger('subisco_danno', ...) sul giocatore colpito
// 5. Dopo actionLayMeld con tier 7 (burraco):
//      checkTrapTrigger('avversario_cala_7piu', ...)
// 6. Prima di eseguire la fase attacco/il turno:
//      rispettare skip_fase_attacco / skip_turno_intero / turno_extra
//      armati su chi sta per giocare
// ============================================================
