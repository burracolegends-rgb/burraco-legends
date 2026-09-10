// ============================================================
// BURRACO LEGENDS — IL PASS STAGIONALE
//
// Un server vero (come server.test.js) per i punti che nascono da una
// partita vera che finisce; la matematica dei livelli e dei premi in
// isolamento, per non dover giocare decine di partite solo per salire
// di livello.
// ============================================================
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MAGAZZINO = process.env.MAGAZZINO || join(tmpdir(), 'burraco-legends-stagione.json');
process.env.NON_AVVIARE = '1';
process.env.STUDIO_SECONDI = '0';

const { server, stanze } = await import('./server.js');
import { creaStagione, PUNTI_PARTITA, PUNTI_VITTORIA_BONUS, PUNTI_MISSIONE_BONUS,
         PUNTI_ACCESSO_GIORNALIERO, PUNTI_PER_LIVELLO, LIVELLI_TOTALI } from './stagione.js';
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
const progresso = (gettone) => posta('/api/stagione', { gettone }).then((r) => r.corpo);
const abbandona = (codice, segreto) => posta('/api/mossa', { codice, segreto, azione: { tipo: 'abbandona' } });

async function sediliInsieme(gettoneA, gettoneB) {
  const a = (await posta('/api/siediti', { gettone: gettoneA })).corpo;
  const b = (await posta('/api/siediti', { gettone: gettoneB })).corpo;
  return { a, b };
}

// ============================================================
console.log('--- SOLO CHI È REGISTRATO ACCUMULA PUNTI ---');
{
  const gOspite = gettoneFinto();
  const primaOspite = await progresso(gOspite);
  check('un ospite vede comunque la tabella dei premi',
    primaOspite.ok === true && primaOspite.registrato === false && !!primaOspite.tabella[10]);
  check('ma resta sempre a punti zero, livello 1',
    primaOspite.punti === 0 && primaOspite.livello === 1);

  const { a, b } = await sediliInsieme(gOspite, gettoneFinto());
  await abbandona(a.codice, a.segreto);
  const dopoOspite = await progresso(gOspite);
  check('anche dopo una partita vera, un ospite resta a punti zero',
    dopoOspite.punti === 0, JSON.stringify(dopoOspite));
}

// ============================================================
console.log('\n--- OGNI PARTITA VERA (SIEDITI O CODICE) DÀ PUNTI ---');
{
  const gA = await registrato('Aldo'), gB = await registrato('Bice');
  // La prima chiamata di /api/stagione della giornata dà ANCHE il
  // punto di accesso giornaliero (vedi la sezione dedicata più sotto):
  // qui interessano solo i punti-partita, quindi si "consuma" subito
  // quel bonus per i due account di prova, e da qui in avanti ogni
  // differenza è dovuta solo alle partite.
  const baseA = (await progresso(gA)).punti, baseB = (await progresso(gB)).punti;

  // Una partita fra amici, con un codice: qui (a differenza del
  // livello ranked) conta lo stesso.
  const apertoA = (await posta('/api/apri', { gettone: gA })).corpo;
  await posta('/api/entra', { codice: apertoA.codice, gettone: gB });
  await abbandona(apertoA.codice, apertoA.segreto);   // A abbandona: A perde, B vince

  const dopoA = await progresso(gA), dopoB = await progresso(gB);
  check('chi perde riceve comunque i punti-partita',
    dopoA.punti === baseA + PUNTI_PARTITA, JSON.stringify(dopoA));
  check('chi vince riceve i punti-partita più il bonus vittoria',
    dopoB.punti === baseB + PUNTI_PARTITA + PUNTI_VITTORIA_BONUS, JSON.stringify(dopoB));

  // Una seconda partita, stavolta da "Sfida uno sconosciuto": i punti
  // di A si sommano a quelli di prima, nella stessa stagione.
  const { a: ranked } = await sediliInsieme(gA, gettoneFinto());
  await abbandona(ranked.codice, ranked.segreto);   // A abbandona di nuovo: perde
  const dopoSeconda = await progresso(gA);
  check('i punti di partite diverse, nella stessa stagione, si sommano',
    dopoSeconda.punti === baseA + PUNTI_PARTITA * 2,
    dopoSeconda.punti + ' atteso ' + (baseA + PUNTI_PARTITA * 2));
}

// ============================================================
console.log('\n--- LA MISSIONE DEL GIORNO DÀ UN BONUS IN PIÙ ---');
{
  const gettone = await registrato('Clara');
  const prima = await progresso(gettone);

  const ini = (await posta('/api/missione/inizia', { gettone })).corpo;
  check('la Missione apre un tavolo vero', ini.ok === true && !!ini.codice);
  await abbandona(ini.codice, ini.segreto);   // si perde, ma la Missione conta comunque

  const dopo = await progresso(gettone);
  check('i punti della Missione sono partita + bonus missione (non solo partita)',
    dopo.punti === prima.punti + PUNTI_PARTITA + PUNTI_MISSIONE_BONUS,
    'prima=' + prima.punti + ' dopo=' + dopo.punti);
}

// ============================================================
console.log('\n--- UNA PARTITA SI CONTA UNA VOLTA SOLA ---');
{
  const gA = await registrato('Dino'), gB = await registrato('Elsa');
  const { a } = await sediliInsieme(gA, gB);
  await abbandona(a.codice, a.segreto);
  const dopoUnaVolta = await progresso(gA);

  await posta('/api/mossa', { codice: a.codice, segreto: a.segreto, azione: { tipo: 'abbandona' } });
  const dopoDueVolte = await progresso(gA);
  check('una mossa in più su una stanza già finita non raddoppia i punti',
    dopoDueVolte.punti === dopoUnaVolta.punti);
}

// ============================================================
console.log('\n--- L\'ACCESSO GIORNALIERO SI DÀ UNA VOLTA AL GIORNO ---');
{
  const gettone = await registrato('Furio');
  // Un account appena nato: la primissima chiamata a /api/stagione
  // vale già come "sei entrato oggi", non serve nessun tasto apposta.
  const primaChiamata = await progresso(gettone);
  check('la primissima chiamata del giorno dà già il punto di accesso',
    primaChiamata.punti === PUNTI_ACCESSO_GIORNALIERO, JSON.stringify(primaChiamata));

  const secondaChiamata = await progresso(gettone);
  check('e non una seconda volta, lo stesso giorno',
    secondaChiamata.punti === primaChiamata.punti);
}

// ============================================================
console.log('\n--- IN ISOLAMENTO: LIVELLI, PREMI, RIPIEGO SULLA TABELLA ---');
{
  const archivioFinto = archivioInMemoria();
  const anagrafeFinta = creaAnagrafe({
    archivio: archivioFinto, catalogo: [
      { id: 'carta_1_0', seme: '♥', rarita: 1, tipo: 'personaggio', vita: 100, att: 50 },
      { id: 'carta_1_1', seme: '♦', rarita: 1, tipo: 'personaggio', vita: 100, att: 50 },
      { id: 'carta_1_2', seme: '♣', rarita: 1, tipo: 'personaggio', vita: 100, att: 50 },
      { id: 'carta_1_3', seme: '♠', rarita: 1, tipo: 'personaggio', vita: 100, att: 50 },
      { id: 'carta_2_0', seme: '♥', rarita: 1, tipo: 'sorpresa' }
    ],
    // Niente bonus di benvenuto/coda garantita: userebbero ID veri
    // (personaggio_106...) che questo catalogo finto non ha, e
    // regalaPacchetto andrebbe a cercarli invano — stesso motivo per
    // cui giocatori.test.js li spegne ogni volta che usa un catalogo
    // finto piccolo come questo.
    bonusBenvenuto: 0, codaBenvenuto: []
  });
  const stanzeFinte = { stanza: () => null };   // qui non serve nessuna partita vera
  const stagioneFinta = creaStagione({
    archivio: archivioFinto, stanze: stanzeFinte, anagrafe: anagrafeFinta,
    eRegistrato: async () => true,
    orologio: () => Date.parse('2026-09-10T10:00:00+02:00')   // dentro la Stagione 1
  });

  const gettone = 'g_prova_livelli';
  const nuovo = await anagrafeFinta.entra(gettone, 'Prova');
  check('siamo nella Stagione 1 (l\'epoca del modulo)',
    (await stagioneFinta.progressoDi(nuovo.gettone)).numero === 1);

  // 250 punti: livello 1 + floor(250/100) = livello 3. I premi dei
  // livelli 2 e 3 devono arrivare insieme, in un colpo solo.
  await archivioFinto.scrivi('stagione:1:' + nuovo.gettone, { punti: 250, livelloRiscosso: 1, ultimoAccessoGiorno: null });
  const primaSaldo = (await anagrafeFinta.stato(nuovo.gettone)).saldo;
  const r = await stagioneFinta.progressoDi(nuovo.gettone);
  check('250 punti valgono livello 3 (1 + floor(250/100))', r.livello === 3, JSON.stringify(r));
  check('sono arrivati i premi di ENTRAMBI i livelli attraversati (2 e 3)',
    r.premiAppenaSbloccati.length === 2 &&
    r.premiAppenaSbloccati[0].livello === 2 && r.premiAppenaSbloccati[1].livello === 3,
    JSON.stringify(r.premiAppenaSbloccati));
  const dopoSaldo = (await anagrafeFinta.stato(nuovo.gettone)).saldo;
  check('il premio in sharkini del livello 2 è arrivato per davvero sul conto',
    dopoSaldo > primaSaldo, primaSaldo + ' -> ' + dopoSaldo);

  const rSecondaVolta = await stagioneFinta.progressoDi(nuovo.gettone);
  check('richiedendo di nuovo lo stesso progresso, nessun premio si ripete',
    rSecondaVolta.premiAppenaSbloccati.length === 0);

  // Livello 10 = skin del tavolo, non sharkini o pacchetto.
  await archivioFinto.scrivi('stagione:1:' + nuovo.gettone, { punti: 900, livelloRiscosso: 9, ultimoAccessoGiorno: null });
  await stagioneFinta.progressoDi(nuovo.gettone);
  const conSkin = await anagrafeFinta.stato(nuovo.gettone);
  check('il livello 10 sblocca davvero la skin "blu" sull\'account',
    conSkin.skinTavoloSbloccate.includes('blu'), JSON.stringify(conSkin.skinTavoloSbloccate));

  check('il livello non supera mai il totale (30), qualunque sia il punteggio',
    stagioneFinta.livelloDaPunti(999999) === LIVELLI_TOTALI);

  // Una stagione futura, mai scritta a mano: deve ripiegare sulla
  // tabella dell'ultima definita invece di rompersi.
  const stagioneLontana = creaStagione({
    archivio: archivioInMemoria(), stanze: stanzeFinte, anagrafe: anagrafeFinta,
    eRegistrato: async () => true,
    orologio: () => Date.parse('2030-01-01T00:00:00+01:00')
  });
  const rLontana = await stagioneLontana.progressoDi('g_altro', Date.parse('2030-01-01T00:00:00+01:00'));
  check('una stagione senza tabella scritta a mano usa comunque l\'ultima esistente',
    rLontana.ok === true && !!rLontana.tabella[10] && rLontana.numero > 1);
}

// ============================================================
server.close();
console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
if (ko > 0) process.exit(1);
