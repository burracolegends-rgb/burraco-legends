// ============================================================
// BURRACO LEGENDS — MATCHMAKING E MISSIONE DEL GIORNO
//
// Due funzionalità nuove, un file solo perché condividono lo stesso
// server acceso davvero: sedersi con uno sconosciuto (server/stanze.js,
// siediti()) e la Missione contro il bot col mazzo del giorno
// (server/missioni.js). La prima metà del file parla HTTP con un
// server vero, come server.test.js; la seconda prova in isolamento la
// logica che non si può aspettare un giorno vero per vedere se
// funziona — il seme del giorno e la chiusura di ieri.
// ============================================================
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MAGAZZINO = process.env.MAGAZZINO || join(tmpdir(), 'burraco-legends-missioni.json');
process.env.NON_AVVIARE = '1';
process.env.STUDIO_SECONDI = '0';

const { server, stanze } = await import('./server.js');
import { giornoDi, creaMissioni } from './missioni.js';
import { archivioInMemoria } from './archivio.js';

let ko = 0;
const check = (l, c, dettaglio) => {
  console.log((c ? 'OK   ' : 'FAIL ') + l + (c || !dettaglio ? '' : '  <- ' + dettaglio));
  if (!c) ko++;
};

await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = 'http://127.0.0.1:' + server.address().port;

const posta = async (via, corpo) => {
  const r = await fetch(BASE + via, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  return { stato: r.status, corpo: await r.json().catch(() => null) };
};
const chiedi = async (via) => {
  const r = await fetch(BASE + via);
  return { stato: r.status, corpo: await r.json().catch(() => null) };
};
const gettoneFinto = () => 'g_' + Math.random().toString(36).slice(2);

// ============================================================
console.log('--- SEDERSI CON UNO SCONOSCIUTO ---');
{
  const gettoneAnna = gettoneFinto();
  const primo = (await posta('/api/siediti', { nome: 'Anna', gettone: gettoneAnna })).corpo;
  check('il primo si siede e aspetta', primo.ok === true && primo.giocatore === 0);
  check('il suo tavolo non ha ancora un secondo posto',
    stanze.stanza(primo.codice).posti[1] === null);

  // richiamare con lo STESSO gettone mentre si aspetta non deve fare
  // sedere Anna una seconda volta contro se stessa: deve tornare al
  // tavolo dove è già seduta, ancora come primo posto
  const rivisto = (await posta('/api/siediti', { nome: 'Anna', gettone: gettoneAnna })).corpo;
  check('lo stesso gettone che richiama torna allo stesso tavolo in attesa',
    rivisto.codice === primo.codice && rivisto.giocatore === 0);

  const secondo = (await posta('/api/siediti', { nome: 'Carla', gettone: gettoneFinto() })).corpo;
  check('il prossimo che si siede finisce allo STESSO tavolo, come secondo',
    secondo.ok === true && secondo.codice === primo.codice && secondo.giocatore === 1);
  check('e la partita parte subito', !!stanze.stanza(secondo.codice).partita);

  const terzo = (await posta('/api/siediti', { nome: 'Dario', gettone: gettoneFinto() })).corpo;
  check('chi arriva a tavolo pieno ne apre uno NUOVO, non si accoda al vecchio',
    terzo.ok === true && terzo.codice !== secondo.codice && terzo.giocatore === 0);
}

// ============================================================
console.log('\n--- SOLO CHI È REGISTRATO PUÒ GIOCARE LA MISSIONE ---');
// Registrarsi crea un account vero, con un vero indirizzo email: un
// modo di ritrovarlo che sopravvive a un cambio di browser, e a cui un
// premio può davvero arrivare. Serve una password che rispetti le
// regole vere (server/password.js): otto caratteri, non troppo facile.
const registrato = async (nome) => {
  const email = 'prova_' + Math.random().toString(36).slice(2) + '@esempio.it';
  const r = (await posta('/api/registrati', { email, password: 'BurracoProva#42', nome })).corpo;
  if (!r.ok) throw new Error('registrazione di prova fallita: ' + r.motivo);
  return r.gettone;
};
{
  const ospite = (await posta('/api/entra-ospite', { nome: 'Turista' })).corpo.gettone;
  const daOspite = (await posta('/api/missione/inizia', { gettone: ospite })).corpo;
  check('un account ospite non può cominciare la Missione',
    daOspite.ok === false && daOspite.serveRegistrazione === true, JSON.stringify(daOspite));
  check('e nessun tavolo si è aperto per lui', !daOspite.codice);

  const senzaAccount = (await posta('/api/missione/inizia', { gettone: gettoneFinto() })).corpo;
  check('e nemmeno un gettone che non esiste proprio',
    senzaAccount.ok === false && senzaAccount.serveRegistrazione === true);
}

// ============================================================
console.log('\n--- LA MISSIONE: UN TENTATIVO SOLO, MAZZO UGUALE PER TUTTI ---');
{
  const gettoneA = await registrato('Elio'), gettoneB = await registrato('Fosca');

  const iniA = (await posta('/api/missione/inizia', { gettone: gettoneA })).corpo;
  check('il primo tentativo di oggi apre un tavolo', iniA.ok === true && iniA.giaGiocataOggi === false);
  check('e la partita comincia SUBITO: nessuno resta ad aspettare un secondo giocatore',
    !!stanze.stanza(iniA.codice).partita);
  check('il secondo posto è il bot', stanze.stanza(iniA.codice).posti[1].bot === true);
  check('il nome in tavola è quello vero dell\'account, non uno scritto a mano',
    stanze.stanza(iniA.codice).posti[0].nome === 'Elio');

  const iniB = (await posta('/api/missione/inizia', { gettone: gettoneB })).corpo;
  const mazzoBotA = stanze.stanza(iniA.codice).partita.players[1].hand.map((c) => c.suit + c.value).sort();
  const mazzoBotB = stanze.stanza(iniB.codice).partita.players[1].hand.map((c) => c.suit + c.value).sort();
  check('il bot ha in mano ESATTAMENTE le stesse carte per tutti, oggi',
    JSON.stringify(mazzoBotA) === JSON.stringify(mazzoBotB),
    mazzoBotA.join(',') + ' vs ' + mazzoBotB.join(','));

  // Chi abbandona azzera i propri quattro personaggi (engine/partita.js,
  // abbandona()): un modo deterministico di chiudere una partita vera
  // nel test, senza dover giocare mano per mano fino alla fine.
  const chiuso = (await posta('/api/mossa', { codice: iniA.codice, segreto: iniA.segreto, azione: { tipo: 'abbandona' } })).corpo;
  check('la mossa di abbandono è accettata', chiuso.ok === true);

  const oggiA = (await chiedi('/api/missione/classifica?giorno=oggi&gettone=' + gettoneA)).corpo;
  check('chi ha abbandonato risulta con 0 PV in classifica di oggi',
    oggiA.ok === true && oggiA.righe.some((r) => r.mio && r.pvFinali === 0),
    JSON.stringify(oggiA.righe));
  check('e segnato come partita persa', oggiA.righe.find((r) => r.mio).vinto === false);

  // Il controllo "hai già giocato oggi" deve poter rispondere SENZA
  // consumare niente: la pagina lo chiede appena si apre, e il solo
  // guardarla non deve mai contare come un secondo tentativo.
  const giaOggiA = (await chiedi('/api/missione/oggi?gettone=' + gettoneA)).corpo;
  check('/api/missione/oggi dice che sì, ha già giocato',
    giaOggiA.ok === true && giaOggiA.giocataOggi === true && giaOggiA.risultato.pvFinali === 0);
  const giaOggiC = (await chiedi('/api/missione/oggi?gettone=' + gettoneFinto())).corpo;
  check('e per chi non ha mai giocato dice di no, senza aprire un tavolo',
    giaOggiC.ok === true && giaOggiC.giocataOggi === false && giaOggiC.risultato === null);

  const secondoTentativo = (await posta('/api/missione/inizia', { gettone: gettoneA })).corpo;
  check('un secondo tentativo lo stesso giorno non apre un altro tavolo',
    secondoTentativo.ok === true && secondoTentativo.giaGiocataOggi === true);
  check('e restituisce il risultato di prima',
    secondoTentativo.risultato && secondoTentativo.risultato.pvFinali === 0);

  const oggiSenzaGettone = (await chiedi('/api/missione/classifica?giorno=oggi')).corpo;
  check('senza passare un gettone, nessuna riga risulta "mia"',
    oggiSenzaGettone.ok === true && oggiSenzaGettone.righe.every((r) => r.mio === false));
}

// ============================================================
console.log('\n--- IN ISOLAMENTO: IL SEME DEL GIORNO E LA CHIUSURA DI IERI ---');
{
  check('lo stesso giorno produce sempre lo stesso testo (YYYY-MM-DD)',
    giornoDi(Date.parse('2026-03-14T23:50:00+01:00'), 'Europe/Rome') === '2026-03-14');
  check('un\'ora dopo la mezzanotte di Roma è già il giorno dopo',
    giornoDi(Date.parse('2026-03-14T23:10:00Z'), 'Europe/Rome') === '2026-03-15');

  // Un'anagrafe finta: registra solo che il premio è stato chiesto per
  // quel gettone, senza toccare nessun magazzino vero.
  const premiConsegnati = [];
  const anagrafeFinta = { regalaPacchetto: async (gettone, n, tipo) => {
    premiConsegnati.push({ gettone, n, tipo });
    return { ok: true };
  } };
  // Nessuna partita vera serve per questa prova: si scrive direttamente
  // la classifica di "ieri" nel magazzino, come se fosse stata giocata,
  // e si controlla che la prima richiesta di oggi la chiuda da sola.
  const archivioFinto = archivioInMemoria();
  const missioniFinte = creaMissioni({
    archivio: archivioFinto, stanze, anagrafe: anagrafeFinta,
    orologio: () => Date.parse('2026-05-10T10:00:00+02:00'),
    eRegistrato: async () => true   // qui si prova la chiusura del giorno, non chi può giocare
  });
  await archivioFinto.scrivi('classificaMissione:2026-05-09', {
    chiuso: false,
    righe: [
      { gettone: 'g_basso', nome: 'Basso', pvFinali: 120, vinto: false, quando: 0 },
      { gettone: 'g_alto', nome: 'Alto', pvFinali: 340, vinto: true, quando: 0 }
    ]
  });

  const risultato = await missioniFinte.classificaDi('oggi', null);
  check('la classifica di ieri, mai chiusa, si chiude alla prima richiesta di oggi',
    premiConsegnati.length === 1 && premiConsegnati[0].gettone === 'g_alto' && premiConsegnati[0].n === 5,
    JSON.stringify(premiConsegnati));

  const secondaChiamata = await missioniFinte.classificaDi('oggi', null);
  check('e non si consegna un secondo pacchetto richiedendola di nuovo',
    premiConsegnati.length === 1);

  const ieriVisto = await missioniFinte.classificaDi('ieri', null);
  check('la classifica di ieri si legge ordinata dal più alto',
    ieriVisto.righe[0].pvFinali === 340 && ieriVisto.righe[1].pvFinali === 120);
  check('e riporta chi l\'ha vinta', ieriVisto.vincitore && ieriVisto.vincitore.pvFinali === 340);
}

// ============================================================
server.close();
console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
if (ko > 0) process.exit(1);
