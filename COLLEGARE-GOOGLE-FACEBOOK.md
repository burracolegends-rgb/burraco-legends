# Accendere l'accesso con Google e Facebook

Il codice c'è già ed è provato. Quello che manca non lo posso fare io:
**registrare l'applicazione presso Google e Facebook**. Sono loro a doverti
dire "questa app è tua", e per farlo serve che sia tu, con le tue credenziali,
ad aprire il pannello.

Finché non lo fai, i due bottoni restano **spenti con scritto "da collegare"** —
e va benissimo: da ospite si gioca lo stesso. Un bottone che c'è e non funziona
sarebbe peggio.

---

## Prima di cominciare: ti serve un indirizzo pubblico

Google e Facebook vogliono sapere da quale indirizzo arriverà la richiesta.
`localhost` va bene per Google in fase di prova, ma non per Facebook. Quindi
conviene farlo **dopo** aver messo il server online (vedi `METTERE-ONLINE.md`),
quando avrai un indirizzo tipo `https://burraco-legends.fly.dev`.

---

## Google

1. Vai su [console.cloud.google.com](https://console.cloud.google.com) ed entra
   col tuo account Google.
2. Crea un progetto (il nome è solo per te: "Burraco Legends" va bene).
3. Nel menù cerca **API e servizi → Schermata consenso OAuth**. Scegli
   **Esterno**, metti nome dell'app, la tua email, e salva. Per adesso lascialo
   in stato di test: puoi aggiungere te e il tuo amico come utenti di prova.
4. Poi **API e servizi → Credenziali → Crea credenziali → ID client OAuth**.
   - Tipo: **Applicazione web**
   - **Origini JavaScript autorizzate**: il tuo indirizzo, per esempio
     `https://burraco-legends.fly.dev` (e, per provare in casa,
     `http://localhost:8080`)
5. Ti dà un **ID client**, una stringa lunga che finisce con
   `.apps.googleusercontent.com`. **Quello è tutto quello che serve.**

Il "client secret" che ti dà insieme **non serve** e non va messo da nessuna
parte: usiamo il flusso con il token identificativo, che il server verifica
chiedendo direttamente a Google. Meno segreti in giro, meno cose da custodire.

---

## Facebook

1. Vai su [developers.facebook.com](https://developers.facebook.com) →
   **Le mie app → Crea app**.
2. Scegli il caso d'uso **Autenticazione e richiesta dei dati degli utenti**.
3. Aggiungi il prodotto **Accesso Facebook** → **Web**, e metti l'indirizzo
   del sito.
4. In **Impostazioni → Di base** trovi **ID app** e **Chiave segreta dell'app**.

Qui la chiave segreta **serve davvero**, perché il server la usa per chiedere a
Facebook se un accesso è valido. Non finisce mai nel browser: resta solo nella
memoria del server.

---

## Dirlo al server

Le chiavi non vanno nel codice. Si passano come variabili d'ambiente, così non
finiscono mai in un file che potresti copiare o condividere per sbaglio.

**In casa, per provare** (prompt dei comandi di Windows):

```
set GOOGLE_ID_APP=1234567890-abcdefg.apps.googleusercontent.com
set FACEBOOK_ID_APP=1234567890123456
set FACEBOOK_SEGRETO_APP=la-tua-chiave-segreta
node server\server.js
```

**Sul server online** (Fly.io):

```
fly secrets set GOOGLE_ID_APP=1234567890-abcdefg.apps.googleusercontent.com
fly secrets set FACEBOOK_ID_APP=1234567890123456
fly secrets set FACEBOOK_SEGRETO_APP=la-tua-chiave-segreta
```

`fly secrets` è fatto apposta: le tiene cifrate e non le mostra più.

Riavvia il server. La pagina di accesso chiede da sola cosa è attivo e accende
i bottoni giusti: non c'è nient'altro da toccare.

---

## Come controllare che sia andata

Apri `https://il-tuo-indirizzo/api/salute`. Deve dire:

```json
{ "accessiAttivi": ["ospite", "google", "facebook"] }
```

Se un fornitore manca, quella chiave non è arrivata al server.

---

## Cosa succede a chi stava già giocando

Questa è la parte che mi interessava di più, ed è già gestita e provata:

**Se giocavi da ospite e colleghi Google, non perdi niente.** L'identità si
attacca al giocatore che sei già: stessi sharkini, stesse carte, stessa serie
di accessi. È il motivo per cui l'ospite viene prima e il collegamento dopo.

**Se quell'account Google era già di un altro giocatore, entri in quello** — e
la roba dell'ospite resta dov'è, separata. Non le unisco in silenzio: fondere
due borsellini è una decisione che non posso prendere io, e sbagliarla vuol dire
far sparire l'album a qualcuno. La pagina te lo dice a schermo, con i numeri.

**Puoi collegare tutti e due**, Google e Facebook, allo stesso giocatore. Da
lì in poi entri con quello che ti fa comodo e arrivi sempre a casa tua.

---

## Quello che resta da fare, quando saranno account veri

- **Cancellare l'account.** Google e Facebook lo pretendono per pubblicare, e
  comunque è giusto: chi vuole andarsene deve poterlo fare.
- **Informativa privacy e termini di servizio.** Servono all'atto della
  registrazione dell'app, e vanno scritti prima di aprire a chiunque.
- **Unire due account**, se un giorno decideremo che si può fare — con una
  schermata che chiede conferma e dice esattamente cosa succede.
