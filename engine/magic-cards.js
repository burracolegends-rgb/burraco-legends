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

// Il tetto vero dei punti magia lo decide il motore di partita e arriva
// nel contesto; questo serve solo quando un effetto viene provato da
// solo, fuori da una partita.
export const PUNTI_MAGIA_MAX_PREDEFINITO = 15;

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

const TARGETS = ['avversario', 'tutti_avversari', 'se_stesso', 'alleato_casuale', 'tutti_alleati', 'personaggio_specifico'];
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

// ------------------------------------------------------------
// CHI COLPISCE UN EFFETTO
//
// Un bersaglio dice DUE cose: da che parte del tavolo si guarda (i miei
// o i suoi) e quanti se ne prendono. Prima erano due decisioni separate:
// questa funzione diceva QUANTI, e ogni singolo effetto ricavava per
// conto proprio DA CHE PARTE — con due regole diverse a seconda che
// l'effetto facesse male o bene.
//
// Il risultato: "tutti" voleva dire "tutti i nemici" su un danno e
// "tutti i miei" su una cura. Comodo per caso, ma impossibile da
// scrivere su una carta senza sapere a memoria quale effetto segue
// quale regola — e soprattutto rendeva certe carte INESPRIMIBILI:
// "riduci la difesa di TUTTI gli avversari" non si poteva dire in alcun
// modo, perché "tutti" su un effetto difensivo virava sui propri.
//
// Adesso il bersaglio dice tutto da solo, in un posto solo. La parola
// ambigua "tutti" è sparita: al suo posto ci sono "tutti_alleati" e
// "tutti_avversari", che non si possono fraintendere.
//
// I MORTI NON SI CONTANO, MAI. Né per essere colpiti (il danno andrebbe
// sprecato) né per essere curati — curare un personaggio a zero PV lo
// riporterebbe in vita, e la resurrezione non è una regola di questo
// gioco: non deve entrarci di soppiatto da una cura ad area.
// ------------------------------------------------------------
const BERSAGLI_RISOLTI = {
  se_stesso:             { lato: 'mio', quanti: 'suo_o_tutti' },
  alleato_casuale:       { lato: 'mio', quanti: 'casuale' },
  tutti_alleati:         { lato: 'mio', quanti: 'tutti' },
  avversario:            { lato: 'suo', quanti: 'casuale' },
  tutti_avversari:       { lato: 'suo', quanti: 'tutti' },
  personaggio_specifico: { lato: 'suo', quanti: 'scelto' }
};

function risolviBersaglio(target, ctx, predefinito, rng) {
  const nome = target || predefinito;
  const def = BERSAGLI_RISOLTI[nome];
  // un bersaglio sconosciuto non colpisce niente: il controllo delle
  // carte lo boccia prima, questo è solo per non far danni se passa
  if (!def) return { pool: ctx.opponentCharacters, lato: 'opponent', suits: [] };

  const pool = def.lato === 'mio' ? ctx.casterCharacters : ctx.opponentCharacters;
  // `lato` viaggia con l'effetto che dura nel tempo: quando scadrà, chi
  // lo toglie deve sapere su quale dei due schieramenti era stato messo
  // (vedi tickActiveEffects). Sono le stesse due parole che quello legge.
  const lato = def.lato === 'mio' ? 'caster' : 'opponent';
  const vivi = () => SUITS.filter((s) => pool[s] && pool[s].pv > 0);

  if (def.quanti === 'scelto') return { pool, lato, suits: ctx.suit ? [ctx.suit] : [] };
  if (def.quanti === 'tutti') return { pool, lato, suits: vivi() };
  if (def.quanti === 'suo_o_tutti') {
    // con un seme indicato è QUEL personaggio (l'eroe che sta agendo);
    // senza, sono tutti i propri ancora in piedi
    return { pool, lato, suits: ctx.suit ? [ctx.suit] : vivi() };
  }
  // 'casuale': quello indicato se c'è, altrimenti uno a caso fra i vivi
  if (ctx.suit) return { pool, lato, suits: [ctx.suit] };
  const in_piedi = vivi();
  if (in_piedi.length === 0) return { pool, lato, suits: [] };
  return { pool, lato, suits: [in_piedi[interoCasuale(rng, in_piedi.length)]] };
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
      const { pool, suits } = risolviBersaglio(target, ctx, 'avversario', caso(ctx));
      for (const s of suits) infliggiDanno(pool[s], param);
      return { ok: true, applied: suits.length > 0, colpiti: suits };
    }
    case 'danno_percentuale': {
      const { pool, suits } = risolviBersaglio(target, ctx, 'avversario', caso(ctx));
      for (const s of suits) infliggiDanno(pool[s], pool[s].pvMax * (param / 100));
      return { ok: true, applied: suits.length > 0, colpiti: suits };
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
      const { pool, suits } = risolviBersaglio(target, ctx, 'avversario', caso(ctx));
      const danno = attaccante.att * (param / 100);
      for (const s of suits) infliggiDanno(pool[s], danno);
      return { ok: true, applied: suits.length > 0, colpiti: suits, danno, semeAttaccante: semeAtt };
    }
    case 'cura_diretta': {
      const { pool, suits } = risolviBersaglio(target, ctx, 'se_stesso', caso(ctx));
      for (const s of suits) pool[s].pv = Math.min(pool[s].pvMax, pool[s].pv + param);
      return { ok: true, applied: suits.length > 0, colpiti: suits };
    }
    case 'scarto_forzato': {
      const mia = BERSAGLI_RISOLTI[target || 'avversario'] && BERSAGLI_RISOLTI[target || 'avversario'].lato === 'mio';
      const hand = mia ? ctx.casterHand : ctx.opponentHand;
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
      const { pool, suits, lato } = risolviBersaglio(target, ctx, 'se_stesso', caso(ctx));
      for (const s of suits) pool[s].att += param;
      return { ok: true, applied: suits.length > 0, colpiti: suits, effettoAttivo: { effect, parametro: param, colpiti: suits, pool: lato, turniRimasti: durata_turni } };
    }
    case 'boost_difesa': {
      const { pool, suits, lato } = risolviBersaglio(target, ctx, 'se_stesso', caso(ctx));
      for (const s of suits) pool[s].difesaPercent = (pool[s].difesaPercent || 0) + param;
      return { ok: true, applied: suits.length > 0, colpiti: suits, effettoAttivo: { effect, parametro: param, colpiti: suits, pool: lato, turniRimasti: durata_turni } };
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
    // I PUNTI MAGIA DELL'AVVERSARIO.
    // Sette carte del roster tolgono punti magia: e' un modo di colpire
    // che non passa dai PV — si spegne la benzina delle abilita' invece
    // di togliere vita. Serve il GIOCATORE, non i suoi personaggi: i
    // punti magia sono una riserva unica, non stanno su una carta.
    // Se il contesto non porta i giocatori (un punto vecchio che ancora
    // non li passa) l'effetto non esplode, dice solo che non ha agito.
    case 'riduci_punti_magia': {
      const chi = (target === 'se_stesso' || target === 'alleato_casuale' || target === 'tutti_alleati')
        ? ctx.casterPlayer : ctx.opponentPlayer;
      if (!chi) return { ok: true, applied: false, note: 'giocatore non disponibile nel contesto' };
      const prima = chi.puntiMagia || 0;
      chi.puntiMagia = Math.max(0, prima - param);     // mai sotto zero
      return { ok: true, applied: prima > 0, tolti: prima - chi.puntiMagia, puntiRimasti: chi.puntiMagia };
    }
    case 'aumenta_punti_magia': {
      const chi = (target === 'avversario' || target === 'tutti_avversari' || target === 'personaggio_specifico')
        ? ctx.opponentPlayer : ctx.casterPlayer;
      if (!chi) return { ok: true, applied: false, note: 'giocatore non disponibile nel contesto' };
      const tetto = ctx.puntiMagiaMax || PUNTI_MAGIA_MAX_PREDEFINITO;
      const prima = chi.puntiMagia || 0;
      chi.puntiMagia = Math.min(tetto, prima + param); // il tetto resta quello del gioco
      return { ok: true, applied: chi.puntiMagia > prima, dati: chi.puntiMagia - prima, puntiRimasti: chi.puntiMagia };
    }
    // CURA IN PERCENTUALE dei PV massimi. Le carte vere parlano quasi
    // sempre cosi' ("cura tutti gli alleati del 20%"), e una cura fissa
    // non sa adattarsi a personaggi con VITA molto diversa fra loro.
    case 'cura_percentuale': {
      const { pool, suits } = risolviBersaglio(target, ctx, 'se_stesso', caso(ctx));
      for (const s of suits) pool[s].pv = Math.min(pool[s].pvMax, pool[s].pv + pool[s].pvMax * (param / 100));
      return { ok: true, applied: suits.length > 0, colpiti: suits };
    }
    // AUMENTO DELL'ATT IN PERCENTUALE.
    // Va tenuto separato da boost_att (che somma un numero fisso) per un
    // motivo preciso: quando scade bisogna togliere ESATTAMENTE quanto si
    // era aggiunto. Il 30% di un eroe da 180 non e' il 30% di uno da 80,
    // quindi il valore va calcolato adesso e ricordato — se lo si
    // ricalcolasse alla scadenza, su un ATT nel frattempo cambiato, la
    // sottrazione sarebbe sbagliata e l'eroe resterebbe piu' forte (o piu'
    // debole) per sempre.
    case 'boost_att_percentuale': {
      const { pool, suits, lato } = risolviBersaglio(target, ctx, 'se_stesso', caso(ctx));
      const aggiunti = {};
      for (const s of suits) {
        const quanto = pool[s].att * (param / 100);
        aggiunti[s] = quanto;
        pool[s].att += quanto;
      }
      return { ok: true, applied: suits.length > 0, colpiti: suits, aggiunti,
               effettoAttivo: { effect, parametro: param, colpiti: suits, pool: lato, aggiunti, turniRimasti: durata_turni } };
    }
    // ABBASSA LA DIFESA: si incassa piu' danno finche' dura.
    // Non e' boost_difesa con un numero negativo: un parametro negativo su
    // una carta e' una trappola per chi le scrive (e per chi le legge in
    // gioco). La parola dice quello che fa.
    case 'riduci_difesa': {
      const { pool, suits, lato } = risolviBersaglio(target, ctx, 'avversario', caso(ctx));
      for (const s of suits) pool[s].difesaPercent = (pool[s].difesaPercent || 0) - param;
      return { ok: true, applied: suits.length > 0, colpiti: suits,
               effettoAttivo: { effect, parametro: param, colpiti: suits, pool: lato, turniRimasti: durata_turni } };
    }
    // TOGLIE I MALUS DI DIFESA (il "cura tutti i disturbi della difesa"
    // di Iara). Solo i malus: un bonus in corso non si perde per essersi
    // curati. Il conto degli effetti a scadenza resta coerente perche'
    // qui si azzera solo la parte negativa gia' applicata.
    case 'pulisci_malus_difesa': {
      const { pool, suits } = risolviBersaglio(target, ctx, 'tutti_alleati', caso(ctx));
      let puliti = 0;
      for (const s of suits) {
        if ((pool[s].difesaPercent || 0) < 0) { pool[s].difesaPercent = 0; puliti++; }
      }
      return { ok: true, applied: puliti > 0, colpiti: suits, puliti };
    }
    // UNA CICATRICE, NON UN MALUS A TEMPO.
    // Il morso del Boitata' rende piu' cara per sempre l'abilita' del
    // personaggio colpito. Il tetto ("fino a un massimo di 7 pm") non si
    // applica qui ma dove il costo viene letto: qui si accumula soltanto
    // il sovrapprezzo, cosi' due morsi non si perdono per strada anche
    // se il tetto e' gia' stato raggiunto.
    case 'costo_abilita_extra': {
      const { pool, suits } = risolviBersaglio(target, ctx, 'avversario', caso(ctx));
      for (const s of suits) pool[s].costoExtra = (pool[s].costoExtra || 0) + param;
      return { ok: true, applied: suits.length > 0, colpiti: suits };
    }
    // LA CONVERSIONE: ribalta l'ultimo intervento sulle difese.
    // Arriva sempre da una trappola, quindi qui "caster" e' chi ha
    // armato la carta e "opponent" e' chi ha appena toccato le difese.
    // Due casi, e sono simmetrici:
    //   - si e' dato un BONUS  -> glielo tolgo e me lo prendo
    //   - mi ha messo un MALUS -> me lo tolgo e glielo rimando
    // In tutti e due i casi il totale sul tavolo non cambia: si sposta
    // di lato. Non e' una copia — moltiplicare gli effetti sarebbe un
    // altro gioco.
    case 'converti_difesa': {
      const ev = ctx.dettagliEvento;
      if (!ev || !ev.colpiti || !ev.colpiti.length) {
        return { ok: true, applied: false, note: 'nessun intervento sulle difese da convertire' };
      }
      const quanto = Number(ev.parametro) || 0;
      if (!quanto) return { ok: true, applied: false, note: 'intervento di valore nullo' };

      const miei = ctx.casterCharacters, suoi = ctx.opponentCharacters;
      // il segno con cui l'effetto era stato applicato: un bonus alza la
      // difesa, un malus la abbassa
      const segno = ev.effect === 'riduci_difesa' ? -1 : 1;

      for (const s of ev.colpiti) {
        if (ev.suProprietario) {
          // era addosso a ME (tipicamente un malus): me lo tolgo e va a lui
          if (miei[s]) miei[s].difesaPercent = (miei[s].difesaPercent || 0) - segno * quanto;
          if (suoi[s]) suoi[s].difesaPercent = (suoi[s].difesaPercent || 0) + segno * quanto;
        } else {
          // era addosso a LUI (tipicamente un bonus che si era dato): glielo rubo
          if (suoi[s]) suoi[s].difesaPercent = (suoi[s].difesaPercent || 0) - segno * quanto;
          if (miei[s]) miei[s].difesaPercent = (miei[s].difesaPercent || 0) + segno * quanto;
        }
      }
      return { ok: true, applied: true, convertiti: ev.colpiti, quanto, era: ev.effect };
    }
    // DISTRUGGE LE TRAPPOLE AVVERSARIE.
    // Sempre l'avversario: ctx.magicStateOpponent (non magicStateCaster).
    // Se non arriva — un punto vecchio che ancora non passa questo campo
    // nel contesto — l'effetto non esplode, dice solo che non ha trovato
    // niente da distruggere: meglio un "applied:false" onesto che un
    // errore a runtime in mezzo a un colpo.
    case 'distruggi_trappole': {
      const ms = ctx.magicStateOpponent;
      const quante = ms ? ms.trappoleArmate.length : 0;
      if (ms && quante > 0) ms.trappoleArmate = [];
      return { ok: true, applied: quante > 0, distrutte: quante };
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
    const DA_ANNULLARE = ['boost_att', 'boost_difesa', 'boost_att_percentuale', 'riduci_difesa'];
    if (DA_ANNULLARE.includes(e.effect)) {
      const pool = e.pool === 'opponent' ? opponentCharacters : casterCharacters;
      for (const s of e.colpiti || []) {
        if (!pool[s]) continue;
        if (e.effect === 'boost_att') pool[s].att -= e.parametro;
        // di un aumento percentuale si toglie QUANTO era stato aggiunto
        // allora, non il ricalcolo di adesso: nel frattempo l'ATT può
        // essere cambiata, e ricalcolare lascerebbe l'eroe più forte o
        // più debole per sempre.
        if (e.effect === 'boost_att_percentuale') pool[s].att -= (e.aggiunti && e.aggiunti[s]) || 0;
        // Niente Math.max(0, ...) qui: la difesa può stare sotto zero
        // (vedi riduzioneDifesa in core-rules.js), e schiacciarla a zero
        // toglierebbe di mezzo un malus ancora in corso messo da
        // qualcun altro.
        if (e.effect === 'boost_difesa') pool[s].difesaPercent = (pool[s].difesaPercent || 0) - e.parametro;
        if (e.effect === 'riduci_difesa') pool[s].difesaPercent = (pool[s].difesaPercent || 0) + e.parametro;
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
