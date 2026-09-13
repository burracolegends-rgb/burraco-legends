// Verifica creaSpedizioneResend SENZA toccare la rete vera: fetch è
// iniettato finto, così il test resta veloce e ripetibile e non manda
// email per davvero a ogni `npm test`.
// Uso: node server/posta.test.js

import { creaSpedizioneResend } from './posta.js';

let failures = 0;
function check(label, cond) {
  console.log((cond ? 'OK   ' : 'FAIL ') + label);
  if (!cond) failures++;
}

// --- senza chiave, nessuna spedizione: si resta al comportamento di sempre ---
{
  const spedisci = creaSpedizioneResend({ apiKey: null, mittente: 'x@y.it' });
  check('senza RESEND_API_KEY non c\'è nessuna funzione da chiamare', spedisci === null);
}

// --- con la chiave, chiama Resend con i campi giusti ---
{
  let chiamata = null;
  const fetchFinto = async (url, opzioni) => {
    chiamata = { url, opzioni };
    return { ok: true };
  };
  const spedisci = creaSpedizioneResend({
    apiKey: 'chiave_di_prova', mittente: 'Burraco Legends <no-reply@esempio.it>', fetchImpl: fetchFinto
  });
  check('con una chiave arriva una funzione vera', typeof spedisci === 'function');

  await spedisci({ a: 'giocatore@esempio.it', oggetto: 'Oggetto di prova', testo: 'Corpo di prova' });
  check('chiama l\'endpoint giusto di Resend', chiamata.url === 'https://api.resend.com/emails');
  check('manda la chiave nell\'header Authorization',
    chiamata.opzioni.headers.Authorization === 'Bearer chiave_di_prova');
  const corpo = JSON.parse(chiamata.opzioni.body);
  check('il mittente è quello configurato', corpo.from === 'Burraco Legends <no-reply@esempio.it>');
  check('il destinatario è quello passato', corpo.to[0] === 'giocatore@esempio.it');
  check('oggetto e testo viaggiano intatti',
    corpo.subject === 'Oggetto di prova' && corpo.text === 'Corpo di prova');
}

// --- se Resend risponde con un errore, la funzione lo dice chiaramente ---
{
  const fetchFinto = async () => ({ ok: false, status: 422, text: async () => 'dominio non verificato' });
  const spedisci = creaSpedizioneResend({ apiKey: 'x', mittente: 'a@b.it', fetchImpl: fetchFinto });
  let errore = null;
  try { await spedisci({ a: 'x@y.it', oggetto: 'o', testo: 't' }); }
  catch (e) { errore = e; }
  check('un rifiuto di Resend lancia un errore leggibile',
    !!errore && /422/.test(errore.message) && /dominio non verificato/.test(errore.message));
}

console.log('\n' + (failures === 0 ? 'Tutti i controlli passati.' : failures + ' controlli falliti.'));
process.exit(failures === 0 ? 0 : 1);
