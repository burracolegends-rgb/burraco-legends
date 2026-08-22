// ============================================================
// CONTROLLO DELLE CARTE
// Legge TUTTE le carte in /cards/data e verifica che il motore sappia
// leggerle. Va eseguito ogni volta che si aggiunge o si modifica una
// carta: è la rete che impedisce di pubblicare una carta che "non fa
// niente" senza che nessuno se ne accorga.
//
// Uso: node engine/carte-lint.test.js
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  controllaCartaMagica, controllaCartaPersonaggio,
  EFFETTI, EFFETTI_DIFFERITI, TRIGGER_TRAPPOLA, LIMITI
} from './vocabolario.js';
import { infliggiDanno } from './core-rules.js';
import { dotazioneIniziale, EROI_DI_PARTENZA, MAGICHE_DI_PARTENZA } from './dotazione.js';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const RADICE = path.resolve(QUI, '..');
const DATI = path.join(RADICE, 'cards', 'data');
const I18N = path.join(RADICE, 'cards', 'i18n');

let failures = 0;
const check = (l, c, dettaglio) => {
  console.log((c ? 'OK   ' : 'FAIL ') + l);
  if (!c) { failures++; if (dettaglio) console.log('       ' + dettaglio); }
};

const leggi = (f) => JSON.parse(fs.readFileSync(f, 'utf-8'));
const file = fs.readdirSync(DATI).filter((f) => f.endsWith('.json')).sort();
const carte = file.map((f) => ({ file: f, dati: leggi(path.join(DATI, f)) }));

check('ci sono carte da controllare', carte.length > 0);

// --- 1. ogni carta è leggibile dal motore ---
{
  const problemi = [];
  for (const { file: f, dati } of carte) {
    const esito = f.startsWith('personaggio_') ? controllaCartaPersonaggio(dati) : controllaCartaMagica(dati);
    if (!esito.ok) problemi.push(f + ':\n       - ' + esito.errori.join('\n       - '));
  }
  check('tutte le carte usano parole che il motore sa eseguire', problemi.length === 0, problemi.join('\n     '));
}

// --- 2. il nome del file corrisponde all'id, e nessun id è ripetuto ---
{
  const sbagliati = carte.filter(({ file: f, dati }) => dati.id !== f.replace(/\.json$/, ''));
  check('l\'id di ogni carta corrisponde al nome del file', sbagliati.length === 0,
    sbagliati.map((c) => c.file + ' contiene id "' + c.dati.id + '"').join(', '));

  const visti = new Set(), doppi = [];
  for (const { dati } of carte) { if (visti.has(dati.id)) doppi.push(dati.id); visti.add(dati.id); }
  check('nessun id ripetuto', doppi.length === 0, doppi.join(', '));
}

// --- 3. ogni carta ha nome e descrizione in tutte e quattro le lingue ---
{
  const testi = {};
  for (const lingua of LIMITI.lingue) {
    const f = path.join(I18N, lingua + '.json');
    testi[lingua] = fs.existsSync(f) ? leggi(f) : null;
    check('esiste il file lingua ' + lingua + '.json', testi[lingua] !== null);
  }
  const mancanti = [];
  for (const { dati } of carte) {
    for (const lingua of LIMITI.lingue) {
      const t = testi[lingua] && testi[lingua][dati.id];
      if (!t) mancanti.push(dati.id + ' non tradotta in ' + lingua);
      else if (!t.nome || !t.descrizione) mancanti.push(dati.id + ' in ' + lingua + ': nome o descrizione vuoti');
    }
  }
  check('ogni carta ha nome e descrizione nelle 4 lingue', mancanti.length === 0, mancanti.slice(0, 12).join('\n     '));
}

// --- 4. ogni carta dice quanto costa in punti magia ---
{
  // I punti magia li pagano SOLO le abilità degli eroi.
  const senzaCosto = carte.filter(({ file: f, dati }) =>
    f.startsWith('personaggio_') && dati.abilita && dati.abilita.costo === undefined);
  check('ogni abilità di eroe dichiara il proprio costo in punti magia', senzaCosto.length === 0,
    senzaCosto.map((c) => c.file).join(', '));

  // ...e le Carte Magiche NON devono averlo: si consumano, non si pagano.
  const conCosto = carte.filter(({ file: f, dati }) => !f.startsWith('personaggio_') && dati.costo !== undefined);
  check('nessuna Carta Magica dichiara un costo in punti magia', conCosto.length === 0,
    conCosto.map((c) => c.file).join(', ') + ' — le Carte Magiche non costano punti magia, valgono un utilizzo e si consumano');
}

// --- 4bis. "difesa" non è cosmetica: riduce il danno per davvero ---
// La stessa cosa che è mancata per anni a boost_difesa (il flag c'era,
// nessuno lo leggeva). Qui non basta cercare la parola nel codice: si fa
// girare `infliggiDanno` per davvero e si controlla il risultato.
{
  const bersaglio = { pv: 100, pvMax: 100, difesa: 20 };
  const nettoRidotto = infliggiDanno(bersaglio, 50);
  check('20 di difesa riduce 50 di danno a 40', Math.abs(nettoRidotto - 40) < 1e-9);
  check('e i PV calano di altrettanto', Math.abs(bersaglio.pv - 60) < 1e-9);

  const senzaDifesa = { pv: 100, pvMax: 100 };
  const nettoPieno = infliggiDanno(senzaDifesa, 50);
  check('senza "difesa" il danno resta pieno (com\'era prima)', nettoPieno === 50);

  const corazzato = { pv: 100, pvMax: 100, difesa: 95 };
  const nettoTetto = infliggiDanno(corazzato, 50);
  check('la difesa non supera mai il tetto massimo (80%): resta almeno il 20% del danno', Math.abs(nettoTetto - 10) < 1e-9);
}

// --- 4ter. LA DOTAZIONE INIZIALE REGALA CARTE CHE ESISTONO DAVVERO ---
// Un id sbagliato qui non farebbe rumore: il giocatore nuovo si
// ritroverebbe la collezione mezza vuota e nessuno protesterebbe.
{
  const perId = Object.fromEntries(carte.map(({ dati }) => [dati.id, dati]));
  const fantasmi = Object.keys(dotazioneIniziale()).filter((id) => !perId[id]);
  check('ogni carta della dotazione iniziale esiste in cards/data', fantasmi.length === 0,
    'non esistono: ' + fantasmi.join(', '));

  const semi = EROI_DI_PARTENZA.map((id) => perId[id] && perId[id].seme);
  check('la squadra di partenza ha un eroe per ciascun seme',
    new Set(semi).size === 4 && !semi.includes(undefined),
    'semi trovati: ' + JSON.stringify(semi));

  const nonMagiche = MAGICHE_DI_PARTENZA.filter((id) => !perId[id] || perId[id].seme);
  check('le Carte Magiche di partenza sono davvero Carte Magiche', nonMagiche.length === 0,
    nonMagiche.join(', '));
}

// --- 5. IL CONTROLLO PIÙ IMPORTANTE ---
// Ogni parola del vocabolario deve essere eseguita per davvero da qualche
// parte nel motore. Se qualcuno aggiunge un effetto all'elenco ma non lo
// implementa, le carte che lo usano non farebbero nulla in silenzio.
{
  const sorgente = ['magic-cards.js', 'partita.js', 'core-rules.js', 'character-abilities.js']
    .map((f) => fs.readFileSync(path.join(QUI, f), 'utf-8')).join('\n');

  const nonEseguiti = Object.keys(EFFETTI).filter((e) => {
    // un effetto è "eseguito" se compare nel codice fuori dal vocabolario
    const usi = sorgente.split(e).length - 1;
    return usi === 0;
  });
  check('ogni effetto del vocabolario è eseguito dal motore', nonEseguiti.length === 0,
    'mai eseguiti: ' + nonEseguiti.join(', '));

  const trigNonChiamati = Object.keys(TRIGGER_TRAPPOLA).filter((t) => !sorgente.includes("'" + t + "'"));
  check('ogni trigger di Trappola viene fatto scattare dal motore', trigNonChiamati.length === 0,
    'mai chiamati: ' + trigNonChiamati.join(', ') + ' — una trappola con questo trigger resterebbe armata per sempre');

  // gli effetti differiti devono essere nell'elenco che il motore consulta
  const fuoriElenco = EFFETTI_DIFFERITI.filter((e) => !sorgente.includes(e));
  check('ogni effetto differito è previsto dal motore', fuoriElenco.length === 0, fuoriElenco.join(', '));
}

// --- 6. una carta scritta male viene bocciata (prova del controllo stesso) ---
{
  const inventata = controllaCartaMagica({ id: 'x', tipo: 'trappola', effect: 'effetto_che_non_esiste', trigger: 'avversario_pesca', durata_turni: 0 });
  check('una carta con un effetto inventato viene bocciata', !inventata.ok && /effetto sconosciuto/.test(inventata.errori[0]));

  const trigMorto = controllaCartaMagica({ id: 'x', tipo: 'trappola', effect: 'danno_diretto', parametro: '10', trigger: 'quando_piove', durata_turni: 0 });
  check('una trappola che aspetta un evento inesistente viene bocciata', !trigMorto.ok && trigMorto.errori.some((e) => /trigger sconosciuto/.test(e)));

  const senzaNumero = controllaCartaMagica({ id: 'x', tipo: 'sorpresa', effect: 'danno_diretto', parametro: 'tanto', trigger: 'on_activate', durata_turni: 0 });
  check('un parametro non numerico dove serve un numero viene bocciato', !senzaNumero.ok);

  const enumSbagliato = controllaCartaMagica({ id: 'x', tipo: 'sorpresa', effect: 'restrict_draw_source', parametro: 'quello_che_voglio', trigger: 'on_activate', durata_turni: 0 });
  check('un parametro fuori dai valori ammessi viene bocciato', !enumSbagliato.ok);

  const conCosto = controllaCartaMagica({ id: 'x', tipo: 'sorpresa', effect: 'danno_diretto', parametro: '10', trigger: 'on_activate', durata_turni: 0, costo: 4 });
  check('una Carta Magica con un costo in punti magia viene bocciata', !conCosto.ok && conCosto.errori.some((e) => /non va più messo/.test(e)));

  const buona = controllaCartaMagica({ id: 'x', tipo: 'sorpresa', effect: 'danno_diretto', parametro: '30', trigger: 'on_activate', target: 'avversario', durata_turni: 0 });
  check('una carta scritta bene passa', buona.ok, buona.errori.join('; '));
}

console.log('\n' + (failures === 0
  ? 'Tutte le carte sono leggibili dal motore.'
  : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
