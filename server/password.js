// ============================================================
// BURRACO LEGENDS — LE PASSWORD
//
// Le password NON si salvano. Si salva un'impronta da cui non si torna
// indietro. Se un domani qualcuno mettesse le mani sul nostro archivio
// — e succede anche ai grandi — non deve trovarci dentro le password
// di nessuno. Non tanto per il nostro gioco: perché la gente riusa la
// stessa password sulla banca e sulla posta.
//
// COME
// scrypt, che Node ha già dentro. È fatto apposta per essere LENTO e
// per divorare memoria: a noi costa un decimo di secondo una volta
// sola, a chi volesse provare miliardi di password costa una fortuna
// in macchine. È il motivo per cui non si usa una funzione veloce.
//
// Ogni password ha il suo SALE, un pizzico di caso diverso per
// ognuno. Senza, due persone con la stessa password avrebbero la
// stessa impronta, e si potrebbero preparare tabelle già pronte.
//
// Il confronto è a TEMPO COSTANTE. Confrontare due stringhe col
// normale uguale è più veloce quando differiscono al primo carattere:
// misurando quei microsecondi si può indovinare l'impronta un pezzo
// alla volta. `timingSafeEqual` ci mette sempre lo stesso tempo.
// ============================================================
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

// Costo di scrypt. 16384 è il minimo che vale la pena; alzarlo rende
// tutto più sicuro e più lento anche per noi.
const COSTO = 16384;
const BLOCCO = 8;
const PARALLELO = 1;
const LUNGHEZZA = 64;

export const LUNGHEZZA_MINIMA_PASSWORD = 8;

// Le password più usate al mondo. Non è un elenco serio di sicurezza —
// serve a fermare le tre o quattro che qualcuno scriverebbe davvero.
const TROPPO_FACILI = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'principessa', 'juventus',
  'burraco1', 'burracolegends', 'abcd1234', '11111111', '00000000'
]);

function impronta(password, sale) {
  return new Promise((risolvi, rifiuta) => {
    scrypt(password, sale, LUNGHEZZA, { N: COSTO, r: BLOCCO, p: PARALLELO, maxmem: 64 * 1024 * 1024 },
      (err, chiave) => (err ? rifiuta(err) : risolvi(chiave)));
  });
}

// Quello che finisce nell'archivio: un'unica stringa che si porta
// dietro anche i parametri, così fra un anno, se alzeremo il costo, le
// impronte vecchie continueranno a funzionare.
export async function impastaPassword(password) {
  const sale = randomBytes(16);
  const chiave = await impronta(password, sale);
  return ['scrypt', COSTO, BLOCCO, PARALLELO, sale.toString('hex'), chiave.toString('hex')].join('$');
}

export async function passwordGiusta(password, impastata) {
  if (typeof password !== 'string' || typeof impastata !== 'string') return false;
  const pezzi = impastata.split('$');
  if (pezzi.length !== 6 || pezzi[0] !== 'scrypt') return false;
  const [, n, r, p, saleHex, chiaveHex] = pezzi;
  let mia;
  try {
    const sale = Buffer.from(saleHex, 'hex');
    mia = await new Promise((risolvi, rifiuta) => {
      scrypt(password, sale, Buffer.from(chiaveHex, 'hex').length,
        { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
        (err, k) => (err ? rifiuta(err) : risolvi(k)));
    });
  } catch (e) { return false; }
  const sua = Buffer.from(chiaveHex, 'hex');
  if (mia.length !== sua.length) return false;
  return timingSafeEqual(mia, sua);
}

// ------------------------------------------------------------
// LA PASSWORD VA BENE?
// I motivi sono in italiano perché li legge chi si registra.
// ------------------------------------------------------------
export function controllaPassword(password, email) {
  if (typeof password !== 'string' || !password) {
    return { ok: false, motivo: 'Scrivi una password.' };
  }
  if (password.length < LUNGHEZZA_MINIMA_PASSWORD) {
    return { ok: false, motivo: 'La password deve essere di almeno ' + LUNGHEZZA_MINIMA_PASSWORD + ' caratteri.' };
  }
  if (password.length > 200) {
    return { ok: false, motivo: 'Questa password è troppo lunga.' };
  }
  if (TROPPO_FACILI.has(password.toLowerCase())) {
    return { ok: false, motivo: 'Questa password la usano in troppi. Scegline un\'altra.' };
  }
  // La password non deve essere il nome della tua email — ma solo se
  // quel nome è abbastanza lungo da voler dire qualcosa. Con un
  // indirizzo tipo "p@posta.it" la parte prima della chiocciola è "p",
  // e vietare ogni password che contiene una "p" sarebbe assurdo.
  const nomeEmail = email ? String(email).split('@')[0].toLowerCase() : '';
  if (nomeEmail.length >= 4 && password.toLowerCase().includes(nomeEmail)) {
    return { ok: false, motivo: 'La password non può contenere il tuo indirizzo email.' };
  }
  return { ok: true };
}

// ------------------------------------------------------------
// L'EMAIL
// Non provo a validarla col regolamento completo — è una tana di
// conigli e finisce sempre col rifiutare indirizzi veri. Controllo che
// abbia la forma giusta e la riduco a una forma sola, così "Mario@X.IT"
// e "mario@x.it" sono la stessa persona.
// ------------------------------------------------------------
export function normalizzaEmail(v) {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e)) return null;
  return e;
}

// ------------------------------------------------------------
// I GETTONI DI RECUPERO
// Si manda per email quello in chiaro; nell'archivio si tiene solo la
// sua impronta. Se qualcuno leggesse l'archivio non potrebbe usarli
// per entrare — che è tutto il punto.
// ------------------------------------------------------------
export function gettoneDiRecupero() {
  const chiaro = randomBytes(32).toString('hex');
  return { chiaro, impronta: improntaGettone(chiaro) };
}

export function improntaGettone(chiaro) {
  return createHash('sha256').update(String(chiaro)).digest('hex');
}
