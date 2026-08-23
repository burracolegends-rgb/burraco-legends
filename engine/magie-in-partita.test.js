// Verifica che le Carte Magiche FACCIANO DAVVERO QUALCOSA in partita.
// Prima le trappole si armavano e non scattavano mai, e nove effetti su
// venti erano registrati ma non letti da nessuno.
// Uso: node engine/magie-in-partita.test.js

import { makeCard } from './core-rules.js';
import {
  createMatch, actionDraw, actionTakeDiscardPile, actionLayMeld, actionDiscard,
  giocaCartaMagica, haEffetto, imponiEffetto, condizioneSoddisfatta, usaAbilitaSpeciale
} from './partita.js';
import { controllaCartaMagica, controllaCartaPersonaggio } from './vocabolario.js';
import { resetTurnoMagie } from './magic-cards.js';

let failures = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) failures++; };
const T0 = Date.parse('2026-08-04T10:00:00.000Z');
const cuori = (v) => v.map((x) => makeCard('♥', x));
const SEMI = ['♥', '♦', '♣', '♠'];

const TRAPPOLA_SCARTO   = { id: 't_scarto', tipo: 'trappola', effect: 'scarto_forzato', parametro: '1', trigger: 'avversario_pesca', target: 'avversario', durata_turni: 0 };
const TRAPPOLA_RIFLETTE = { id: 't_rifl',  tipo: 'trappola', effect: 'riflette_danno', parametro: '50', trigger: 'subisco_danno', target: 'se_stesso', durata_turni: 0 };
const TRAPPOLA_BLOCCO   = { id: 't_blocco', tipo: 'trappola', effect: 'blocca_monte_scarti', parametro: '', trigger: 'avversario_pesca', target: 'avversario', durata_turni: 0 };
const SORPRESA_SALTA    = { id: 's_salta', tipo: 'sorpresa', effect: 'skip_turno_intero', parametro: '', trigger: 'on_activate', target: 'avversario', durata_turni: 1 };
const SORPRESA_DOPPIO   = { id: 's_dopp',  tipo: 'sorpresa', effect: 'raddoppia_danno', parametro: '', trigger: 'on_activate', target: 'se_stesso', durata_turni: 1 };
const SORPRESA_DANNO    = { id: 's_danno', tipo: 'sorpresa', effect: 'danno_diretto', parametro: '30', trigger: 'on_activate', target: 'avversario', durata_turni: 0 };

function partita(magiche) {
  const s = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, magiche });
  // riserva piena: qui si provano gli EFFETTI, il costo in punti magia ha
  // i suoi controlli dedicati più sotto
  s.players[0].puntiMagia = 15;
  s.players[1].puntiMagia = 15;
  return s;
}

// --- 1. LA TRAPPOLA SCATTA quando l'avversario pesca ---
{
  const state = partita([[SORPRESA_DANNO], [TRAPPOLA_SCARTO, TRAPPOLA_SCARTO, TRAPPOLA_SCARTO]]);
  // il giocatore 1 arma la trappola (gli passo il turno a mano)
  state.currentPlayerIndex = 1;
  const arma = giocaCartaMagica(state, 1, 0, T0 + 1000);
  check('la trappola si arma', arma.ok === true && state.players[1].magic.trappoleArmate.length === 1);

  // ora tocca al giocatore 0, che pesca: la trappola deve scattare
  state.currentPlayerIndex = 0;
  state.players[0].hasDrawnThisTurn = false;
  const manoPrima = state.players[0].hand.length;
  const r = actionDraw(state, 0, T0 + 2000);
  check('pescando, la trappola avversaria SCATTA', r.trappoleScattate && r.trappoleScattate.length === 1);
  check('la trappola scattata è quella giusta', r.trappoleScattate[0].effect === 'scarto_forzato');
  // +1 pescata, -1 scartata a forza: la mano resta com'era
  check('l\'effetto si vede sulla mano (1 pescata, 1 scartata a forza)', state.players[0].hand.length === manoPrima);
  check('la trappola si consuma dopo lo scatto', state.players[1].magic.trappoleArmate.length === 0);
}

// --- 2. La trappola NON scatta su un evento diverso ---
{
  const state = partita([[SORPRESA_DANNO], [TRAPPOLA_RIFLETTE]]);
  state.currentPlayerIndex = 1;
  giocaCartaMagica(state, 1, 0, T0 + 1000);
  state.currentPlayerIndex = 0;
  state.players[0].hasDrawnThisTurn = false;
  const r = actionDraw(state, 0, T0 + 2000);
  check('una trappola che ascolta "subisco_danno" non scatta sulla pescata', (r.trappoleScattate || []).length === 0);
  check('resta armata', state.players[1].magic.trappoleArmate.length === 1);
}

// --- 3. riflette_danno: parte del danno torna indietro ---
{
  const state = partita([[SORPRESA_DANNO], [TRAPPOLA_RIFLETTE]]);
  state.currentPlayerIndex = 1;
  giocaCartaMagica(state, 1, 0, T0 + 1000);

  state.currentPlayerIndex = 0;
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const meld = cuori([3, 4, 5]);           // 15 punti, ATT 100 → 15 danni
  a.hand = [...meld, ...a.hand.slice(0, 8)];
  const pvMieiPrima = a.characters['♥'].pv;
  const r1 = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 2000);
  check('la trappola "subisco_danno" scatta quando incasso una calata', (r1.trappoleScattate || []).length === 1);

  // LO STESSO COLPO, non quello dopo. La trappola scattava a danno gia'
  // applicato: si armava per la calata SUCCESSIVA, e chi la giocava non
  // vedeva succedere niente. Ora scatta prima che il colpo sia calcolato.
  check('il danno rimbalza indietro sullo stesso colpo', !!r1.riflesso && r1.riflesso.damage > 0);
  check('il rimbalzo toglie PV a chi ha attaccato', a.characters['♥'].pv < pvMieiPrima);
  check('il rimbalzo è la metà del danno (50%)', Math.abs(r1.riflesso.damage - r1.dannoCarte / 2) < 1e-6);

  // e si consuma: la calata dopo non rimbalza piu'
  const meld2 = cuori([6, 7, 8]);
  a.hand = [...meld2, ...a.hand];
  const r2 = actionLayMeld(state, 0, meld2.map((c) => c.id), T0 + 3000);
  check('l\'effetto si consuma: la calata dopo non rimbalza', !r2.riflesso);
  check('e non resta appiccicato addosso a nessuno', !haEffetto(state.players[1], 'riflette_danno'));
}

// --- 4. annulla_danno azzera il colpo ---
{
  const state = partita([[SORPRESA_DANNO], [SORPRESA_DANNO]]);
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  imponiEffetto(state.players[1], 'annulla_danno', '', 1);
  const meld = cuori([3, 4, 5]);
  a.hand = [...meld, ...a.hand.slice(0, 8)];
  const r = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('annulla_danno azzera davvero il danno', r.dannoAnnullato === true && r.damage === 0);
  check('nessun avversario perde PV', ['♥', '♦', '♣', '♠'].every((s) => state.players[1].characters[s].pv === 100));
  check('l\'effetto si consuma dopo l\'uso', !haEffetto(state.players[1], 'annulla_danno'));
}

// --- 5. raddoppia_danno moltiplica per due ---
{
  const state = partita([[SORPRESA_DOPPIO], [SORPRESA_DANNO]]);
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  const g = giocaCartaMagica(state, 0, 0, T0 + 1000);
  check('la Sorpresa "raddoppia danno" si gioca', g.ok === true);
  check('l\'effetto è depositato su chi ha giocato la carta', !!haEffetto(a, 'raddoppia_danno'));

  const meld = cuori([3, 4, 5]);           // 15 punti → 15, raddoppiati = 30
  a.hand = [...meld, ...a.hand.slice(0, 8)];
  const r = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 2000);
  check('il danno è raddoppiato', r.dannoRaddoppiato === true && Math.abs(r.dannoCarte - 30) < 1e-6);
}

// --- 6. skip_turno_intero fa saltare il turno all'avversario ---
{
  const state = partita([[SORPRESA_SALTA], [SORPRESA_DANNO]]);
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  giocaCartaMagica(state, 0, 0, T0 + 1000);
  check('l\'effetto "salta turno" è addosso all\'avversario', !!haEffetto(state.players[1], 'skip_turno_intero'));

  actionDiscard(state, 0, a.hand[0].id, T0 + 2000);
  check('il turno rimbalza: tocca ancora a me', state.currentPlayerIndex === 0);
  check('l\'effetto si è consumato', !haEffetto(state.players[1], 'skip_turno_intero'));
}

// --- 7. blocca_monte_scarti impedisce di raccogliere il monte ---
{
  const state = partita([[SORPRESA_DANNO], [SORPRESA_DANNO]]);
  imponiEffetto(state.players[0], 'blocca_monte_scarti', '', 1);
  const r = actionTakeDiscardPile(state, 0, T0 + 1000);
  check('con il monte bloccato non lo si può raccogliere', r.ok === false && /monte scarti/.test(r.reason));
}

// --- 8. pesca_ridotta e pesca_extra cambiano quante carte si pescano ---
{
  const state = partita([[SORPRESA_DANNO], [SORPRESA_DANNO]]);
  // il parametro dice QUANTE CARTE IN MENO rispetto al normale
  imponiEffetto(state.players[0], 'pesca_ridotta', '1', 1);
  const manoPrima = state.players[0].hand.length;
  const r = actionDraw(state, 0, T0 + 1000);
  check('pesca_ridotta di 1: non si pesca affatto', r.drawn === 0 && state.players[0].hand.length === manoPrima);
}
{
  const state = partita([[SORPRESA_DANNO], [SORPRESA_DANNO]]);
  imponiEffetto(state.players[0], 'pesca_extra', '2', 1);
  const r = actionDraw(state, 0, T0 + 1000);
  check('pesca_extra di 2: si pescano 3 carte invece di 1', r.drawn === 3);
}

// --- LO SPECCHIO DI RITORSIONE RIMANDA INDIETRO IL COLPO CHE LO FA SCATTARE ---
// La trappola "riflette_danno" scattava DOPO che il danno era gia' stato
// applicato: si armava un istante troppo tardi e valeva per il colpo
// successivo, cioe' per niente. Chi la giocava la vedeva scattare senza
// che succedesse nulla. Qui si controlla il caso che conta: il colpo che
// fa scattare la trappola e' anche quello che torna indietro dimezzato.
{
  const armaSpecchio = (state, suChi) => {
    state.players[suChi].magic.trappoleArmate.push({
      cardId: 'trappola_002', effect: 'riflette_danno', parametro: '50',
      trigger: 'subisco_danno', target: 'se_stesso', turniRimasti: 99
    });
  };
  const totale = (state, chi) =>
    ['♥', '♦', '♣', '♠'].reduce((t, s) => t + state.players[chi].characters[s].pv, 0);

  // 1) contro un'abilita' speciale
  {
    const state = partita([[SORPRESA_DANNO], [SORPRESA_DANNO]]);
    armaSpecchio(state, 1);
    state.players[0].puntiMagia = 10;
    const mioPrima = totale(state, 0), suoPrima = totale(state, 1);
    const r = usaAbilitaSpeciale(state, 0, '♥', '♦', T0 + 1000);
    const inflitto = suoPrima - totale(state, 1);
    const tornato = mioPrima - totale(state, 0);
    check('specchio: l\'abilita\' fa scattare la trappola', r.ok && (r.trappoleScattate || []).length === 1);
    check('specchio: il danno arriva davvero all\'avversario', inflitto > 0);
    check('specchio: e la meta\' torna indietro sullo STESSO colpo',
      Math.abs(tornato - inflitto / 2) < 0.5);
    check('specchio: chi ha attaccato lo vede nell\'esito', !!r.riflesso && r.riflesso.percentuale === 50);
  }

  // 2) l'effetto e' "una volta sola": il colpo dopo non torna piu' indietro
  {
    const state = partita([[SORPRESA_DANNO], [SORPRESA_DANNO]]);
    armaSpecchio(state, 1);
    state.players[0].puntiMagia = 15;
    usaAbilitaSpeciale(state, 0, '♥', '♦', T0 + 1000);
    const mioPrima = totale(state, 0);
    usaAbilitaSpeciale(state, 0, '♥', '♦', T0 + 2000);
    check('specchio: il secondo colpo non torna indietro (si consuma)',
      Math.abs(totale(state, 0) - mioPrima) < 0.001);
  }
}

// --- 9. skip_fase_attacco impedisce di calare ---
{
  const state = partita([[SORPRESA_DANNO], [SORPRESA_DANNO]]);
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  imponiEffetto(a, 'skip_fase_attacco', '', 1);
  const meld = cuori([3, 4, 5]);
  a.hand = [...meld, ...a.hand.slice(0, 8)];
  const r = actionLayMeld(state, 0, meld.map((c) => c.id), T0 + 1000);
  check('con la fase d\'attacco saltata non si può calare', r.ok === false && /impedisce di calare/.test(r.reason));
}

// --- 10. turno_extra fa rigiocare chi lo ha ---
{
  const state = partita([[SORPRESA_DANNO], [SORPRESA_DANNO]]);
  const a = state.players[0];
  a.hasDrawnThisTurn = true;
  imponiEffetto(a, 'turno_extra', '', 1);
  actionDiscard(state, 0, a.hand[0].id, T0 + 1000);
  check('con il turno extra si rigioca subito', state.currentPlayerIndex === 0);
  check('e si può pescare di nuovo', state.players[0].hasDrawnThisTurn === false);
}

// --- 11. restrict_draw_source: solo l'ultima carta degli scarti ---
{
  const state = partita([[SORPRESA_DANNO], [SORPRESA_DANNO]]);
  state.scarti = [makeCard('♥', 4), makeCard('♦', 9), makeCard('♣', 12)];
  imponiEffetto(state.players[0], 'restrict_draw_source', 'solo_ultima_carta_scarti', 1);
  const manoPrima = state.players[0].hand.length;
  const r = actionTakeDiscardPile(state, 0, T0 + 1000);
  check('si raccoglie solo l\'ultima carta scartata', r.ok === true && r.soloUltima === true);
  check('la mano cresce di una sola carta', state.players[0].hand.length === manoPrima + 1);
  check('le altre restano sul monte', state.scarti.length === 2);
}

// --- 12. LE CARTE MAGICHE NON COSTANO PUNTI MAGIA ---
// Li costavano; adesso il loro prezzo è la carta stessa, che vale un
// solo utilizzo. I punti magia restano alle abilità degli eroi.
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, magiche: [[SORPRESA_DANNO], [SORPRESA_DANNO]] });
  // chi apre la partita ha gia' i punti del suo primo turno: il primo
  // turno e' un turno come gli altri, non uno a vuoto
  check('chi inizia parte con il punto del primo turno', state.players[0].puntiMagia === 1);
  check('l\'altro parte da zero: il suo turno non e\' ancora cominciato', state.players[1].puntiMagia === 0);

  state.players[0].puntiMagia = 0;
  const r = giocaCartaMagica(state, 0, 0, T0 + 1000);
  check('con ZERO punti magia la carta si gioca lo stesso', r.ok === true);
  check('e i punti magia restano a zero: non è quello il prezzo', state.players[0].puntiMagia === 0);
  check('il risultato non parla più di costo', r.costo === undefined);
}

// --- 12bis. UNA CARTA, UN UTILIZZO ---
// La stessa carta non si rigioca: quel posto è speso. Prima questo buco
// c'era davvero — armTrappola contava QUANTE trappole, non QUALI, e la
// stessa carta si poteva armare tre volte di fila.
{
  const TRAPPOLA = { id: 't_una', tipo: 'trappola', trigger: 'avversario_pesca', durata_turni: 0,
                     effect: 'scarto_forzato', parametro: '1', target: 'avversario' };
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, magiche: [[TRAPPOLA, SORPRESA_DANNO], []] });

  const prima = giocaCartaMagica(state, 0, 0, T0 + 1000);
  check('la trappola si schiera', prima.ok === true);
  check('il motore dice quale posto ha speso', prima.consumata === 0);

  // turno nuovo: il limite "una per turno" non c'entra più
  resetTurnoMagie(state.players[0].magic);
  const ancora = giocaCartaMagica(state, 0, 0, T0 + 2000);
  check('la STESSA carta non si può rigiocare', ancora.ok === false && /un solo utilizzo/.test(ancora.reason));
  check('e non è finita due volte sul campo', state.players[0].magic.trappoleArmate.length === 1);

  const altra = giocaCartaMagica(state, 0, 1, T0 + 3000);
  check('ma l\'altra carta portata in campo si gioca', altra.ok === true && altra.consumata === 1);
}

// --- 13. I punti magia crescono di 2 a turno, fino a 15 ---
{
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, magiche: [[SORPRESA_DANNO], [SORPRESA_DANNO]] });
  const a = state.players[0], b = state.players[1];
  const giro = (t) => {
    a.hasDrawnThisTurn = true; actionDiscard(state, 0, a.hand[0].id, T0 + t);
    b.hasDrawnThisTurn = true; actionDiscard(state, 1, b.hand[0].id, T0 + t + 500);
  };
  // chi apre ha UN punto solo al primo turno (gioca un turno in piu'
  // dell'altro): da li' in poi +2 a giro per tutti e due
  check('chi inizia parte con un punto solo', a.puntiMagia === 1);
  giro(1000);
  check('dopo un giro ne ho 3', a.puntiMagia === 3);
  giro(2000);
  check('dopo due giri ne ho 5', a.puntiMagia === 5);
  for (let i = 0; i < 10; i++) giro(3000 + i * 1000);
  check('la riserva non supera i 15 punti', a.puntiMagia === 15);
}

// ============================================================
// LE TRE REGOLE NUOVE DEL CONTRATTO
// ============================================================

// --- 14. UNA CARTA PUÒ FARE PIÙ COSE ---
{
  const DOPPIA = {
    id: 's_doppia', tipo: 'sorpresa', trigger: 'on_activate', costo: 4,
    effetti: [
      { effect: 'danno_diretto', parametro: '20', target: 'avversario', durata_turni: 0 },
      { effect: 'cura_diretta',  parametro: '15', target: 'se_stesso',  durata_turni: 0 },
      { effect: 'pesca_extra',   parametro: '1',  target: 'se_stesso',  durata_turni: 1 }
    ]
  };
  const state = partita([[DOPPIA], [SORPRESA_DANNO]]);
  const io = state.players[0], avv = state.players[1];
  for (const s of ['♥', '♦', '♣', '♠']) io.characters[s].pv = 60;

  const r = giocaCartaMagica(state, 0, 0, T0 + 1000);
  check('una carta con tre effetti si gioca', r.ok === true);
  check('il resoconto elenca tutti gli effetti', r.esiti && r.esiti.length === 3);

  const feriti = ['♥', '♦', '♣', '♠'].filter((s) => avv.characters[s].pv < 100);
  check('1° effetto: l\'avversario ha incassato danno', feriti.length === 1 && avv.characters[feriti[0]].pv === 80);
  const curati = ['♥', '♦', '♣', '♠'].filter((s) => io.characters[s].pv > 60);
  check('2° effetto: un mio personaggio è stato curato', curati.length >= 1);
  check('3° effetto: la pesca extra è in attesa per il mio prossimo turno', !!haEffetto(io, 'pesca_extra'));

  const prima = io.hand.length;
  const d = actionDraw(state, 0, T0 + 2000);
  check('e alla pescata funziona davvero (2 carte invece di 1)', d.drawn === 2 && io.hand.length === prima + 2);
}

// --- 15. LE CONDIZIONI ---
{
  const CONDIZIONATA = {
    id: 's_cond', tipo: 'sorpresa', trigger: 'on_activate',
    effect: 'danno_diretto', parametro: '30', target: 'avversario', durata_turni: 0,
    condizione: { tipo: 'pozzetto_preso', chi: 'io' }
  };
  const state = partita([[CONDIZIONATA], [SORPRESA_DANNO]]);
  const io = state.players[0];

  const no = giocaCartaMagica(state, 0, 0, T0 + 1000);
  check('senza il pozzetto la carta condizionata è rifiutata', no.ok === false);
  check('il messaggio spiega la condizione', /pozzetto/i.test(no.reason));
  // il punto vero: una carta rifiutata NON si consuma. Adesso che il
  // prezzo è la carta stessa, questo conta molto più di prima — un
  // rifiuto che consuma sarebbe una copia persa per niente.
  check('la carta rifiutata NON si consuma', io.magic.consumate.length === 0);

  io.pozzettoTaken = true;
  const si = giocaCartaMagica(state, 0, 0, T0 + 2000);
  check('preso il pozzetto, la stessa carta si gioca', si.ok === true);
  check('e ADESSO si consuma', io.magic.consumate.includes(0));
}
{
  // condizioni numeriche e riferite all'avversario
  const state = partita([[SORPRESA_DANNO], [SORPRESA_DANNO]]);
  const io = state.players[0], avv = state.players[1];
  io.hand = new Array(3).fill(0).map(() => makeCard('♥', 5));

  check('carte_in_mano_al_massimo: vera con 3 carte', condizioneSoddisfatta(state, 0, { tipo: 'carte_in_mano_al_massimo', parametro: 5, chi: 'io' }).ok);
  check('carte_in_mano_almeno: falsa con 3 carte', !condizioneSoddisfatta(state, 0, { tipo: 'carte_in_mano_almeno', parametro: 8, chi: 'io' }).ok);

  avv.characters['♥'].pv = 0; avv.characters['♦'].pv = 0;
  check('eroi_caduti_almeno riferita all\'avversario', condizioneSoddisfatta(state, 0, { tipo: 'eroi_caduti_almeno', parametro: 2, chi: 'avversario' }).ok);
  check('pv_totali_sotto riferita all\'avversario (50% dopo due caduti)', condizioneSoddisfatta(state, 0, { tipo: 'pv_totali_sotto', parametro: 60, chi: 'avversario' }).ok);

  state.tallone = new Array(5).fill(0).map(() => makeCard('♠', 9));
  check('mazzo_sotto guarda il tallone, non i giocatori', condizioneSoddisfatta(state, 0, { tipo: 'mazzo_sotto', parametro: 10 }).ok);
  check('una condizione non soddisfatta spiega il perché', /solo se/.test(condizioneSoddisfatta(state, 0, { tipo: 'pozzetto_preso', chi: 'io' }).motivo));
}

// --- 16. IL BERSAGLIO A SCELTA È SOLO DELLE ABILITÀ ---
{
  const sbagliata = controllaCartaMagica({
    id: 'x', tipo: 'sorpresa', trigger: 'on_activate', costo: 4, durata_turni: 0,
    effect: 'danno_diretto', parametro: '30', target: 'personaggio_specifico'
  });
  check('una Carta Magica non può far scegliere il bersaglio', !sbagliata.ok);
  check('il messaggio dice che è riservato alle abilità', sbagliata.errori.some((e) => /riservato alle abilità/.test(e)));

  const ok = controllaCartaPersonaggio({
    id: 'personaggio_x', seme: '♥', rarita: 3, vita: 100, att: 100,
    abilita: { trigger: 'attivazione_manuale', effect: 'danno_da_attacco', parametro: '30', target: 'personaggio_specifico', costo: 4 }
  });
  check('un\'abilità invece può farlo', ok.ok);
}

// --- 17. LE TRAPPOLE SCATTANO ANCHE SULL'ABILITÀ AVVERSARIA ---
{
  const TRAPPOLA_SU_ABILITA = {
    id: 't_abil', tipo: 'trappola', durata_turni: 0,
    effect: 'scarto_forzato', parametro: '1', trigger: 'avversario_usa_abilita', target: 'avversario'
  };
  const abil = { trigger: 'attivazione_manuale', effect: 'danno_da_attacco', parametro: '30', target: 'personaggio_specifico', costo: 4 };
  const state = createMatch({ chiInizia: 0,
    now: T0, rng: () => 0.5,
    magiche: [[SORPRESA_DANNO], [TRAPPOLA_SU_ABILITA]],
    abilities: [{ '♥': abil }, {}]
  });
  state.players[0].puntiMagia = 15;
  state.players[1].puntiMagia = 15;

  // il giocatore 1 schiera la trappola
  state.currentPlayerIndex = 1;
  const schierata = giocaCartaMagica(state, 1, 0, T0 + 1000);
  check('la trappola si schiera senza spendere punti magia', schierata.ok === true && state.players[1].puntiMagia === 15);
  check('è sul campo, in attesa', state.players[1].magic.trappoleArmate.length === 1);

  // il giocatore 0 usa l'abilità: la trappola deve scattare
  state.currentPlayerIndex = 0;
  const manoPrima = state.players[0].hand.length;
  const r = usaAbilitaSpeciale(state, 0, '♥', '♦', T0 + 2000);
  check('l\'abilità va a segno', r.ok === true);
  check('usare l\'abilità FA SCATTARE la trappola avversaria', (r.trappoleScattate || []).length === 1);
  check('la trappola scattata è quella giusta', r.trappoleScattate[0].effect === 'scarto_forzato');
  check('l\'effetto si vede: ho perso una carta a forza', state.players[0].hand.length === manoPrima - 1);
  check('la trappola si consuma', state.players[1].magic.trappoleArmate.length === 0);
}

// --- 18. UN'ABILITÀ CON DUE EFFETTI INSIEME (Papa Figo: distrugge le
// trappole avversarie E infligge danno, nello stesso "Attacco notturno") ---
// Prima usaAbilitaSpeciale sapeva fare SOLO danno_da_attacco: era scritta
// per quell'unico caso. Con più effetti nella stessa abilità, quelli
// senza bersaglio a scelta (qui distruggi_trappole) devono applicarsi da
// soli, mentre il colpo resta l'unico a chiedere un bersaglio.
{
  const NOTTURNO = {
    trigger: 'attivazione_manuale',
    effetti: [
      { effect: 'distruggi_trappole', target: 'avversario', durata_turni: 0 },
      { effect: 'danno_da_attacco', parametro: '30', target: 'personaggio_specifico', durata_turni: 0 }
    ],
    costo: 5
  };
  // due trappole armate su un trigger che QUI non c'entra niente
  // (avversario_pesca): se sopravvivono, non è merito del trap-scatter
  // sull'uso dell'abilità — è la prova che serve un effetto dedicato.
  const TRAPPOLA = { id: 't_x', tipo: 'trappola', effect: 'scarto_forzato', parametro: '1', trigger: 'avversario_pesca', target: 'avversario', durata_turni: 0 };
  const state = createMatch({
    chiInizia: 0, now: T0, rng: () => 0.5,
    magiche: [[], [TRAPPOLA, { ...TRAPPOLA, id: 't_y' }]],
    abilities: [{ '♦': NOTTURNO }, {}]
  });
  state.players[0].puntiMagia = 15;
  state.players[1].puntiMagia = 15;
  state.players[0].characters['♦'].att = 100;    // 30 danni netti al bersaglio

  // il giocatore 1 schiera le sue due trappole (una per turno: due turni)
  state.currentPlayerIndex = 1;
  giocaCartaMagica(state, 1, 0, T0 + 1000);
  resetTurnoMagie(state.players[1].magic);
  giocaCartaMagica(state, 1, 1, T0 + 2000);
  check('entrambe le trappole sono armate', state.players[1].magic.trappoleArmate.length === 2);

  state.currentPlayerIndex = 0;
  const r = usaAbilitaSpeciale(state, 0, '♦', '♣', T0 + 3000);
  check('l\'abilità multi-effetto va a segno', r.ok === true, r.reason);
  check('LE TRAPPOLE AVVERSARIE SONO DISTRUTTE', state.players[1].magic.trappoleArmate.length === 0);
  check('il resoconto racconta anche questo effetto', r.effettiAbilita && r.effettiAbilita[0].effect === 'distruggi_trappole' && r.effettiAbilita[0].distrutte === 2);
  check('E il colpo parte lo stesso (30% di 100 = 30)', Math.abs(r.damage - 30) < 1e-9);
  check('il bersaglio scelto ha incassato', Math.abs(state.players[1].characters['♣'].pv - 70) < 1e-9);

  // e le otto carte d'esempio (un solo "effect" in cima, forma vecchia)
  // continuano a funzionare esattamente come prima: nessun effettiAbilita
  const VECCHIA = { trigger: 'attivazione_manuale', effect: 'danno_da_attacco', parametro: '30', target: 'personaggio_specifico', costo: 4 };
  const s2 = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, abilities: [{ '♠': VECCHIA }, {}] });
  s2.players[0].puntiMagia = 15;
  s2.players[0].characters['♠'].att = 100;
  const r2 = usaAbilitaSpeciale(s2, 0, '♠', '♥', T0 + 1000);
  check('la forma vecchia (un solo effect) resta identica a prima', r2.ok === true && Math.abs(r2.damage - 30) < 1e-9);
  // il resoconto e' diventato uniforme: ogni abilita' racconta cosa ha
  // fatto, anche quando fa una cosa sola. Prima lo raccontavano solo
  // quelle a piu' effetti, e chi leggeva doveva sapere quale caso era.
  check('e racconta comunque il suo unico effetto',
    Array.isArray(r2.effettiAbilita) && r2.effettiAbilita.length === 1 &&
    r2.effettiAbilita[0].effect === 'danno_da_attacco');
}

// --- 19. LA CONVERSIONE: ruba i bonus, rispedisce i malus ---
// La carta piu' complicata del roster (S05). Aspetta coperta che
// l'avversario metta mano alle difese e ribalta quello che ha fatto.
// E' l'unica trappola che ha bisogno di sapere non solo CHE cosa e'
// successo, ma COME: quanto, e su chi.
{
  const CONVERSIONE = {
    id: 't_conv', tipo: 'trappola', durata_turni: 0,
    effect: 'converti_difesa', trigger: 'avversario_tocca_difesa', target: 'se_stesso'
  };
  // caso A: l'avversario si DA' un bonus di difesa -> glielo rubo
  {
    const SI_DIFENDE = { id: 's_dif', tipo: 'sorpresa', trigger: 'on_activate',
      effect: 'boost_difesa', parametro: '30', target: 'tutti_alleati', durata_turni: 3 };
    const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5,
      magiche: [[SI_DIFENDE], [CONVERSIONE]] });

    // il giocatore 1 arma la Conversione
    state.currentPlayerIndex = 1;
    giocaCartaMagica(state, 1, 0, T0 + 1000);
    check('la Conversione si arma coperta', state.players[1].magic.trappoleArmate.length === 1);

    // il giocatore 0 si da' un bonus di difesa
    state.currentPlayerIndex = 0;
    giocaCartaMagica(state, 0, 0, T0 + 2000);

    check('IL BONUS GLI E STATO RUBATO', state.players[0].characters['♥'].difesaPercent === 0);
    check('ed e passato a chi aveva la Conversione', state.players[1].characters['♥'].difesaPercent === 30);
    check('la trappola si e consumata', state.players[1].magic.trappoleArmate.length === 0);
  }

  // caso B: l'avversario mi mette un MALUS -> glielo rimando indietro
  {
    const MI_INDEBOLISCE = { id: 's_mal', tipo: 'sorpresa', trigger: 'on_activate',
      effect: 'riduci_difesa', parametro: '25', target: 'tutti_avversari', durata_turni: 2 };
    const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5,
      magiche: [[MI_INDEBOLISCE], [CONVERSIONE]] });

    state.currentPlayerIndex = 1;
    giocaCartaMagica(state, 1, 0, T0 + 1000);
    state.currentPlayerIndex = 0;
    giocaCartaMagica(state, 0, 0, T0 + 2000);

    check('IL MALUS E TORNATO AL MITTENTE', state.players[0].characters['♥'].difesaPercent === -25);
    check('e chi doveva subirlo e pulito', state.players[1].characters['♥'].difesaPercent === 0);
  }

  // caso C: senza Conversione armata, il bonus resta dov'e'
  {
    const SI_DIFENDE = { id: 's_dif2', tipo: 'sorpresa', trigger: 'on_activate',
      effect: 'boost_difesa', parametro: '30', target: 'tutti_alleati', durata_turni: 3 };
    const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, magiche: [[SI_DIFENDE], []] });
    giocaCartaMagica(state, 0, 0, T0 + 1000);
    check('senza Conversione il bonus resta a chi se lo e dato',
      state.players[0].characters['♥'].difesaPercent === 30);
  }
}

// --- 20. UN'ABILITA' SI RISOLVE DA SOLA (nessuna carta dice "a scelta") ---
{
  // Tremore del suolo (007): danno a TUTTI i nemici, nessun bersaglio da scegliere
  const TREMORE = { trigger: 'attivazione_manuale', costo: 5,
    effetti: [{ effect: 'danno_da_attacco', parametro: '15', target: 'tutti_avversari' }] };
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, abilities: [{ '♦': TREMORE }, {}] });
  state.players[0].puntiMagia = 15;
  state.players[0].characters['♦'].att = 100;      // 15 danni a testa

  // NIENTE bersaglio passato: e' il punto
  const r = usaAbilitaSpeciale(state, 0, '♦', null, T0 + 1000);
  check('parte senza che nessuno scelga un bersaglio', r.ok === true, r.reason);
  check('e colpisce tutti e quattro i nemici', r.colpi.length === 4);
  check('ognuno ha incassato', SEMI.every((s) => state.players[1].characters[s].pv < 100));
}

// --- 21. "L'AVVERSARIO COLPITO": danno e malus sullo STESSO nemico ---
// Onca-Pintada (013): "fa il 25% di danno e l avversario colpito per 2
// turni ha difesa ridotta del 20%". Il bersaglio lo estrae il motore, e
// il malus deve seguirlo — non finire su un altro nemico a caso.
{
  const MORSO = { trigger: 'attivazione_manuale', costo: 4, effetti: [
    { effect: 'danno_da_attacco', parametro: '25', target: 'avversario' },
    { effect: 'riduci_difesa', parametro: '20', target: 'bersaglio_colpito', durata_turni: 2 }
  ] };
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, abilities: [{ '♣': MORSO }, {}] });
  state.players[0].puntiMagia = 15;
  state.players[0].characters['♣'].att = 100;

  const r = usaAbilitaSpeciale(state, 0, '♣', null, T0 + 1000);
  check('il morso va a segno', r.ok === true && r.colpi.length === 1);

  const colpito = r.colpi[0].suit;
  check('IL MALUS E SULLO STESSO NEMICO CHE HA INCASSATO',
    state.players[1].characters[colpito].difesaPercent === -20);
  const altri = SEMI.filter((s) => s !== colpito);
  check('e nessun altro nemico e stato indebolito',
    altri.every((s) => !state.players[1].characters[s].difesaPercent));
}

// --- 22. L'ORDINE SULLA CARTA E' L'ORDINE IN PARTITA ---
// Papa Figo (001): "distrugge le carte trappola sul campo E infligge il
// 30% del danno spada" — prima si puliva il campo, poi si colpiva.
{
  const NOTTURNO = { trigger: 'attivazione_manuale', costo: 5, effetti: [
    { effect: 'distruggi_trappole', target: 'avversario' },
    { effect: 'danno_da_attacco', parametro: '30', target: 'avversario' }
  ] };
  const TRAPPOLA = { id: 't_z', tipo: 'trappola', effect: 'scarto_forzato', parametro: '1',
                     trigger: 'avversario_pesca', target: 'avversario', durata_turni: 0 };
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5,
    magiche: [[], [TRAPPOLA]], abilities: [{ '♦': NOTTURNO }, {}] });
  state.players[0].puntiMagia = 15;
  state.players[0].characters['♦'].att = 100;

  state.currentPlayerIndex = 1;
  giocaCartaMagica(state, 1, 0, T0 + 1000);
  check('la trappola avversaria e sul campo', state.players[1].magic.trappoleArmate.length === 1);

  state.currentPlayerIndex = 0;
  const r = usaAbilitaSpeciale(state, 0, '♦', null, T0 + 2000);
  check('l attacco notturno parte', r.ok === true, r.reason);
  check('le trappole sono state distrutte', state.players[1].magic.trappoleArmate.length === 0);
  check('E il colpo e comunque arrivato', r.damage > 0 && r.colpi.length === 1);
}

// ============================================================
// LE DURATE SCADONO DAVVERO
//
// Tre buchi trovati insieme, tutti dello stesso tipo: un effetto veniva
// APPLICATO ma nessuno se lo riprendeva indietro, o non veniva applicato
// affatto. Nessun test li copriva perché finora nessuna carta usava le
// durate: col roster vero (Tonho +25% difesa per 3 turni, Mula +100%
// attacco per 2) sarebbero diventati subito visibili come "il buff non
// se ne va più".
// ============================================================

// Passa il turno per davvero, come farebbe un giocatore: pesca e scarta.
// Serve perché le durate invecchiano dentro nextTurn, che non è esportata
// — e provarla scavalcandola vorrebbe dire non provare il gioco vero.
function passaIlTurno(state, chi, t) {
  if (!state.players[chi].hasDrawnThisTurn) actionDraw(state, chi, t);
  const carta = state.players[chi].hand[0];
  return actionDiscard(state, chi, carta.id, t + 100);
}

// --- 15. un buff a tempo di un'ABILITÀ scade (Mula Sem Cabeça) ---
{
  const RABBIA = { trigger: 'attivazione_manuale', costo: 4, effetti: [
    { effect: 'boost_att_percentuale', parametro: '100', target: 'se_stesso', durata_turni: 2 }
  ] };
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, abilities: [{ '♦': RABBIA }, {}] });
  state.players[0].puntiMagia = 15;
  state.players[0].characters['♦'].att = 100;

  const r = usaAbilitaSpeciale(state, 0, '♦', null, T0 + 1000);
  check('la Rabbia parte', r.ok === true, r.reason);
  check('l\'attacco raddoppia subito (100 → 200)', state.players[0].characters['♦'].att === 200);

  let t = T0 + 2000;
  passaIlTurno(state, 0, t); t += 1000;
  passaIlTurno(state, 1, t); t += 1000;      // torna a me: primo invecchiamento
  check('dopo un giro il buff regge ancora', state.players[0].characters['♦'].att === 200);

  passaIlTurno(state, 0, t); t += 1000;
  passaIlTurno(state, 1, t); t += 1000;      // torna a me: secondo invecchiamento
  check('dopo due giri l\'attacco torna com\'era (100)',
    Math.abs(state.players[0].characters['♦'].att - 100) < 1e-9);
}

// --- 16. un effetto DI FLUSSO chiesto da un'abilità viene depositato ---
// (Cão-do-Mato, "Ricerca del bersaglio": +25% al danno di calate e abilità)
// Prima passava da applyEffect, che per gli effetti di flusso non ha un
// caso: rispondeva "effetto non riconosciuto" e l'abilità spendeva i
// punti magia senza fare niente.
{
  const RICERCA = { trigger: 'attivazione_manuale', costo: 4, effetti: [
    { effect: 'boost_danno', parametro: '25', target: 'se_stesso', durata_turni: 2 }
  ] };
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, abilities: [{ '♠': RICERCA }, {}] });
  state.players[0].puntiMagia = 15;

  const r = usaAbilitaSpeciale(state, 0, '♠', null, T0 + 1000);
  check('la Ricerca del bersaglio parte', r.ok === true, r.reason);
  check('il bonus al danno è depositato sul giocatore', !!haEffetto(state.players[0], 'boost_danno'));
  check('e l\'abilità dichiara di averlo differito',
    r.effettiAbilita.some((e) => e.effect === 'boost_danno' && e.differito === true));
}

// --- 17. un malus a tempo messo SULL'AVVERSARIO scade (Onça-Pintada) ---
{
  const MORSO = { trigger: 'attivazione_manuale', costo: 4, effetti: [
    { effect: 'danno_da_attacco', parametro: '25', target: 'avversario' },
    { effect: 'riduci_difesa', parametro: '20', target: 'bersaglio_colpito', durata_turni: 2 }
  ] };
  const state = createMatch({ chiInizia: 0, now: T0, rng: () => 0.5, abilities: [{ '♣': MORSO }, {}] });
  state.players[0].puntiMagia = 15;
  state.players[0].characters['♣'].att = 100;

  const r = usaAbilitaSpeciale(state, 0, '♣', null, T0 + 1000);
  check('il Morso feroce parte', r.ok === true, r.reason);
  const colpito = r.colpi[0] && r.colpi[0].suit;
  check('ha colpito qualcuno', !!colpito);
  check('e proprio a QUELLO ha abbassato la difesa',
    state.players[1].characters[colpito].difesaPercent === -20);

  let t = T0 + 2000;
  passaIlTurno(state, 0, t); t += 1000;
  passaIlTurno(state, 1, t); t += 1000;
  passaIlTurno(state, 0, t); t += 1000;
  passaIlTurno(state, 1, t); t += 1000;
  check('dopo due giri la difesa del colpito torna a posto',
    (state.players[1].characters[colpito].difesaPercent || 0) === 0);
}

console.log('\n' + (failures === 0 ? 'Tutti i controlli passati.' : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
