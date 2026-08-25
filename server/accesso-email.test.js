// Registrarsi, entrare, e riprendersi l'account quando la password se
// n'è andata. Metà di questi controlli non riguardano il caso normale —
// riguardano chi prova a usare il recupero password per entrare in casa
// d'altri, o per scoprire chi è registrato qui.
import { archivioInMemoria } from './archivio.js';
import { creaAnagrafe } from './giocatori.js';
import { creaAccessoEmail, VALIDITA_RECUPERO_MS, TENTATIVI_PRIMA_DI_ASPETTARE,
         ATTESA_DOPO_I_TENTATIVI_MS } from './accesso-email.js';
import { impastaPassword, passwordGiusta, controllaPassword, normalizzaEmail } from './password.js';

let ko = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) ko++; };

let ORA = Date.parse('2026-08-14T12:00:00Z');
const avanti = (ms) => (ORA += ms);

const CATALOGO = [];
for (let r = 1; r <= 5; r++) for (let i = 0; i < 6; i++)
  CATALOGO.push({ id: 'carta_' + r + '_' + i, rarita: r, seme: '♥', vita: 100, att: 90 });

function nuovoMondo({ conPosta = false } = {}) {
  const archivio = archivioInMemoria();
  const anagrafe = creaAnagrafe({ archivio, catalogo: CATALOGO, orologio: () => ORA, bonusBenvenuto: 0, codaBenvenuto: [] });
  const spedite = [];
  const conti = creaAccessoEmail({
    archivio, anagrafe, orologio: () => ORA,
    indirizzoSito: 'https://prova.test',
    spedisci: conPosta ? async (m) => { spedite.push(m); } : null
  });
  return { archivio, anagrafe, conti, spedite };
}
const linkDa = (testo) => (testo.match(/https:\/\/\S+/) || [])[0];

// ============================================================
console.log('--- LE PASSWORD NON SI SALVANO ---');
{
  const impastata = await impastaPassword('cavallo-batteria-graffetta');
  check('quello che si salva non è la password', !impastata.includes('cavallo'));
  check('si vede che algoritmo è, per poterlo cambiare domani', impastata.startsWith('scrypt$'));
  check('la password giusta viene riconosciuta',
    (await passwordGiusta('cavallo-batteria-graffetta', impastata)) === true);
  check('una sbagliata no', (await passwordGiusta('cavallo-batteria-graffett', impastata)) === false);
  check('e nemmeno una vuota', (await passwordGiusta('', impastata)) === false);

  const altra = await impastaPassword('cavallo-batteria-graffetta');
  check('due persone con la stessa password hanno impronte diverse', altra !== impastata);
  check('ma entrambe funzionano', (await passwordGiusta('cavallo-batteria-graffetta', altra)) === true);
  check('un\'impronta rovinata non fa entrare nessuno',
    (await passwordGiusta('x', 'roba$a$caso')) === false);
}

console.log('\n--- QUALI PASSWORD SI ACCETTANO ---');
{
  check('sette caratteri sono pochi', controllaPassword('abcdefg').ok === false);
  check('otto vanno bene', controllaPassword('abcdefgh').ok === true);
  check('"password" no', controllaPassword('password').ok === false);
  check('"12345678" no', controllaPassword('12345678').ok === false);
  check('e non può contenere la tua email',
    controllaPassword('mariorossi99', 'mariorossi@posta.it').ok === false);
  check('ma un indirizzo cortissimo non vieta mezzo alfabeto',
    controllaPassword('la-mia-lunga-password', 'p@posta.it').ok === true);
  check('una frase lunga va benissimo', controllaPassword('il mio cane si chiama fido').ok === true);
  check('e i motivi sono scritti in italiano',
    /almeno 8 caratteri/i.test(controllaPassword('abc').motivo));
}

console.log('\n--- GLI INDIRIZZI EMAIL ---');
{
  check('maiuscole e spazi si appianano', normalizzaEmail('  Mario@Posta.IT ') === 'mario@posta.it');
  check('senza chiocciola non è un indirizzo', normalizzaEmail('mario.posta.it') === null);
  check('senza punto dopo la chiocciola nemmeno', normalizzaEmail('mario@posta') === null);
  check('due chiocciole no', normalizzaEmail('a@b@c.it') === null);
  check('vuoto no', normalizzaEmail('') === null);
  check('i sottodomini vanno bene', normalizzaEmail('a@posta.azienda.co.uk') !== null);
}

// ============================================================
console.log('\n--- REGISTRARSI ---');
{
  const { conti, anagrafe } = nuovoMondo();
  const r = await conti.registrati('Pietro@Posta.IT', 'la-mia-lunga-password', 'Pietro');
  check('la registrazione riesce', r.ok === true);
  check('l\'indirizzo è appianato', r.email === 'pietro@posta.it');
  check('e si riceve un gettone', typeof r.gettone === 'string' && r.gettone.length >= 64);

  const bis = await conti.registrati('pietro@posta.it', 'un-altra-password-lunga', 'Altro');
  check('lo stesso indirizzo non si registra due volte', bis.ok === false);
  check('e si dice perché', /già registrato/i.test(bis.motivo));
  check('indicando il campo giusto', bis.campo === 'email');
  check('anche scritto con le maiuscole',
    (await conti.registrati('PIETRO@POSTA.IT', 'terza-password-lunga')).ok === false);

  check('un indirizzo storto è rifiutato',
    (await conti.registrati('non-e-una-email', 'password-lunghissima')).ok === false);
  check('una password corta è rifiutata',
    (await conti.registrati('altro@posta.it', 'corta')).ok === false);
  check('e il campo indicato è la password',
    (await conti.registrati('altro@posta.it', 'corta')).campo === 'password');
  check('nessun account è nato per sbaglio', (await anagrafe.quanti()) === 1);
}

// ============================================================
console.log('\n--- REGISTRARSI DOPO AVER GIOCATO DA OSPITE ---');
{
  const { conti, anagrafe } = nuovoMondo();
  const ospite = await anagrafe.entra(null, 'Pietro');
  await anagrafe.ricarica(ospite.gettone, 'borsa');
  await anagrafe.compraPacchetto(ospite.gettone, 5);
  const prima = await anagrafe.stato(ospite.gettone);

  const r = await conti.registrati('pietro@posta.it', 'la-mia-lunga-password', 'Pietro', ospite.gettone);
  check('la registrazione riesce', r.ok === true);
  check('ED È LO STESSO GIOCATORE', r.gettone === ospite.gettone);
  const dopo = await anagrafe.stato(r.gettone);
  check('gli sharkini restano', dopo.saldo === prima.saldo);
  check('e le carte anche', dopo.carteInTutto === prima.carteInTutto);
  check('è un giocatore solo, non due', (await anagrafe.quanti()) === 1);
}

// ============================================================
console.log('\n--- ENTRARE ---');
{
  const { conti } = nuovoMondo();
  const reg = await conti.registrati('pietro@posta.it', 'la-mia-lunga-password', 'Pietro');

  const buono = await conti.accedi('pietro@posta.it', 'la-mia-lunga-password');
  check('con la password giusta si entra', buono.ok === true);
  check('e si ritrova lo stesso giocatore', buono.gettone === reg.gettone);
  check('anche scrivendo l\'email con le maiuscole',
    (await conti.accedi('Pietro@Posta.IT', 'la-mia-lunga-password')).ok === true);

  const male = await conti.accedi('pietro@posta.it', 'password-sbagliata');
  check('con la password sbagliata non si entra', male.ok === false);

  const inesistente = await conti.accedi('nessuno@posta.it', 'qualunque-password');
  check('con un\'email mai vista nemmeno', inesistente.ok === false);

  // IL CONTROLLO CHE CONTA: le due risposte devono essere IDENTICHE,
  // altrimenti provando indirizzi si scopre chi è registrato qui
  check('e i due rifiuti dicono ESATTAMENTE la stessa cosa',
    male.motivo === inesistente.motivo);
  check('senza far capire quale delle due cose è sbagliata',
    !/password/i.test(male.motivo.replace(/email o password/i, '')));
}

// ============================================================
console.log('\n--- TROPPI TENTATIVI ---');
{
  const { conti } = nuovoMondo();
  await conti.registrati('pietro@posta.it', 'la-mia-lunga-password');

  for (let i = 0; i < TENTATIVI_PRIMA_DI_ASPETTARE; i++) {
    await conti.accedi('pietro@posta.it', 'tentativo-' + i);
  }
  const bloccato = await conti.accedi('pietro@posta.it', 'ancora-uno');
  check('dopo ' + TENTATIVI_PRIMA_DI_ASPETTARE + ' tentativi si aspetta', bloccato.bloccato === true);
  check('e si dice per quanto', bloccato.minuti > 0 && /riprova fra/i.test(bloccato.motivo));

  const conQuellaGiusta = await conti.accedi('pietro@posta.it', 'la-mia-lunga-password');
  check('nemmeno con la password giusta si entra, finché si aspetta', conQuellaGiusta.ok === false);

  avanti(ATTESA_DOPO_I_TENTATIVI_MS + 1000);
  check('passata l\'attesa si rientra',
    (await conti.accedi('pietro@posta.it', 'la-mia-lunga-password')).ok === true);

  // e il contatore si azzera entrando
  for (let i = 0; i < TENTATIVI_PRIMA_DI_ASPETTARE - 1; i++) await conti.accedi('pietro@posta.it', 'no');
  check('un accesso riuscito azzera il conto dei tentativi',
    (await conti.accedi('pietro@posta.it', 'la-mia-lunga-password')).ok === true);
}

// ============================================================
console.log('\n--- HO DIMENTICATO LA PASSWORD ---');
{
  const { conti, spedite } = nuovoMondo({ conPosta: true });
  const reg = await conti.registrati('pietro@posta.it', 'la-mia-lunga-password', 'Pietro');

  const chiesto = await conti.chiediRecupero('pietro@posta.it');
  check('la richiesta va a buon fine', chiesto.ok === true);
  check('ed è partita una mail', spedite.length === 1);
  check('al proprietario', spedite[0].a === 'pietro@posta.it');
  const collegamento = linkDa(spedite[0].testo);
  check('con dentro un collegamento', !!collegamento);
  check('che porta alla pagina giusta', collegamento.includes('/reimposta.html#gettone='));
  check('e dice cosa fare se non sei stato tu',
    /non sei stato tu/i.test(spedite[0].testo));

  // IL CONTROLLO CHE CONTA: chiedendo il recupero di un'email mai
  // vista, la risposta deve essere IDENTICA
  const perNessuno = await conti.chiediRecupero('mai-visto@posta.it');
  check('per un\'email inesistente la risposta è la stessa',
    perNessuno.messaggio === chiesto.messaggio);
  check('e non parte nessuna mail', spedite.length === 1);
  check('nemmeno per un indirizzo storto',
    (await conti.chiediRecupero('non-e-una-email')).messaggio === chiesto.messaggio);

  const gettone = new URL(collegamento).hash.split('gettone=')[1];

  const valido = await conti.collegamentoValido(gettone);
  check('il collegamento risulta valido', valido.ok === true);
  check('e dice per quale indirizzo', valido.email === 'pietro@posta.it');

  const corta = await conti.reimposta(gettone, 'corta');
  check('non si reimposta con una password debole', corta.ok === false);

  const fatto = await conti.reimposta(gettone, 'la-mia-nuova-lunga-password');
  check('con una buona sì', fatto.ok === true);
  check('ed è lo stesso giocatore di prima', fatto.gettone === reg.gettone);
  check('la password nuova funziona',
    (await conti.accedi('pietro@posta.it', 'la-mia-nuova-lunga-password')).ok === true);
  check('LA VECCHIA NON FUNZIONA PIÙ',
    (await conti.accedi('pietro@posta.it', 'la-mia-lunga-password')).ok === false);

  const bis = await conti.reimposta(gettone, 'un-altra-password-ancora');
  check('lo stesso collegamento non si usa due volte', bis.ok === false);
  check('e si dice perché', /già stato usato/i.test(bis.motivo));
  check('la password è rimasta quella nuova',
    (await conti.accedi('pietro@posta.it', 'la-mia-nuova-lunga-password')).ok === true);
}

// il collegamento scade
{
  const { conti, spedite } = nuovoMondo({ conPosta: true });
  await conti.registrati('pietro@posta.it', 'la-mia-lunga-password');
  await conti.chiediRecupero('pietro@posta.it');
  const gettone = new URL(linkDa(spedite[0].testo)).hash.split('gettone=')[1];

  avanti(VALIDITA_RECUPERO_MS - 1000);
  check('poco prima dell\'ora è ancora buono',
    (await conti.collegamentoValido(gettone)).ok === true);
  avanti(2000);
  check('passata l\'ora scade', (await conti.collegamentoValido(gettone)).ok === false);
  const tardi = await conti.reimposta(gettone, 'password-nuova-lunghissima');
  check('e non si può più usare', tardi.ok === false);
  check('dicendo che è scaduto', /scaduto/i.test(tardi.motivo));
  check('la password vecchia funziona ancora',
    (await conti.accedi('pietro@posta.it', 'la-mia-lunga-password')).ok === true);
}

// chiedere più recuperi: usarne uno annulla gli altri
{
  const { conti, spedite } = nuovoMondo({ conPosta: true });
  await conti.registrati('pietro@posta.it', 'la-mia-lunga-password');
  await conti.chiediRecupero('pietro@posta.it');
  await conti.chiediRecupero('pietro@posta.it');
  await conti.chiediRecupero('pietro@posta.it');
  check('tre richieste, tre mail', spedite.length === 3);

  const gettoni = spedite.map((m) => new URL(linkDa(m.testo)).hash.split('gettone=')[1]);
  check('e tre collegamenti diversi', new Set(gettoni).size === 3);

  check('usando l\'ultimo si cambia la password',
    (await conti.reimposta(gettoni[2], 'la-nuovissima-password')).ok === true);
  check('GLI ALTRI DUE DECADONO',
    (await conti.collegamentoValido(gettoni[0])).ok === false &&
    (await conti.collegamentoValido(gettoni[1])).ok === false);
  check('e non si possono usare',
    (await conti.reimposta(gettoni[0], 'ancora-un-altra-password')).ok === false);
}

// ============================================================
console.log('\n--- COLLEGAMENTI INVENTATI ---');
{
  const { conti } = nuovoMondo();
  await conti.registrati('pietro@posta.it', 'la-mia-lunga-password');
  for (const [etichetta, g] of [
    ['inventato di sana pianta', 'a'.repeat(64)],
    ['vuoto', ''],
    ['nullo', null],
    ['corto', 'abc'],
    ['un numero', 123456]
  ]) {
    const r = await conti.reimposta(g, 'password-lunga-e-buona');
    check(etichetta + ' → non cambia niente', r.ok === false);
  }
  check('la password è ancora quella',
    (await conti.accedi('pietro@posta.it', 'la-mia-lunga-password')).ok === true);
}

// ============================================================
console.log('\n--- SENZA POSTA CONFIGURATA ---');
{
  const { conti } = nuovoMondo({ conPosta: false });
  await conti.registrati('pietro@posta.it', 'la-mia-lunga-password');
  const r = await conti.chiediRecupero('pietro@posta.it');
  check('il recupero funziona lo stesso', r.ok === true);
  check('e il collegamento viene restituito invece che spedito', !!r.collegamentoDiProva);
  check('e funziona davvero',
    (await conti.reimposta(new URL(r.collegamentoDiProva).hash.split('gettone=')[1],
                           'la-password-nuova-lunga')).ok === true);

  const chi = await conti.comeSeiRegistrato((await conti.accedi('pietro@posta.it', 'la-password-nuova-lunga')).gettone);
  check('e il server dice che la posta non c\'è', chi.postaConfigurata === false);
  check('mentre l\'account risulta registrato', chi.registrato === true && chi.email === 'pietro@posta.it');
}

// ============================================================
console.log('\n--- LA PASSWORD NON ESCE MAI ---');
{
  const { conti, archivio, anagrafe } = nuovoMondo();
  const reg = await conti.registrati('pietro@posta.it', 'la-mia-lunga-password', 'Pietro');
  const risposte = [
    reg,
    await conti.accedi('pietro@posta.it', 'la-mia-lunga-password'),
    await conti.comeSeiRegistrato(reg.gettone),
    await anagrafe.stato(reg.gettone)
  ];
  check('nessuna risposta contiene la password',
    risposte.every((r) => !JSON.stringify(r).includes('la-mia-lunga-password')));
  check('e nemmeno la sua impronta',
    risposte.every((r) => !JSON.stringify(r).includes('scrypt$')));

  const dentro = await archivio.leggi('giocatore:' + reg.gettone);
  check('nell\'archivio c\'è l\'impronta, non la password',
    dentro.password.startsWith('scrypt$') && !dentro.password.includes('la-mia-lunga-password'));
}

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
process.exit(ko === 0 ? 0 : 1);
