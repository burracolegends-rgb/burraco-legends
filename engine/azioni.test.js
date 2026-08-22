// Qui non provo se le regole del burraco sono giuste — quello lo fanno
// gli altri file. Provo se la porta regge: messaggi storti, messaggi
// ostili, mosse di chi non è di turno, carte che non si possiedono.
// Tutto quello che arriverà dalla rete quando giocheremo in due.
import { createMatch } from './partita.js';
import { applica, faiScorrereIlTempo, AZIONI } from './azioni.js';
import { SUITS } from './core-rules.js';

const [CUORI, QUADRI, FIORI, PICCHE] = SUITS;

let ko = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) ko++; };

function rngFisso(seme) {
  let x = seme;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

const T0 = Date.parse('2026-08-14T20:00:00Z');
const nuova = (seme = 7, extra = {}) => createMatch({ now: T0, rng: rngFisso(seme), ...extra });

// ============================================================
// CHI SEI LO DECIDO IO
// Il controllo più importante: l'indice nel messaggio non conta niente.
// ============================================================
console.log('--- CHI SEI ---');
{
  const s = nuova();                                  // tocca al giocatore 0
  const primaMano = s.players[0].hand.length;

  const furbo = applica(s, { tipo: 'pesca', giocatore: 0, playerIndex: 0, chi: 0 }, 1, T0 + 1000);
  check('il giocatore 1 non pesca fingendosi lo 0', furbo.ok === false);
  check('e glielo si dice chiaro', /turno/i.test(furbo.motivo));
  check('la mano del giocatore 0 non è stata toccata',
    s.players[0].hand.length === primaMano);

  const buono = applica(s, { tipo: 'pesca' }, 0, T0 + 1000);
  check('chi è di turno invece pesca', buono.ok === true);
  // in questo burraco si pescano due carte per volta, non una
  check('e la mano cresce', s.players[0].hand.length > primaMano);
}

// ============================================================
// MESSAGGI STORTI
// ============================================================
console.log('\n--- MESSAGGI STORTI ---');
{
  const s = nuova();
  const prova = (etichetta, msg) => {
    const prima = JSON.stringify({
      mano: s.players[0].hand.map((c) => c.id),
      scarti: s.scarti.map((c) => c.id),
      turno: s.currentPlayerIndex
    });
    const r = applica(s, msg, 0, T0 + 1000);
    const dopo = JSON.stringify({
      mano: s.players[0].hand.map((c) => c.id),
      scarti: s.scarti.map((c) => c.id),
      turno: s.currentPlayerIndex
    });
    check(etichetta + ' → rifiutato, e la partita non si muove',
      r.ok === false && typeof r.motivo === 'string' && r.motivo.length > 0 && prima === dopo);
  };

  prova('niente', null);
  prova('una stringa', 'pesca');
  prova('un numero', 42);
  prova('un oggetto vuoto', {});
  prova('tipo sconosciuto', { tipo: 'vinci' });
  prova('tipo non stringa', { tipo: 99 });
  prova('cala senza carte', { tipo: 'cala' });
  prova('cala con carte non array', { tipo: 'cala', carte: 'c1' });
  prova('cala con array vuoto', { tipo: 'cala', carte: [] });
  prova('cala con dentro un oggetto', { tipo: 'cala', carte: [{ id: 'c1' }] });
  prova('cala con dentro un numero', { tipo: 'cala', carte: [1, 2, 3] });
  prova('cala con la stessa carta tre volte', { tipo: 'cala', carte: ['c1', 'c1', 'c1'] });
  prova('cala con diecimila carte', { tipo: 'cala', carte: Array.from({ length: 10000 }, (_, i) => 'c' + i) });
  prova('id lunghissimo', { tipo: 'scarta', carta: 'x'.repeat(5000) });
  prova('id vuoto', { tipo: 'scarta', carta: '   ' });
  prova('scarta senza carta', { tipo: 'scarta' });
  prova('aggancia senza gioco', { tipo: 'aggancia', carte: ['c1'] });
  prova('abilita con seme inventato', { tipo: 'abilita', seme: 'stelle' });
  prova('abilita con seme oggetto', { tipo: 'abilita', seme: {} });
  prova('abilita con bersaglio inventato', { tipo: 'abilita', seme: PICCHE, bersaglio: 'lune' });
  prova('magia con indice negativo', { tipo: 'magia', indice: -1 });
  prova('magia con indice enorme', { tipo: 'magia', indice: 999999 });
  prova('magia con indice decimale', { tipo: 'magia', indice: 1.5 });
  prova('magia con indice stringa', { tipo: 'magia', indice: '0' });

  // sette mosse di gioco piu' l'abbandono, che mossa non e': e' il modo
  // di alzarsi da tavola dicendolo
  check('l\'elenco delle azioni ammesse è chiuso', AZIONI.length === 8);
  check('e contiene l\'abbandono', AZIONI.includes('abbandona'));
}

// ============================================================
// CARTE CHE NON SONO TUE
// ============================================================
console.log('\n--- CARTE ALTRUI ---');
{
  const s = nuova(13);
  applica(s, { tipo: 'pesca' }, 0, T0 + 1000);

  const sua = s.players[1].hand[0].id;
  const r = applica(s, { tipo: 'scarta', carta: sua }, 0, T0 + 2000);
  check('non scarto una carta dell\'avversario', r.ok === false);
  check('e il motivo lo dice', /non è in mano tua/i.test(r.motivo));
  check('la sua mano è intatta', s.players[1].hand.some((c) => c.id === sua));

  const dalTallone = s.tallone[0].id;
  check('non calo una carta ancora nel mazzo',
    applica(s, { tipo: 'cala', carte: [dalTallone] }, 0, T0 + 2000).ok === false);

  const inventate = applica(s, { tipo: 'cala', carte: ['c99999', 'c99998', 'c99997'] }, 0, T0 + 2000);
  check('non calo carte che non esistono', inventate.ok === false);
  check('e mi si dice quali mancano', /c99999/.test(inventate.motivo));

  // metà mie e metà no: deve rifiutare tutto, non calare le mie
  const mie = s.players[0].hand.slice(0, 2).map((c) => c.id);
  const miste = applica(s, { tipo: 'cala', carte: [...mie, sua] }, 0, T0 + 2000);
  check('mescolare le mie con una sua non funziona', miste.ok === false);
  check('e le mie restano in mano',
    mie.every((id) => s.players[0].hand.some((c) => c.id === id)));
}

// ============================================================
// L'ORDINE DELLE FASI
// ============================================================
console.log('\n--- LE FASI ---');
{
  const s = nuova(17);
  const carta = s.players[0].hand[0].id;

  check('non si scarta prima di pescare',
    applica(s, { tipo: 'scarta', carta }, 0, T0 + 1000).ok === false);
  check('non si cala prima di pescare',
    applica(s, { tipo: 'cala', carte: s.players[0].hand.slice(0, 3).map((c) => c.id) }, 0, T0 + 1000).ok === false);

  check('si pesca', applica(s, { tipo: 'pesca' }, 0, T0 + 2000).ok === true);
  check('ma non due volte', applica(s, { tipo: 'pesca' }, 0, T0 + 3000).ok === false);
  check('e nemmeno prendendo il monte scarti dopo aver pescato',
    applica(s, { tipo: 'prendi_scarti' }, 0, T0 + 3000).ok === false);

  check('ora si scarta', applica(s, { tipo: 'scarta', carta: s.players[0].hand[0].id }, 0, T0 + 4000).ok === true);
  check('e il turno è passato', s.currentPlayerIndex === 1);
  check('chi ha appena giocato non rigioca',
    applica(s, { tipo: 'pesca' }, 0, T0 + 5000).ok === false);
}

// ============================================================
// IL TEMPO SCADUTO SI SALDA PRIMA
// ============================================================
console.log('\n--- IL TEMPO ---');
{
  const s = nuova(19);
  applica(s, { tipo: 'pesca' }, 0, T0 + 1000);

  // il giocatore 0 sparisce; passano oltre 60 secondi; poi scrive il giocatore 1
  const dopoUnMinuto = T0 + 75000;
  const r = applica(s, { tipo: 'pesca' }, 1, dopoUnMinuto);
  check('il turno abbandonato viene chiuso d\'ufficio', r.turnoScaduto === true);
  check('e chi ha aspettato può giocare', r.ok === true);
  check('il turno adesso è suo', s.currentPlayerIndex === 1);

  // e chi era sparito non recupera il turno perso
  check('chi è tornato tardi non gioca il turno di prima',
    applica(s, { tipo: 'scarta', carta: s.players[0].hand[0].id }, 0, dopoUnMinuto + 1000).ok === false);
}

{
  const s = nuova(29);
  applica(s, { tipo: 'pesca' }, 0, T0 + 1000);
  const r = faiScorrereIlTempo(s, T0 + 90000);
  check('l\'orologio da solo fa scadere il turno', r.scaduto === true);
  check('e scarta una carta al posto di chi non ha risposto', r.scartata !== null);
  check('il turno passa comunque', s.currentPlayerIndex === 1);
  check('senza tempo scaduto non succede niente',
    faiScorrereIlTempo(s, T0 + 91000).scaduto === false);
}

// ============================================================
// A PARTITA FINITA NON SI GIOCA PIÙ
// ============================================================
console.log('\n--- A PARTITA FINITA ---');
{
  const s = nuova(31);
  s.status = 'finished';
  s.winner = 0;
  for (const tipo of AZIONI) {
    const r = applica(s, { tipo, carte: ['c1'], carta: 'c1', gioco: 'm1', seme: PICCHE, indice: 0 }, 0, T0 + 1000);
    if (r.ok) { check('"' + tipo + '" non doveva funzionare a partita finita', false); break; }
  }
  check('nessuna azione passa a partita finita', true);
  check('e il motivo è chiaro',
    /finita/i.test(applica(s, { tipo: 'pesca' }, 0, T0 + 1000).motivo));
}

// ============================================================
// UNA PARTITA GIOCATA TUTTA DALLA PORTA
// Se il gioco non arriva in fondo passando solo da `applica`, vuol dire
// che la porta è troppo stretta e sul server ci resteremmo bloccati.
// ============================================================
console.log('\n--- UNA PARTITA INTERA DALLA PORTA ---');
{
  let orologio = T0;
  const adesso = () => (orologio += 3000);
  const s = nuova(23);

  let accettate = 0, rifiutate = 0, calate = 0;
  for (let giro = 0; giro < 200 && s.status === 'in_progress'; giro++) {
    const chi = s.currentPlayerIndex;
    const p = s.players[chi];

    if (!p.hasDrawnThisTurn) {
      const r = applica(s, { tipo: 'pesca' }, chi, adesso());
      r.ok ? accettate++ : rifiutate++;
      if (!r.ok) break;
    }
    if (s.status !== 'in_progress') break;

    const perValore = {};
    for (const c of p.hand) {
      if (c.isJolly || c.isPinella) continue;
      (perValore[c.value] = perValore[c.value] || []).push(c);
    }
    const tris = Object.values(perValore).find((g) => g.length >= 3);
    if (tris) {
      const r = applica(s, { tipo: 'cala', carte: tris.slice(0, 3).map((c) => c.id) }, chi, adesso());
      if (r.ok) { accettate++; calate++; } else rifiutate++;
    }

    // la pescata può aver svuotato il tallone e chiuso la partita: da lì
    // in poi ogni rifiuto è giusto, e contarlo falserebbe il conto
    if (s.status !== 'in_progress' || !p.hand.length) break;
    const r = applica(s, { tipo: 'scarta', carta: p.hand[p.hand.length - 1].id }, chi, adesso());
    r.ok ? accettate++ : rifiutate++;
    if (!r.ok) break;
  }

  console.log('   → ' + accettate + ' accettate, ' + rifiutate + ' rifiutate, ' +
              calate + ' calate, finale: ' + s.status + (s.winner !== null ? ' (vince ' + s.winner + ', ' + s.winReason + ')' : ''));
  check('la partita arriva alla fine passando solo dalla porta', s.status === 'finished');
  check('e si è giocato sul serio', accettate > 60 && calate > 0);
  check('nessuna mossa lecita è stata respinta per sbaglio', rifiutate === 0);
}

// ============================================================
// LA STESSA PARTITA DUE VOLTE
// Serve al server: se una partita non si può rigiocare identica, il
// registro delle mosse non vale niente e "aspetta, cos'avevi fatto?"
// resta l'unico modo di indagare su un difetto.
// ============================================================

// ============================================================
// ABBANDONARE
// Si puo' sempre, anche fuori dal proprio turno: aspettare il proprio
// turno per potersene andare non avrebbe senso.
// ============================================================
console.log('\n--- ABBANDONARE ---');
{
  const s = nuova();
  const chiNonTocca = s.currentPlayerIndex === 0 ? 1 : 0;
  const r = applica(s, { tipo: 'abbandona' }, chiNonTocca, T0 + 1000);
  check('si abbandona anche se non e\' il proprio turno', r.ok === true);
  check('la partita finisce', s.status === 'finished');
  check('e vince l\'altro', s.winner === (chiNonTocca === 0 ? 1 : 0));
  check('col motivo giusto', s.winReason === 'abbandono');
  check('i personaggi di chi se n\'e\' andato sono a zero',
    SUITS.every((x) => s.players[chiNonTocca].characters[x].pv === 0));
  check('dopo, nessuna mossa passa piu\'',
    applica(s, { tipo: 'pesca' }, 0, T0 + 2000).ok === false);
  check('e non si abbandona due volte',
    applica(s, { tipo: 'abbandona' }, chiNonTocca, T0 + 3000).ok === false);
}

console.log('\n--- RIPETIBILITÀ ---');
{
  const gioca = (seme) => {
    let orologio = T0;
    const adesso = () => (orologio += 3000);
    const s = nuova(seme);
    const registro = [];
    for (let giro = 0; giro < 120 && s.status === 'in_progress'; giro++) {
      const chi = s.currentPlayerIndex;
      const p = s.players[chi];
      if (!p.hasDrawnThisTurn) {
        const m = { tipo: 'pesca' };
        registro.push([chi, m, applica(s, m, chi, adesso()).ok]);
      }
      if (s.status !== 'in_progress' || !p.hand.length) break;
      const m = { tipo: 'scarta', carta: p.hand[p.hand.length - 1].id };
      registro.push([chi, m, applica(s, m, chi, adesso()).ok]);
    }
    return {
      registro: JSON.stringify(registro),
      finale: JSON.stringify({
        stato: s.status, vincitore: s.winner, motivo: s.winReason,
        mani: s.players.map((p) => p.hand.map((c) => c.id)),
        scarti: s.scarti.map((c) => c.id),
        calate: s.players.map((p) => p.melds.map((m) => m.cards.map((c) => c.id)))
      })
    };
  };

  const a = gioca(101), b = gioca(101), c = gioca(202);
  check('lo stesso seme dà le stesse mosse', a.registro === b.registro);
  check('e lo stesso finale, carta per carta', a.finale === b.finale);
  check('un seme diverso dà una partita diversa', a.finale !== c.finale);

  // e il mazzo deve essere davvero mescolato, non solo ripetibile
  const m1 = nuova(1).tallone.map((x) => x.id).join(',');
  const m2 = nuova(2).tallone.map((x) => x.id).join(',');
  check('semi diversi mescolano diversamente', m1 !== m2);
  check('le carte del mazzo hanno nomi propri, non quelli delle calate',
    nuova(1).tallone.every((x) => /^k\d+$/.test(x.id)));
  const tutte = nuova(3);
  const ids = new Set([...tutte.tallone, ...tutte.players[0].hand, ...tutte.players[1].hand,
                       ...tutte.players[0].pozzetto, ...tutte.players[1].pozzetto, ...tutte.scarti]
                      .map((x) => x.id));
  check('nel mazzo non ci sono due carte con lo stesso nome', ids.size === 108);
}

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
process.exit(ko === 0 ? 0 : 1);
