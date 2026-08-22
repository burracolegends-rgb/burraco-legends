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

let failures = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) failures++; };
const T0 = Date.parse('2026-08-04T10:00:00.000Z');
const cuori = (v) => v.map((x) => makeCard('♥', x));

const TRAPPOLA_SCARTO   = { id: 't_scarto', tipo: 'trappola', effect: 'scarto_forzato', parametro: '1', trigger: 'avversario_pesca', target: 'avversario', durata_turni: 0 };
const TRAPPOLA_RIFLETTE = { id: 't_rifl',  tipo: 'trappola', effect: 'riflette_danno', parametro: '50', trigger: 'subisco_danno', target: 'se_stesso', durata_turni: 0 };
const TRAPPOLA_BLOCCO   = { id: 't_blocco', tipo: 'trappola', effect: 'blocca_monte_scarti', parametro: '', trigger: 'avversario_pesca', target: 'avversario', durata_turni: 0 };
const SORPRESA_SALTA    = { id: 's_salta', tipo: 'sorpresa', effect: 'skip_turno_intero', parametro: '', trigger: 'on_activate', target: 'avversario', durata_turni: 1 };
const SORPRESA_DOPPIO   = { id: 's_dopp',  tipo: 'sorpresa', effect: 'raddoppia_danno', parametro: '', trigger: 'on_activate', target: 'se_stesso', durata_turni: 1 };
const SORPRESA_DANNO    = { id: 's_danno', tipo: 'sorpresa', effect: 'danno_diretto', parametro: '30', trigger: 'on_activate', target: 'avversario', durata_turni: 0 };

function partita(magiche) {
  const s = createMatch({ now: T0, rng: () => 0.5, magiche });
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

// --- 12. PUNTI MAGIA: le carte si pagano ---
{
  const state = createMatch({ now: T0, rng: () => 0.5, magiche: [[SORPRESA_DANNO], [SORPRESA_DANNO]] });
  // chi apre la partita ha gia' i punti del suo primo turno: il primo
  // turno e' un turno come gli altri, non uno a vuoto
  check('chi inizia parte con i punti del primo turno', state.players[0].puntiMagia === 2);
  check('l\'altro parte da zero: il suo turno non e\' ancora cominciato', state.players[1].puntiMagia === 0);

  const senzaPunti = giocaCartaMagica(state, 0, 0, T0 + 1000);
  check('con soli 2 punti la carta da 4 non si può giocare', senzaPunti.ok === false && /Punti magia insufficienti/.test(senzaPunti.reason));

  state.players[0].puntiMagia = 4;
  const r = giocaCartaMagica(state, 0, 0, T0 + 2000);
  check('con 4 punti la carta si gioca', r.ok === true);
  check('la carta costa 4 punti', r.costo === 4);
  check('i punti vengono scalati', state.players[0].puntiMagia === 0 && r.puntiRimasti === 0);
}

// --- 13. I punti magia crescono di 2 a turno, fino a 15 ---
{
  const state = createMatch({ now: T0, rng: () => 0.5, magiche: [[SORPRESA_DANNO], [SORPRESA_DANNO]] });
  const a = state.players[0], b = state.players[1];
  const giro = (t) => {
    a.hasDrawnThisTurn = true; actionDiscard(state, 0, a.hand[0].id, T0 + t);
    b.hasDrawnThisTurn = true; actionDiscard(state, 1, b.hand[0].id, T0 + t + 500);
  };
  // chi apre ha gia' i 2 punti del primo turno: da li' in poi +2 a giro
  check('chi inizia parte con 2 punti', a.puntiMagia === 2);
  giro(1000);
  check('dopo un giro ne ho 4', a.puntiMagia === 4);
  giro(2000);
  check('dopo due giri ne ho 6', a.puntiMagia === 6);
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
    id: 's_cond', tipo: 'sorpresa', trigger: 'on_activate', costo: 4,
    effect: 'danno_diretto', parametro: '30', target: 'avversario', durata_turni: 0,
    condizione: { tipo: 'pozzetto_preso', chi: 'io' }
  };
  const state = partita([[CONDIZIONATA], [SORPRESA_DANNO]]);
  const io = state.players[0];
  const puntiPrima = io.puntiMagia;

  const no = giocaCartaMagica(state, 0, 0, T0 + 1000);
  check('senza il pozzetto la carta condizionata è rifiutata', no.ok === false);
  check('il messaggio spiega la condizione', /pozzetto/i.test(no.reason));
  check('i punti magia NON si perdono se la condizione non è vera', io.puntiMagia === puntiPrima);

  io.pozzettoTaken = true;
  const si = giocaCartaMagica(state, 0, 0, T0 + 2000);
  check('preso il pozzetto, la stessa carta si gioca', si.ok === true);
  check('ora i punti si spendono', io.puntiMagia === puntiPrima - 4);
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
    id: 't_abil', tipo: 'trappola', costo: 4, durata_turni: 0,
    effect: 'scarto_forzato', parametro: '1', trigger: 'avversario_usa_abilita', target: 'avversario'
  };
  const abil = { trigger: 'attivazione_manuale', effect: 'danno_da_attacco', parametro: '30', target: 'personaggio_specifico', costo: 4 };
  const state = createMatch({
    now: T0, rng: () => 0.5,
    magiche: [[SORPRESA_DANNO], [TRAPPOLA_SU_ABILITA]],
    abilities: [{ '♥': abil }, {}]
  });
  state.players[0].puntiMagia = 15;
  state.players[1].puntiMagia = 15;

  // il giocatore 1 schiera la trappola
  state.currentPlayerIndex = 1;
  const schierata = giocaCartaMagica(state, 1, 0, T0 + 1000);
  check('la trappola si schiera e si paga subito', schierata.ok === true && state.players[1].puntiMagia === 11);
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

console.log('\n' + (failures === 0 ? 'Tutti i controlli passati.' : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
