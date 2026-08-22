// ============================================================
// BURRACO LEGENDS — REGISTRARSI, ENTRARE, RECUPERARE
//
// Email e password, come tutti si aspettano. Tre cose sole:
// registrarsi, entrare, e riprendersi l'account quando la password se
// n'è andata.
//
// TRE SCELTE CHE SEMBRANO PIGNOLERIE E NON LO SONO
//
// 1. NON SI DICE MAI SE UN'EMAIL È REGISTRATA.
//    Né quando si sbaglia la password ("email o password sbagliata",
//    non "password sbagliata"), né quando si chiede il recupero
//    (risposta identica in ogni caso). Altrimenti chiunque, provando
//    indirizzi, si costruisce l'elenco di chi gioca qui — e quello è
//    un dato che vale, soprattutto se qualcuno lo incrocia con altro.
//
// 2. I TENTATIVI SI CONTANO.
//    Dopo un po' di password sbagliate di fila su uno stesso account
//    si aspetta. Senza, provare milioni di password è solo questione
//    di pazienza.
//
// 3. IL LINK DI RECUPERO SCADE, VALE UNA VOLTA SOLA, E CAMBIARE
//    PASSWORD BUTTA FUORI TUTTI GLI ALTRI.
//    Se cambio la password è perché temo che qualcuno sia entrato:
//    lasciarlo dentro sarebbe assurdo.
//
// LA POSTA SI PASSA DA FUORI
// `spedisci` è una funzione che riceve la mail da mandare. Finché non
// c'è un servizio di posta configurato, il server scrive il link nella
// sua finestra: il recupero funziona davvero e si può provare, senza
// far finta che le email partano.
// ============================================================
import {
  impastaPassword, passwordGiusta, controllaPassword, normalizzaEmail,
  gettoneDiRecupero, improntaGettone
} from './password.js';

export const TENTATIVI_PRIMA_DI_ASPETTARE = 8;
export const ATTESA_DOPO_I_TENTATIVI_MS = 15 * 60 * 1000;   // un quarto d'ora
export const VALIDITA_RECUPERO_MS = 60 * 60 * 1000;         // un'ora

// La stessa identica frase in tutti i casi in cui non si deve capire
// se l'email esiste. Scritta una volta sola perché resti identica.
const NON_TORNA = 'Email o password non corrette.';
const RECUPERO_INVIATO = 'Se quell\'indirizzo è registrato, ti abbiamo mandato le istruzioni. ' +
                         'Controlla anche la posta indesiderata.';

export function creaAccessoEmail({ archivio, anagrafe, orologio = Date.now, spedisci = null, indirizzoSito = '' }) {
  const chiaveEmail = (email) => 'email:' + email;
  const chiaveRecupero = (impronta) => 'recupero:' + impronta;

  // ----------------------------------------------------------
  // REGISTRARSI
  // Se stavi già giocando da ospite, l'account si attacca a TE: non
  // perdi sharkini né carte. È il motivo per cui si può giocare
  // prima e registrarsi dopo.
  // ----------------------------------------------------------
  async function registrati(emailGrezza, password, nome, gettoneOspite) {
    const email = normalizzaEmail(emailGrezza);
    if (!email) return { ok: false, campo: 'email', motivo: 'Questo indirizzo email non sembra giusto.' };

    const buona = controllaPassword(password, email);
    if (!buona.ok) return { ok: false, campo: 'password', motivo: buona.motivo };

    const gia = await archivio.leggi(chiaveEmail(email));
    if (gia) {
      // Qui SÌ che lo diciamo: chi si sta registrando ha appena scritto
      // quell'indirizzo, quindi non sta scoprendo niente che non sappia.
      return { ok: false, campo: 'email', motivo: 'Questo indirizzo è già registrato. Prova ad accedere.' };
    }

    // riuso il giocatore ospite, se ce n'è uno
    let gettone = null;
    if (typeof gettoneOspite === 'string' && gettoneOspite.length >= 32) {
      const mio = await anagrafe.carica(gettoneOspite);
      if (mio && !mio.email) gettone = gettoneOspite;
    }
    if (!gettone) gettone = (await anagrafe.entra(null, nome)).gettone;

    const g = await anagrafe.carica(gettone);
    g.email = email;
    g.password = await impastaPassword(password);
    g.registratoIl = orologio();
    if (nome && !g.nome) g.nome = nome;
    await archivio.scrivi('giocatore:' + gettone, g);
    await archivio.scrivi(chiaveEmail(email), { gettone, registratoIl: orologio() });

    return { ok: true, gettone, email, nuovo: true };
  }

  // ----------------------------------------------------------
  // ENTRARE
  // ----------------------------------------------------------
  async function accedi(emailGrezza, password) {
    const email = normalizzaEmail(emailGrezza);
    if (!email) return { ok: false, motivo: NON_TORNA };

    const voce = await archivio.leggi(chiaveEmail(email));
    if (!voce) {
      // Nessun account. Aspetto lo stesso il tempo di un controllo
      // vero: se rispondessi subito, la differenza di velocità
      // direbbe "questa email non esiste" senza bisogno di leggere.
      await passwordGiusta(password, 'scrypt$16384$8$1$' + '0'.repeat(32) + '$' + '0'.repeat(128));
      return { ok: false, motivo: NON_TORNA };
    }

    const g = await anagrafe.carica(voce.gettone);
    if (!g || !g.password) return { ok: false, motivo: NON_TORNA };

    const bloccato = quantoDeviAspettare(g);
    if (bloccato > 0) {
      return { ok: false, bloccato: true, minuti: Math.ceil(bloccato / 60000),
               motivo: 'Troppi tentativi. Riprova fra ' + Math.ceil(bloccato / 60000) + ' minuti.' };
    }

    if (!(await passwordGiusta(password, g.password))) {
      g.tentativiFalliti = (g.tentativiFalliti || 0) + 1;
      g.ultimoTentativo = orologio();
      await archivio.scrivi('giocatore:' + voce.gettone, g);
      return { ok: false, motivo: NON_TORNA };
    }

    g.tentativiFalliti = 0;
    g.ultimoAccesso = orologio();
    await archivio.scrivi('giocatore:' + voce.gettone, g);
    return { ok: true, gettone: voce.gettone, email, nuovo: false };
  }

  function quantoDeviAspettare(g) {
    if ((g.tentativiFalliti || 0) < TENTATIVI_PRIMA_DI_ASPETTARE) return 0;
    const passato = orologio() - (g.ultimoTentativo || 0);
    return Math.max(0, ATTESA_DOPO_I_TENTATIVI_MS - passato);
  }

  // ----------------------------------------------------------
  // HO DIMENTICATO LA PASSWORD
  // La risposta è SEMPRE la stessa, esista l'email o no.
  // ----------------------------------------------------------
  async function chiediRecupero(emailGrezza) {
    const email = normalizzaEmail(emailGrezza);
    if (!email) return { ok: true, messaggio: RECUPERO_INVIATO };

    const voce = await archivio.leggi(chiaveEmail(email));
    if (!voce) return { ok: true, messaggio: RECUPERO_INVIATO };

    const gettone = gettoneDiRecupero();
    await archivio.scrivi(chiaveRecupero(gettone.impronta), {
      gettoneGiocatore: voce.gettone,
      email,
      creatoIl: orologio(),
      scadeIl: orologio() + VALIDITA_RECUPERO_MS,
      usato: false
    });

    const collegamento = (indirizzoSito || '') + '/reimposta.html#gettone=' + gettone.chiaro;
    const messaggio = {
      a: email,
      oggetto: 'Burraco Legends — reimposta la password',
      testo:
        'Ciao,\n\n' +
        'hai chiesto di reimpostare la password di Burraco Legends.\n' +
        'Apri questo collegamento entro un\'ora:\n\n' +
        collegamento + '\n\n' +
        'Se non sei stato tu, non devi fare niente: la tua password resta quella di prima ' +
        'e nessuno è entrato nel tuo account.\n'
    };

    if (typeof spedisci === 'function') {
      try { await spedisci(messaggio); }
      catch (e) { console.error('  Non sono riuscito a mandare la mail di recupero:', e.message); }
    } else {
      // Nessun servizio di posta configurato. Invece di far finta che
      // sia partita, scrivo il collegamento qui: il recupero funziona
      // davvero, e chi gestisce il server può passarlo a mano.
      console.log('\n  ┌─ RECUPERO PASSWORD (nessuna posta configurata) ─');
      console.log('  │  per: ' + email);
      console.log('  │  ' + collegamento);
      console.log('  └─ vale un\'ora, una volta sola\n');
    }

    return { ok: true, messaggio: RECUPERO_INVIATO, collegamentoDiProva: spedisci ? null : collegamento };
  }

  // ----------------------------------------------------------
  // REIMPOSTARE
  // ----------------------------------------------------------
  async function reimposta(gettoneChiaro, nuovaPassword) {
    if (typeof gettoneChiaro !== 'string' || gettoneChiaro.length < 32) {
      return { ok: false, motivo: 'Questo collegamento non è valido.' };
    }
    const chiave = chiaveRecupero(improntaGettone(gettoneChiaro));
    const richiesta = await archivio.leggi(chiave);
    if (!richiesta) return { ok: false, motivo: 'Questo collegamento non è valido.' };
    if (richiesta.usato) return { ok: false, motivo: 'Questo collegamento è già stato usato. Chiedine un altro.' };
    if (orologio() > richiesta.scadeIl) return { ok: false, motivo: 'Questo collegamento è scaduto. Chiedine un altro.' };

    const buona = controllaPassword(nuovaPassword, richiesta.email);
    if (!buona.ok) return { ok: false, campo: 'password', motivo: buona.motivo };

    const g = await anagrafe.carica(richiesta.gettoneGiocatore);
    if (!g) return { ok: false, motivo: 'Questo account non esiste più.' };

    g.password = await impastaPassword(nuovaPassword);
    g.tentativiFalliti = 0;
    g.passwordCambiataIl = orologio();
    await archivio.scrivi('giocatore:' + richiesta.gettoneGiocatore, g);

    richiesta.usato = true;
    richiesta.usatoIl = orologio();
    await archivio.scrivi(chiave, richiesta);

    // Tutti gli altri collegamenti di recupero di questo account
    // decadono: se ne ho chiesti tre perché non arrivavano, gli altri
    // due non devono restare buoni in giro.
    for (const k of await archivio.tutte()) {
      if (!k.startsWith('recupero:') || k === chiave) continue;
      const altra = await archivio.leggi(k);
      if (altra && altra.gettoneGiocatore === richiesta.gettoneGiocatore && !altra.usato) {
        altra.usato = true;
        altra.annullatoDaUnAltroRecupero = true;
        await archivio.scrivi(k, altra);
      }
    }

    return { ok: true, gettone: richiesta.gettoneGiocatore, email: richiesta.email };
  }

  // Il collegamento è ancora buono? Serve alla pagina per non far
  // scrivere una password nuova e poi dire "no, era scaduto".
  async function collegamentoValido(gettoneChiaro) {
    if (typeof gettoneChiaro !== 'string' || gettoneChiaro.length < 32) return { ok: false };
    const r = await archivio.leggi(chiaveRecupero(improntaGettone(gettoneChiaro)));
    if (!r || r.usato || orologio() > r.scadeIl) return { ok: false };
    return { ok: true, email: r.email };
  }

  // ----------------------------------------------------------
  async function comeSeiRegistrato(gettone) {
    const g = await anagrafe.carica(gettone);
    if (!g) return { ok: false };
    return {
      ok: true,
      registrato: !!g.email,
      email: g.email || null,
      nome: g.nome || null,
      postaConfigurata: typeof spedisci === 'function'
    };
  }

  return { registrati, accedi, chiediRecupero, reimposta, collegamentoValido, comeSeiRegistrato };
}
