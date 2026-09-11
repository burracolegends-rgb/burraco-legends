// ============================================================
// BURRACO LEGENDS — GUARDA UNA PUBBLICITÀ, GUADAGNA SHARKINI
//
// Un server vero (come server.test.js) per il tetto giornaliero e
// l'accredito; il cambio di giorno in isolamento, con un orologio
// finto, per non dover aspettare una mezzanotte vera.
// ============================================================
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MAGAZZINO = process.env.MAGAZZINO || join(tmpdir(), 'burraco-legends-pubblicita.json');
process.env.NON_AVVIARE = '1';

const { server } = await import('./server.js');
import { creaPubblicita, SHARKINI_PER_PUBBLICITA, PUBBLICITA_MASSIME_AL_GIORNO } from './pubblicita.js';
import { archivioInMemoria } from './archivio.js';
import { creaAnagrafe } from './giocatori.js';

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
const gettoneFinto = () => 'g_' + Math.random().toString(36).slice(2);
const registrato = async (nome) => {
  const email = 'prova_' + Math.random().toString(36).slice(2) + '@esempio.it';
  const r = (await posta('/api/registrati', { email, password: 'BurracoProva#42', nome })).corpo;
  if (!r.ok) throw new Error('registrazione di prova fallita: ' + r.motivo);
  return r.gettone;
};
const saldoDi = (gettone) => posta('/api/io', { gettone }).then((r) => r.corpo.saldo);

// ============================================================
console.log('--- UN OSPITE NON PUÒ GUADAGNARE SHARKINI CON LE PUBBLICITÀ ---');
{
  const gOspite = gettoneFinto();
  const suoStato = (await posta('/api/pubblicita/stato', { gettone: gOspite })).corpo;
  check('un ospite vede il meccanismo (quante ne restano, quanto vale) ma non è registrato',
    suoStato.ok === true && suoStato.registrato === false && suoStato.visteMassime === PUBBLICITA_MASSIME_AL_GIORNO);

  const tentativo = (await posta('/api/pubblicita/guarda', { gettone: gOspite })).corpo;
  check('e non riceve nulla provando a guardarne una',
    tentativo.ok === false && tentativo.serveRegistrazione === true, JSON.stringify(tentativo));
}

// ============================================================
console.log('\n--- CHI È REGISTRATO GUADAGNA SHARKINI VERI, FINO AL TETTO ---');
{
  const gettone = await registrato('Ada');
  const primaSaldo = await saldoDi(gettone);

  const prima = (await posta('/api/pubblicita/guarda', { gettone })).corpo;
  check('la prima pubblicità del giorno viene accettata',
    prima.ok === true && prima.accreditati === SHARKINI_PER_PUBBLICITA && prima.visteOggi === 1,
    JSON.stringify(prima));

  const dopoSaldo = await saldoDi(gettone);
  check('gli sharkini sono arrivati per davvero sul conto',
    dopoSaldo === primaSaldo + SHARKINI_PER_PUBBLICITA, primaSaldo + ' -> ' + dopoSaldo);

  // Le altre, fino al tetto (già una fatta, ne mancano PUBBLICITA_MASSIME_AL_GIORNO - 1).
  for (let i = 2; i <= PUBBLICITA_MASSIME_AL_GIORNO; i++) {
    const r = (await posta('/api/pubblicita/guarda', { gettone })).corpo;
    check('la pubblicità numero ' + i + ' (dentro il tetto) viene accettata',
      r.ok === true && r.visteOggi === i, JSON.stringify(r));
  }

  const oltreIlTetto = (await posta('/api/pubblicita/guarda', { gettone })).corpo;
  check('oltre il tetto giornaliero, viene rifiutata',
    oltreIlTetto.ok === false && !oltreIlTetto.serveRegistrazione, JSON.stringify(oltreIlTetto));

  const saldoFinale = await saldoDi(gettone);
  check('il tentativo rifiutato non ha accreditato nulla in più',
    saldoFinale === primaSaldo + SHARKINI_PER_PUBBLICITA * PUBBLICITA_MASSIME_AL_GIORNO,
    primaSaldo + ' + ' + PUBBLICITA_MASSIME_AL_GIORNO + '× ' + SHARKINI_PER_PUBBLICITA + ' atteso, ottenuto ' + saldoFinale);

  const statoFinale = (await posta('/api/pubblicita/stato', { gettone })).corpo;
  check('/stato riflette il tetto raggiunto, senza bisogno di provare a guardarne un\'altra',
    statoFinale.visteOggi === PUBBLICITA_MASSIME_AL_GIORNO);
}

// ============================================================
console.log('\n--- IN ISOLAMENTO: IL GIORNO DOPO IL TETTO SI RIALZA ---');
{
  let ORA = Date.parse('2026-09-10T10:00:00+02:00');
  const archivioFinto = archivioInMemoria();
  const anagrafeFinta = creaAnagrafe({
    archivio: archivioFinto, catalogo: [{ id: 'carta_1_0', seme: '♥', rarita: 1, vita: 100, att: 50 }],
    orologio: () => ORA, bonusBenvenuto: 0, codaBenvenuto: []
  });
  const pubblicitaFinta = creaPubblicita({
    archivio: archivioFinto, anagrafe: anagrafeFinta, eRegistrato: async () => true, orologio: () => ORA
  });

  const { gettone } = await anagrafeFinta.entra(null, 'Prova');
  for (let i = 0; i < PUBBLICITA_MASSIME_AL_GIORNO; i++) await pubblicitaFinta.guarda(gettone);
  const esaurito = await pubblicitaFinta.guarda(gettone);
  check('esaurito il tetto di oggi', esaurito.ok === false);

  ORA = Date.parse('2026-09-11T10:00:00+02:00');   // il giorno dopo
  const domani = await pubblicitaFinta.guarda(gettone);
  check('il giorno dopo il tetto è di nuovo disponibile, da capo',
    domani.ok === true && domani.visteOggi === 1, JSON.stringify(domani));
}

// ============================================================
server.close();
console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
if (ko > 0) process.exit(1);
