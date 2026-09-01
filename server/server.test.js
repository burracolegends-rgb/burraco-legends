// Il server acceso davvero, con due client che parlano HTTP come lo
// faranno i due browser. Qui si prova quello che i test delle stanze
// non possono provare: gli indirizzi, i corpi delle richieste, i file
// serviti, e i tentativi di leggere quello che non si deve.

// ------------------------------------------------------------
// LE IMPOSTAZIONI DELLA PROVA SE LE METTE DA SOLA
//
// Prima stavano nel comando, scritte come si fa su Linux:
//     MAGAZZINO=/tmp/... NON_AVVIARE=1 node server/server.test.js
// Su Windows quella riga non vuol dire niente — cmd la legge come se
// "MAGAZZINO" fosse un programma da eseguire — e i controlli si
// fermavano proprio all'ultimo passo, dopo aver superato tutti gli
// altri. Anche "/tmp" e' un posto che su Windows non esiste.
//
// Quindi se le mette il file, che gira uguale ovunque. E l'import del
// server e' dinamico apposta: gli import normali vengono eseguiti PRIMA
// di qualunque riga di codice, e il server leggerebbe le variabili
// quando non ci sono ancora.
// ------------------------------------------------------------
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MAGAZZINO = process.env.MAGAZZINO || join(tmpdir(), 'burraco-legends-prova.json');
process.env.NON_AVVIARE = '1';            // il server non si mette in ascolto da solo
process.env.STUDIO_SECONDI = '0';         // niente attesa di dieci secondi: qui si prova, non si gioca

const { server, stanze } = await import('./server.js');
import { dotazioneIniziale } from '../engine/dotazione.js';

// Nessuno nasce piu' con l'album vuoto: alla creazione si ricevono le
// carte della dotazione iniziale (engine/dotazione.js), senza le quali
// non si potrebbe scendere in campo — ora che si gioca solo con le
// carte che si possiedono davvero.
const DI_PARTENZA = Object.values(dotazioneIniziale()).reduce((a, b) => a + b, 0);

let ko = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) ko++; };

await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = 'http://127.0.0.1:' + server.address().port;
console.log('server di prova su ' + BASE + '\n');

const posta = async (via, corpo) => {
  const r = await fetch(BASE + via, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
  });
  return { stato: r.status, corpo: await r.json().catch(() => null) };
};
const chiedi = async (via) => {
  const r = await fetch(BASE + via);
  const testo = await r.text();
  let json = null;
  try { json = JSON.parse(testo); } catch (e) {}
  return { stato: r.status, corpo: json, testo, tipo: r.headers.get('content-type') || '' };
};

// ============================================================
console.log('--- APRIRE UN TAVOLO ---');
const casa = (await posta('/api/apri', { nome: 'Pietro' })).corpo;
check('il tavolo si apre', casa.ok === true && /^[A-Z0-9]{6}$/.test(casa.codice));
check('chi apre è il primo', casa.giocatore === 0);

{
  const r = await posta('/api/entra', { codice: 'AAAAAA' });
  check('un codice inventato risponde 404', r.stato === 404 && r.corpo.ok === false);
}

const ospite = (await posta('/api/entra', { codice: casa.codice, nome: 'Amico' })).corpo;
check('il secondo entra', ospite.ok === true && ospite.giocatore === 1);
check('un terzo no', (await posta('/api/entra', { codice: casa.codice })).corpo.ok === false);

// ============================================================
console.log('\n--- QUELLO CHE SI VEDE DALL\'ESTERNO ---');
{
  const mio = (await chiedi('/api/stato?codice=' + casa.codice + '&segreto=' + casa.segreto + '&da=-1')).corpo;
  check('vedo la mia mano', mio.vista.giocatori[0].mano.length === 11);
  check('non vedo quella dell\'altro', mio.vista.giocatori[1].mano === undefined);
  check('non vedo il mazzo', mio.vista.tallone === undefined && mio.vista.talloneQuante > 0);

  const grezzo = (await chiedi('/api/stato?codice=' + casa.codice + '&segreto=' + casa.segreto + '&da=-1')).testo;
  const partita = stanzaDi(casa.codice).partita;
  const proibite = [
    ...partita.tallone.map((c) => c.id),
    ...partita.players[1].hand.map((c) => c.id),
    ...partita.players[0].pozzetto.map((c) => c.id)
  ];
  const trapelate = proibite.filter((id) => grezzo.includes('"' + id + '"'));
  check('nel testo che viaggia sul filo non c\'è niente di proibito' +
    (trapelate.length ? ' → ' + trapelate.slice(0, 5).join(', ') : ''), trapelate.length === 0);

  check('senza segreto non si legge niente',
    (await chiedi('/api/stato?codice=' + casa.codice + '&da=-1')).stato === 404);
  check('con un segreto inventato nemmeno',
    (await chiedi('/api/stato?codice=' + casa.codice + '&segreto=xxx&da=-1')).stato === 404);
}

function stanzaDi(codice) { return stanze.stanza(codice); }

// CHI COMINCIA LO DECIDE IL MAZZO, non chi ha aperto il tavolo: una
// pescata a testa, la piu' alta vince. Il seme cambia a ogni tavolo,
// quindi dare per scontato che muova chi ha aperto rendeva questi
// controlli veri solo una volta su due.
const chiMuove = (codice) => stanzaDi(codice).partita.currentPlayerIndex;
const segretoDiTurno = (codice, uno, due) => [uno.segreto, due.segreto][chiMuove(codice)];
const segretoFuoriTurno = (codice, uno, due) => [uno.segreto, due.segreto][chiMuove(codice) === 0 ? 1 : 0];

// ============================================================
console.log('\n--- GIOCARE ---');
{
  const diTurno = chiMuove(casa.codice);
  const suo = segretoDiTurno(casa.codice, casa, ospite);
  const fuoriTurno = await posta('/api/mossa', { codice: casa.codice, segreto: segretoFuoriTurno(casa.codice, casa, ospite), azione: { tipo: 'pesca' } });
  check('la mossa fuori turno risponde 200, non è un errore di rete', fuoriTurno.stato === 200);
  check('ma è rifiutata', fuoriTurno.corpo.ok === false && /turno/i.test(fuoriTurno.corpo.motivo));

  const buona = await posta('/api/mossa', { codice: casa.codice, segreto: suo, azione: { tipo: 'pesca' } });
  check('chi è di turno pesca', buona.corpo.ok === true, buona.corpo.motivo);
  check('e riceve subito la sua vista aggiornata', buona.corpo.vista.giocatori[diTurno].mano.length === 12);   // 11 in mano + 1 pescata

  const storta = await posta('/api/mossa', { codice: casa.codice, segreto: suo, azione: { tipo: 'vinci_subito' } });
  check('un\'azione inventata è rifiutata con garbo', storta.corpo.ok === false);

  const spazzatura = await posta('/api/mossa', 'questo non è json');
  check('un corpo illeggibile risponde 400', spazzatura.stato === 400);
}

// ============================================================
console.log('\n--- L\'ATTESA SUL FILO ---');
{
  // chi MUOVE e' quello di turno; ad aspettare si mette l'altro, che e'
  // il caso che conta: la sua domanda deve svegliarsi appena l'altro gioca
  const muove = chiMuove(casa.codice);
  const aspetta = muove === 0 ? 1 : 0;
  const segretoMuove = [casa.segreto, ospite.segreto][muove];
  const segretoAspetta = [casa.segreto, ospite.segreto][aspetta];

  const stato = (await chiedi('/api/stato?codice=' + casa.codice + '&segreto=' + segretoAspetta + '&da=-1')).corpo;
  const partenza = Date.now();
  let arrivata = null;

  const appesa = chiedi('/api/stato?codice=' + casa.codice + '&segreto=' + segretoAspetta + '&da=' + stato.versione)
    .then((r) => { arrivata = { ...r, dopo: Date.now() - partenza }; });

  await new Promise((ok) => setTimeout(ok, 120));
  check('la domanda resta appesa se non succede niente', arrivata === null);

  const partita = stanzaDi(casa.codice).partita;
  await posta('/api/mossa', {
    codice: casa.codice, segreto: segretoMuove,
    azione: { tipo: 'scarta', carta: partita.players[muove].hand[0].id }
  });
  await appesa;

  check('appena l\'altro gioca, la risposta parte', arrivata !== null);
  check('e arriva subito, non dopo il timeout', arrivata.dopo < 3000);
  check('l\'ospite vede che ora tocca a lui', arrivata.corpo.vista.eIlMioTurno === true);
  console.log('   → risposta arrivata dopo ' + arrivata.dopo + ' ms');
}

// ============================================================
console.log('\n--- UNA PARTITA INTERA SUL FILO ---');
{
  const c = (await posta('/api/apri', { nome: 'X' })).corpo;
  const o = (await posta('/api/entra', { codice: c.codice, nome: 'Y' })).corpo;
  const segreti = [c.segreto, o.segreto];

  let mosse = 0, rifiuti = 0;
  for (let giro = 0; giro < 160; giro++) {
    const p = stanzaDi(c.codice).partita;
    if (!p || p.status !== 'in_progress') break;
    const chi = p.currentPlayerIndex;
    const mano = p.players[chi];
    const manda = async (azione) => {
      const r = await posta('/api/mossa', { codice: c.codice, segreto: segreti[chi], azione });
      r.corpo.ok ? mosse++ : rifiuti++;
      return r.corpo;
    };

    if (!mano.hasDrawnThisTurn) await manda({ tipo: 'pesca' });
    if (stanzaDi(c.codice).partita.status !== 'in_progress') break;

    const perValore = {};
    for (const carta of mano.hand) {
      if (carta.isJolly || carta.isPinella) continue;
      (perValore[carta.value] = perValore[carta.value] || []).push(carta);
    }
    const tris = Object.values(perValore).find((g) => g.length >= 3);
    if (tris) await manda({ tipo: 'cala', carte: tris.slice(0, 3).map((x) => x.id) });

    if (!mano.hand.length) break;
    await manda({ tipo: 'scarta', carta: mano.hand[mano.hand.length - 1].id });
  }

  const finale = stanzaDi(c.codice).partita;
  console.log('   → ' + mosse + ' mosse accettate, ' + rifiuti + ' rifiutate, finale: ' + finale.status);
  check('la partita finisce passando tutta dalla rete', finale.status === 'finished');
  check('e si è giocato sul serio', mosse > 50);

  const reg = (await chiedi('/api/registro?codice=' + c.codice)).corpo;
  check('il registro è scaricabile', reg.mosse.length > 50);
  check('e non contiene i segreti',
    !JSON.stringify(reg).includes(c.segreto) && !JSON.stringify(reg).includes(o.segreto));
}

// ============================================================
console.log('\n--- I FILE ---');
{
  const home = await chiedi('/home.html');
  check('le pagine si servono', home.stato === 200 && /BURRACO LEGENDS/.test(home.testo));
  check('col tipo giusto', /text\/html/.test(home.tipo));
  check('la radice porta alla sala', (await chiedi('/')).stato === 200);

  for (const tentativo of [
    '/../package.json', '/../engine/partita.js', '/..%2fpackage.json',
    '/../../etc/passwd', '/./../server/stanze.js'
  ]) {
    const r = await chiedi(tentativo);
    const fuggito = r.stato === 200 && !/^\s*(<!DOCTYPE|<html)/i.test(r.testo);
    check('non si esce da client/ con "' + tentativo + '"', !fuggito);
  }
  check('un file inesistente risponde 404', (await chiedi('/mai-esistito.html')).stato === 404);
}

// ============================================================
console.log('\n--- IL BORSELLINO PASSA DAL SERVER ---');
{
  const io1 = (await posta('/api/io', { nome: 'Pietro' })).corpo;
  check('alla prima visita si riceve un gettone', typeof io1.gettone === 'string' && io1.gettone.length >= 64);
  check('e si parte col bonus di benvenuto, non da zero', io1.saldo === 36000);
  // niente sharkini in regalo, ma le CARTE sì: senza dotazione iniziale
  // non avrebbe niente con cui scendere in campo
  check('ma con le carte della dotazione iniziale', io1.carteInTutto > 0);
  check('e il premio di oggi da ritirare', io1.premio.puoRitirare === true);

  const ritorno = (await posta('/api/io', { gettone: io1.gettone })).corpo;
  check('tornando col gettone ci si ritrova', ritorno.nuovo === false && ritorno.gettone === io1.gettone);

  // IL TENTATIVO CHE CONTA: comprare senza avere niente
  const scrocco = (await posta('/api/compra', { gettone: io1.gettone, carte: 50 })).corpo;
  check('senza sharkini non si apre nessun pacchetto', scrocco.ok === false);
  check('e si dice quanto manca', scrocco.manca === 108000 - 36000);
  check('l\'album è rimasto vuoto',
    (await posta('/api/io', { gettone: io1.gettone })).corpo.carteInTutto === DI_PARTENZA);

  // e con un gettone inventato
  const finto = (await posta('/api/compra', { gettone: 'z'.repeat(64), carte: 5 })).corpo;
  check('un gettone inventato non compra niente', finto.ok === false);
  const premioFinto = (await posta('/api/premio', { gettone: 'z'.repeat(64) })).corpo;
  check('e non ritira nessun premio', premioFinto.ok === false);

  // il premio, invece, si ritira una volta sola
  const p1 = (await posta('/api/premio', { gettone: io1.gettone })).corpo;
  check('il premio di oggi si ritira', p1.ok === true && p1.guadagno === 100);
  const p2 = (await posta('/api/premio', { gettone: io1.gettone })).corpo;
  check('ma non due volte', p2.ok === false);
  check('e il saldo resta quello (bonus + premio)', p2.saldo === 36000 + 100);

  // ricarico e compro davvero
  await posta('/api/ricarica', { gettone: io1.gettone, offerta: 'borsa' });
  const dopoRicarica = (await posta('/api/io', { gettone: io1.gettone })).corpo;
  check('la ricarica accredita 33.000', dopoRicarica.saldo === 36000 + 100 + 33000);

  const pacco = (await posta('/api/compra', { gettone: io1.gettone, carte: 5 })).corpo;
  check('ora il pacchetto si apre', pacco.ok === true && pacco.carte.length === 5);
  check('il prezzo è stato scalato dal server', pacco.saldo === 36000 + 100 + 33000 - 18000);
  check('le carte sono nell\'album', pacco.carteInTutto === DI_PARTENZA + 5);
  check('e ogni carta ha una rarità vera',
    pacco.carte.every((c) => c.rarita >= 1 && c.rarita <= 5));

  // due giocatori non si toccano
  const io2 = (await posta('/api/io', { nome: 'Amico' })).corpo;
  check('un altro giocatore parte comunque dallo stesso bonus, non da quello del primo',
    io2.saldo === 36000 && io2.carteInTutto === DI_PARTENZA);
  check('e il primo ha ancora le sue cose',
    (await posta('/api/io', { gettone: io1.gettone })).corpo.carteInTutto === DI_PARTENZA + 5);

  // il gettone di uno non serve a guardare l'altro
  check('i due gettoni sono diversi', io1.gettone !== io2.gettone);
}

// ============================================================
console.log('\n--- SI PUÒ CHIEDERE UN PACCHETTO STORTO? ---');
{
  const mio = (await posta('/api/io', { nome: 'Prova' })).corpo;
  await posta('/api/ricarica', { gettone: mio.gettone, offerta: 'montagna' });

  for (const [etichetta, carte] of [
    ['un numero che non è un taglio', 7],
    ['un numero enorme', 999999],
    ['un numero negativo', -5],
    ['zero carte', 0],
    ['una stringa', 'cinquanta'],
    ['niente', undefined],
    ['un decimale', 5.5]
  ]) {
    const r = (await posta('/api/compra', { gettone: mio.gettone, carte })).corpo;
    check(etichetta + ' → rifiutato', r.ok === false);
  }
  const s = (await posta('/api/io', { gettone: mio.gettone })).corpo;
  check('dopo tutti quei tentativi l\'album è ancora vuoto', s.carteInTutto === DI_PARTENZA);
  check('e il saldo è intatto', s.saldo === 36000 + 375000);
}

// ============================================================
// IL MAZZO SCELTO ARRIVA AL TAVOLO, E NON SI PUO' TRUCCARE
//
// In rete le squadre le distribuisce il server, quindi il mazzo va
// spedito quando ci si siede. Ma arriva da un browser: e' l'unico posto
// del gioco dove qualcuno potrebbe scrivere quello che vuole. Il server
// ascolta solo i NOMI delle carte e prende vita, attacco e abilita' dal
// proprio catalogo — mai dal messaggio.
// ============================================================
console.log('\n--- IL MAZZO IN RETE ---');
{
  // mescolato apposta: non coincide con nessuna delle due squadre di prova
  const MIO = {
    personaggi: { '♥': 'personaggio_002', '♦': 'personaggio_003', '♣': 'personaggio_006', '♠': 'personaggio_007' },
    carteMagiche: ['sorpresa_002', 'trappola_001', 'trappola_002']
  };
  const eroiDi = (vista, chi) =>
    Object.fromEntries(Object.entries(vista.giocatori[chi].personaggi).map(([s, c]) => [s, c.cardId]));

  // SI GIOCA SOLO CON LE CARTE CHE SI POSSIEDONO.
  // MIO qui sopra chiede eroi che nessun giocatore nuovo ha (002, 006):
  // e' proprio il tentativo che deve fallire. Chi possiede davvero le
  // sue carte gioca con quelle — e per distinguerlo dalla squadra
  // predefinita lo si fa sedere al SECONDO posto, la cui squadra di
  // ripiego e' un'altra (002/004/006/008).
  const suoDavvero = {
    personaggi: { '♥': 'personaggio_106', '♦': 'personaggio_107', '♣': 'personaggio_105', '♠': 'personaggio_108' },
    carteMagiche: ['sorpresa_101', 'trappola_101', 'trappola_102']
  };
  const tesserato = (await posta('/api/io', { nome: 'Tesserato' })).corpo;

  const casa = (await posta('/api/apri', { nome: 'Pietro', mazzo: MIO })).corpo;   // senza gettone
  await posta('/api/entra', {
    codice: casa.codice, nome: 'Tesserato',
    mazzo: suoDavvero, gettone: tesserato.gettone
  });
  const v = (await chiedi('/api/stato?codice=' + casa.codice + '&segreto=' +
    encodeURIComponent(casa.segreto) + '&da=-1')).corpo.vista;

  check('chi possiede il suo mazzo scende in campo con quello',
    JSON.stringify(eroiDi(v, 1)) === JSON.stringify(suoDavvero.personaggi),
    JSON.stringify(eroiDi(v, 1)));
  check('IL TENTATIVO CHE CONTA: un mazzo di carte che non possiedi non passa',
    JSON.stringify(eroiDi(v, 0)) !== JSON.stringify(MIO.personaggi),
    JSON.stringify(eroiDi(v, 0)));
  check('chi non ha scelto niente ha la squadra predefinita',
    JSON.stringify(eroiDi(v, 0)) === JSON.stringify({
      '♥': 'personaggio_106', '♦': 'personaggio_107', '♠': 'personaggio_108', '♣': 'personaggio_109'
    }));
  check('le statistiche sono quelle vere della carta',
    v.giocatori[1].personaggi['♥'].pvMax === 90 && v.giocatori[1].personaggi['♥'].att === 110);

  // e chi non dice chi e' non porta in campo nessuna Carta Magica: non
  // c'e' una collezione da cui prenderle, e regalarle sarebbe un
  // rubinetto aperto ora che si consumano
  check('senza gettone non si scende in campo con Carte Magiche',
    (v.giocatori[0].magia === null) || (v.giocatori[0].magia.selezione || []).length === 0,
    JSON.stringify(v.giocatori[0].magia));
  // di lui si vede solo QUANTE ne ha: la selezione dell'avversario resta
  // coperta, ed e' giusto che questa vista non la mostri
  check('chi le possiede invece ce le ha',
    v.giocatori[1].magia && v.giocatori[1].magia.selezioneQuante === 3,
    JSON.stringify(v.giocatori[1].magia));

  // ---- e adesso i tentativi di barare ----
  const IMBROGLI = [
    ['quattro volte l\'eroe piu\' forte',
      { personaggi: { '♥': 'personaggio_006', '♦': 'personaggio_006', '♣': 'personaggio_006', '♠': 'personaggio_006' }, carteMagiche: MIO.carteMagiche }],
    ['un eroe che non esiste',
      { personaggi: { ...MIO.personaggi, '♥': 'personaggio_999' }, carteMagiche: MIO.carteMagiche }],
    ['un eroe messo sul seme sbagliato',
      { personaggi: { '♥': 'personaggio_003', '♦': 'personaggio_002', '♣': 'personaggio_006', '♠': 'personaggio_007' }, carteMagiche: MIO.carteMagiche }],
    ['sei Carte Magiche invece di tre',
      { personaggi: MIO.personaggi, carteMagiche: ['sorpresa_001', 'sorpresa_002', 'trappola_001', 'trappola_002', 'trappola_001', 'trappola_002'] }],
    ['un personaggio spacciato per Carta Magica',
      { personaggi: MIO.personaggi, carteMagiche: ['personaggio_002', 'trappola_001', 'trappola_002'] }],
    ['vita e attacco gonfiati dentro il messaggio',
      { personaggi: { ...MIO.personaggi, '♥': { id: 'personaggio_002', vita: 99999, att: 99999 } }, carteMagiche: MIO.carteMagiche }],
    ['un mazzo che non e\' nemmeno un oggetto', 'tutto mio'],
    ['un mazzo vuoto', {}]
  ];

  for (const [come, mazzo] of IMBROGLI) {
    const x = (await posta('/api/apri', { nome: 'Furbo', mazzo })).corpo;
    await posta('/api/entra', { codice: x.codice, nome: 'Vittima' });
    const vx = (await chiedi('/api/stato?codice=' + x.codice + '&segreto=' +
      encodeURIComponent(x.segreto) + '&da=-1')).corpo.vista;
    const suoi = Object.values(vx.giocatori[0].personaggi);
    const pvMassimo = Math.max(...suoi.map((c) => c.pvMax));
    const attMassimo = Math.max(...suoi.map((c) => c.att));
    const quantiDiversi = new Set(suoi.map((c) => c.cardId)).size;
    check(come + ' → non passa',
      pvMassimo <= 200 && attMassimo <= 200 && quantiDiversi === 4 && suoi.length === 4,
      'pv ' + pvMassimo + ', att ' + attMassimo + ', eroi diversi ' + quantiDiversi);
  }
}

// ============================================================
// IL CONTROLLO PIÙ IMPORTANTE DI TUTTO IL FILE, ADESSO.
// Una Carta Magica giocata deve sparire DAVVERO dalla collezione di chi
// la gioca: vale un solo utilizzo. Se questo controllo passa ma la
// carta resta nell'album, le carte diventano infinite e tutto il resto
// non conta niente.
// ============================================================
console.log('\n--- UNA CARTA MAGICA GIOCATA SPARISCE DALL\'ALBUM ---');
{
  const SUO = {
    personaggi: { '♥': 'personaggio_106', '♦': 'personaggio_107', '♣': 'personaggio_105', '♠': 'personaggio_108' },
    carteMagiche: ['sorpresa_101', 'trappola_101', 'trappola_102']
  };
  const chi = (await posta('/api/io', { nome: 'Spendaccione' })).corpo;
  const primaCopie = chi.collezione['sorpresa_101'];
  check('parte con le copie della dotazione', primaCopie > 0);

  const t = (await posta('/api/apri', { nome: 'Spendaccione', mazzo: SUO, gettone: chi.gettone })).corpo;
  const altro = (await posta('/api/entra', { codice: t.codice, nome: 'Altro' })).corpo;

  // Chi comincia lo decide il mazzo: se e' toccato all'altro, gli si fa
  // giocare il suo turno cosi' la mano torna a chi ha le carte vere.
  if (chiMuove(t.codice) !== 0) {
    await posta('/api/mossa', { codice: t.codice, segreto: altro.segreto, azione: { tipo: 'pesca' } });
    await posta('/api/mossa', {
      codice: t.codice, segreto: altro.segreto,
      azione: { tipo: 'scarta', carta: stanzaDi(t.codice).partita.players[1].hand[0].id }
    });
  }

  // adesso tocca a chi ha aperto: gioca la Carta Magica in prima posizione
  const giocata = (await posta('/api/mossa', {
    codice: t.codice, segreto: t.segreto, azione: { tipo: 'magia', indice: 0 }
  })).corpo;
  check('la Carta Magica si gioca senza punti magia', giocata.ok === true, giocata.motivo);

  // il taglio sulla collezione non blocca la partita: si scrive per
  // conto suo. Quindi qui si aspetta, invece di dare per scontato che
  // sia gia' successo.
  let dopo = null;
  for (let i = 0; i < 40 && (dopo === null || dopo === primaCopie); i++) {
    await new Promise((ok) => setTimeout(ok, 25));
    dopo = (await posta('/api/io', { gettone: chi.gettone })).corpo.collezione['sorpresa_101'] || 0;
  }
  check('LA COPIA GIOCATA E\' SPARITA DALL\'ALBUM', dopo === primaCopie - 1,
    'prima ' + primaCopie + ', dopo ' + dopo);

  // e non si rigioca: quel posto e' speso per il resto della partita
  const ancora = (await posta('/api/mossa', {
    codice: t.codice, segreto: t.segreto, azione: { tipo: 'magia', indice: 0 }
  })).corpo;
  check('la stessa carta non si rigioca nella stessa partita', ancora.ok === false);

  const dopoIlRifiuto = (await posta('/api/io', { gettone: chi.gettone })).corpo.collezione['sorpresa_101'] || 0;
  check('e il rifiuto non consuma una seconda copia', dopoIlRifiuto === dopo);

  // chi non dice chi e' non puo' consumare niente di nessuno
  const anonimo = (await posta('/api/apri', { nome: 'Anonimo', mazzo: SUO })).corpo;
  const controparte = (await posta('/api/entra', { codice: anonimo.codice, nome: 'Altro' })).corpo;
  if (chiMuove(anonimo.codice) !== 0) {
    await posta('/api/mossa', { codice: anonimo.codice, segreto: controparte.segreto, azione: { tipo: 'pesca' } });
    await posta('/api/mossa', {
      codice: anonimo.codice, segreto: controparte.segreto,
      azione: { tipo: 'scarta', carta: stanzaDi(anonimo.codice).partita.players[1].hand[0].id }
    });
  }
  const suaMossa = (await posta('/api/mossa', {
    codice: anonimo.codice, segreto: anonimo.segreto, azione: { tipo: 'magia', indice: 0 }
  })).corpo;
  check('senza gettone non ci sono Carte Magiche da giocare', suaMossa.ok === false);
  check('e l\'album di chi le possiede non e\' stato toccato',
    ((await posta('/api/io', { gettone: chi.gettone })).corpo.collezione['sorpresa_101'] || 0) === dopo);
}

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
server.close();
process.exit(ko === 0 ? 0 : 1);
