// ============================================================
// BURRACO LEGENDS — avversario artificiale, capacità MEDIA.
//
// Livello voluto: un giocatore discreto, non un campione. Sa fare le cose
// giuste di base — riconosce tris e scale, cala, valuta il monte scarti,
// non spreca le matte, non si suicida scartando l'ultima carta — ma non
// calcola le mosse future e non conta le carte uscite. Serve ad avere un
// avversario credibile con cui provare il gioco, non a essere imbattibile.
//
// DA DOVE VIENE LA PARTE "BURRACO" DI QUESTO CERVELLO
// Le tre decisioni difficili del burraco — se raccogliere il monte, cosa
// scartare, come non far durare la mano in eterno — NON sono state
// inventate qui: vengono dal bot di Burraco Pulito, dove sono già state
// misurate e corrette sul campo per mesi. Sono state riscritte per questo
// motore, non copiate: là si ragiona per squadre e per posti al tavolo,
// qui il pozzetto è del singolo giocatore e la chiusura vuole un gioco da
// 5 carte invece che da 7. Dove le due regole divergono comanda QUESTO
// gioco — copiare alla lettera avrebbe prodotto un bot che gioca bene a
// un burraco che non è il nostro.
//
// Quello che è rimasto fuori, e perché: nel progetto d'origine c'era un
// livello "esperto" che evitava di scartare carte utili all'avversario.
// Provato su 250 mani ha vinto il 48% — cioè niente. Non è stato portato:
// aggiunge codice e non si sente giocando.
//
// LA PARTE "LEGENDS" È NOSTRA
// Abilità degli eroi, punti magia e Carte Magiche non esistono in Burraco
// Pulito: da lì non c'era niente da prendere. Quelle regole stanno in
// fondo a questo file e sono scritte per questo gioco soltanto.
//
// Usa SOLO le azioni pubbliche del motore (actionDraw, actionLayMeld,
// actionDiscard, usaAbilitaSpeciale, giocaCartaMagica): non tocca lo
// stato di nascosto, quindi non può barare — se una mossa è illecita il
// motore la rifiuta come farebbe con un umano. E non sbircia mai la mano
// dell'avversario: un bot che sbircia non è difficile, è sleale, e si
// sente anche quando non si sa spiegare perché.
// ============================================================

import { validateMeld, cardPointValue, SUITS, isValidGroup, isValidSequence, isWildcard } from './core-rules.js';
import { actionDraw, actionTakeDiscardPile, actionLayMeld, actionAttachToMeld, actionDiscard,
         usaAbilitaSpeciale, giocaCartaMagica, costoAbilitaDi } from './partita.js';

const matta = (c) => isWildcard(c);

// --- ricerca delle combinazioni calabili ------------------------------

// Tris: 3+ carte dello stesso valore (semi diversi). Le matte si usano
// solo se servono davvero (vedi convieneUsareMatta, più sotto).
function cercaTris(mano, usaMatte) {
  const perValore = {};
  for (const c of mano) { if (!matta(c)) (perValore[c.value] = perValore[c.value] || []).push(c); }
  const trovate = [];
  for (const v of Object.keys(perValore)) {
    const g = perValore[v];
    if (g.length >= 3) { trovate.push(g.slice(0, Math.min(g.length, 8))); continue; }
    if (g.length === 2 && usaMatte) {
      const m = mano.find((c) => matta(c));
      if (m) { const prova = [...g, m]; if (validateMeld(prova).ok) trovate.push(prova); }
    }
  }
  return trovate;
}

// Scale: 3+ carte consecutive dello stesso seme.
//
// L'ASSO STA A DUE POSTI, e questo bot ne vedeva uno solo.
// Nel Burraco l'asso vale 1 sotto il 2 (A-2-3) e 14 sopra il re (Q-K-A).
// Qui si ordinava per `value` e si cercavano i consecutivi con +1: con
// l'asso a 1, la donna a 12 e il re a 13, Q-K-A non veniva MAI trovata.
// Il bot si teneva in mano donna, re e asso dello stesso seme senza
// accorgersi di avere una scala pronta da calare. Il motore la accetta
// da sempre (isValidSequence prova entrambe le letture): il difetto era
// solo qui, in chi doveva proporgliela. Ora si fanno due giri, uno per
// ciascuna lettura dell'asso, e si tengono le combinazioni distinte.
function cercaScale(mano, usaMatte) {
  const trovate = [];

  const giro = (valoreDi) => {
    for (const s of SUITS) {
      const delSeme = mano
        .filter((c) => !matta(c) && c.suit === s)
        .map((c) => ({ carta: c, v: valoreDi(c) }))
        .sort((a, b) => a.v - b.v);
      if (delSeme.length < 2) continue;

      // corse consecutive naturali
      let corsa = [delSeme[0]];
      for (let i = 1; i < delSeme.length; i++) {
        const prec = corsa[corsa.length - 1];
        if (delSeme[i].v === prec.v + 1) corsa.push(delSeme[i]);
        else if (delSeme[i].v === prec.v) continue;   // doppione: lo salto
        else {
          if (corsa.length >= 3) trovate.push(corsa.map((x) => x.carta));
          corsa = [delSeme[i]];
        }
      }
      if (corsa.length >= 3) trovate.push(corsa.map((x) => x.carta));

      // con una matta: si prova a tappare un buco fra due pezzi di corsa.
      // Comprende il caso che vale di più — 5-6-8 più la matta al posto
      // del 7, cioè una scala da QUATTRO, più vicina al burraco di un
      // tris da tre e allungabile da entrambi i capi.
      if (usaMatte) {
        const m = mano.find((c) => matta(c));
        if (m) {
          for (let i = 0; i < delSeme.length - 1; i++) {
            for (let j = i + 1; j < delSeme.length; j++) {
              const pezzo = delSeme.slice(i, j + 1).map((x) => x.carta);
              if (pezzo.length < 2) continue;
              const prova = [...pezzo, m];
              if (prova.length >= 3 && validateMeld(prova).ok) trovate.push(prova);
            }
          }
        }
      }
    }
  };

  giro((c) => c.value);                                    // asso basso: A-2-3
  giro((c) => (c.value === 1 ? 14 : c.value));             // asso alto: Q-K-A

  // Lo stesso gruppo di carte esce da entrambi i giri quando l'asso non
  // c'entra (una scala 5-6-7 non cambia): si tengono le combinazioni
  // distinte confrontando gli id.
  const viste = new Set();
  return trovate.filter((s) => {
    const firma = s.map((c) => c.id).sort().join(',');
    if (viste.has(firma)) return false;
    viste.add(firma);
    return true;
  });
}

// Queste carte si legano a un gioco già in tavola? Si costruisce
// l'insieme risultante e si chiede alla REGOLA VERA se sta in piedi: è
// l'unico modo affidabile, perché non è un'ipotesi nostra su come
// funziona il gioco, è il gioco stesso che risponde.
function siLegaInsieme(gioco, carte) {
  const insieme = gioco.cards.concat(carte);
  const esito = gioco.type === 'group' ? isValidGroup(insieme) : isValidSequence(insieme);
  return !!(esito && esito.ok);
}

// COSA SI PUÒ ATTACCARE A UN GIOCO, PRENDENDO PIÙ CARTE INSIEME.
//
// Provando una carta per volta si perde il caso in cui ne servono DUE per
// legarsi: con 5-6-7 di picche in tavola e 8-9 in mano, l'8 da solo si
// lega e va bene — ma con 5-6-7 in tavola e 9-10 in mano non si lega
// niente, mentre offrendo 8-9-10... nemmeno, l'8 non c'è. Il caso che si
// perdeva davvero è quello in cui il gioco le vuole entrambe per restare
// valido. Qui si offrono gruppi di carte contigue, dai più numerosi ai
// più piccoli — i più numerosi valgono di più perché avvicinano il
// burraco — e si tiene il primo che il gioco accetta.
function cercaAggancioMultiplo(gioco, mano) {
  const candidate = mano.filter((c) => !matta(c));
  if (candidate.length < 2) return null;

  // Per le scale hanno senso le carte dello stesso seme del gioco, per i
  // tris quelle dello stesso valore: si restringe il campo, altrimenti le
  // combinazioni da provare esplodono.
  const utili = gioco.type === 'sequence'
    ? candidate.filter((c) => c.suit === gioco.suit).sort((a, b) => a.value - b.value)
    : candidate.filter((c) => c.value === gioco.value);
  if (utili.length < 2) return null;

  for (let quante = Math.min(4, utili.length); quante >= 2; quante--) {
    for (let i = 0; i + quante <= utili.length; i++) {
      const fetta = utili.slice(i, i + quante);
      if (siLegaInsieme(gioco, fetta)) return fetta;
    }
  }
  return null;
}

// QUANDO BRUCIARE UNA MATTA.
// Una matta sprecata in un tris da tre carte non serve a niente: meglio
// tenerla per allungare un gioco verso il burraco. Si spende quando ce
// n'è una di scorta, quando la fine si avvicina, o quando serve a
// svuotare la mano per prendere il pozzetto — che è il momento in cui
// vale più di qualunque punto.
function convieneUsareMatta(mano, tallone, pozzettoTaken) {
  if (mano.filter(matta).length >= 2) return true;
  if (tallone.length < 15) return true;
  if (!pozzettoTaken && mano.length <= 4) return true;
  return false;
}

// Quante carte resterebbero in mano dopo aver calato queste, e se quella
// posizione è ammessa dalle regole. Serve a non incastrarsi da soli.
function calataAmmessa(giocatore, carte, manoIpotetica) {
  const mano = manoIpotetica || giocatore.hand;
  const ids = new Set(carte.map((c) => c.id));
  const resto = mano.filter((c) => !ids.has(c.id));

  // Restare a mani vuote va bene solo se serve a prendere il pozzetto:
  // con il pozzetto già preso ci si blocca, perché non resta niente da
  // scartare per chiudere il turno.
  if (resto.length === 0) return !giocatore.pozzettoTaken;

  // Con una carta sola in mano, scartarla significa chiudere: si può solo
  // col pozzetto già preso E un gioco da 5+ carte in tavola (in questo
  // gioco la chiusura vuole 5 carte, non le 7 del burraco classico).
  if (resto.length === 1 && giocatore.pozzettoTaken) {
    if (!giocatore.melds.some((m) => m.cards.length >= 5)) return false;
  }
  return true;
}

// --- PESCARE DAL MAZZO O RACCOGLIERE IL MONTE? ------------------------
//
// È la decisione che distingue chi sa giocare, ed è quella che questo bot
// sbagliava sempre: la vecchia regola raccoglieva solo con un monte da
// 4 carte o meno E una carta utile subito. In una partita a due il monte
// sta quasi sempre fra 1 e 3 carte, quindi la condizione era quasi mai
// vera — il bot non raccoglieva praticamente mai.
//
// E la conseguenza non era solo quella: senza raccogliere, la mano non
// cresce mai oltre le carte pescate una per turno. Con la mano piccola
// non si formano combinazioni, quindi non cala; non calando non ha giochi
// in tavola, e senza giochi in tavola non ha niente a cui agganciare.
// "Non raccoglie", "cala poco" e "non aggancia" erano lo stesso difetto
// visto da tre lati.
//
// SI CONTA LA SPAZZATURA, NON LE CARTE.
// Il numero che conta non è quanto è grosso il monte: è quante delle sue
// carte non servono a niente. Quelle restano in mano, pesano a fine mano
// e soprattutto impediscono di svuotarla. Un monte da otto carte con sei
// utili è un affare; uno da tre con zero utili è un danno, anche se è
// piccolo.
//
// E il prezzo della spazzatura cambia col momento della partita:
//   PRIMA del pozzetto è veleno — al pozzetto ci si arriva svuotando la
//   mano, e ogni carta inutile è un mattone in più da smaltire;
//   DOPO il pozzetto si può accumulare, perché l'obiettivo diventa fare
//   danno e punti. Ma non all'infinito: la mano va comunque svuotata.
function convieneRaccogliere(state, playerIndex) {
  const io = state.players[playerIndex];
  const monte = state.scarti;
  if (!monte.length) return false;
  const mano = io.hand;

  // Quanto è severo il giudizio dipende da quanto costa sbagliare: con un
  // monte piccolo la spazzatura che ti resta è poca e si può speculare su
  // una coppia; con un monte grosso si pretende di più.
  const soglia = monte.length <= 4 ? 1 : 2;

  let utili = 0;
  for (const c of monte) {
    if (matta(c)) { utili++; continue; }
    if (io.melds.some((m) => siLegaInsieme(m, [c]))) { utili++; continue; }
    const simili = mano.filter((h) => !matta(h) && h.value === c.value).length;
    if (simili >= soglia) { utili++; continue; }
    const vicine = mano.filter((h) => !matta(h) && h.suit === c.suit
      && Math.abs(h.value - c.value) <= 2 && h.value !== c.value).length;
    if (vicine >= soglia) utili++;
  }

  // IL MONTE DA UNA CARTA SOLA — e il giro infinito che ci si nasconde.
  // Costa poco prenderla, ma se poi non la si può giocare la si ributta
  // identica, e l'avversario fa lo stesso: nelle prove del progetto
  // d'origine due computer si sono passati la stessa carta per trecento
  // turni, col tallone fermo. Quindi non basta che sia "utile": deve
  // essere GIOCABILE SUBITO, e lo si chiede alla stessa regola che decide
  // le calate — perché il caso che manda in tondo è proprio quello in cui
  // quella regola dice di no.
  if (monte.length === 1) {
    const c = monte[0];
    if (matta(c)) return true;
    if (!io.melds.some((m) => siLegaInsieme(m, [c]))) return false;
    return calataAmmessa(io, [c], mano.concat([c]));
  }

  // Verso la fine un monte grosso diventa un peso: le carte inutili non
  // si smaltiscono più.
  if (state.tallone.length < 10 && monte.length > 4) return false;

  // Con il pozzetto preso e il gioco che serve a chiudere già in tavola,
  // l'obiettivo è chiudere, non accumulare.
  if (io.pozzettoTaken && io.melds.some((m) => m.cards.length >= 5) && monte.length > 3) return false;

  const spazzatura = monte.length - utili;
  const manoDopo = mano.length + monte.length;

  if (!io.pozzettoTaken) {
    // L'obiettivo è SVUOTARE: una mano da più di quindici carte non si
    // svuota in tempo, e il pozzetto resta lì.
    if (manoDopo > 15) return false;
    return utili >= 1 && spazzatura <= 2;
  }

  // Pozzetto in mano: si può crescere, ma da più di venti carte non si
  // chiude più.
  if (manoDopo > 20) return false;
  return utili >= 1 && spazzatura <= 5;
}

// --- COSA SCARTARE ----------------------------------------------------
//
// Tre spinte contrarie: non disfare le proprie combinazioni, non buttare
// una matta, e liberarsi delle carte care prima che diventino penalità.
// Torna la lista INTERA ordinata dalla più scartabile alla meno, non una
// carta sola: se il motore rifiuta la prima si prova la seconda, senza
// dover indovinare due volte.
function ordineScarto(state, playerIndex) {
  const mano = state.players[playerIndex].hand;
  if (!mano.length) return [];
  // A tallone quasi finito le carte care diventano il problema principale:
  // restano in mano e si pagano. Prima di allora contano molto meno delle
  // combinazioni che si stanno costruendo.
  const finePartita = state.tallone.length <= 3;

  const valutate = mano.map((c) => {
    let costo = 0;
    if (matta(c)) costo += 1000;                    // una matta non si scarta

    const coppia = mano.filter((h) => h !== c && !matta(h) && h.value === c.value).length;
    const vicine = mano.filter((h) => h !== c && !matta(h) && h.suit === c.suit
      && Math.abs(h.value - c.value) <= 2 && h.value !== c.value).length;
    costo += coppia * 26 + vicine * 14;

    costo -= cardPointValue(c) * (finePartita ? 3.0 : 0.7);
    return { c, costo };
  });
  valutate.sort((a, b) => a.costo - b.costo);
  return valutate.map((v) => v.c);
}

// --- L'ANTISTALLO -----------------------------------------------------
//
// Una mano di burraco finisce in due modi soltanto: qualcuno chiude,
// oppure il tallone si esaurisce. Raccogliere il monte NON consuma
// tallone — quindi due giocatori che raccolgono in continuazione possono
// restare al tavolo per sempre. Non è un'ipotesi: nel progetto d'origine
// è successo, col tallone fermo per trecento turni. Contro una persona è
// anche peggio che fra due computer, perché chi guarda non capisce cosa
// sta succedendo: vede solo una partita che non finisce mai.
//
// La regola è quindi grezza e non discutibile: se il tallone non cala da
// un po', si PESCA, qualunque cosa suggerisca la strategia. Costa qualche
// punto in casi rari e garantisce che ogni mano finisca. Le euristiche si
// possono raffinare all'infinito, la terminazione no.
//
// Il conto sta sullo STATO della partita, non in una variabile di questo
// file: due partite aperte insieme (succede nei test) avrebbero condiviso
// lo stesso contatore e si sarebbero disturbate a vicenda.
const TURNI_SENZA_PESCARE = 6;

function aggiornaAntistallo(state) {
  const visto = state._botTalloneVisto;
  if (visto === undefined || state.tallone.length !== visto) {
    state._botTalloneVisto = state.tallone.length;
    state._botTurniFermi = 0;
  } else {
    state._botTurniFermi = (state._botTurniFermi || 0) + 1;
  }
}
function devePescareEBasta(state) { return (state._botTurniFermi || 0) >= TURNI_SENZA_PESCARE; }

// --- ABILITÀ DEGLI EROI E CARTE MAGICHE -------------------------------
//
// Questa parte è di Burraco Legends e basta: nel burraco da cui viene il
// resto del cervello non esistono né eroi né magie.
//
// COME SCEGLIE, detto dal committente:
//   · l'abilità la usa quando ha i punti magia per pagarla;
//   · attacca con l'eroe più FORTE (attacco più alto, e a parità quello
//     più in salute: uno mezzo morto rischia di cadere prima di servire);
//   · colpisce il nemico con MENO VITA, per finirlo — un personaggio
//     morto non attacca più, mentre uno ferito continua a picchiare;
//   · le Carte Magiche le gioca a caso, intervallate alle abilità,
//     finché ne ha.
//
// Il caso lo dà `state.rng`, la sorgente della partita, non Math.random:
// così una partita di prova con seme fisso resta ripetibile e i test
// possono dire cosa succederà.
function eroiInOrdineDiForza(giocatore) {
  return SUITS
    .map((s) => ({ seme: s, eroe: giocatore.characters[s] }))
    .filter((x) => x.eroe && x.eroe.pv > 0)
    .sort((a, b) => (b.eroe.att - a.eroe.att) || (b.eroe.pv - a.eroe.pv));
}

function nemicoPiuDebole(avversario) {
  const vivi = SUITS.filter((s) => avversario.characters[s] && avversario.characters[s].pv > 0);
  if (!vivi.length) return null;
  return vivi.reduce((min, s) => (avversario.characters[s].pv < avversario.characters[min].pv ? s : min), vivi[0]);
}

// Una Carta Magica a caso fra quelle ancora in mano. Il motore ne accetta
// UNA per turno e rifiuta senza consumarla quella la cui condizione non è
// soddisfatta ("solo quando sei in difficoltà"): quindi si prova in
// ordine casuale finché una entra, invece di arrendersi alla prima che
// non va — altrimenti una carta condizionata bloccherebbe tutte le altre.
function giocaUnaMagiaACaso(state, playerIndex, nowMs) {
  const ms = state.players[playerIndex].magic;
  if (!ms || !ms.selection || !ms.selection.length) return null;
  if ((ms.giocateQuestoTurno || 0) >= 1) return null;

  const consumate = ms.consumate || [];
  const disponibili = ms.selection.map((_, i) => i).filter((i) => !consumate.includes(i));
  if (!disponibili.length) return null;

  const caso = state.rng || Math.random;
  // mescolata alla Fisher-Yates: l'ordine dei tentativi è casuale, non
  // sempre dal primo posto — sennò la carta in prima posizione uscirebbe
  // sempre per prima e "a caso" non sarebbe vero.
  for (let i = disponibili.length - 1; i > 0; i--) {
    const j = Math.floor(caso() * (i + 1));
    [disponibili[i], disponibili[j]] = [disponibili[j], disponibili[i]];
  }

  for (const indice of disponibili) {
    const r = giocaCartaMagica(state, playerIndex, indice, nowMs);
    if (r.ok) return r;
  }
  return null;
}

// Abilità e magie, alternate: un eroe attacca, poi tocca a una Carta
// Magica, poi il prossimo eroe. Alternarle è quello che chiede il
// committente ed è anche quello che rende leggibile il turno a chi
// guarda — quattro colpi tutti insieme e poi una magia sembrano due
// turni diversi.
function abilitaEMagie(state, playerIndex, mosse, nowMs) {
  const io = () => state.players[playerIndex];
  const avversario = () => state.players[playerIndex === 0 ? 1 : 0];
  let magiaGiocata = false;

  for (const { seme, eroe } of eroiInOrdineDiForza(io())) {
    if (state.status !== 'in_progress') return true;

    // Prima la magia, dalla seconda abilità in poi: così le due cose si
    // alternano davvero invece di ammucchiarsi.
    if (magiaGiocata === false && mosse.some((m) => m.tipo === 'abilita')) {
      const rm = giocaUnaMagiaACaso(state, playerIndex, nowMs);
      magiaGiocata = true;                       // provata: non si riprova ogni giro
      if (rm) {
        mosse.push({ tipo: 'magia', carta: rm.carta, magiaTipo: rm.tipo,
                     danno: rm.damage || 0, colpi: rm.colpi || [],
                     effettiAbilita: rm.esiti || [] });
        if (rm.matchEnded) return true;
      }
    }

    if ((io().puntiMagia || 0) < costoAbilitaDi(eroe)) continue;
    const bersaglio = nemicoPiuDebole(avversario());
    if (!bersaglio) break;                        // non è rimasto nessuno da colpire

    const r = usaAbilitaSpeciale(state, playerIndex, seme, bersaglio, nowMs);
    if (r.ok) {
      // `effettiAbilita` viaggia col resoconto della mossa perché il
      // tavolo deve poter mostrare anche quello che NON è danno: se il
      // bot ti abbassa le difese o ti ruba punti magia e non si vede, il
      // colpo che arriva due turni dopo sembra arrivato dal nulla.
      mosse.push({ tipo: 'abilita', danno: r.damage || 0, colpi: r.colpi || [],
                   effettiAbilita: r.effettiAbilita || [],
                   semeAttaccante: seme, semeBersaglio: bersaglio });
      if (r.matchEnded) return true;
    }
  }

  // Nessuna abilità è partita (punti magia a zero, eroi già usati): la
  // Carta Magica si gioca lo stesso, non deve restare in mano solo perché
  // non c'era niente con cui alternarla.
  if (!magiaGiocata && state.status === 'in_progress') {
    const rm = giocaUnaMagiaACaso(state, playerIndex, nowMs);
    if (rm) {
      mosse.push({ tipo: 'magia', carta: rm.carta, magiaTipo: rm.tipo,
                   danno: rm.damage || 0, colpi: rm.colpi || [],
                   effettiAbilita: rm.esiti || [] });
      if (rm.matchEnded) return true;
    }
  }
  return false;
}

// --- turno completo ---------------------------------------------------

/**
 * Gioca un turno intero del bot: pesca, usa abilità e magie, aggancia,
 * cala, scarta. Ritorna l'elenco delle mosse fatte, così il tavolo può
 * mostrarle una alla volta invece che tutte insieme.
 */
export function botGiocaTurno(state, playerIndex, nowMs = Date.now()) {
  const mosse = [];
  if (state.status !== 'in_progress' || state.currentPlayerIndex !== playerIndex) return mosse;
  const io = () => state.players[playerIndex];

  // 1. PESCA — o raccoglie il monte, se ne vale la pena e se l'antistallo
  //    non impone di pescare per far finire la mano.
  aggiornaAntistallo(state);
  let presoMonte = false;
  if (!devePescareEBasta(state) && convieneRaccogliere(state, playerIndex)) {
    const r = actionTakeDiscardPile(state, playerIndex, nowMs);
    if (r.ok) { presoMonte = true; mosse.push({ tipo: 'monte', carte: state.scarti.length }); }
  }
  if (!presoMonte) {
    const r = actionDraw(state, playerIndex, nowMs);
    if (r.ok) mosse.push({ tipo: 'pesca', quante: r.drawn });
    if (state.status !== 'in_progress') return mosse;   // mazzo finito: partita chiusa
  }

  // 2. ABILITÀ E CARTE MAGICHE
  if (abilitaEMagie(state, playerIndex, mosse, nowMs)) return mosse;

  // 3. AGGANCIA — prima di aprire giochi nuovi, allunga quelli che ha già:
  //    costa poco e fa comunque danno. Si provano prima gli agganci
  //    MULTIPLI, che portano più carte in tavola in una volta sola, e poi
  //    quelli a una carta.
  let agganciato = true;
  while (agganciato && state.status === 'in_progress') {
    agganciato = false;
    for (const gioco of io().melds) {
      if (state.status !== 'in_progress') break;

      const gruppo = cercaAggancioMultiplo(gioco, io().hand);
      if (gruppo && calataAmmessa(io(), gruppo)) {
        const r = actionAttachToMeld(state, playerIndex, gioco.id, gruppo.map((c) => c.id), nowMs);
        if (r.ok) {
          mosse.push({ tipo: 'aggancia', carte: gruppo.length, danno: r.damage || 0,
                       colpi: r.colpi || [], pozzetto: !!r.pozzettoPreso });
          agganciato = true;
          if (r.matchEnded) return mosse;
          continue;
        }
      }

      for (const c of io().hand.slice()) {
        if (matta(c) && !convieneUsareMatta(io().hand, state.tallone, io().pozzettoTaken)) continue;
        if (!calataAmmessa(io(), [c])) continue;
        const r = actionAttachToMeld(state, playerIndex, gioco.id, [c.id], nowMs);
        if (r.ok) {
          mosse.push({ tipo: 'aggancia', carte: 1, danno: r.damage || 0,
                       colpi: r.colpi || [], pozzetto: !!r.pozzettoPreso });
          agganciato = true;
          if (r.matchEnded) return mosse;
        }
      }
    }
  }

  // 4. CALA — finché trova combinazioni valide, senza mai finire in una
  //    posizione da cui non si può più scartare.
  let ancora = true;
  while (ancora && state.status === 'in_progress') {
    ancora = false;
    const mano = io().hand;
    const usaMatte = convieneUsareMatta(mano, state.tallone, io().pozzettoTaken);
    const opzioni = [...cercaScale(mano, usaMatte), ...cercaTris(mano, usaMatte)]
      .filter((g) => g.length >= 3)
      .sort((a, b) => b.length - a.length);   // le più lunghe prima: fanno più danno

    for (const gruppo of opzioni) {
      if (!calataAmmessa(io(), gruppo)) continue;
      const r = actionLayMeld(state, playerIndex, gruppo.map((c) => c.id), nowMs);
      if (r.ok) {
        mosse.push({ tipo: 'cala', carte: gruppo.length, danno: r.damage || 0,
                     colpi: r.colpi || [], pozzetto: !!r.pozzettoPreso });
        ancora = true;
        if (r.matchEnded) return mosse;
        break;
      }
    }
  }

  // 5. SCARTA — chiude il turno. Si scende lungo l'ordine di preferenza:
  //    la prima carta che il motore accetta è quella che se ne va.
  if (state.status === 'in_progress' && io().hand.length > 0) {
    for (const carta of ordineScarto(state, playerIndex)) {
      const r = actionDiscard(state, playerIndex, carta.id, nowMs);
      if (r.ok) { mosse.push({ tipo: 'scarta', carta, chiusura: !!r.matchEnded }); break; }
    }
  }
  return mosse;
}
