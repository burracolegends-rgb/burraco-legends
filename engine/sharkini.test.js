// Verifica del premio giornaliero e del cambio in sharkini.
// La domanda a cui devono rispondere questi test è una sola: chi entra
// tutti i giorni e non spende un euro, dopo un mese ha in mano un
// pacchetto da 5 carte? Tutto il resto scende da lì.
import {
  PREMI_SETTIMANA, PREMIO_MASSIMO, premioDelGiorno, guadagnoInGiorni,
  giornoDiCalendario, SERIE_NUOVA, statoSerie, ritiraPremio,
  giorniPrimaDiPerdereLaSerie, SHARKINI_PER_EURO, RICARICHE,
  sharkiniPerEuro, GIORNI_PER_UN_PACCO, saldoPuoPagare, spendi,
  giorniPerRaccogliere, formattaSharkini, conNome
} from './sharkini.js';
import { OFFERTE, offertaPerCarte, costoPerCarta } from './pacchetti.js';

let ko = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) ko++; };

// una giornata comoda da spostare avanti e indietro nei test
const GIORNO = 86400000;
const g = (n) => new Date(2026, 7, 14, 12, 0, 0).getTime() + n * GIORNO;

// ============================================================
// LA SCALA DEI SETTE GIORNI
// ============================================================
console.log('--- LA SCALA ---');
check('il primo giorno vale 100', premioDelGiorno(1) === 100);
check('sale di 100 al giorno fino al settimo',
  PREMI_SETTIMANA.join(',') === '100,200,300,400,500,600,700');
check('il settimo giorno vale 700', premioDelGiorno(7) === 700);
check('oltre il settimo non sale più',
  premioDelGiorno(8) === 700 && premioDelGiorno(40) === 700 && premioDelGiorno(365) === 700);
check('il massimo è 700', PREMIO_MASSIMO === 700);
check('la scala non scende mai',
  PREMI_SETTIMANA.every((p, i) => i === 0 || p > PREMI_SETTIMANA[i - 1]));
check('una settimana intera vale 2.800', guadagnoInGiorni(7) === 2800);
check('un mese di trenta giorni vale 18.900', guadagnoInGiorni(30) === 18900);

// ============================================================
// IL PALETTO: UN MESE = 5 CARTE
// ============================================================
console.log('\n--- IL PALETTO ---');
const pacco = offertaPerCarte(5);
check('il pacchetto da 5 carte costa 18.000 sharkini', pacco.costo === 18000);
check('trenta giorni di accessi bastano per il pacchetto da 5 carte',
  guadagnoInGiorni(GIORNI_PER_UN_PACCO) >= pacco.costo);
check('ventinove giorni NON bastano di misura, così il mese si sente',
  giorniPerRaccogliere(pacco.costo) === 29);
check('un solo giorno in meno del previsto non basta',
  guadagnoInGiorni(28) < pacco.costo);
console.log('   → 30 giorni danno ' + formattaSharkini(guadagnoInGiorni(30)) +
            ', il pacco ne costa ' + formattaSharkini(pacco.costo));

// ============================================================
// LA SERIE: ENTRARE, SALTARE, RICOMINCIARE
// ============================================================
console.log('\n--- LA SERIE ---');
{
  let s = { ...SERIE_NUOVA };
  const primo = statoSerie(s, g(0));
  check('chi non ha mai ritirato parte dal giorno 1', primo.giorno === 1 && primo.puoRitirare);

  let r = ritiraPremio(s, g(0));
  s = r.serie;
  check('ritira 100 il primo giorno', r.guadagno === 100 && s.saldo === 100);
  check('lo stato di partenza non è stato toccato', SERIE_NUOVA.saldo === 0);

  const bis = ritiraPremio(s, g(0.3));                 // stesso giorno, ore dopo
  check('lo stesso giorno non si ritira due volte',
    bis.guadagno === 0 && bis.serie.saldo === 100 && bis.stato.giaRitiratoOggi);

  for (let giorno = 1; giorno < 7; giorno++) {
    r = ritiraPremio(s, g(giorno));
    s = r.serie;
  }
  check('sette giorni di fila portano a 2.800', s.saldo === 2800 && s.giorno === 7);

  r = ritiraPremio(s, g(7));
  s = r.serie;
  check('l\'ottavo giorno dà ancora 700, non di più', r.guadagno === 700);
  check('la serie continua a contare oltre il settimo', s.giorno === 8);

  // e adesso salta un giorno
  const dopoIlSalto = ritiraPremio(s, g(9.5));         // ha saltato il giorno 8
  check('chi salta un giorno ricomincia da 100', dopoIlSalto.guadagno === 100);
  check('e la scala riparte dal giorno 1', dopoIlSalto.serie.giorno === 1);
  check('il gioco lo dice chiaramente', dopoIlSalto.stato.serieRotta === true);
  check('ma gli sharkini già guadagnati restano',
    dopoIlSalto.serie.saldo === s.saldo + 100);

  // sparire per mesi non peggiora le cose oltre il reset
  const dopoUnAnno = ritiraPremio(s, g(400));
  check('anche dopo un anno si riparte da 100, non da meno', dopoUnAnno.guadagno === 100);
}

// il conto alla rovescia mostrato al giocatore
{
  let s = ritiraPremio({ ...SERIE_NUOVA }, g(0)).serie;
  check('appena ritirato, la serie regge fino a domani',
    giorniPrimaDiPerdereLaSerie(s, g(0.2)) === 1);
  check('il giorno dopo è l\'ultimo utile per non perderla',
    giorniPrimaDiPerdereLaSerie(s, g(1.2)) === 0);
  check('passato quello è persa, e si vede', giorniPrimaDiPerdereLaSerie(s, g(2.2)) === -1);
  check('senza serie non c\'è niente da perdere',
    giorniPrimaDiPerdereLaSerie(SERIE_NUOVA, g(0)) === null);
}

// le date sono giorni di calendario, non intervalli di 24 ore
{
  const seraTardi = new Date(2026, 7, 14, 23, 50).getTime();
  const notteDopo = new Date(2026, 7, 15, 0, 10).getTime();
  check('23:50 e 00:10 sono due giorni diversi',
    giornoDiCalendario(notteDopo) - giornoDiCalendario(seraTardi) === 1);
  const mattina = new Date(2026, 7, 14, 9, 0).getTime();
  const sera = new Date(2026, 7, 14, 21, 0).getTime();
  check('mattina e sera dello stesso giorno sono lo stesso giorno',
    giornoDiCalendario(mattina) === giornoDiCalendario(sera));
}

// ============================================================
// LE RICARICHE IN EURO
// ============================================================
console.log('\n--- LE RICARICHE ---');
check('ci sono sei ricariche', RICARICHE.length === 6);
check('un euro vale 6.000 sharkini senza bonus',
  RICARICHE[0].euro === 1 && RICARICHE[0].sharkini === SHARKINI_PER_EURO);
const resa = RICARICHE.map(sharkiniPerEuro);
check('più grande è la ricarica, più sharkini per euro',
  resa.every((v, i) => i === 0 || v > resa[i - 1]));
check('anche il totale cresce sempre',
  RICARICHE.every((r, i) => i === 0 || r.sharkini > RICARICHE[i - 1].sharkini));
check('il bonus dichiarato torna coi conti',
  RICARICHE.every((r) => r.sharkini === r.base + r.extra));
check('la ricarica minima non basta da sola per cinque carte',
  RICARICHE[0].sharkini < pacco.costo);

console.log('\n--- RICARICHE ---');
for (const r of RICARICHE) {
  console.log('  ' + r.euro.toFixed(2).padStart(5) + ' €  →  ' +
    formattaSharkini(r.sharkini).padStart(7) + ' sharkini' +
    (r.extra ? '  (+' + formattaSharkini(r.extra) + ' in regalo, ' + Math.round(r.bonus * 100) + '%)' : '') +
    '  ·  ' + formattaSharkini(sharkiniPerEuro(r)) + ' per euro');
}

// quanto costa in euro, di fatto, ogni pacchetto — non si mostra al
// giocatore, ma serve a noi per sapere se il listino sta in piedi
console.log('\n--- CONTROPROVA (uso interno, non si vede in gioco) ---');
for (const o of OFFERTE) {
  const conLaMigliore = o.costo / sharkiniPerEuro(RICARICHE[RICARICHE.length - 1]);
  const conLaPeggiore = o.costo / sharkiniPerEuro(RICARICHE[0]);
  console.log('  ' + String(o.carte).padStart(2) + ' carte  ·  da ' +
    conLaMigliore.toFixed(2) + ' € a ' + conLaPeggiore.toFixed(2) + ' €  ·  ' +
    String(giorniPerRaccogliere(o.costo)).padStart(3) + ' giorni gratis');
}

// ============================================================
// IL BORSELLINO
// ============================================================
console.log('\n--- IL BORSELLINO ---');
check('con abbastanza sharkini si compra', saldoPuoPagare(18000, 18000) === true);
check('con uno in meno no', saldoPuoPagare(17999, 18000) === false);
{
  const dopo = spendi(20000, 18000);
  check('spendendo, il saldo cala del giusto', dopo.riuscito && dopo.saldo === 2000);
  const fallito = spendi(100, 18000);
  check('se non bastano, non succede nulla', !fallito.riuscito && fallito.saldo === 100);
}
check('i numeri si leggono coi punti', formattaSharkini(108000) === '108.000');
check('i numeri piccoli restano puliti', formattaSharkini(700) === '700');
check('la cifra si accompagna sempre al nome della moneta',
  conNome(18000) === '18.000 sharkini' && conNome(700) === '700 sharkini');
check('e al singolare non stona', conNome(1) === '1 sharkino');

// ============================================================
// IL PRINCIPIO: NIENTE EURO SULLE CARTE
// ============================================================
console.log('\n--- UNA MONETA SOLA ---');
check('nessun pacchetto espone un prezzo in euro',
  OFFERTE.every((o) => o.prezzo === undefined && o.euro === undefined));
check('nessuna ricarica espone un numero di carte',
  RICARICHE.every((r) => r.carte === undefined));
check('il costo per carta è sempre in sharkini interi',
  OFFERTE.every((o) => Number.isInteger(costoPerCarta(o))));

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
process.exit(ko === 0 ? 0 : 1);
