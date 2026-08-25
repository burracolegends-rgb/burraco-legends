// Entrare, e soprattutto COLLEGARSI senza perdere niente. Il caso che
// conta più di tutti è uno: ho giocato due settimane da ospite, collego
// Google, e devo ritrovare i miei sharkini e le mie carte.
import { archivioInMemoria } from './archivio.js';
import { creaAnagrafe } from './giocatori.js';
import { creaAccessi, FORNITORI } from './identita.js';
import { dotazioneIniziale } from '../engine/dotazione.js';

const DI_PARTENZA = Object.values(dotazioneIniziale()).reduce((a, b) => a + b, 0);

let ko = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) ko++; };

let ORA = Date.parse('2026-08-14T12:00:00Z');
const CATALOGO = [];
for (let r = 1; r <= 5; r++) for (let i = 0; i < 6; i++)
  CATALOGO.push({ id: 'carta_' + r + '_' + i, rarita: r, seme: '♥', vita: 100, att: 90 });

// Un finto Google: la credenziale è direttamente l'identificativo. Nei
// test non si parla con internet — e questo è anche il modo di provare
// che il verificatore vero è sostituibile.
const fintoFornitore = (nome) => async (credenziale) => {
  if (typeof credenziale !== 'string' || !credenziale.startsWith(nome + ':')) {
    return { ok: false, motivo: 'Credenziale ' + nome + ' non valida.' };
  }
  return { ok: true, fornitore: nome, id: credenziale.slice(nome.length + 1), nome: null };
};

function nuovoMondo(conFornitori = ['google', 'facebook']) {
  const archivio = archivioInMemoria();
  const anagrafe = creaAnagrafe({ archivio, catalogo: CATALOGO, orologio: () => ORA, bonusBenvenuto: 0, codaBenvenuto: [] });
  const verificatori = {};
  for (const f of conFornitori) verificatori[f] = fintoFornitore(f);
  const accessi = creaAccessi({ archivio, anagrafe, verificatori, orologio: () => ORA });
  return { archivio, anagrafe, accessi };
}

// ============================================================
console.log('--- ENTRARE COME OSPITE ---');
{
  const { anagrafe, accessi } = nuovoMondo();
  const r = await accessi.entraComeOspite('Pietro');
  check('si entra senza raccontare niente', r.ok === true);
  check('e si riceve un gettone', typeof r.gettone === 'string' && r.gettone.length >= 64);
  check('è dichiarato ospite', r.ospite === true);

  const chi = await accessi.comeSeiEntrato(r.gettone);
  check('e il server lo sa', chi.ospite === true && chi.collegatoCon.length === 0);
  check('col nome scelto', chi.nome === 'Pietro');
  check('due ospiti sono due persone diverse',
    (await accessi.entraComeOspite('Altro')).gettone !== r.gettone);
}

// ============================================================
console.log('\n--- COLLEGARE SENZA PERDERE NIENTE ---');
{
  const { anagrafe, accessi } = nuovoMondo();

  // due settimane da ospite
  const ospite = await accessi.entraComeOspite('Pietro');
  await anagrafe.ricarica(ospite.gettone, 'borsa');
  const comprato = await anagrafe.compraPacchetto(ospite.gettone, 5);
  const prima = await anagrafe.stato(ospite.gettone);
  // "accumulato" = quello che si è procurato da sé. Le carte della
  // dotazione iniziale ce le ha anche l'altro suo profilo: non sono
  // roba che rischia di perdere collegandosi.
  check('l\'ospite ha accumulato roba', prima.saldo === 15000 && prima.carteInTutto === DI_PARTENZA + 5);

  // e adesso collega Google
  const collegato = await accessi.entraCon('google', 'google:pietro-123', ospite.gettone);
  check('il collegamento riesce', collegato.ok === true);
  check('ED È LO STESSO GIOCATORE', collegato.gettone === ospite.gettone);
  const dopo = await anagrafe.stato(collegato.gettone);
  check('gli sharkini sono ancora suoi', dopo.saldo === prima.saldo);
  check('e le carte anche', dopo.carteInTutto === prima.carteInTutto);
  check('e le stesse identiche carte',
    JSON.stringify(dopo.collezione) === JSON.stringify(prima.collezione));

  const chi = await accessi.comeSeiEntrato(collegato.gettone);
  check('adesso non è più un ospite', chi.ospite === false);
  check('ed è collegato con Google', chi.collegatoCon.join() === 'google');
}

// ============================================================
console.log('\n--- RITROVARSI DA UN ALTRO DISPOSITIVO ---');
{
  const { anagrafe, accessi } = nuovoMondo();
  const primo = await accessi.entraComeOspite('Pietro');
  await anagrafe.ricarica(primo.gettone, 'cassa');
  await accessi.entraCon('google', 'google:pietro-123', primo.gettone);
  const suo = await anagrafe.stato(primo.gettone);

  // stesso Google, telefono nuovo: nessun gettone da presentare
  const daAltrove = await accessi.entraCon('google', 'google:pietro-123', null);
  check('entrando da un altro dispositivo si ritrova sé stessi',
    daAltrove.gettone === primo.gettone);
  check('e il server lo dichiara', daAltrove.ritrovato === true);
  const stesso = await anagrafe.stato(daAltrove.gettone);
  check('con lo stesso saldo', stesso.saldo === suo.saldo);
  check('non è un giocatore nuovo', daAltrove.nuovo === false);
}

// ============================================================
console.log('\n--- L\'OSPITE CHE NON SI PUÒ UNIRE ---');
{
  // Il caso scomodo: ho un account Google con le mie cose, e su un
  // altro telefono ho giocato da ospite accumulando altra roba. Le due
  // cose non si mescolano — ma va DETTO, non nascosto.
  const { anagrafe, accessi } = nuovoMondo();

  const vecchio = await accessi.entraComeOspite('Pietro');
  await anagrafe.ricarica(vecchio.gettone, 'montagna');
  await accessi.entraCon('google', 'google:pietro-123', vecchio.gettone);
  const conto = (await anagrafe.stato(vecchio.gettone)).saldo;

  const altroTelefono = await accessi.entraComeOspite('Pietro');
  await anagrafe.ricarica(altroTelefono.gettone, 'manciata');
  await anagrafe.ritiraIlPremio(altroTelefono.gettone);

  const entrata = await accessi.entraCon('google', 'google:pietro-123', altroTelefono.gettone);
  check('si entra nell\'account Google, non nell\'ospite',
    entrata.gettone === vecchio.gettone);
  check('col saldo dell\'account Google', (await anagrafe.stato(entrata.gettone)).saldo === conto);
  check('e il server AVVERTE che l\'ospite resta indietro',
    entrata.ospiteLasciatoIndietro !== null && entrata.ospiteLasciatoIndietro !== undefined);
  check('dicendo quanto c\'era', entrata.ospiteLasciatoIndietro.sharkini === 6100);
  check('l\'ospite non è stato cancellato: è ancora lì',
    (await anagrafe.stato(altroTelefono.gettone)).saldo === 6100);
}

// se l'ospite non aveva niente, non c'è niente da avvertire
{
  const { accessi } = nuovoMondo();
  const primo = await accessi.entraComeOspite('A');
  await accessi.entraCon('google', 'google:tizio', primo.gettone);
  const vuoto = await accessi.entraComeOspite('B');
  const r = await accessi.entraCon('google', 'google:tizio', vuoto.gettone);
  check('un ospite a mani vuote non merita un avviso', !r.ospiteLasciatoIndietro);
}

// ============================================================
console.log('\n--- CREDENZIALI FASULLE ---');
{
  const { accessi, anagrafe } = nuovoMondo();
  for (const [etichetta, fornitore, credenziale] of [
    ['credenziale sbagliata', 'google', 'non-e-un-token'],
    ['credenziale vuota', 'google', ''],
    ['credenziale nulla', 'google', null],
    ['credenziale numerica', 'google', 12345],
    ['credenziale di un altro fornitore', 'google', 'facebook:tizio'],
    ['fornitore inventato', 'twitter', 'twitter:tizio']
  ]) {
    const r = await accessi.entraCon(fornitore, credenziale, null);
    check(etichetta + ' → rifiutata', r.ok === false && typeof r.motivo === 'string');
  }
  check('e nessun giocatore è stato creato per sbaglio', (await anagrafe.quanti()) === 0);
}

// ============================================================
console.log('\n--- UN FORNITORE SPENTO ---');
{
  const { accessi } = nuovoMondo(['google']);          // solo Google configurato
  check('gli attivi sono solo quelli configurati', accessi.attivi().join() === 'google');
  const r = await accessi.entraCon('facebook', 'facebook:tizio', null);
  check('con Facebook spento non si entra', r.ok === false);
  check('e si dice che non è attivo', /non è ancora attivo/i.test(r.motivo));
  check('da ospite invece si entra sempre',
    (await accessi.entraComeOspite('X')).ok === true);
}

{
  const { accessi } = nuovoMondo([]);
  check('senza nessun fornitore, resta l\'ospite', accessi.attivi().length === 0);
  check('e basta per giocare', (await accessi.entraComeOspite('Y')).ok === true);
  check('l\'elenco dei fornitori possibili è chiuso', FORNITORI.join() === 'google,facebook');
}

// ============================================================
console.log('\n--- DUE IDENTITÀ SULLO STESSO GIOCATORE ---');
{
  const { anagrafe, accessi } = nuovoMondo();
  const mio = await accessi.entraComeOspite('Pietro');
  await accessi.entraCon('google', 'google:p', mio.gettone);
  await accessi.entraCon('facebook', 'facebook:p', mio.gettone);

  const chi = await accessi.comeSeiEntrato(mio.gettone);
  check('si possono collegare tutti e due', chi.collegatoCon.sort().join() === 'facebook,google');
  check('entrando con Google si arriva a me', (await accessi.entraCon('google', 'google:p', null)).gettone === mio.gettone);
  check('e con Facebook pure', (await accessi.entraCon('facebook', 'facebook:p', null)).gettone === mio.gettone);
  check('è sempre un giocatore solo', (await anagrafe.quanti()) === 1);

  // collegare due volte la stessa identità non la duplica
  await accessi.entraCon('google', 'google:p', mio.gettone);
  const g = await anagrafe.carica(mio.gettone);
  check('collegare due volte non duplica niente', g.identita.length === 2);
}

// ============================================================
console.log('\n--- L\'ACCOUNT DI UN ALTRO NON SI PRENDE ---');
{
  const { anagrafe, accessi } = nuovoMondo();
  const tizio = await accessi.entraComeOspite('Tizio');
  await anagrafe.ricarica(tizio.gettone, 'montagna');
  await accessi.entraCon('google', 'google:tizio', tizio.gettone);

  const caio = await accessi.entraComeOspite('Caio');
  // Caio prova a collegarsi con l'identità di Tizio, ma non ha la
  // credenziale di Tizio: senza quella non arriva da nessuna parte
  const tentativo = await accessi.entraCon('google', 'google:tizio-FINTO', caio.gettone);
  check('senza la credenziale giusta non si entra da Tizio',
    tentativo.gettone !== tizio.gettone);
  check('e il saldo di Tizio non si tocca',
    (await anagrafe.stato(tizio.gettone)).saldo === 375000);
  check('mentre Caio resta povero',
    (await anagrafe.stato(caio.gettone)).saldo === 0);
}

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
process.exit(ko === 0 ? 0 : 1);
