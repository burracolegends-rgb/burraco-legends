// ============================================================
// BURRACO LEGENDS — IL PANNELLO RISERVATO
//
// Qui non si prova "funziona il bottone": si prova che la porta è
// chiusa. Un pannello di amministrazione sbagliato non dà un fastidio,
// dà via il gioco — quindi le prove partono da tutti i modi di NON
// dover entrare, e solo dopo guardano cosa si vede una volta dentro.
//
// Tre pezzi:
//   1. il modulo da solo, con un orologio finto (scadenze e tentativi
//      non si provano aspettando due ore davvero);
//   2. un server vero, con le variabili d'ambiente messe apposta;
//   3. un secondo server SENZA quelle variabili, per la cosa più
//      importante di tutte: che lì il pannello non esista proprio.
// ============================================================
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const QUI = dirname(fileURLToPath(import.meta.url));
const MAGAZZINO = join(tmpdir(), 'burraco-legends-pannello.json');
// Si riparte puliti: l'email dell'amministratore è FISSA (deve
// combaciare con la variabile d'ambiente), quindi un magazzino
// avanzato dalla volta scorsa direbbe "questa email è già registrata".
try { rmSync(MAGAZZINO, { force: true }); } catch (e) {}

const EMAIL_CAPO = 'capo@esempio.it';
const PAROLA = 'parola-del-pannello-42';

process.env.MAGAZZINO = MAGAZZINO;
process.env.ADMIN_EMAIL = EMAIL_CAPO + ' , socio@esempio.it';   // spazi di troppo apposta
process.env.ADMIN_PASSWORD = PAROLA;
process.env.NON_AVVIARE = '1';

const { server } = await import('./server.js');
import {
  creaAmministrazione, INATTIVITA_MS, DURATA_MASSIMA_MS, TENTATIVI_PRIMA_DI_ASPETTARE
} from './amministrazione.js';
import { archivioInMemoria } from './archivio.js';

let ko = 0;
const check = (l, c, dettaglio) => {
  console.log((c ? 'OK   ' : 'FAIL ') + l + (c || !dettaglio ? '' : '  <- ' + dettaglio));
  if (!c) ko++;
};

// ============================================================
// 1. IL MODULO DA SOLO
// ============================================================
console.log('--- IL PANNELLO SENZA CREDENZIALI NON ESISTE ---');
{
  const archivio = archivioInMemoria();
  const anagrafe = { carica: async () => ({ email: EMAIL_CAPO }) };

  const senzaNiente = creaAmministrazione({ archivio, anagrafe });
  check('senza email ammesse né password il pannello è spento', senzaNiente.acceso() === false);

  const soloEmail = creaAmministrazione({ archivio, anagrafe, emailAmmesse: EMAIL_CAPO });
  check('con le email ma senza password resta spento', soloEmail.acceso() === false);

  const soloParola = creaAmministrazione({ archivio, anagrafe, password: PAROLA });
  check('con la password ma senza email ammesse resta spento', soloParola.acceso() === false);

  const spento = await senzaNiente.entra('g', PAROLA, '1.2.3.4');
  check('e da spento non fa entrare nemmeno chi avrebbe le credenziali giuste', spento.ok === false);
  check('nemmeno riconosce un amministratore', (await senzaNiente.eAmministratore('g')) === false);
}

console.log('\n--- LA SESSIONE SCADE DA SOLA ---');
{
  const archivio = archivioInMemoria();
  const anagrafe = { carica: async () => ({ email: EMAIL_CAPO }) };
  let adesso = 1_000_000;
  const p = creaAmministrazione({
    archivio, anagrafe, emailAmmesse: EMAIL_CAPO, password: PAROLA, orologio: () => adesso
  });

  const dentro = await p.entra('gettone-del-capo', PAROLA, '1.2.3.4');
  check('con email ammessa e password giusta si entra', dentro.ok === true && !!dentro.sessione);
  check('e la sessione dice chi sei', (p.chiSei(dentro.sessione) || {}).email === EMAIL_CAPO);

  adesso += INATTIVITA_MS - 1000;
  check('poco prima del limite di inattività vale ancora', !!p.chiSei(dentro.sessione));

  // chiSei() appena chiamata ha spostato in avanti l'ultimo uso: è il
  // comportamento giusto (chi sta lavorando non deve essere buttato
  // fuori), e va provato che sia davvero così.
  adesso += INATTIVITA_MS - 1000;
  check('e restando attivi non scade mai per inattività', !!p.chiSei(dentro.sessione));

  adesso += INATTIVITA_MS + 1000;
  check('ma dopo due ore ferme la sessione è morta', p.chiSei(dentro.sessione) === null);

  const seconda = await p.entra('gettone-del-capo', PAROLA, '1.2.3.4');
  adesso += DURATA_MASSIMA_MS + 1000;
  check('e comunque nessuna sessione supera la durata massima, per quanto la si usi',
    p.chiSei(seconda.sessione) === null);
}

console.log('\n--- I TENTATIVI SI CONTANO ---');
{
  const archivio = archivioInMemoria();
  const anagrafe = { carica: async () => ({ email: EMAIL_CAPO }) };
  let adesso = 1_000_000;
  const p = creaAmministrazione({
    archivio, anagrafe, emailAmmesse: EMAIL_CAPO, password: PAROLA, orologio: () => adesso
  });

  let ultimo = null;
  for (let i = 0; i < TENTATIVI_PRIMA_DI_ASPETTARE; i++) {
    ultimo = await p.entra('gettone-del-capo', 'sbagliata', '9.9.9.9');
  }
  check('le password sbagliate vengono respinte', ultimo.ok === false);

  const dopo = await p.entra('gettone-del-capo', PAROLA, '9.9.9.9');
  check('e dopo troppi tentativi non si entra NEMMENO con quella giusta',
    dopo.ok === false && /Riprova/.test(dopo.motivo), JSON.stringify(dopo));

  const altrove = await p.entra('gettone-del-capo', PAROLA, '7.7.7.7');
  check('ma chi arriva da un altro indirizzo non paga per lui', altrove.ok === true);
}

console.log('\n--- CHI NON È AMMESSO NON ENTRA, E NON CAPISCE PERCHÉ ---');
{
  const archivio = archivioInMemoria();
  const anagrafe = { carica: async (g) => (g === 'capo' ? { email: EMAIL_CAPO } : { email: 'tizio@esempio.it' }) };
  const p = creaAmministrazione({ archivio, anagrafe, emailAmmesse: EMAIL_CAPO, password: PAROLA });

  const estraneo = await p.entra('tizio', PAROLA, '1.1.1.1');
  const capoConParolaStorta = await p.entra('capo', 'storta', '2.2.2.2');
  check('un\'email non ammessa non entra nemmeno con la password giusta', estraneo.ok === false);
  check('e il motivo è identico a quello di una password sbagliata',
    estraneo.motivo === capoConParolaStorta.motivo,
    estraneo.motivo + ' / ' + capoConParolaStorta.motivo);

  const ospite = await p.entra(null, PAROLA, '3.3.3.3');
  check('un ospite senza account non è amministratore', ospite.ok === false);
}

console.log('\n--- IL PANNELLO NON VEDE MAI UN GETTONE DI GIOCO ---');
{
  const archivio = archivioInMemoria();
  const gettoneVero = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  await archivio.scrivi('giocatore:' + gettoneVero, {
    nome: 'Ada', creatoIl: 1000, ultimaVisita: 2000,
    serie: { saldo: 500 }, collezione: { x: 2 }, pacchettiAperti: 3, carteAperte: 9, ricariche: []
  });
  const anagrafe = { carica: async () => ({ email: EMAIL_CAPO }) };
  const p = creaAmministrazione({ archivio, anagrafe, emailAmmesse: EMAIL_CAPO, password: PAROLA });

  const lista = await p.elenco({});
  const riga = lista.giocatori[0];
  check('l\'elenco trova il giocatore', lista.giocatori.length === 1 && riga.nome === 'Ada');
  check('e lo chiama con un identificativo corto, non col suo gettone',
    riga.id === gettoneVero.slice(0, 10) && riga.id.length === 10, JSON.stringify(riga.id));
  check('il gettone intero non compare da nessuna parte nella risposta',
    !JSON.stringify(lista).includes(gettoneVero));
}

console.log('\n--- SOSPENDERE E RIMETTERE DENTRO ---');
{
  const archivio = archivioInMemoria();
  const gettoneVero = 'ffee1122334455667788990011223344';
  await archivio.scrivi('giocatore:' + gettoneVero, {
    nome: 'Disturbatore', creatoIl: 1000, ultimaVisita: 2000,
    serie: { saldo: 0 }, collezione: {}, pacchettiAperti: 0, carteAperte: 0, ricariche: []
  });
  const anagrafe = { carica: async () => ({ email: EMAIL_CAPO }) };
  let adesso = 1_000_000_000;
  const p = creaAmministrazione({
    archivio, anagrafe, emailAmmesse: EMAIL_CAPO, password: PAROLA, orologio: () => adesso
  });
  const id = gettoneVero.slice(0, 10);

  const senzaMotivo = await p.sospendi(id, 7, '   ', EMAIL_CAPO);
  check('non si sospende nessuno senza scrivere perché', senzaMotivo.ok === false);

  const inventato = await p.sospendi('0000000000', 7, 'tanto per', EMAIL_CAPO);
  check('e non si sospende un identificativo che non esiste', inventato.ok === false);

  const fatto = await p.sospendi(id, 7, 'nome offensivo', EMAIL_CAPO);
  check('la sospensione va a buon fine', fatto.ok === true);
  check('il giocatore risulta fermo', !!(await p.sospensioneDi(gettoneVero)));

  const fermo = await p.bloccato(gettoneVero);
  check('e chi prova a sedersi riceve un no che dice il motivo e la data',
    fermo && fermo.sospeso === true && /nome offensivo/.test(fermo.motivo) && /Potrai rientrare/.test(fermo.motivo),
    JSON.stringify(fermo));

  adesso += 8 * 24 * 60 * 60 * 1000;
  check('passati i sette giorni si scongela da sola, senza che nessuno ci pensi',
    (await p.sospensioneDi(gettoneVero)) === null && (await p.bloccato(gettoneVero)) === null);

  adesso += 1000;
  await p.sospendi(id, null, 'recidivo', EMAIL_CAPO);
  const perSempre = await p.sospensioneDi(gettoneVero);
  check('una sospensione senza scadenza non scade', perSempre && perSempre.fino === null);
  adesso += 3650 * 24 * 60 * 60 * 1000;
  check('nemmeno fra dieci anni', !!(await p.sospensioneDi(gettoneVero)));

  const riaperto = await p.riattiva(id, 'socio@esempio.it');
  check('riattivare lo rimette dentro subito', riaperto.ok === true && (await p.sospensioneDi(gettoneVero)) === null);

  const voci = await p.registro(20);
  const azioni = voci.map((v) => v.azione);
  check('il registro ha annotato le sospensioni e la riattivazione',
    azioni.filter((a) => a === 'sospensione').length === 2 && azioni.includes('riattivazione'),
    JSON.stringify(azioni));
  check('e dice CHI ha fatto cosa: siamo in più di uno',
    voci.find((v) => v.azione === 'riattivazione').chi === 'socio@esempio.it');
  check('il più recente sta in cima', voci[0].azione === 'riattivazione');
}

// ============================================================
// 2. IL SERVER VERO
// ============================================================
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = 'http://127.0.0.1:' + server.address().port;
const posta = async (via, corpo) => {
  const r = await fetch(BASE + via, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  return { stato: r.status, corpo: await r.json().catch(() => null) };
};

console.log('\n--- DAL SERVER: SOLO CHI DEVE, ENTRA ---');
const capo = (await posta('/api/registrati', {
  email: EMAIL_CAPO, password: 'BurracoProva#42', nome: 'Capo'
})).corpo;
const tizio = (await posta('/api/registrati', {
  email: 'tizio_' + Math.random().toString(36).slice(2) + '@esempio.it',
  password: 'BurracoProva#42', nome: 'Tizio'
})).corpo;
check('l\'amministratore ha un account di gioco come tutti', capo.ok === true, JSON.stringify(capo));
check('e un giocatore normale pure', tizio.ok === true);

{
  const suo = (await posta('/api/chi-sono', { gettone: capo.gettone })).corpo;
  const altrui = (await posta('/api/chi-sono', { gettone: tizio.gettone })).corpo;
  check('il profilo dell\'amministratore sa che può vedere la porta', suo.amministratore === true);
  check('quello di un giocatore normale no', altrui.amministratore === false);
}

const conParolaStorta = await posta('/api/admin/entra', { gettone: capo.gettone, password: 'storta' });
check('password sbagliata: 401, e niente sessione',
  conParolaStorta.stato === 401 && !conParolaStorta.corpo.sessione);

const daNonAmministratore = await posta('/api/admin/entra', { gettone: tizio.gettone, password: PAROLA });
check('giocatore normale con la password giusta: fuori lo stesso',
  daNonAmministratore.stato === 401 && !daNonAmministratore.corpo.sessione);

const ingresso = await posta('/api/admin/entra', { gettone: capo.gettone, password: PAROLA });
check('l\'amministratore entra', ingresso.stato === 200 && !!ingresso.corpo.sessione, JSON.stringify(ingresso.corpo));
const SESSIONE = ingresso.corpo.sessione;

console.log('\n--- DAL SERVER: SENZA SESSIONE NON SI LEGGE NIENTE ---');
for (const via of ['/api/admin/sommario', '/api/admin/giocatori', '/api/admin/registro']) {
  const senza = await posta(via, {});
  const inventata = await posta(via, { sessione: 'a'.repeat(64) });
  check(via + ' senza sessione dice no', senza.stato === 401);
  check(via + ' con una sessione inventata dice no', inventata.stato === 401);
}
{
  const provaSospendere = await posta('/api/admin/sospendi', { id: 'aaaaaaaaaa', giorni: 7, motivo: 'x' });
  check('e nemmeno si sospende qualcuno senza sessione', provaSospendere.stato === 401);
}

console.log('\n--- DAL SERVER: I NUMERI E L\'ELENCO ---');
{
  const s = (await posta('/api/admin/sommario', { sessione: SESSIONE })).corpo;
  check('il sommario conta i giocatori registrati', s.ok === true && s.giocatori >= 2 && s.registrati >= 2,
    JSON.stringify({ giocatori: s.giocatori, registrati: s.registrati }));
  check('e dice quanti sono entrati oggi', s.attiviOggi >= 2);
  check('dice anche dove stanno i dati, che è la domanda che viene subito dopo',
    typeof s.magazzino === 'string' && s.magazzino.length > 0);
  check('e ammette che le ricariche non sono ancora soldi veri', s.ricaricheDiProva === true);

  const e = (await posta('/api/admin/giocatori', { sessione: SESSIONE, cerca: 'Capo' })).corpo;
  check('la ricerca per nome trova chi si cerca', e.ok === true && e.giocatori.length === 1 && e.giocatori[0].nome === 'Capo');
  check('nessun gettone di gioco esce dal server nemmeno qui',
    !JSON.stringify(e).includes(capo.gettone) && !JSON.stringify(e).includes(tizio.gettone));
}

console.log('\n--- DAL SERVER: SOSPESO VUOL DIRE FUORI DAI TAVOLI ---');
{
  const trovato = (await posta('/api/admin/giocatori', { sessione: SESSIONE, cerca: 'Tizio' })).corpo.giocatori[0];
  const sospensione = await posta('/api/admin/sospendi', {
    sessione: SESSIONE, id: trovato.id, giorni: 3, motivo: 'prova di sospensione'
  });
  check('l\'amministratore sospende il giocatore', sospensione.stato === 200, JSON.stringify(sospensione.corpo));

  const tavolo = await posta('/api/siediti', { gettone: tizio.gettone });
  check('e quello non riesce più a sedersi a un tavolo con altri',
    tavolo.stato === 403 && tavolo.corpo.sospeso === true, JSON.stringify(tavolo.corpo));
  check('il no gli dice perché', /prova di sospensione/.test(tavolo.corpo.motivo));

  const conAmico = await posta('/api/apri', { gettone: tizio.gettone });
  const missione = await posta('/api/missione/inizia', { gettone: tizio.gettone });
  check('nemmeno aprendo un tavolo per un amico', conAmico.stato === 403);
  check('nemmeno nella Missione, che ha la classifica pubblica', missione.stato === 403);

  const suoProfilo = (await posta('/api/chi-sono', { gettone: tizio.gettone })).corpo;
  check('e dal suo profilo lo scopre, invece di trovare solo porte chiuse',
    !!suoProfilo.sospensione && /prova di sospensione/.test(suoProfilo.sospensione.motivo),
    JSON.stringify(suoProfilo.sospensione));

  const riattivato = await posta('/api/admin/riattiva', { sessione: SESSIONE, id: trovato.id });
  check('riattivandolo torna dentro', riattivato.stato === 200);
  const ritorno = await posta('/api/siediti', { gettone: tizio.gettone });
  check('e il tavolo si riapre', ritorno.stato !== 403, JSON.stringify(ritorno.corpo));

  const voci = (await posta('/api/admin/registro', { sessione: SESSIONE })).corpo.voci;
  check('tutto quanto è rimasto scritto nel registro, con chi l\'ha fatto',
    voci.some((v) => v.azione === 'sospensione' && v.chi === EMAIL_CAPO) &&
    voci.some((v) => v.azione === 'riattivazione' && v.chi === EMAIL_CAPO));
}

console.log('\n--- DAL SERVER: USCIRE CHIUDE DAVVERO ---');
{
  await posta('/api/admin/esci', { sessione: SESSIONE });
  const dopo = await posta('/api/admin/sommario', { sessione: SESSIONE });
  check('dopo l\'uscita quella sessione non vale più', dopo.stato === 401);
}

await new Promise((ok) => server.close(ok));

// ============================================================
// 3. SENZA LE VARIABILI D'AMBIENTE, LA PORTA NON ESISTE
// È la prova che conta di più: su un sito pubblico nessuno deve poter
// scoprire, provando indirizzi, che da qualche parte c'è un pannello.
// Serve un secondo server, perché le variabili si leggono una volta
// sola all'avvio.
// ============================================================
console.log('\n--- UN SERVER SENZA CREDENZIALI NON HA NESSUN PANNELLO ---');
{
  const PORTA = 8393;
  const magazzinoSuo = join(tmpdir(), 'burraco-legends-pannello-spento.json');
  try { rmSync(magazzinoSuo, { force: true }); } catch (e) {}

  const ambiente = { ...process.env, PORTA: String(PORTA), MAGAZZINO: magazzinoSuo };
  delete ambiente.ADMIN_EMAIL;
  delete ambiente.ADMIN_PASSWORD;
  delete ambiente.NON_AVVIARE;

  const figlio = spawn(process.execPath, [join(QUI, 'server.js')], {
    env: ambiente, stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await new Promise((pronto, no) => {
      const taglio = setTimeout(() => no(new Error('il server non si è alzato')), 8000);
      figlio.stdout.on('data', (d) => {
        if (String(d).includes('il tavolo è aperto') || String(d).includes('Tu apri')) {
          clearTimeout(taglio); pronto();
        }
      });
      figlio.on('error', no);
    });

    const suo = async (via, corpo) => {
      const r = await fetch('http://127.0.0.1:' + PORTA + via, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo || {})
      });
      return { stato: r.status, corpo: await r.json().catch(() => null) };
    };

    const entrata = await suo('/api/admin/entra', { gettone: 'x', password: PAROLA });
    const inventata = await suo('/api/inventata-di-sana-pianta', {});
    check('provare a entrare nel pannello dà 404, non 401', entrata.stato === 404, JSON.stringify(entrata));
    check('cioè la stessa identica risposta di un indirizzo che non esiste',
      entrata.stato === inventata.stato, entrata.stato + ' / ' + inventata.stato);
    check('e la risposta non nomina nessun pannello',
      !/pannello|admin|amministra/i.test(JSON.stringify(entrata.corpo).replace(via1(), '')),
      JSON.stringify(entrata.corpo));

    const sommario = await suo('/api/admin/sommario', { sessione: 'qualunque' });
    check('e nemmeno i numeri si riescono a chiedere', sommario.stato === 404);
  } finally {
    figlio.kill('SIGTERM');
  }
}
// L'indirizzo chiesto viene ripetuto nella risposta ("Non so cosa sia
// /api/admin/entra"): è il comportamento normale di ogni 404 del
// server, e va tolto prima di cercare la parola "admin" nel resto.
function via1() { return /\/api\/admin\/entra/g; }

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.') + '\n');
process.exit(ko === 0 ? 0 : 1);
