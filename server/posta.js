// ============================================================
// SPEDIRE DAVVERO UNA EMAIL — tramite Resend (https://resend.com)
//
// Finché questo modulo non è collegato, server/accesso-email.js scrive
// il collegamento di recupero nei log del server invece di spedirlo
// (vedi il commento li' sopra, "spedisci"): funziona per provare la
// logica, non per un utente vero che ha perso la password e non ha
// accesso ai log del server.
//
// PERCHÉ RESEND
// Piano gratuito ragionevole per iniziare (100 email al giorno / 3000 al
// mese), un'API HTTP semplice — un solo POST, niente configurazione SMTP
// da tenere in piedi — e pensato apposta per mandare a indirizzi mai
// visti prima, il caso normale di un recupero password.
//
// SENZA UN DOMINIO VERO VERIFICATO, RESEND MANDA SOLO A TE STESSO.
// Appena apri l'account puoi già mandare email, ma solo al tuo stesso
// indirizzo di iscrizione (modalità sandbox) — utile per provare che il
// collegamento arrivi davvero, non ancora per un giocatore vero. Per
// mandare a chiunque serve verificare un dominio (pochi minuti,
// aggiungendo dei record DNS dal pannello di chi ti ha venduto il
// dominio) — vedi resend.com/domains. Finché il dominio non è
// verificato, l'invio a un indirizzo che non è il tuo fallisce e basta:
// meglio saperlo prima di segnalarlo come un bug.
//
// CONFIGURAZIONE — due variabili d'ambiente, dove gira il server
// (su Render: Dashboard del servizio → Environment):
//   RESEND_API_KEY  — la chiave dell'account Resend (Dashboard → API Keys)
//   MITTENTE_EMAIL  — l'indirizzo che il destinatario vede come mittente,
//                     deve appartenere al dominio verificato, es.
//                     "Burraco Legends <no-reply@tuodominio.it>"
// Senza RESEND_API_KEY il server resta com'era: nessuna vera email
// parte, il collegamento si legge nei log — vedi creaSpedizioneResend
// qui sotto, che in quel caso restituisce null apposta.
// ============================================================

export function creaSpedizioneResend({ apiKey, mittente, fetchImpl } = {}) {
  if (!apiKey) return null;   // nessuna chiave: si resta al comportamento di sempre (log, non email)
  const chiamaFetch = fetchImpl || fetch;

  return async function spedisci({ a, oggetto, testo }) {
    const risposta = await chiamaFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: mittente,
        to: [a],
        subject: oggetto,
        text: testo
      })
    });
    if (!risposta.ok) {
      // Il motivo più comune: dominio del mittente non ancora verificato,
      // o si sta mandando a un indirizzo diverso dal proprio in sandbox.
      // Il testo di Resend lo spiega meglio di un codice muto.
      const corpo = await risposta.text().catch(() => '');
      throw new Error('Resend ha risposto ' + risposta.status + ': ' + corpo);
    }
  };
}
