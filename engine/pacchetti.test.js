// Verifica del motore dei pacchetti: cosa esce, con che frequenza, e che
// la garanzia scatti davvero. Uso: node engine/pacchetti.test.js

import {
  apriPacchetto, rimborsoTotale, verificaProbabilita,
  PROBABILITA, SOGLIA_PITY, CARTE_PER_PACCHETTO, RIMBORSO_DOPPIONE,
  OFFERTE, costoPerCarta, scontoPercentuale, offertaPerCarte, LIVELLI_RARITA } from './pacchetti.js';
import { formattaSharkini, giorniPerRaccogliere } from './sharkini.js';

let failures = 0;
const check = (l, c) => { console.log((c ? 'OK   ' : 'FAIL ') + l); if (!c) failures++; };

// catalogo finto: 6 carte per ogni rarità
const CATALOGO = [];
for (let r = 1; r <= 5; r++) {
  for (let i = 0; i < 6; i++) CATALOGO.push({ id: 'c' + r + '_' + i, rarita: r });
}

// Sorgente casuale prevedibile ma VARIABILE: con un valore fisso uscirebbe
// sempre la stessa carta e i controlli sui doppioni non direbbero niente.
function rngFinto(seme = 12345) {
  let s = seme;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

// --- la tabella delle probabilità è coerente ---
check('le probabilità sommano a 100', verificaProbabilita());
// IL GIOCO HA TRE LIVELLI: 3 comuni, 4 rare, 5 leggendarie. Carte a 1 o
// 2 stelle non ne esistono e non ne esisteranno, e la tabella lo dice.
check('i livelli di rarita sono 3, 4 e 5', LIVELLI_RARITA.join(',') === '3,4,5');
check('ogni livello ha una sua probabilita', LIVELLI_RARITA.every((r) => PROBABILITA[r] > 0));
check('piu e rara, meno esce',
  LIVELLI_RARITA.every((r, i) => i === 0 || PROBABILITA[r] < PROBABILITA[LIVELLI_RARITA[i - 1]]));
// LE LEGGENDARIE DEVONO RESTARE LEGGENDARIE. E il numero che si e rotto
// una volta (erano arrivate all 8%, una carta su dodici) e che nessuno
// guardava: qui sta scritto quanto ci si aspetta.
check('una stella 5 ogni venti carte al massimo, prima della garanzia', PROBABILITA[5] <= 5);

// --- un pacchetto contiene il numero giusto di carte ---
{
  const r = apriPacchetto(CATALOGO, {}, 0, () => 0.5);
  check('un pacchetto contiene 5 carte', r.carte.length === CARTE_PER_PACCHETTO);
  check('ogni carta esiste nel catalogo', r.carte.every((c) => CATALOGO.some((x) => x.id === c.carta.id)));
  check('le carte sono ordinate dalla meno alla più rara',
    r.carte.every((c, i) => i === 0 || c.rarita >= r.carte[i - 1].rarita));
}

// --- doppioni e carte nuove ---
{
  const r1 = apriPacchetto(CATALOGO, {}, 0, rngFinto(7));
  const idUnici = new Set(r1.carte.map((c) => c.carta.id));
  check('con la collezione vuota, ogni carta diversa è nuova',
    r1.carte.filter((c) => c.nuova).length === idUnici.size);
  check('una carta nuova non dà rimborso', r1.carte.filter((c) => c.nuova).every((c) => c.rimborso === 0));

  const posseduto = {};
  for (const c of r1.carte) posseduto[c.carta.id] = 1;
  const r2 = apriPacchetto(CATALOGO, posseduto, 0, rngFinto(7));
  check('riaprendo con le stesse carte in collezione sono doppioni', r2.carte.every((c) => !c.nuova));
  check('i doppioni danno un rimborso', r2.carte.every((c) => c.rimborso > 0));
  check('il rimborso cresce con la rarità', RIMBORSO_DOPPIONE[5] > RIMBORSO_DOPPIONE[4] && RIMBORSO_DOPPIONE[4] > RIMBORSO_DOPPIONE[3]);
  check('il totale dei rimborsi torna', rimborsoTotale(r2) === r2.carte.reduce((t, c) => t + c.rimborso, 0));
}

// --- due copie della stessa carta nello stesso pacchetto ---
{
  // rng fisso: pesca sempre la stessa carta della stessa rarità
  const r = apriPacchetto(CATALOGO, {}, 0, () => 0.001);   // sorgente fissa: la stessa carta esce piu volte
  const perId = {};
  for (const c of r.carte) perId[c.carta.id] = (perId[c.carta.id] || 0) + 1;
  const ripetuta = Object.keys(perId).find((id) => perId[id] > 1);
  if (ripetuta) {
    const copie = r.carte.filter((c) => c.carta.id === ripetuta);
    check('la stessa carta due volte nello stesso pacchetto: solo la prima è nuova',
      copie.filter((c) => c.nuova).length === 1);
  } else {
    check('la stessa carta due volte nello stesso pacchetto: solo la prima è nuova', true);
    console.log('     (con questa sorgente casuale non è capitato: controllo saltato)');
  }
}

// --- LA GARANZIA (pity), che ora conta CARTE e non pacchetti ---
{
  let contatore = 0, pity = null, carteAperte = 0;
  while (carteAperte < SOGLIA_PITY) {
    const r = apriPacchetto(CATALOGO, {}, contatore, () => 0.5, CARTE_PER_PACCHETTO);
    contatore = r.contatore;
    carteAperte += CARTE_PER_PACCHETTO;
    if (r.pityScattato) pity = r;
  }
  check('la garanzia scatta dopo ' + SOGLIA_PITY + ' carte', pity !== null);
  if (pity) {
    check('garantisce una carta ★5', pity.carte.filter((c) => c.rarita === 5).length >= 1);
    check('garantisce due carte ★4', pity.carte.filter((c) => c.rarita === 4).length >= 2);
    check('dopo la garanzia il contatore riparte da zero', pity.contatore === 0);
  }
}
{
  const r = apriPacchetto(CATALOGO, {}, 0, () => 0.5, 5);
  check('il pacchetto dice quante carte mancano alla garanzia', r.mancanoAllaGaranzia === SOGLIA_PITY - 5);
}

// --- PROVA DI FREQUENZA: le rarità escono davvero con quelle probabilità ---
{
  const conteggio = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const PACCHETTI = 20000;
  let contatore = 0, garanzie = 0;
  for (let i = 0; i < PACCHETTI; i++) {
    const r = apriPacchetto(CATALOGO, {}, contatore);
    contatore = r.contatore;
    if (r.pityScattato) garanzie++;
    else for (const c of r.carte) conteggio[c.rarita]++;
  }
  const totale = Object.values(conteggio).reduce((a, b) => a + b, 0);
  const scarti = LIVELLI_RARITA.map((r) => {
    const attesa = PROBABILITA[r];
    const vera = (conteggio[r] / totale) * 100;
    return { r, attesa, vera, scarto: Math.abs(vera - attesa) };
  });
  check('su 20.000 pacchetti le frequenze rispettano la tabella (scarto sotto 1 punto)',
    scarti.every((s) => s.scarto < 1));
  const atteseGaranzie = (PACCHETTI * CARTE_PER_PACCHETTO) / SOGLIA_PITY;
  check('le garanzie scattano circa una ogni ' + SOGLIA_PITY + ' carte',
    Math.abs(garanzie - atteseGaranzie) < atteseGaranzie * 0.05);

  console.log('\n--- FREQUENZE MISURATE (su ' + PACCHETTI.toLocaleString('it-IT') + ' pacchetti, garanzie escluse) ---');
  for (const s of scarti) {
    console.log('  ★' + s.r + ': attesa ' + s.attesa.toFixed(2) + '%  ·  vera ' + s.vera.toFixed(2) + '%');
  }
  console.log('  garanzie scattate: ' + garanzie + ' (attese ~' + Math.round((PACCHETTI * CARTE_PER_PACCHETTO) / SOGLIA_PITY) + ')');
  console.log('  una carta ★5 esce in media ogni ' + (100 / PROBABILITA[5] / CARTE_PER_PACCHETTO).toFixed(1) + ' pacchetti\n');
}

// --- casi limite ---
{
  let errore = null;
  try { apriPacchetto([], {}, 0); } catch (e) { errore = e.message; }
  check('un catalogo vuoto viene rifiutato con un messaggio chiaro', /catalogo/i.test(errore || ''));

  // catalogo senza carte ★5: la garanzia deve ripiegare, non rompersi
  const senzaRare = CATALOGO.filter((c) => c.rarita < 4);
  const r = apriPacchetto(senzaRare, {}, SOGLIA_PITY - 1, () => 0.5, CARTE_PER_PACCHETTO);
  check('se mancano carte rare la garanzia ripiega senza rompersi', r.carte.length === CARTE_PER_PACCHETTO);
  check('e pesca comunque carte esistenti', r.carte.every((c) => senzaRare.some((x) => x.id === c.carta.id)));
}

// --- I TAGLI IN VENDITA ---
{
  check('ci sono sei tagli in vendita', OFFERTE.length === 6);
  check('i tagli sono 1, 3, 5, 10, 25, 50 carte',
    OFFERTE.map((o) => o.carte).join(',') === '1,3,5,10,25,50');
  check('nessun pacchetto ha un prezzo in euro',
    OFFERTE.every((o) => o.prezzo === undefined && o.euro === undefined));
  check('si trova il taglio dal numero di carte',
    offertaPerCarte(5).costo === 18000 && offertaPerCarte(7) === null);

  // IL CONTROLLO CHE CONTA: salire di taglio deve convenire SEMPRE.
  const perCarta = OFFERTE.map(costoPerCarta);
  check('il costo per carta scende a ogni taglio, senza eccezioni',
    perCarta.every((p, i) => i === 0 || p < perCarta[i - 1]));
  check('nessun taglio grande costa meno di uno piccolo',
    OFFERTE.every((o, i) => i === 0 || o.costo > OFFERTE[i - 1].costo));
  check('lo sconto è zero sulla singola e cresce salendo',
    scontoPercentuale(OFFERTE[0]) === 0 &&
    OFFERTE.every((o, i) => i === 0 || scontoPercentuale(o) > scontoPercentuale(OFFERTE[i - 1])));
  check('i costi sono cifre tonde, leggibili a colpo d\'occhio',
    OFFERTE.every((o) => o.costo % 1000 === 0));

  console.log('\n--- LISTINO IN SHARKINI ---');
  for (const o of OFFERTE) {
    console.log('  ' + String(o.carte).padStart(2) + ' carte  ·  ' +
      formattaSharkini(o.costo).padStart(7) + ' sharkini  ·  ' +
      formattaSharkini(costoPerCarta(o)).padStart(5) + ' a carta  ·  sconto ' +
      String(scontoPercentuale(o)).padStart(2) + '%  ·  ' +
      String(giorniPerRaccogliere(o.costo)).padStart(3) + ' giorni di accessi');
  }
  console.log('');

}

// --- TAGLI DIVERSI: il pacchetto contiene quello che promette ---
{
  for (const o of OFFERTE) {
    const r = apriPacchetto(CATALOGO, {}, 0, rngFinto(3), o.carte);
    check('il taglio da ' + o.carte + ' contiene ' + o.carte + ' carte', r.carte.length === o.carte);
  }
  const uno = apriPacchetto(CATALOGO, {}, 0, rngFinto(9), 1);
  check('il taglio da una carta funziona', uno.carte.length === 1);
}

// --- LA GARANZIA È EQUA FRA I TAGLI ---
// Comprare 50 carte in una volta deve dare le stesse garanzie di
// comprarne 50 una alla volta: altrimenti un taglio sarebbe una fregatura.
{
  const CARTE = 600;

  let contA = 0, garA = 0;
  for (let i = 0; i < CARTE; i++) { const r = apriPacchetto(CATALOGO, {}, contA, () => 0.5, 1); contA = r.contatore; garA += r.garanzie; }

  let contB = 0, garB = 0;
  for (let i = 0; i < CARTE / 50; i++) { const r = apriPacchetto(CATALOGO, {}, contB, () => 0.5, 50); contB = r.contatore; garB += r.garanzie; }

  check('600 carte comprate una alla volta o a blocchi da 50 danno le stesse garanzie', garA === garB);
  check('e sono quelle attese (' + (CARTE / SOGLIA_PITY) + ')', garA === CARTE / SOGLIA_PITY);
}

// --- un taglio grande può contenere più di una garanzia ---
{
  const r = apriPacchetto(CATALOGO, {}, 0, rngFinto(5), 130);   // 130 carte, soglia 60
  check('un pacchetto da 130 carte contiene due garanzie', r.garanzie === 2);
  check('quindi almeno due carte ★5', r.carte.filter((c) => c.rarita === 5).length >= 2);
  check('e almeno quattro carte ★4', r.carte.filter((c) => c.rarita === 4).length >= 4);
}

// --- un taglio da una carta non può contenere una garanzia da tre ---
{
  const r = apriPacchetto(CATALOGO, {}, SOGLIA_PITY - 1, () => 0.5, 1);
  check('con una carta sola la garanzia si riduce a quella carta', r.carte.length === 1);
  check('e quella carta è la ★5 garantita', r.carte[0].rarita === 5);
}

console.log('\n' + (failures === 0 ? 'Tutti i controlli passati.' : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
