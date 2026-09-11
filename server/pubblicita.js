// ============================================================
// BURRACO LEGENDS — GUARDA UNA PUBBLICITÀ, GUADAGNA SHARKINI
//
// Un modo in più per guadagnare sharkini senza comprare pacchetti:
// guardi un video (rewarded ad), ricevi una piccola somma. Fino a un
// tetto al giorno, non all'infinito.
//
// SEGNAPOSTO, NON UN VERO SDK PUBBLICITARIO — detto chiaro, non
// nascosto. Le pubblicità vere pagano solo con un account pubblicitario
// (AdMob o simile) collegato a un'app già pubblicata sullo store, con
// installazioni reali: prima di quel momento non c'è nessun inventario
// pubblicitario dietro, e costruire già l'integrazione vera sarebbe
// lavoro fatto al buio. Questo modulo tiene il conto (quante viste
// oggi, quanto accreditare) esattamente come lo terrebbe con un SDK
// vero: il giorno in cui ce ne sarà uno, il client sostituisce SOLO il
// pezzo che mostra il video — questa parte, il tetto giornaliero e il
// credito, restano identici.
//
// SOLO CHI È REGISTRATO — non per la stessa ragione di Missione e
// pass stagionale (lì il motivo è "un progresso che sparisce non è un
// progresso"): qui il problema è che un ospite potrebbe cancellare i
// dati del browser e ripartire come "nuovo ospite" a ripetizione,
// guardando pubblicità illimitate con un'identità sempre fresca. Un
// account vero non si ricrea gratis a piacere.
// ============================================================
import { giornoDi } from './missioni.js';

export const SHARKINI_PER_PUBBLICITA = 100;
export const PUBBLICITA_MASSIME_AL_GIORNO = 3;

export function creaPubblicita({ archivio, anagrafe, eRegistrato, orologio = Date.now }) {
  if (!archivio) throw new Error('Le pubblicità rewarded hanno bisogno di un magazzino.');
  if (!anagrafe) throw new Error('Le pubblicità rewarded hanno bisogno dell\'anagrafe, per accreditare gli sharkini.');
  if (typeof eRegistrato !== 'function') {
    throw new Error('Le pubblicità rewarded hanno bisogno di sapere chi è registrato, per decidere chi può guardarle.');
  }

  const chiave = (gettone) => 'pubblicita:' + gettone;

  async function visteOggiDi(gettone, oggi) {
    const p = await archivio.leggi(chiave(gettone));
    // Un giorno diverso da oggi (o nessun record) vuol dire "oggi zero
    // viste": non serve azzerare niente a mezzanotte, lo dice da solo
    // il confronto fra le due stringhe di data.
    return (p && p.giorno === oggi) ? p.viste : 0;
  }

  // ------------------------------------------------------------
  // "QUANTE ME NE RESTANO OGGI?" — senza guardare nessuna pubblicità:
  // serve al pulsante per sapere se mostrarsi attivo o "torna domani",
  // prima ancora che qualcuno tocchi niente.
  // ------------------------------------------------------------
  async function stato(gettone) {
    if (!gettone || !(await eRegistrato(gettone))) {
      return {
        ok: true, registrato: false, visteOggi: 0,
        visteMassime: PUBBLICITA_MASSIME_AL_GIORNO, sharkiniPerVista: SHARKINI_PER_PUBBLICITA
      };
    }
    const visteOggi = await visteOggiDi(gettone, giornoDi(orologio()));
    return {
      ok: true, registrato: true, visteOggi,
      visteMassime: PUBBLICITA_MASSIME_AL_GIORNO, sharkiniPerVista: SHARKINI_PER_PUBBLICITA
    };
  }

  // ------------------------------------------------------------
  // "L'HO GUARDATA" — chiamata dal client SOLO dopo che il video (vero
  // o, per ora, il segnaposto) è arrivato in fondo. Il server non ha
  // modo di verificare che sia stato guardato per intero — esattamente
  // come qualunque rewarded ad vera, dove è l'SDK pubblicitario a
  // garantirlo, non il sito che lo mostra — ma il tetto giornaliero e
  // l'importo restano decisi solo qui, mai dal client.
  // ------------------------------------------------------------
  async function guarda(gettone) {
    if (!gettone) return { ok: false, motivo: 'Serve sapere chi sei per guardare una pubblicità: apri prima la home.' };
    if (!(await eRegistrato(gettone))) {
      return {
        ok: false, serveRegistrazione: true,
        motivo: 'Guadagnare sharkini con le pubblicità è per chi ha un account registrato — da ospite le tue carte si perdono al primo cambio di dispositivo.'
      };
    }
    const oggi = giornoDi(orologio());
    const visteOggi = await visteOggiDi(gettone, oggi);
    if (visteOggi >= PUBBLICITA_MASSIME_AL_GIORNO) {
      return {
        ok: false, motivo: 'Hai già guardato ' + PUBBLICITA_MASSIME_AL_GIORNO + ' pubblicità oggi. Torna domani per altre.',
        visteOggi, visteMassime: PUBBLICITA_MASSIME_AL_GIORNO
      };
    }
    await anagrafe.regalaSharkini(gettone, SHARKINI_PER_PUBBLICITA);
    await archivio.scrivi(chiave(gettone), { giorno: oggi, viste: visteOggi + 1 });
    return {
      ok: true, accreditati: SHARKINI_PER_PUBBLICITA,
      visteOggi: visteOggi + 1, visteMassime: PUBBLICITA_MASSIME_AL_GIORNO
    };
  }

  return { stato, guarda };
}
