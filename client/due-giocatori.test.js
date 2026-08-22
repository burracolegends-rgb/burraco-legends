// ============================================================
// DUE BROWSER, UN SERVER, UNA PARTITA VERA
//
// PERCHE' ESISTE
// Tutti i controlli fatti finora guardavano un pezzo per volta: il
// motore da solo, il server da solo, una pagina da sola. Ma i difetti
// piu' brutti di questo progetto sono nati tutti NEL MEZZO — nel punto
// in cui il server manda qualcosa e il tavolo se ne aspettava un'altra.
//
// L'ultimo: chi subiva un colpo non vedeva nessuna animazione. Il
// server, del colpo, raccontava soltanto "danno: 47". Il tavolo per
// animare ha bisogno di sapere QUALI personaggi sono stati colpiti, e
// con un elenco vuoto di bersagli usciva in silenzio. Nessun errore,
// nessun avviso: semplicemente non succedeva niente. Nessuna delle
// prove esistenti poteva accorgersene, perche' nessuna metteva insieme
// le due parti.
//
// Qui si accende il server vero e si aprono DUE pagine del tavolo, una
// per giocatore. Uno gioca, e si guarda che cosa vede l'altro.
// ============================================================

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const QUI = dirname(fileURLToPath(import.meta.url));

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch (e) {
  console.log('\n--- DUE BROWSER, UNA PARTITA ---\n');
  console.log('SALTATO: manca jsdom. Installalo con:  npm install\n');
  process.exit(0);
}

process.env.MAGAZZINO = join(tmpdir(), 'burraco-legends-due.json');
process.env.NON_AVVIARE = '1';
process.env.STUDIO_SECONDI = '0';        // qui si prova, non si studia il tavolo
const { server } = await import('../server/server.js');

let ko = 0;
const check = (nome, ok, dettaglio) => {
  console.log((ok ? 'OK   ' : 'FAIL ') + nome + (ok || !dettaglio ? '' : '  <- ' + dettaglio));
  if (!ok) ko++;
};
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n--- DUE BROWSER, UNA PARTITA ---\n');

await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = 'http://127.0.0.1:' + server.address().port;

const posta = async (via, corpo) => (await (await fetch(BASE + via, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo)
})).json());

// ---------- il tavolo, aperto in un browser finto ----------
// Le animazioni si registrano invece di essere disegnate: jsdom non
// anima niente, ma di ogni animazione si vuole sapere CHE E' PARTITA.
async function apriTavolo(codice, segreto, posto) {
  const animate = [];
  const risposta = await fetch(BASE + '/tavolo.html');
  const html = await risposta.text();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: BASE + '/tavolo.html#codice=' + codice + '&segreto=' + encodeURIComponent(segreto) + '&giocatore=' + posto,
    beforeParse(w) {
      w.Element.prototype.animate = function () {
        animate.push(this.className || this.tagName);
        return { finished: Promise.resolve(), cancel() {} };
      };
      w.fetch = (via, opzioni) => fetch(String(via).startsWith('http') ? via : BASE + via, opzioni);
      w.onerror = (m, s, r, c, e) => animate.push('ERRORE: ' + ((e && e.stack) || m));
    }
  });
  await attendi(700);
  return { w: dom.window, dom, animate };
}

// ---------- si apre un tavolo e ci si siede in due ----------
const casa = await posta('/api/apri', { nome: 'Pietro' });
const ospite = await posta('/api/entra', { codice: casa.codice, nome: 'Amico' });
check('il tavolo si apre e si siedono in due', casa.ok && ospite.ok);

const A = await apriTavolo(casa.codice, casa.segreto, 0);
const B = await apriTavolo(casa.codice, ospite.segreto, 1);
check('la pagina del primo giocatore parte in rete', A.w.__inRete === true);
check('e anche quella del secondo', B.w.__inRete === true);
check('tutte e due vedono la partita', !!A.w.__tavolo() && !!B.w.__tavolo());

const guasti = [...A.animate, ...B.animate].filter((x) => String(x).startsWith('ERRORE'));
check('nessuno dei due tavoli va in errore aprendosi', guasti.length === 0, guasti[0]);

// ---------- chi subisce il colpo lo deve VEDERE ----------
// Si porta la partita al punto in cui uno cala e fa danno. Invece di
// sperarci, il danno lo si provoca dal server con l'abilita' speciale:
// e' il colpo piu' corto da preparare.
{
  const stato = A.w.__tavolo();
  const attaccante = stato.currentPlayerIndex === 0 ? A : B;
  const vittima = attaccante === A ? B : A;
  const segretoAttaccante = attaccante === A ? casa.segreto : ospite.segreto;

  // punti magia: si gioca qualche giro finche' non bastano
  for (let giro = 0; giro < 12; giro++) {
    const s = attaccante.w.__tavolo();
    if (!s || s.status !== 'in_progress') break;
    if (s.currentPlayerIndex === 0 && s.players[0].puntiMagia >= 4) break;
    const chiTocca = s.currentPlayerIndex === 0 ? attaccante : vittima;
    const suoSegreto = chiTocca === A ? casa.segreto : ospite.segreto;
    const suo = chiTocca.w.__tavolo();
    if (!suo.players[0].hasDrawnThisTurn) {
      await posta('/api/mossa', { codice: casa.codice, segreto: suoSegreto, azione: { tipo: 'pesca' } });
      await attendi(120);
    }
    const mano = chiTocca.w.__tavolo().players[0].hand;
    await posta('/api/mossa', { codice: casa.codice, segreto: suoSegreto, azione: { tipo: 'scarta', carta: mano[0].id } });
    await attendi(250);
  }

  const prima = attaccante.w.__tavolo();
  if (prima && prima.status === 'in_progress' && prima.currentPlayerIndex === 0 && prima.players[0].puntiMagia >= 4) {
    const pvVittimaPrima = ['♥', '♦', '♣', '♠']
      .reduce((t, s) => t + vittima.w.__tavolo().players[0].characters[s].pv, 0);

    vittima.animate.length = 0;              // si guarda solo quello che succede da qui
    const colpo = await posta('/api/mossa', {
      codice: casa.codice, segreto: segretoAttaccante,
      azione: { tipo: 'abilita', seme: '♥', bersaglio: '♦' }
    });
    check('il colpo passa dal server', colpo.ok === true, colpo.motivo);

    // La scena dura poco e si pulisce da sola: l'onda d'urto sparisce
    // dopo 700 millesimi. Guardare una volta sola, a caso, vuol dire
    // trovare il vuoto e credere che non sia successo niente — che e'
    // esattamente l'errore che questo file esiste per NON fare.
    // Quindi si guarda a intervalli e ci si tiene il massimo visto.
    const visti = { numeri: 0, onde: 0 };
    for (let i = 0; i < 18; i++) {
      await attendi(100);
      const d = vittima.w.document;
      visti.numeri = Math.max(visti.numeri, d.querySelectorAll('.dmg-float').length);
      visti.onde = Math.max(visti.onde, d.querySelectorAll('.dmg-onda').length);
    }

    const pvVittimaDopo = ['♥', '♦', '♣', '♠']
      .reduce((t, s) => t + vittima.w.__tavolo().players[0].characters[s].pv, 0);
    check('chi subisce vede calare i propri punti vita', pvVittimaDopo < pvVittimaPrima,
      Math.round(pvVittimaPrima) + ' → ' + Math.round(pvVittimaDopo));

    // IL PUNTO DI TUTTO IL FILE
    const numeriInScena = visti.numeri;
    const ondeInScena = visti.onde;
    const proiettili = vittima.animate.filter((c) => String(c).includes('proiettile')).length;

    check('a chi subisce parte l\'animazione del colpo che arriva',
      proiettili > 0, 'nessun proiettile animato');
    check('e compare il numero del danno sulla sua carta',
      numeriInScena > 0, 'nessun numero a schermo');
    check('e l\'onda d\'urto sul punto colpito', ondeInScena > 0);

    const suoiGuasti = vittima.animate.filter((x) => String(x).startsWith('ERRORE'));
    check('senza nessun errore', suoiGuasti.length === 0, suoiGuasti[0]);
  } else {
    check('si e\' arrivati a poter colpire', false,
      'partita ' + (prima && prima.status) + ', punti ' + (prima && prima.players[0].puntiMagia));
  }
}

// ---------- GLI OROLOGI CAMMINANO SU TUTTI E DUE GLI SCHERMI ----------
// Il minuto del turno e il monte dei sei minuti non sono "roba di chi
// gioca": chi aspetta deve vedere quanto tempo resta all'altro, se no
// non sa se sta pensando o se e' caduto.
{
  const leggi = (pagina, id) => {
    const e = pagina.w.document.getElementById(id);
    return e ? e.textContent.trim() : null;
  };
  const inSecondi = (mmss) => {
    const p = String(mmss || '').split(':');
    return p.length === 2 ? Number(p[0]) * 60 + Number(p[1]) : null;
  };

  for (const [chi, pagina] of [['il primo', A], ['il secondo', B]]) {
    check(chi + ' giocatore vede il minuto del turno',
      inSecondi(leggi(pagina, 'turnoMio')) !== null && inSecondi(leggi(pagina, 'turnoAvv')) !== null,
      'mio: ' + leggi(pagina, 'turnoMio') + ', avversario: ' + leggi(pagina, 'turnoAvv'));
    check(chi + ' giocatore vede il monte dei sei minuti',
      inSecondi(leggi(pagina, 'myMatchTimer')) !== null && inSecondi(leggi(pagina, 'oppMatchTimer')) !== null,
      'mio: ' + leggi(pagina, 'myMatchTimer') + ', avversario: ' + leggi(pagina, 'oppMatchTimer'));
  }

  // e devono SCORRERE, non stare fermi
  const primaA = inSecondi(leggi(A, 'turnoMio')) + inSecondi(leggi(A, 'turnoAvv'));
  const primaB = inSecondi(leggi(B, 'turnoMio')) + inSecondi(leggi(B, 'turnoAvv'));
  await attendi(2500);
  const dopoA = inSecondi(leggi(A, 'turnoMio')) + inSecondi(leggi(A, 'turnoAvv'));
  const dopoB = inSecondi(leggi(B, 'turnoMio')) + inSecondi(leggi(B, 'turnoAvv'));
  check('sullo schermo del primo il tempo scorre', dopoA < primaA, primaA + ' → ' + dopoA);
  check('e anche su quello del secondo', dopoB < primaB, primaB + ' → ' + dopoB);

  // la riga di chi tocca dev'essere accesa da tutte e due le parti
  const accesa = (pagina) => {
    const d = pagina.w.document;
    return ['rigaTurnoMio', 'rigaTurnoAvv'].filter((id) => {
      const e = d.getElementById(id);
      return e && e.classList.contains('attiva');
    }).length;
  };
  check('il primo vede evidenziato di chi e\' il turno', accesa(A) === 1, 'righe accese: ' + accesa(A));
  check('e lo vede anche il secondo', accesa(B) === 1, 'righe accese: ' + accesa(B));
}

// ---------- ABBANDONARE IL TAVOLO ----------
// Chi se ne va perde, e l'altro se ne deve accorgere: e' tutto il punto
// del gesto. Un tavolo lasciato in silenzio manda l'altro ad aspettare
// una mossa che non arrivera' mai, con il proprio orologio che scorre.
{
  const casa2 = await posta('/api/apri', { nome: 'Pietro' });
  const ospite2 = await posta('/api/entra', { codice: casa2.codice, nome: 'Amico' });
  const C = await apriTavolo(casa2.codice, casa2.segreto, 0);
  const D = await apriTavolo(casa2.codice, ospite2.segreto, 1);

  check('nel pannello c\'e\' il tasto per abbandonare',
    !!C.w.document.getElementById('abbandona'));

  const bottone = C.w.document.getElementById('abbandona');
  if (bottone) {
    // primo tocco: chiede conferma e NON deve chiudere niente
    bottone.click();
    await attendi(300);
    check('il primo tocco chiede conferma invece di chiudere la partita',
      C.w.__tavolo().status === 'in_progress' && /sicuro/i.test(bottone.textContent),
      bottone.textContent);

    // secondo tocco: si va
    bottone.click();
    await attendi(900);

    const suo = C.w.__tavolo(), altrui = D.w.__tavolo();
    check('chi abbandona vede la partita finita', suo.status === 'finished');
    check('e risulta perdente', suo.winner === 1, 'vincitore ' + suo.winner);
    check('il motivo e\' l\'abbandono', suo.winReason === 'abbandono', suo.winReason);
    check('L\'ALTRO se ne accorge', altrui.status === 'finished', altrui.status);
    check('e si vede vincere', altrui.winner === 0, 'vincitore ' + altrui.winner);
    check('la schermata di fine si apre da tutte e due le parti',
      C.w.document.getElementById('finePartita').classList.contains('mostra') &&
      D.w.document.getElementById('finePartita').classList.contains('mostra'));
    check('e parte il conto alla rovescia per tornare a casa',
      /^\d+$/.test(D.w.document.getElementById('fineConto').textContent.trim()));

    const rotture = [...C.animate, ...D.animate].filter((x) => String(x).startsWith('ERRORE'));
    check('nessun errore in tutto questo', rotture.length === 0, rotture[0]);
  }
  C.dom.window.close(); D.dom.window.close();
}

// ---------- e il server deve MANDARE quello che serve ad animare ----------
{
  const registro = await (await fetch(BASE + '/api/registro?codice=' + casa.codice)).json();
  check('il registro della partita si scarica', registro.ok !== false);
}

A.dom.window.close(); B.dom.window.close();
server.close();

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.') + '\n');
process.exit(ko === 0 ? 0 : 1);
