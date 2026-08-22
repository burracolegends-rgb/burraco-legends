// ============================================================
// BURRACO LEGENDS — GLI SHARKINI
//
// Nel gioco c'è UNA SOLA moneta: lo sharkino. Le carte si comprano
// solo con gli sharkini, mai direttamente con i soldi. I soldi veri
// servono unicamente a ricaricare sharkini. Due passaggi, non uno:
//
//     euro  →  sharkini  →  pacchetti di carte
//
// Il motivo non è estetico. Gli sharkini si guadagnano anche entrando
// ogni giorno: se le carte avessero un prezzo in euro accanto a quello
// in sharkini, il premio giornaliero diventerebbe un listino, e il
// giocatore che non spende si sentirebbe ricordare ogni volta quanto
// vale il tempo che ha regalato al gioco. Con una moneta sola, chi
// gioca e chi paga arrivano allo stesso posto per strade diverse.
//
// IL PREMIO DI OGNI GIORNO
// Primo giorno 100, poi 100 in più ogni giorno fino a 700 al settimo.
// Da lì in poi resta 700, all'infinito, FINCHÉ non si salta un giorno:
// chi salta ricomincia da 100. Non si perdono gli sharkini già presi,
// si perde la scala.
//
// IL CAMBIO
// Un mese intero di accessi consecutivi = un pacchetto da 5 carte.
// È il paletto deciso col committente e da lì scendono tutti i prezzi.
// Verificato dal test, non a occhio.
//
// NUMERI ANCORA PROVVISORI, da tarare col playtest:
//   - la scala del premio giornaliero
//   - il cambio euro → sharkini
//   - i prezzi dei pacchetti
// ============================================================

// ------------------------------------------------------------
// 1. IL PREMIO GIORNALIERO
// ------------------------------------------------------------
export const PREMI_SETTIMANA = [100, 200, 300, 400, 500, 600, 700];
export const PREMIO_MASSIMO = PREMI_SETTIMANA[PREMI_SETTIMANA.length - 1];

// Quanto vale il giorno numero N della serie (N parte da 1).
export function premioDelGiorno(giorno) {
  if (giorno < 1) return 0;
  return giorno <= PREMI_SETTIMANA.length ? PREMI_SETTIMANA[giorno - 1] : PREMIO_MASSIMO;
}

// Quanto raccoglie in tutto chi entra N giorni di fila senza saltarne uno.
export function guadagnoInGiorni(giorni) {
  let somma = 0;
  for (let g = 1; g <= giorni; g++) somma += premioDelGiorno(g);
  return somma;
}

// ------------------------------------------------------------
// LE DATE
// Confronto i giorni di calendario, non i millisecondi: chi entra alle
// 23:50 e poi alle 00:10 ha fatto due giorni, chi entra alle 09:00 e
// alle 21:00 ne ha fatto uno solo. Uso la data locale del giocatore,
// che è quella che lui vede sul telefono.
// ------------------------------------------------------------
export function giornoDiCalendario(quando) {
  const d = new Date(quando);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
}

export const SERIE_NUOVA = { giorno: 0, ultimoRitiro: null, saldo: 0 };

// Che cosa mostrare al giocatore in questo momento, senza cambiare nulla.
export function statoSerie(serie, adesso) {
  const oggi = giornoDiCalendario(adesso);
  const ultimo = serie.ultimoRitiro;

  if (ultimo === null) {
    return { puoRitirare: true, giorno: 1, premio: premioDelGiorno(1),
             serieRotta: false, giaRitiratoOggi: false };
  }
  const distanza = oggi - ultimo;

  if (distanza <= 0) {                       // già passato di qui oggi
    return { puoRitirare: false, giorno: serie.giorno, premio: premioDelGiorno(serie.giorno),
             serieRotta: false, giaRitiratoOggi: true };
  }
  if (distanza === 1) {                      // la serie regge
    const g = serie.giorno + 1;
    return { puoRitirare: true, giorno: g, premio: premioDelGiorno(g),
             serieRotta: false, giaRitiratoOggi: false };
  }
  return { puoRitirare: true, giorno: 1, premio: premioDelGiorno(1),   // saltato: si ricomincia
           serieRotta: true, giaRitiratoOggi: false };
}

// Ritira il premio. Restituisce sempre una serie nuova, non tocca quella
// ricevuta: così chi chiama non si ritrova lo stato cambiato sotto i piedi.
export function ritiraPremio(serie, adesso) {
  const stato = statoSerie(serie, adesso);
  if (!stato.puoRitirare) return { serie, guadagno: 0, stato };
  const aggiornata = {
    giorno: stato.giorno,
    ultimoRitiro: giornoDiCalendario(adesso),
    saldo: serie.saldo + stato.premio
  };
  return { serie: aggiornata, guadagno: stato.premio, stato };
}

// Quanto manca prima che la serie si rompa, per poterlo dire al
// giocatore prima e non dopo:
//    1  = tutto a posto, il premio di domani è ancora tuo
//    0  = ultimo giorno utile, se non entri oggi la perdi
//   -1  = già persa
// null = non c'è ancora nessuna serie da perdere
export function giorniPrimaDiPerdereLaSerie(serie, adesso) {
  if (serie.ultimoRitiro === null) return null;
  const passati = giornoDiCalendario(adesso) - serie.ultimoRitiro;
  return passati >= 2 ? -1 : 1 - passati;
}

// ------------------------------------------------------------
// 2. IL CAMBIO CON GLI EURO
// Ricariche: più grande è la ricarica, più sharkini per euro. Il bonus
// cresce sempre, mai un gradino che rende peggiore la ricarica più cara.
// ------------------------------------------------------------
export const SHARKINI_PER_EURO = 6000;

export const RICARICHE = [
  { id: 'manciata', euro: 1.00,  bonus: 0    },
  { id: 'sacchetto', euro: 2.00, bonus: 0.05 },
  { id: 'borsa',    euro: 5.00,  bonus: 0.10 },
  { id: 'cassa',    euro: 10.00, bonus: 0.15, etichetta: 'popolare' },
  { id: 'baule',    euro: 20.00, bonus: 0.20 },
  { id: 'montagna', euro: 50.00, bonus: 0.25, etichetta: 'conviene' }
].map((r) => ({
  ...r,
  base: Math.round(r.euro * SHARKINI_PER_EURO),
  extra: Math.round(r.euro * SHARKINI_PER_EURO * r.bonus),
  sharkini: Math.round(r.euro * SHARKINI_PER_EURO * (1 + r.bonus))
}));

export function sharkiniPerEuro(ricarica) { return ricarica.sharkini / ricarica.euro; }

// ------------------------------------------------------------
// 3. QUANTO COSTANO I PACCHETTI
// Il paletto: 30 giorni di accessi di fila devono bastare per il
// pacchetto da 5 carte. Tutti gli altri prezzi seguono la stessa curva
// di sconto di prima, così il taglio grande conviene sempre.
// ------------------------------------------------------------
export const GIORNI_PER_UN_PACCO = 30;

export function saldoPuoPagare(saldo, costo) { return saldo >= costo; }

export function spendi(saldo, costo) {
  if (!saldoPuoPagare(saldo, costo)) return { saldo, riuscito: false };
  return { saldo: saldo - costo, riuscito: true };
}

// Quanti giorni di accessi servono per arrivare a una certa cifra,
// partendo da zero e senza saltare mai un giorno.
export function giorniPerRaccogliere(costo) {
  let somma = 0, g = 0;
  while (somma < costo) { g++; somma += premioDelGiorno(g); }
  return g;
}

export function formattaSharkini(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Il numero da solo non dice niente: "ti mancano 6.000" di che cosa?
// Ovunque ci sia spazio, la cifra va accompagnata dal nome della moneta.
export function conNome(n) {
  const q = Math.round(n);
  return formattaSharkini(q) + (q === 1 ? ' sharkino' : ' sharkini');
}
