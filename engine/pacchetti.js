// ============================================================
// BURRACO LEGENDS — PACCHETTI DI CARTE
//
// Che cosa esce da un pacchetto, e con che probabilità. Sta qui e non
// nella pagina perché è una REGOLA DI GIOCO, non una decorazione: deve
// essere provabile, controllabile e — un domani — eseguibile sul server,
// dove il giocatore non può metterci le mani.
//
// PITY SYSTEM (spec §10)
// Ogni tot pacchetti si ha la garanzia di una carta ★5 e due ★4. Senza
// una garanzia, la sfortuna può accanirsi per decine di pacchetti e il
// giocatore smette. Il contatore va conservato fra una sessione e
// l'altra: qui viene passato dentro e restituito aggiornato.
//
// NUMERI ANCORA PROVVISORI, da tarare col playtest:
//   - soglia del pity
//   - probabilità per rarità
//   - costo in sharkini
// ============================================================

export const CARTE_PER_PACCHETTO = 5;   // il taglio "normale"

// ------------------------------------------------------------
// I TAGLI IN VENDITA
//
// I pacchetti si pagano SOLO in sharkini. Qui dentro non compare
// nessun euro, e non è una svista: gli euro comprano sharkini, gli
// sharkini comprano carte (vedi engine/sharkini.js).
//
// Il paletto da cui scende tutto: 30 giorni di accessi consecutivi
// devono bastare per il pacchetto da 5 carte → 18.000 sharkini.
// Gli altri tagli tengono la stessa curva: il costo per carta scende
// sempre salendo di taglio, il pacchetto grande non deve MAI convenire
// meno di quello piccolo. Controllato da un test apposta.
// ------------------------------------------------------------
export const OFFERTE = [
  { id: 'busta',    carte: 1,  costo:   6000, etichetta: null },
  { id: 'trio',     carte: 3,  costo:  12000, etichetta: null },
  { id: 'pacco',    carte: 5,  costo:  18000, etichetta: null },
  { id: 'scrigno',  carte: 10, costo:  30000, etichetta: 'popolare' },
  { id: 'forziere', carte: 25, costo:  60000, etichetta: null },
  { id: 'tesoro',   carte: 50, costo: 108000, etichetta: 'conviene' }
];

export function costoPerCarta(offerta) { return offerta.costo / offerta.carte; }

// Quanto si risparmia rispetto al costo della singola carta.
export function scontoPercentuale(offerta) {
  const base = OFFERTE[0].costo;                  // 1 carta = prezzo pieno
  return Math.round((1 - costoPerCarta(offerta) / base) * 100);
}

export function offertaPerCarte(quante) {
  return OFFERTE.find((o) => o.carte === quante) || null;
}

// ------------------------------------------------------------
// CHE COSA PUÒ USCIRE DA UN PACCHETTO
//
// Non tutte le carte che esistono sono in vendita. I personaggi
// segnaposto (personaggio_001..008) e le carte di esempio sono la
// DOTAZIONE DI BENVENUTO: si ricevono all'iscrizione e basta. Se
// restassero nel mucchio uscirebbero anche dai pacchetti, e chi compra
// si ritroverebbe copie di carte che ha già avuto gratis — per giunta
// senza illustrazione, perché sono appunto segnaposto.
//
// Il filtro sta qui e non nel server perché è una REGOLA DI GIOCO ("che
// cosa si può comprare"), non un dettaglio di come gira il sito: così
// vale uguale ovunque, e il controllo delle carte può verificarla.
// ------------------------------------------------------------
export function carteInVendita(catalogo) {
  return (catalogo || []).filter((c) => !c.fuoriCommercio);
}

// ------------------------------------------------------------
// GARANZIA (pity)
// Il contatore conta CARTE, non pacchetti: solo così è giusto anche coi
// tagli diversi. Chi compra 50 carte in una volta deve ricevere le stesse
// garanzie di chi ne compra 50 una alla volta — altrimenti il taglio
// grande punirebbe o premierebbe senza motivo.
// ------------------------------------------------------------
export const SOGLIA_PITY = 60;   // carte fra una garanzia e l'altra

// Probabilità per rarità, in percentuale. La somma deve fare 100: c'è un
// controllo che lo verifica, perché una tabella sbagliata qui si nota
// solo dopo migliaia di estrazioni.
export const PROBABILITA = { 1: 50, 2: 28, 3: 14, 4: 6.5, 5: 1.5 };

// Quante monete vale un doppione: le carte non si scambiano fra utenti
// (spec §10), quindi un doppione deve valere comunque qualcosa.
export const RIMBORSO_DOPPIONE = { 1: 5, 2: 12, 3: 30, 4: 80, 5: 250 };

export function verificaProbabilita() {
  const somma = Object.values(PROBABILITA).reduce((a, b) => a + b, 0);
  return Math.abs(somma - 100) < 1e-9;
}

// SI ESTRAE SOLO FRA LE RARITÀ CHE ESISTONO DAVVERO.
//
// La tabella qui sopra descrive un mazzo con carte da 1 a 5 stelle. Il
// roster vero comincia a 3: non esiste nessun personaggio a 1 o 2
// stelle. Chiedendo lo stesso una rarità 1 — cioè nel 50% dei casi — non
// si trovava niente, e `pescaDiRarita` ripiegava sull'ultima spiaggia:
// una carta a caso fra TUTTE. Cioè metà delle carte di ogni pacchetto
// veniva estratta a sorte piatta, leggendarie comprese, e la rarità non
// contava più niente. Un guasto invisibile: i pacchetti si aprivano,
// le carte uscivano, e sembrava tutto a posto.
//
// Adesso i pesi si ridistribuiscono fra le rarità presenti mantenendo le
// proporzioni fra loro. Con un roster 3/4/5 i pesi 14 : 6,5 : 1,5
// diventano circa 64% / 30% / 6%: le comuni restano comuni e le
// leggendarie restano rare. E il giorno che si aggiungeranno carte a 1 o
// 2 stelle si riprenderanno da sole la loro fetta, senza toccare niente.
export function raritaDisponibili(catalogo) {
  const presenti = new Set((catalogo || []).map((c) => Number(c.rarita)));
  return [1, 2, 3, 4, 5].filter((r) => presenti.has(r));
}

function estraiRarita(rng, disponibili) {
  if (!disponibili || !disponibili.length) return 1;
  const totale = disponibili.reduce((s, r) => s + PROBABILITA[r], 0);
  let r = rng() * totale;
  for (const rarita of disponibili) {
    r -= PROBABILITA[rarita];
    if (r <= 0) return rarita;
  }
  return disponibili[disponibili.length - 1];
}

function pescaDiRarita(catalogo, rarita, rng) {
  const candidate = catalogo.filter((c) => Number(c.rarita) === rarita);
  // se per quella rarità non esistono ancora carte, si scende di livello
  if (!candidate.length) {
    for (let r = rarita - 1; r >= 1; r--) {
      const alt = catalogo.filter((c) => Number(c.rarita) === r);
      if (alt.length) return alt[Math.floor(rng() * alt.length)];
    }
    return catalogo[Math.floor(rng() * catalogo.length)];
  }
  return candidate[Math.floor(rng() * candidate.length)];
}

/**
 * Apre un pacchetto.
 *
 * @param catalogo   tutte le carte esistenti [{ id, rarita, tipo|seme }]
 * @param posseduto  { idCarta: quante ne ho } — serve a dire cosa è nuovo
 * @param contatore  quante carte aperte dall'ultima garanzia
 * @param rng        sorgente casuale (i test ne passano una prevedibile)
 * @param quante     quante carte contiene questo pacchetto
 *
 * @returns { carte, contatore, pityScattato, garanzie }
 *   carte: [{ carta, rarita, nuova, copiePossedute, rimborso }]
 *          ordinate dalla meno alla più rara: l'ultima è la migliore, ed
 *          è quella che il pacchetto mostra per ultima.
 */
export function apriPacchetto(catalogo, posseduto = {}, contatore = 0, rng = Math.random, quante = CARTE_PER_PACCHETTO) {
  if (!catalogo || !catalogo.length) throw new Error('Il catalogo delle carte è vuoto.');
  if (!(quante > 0)) throw new Error('Un pacchetto deve contenere almeno una carta.');

  // Quante garanzie maturano dentro questo pacchetto. Con i tagli grandi
  // possono essere più di una: 50 carte con soglia 60 possono contenerne
  // una, e chi ne compra 120 di fila ne trova due.
  const primaDi = Math.floor(contatore / SOGLIA_PITY);
  const dopoDi = Math.floor((contatore + quante) / SOGLIA_PITY);
  const garanzie = Math.max(0, dopoDi - primaDi);
  const pityScattato = garanzie > 0;

  // rarità delle carte: prima le garantite, poi il resto a sorte
  const disponibili = raritaDisponibili(catalogo);
  const rarita = [];
  for (let g = 0; g < garanzie; g++) rarita.push(5, 4, 4);
  rarita.splice(quante);                                   // se il taglio è piccolo, si tiene il meglio
  while (rarita.length < quante) rarita.push(estraiRarita(rng, disponibili));

  // le copie possedute vanno contate mano a mano: due copie della stessa
  // carta nello stesso pacchetto non sono entrambe "nuova"
  const conteggio = { ...posseduto };
  const carte = rarita.map((r) => {
    const carta = pescaDiRarita(catalogo, r, rng);
    const giaAvute = conteggio[carta.id] || 0;
    conteggio[carta.id] = giaAvute + 1;
    return {
      carta,
      rarita: Number(carta.rarita) || 1,
      nuova: giaAvute === 0,
      copiePossedute: giaAvute + 1,
      rimborso: giaAvute === 0 ? 0 : (RIMBORSO_DOPPIONE[Number(carta.rarita)] || 0)
    };
  });

  // dalla meno rara alla più rara: il pacchetto sale di tono fino all'ultima
  carte.sort((a, b) => a.rarita - b.rarita);

  const contatoreDopo = (contatore + quante) % SOGLIA_PITY;
  return {
    carte,
    contatore: contatoreDopo,
    pityScattato,
    garanzie,
    mancanoAllaGaranzia: SOGLIA_PITY - contatoreDopo
  };
}

// Quante monete si incassano dai doppioni di un pacchetto.
export function rimborsoTotale(risultato) {
  return risultato.carte.reduce((t, c) => t + c.rimborso, 0);
}
