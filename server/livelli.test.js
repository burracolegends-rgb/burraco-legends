// ============================================================
// BURRACO LEGENDS — IL LIVELLO RANKED
//
// Un server vero (come server.test.js) per le regole che dipendono da
// come nasce una stanza (/api/siediti contro /api/apri+/api/entra) e da
// una partita vera che finisce; la matematica dell'ELO in isolamento,
// per non dover giocare una mano intera solo per verificare un numero.
// ============================================================
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MAGAZZINO = process.env.MAGAZZINO || join(tmpdir(), 'burraco-legends-livelli.json');
process.env.NON_AVVIARE = '1';
process.env.STUDIO_SECONDI = '0';

const { server, stanze } = await import('./server.js');
import { creaLivelli, livelloDaRating, RATING_INIZIALE,
         K_FATTORE_INIZIALE, K_FATTORE, PARTITE_ASSESTAMENTO, kFattoreDi } from './livelli.js';
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
const gettoneFinto = () => 'g_' + Math.random().toString(36).slice(2);
const registrato = async (nome) => {
  const email = 'prova_' + Math.random().toString(36).slice(2) + '@esempio.it';
  const r = (await posta('/api/registrati', { email, password: 'BurracoProva#42', nome })).corpo;
  if (!r.ok) throw new Error('registrazione di prova fallita: ' + r.motivo);
  return r.gettone;
};
const abbandona = (codice, segreto) => posta('/api/mossa', { codice, segreto, azione: { tipo: 'abbandona' } });
const livelloDi = (gettone) => posta('/api/livello', { gettone }).then((r) => r.corpo);

// Siede due gettoni allo stesso tavolo pubblico via /api/siediti: il
// primo apre, il secondo lo riempie. Stessa sequenza usata da
// missioni.test.js per "sedersi con uno sconosciuto".
async function sediliInsieme(gettoneA, gettoneB) {
  const a = (await posta('/api/siediti', { gettone: gettoneA })).corpo;
  const b = (await posta('/api/siediti', { gettone: gettoneB })).corpo;
  return { a, b };
}

// ============================================================
console.log('--- SOLO "SFIDA UNO SCONOSCIUTO" TOCCA IL LIVELLO ---');
{
  const gA = await registrato('Aldo'), gB = await registrato('Bice');
  const primaA = await livelloDi(gA), primaB = await livelloDi(gB);
  check('chi non ha mai giocato una ranked ha il rating di partenza',
    primaA.rating === RATING_INIZIALE && primaA.livello === livelloDaRating(RATING_INIZIALE));

  // Un tavolo aperto con un codice per un amico: stessa partita vera,
  // ma NON deve toccare il livello di nessuno dei due.
  const apertoA = (await posta('/api/apri', { gettone: gA })).corpo;
  await posta('/api/entra', { codice: apertoA.codice, gettone: gB });
  check('la stanza aperta con un codice NON è segnata da classifica',
    !stanze.stanza(apertoA.codice).daClassifica);
  await abbandona(apertoA.codice, apertoA.segreto);
  const dopoAmichevole = await livelloDi(gA);
  check('e infatti il rating di chi ha abbandonato una partita fra amici resta invariato',
    dopoAmichevole.rating === RATING_INIZIALE, JSON.stringify(dopoAmichevole));

  // Sedersi con uno sconosciuto invece sì: stessa dinamica, porta diversa.
  const { a: ranked } = await sediliInsieme(gA, gB);
  check('questa stanza invece È segnata da classifica', !!stanze.stanza(ranked.codice).daClassifica);
  await abbandona(ranked.codice, ranked.segreto);   // A abbandona: A perde, B vince

  const dopoA = await livelloDi(gA), dopoB = await livelloDi(gB);
  check('chi perde una ranked scende sotto il rating di partenza',
    dopoA.rating < RATING_INIZIALE, JSON.stringify(dopoA));
  check('chi vince sale sopra il rating di partenza',
    dopoB.rating > RATING_INIZIALE, JSON.stringify(dopoB));
  // Con due rating di partenza uguali (1000 contro 1000) l'atteso è 0.5
  // per entrambi. Prima partita per tutti e due: K_FATTORE_INIZIALE
  // (40, sotto PARTITE_ASSESTAMENTO), non il K a regime — sposta il
  // perdente a 1000+40*(0-0.5)=980 e il vincitore a 1000+40*(1-0.5)=1020.
  check('la prima partita di ciascuno usa il K iniziale, più alto (assestamento veloce)',
    dopoA.rating === 1000 + K_FATTORE_INIZIALE * (0 - 0.5) &&
    dopoB.rating === 1000 + K_FATTORE_INIZIALE * (1 - 0.5),
    'A=' + dopoA.rating + ' B=' + dopoB.rating);
  check('la partita conta anche nelle statistiche (partite/sconfitte/vittorie)',
    dopoA.partite === 1 && dopoA.sconfitte === 1 && dopoB.partite === 1 && dopoB.vittorie === 1);
}

// ============================================================
console.log('\n--- UN OSPITE NON HA UN LIVELLO CHE RESTA ---');
{
  const gReg = await registrato('Clara'), gOspite = gettoneFinto();
  const { a } = await sediliInsieme(gReg, gOspite);
  const primaReg = await livelloDi(gReg);
  await abbandona(a.codice, a.segreto);   // il registrato abbandona: perde contro l'ospite

  const dopoReg = await livelloDi(gReg), dopoOspite = await livelloDi(gOspite);
  check('il lato registrato aggiorna comunque il proprio rating (contro un rating neutro)',
    dopoReg.rating < primaReg.rating, JSON.stringify(dopoReg));
  check('l\'ospite non ha nessun rating salvato: legge sempre il valore di partenza',
    dopoOspite.rating === RATING_INIZIALE);

  // Due ospiti: nessuno dei due ha un livello da tenere, non si scrive niente.
  const g1 = gettoneFinto(), g2 = gettoneFinto();
  const { a: soloOspiti } = await sediliInsieme(g1, g2);
  await abbandona(soloOspiti.codice, soloOspiti.segreto);
  check('due ospiti l\'uno contro l\'altro: nessun rating da nessuna parte',
    (await livelloDi(g1)).rating === RATING_INIZIALE && (await livelloDi(g2)).rating === RATING_INIZIALE);
}

// ============================================================
console.log('\n--- UNA PARTITA SI CONTA UNA VOLTA SOLA ---');
{
  const gA = await registrato('Dino'), gB = await registrato('Elsa');
  const { a } = await sediliInsieme(gA, gB);
  await abbandona(a.codice, a.segreto);
  const dopoUnaVolta = await livelloDi(gA);

  // Una mossa in più sulla stessa stanza, ormai finita: registraSeFinita
  // deve accorgersi che l'ha già processata (stanza.livelloRegistrato) e
  // non ricalcolare da capo — altrimenti il rating continuerebbe a
  // scendere ad ogni tentativo di mossa dopo la fine.
  await posta('/api/mossa', { codice: a.codice, segreto: a.segreto, azione: { tipo: 'abbandona' } });
  const dopoDueVolte = await livelloDi(gA);
  check('un secondo tentativo di mossa a partita già finita non tocca di nuovo il rating',
    dopoDueVolte.rating === dopoUnaVolta.rating,
    dopoUnaVolta.rating + ' vs ' + dopoDueVolte.rating);
}

// ============================================================
console.log('\n--- IL K-FATTORE CAMBIA DOPO LE PRIME PARTITE ---');
{
  check('sotto la soglia di assestamento si usa il K iniziale, più alto',
    kFattoreDi(0) === K_FATTORE_INIZIALE && kFattoreDi(PARTITE_ASSESTAMENTO - 1) === K_FATTORE_INIZIALE);
  check('dalla soglia in poi si usa il K a regime, più basso',
    kFattoreDi(PARTITE_ASSESTAMENTO) === K_FATTORE && kFattoreDi(PARTITE_ASSESTAMENTO + 50) === K_FATTORE);

  // Furio gioca (e perde) PARTITE_ASSESTAMENTO partite ranked di fila:
  // da qui in avanti ogni sua partita deve muovere il rating con lo
  // stesso passo più piccolo di un giocatore esperto, non con quello
  // di un debuttante.
  const gFurio = await registrato('Furio');
  for (let i = 0; i < PARTITE_ASSESTAMENTO; i++) {
    const { a } = await sediliInsieme(gFurio, gettoneFinto());
    await abbandona(a.codice, a.segreto);
  }
  const primaDellaDecima = await livelloDi(gFurio);
  check('dopo PARTITE_ASSESTAMENTO partite, ne ha registrate esattamente tante',
    primaDellaDecima.partite === PARTITE_ASSESTAMENTO, JSON.stringify(primaDellaDecima));

  const { a: undicesima } = await sediliInsieme(gFurio, gettoneFinto());
  await abbandona(undicesima.codice, undicesima.segreto);   // perde ancora
  const dopoLUndicesima = await livelloDi(gFurio);
  const spostamentoAtteso = Math.round(K_FATTORE * (0 - atteso(primaDellaDecima.rating, RATING_INIZIALE)));
  check('l\'undicesima partita si muove del passo piccolo (K a regime), non di quello iniziale',
    dopoLUndicesima.rating === primaDellaDecima.rating + spostamentoAtteso,
    'atteso ' + (primaDellaDecima.rating + spostamentoAtteso) + ', ottenuto ' + dopoLUndicesima.rating);
}
function atteso(ratingMio, ratingSuo) { return 1 / (1 + Math.pow(10, (ratingSuo - ratingMio) / 400)); }

// ============================================================
console.log('\n--- IN ISOLAMENTO: LA FORMULA ---');
{
  check('livelloDaRating(1000) = 15 (il numero che stava scritto a mano in home.html)',
    livelloDaRating(1000) === 15);
  check('un rating più alto dà un livello più alto', livelloDaRating(1400) > livelloDaRating(1000));
  check('il livello non scende mai sotto 1, qualunque sia il rating', livelloDaRating(0) >= 1);

  // Un pareggio (mazzo esaurito a PV pari, engine/partita.js) non è né
  // vittoria né sconfitta: entrambi i lati restano fermi se avevano lo
  // stesso rating di partenza — atteso 0.5, punteggio 0.5, differenza 0.
  const archivioFinto = archivioInMemoria();
  const stanzeFinte = {
    stanza: () => ({
      daClassifica: true,
      partita: { status: 'finished', winner: null },
      posti: [{ gettone: 'g_pareggioA' }, { gettone: 'g_pareggioB' }]
    })
  };
  const livelliFinti = creaLivelli({ archivio: archivioFinto, stanze: stanzeFinte, eRegistrato: async () => true });
  const risultato = await livelliFinti.registraSeFinita('QUALSIASI');
  check('un pareggio fra due rating uguali non muove il rating di nessuno dei due',
    risultato.every((r) => r.prima === r.dopo), JSON.stringify(risultato));
}

// ============================================================
server.close();
console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
if (ko > 0) process.exit(1);
