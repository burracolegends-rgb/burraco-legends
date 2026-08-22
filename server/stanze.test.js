// Le stanze viste da fuori, come le userà chi gioca — e come proverà a
// usarle chi vuole barare. Orologio finto, così il tempo si può far
// passare senza aspettarlo davvero.
import { creaRegistroStanze, generatoreDaSeme, rigioca, ATTESA_MASSIMA_MS } from './stanze.js';
import { SECONDI_DI_STUDIO } from '../engine/partita.js';

let ko = 0;
const check = (l, c, d) => { console.log((c ? 'OK   ' : 'FAIL ') + l + (c || !d ? '' : '  <- ' + d)); if (!c) ko++; };

let ORA = Date.parse('2026-08-14T21:00:00Z');
const avanti = (ms) => (ORA += ms);
const nuovoRegistro = () => creaRegistroStanze({ orologio: () => ORA });

// Fra l'ingresso del secondo giocatore e la prima mossa ci sono i trenta
// secondi in cui si guarda il tavolo. Le prove che vogliono GIOCARE li
// saltano; quella che li mette alla prova sta piu' in fondo e non usa
// questa scorciatoia.
const saltaLoStudio = () => avanti(SECONDI_DI_STUDIO * 1000);


// piccolo aiuto: `guarda` risponde con una richiamata, qui la aspetto
const guarda = (r, codice, segreto, da) =>
  new Promise((ok) => r.guarda(codice, segreto, da, ok));

// ============================================================
// APRIRE E ENTRARE
// ============================================================
console.log('--- IL TAVOLO ---');
{
  const r = nuovoRegistro();
  const casa = r.apri('Pietro');

  check('il tavolo si apre', casa.ok === true);
  check('il codice è di sei caratteri', /^[A-Z0-9]{6}$/.test(casa.codice));
  check('niente lettere che si confondono a voce', !/[OIL01]/.test(casa.codice));
  check('chi apre è il primo giocatore', casa.giocatore === 0);
  check('e riceve un segreto lungo', typeof casa.segreto === 'string' && casa.segreto.length >= 32);

  const primo = await guarda(r, casa.codice, casa.segreto, -1);
  check('da solo, si aspetta il secondo', primo.inAttesaDelSecondo === true);
  check('e non c\'è ancora nessuna partita', primo.vista === null);

  const ospite = r.entra(casa.codice.toLowerCase(), 'Amico');
  saltaLoStudio();
  check('si entra anche scrivendo il codice in minuscolo', ospite.ok === true);
  check('l\'ospite è il secondo giocatore', ospite.giocatore === 1);
  check('e ha un segreto diverso', ospite.segreto !== casa.segreto);

  check('un terzo non entra', r.entra(casa.codice, 'Terzo').ok === false);
  check('e gli si dice perché', /completo/i.test(r.entra(casa.codice, 'Terzo').motivo));
  check('un codice inventato non apre niente', r.entra('ZZZZZZ', 'Tale').ok === false);

  const dopo = await guarda(r, casa.codice, casa.segreto, -1);
  check('appena entra il secondo, le carte sono distribuite', dopo.vista !== null);
  check('e ognuno ha undici carte', dopo.vista.giocatori[0].mano.length === 11);
  check('si vedono i nomi dei due', dopo.nomi[0] === 'Pietro' && dopo.nomi[1] === 'Amico');
}

// ============================================================
// IL SEGRETO È L'IDENTITÀ
// ============================================================
console.log('\n--- CHI SEI ---');
{
  const r = nuovoRegistro();
  const a = r.apri('A');
  const b = r.entra(a.codice, 'B');
  saltaLoStudio();

  const va = await guarda(r, a.codice, a.segreto, -1);
  const vb = await guarda(r, a.codice, b.segreto, -1);
  check('lo stesso tavolo, due viste diverse', va.vista.io === 0 && vb.vista.io === 1);
  check('ognuno vede la sua mano', va.vista.giocatori[0].mano && vb.vista.giocatori[1].mano);
  check('e non quella dell\'altro',
    va.vista.giocatori[1].mano === undefined && vb.vista.giocatori[0].mano === undefined);

  const senza = await guarda(r, a.codice, 'inventato', -1);
  check('senza il segreto giusto non si guarda niente', senza.ok === false);
  const vuoto = await guarda(r, a.codice, '', -1);
  check('nemmeno con un segreto vuoto', vuoto.ok === false);

  check('il segreto non compare mai nelle viste',
    !JSON.stringify(va).includes(a.segreto) && !JSON.stringify(va).includes(b.segreto));

  // e adesso il tentativo che conta: giocare al posto dell'altro
  const furbo = r.muovi(a.codice, b.segreto, { tipo: 'pesca', giocatore: 0 });
  check('col mio segreto non gioco il turno dell\'altro', furbo.ok === false);
  check('e il motivo lo dice', /turno/i.test(furbo.motivo));
  const buono = r.muovi(a.codice, a.segreto, { tipo: 'pesca' });
  check('chi è di turno gioca', buono.ok === true);

  const finto = r.muovi(a.codice, 'segreto-che-mi-invento', { tipo: 'pesca' });
  check('un segreto inventato non muove niente', finto.ok === false);
}

// ============================================================
// LA DOMANDA TENUTA APPESA
// È quello che fa arrivare la mossa dell'altro subito, senza chiedere
// in continuazione.
// ============================================================
console.log('\n--- L\'ATTESA ---');
{
  const r = nuovoRegistro();
  const a = r.apri('A');
  const b = r.entra(a.codice, 'B');
  saltaLoStudio();
  const partenza = (await guarda(r, a.codice, b.segreto, -1)).versione;

  let arrivato = null;
  // B chiede novità: nessuna, quindi resta appeso
  const appesa = guarda(r, a.codice, b.segreto, partenza).then((v) => (arrivato = v));
  await new Promise((ok) => setTimeout(ok, 40));
  check('finché non succede niente, la domanda resta appesa', arrivato === null);

  // A gioca
  r.muovi(a.codice, a.segreto, { tipo: 'pesca' });
  await appesa;
  check('appena l\'altro muove, la risposta arriva', arrivato !== null);
  check('e porta una versione più alta', arrivato.versione > partenza);
  check('B vede che A ha pescato',
    arrivato.vista.giocatori[0].manoQuante > 11);
  check('ma continua a non vedere le sue carte',
    arrivato.vista.giocatori[0].mano === undefined);

  // chi chiede una versione vecchia riceve subito, senza aspettare
  const subito = await guarda(r, a.codice, b.segreto, 0);
  check('chi è rimasto indietro riceve subito', subito.versione >= arrivato.versione);
}

// ============================================================
// IL TEMPO CHE SCORRE DA SOLO
// ============================================================
console.log('\n--- IL TEMPO ---');
{
  const r = nuovoRegistro();
  const a = r.apri('A');
  const b = r.entra(a.codice, 'B');
  saltaLoStudio();
  r.muovi(a.codice, a.segreto, { tipo: 'pesca' });
  const prima = (await guarda(r, a.codice, b.segreto, -1)).versione;

  check('senza tempo scaduto il battito non cambia niente',
    r.battito().scadenze === 0);

  avanti(70000);                                  // più di un minuto
  const battuta = r.battito();
  check('passato il minuto, il turno scade', battuta.scadenze === 1);

  const dopo = await guarda(r, a.codice, b.segreto, -1);
  check('e la versione è salita, quindi i tavoli si aggiornano', dopo.versione > prima);
  check('il turno è passato all\'altro', dopo.vista.diChiEIlTurno === 1);
  check('nel registro resta scritto che è scaduto',
    r.registroDi(a.codice).mosse.some((m) => m.tipo === 'tempo_scaduto'));
}

// una stanza abbandonata sparisce
{
  const r = nuovoRegistro();
  const a = r.apri('A');
  check('la stanza c\'è', r.quante() === 1);
  avanti(3 * 60 * 60 * 1000);
  r.battito();
  check('dopo ore senza nessuno, la stanza si chiude', r.quante() === 0);
  check('e non risponde più', (await guarda(r, a.codice, a.segreto, -1)).ok === false);
}

// ============================================================
// IL REGISTRO
// ============================================================
console.log('\n--- IL REGISTRO ---');
{
  const r = nuovoRegistro();
  const a = r.apri('A');
  const b = r.entra(a.codice, 'B');
  saltaLoStudio();

  r.muovi(a.codice, a.segreto, { tipo: 'pesca' });
  r.muovi(a.codice, b.segreto, { tipo: 'pesca' });            // fuori turno: rifiutata
  const partita = r.stanza(a.codice).partita;
  r.muovi(a.codice, a.segreto, { tipo: 'scarta', carta: partita.players[0].hand[0].id });

  const reg = r.registroDi(a.codice);
  check('il registro parte dall\'inizio partita', reg.mosse[0].tipo === 'inizio');
  check('e porta con sé il seme del caso', typeof reg.seme === 'number');
  check('ci sono tutte le mosse, anche quelle rifiutate',
    reg.mosse.filter((m) => m.tipo === 'mossa').length === 3);
  check('di ognuna si sa se è passata',
    reg.mosse.filter((m) => m.tipo === 'mossa' && m.accettata).length === 2);
  check('e perché no, quando no',
    reg.mosse.some((m) => m.motivo && /turno/i.test(m.motivo)));
  check('nel registro non ci sono i segreti',
    !JSON.stringify(reg).includes(a.segreto) && !JSON.stringify(reg).includes(b.segreto));
  check('e nemmeno le mani: solo seme e mosse',
    !JSON.stringify(reg).includes('"hand"'));
}

// ============================================================
// RIGIOCARE UNA PARTITA
// È la ragione per cui il registro esiste: rivedere un difetto invece
// di chiedersi "aspetta, cos'avevi fatto?".
// ============================================================
console.log('\n--- RIGIOCARE ---');
{
  const r = nuovoRegistro();
  const a = r.apri('A');
  const b = r.entra(a.codice, 'B');
  saltaLoStudio();
  const stanza = r.stanza(a.codice);

  // una partita vera, giocata fino in fondo
  let mosse = 0;
  for (let giro = 0; giro < 200 && stanza.partita.status === 'in_progress'; giro++) {
    avanti(3000);
    const chi = stanza.partita.currentPlayerIndex;
    const segreto = chi === 0 ? a.segreto : b.segreto;
    const p = stanza.partita.players[chi];

    if (!p.hasDrawnThisTurn) { r.muovi(a.codice, segreto, { tipo: 'pesca' }); mosse++; }
    if (stanza.partita.status !== 'in_progress') break;

    const perValore = {};
    for (const c of p.hand) {
      if (c.isJolly || c.isPinella) continue;
      (perValore[c.value] = perValore[c.value] || []).push(c);
    }
    const tris = Object.values(perValore).find((g) => g.length >= 3);
    if (tris) { r.muovi(a.codice, segreto, { tipo: 'cala', carte: tris.slice(0, 3).map((c) => c.id) }); mosse++; }

    if (!p.hand.length) break;
    r.muovi(a.codice, segreto, { tipo: 'scarta', carta: p.hand[p.hand.length - 1].id });
    mosse++;
  }

  const originale = stanza.partita;
  console.log('   → partita di ' + mosse + ' mosse, finale: ' + originale.status +
              (originale.winner !== null ? ' (vince ' + originale.winner + ', ' + originale.winReason + ')' : ''));

  const ripetuta = rigioca(r.registroDi(a.codice));
  const impronta = (p) => JSON.stringify({
    stato: p.status, vincitore: p.winner, motivo: p.winReason,
    mani: p.players.map((x) => x.hand.map((c) => c.id)),
    scarti: p.scarti.map((c) => c.id),
    calate: p.players.map((x) => x.melds.map((m) => m.cards.map((c) => c.id))),
    vita: p.players.map((x) => Object.values(x.characters).map((c) => c.pv))
  });

  check('la partita rigiocata dal registro finisce identica',
    impronta(ripetuta.partita) === impronta(originale));
  check('e nessuna mossa si comporta diversamente', ripetuta.differenze.length === 0);
  check('la partita era lunga davvero', mosse > 40);
}

// ============================================================
// IL CASO RIPETIBILE
// ============================================================
console.log('\n--- IL CASO ---');
{
  const uno = generatoreDaSeme(12345);
  const due = generatoreDaSeme(12345);
  const tre = generatoreDaSeme(999);
  const serie = (g) => Array.from({ length: 200 }, () => g());
  const a = serie(uno), b = serie(due), c = serie(tre);

  check('lo stesso seme dà la stessa sequenza', a.join() === b.join());
  check('semi diversi danno sequenze diverse', a.join() !== c.join());
  check('i valori stanno fra 0 e 1', a.every((v) => v >= 0 && v < 1));
  check('e non si ripetono subito', new Set(a).size > 190);
}

// ============================================================
// DUE TAVOLI NON SI CONFONDONO
// ============================================================
console.log('\n--- DUE TAVOLI ---');
{
  const r = nuovoRegistro();
  const a1 = r.apri('A'); const b1 = r.entra(a1.codice, 'B');
  saltaLoStudio();
  const a2 = r.apri('C'); const b2 = r.entra(a2.codice, 'D');
  saltaLoStudio();

  check('due codici diversi', a1.codice !== a2.codice);
  check('due partite diverse',
    JSON.stringify(r.stanza(a1.codice).partita.tallone.map((c) => c.id)) !==
    JSON.stringify(r.stanza(a2.codice).partita.tallone.map((c) => c.id)));
  check('il segreto di un tavolo non apre l\'altro',
    r.muovi(a2.codice, a1.segreto, { tipo: 'pesca' }).ok === false);
  check('e non fa nemmeno guardare',
    (await guarda(r, a2.codice, a1.segreto, -1)).ok === false);

  r.muovi(a1.codice, a1.segreto, { tipo: 'pesca' });
  check('muovere in un tavolo non tocca l\'altro',
    r.stanza(a2.codice).partita.players[0].hand.length === 11);
}

// ============================================================
// I LIMITI, CHE IN CASA NON SERVIVANO E SU INTERNET SÌ
// ============================================================
console.log('\n--- I LIMITI ---');
{
  // tetto alto di proposito: qui si prova il limite per indirizzo, e se
  // il tetto complessivo scattasse per primo il controllo direbbe di sì
  // per il motivo sbagliato
  const r = creaRegistroStanze({ orologio: () => ORA, stanzeMassime: 100, tavoliPerIndirizzo: 2 });
  check('il primo tavolo si apre', r.apri('A', '1.2.3.4').ok === true);
  check('il secondo pure', r.apri('A', '1.2.3.4').ok === true);
  const terzo = r.apri('A', '1.2.3.4');
  check('al terzo dallo stesso indirizzo si dice basta', terzo.ok === false);
  check('e si spiega perché', /troppi tavoli/i.test(terzo.motivo));
  check('ma da un altro indirizzo si apre lo stesso',
    r.apri('B', '5.6.7.8').ok === true);

  // il tetto complessivo
  const pieno = creaRegistroStanze({ orologio: () => ORA, stanzeMassime: 2 });
  pieno.apri('A', 'a'); pieno.apri('B', 'b');
  const troppo = pieno.apri('C', 'c');
  check('oltre il tetto di tavoli il server dice di no', troppo.ok === false);
  check('e lo dice con garbo', /pieno/i.test(troppo.motivo));

  // passata un'ora si ricomincia a contare
  avanti(61 * 60 * 1000);
  r.battito();
  check('dopo un\'ora si può riaprire', r.apri('A', '1.2.3.4').ok === true);

  // senza indirizzo (server in locale) il limite non scatta
  const casa = creaRegistroStanze({ orologio: () => ORA, tavoliPerIndirizzo: 1 });
  casa.apri('A'); 
  check('sul computer di casa, senza indirizzo, nessun limite',
    casa.apri('A').ok === true);
}

// ============================================================
// UN COLPO DATO RESTA DATO
//
// Il tavolo aveva un difetto che sembrava impossibile: usavi l'abilita'
// speciale, vedevi il danno e i punti magia calare, e al giro dopo
// tornava tutto com'era. La pagina applicava l'abilita' a sé stessa
// senza dirlo al server, e alla prima risposta del server — che di
// quel colpo non sapeva niente — la sua verita' cancellava la finzione.
// Qui si controlla la parte del server: chiesta l'abilita', il danno
// c'e', ci resta, e lo vedono tutti e due.
// ============================================================
console.log('\n--- UN COLPO DATO RESTA DATO ---');
{
  const r = creaRegistroStanze({ orologio: () => ORA, caso: generatoreDaSeme(99) });
  const a = r.apri('A');
  const b = r.entra(a.codice, 'B');
  saltaLoStudio();

  const vistaDi = async (chi, seg) => (await guarda(r, a.codice, seg, -1)).vista;
  const semi = Object.keys((await vistaDi(0, a.segreto)).giocatori[0].personaggi);
  const pvTotali = (v, quale) =>
    semi.reduce((t, s) => t + v.giocatori[quale].personaggi[s].pv, 0);

  // punti magia a sufficienza per pagare l'abilita'
  const chiInizia = (await vistaDi(0, a.segreto)).diChiEIlTurno;
  const segreto = chiInizia === 0 ? a.segreto : b.segreto;
  const altroSegreto = chiInizia === 0 ? b.segreto : a.segreto;

  const bersaglio = chiInizia === 0 ? 1 : 0;

  // I punti magia crescono di 2 a ogni proprio turno e partono da zero:
  // per pagare un'abilita' bisogna prima giocare qualche giro.
  const segretoDi = (chi) => (chi === 0 ? a.segreto : b.segreto);
  const scartaQualcosa = (chi) => {
    const stanza = r.stanza(a.codice);
    const mano = stanza.partita.players[chi].hand;
    return r.muovi(a.codice, segretoDi(chi), { tipo: 'scarta', carta: mano[0].id });
  };
  for (let giro = 0; giro < 8; giro++) {
    const stanza = r.stanza(a.codice);
    const chi = stanza.partita.currentPlayerIndex;
    if (chi === chiInizia && stanza.partita.players[chi].puntiMagia >= 6) break;
    avanti(1000);
    r.muovi(a.codice, segretoDi(chi), { tipo: 'pesca' });
    avanti(1000);
    scartaQualcosa(chi);
  }

  const pvPrimaDelColpo = pvTotali(await vistaDi(chiInizia, segreto), bersaglio);
  avanti(1000);
  r.muovi(a.codice, segreto, { tipo: 'pesca' });
  const colpo = r.muovi(a.codice, segreto,
    { tipo: 'abilita', seme: semi[0], bersaglio: semi[1] });

  check('l\'abilita\' viene accettata dal server', colpo.ok === true, colpo.motivo);
  if (colpo.ok) {
    const dopo = await vistaDi(chiInizia, segreto);
    check('il danno risulta nella vista di chi ha colpito',
      pvTotali(dopo, bersaglio) < pvPrimaDelColpo);
    // nella vista i giocatori restano ai loro posti (0 e 1) per tutti e
    // due: a ribaltarli e' il tavolo, non il server
    const suo = await vistaDi(1 - chiInizia, altroSegreto);
    check('e anche in quella di chi l\'ha subito',
      pvTotali(suo, bersaglio) < pvPrimaDelColpo);

    // il tempo passa, nessuno tocca niente: il danno non deve tornare indietro
    avanti(5000);
    r.battito();
    const piuTardi = await vistaDi(chiInizia, segreto);
    check('e qualche secondo dopo il danno e\' ancora li\'',
      pvTotali(piuTardi, bersaglio) === pvTotali(dopo, bersaglio));

    check('i punti magia pagati restano scalati',
      piuTardi.giocatori[chiInizia].puntiMagia < 15);
  }

  // la mossa deve essere passata dal server: il registro la conserva
  const reg = r.registroDi(a.codice);
  check('la richiesta di abilita\' e\' finita nel registro del server',
    reg.mosse.some((x) => x.azione && x.azione.tipo === 'abilita'));
}

// ============================================================
// I TRENTA SECONDI IN CUI SI GUARDA IL TAVOLO
//
// Appena distribuite le carte si era gia' dentro il proprio minuto:
// bisognava decidere senza aver nemmeno visto quali eroi aveva schierato
// l'altro. Ora la partita comincia trenta secondi dopo. La cosa che
// conta e' che quei trenta secondi non li paghi nessuno: gli orologi
// partono da li'.
// ============================================================
console.log('\n--- I TRENTA SECONDI PRIMA DI COMINCIARE ---');
{
  const r = nuovoRegistro();
  const a = r.apri('A');
  const b = r.entra(a.codice, 'B');
  const apertura = ORA;

  const v0 = (await guarda(r, a.codice, a.segreto, -1)).vista;
  check('la vista dice a che ora si comincia', typeof v0.iniziaAlle === 'string');
  check('e sono trenta secondi dopo la distribuzione',
    Math.round((Date.parse(v0.iniziaAlle) - apertura) / 1000) === SECONDI_DI_STUDIO);

  const subito = r.muovi(a.codice, a.segreto, { tipo: 'pesca' });
  check('chi prova a giocare subito viene fermato', subito.ok === false);
  check('e gli si dice quanto manca', /si comincia fra \d+ second/i.test(subito.motivo || ''));

  avanti(10000);
  check('a dieci secondi ancora no', r.muovi(a.codice, a.segreto, { tipo: 'pesca' }).ok === false);

  // esattamente allo scoccare: si gioca
  ORA = apertura + SECONDI_DI_STUDIO * 1000;
  const via = r.muovi(a.codice, a.segreto, { tipo: 'pesca' });
  check('allo scoccare dei trenta secondi si gioca', via.ok === true, via.motivo);

  const v = (await guarda(r, a.codice, a.segreto, -1)).vista;
  check('lo studio non e\' stato scalato a chi ha giocato',
    v.giocatori[0].secondiRimasti === 360,
    'gli restano ' + v.giocatori[0].secondiRimasti + 's invece di 360');
  check('ne\' all\'altro', v.giocatori[1].secondiRimasti === 360);

  // e il minuto del turno non e' partito durante l'attesa
  avanti(59000);
  r.battito();
  const ancora = (await guarda(r, a.codice, a.segreto, -1)).vista;
  check('nemmeno il minuto del turno e\' partito durante lo studio',
    ancora.stato === 'in_progress');

  // la partita resta rigiocabile identica
  const rip = rigioca(r.registroDi(a.codice));
  check('la partita si rigioca uguale anche con lo studio davanti',
    rip.differenze.length === 0);
}

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.'));
process.exit(ko === 0 ? 0 : 1);
