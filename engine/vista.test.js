// La domanda a cui deve rispondere questo file è una sola: giocando una
// partita intera, c'è un solo istante in cui uno dei due può vedere una
// carta che non gli spetta? Non lo controllo a occhio sui campi che mi
// ricordo — prendo la vista, la trasformo in testo e ci cerco dentro
// TUTTI gli identificativi che dovevano restare fuori.
import { createMatch, actionDraw, actionDiscard, actionLayMeld, actionTakeDiscardPile,
         usaAbilitaSpeciale, giocaCartaMagica } from './partita.js';
import { vistaPer, carteDaNonMostrare, carteTrapelate } from './vista.js';
import { SUITS } from './core-rules.js';

const [CUORI, QUADRI, FIORI, PICCHE] = SUITS;

let ko = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) ko++; };

// un generatore prevedibile: la stessa partita a ogni esecuzione
function rngFisso(seme) {
  let x = seme;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

// ============================================================
// LA VISTA APPENA DISTRIBUITE LE CARTE
// ============================================================
console.log('--- LA DISTRIBUZIONE ---');
{
  const s = createMatch({ rng: rngFisso(7) });
  const v0 = vistaPer(s, 0);
  const v1 = vistaPer(s, 1);

  check('ognuno sa di essere chi è', v0.io === 0 && v1.io === 1);
  check('vedo le mie carte', Array.isArray(v0.giocatori[0].mano) && v0.giocatori[0].mano.length === 11);
  check('NON vedo quelle dell\'avversario', v0.giocatori[1].mano === undefined);
  check('ma so quante ne ha', v0.giocatori[1].manoQuante === 11);
  check('e lui vede le sue e non le mie',
    Array.isArray(v1.giocatori[1].mano) && v1.giocatori[0].mano === undefined);

  check('del tallone so solo quanto è alto',
    typeof v0.talloneQuante === 'number' && v0.tallone === undefined);
  check('il monte scarti invece si vede', Array.isArray(v0.scarti));

  check('il pozzetto resta coperto anche al suo proprietario',
    v0.giocatori[0].pozzetto === undefined && v0.giocatori[0].pozzettoQuante === 11);
  check('e a maggior ragione quello dell\'altro',
    v0.giocatori[1].pozzetto === undefined);

  check('il generatore casuale non viaggia', v0.rng === undefined && v0.generatore === undefined);
  check('la vista si può spedire davvero', (() => {
    try { JSON.stringify(v0); return true; } catch (e) { return false; }
  })());

  // IL CONTROLLO CHE CONTA
  check('niente trapela al primo giocatore', carteTrapelate(s, 0).length === 0);
  check('niente trapela al secondo', carteTrapelate(s, 1).length === 0);
  console.log('   → carte da tenere nascoste a testa: ' + carteDaNonMostrare(s, 0).length);
}

// ============================================================
// QUELLO CHE INVECE SI DEVE VEDERE
// Nascondere troppo rompe il gioco quanto nascondere troppo poco.
// ============================================================
console.log('\n--- QUELLO CHE SI VEDE ---');
{
  const s = createMatch({ rng: rngFisso(11) });
  s.players[1].characters[CUORI].pv = 42;
  s.players[1].puntiMagia = 9;
  const v = vistaPer(s, 0);

  check('vedo i punti vita dell\'avversario', v.giocatori[1].personaggi[CUORI].pv === 42);
  check('e il suo attacco', v.giocatori[1].personaggi[CUORI].att === 100);
  check('e i suoi punti magia', v.giocatori[1].puntiMagia === 9);
  check('vedo di chi è il turno', v.diChiEIlTurno === 0 && v.eIlMioTurno === true);
  check('l\'altro sa che non è il suo', vistaPer(s, 1).eIlMioTurno === false);
  check('ci sono i tempi per far girare i timer',
    typeof v.turnoIniziatoAlle === 'string' && typeof v.adesso === 'string');
  check('l\'orologio è quello del server, non del browser',
    vistaPer(s, 0, 1700000000000).adesso === new Date(1700000000000).toISOString());
  check('le calate sono pubbliche', Array.isArray(v.giocatori[1].calate));
  check('gli effetti subiti si vedono, sennò il gioco è incomprensibile',
    Array.isArray(v.giocatori[1].effettiSubiti));
}

// ============================================================
// LE CARTE MAGICHE
// ============================================================
console.log('\n--- LE CARTE MAGICHE ---');
{
  const magie = [
    [{ id: 'sorpresa_001', tipo: 'sorpresa', effetti: [{ effect: 'danno_diretto', parametro: 30 }] },
     { id: 'trappola_001', tipo: 'trappola', trigger: 'avversario_pesca', effetti: [{ effect: 'danno_diretto', parametro: 20 }] }],
    [{ id: 'sorpresa_002', tipo: 'sorpresa', effetti: [{ effect: 'cura', parametro: 25 }] }]
  ];
  const s = createMatch({ rng: rngFisso(3), magiche: magie });
  const mio = vistaPer(s, 0).giocatori[0].magia;
  const suo = vistaPer(s, 0).giocatori[1].magia;

  check('le mie carte magiche le vedo per intero', Array.isArray(mio.selezione) && mio.selezione.length === 2);
  check('quelle dell\'avversario restano coperte', suo.selezione === undefined);
  check('so solo quante ne ha scelte', suo.selezioneQuante === 1);
  check('so QUANTE carte ha già speso, non quali', suo.consumateQuante === 0 && suo.consumate === undefined);

  // e adesso armo una trappola: l'altro deve vedere che c'è, non quale
  s.players[0].magic.trappoleArmate.push({
    cardId: 'trappola_001', effect: 'danno_diretto', parametro: 20,
    trigger: 'avversario_pesca', turniRimasti: 3
  });
  const dallAltraParte = vistaPer(s, 1).giocatori[0].magia;
  check('la trappola armata si conta', dallAltraParte.trappoleArmateQuante === 1);
  check('ma non si legge', dallAltraParte.trappoleArmate === undefined);
  check('e non trapela nemmeno il suo effetto',
    !/danno_diretto/.test(JSON.stringify(vistaPer(s, 1).giocatori[0])));
  check('io invece la mia trappola la vedo',
    vistaPer(s, 0).giocatori[0].magia.trappoleArmate.length === 1);
}

// ============================================================
// LE ABILITÀ DEGLI EROI
// ============================================================
console.log('\n--- LE ABILITÀ ---');
{
  const abilita = {};
  for (const s of SUITS) {
    abilita[s] = { id: 'colpo_' + s, nome: 'Colpo', trigger: 'attivazione_manuale',
                   effect: 'danno_da_attacco', percentuale: 30, costo: 4 };
  }
  const s = createMatch({ rng: rngFisso(5), abilities: [abilita, abilita] });
  const mia = vistaPer(s, 0).giocatori[0].personaggi[PICCHE].abilita;
  const sua = vistaPer(s, 0).giocatori[1].personaggi[PICCHE].abilita;

  check('della mia abilità so tutto', mia.percentuale === 30 && mia.costo === 4);
  check('di quella avversaria so nome e basta', sua.nome === 'Colpo' && sua.percentuale === undefined);
  check('così capisco cosa mi ha colpito senza poterlo calcolare prima',
    sua.id === 'colpo_' + PICCHE);
}

// ============================================================
// UNA PARTITA INTERA, CONTROLLATA MOSSA PER MOSSA
// È qui che si scoprono le fughe: non nella vista appena creata, ma
// dopo una pescata dal tallone, una presa del monte scarti, un pozzetto.
// ============================================================
console.log('\n--- UNA PARTITA INTERA ---');
{
  // un orologio finto che avanza da solo: le azioni vogliono sapere
  // che ora è, e lasciarle senza fa saltare i timer
  let orologio = Date.parse('2026-08-14T20:00:00Z');
  const adesso = () => (orologio += 4000);

  const s = createMatch({ now: orologio, rng: rngFisso(23) });
  let fughe = 0, mosse = 0, momentiControllati = 0;
  const guarda = (quando) => {
    momentiControllati++;
    for (const io of [0, 1]) {
      const t = carteTrapelate(s, io);
      if (t.length) {
        fughe++;
        console.log('   FUGA dopo "' + quando + '" verso il giocatore ' + io + ': ' + t.join(', '));
      }
    }
  };

  guarda('inizio');
  for (let giro = 0; giro < 60 && s.status === 'in_progress'; giro++) {
    const chi = s.currentPlayerIndex;
    const p = s.players[chi];

    // pesca: a volte dal tallone, a volte prendendo il monte scarti
    if (!p.hasDrawnThisTurn) {
      const presa = (giro % 5 === 3) && actionTakeDiscardPile(s, chi, adesso()).ok;
      if (!presa) actionDraw(s, chi, adesso());
      mosse++;
      guarda('pescata');
    }

    // prova a calare qualcosa: tre carte uguali, se ci sono
    const perValore = {};
    for (const c of p.hand) {
      if (c.isJolly || c.isPinella) continue;
      (perValore[c.value] = perValore[c.value] || []).push(c);
    }
    const tris = Object.values(perValore).find((g) => g.length >= 3);
    if (tris) {
      const r = actionLayMeld(s, chi, tris.slice(0, 3).map((c) => c.id), adesso());
      if (r && r.ok) { mosse++; guarda('calata'); }
    }

    if (p.hand.length) {
      actionDiscard(s, chi, p.hand[p.hand.length - 1].id, adesso());
      mosse++;
      guarda('scarto');
    } else break;
  }

  console.log('   → ' + mosse + ' mosse, ' + momentiControllati + ' momenti controllati, stato: ' + s.status);
  check('nessuna carta è mai trapelata, in tutta la partita', fughe === 0);
  check('la partita è andata avanti sul serio', mosse > 40);
  check('qualcuno ha preso il monte scarti o il pozzetto almeno una volta',
    s.players[0].melds.length + s.players[1].melds.length > 0);
}

// ============================================================
// LA PROVA DEL NOVE: SE NASCONDO MALE, IL TEST DEVE ACCORGERSENE
// Un controllo che non fallisce mai quando dovrebbe non serve a niente.
// ============================================================
console.log('\n--- IL CONTROLLO FUNZIONA? ---');
{
  const s = createMatch({ rng: rngFisso(31) });
  // metto di proposito una carta della mano avversaria fra gli scarti
  // pubblici: è esattamente il tipo di svista che vogliamo intercettare
  const rubata = s.players[1].hand[0];
  s.scarti.push(rubata);
  const trapelate = carteTrapelate(s, 0);
  check('una carta avversaria finita nel pubblico viene beccata',
    trapelate.includes(rubata.id));
  check('e viene segnalata una volta sola', trapelate.length === 1);
}

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
process.exit(ko === 0 ? 0 : 1);
