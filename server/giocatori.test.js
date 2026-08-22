// La domanda di questo file è una sola: dal browser si può imbrogliare?
// Ogni controllo qui sotto è un tentativo di ottenere qualcosa senza
// averne diritto — sharkini che non ho guadagnato, carte che non ho
// pagato, premi ritirati due volte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archivioInMemoria, archivioSuFile } from './archivio.js';
import { creaAnagrafe } from './giocatori.js';
import { OFFERTE, SOGLIA_PITY } from '../engine/pacchetti.js';
import { PREMI_SETTIMANA, RICARICHE } from '../engine/sharkini.js';
import { dotazioneIniziale } from '../engine/dotazione.js';

let ko = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) ko++; };

// Nessuno parte più con l'album vuoto: alla nascita si riceve una
// dotazione di carte (engine/dotazione.js), altrimenti non si potrebbe
// scendere in campo — ora che si gioca solo con le carte che si
// possiedono. I conti qui sotto partono da lì invece che da zero, così
// restano giusti anche se domani la dotazione cambia.
const DI_PARTENZA = Object.values(dotazioneIniziale()).reduce((a, b) => a + b, 0);

const GIORNO = 86400000;
let ORA = Date.parse('2026-08-14T12:00:00Z');
const avanti = (ms) => (ORA += ms);

// un catalogo finto ma con tutte le rarità, così le estrazioni hanno senso
const CATALOGO = [];
for (let r = 1; r <= 5; r++) {
  for (let i = 0; i < 6; i++) CATALOGO.push({ id: 'carta_' + r + '_' + i, rarita: r, seme: '♥', vita: 100, att: 90 });
}

function casoFisso(seme) {
  let x = seme >>> 0;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

const nuovaAnagrafe = (archivio = archivioInMemoria()) =>
  creaAnagrafe({ archivio, catalogo: CATALOGO, orologio: () => ORA, caso: casoFisso(7) });

// ============================================================
console.log('--- CHI SEI ---');
{
  const a = nuovaAnagrafe();
  const primo = await a.entra(null, 'Pietro');
  check('alla prima visita si riceve un gettone', typeof primo.gettone === 'string' && primo.gettone.length >= 64);
  check('ed è un giocatore nuovo', primo.nuovo === true);
  check('che parte da zero sharkini', primo.giocatore.serie.saldo === 0);
  check('ma con le carte della dotazione iniziale, non con l\'album vuoto',
    Object.keys(primo.giocatore.collezione).length > 0 && primo.giocatore.dotazioneRicevuta === true);

  const ritorno = await a.entra(primo.gettone);
  check('tornando col proprio gettone ci si ritrova', ritorno.nuovo === false);
  check('ed è lo stesso gettone', ritorno.gettone === primo.gettone);
  check('col nome di prima', ritorno.giocatore.nome === 'Pietro');

  // il tentativo che conta: presentarsi con un gettone scelto da sé
  const finto = await a.entra('x'.repeat(64), 'Furbo');
  check('un gettone inventato non viene registrato', finto.gettone !== 'x'.repeat(64));
  check('e chi lo porta riceve un gettone suo, nuovo', finto.nuovo === true);
  check('quindi non può scegliersi un\'identità',
    (await a.stato('x'.repeat(64))).ok === false);

  check('un gettone corto non apre niente', (await a.stato('abc')).ok === false);
  check('e nemmeno nessun gettone', (await a.stato(null)).ok === false);

  const secondo = await a.entra(null, 'Amico');
  check('due giocatori hanno gettoni diversi', secondo.gettone !== primo.gettone);
  check('e l\'anagrafe li conta entrambi', (await a.quanti()) === 3);
}

// ============================================================
console.log('\n--- IL PREMIO NON SI RITIRA DUE VOLTE ---');
{
  const a = nuovaAnagrafe();
  const { gettone } = await a.entra(null, 'P');

  const primo = await a.ritiraIlPremio(gettone);
  check('il primo giorno dà 100', primo.ok === true && primo.guadagno === PREMI_SETTIMANA[0]);
  check('e il saldo sale', primo.saldo === 100);

  const bis = await a.ritiraIlPremio(gettone);
  check('lo stesso giorno non si ritira di nuovo', bis.ok === false);
  check('e il saldo non si muove', bis.saldo === 100);

  // e nemmeno chiamando cento volte di fila
  for (let i = 0; i < 100; i++) await a.ritiraIlPremio(gettone);
  check('nemmeno insistendo cento volte', (await a.stato(gettone)).saldo === 100);

  avanti(GIORNO);
  const domani = await a.ritiraIlPremio(gettone);
  check('il giorno dopo sì, e vale 200', domani.ok === true && domani.guadagno === 200);
  check('la serie è al giorno 2', domani.premio.giaRitiratoOggi === true);

  // sette giorni in tutto
  for (let g = 3; g <= 7; g++) { avanti(GIORNO); await a.ritiraIlPremio(gettone); }
  check('sette giorni di fila fanno 2.800', (await a.stato(gettone)).saldo === 2800);

  avanti(3 * GIORNO);                                   // salta due giorni
  const dopoIlSalto = await a.ritiraIlPremio(gettone);
  check('chi salta un giorno riparte da 100', dopoIlSalto.guadagno === 100);
  check('e il server lo dice', dopoIlSalto.serieRotta === true);
  check('ma non gli toglie quello che aveva', dopoIlSalto.saldo === 2900);
}

// ============================================================
console.log('\n--- I PACCHETTI SI PAGANO ---');
{
  const a = nuovaAnagrafe();
  const { gettone } = await a.entra(null, 'P');

  const senzaSoldi = await a.compraPacchetto(gettone, 5);
  check('a saldo zero non si compra niente', senzaSoldi.ok === false);
  check('e si dice quanto manca', senzaSoldi.manca === 18000);
  check('l\'album resta quello di partenza', (await a.stato(gettone)).carteInTutto === DI_PARTENZA);

  const inventato = await a.compraPacchetto(gettone, 7);
  check('un taglio che non esiste viene rifiutato', inventato.ok === false);
  const assurdo = await a.compraPacchetto(gettone, 999999);
  check('nemmeno chiedendo un pacchetto gigante', assurdo.ok === false);
  const negativo = await a.compraPacchetto(gettone, -5);
  check('nemmeno con un numero negativo', negativo.ok === false);

  // gli do di che comprare, dalla porta giusta
  await a.ricarica(gettone, 'borsa');                   // 5,00 € → 33.000
  const saldoPrima = (await a.stato(gettone)).saldo;
  check('la ricarica accredita 33.000', saldoPrima === 33000);

  const comprato = await a.compraPacchetto(gettone, 5);
  check('ora il pacchetto si apre', comprato.ok === true);
  check('e sono uscite 5 carte', comprato.carte.length === 5);
  check('il prezzo è stato scalato', comprato.saldo === saldoPrima - 18000);
  check('le carte sono finite nell\'album', comprato.carteInTutto === DI_PARTENZA + 5);
  check('e ogni carta esiste nel catalogo',
    comprato.carte.every((c) => CATALOGO.some((x) => x.id === c.carta.id)));
  check('la garanzia ha contato le carte aperte', comprato.contatorePity === 5);

  // 33.000 bastano per un pacchetto da 5 solo: il secondo lo prendo
  // più piccolo, sennò è il saldo a fermarmi e non provo niente
  const secondo = await a.compraPacchetto(gettone, 3);
  check('il secondo pacchetto scala di nuovo', secondo.saldo === saldoPrima - 18000 - 12000);
  check('e l\'album cresce', secondo.carteInTutto === DI_PARTENZA + 8);

  const terzo = await a.compraPacchetto(gettone, 5);
  check('finiti gli sharkini non si compra più', terzo.ok === false);
  check('e il saldo è rimasto quello', (await a.stato(gettone)).saldo === 3000);
  check('l\'album non è cresciuto', (await a.stato(gettone)).carteInTutto === DI_PARTENZA + 8);
}

// ============================================================
console.log('\n--- LE CARTE LE ESTRAE IL SERVER ---');
{
  const a = nuovaAnagrafe();
  const { gettone } = await a.entra(null, 'P');
  await a.ricarica(gettone, 'montagna');                // 50 € → 375.000

  // il browser non ha modo di chiedere una carta in particolare:
  // compraPacchetto prende solo il numero di carte, e basta
  const r = await a.compraPacchetto(gettone, 50);
  check('un pacchetto da 50 dà 50 carte', r.carte.length === 50);
  // la garanzia scatta ogni SOGLIA_PITY carte (60): a 50 non è ancora ora
  check('a 50 carte la garanzia non è ancora scattata', r.pityScattato === false);
  console.log('   → nel pacchetto da 50: ' +
    [5, 4, 3, 2, 1].map((s) => s + '★:' + r.carte.filter((c) => c.rarita === s).length).join('  '));

  const ancora = await a.compraPacchetto(gettone, 25);   // 75 carte in tutto
  check('superate le ' + SOGLIA_PITY + ' carte la garanzia scatta', ancora.pityScattato === true);
  check('e porta almeno una ★5', ancora.carte.some((c) => c.rarita === 5));
  check('e almeno due ★4', ancora.carte.filter((c) => c.rarita === 4).length >= 2);
  console.log('   → nel pacchetto da 25: ' +
    [5, 4, 3, 2, 1].map((s) => s + '★:' + ancora.carte.filter((c) => c.rarita === s).length).join('  '));

  // due giocatori diversi non ricevono le stesse carte
  const b = creaAnagrafe({ archivio: archivioInMemoria(), catalogo: CATALOGO,
                           orologio: () => ORA, caso: casoFisso(99) });
  const g2 = (await b.entra(null, 'Q')).gettone;
  await b.ricarica(g2, 'montagna');
  const r2 = await b.compraPacchetto(g2, 50);
  check('un altro giocatore riceve un pacchetto diverso',
    r.carte.map((c) => c.carta.id).join() !== r2.carte.map((c) => c.carta.id).join());
}

// ============================================================
console.log('\n--- LA GARANZIA È DEL SERVER ---');
{
  const a = nuovaAnagrafe();
  const { gettone } = await a.entra(null, 'P');
  await a.ricarica(gettone, 'montagna');
  await a.ricarica(gettone, 'montagna');

  let aperte = 0, garanzie = 0;
  for (let i = 0; i < 14; i++) {
    const r = await a.compraPacchetto(gettone, 5);
    if (!r.ok) break;
    aperte += 5;
    if (r.pityScattato) garanzie++;
  }
  const s = await a.stato(gettone);
  check('il contatore della garanzia segue le carte aperte',
    s.contatorePity === aperte % SOGLIA_PITY);
  check('e la garanzia è scattata quando doveva',
    garanzie === Math.floor(aperte / SOGLIA_PITY));
  check('il server sa quante carte hai aperto in tutto', s.carteAperte === aperte);
  console.log('   → ' + aperte + ' carte aperte, ' + garanzie + ' garanzie scattate');
}

// ============================================================
console.log('\n--- LE RICARICHE ---');
{
  const a = nuovaAnagrafe();
  const { gettone } = await a.entra(null, 'P');

  const finta = await a.ricarica(gettone, 'non_esiste');
  check('una ricarica inventata è rifiutata', finta.ok === false);

  const vera = await a.ricarica(gettone, 'manciata');   // 1,00 € → 6.000
  check('la ricarica accredita il giusto', vera.accreditati === 6000);
  check('ed è dichiarata di prova, non verificata', vera.diProva === true);

  const g = await a.carica(gettone);
  check('resta traccia nello storico', g.ricariche.length === 1);
  check('con quanto è costata', g.ricariche[0].euro === 1);
  check('e col fatto che non è ancora verificata', g.ricariche[0].verificata === false);
}

// ============================================================
console.log('\n--- UN GIOCATORE NON TOCCA L\'ALTRO ---');
{
  const a = nuovaAnagrafe();
  const uno = await a.entra(null, 'Uno');
  const due = await a.entra(null, 'Due');
  await a.ricarica(uno.gettone, 'borsa');
  await a.compraPacchetto(uno.gettone, 5);

  const sDue = await a.stato(due.gettone);
  check('il secondo ha ancora zero sharkini', sDue.saldo === 0);
  check('e solo le carte di partenza', sDue.carteInTutto === DI_PARTENZA);
  check('mentre il primo ha anche quelle che ha aperto', (await a.stato(uno.gettone)).carteInTutto === DI_PARTENZA + 5);
  check('col gettone dell\'uno non si guarda l\'altro',
    (await a.stato(uno.gettone)).saldo !== sDue.saldo);
}

// ============================================================
console.log('\n--- IL MAGAZZINO SU FILE ---');
{
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-'));
  const percorso = path.join(cartella, 'giocatori.json');

  const archivio = archivioSuFile(percorso, { attesaScrittura: 5 });
  const a = creaAnagrafe({ archivio, catalogo: CATALOGO, orologio: () => ORA, caso: casoFisso(3) });
  const { gettone } = await a.entra(null, 'Pietro');
  await a.ritiraIlPremio(gettone);
  await a.ricarica(gettone, 'borsa');
  const comprato = await a.compraPacchetto(gettone, 5);
  await archivio.chiudi();

  check('il file è stato scritto', fs.existsSync(percorso));
  const dentro = JSON.parse(fs.readFileSync(percorso, 'utf-8'));
  check('e si legge a occhio nudo', dentro.versione === 1 && dentro.giocatori);
  check('col giocatore dentro', Object.keys(dentro.giocatori).length === 1);

  // e adesso la prova vera: si riparte da zero e ci si ritrova
  const archivio2 = archivioSuFile(percorso, { attesaScrittura: 5 });
  const a2 = creaAnagrafe({ archivio: archivio2, catalogo: CATALOGO, orologio: () => ORA, caso: casoFisso(3) });
  const ripreso = await a2.stato(gettone);
  check('spegnendo e riaccendendo, il giocatore c\'è ancora', ripreso.ok === true);
  check('col suo saldo', ripreso.saldo === comprato.saldo);
  check('e con le sue carte', ripreso.carteInTutto === DI_PARTENZA + 5);
  check('e la sua serie di accessi', ripreso.premio.giaRitiratoOggi === true);

  // un file rovinato non deve far perdere tutto in silenzio
  fs.writeFileSync(percorso, '{ questo non è json', 'utf-8');
  const archivio3 = archivioSuFile(percorso, { attesaScrittura: 5 });
  const a3 = creaAnagrafe({ archivio: archivio3, catalogo: CATALOGO, orologio: () => ORA, caso: casoFisso(3) });
  check('con un file rovinato il server riparte lo stesso',
    (await a3.stato(gettone)).ok === false);
  const messiDaParte = fs.readdirSync(cartella).filter((f) => f.includes('.rotto-'));
  check('ma il file rovinato viene messo da parte, non cancellato', messiDaParte.length === 1);

  fs.rmSync(cartella, { recursive: true, force: true });
}

// ============================================================
console.log('\n--- IL MAGAZZINO È INTERCAMBIABILE ---');
{
  // Gli stessi identici passi con i due magazzini devono dare lo stesso
  // risultato. Se un giorno smettessero, vorrebbe dire che qualcuno ha
  // guardato dentro il magazzino invece di passare dalle sue funzioni —
  // ed è esattamente quello che renderebbe difficile il passaggio al
  // database.
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2-'));
  const prova = async (archivio) => {
    const a = creaAnagrafe({ archivio, catalogo: CATALOGO, orologio: () => ORA, caso: casoFisso(21) });
    const { gettone } = await a.entra(null, 'X');
    await a.ritiraIlPremio(gettone);
    await a.ricarica(gettone, 'cassa');
    const c = await a.compraPacchetto(gettone, 10);
    const s = await a.stato(gettone);
    await archivio.chiudi();
    return JSON.stringify({ saldo: s.saldo, carte: c.carte.map((x) => x.carta.id),
                            pity: s.contatorePity, aperte: s.carteAperte });
  };
  const inMemoria = await prova(archivioInMemoria());
  const suFile = await prova(archivioSuFile(path.join(cartella, 'g.json'), { attesaScrittura: 5 }));
  check('in memoria o su file, il risultato è identico', inMemoria === suFile);
  fs.rmSync(cartella, { recursive: true, force: true });
}

// ============================================================
console.log('\n--- QUELLO CHE ESCE NON DEVE CONTENERE IL GETTONE ---');
{
  const a = nuovaAnagrafe();
  const { gettone } = await a.entra(null, 'P');
  await a.ricarica(gettone, 'borsa');
  const risposte = [
    await a.stato(gettone),
    await a.ritiraIlPremio(gettone),
    await a.compraPacchetto(gettone, 5)
  ];
  check('nessuna risposta si porta dietro il gettone',
    risposte.every((r) => !JSON.stringify(r).includes(gettone)));
}

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
process.exit(ko === 0 ? 0 : 1);
