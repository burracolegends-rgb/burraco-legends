# Mettere Burraco Legends online

Fine del tunnel: un indirizzo fisso, che resta uguale, e il tuo computer
può stare spento. Ci vogliono circa venti minuti la prima volta, e poi
ogni aggiornamento è automatico.

**Non serve nessuna carta di credito.**

---

## Perché Render e non Fly

Fly ha chiuso il piano gratuito ai nuovi account: oggi dà una prova di
pochi giorni, poi la carta è obbligatoria. Quindi la carta rifiutata ci
ha risparmiato una sorpresa più avanti, non ci ha tolto niente.

Render ha un piano gratuito vero. In cambio ha due limiti, che è meglio
conoscere prima che scoprirli:

**1. Dopo 15 minuti senza visite il server si addormenta.** Alla prima
richiesta si sveglia da solo, ma ci mette circa un minuto. In pratica:
chi apre per primo aspetta, e da lì in poi fila liscio. Finché qualcuno
sta giocando il server resta sveglio, perché il tavolo tiene sempre una
domanda aperta verso di lui.

**2. Il disco non sopravvive.** Sul piano gratuito il file dei giocatori
vive finché il server è acceso: quando si riaccende, sharkini e album
ripartono da zero. Le partite in corso si perdono comunque, perché
vivono nella memoria.

Il secondo limite è il vero prezzo del gratis. Va benissimo per provare
il gioco; il giorno che diventa un fastidio si sposta il magazzino su un
database — `server/archivio.js` è stato scritto con quattro funzioni
apposta per quel giorno, e cambia una riga di `server.js`.

---

## Cosa serve prima

Un account **GitHub** (gratuito) e un account **Render** (gratuito).
Render prende il codice da GitHub: ogni volta che carichi una modifica,
il server si aggiorna da solo.

Se non hai mai usato GitHub, la strada più corta è **GitHub Desktop**:
si scarica da [desktop.github.com](https://desktop.github.com), si fa
l'account da lì, e il resto si fa con dei bottoni invece che con i
comandi.

---

## 1. Mettere il progetto su GitHub

Con **GitHub Desktop**:

1. `File` → `Add local repository` → scegli la cartella `Burraco Battle`
2. Se dice che non è un repository, premi **`create a repository`**
3. Lascia il nome com'è, premi **Create repository**
4. In alto premi **Publish repository**
5. **Togli la spunta a "Keep this code private"** se vuoi che sia
   pubblico, oppure lasciala: Render legge anche i progetti privati.
6. Premi **Publish**

Il file `.gitignore` che c'è già tiene fuori le cose che non devono
salire: `node_modules`, e soprattutto `dati/` — cioè sharkini, album e
account di chi ha giocato. Quelli sono di chi gioca, non del progetto.

---

## 2. Creare il servizio su Render

1. Vai su [render.com](https://render.com) e fai l'account (**Sign up
   with GitHub** è la strada più corta: così Render vede già i tuoi
   progetti)
2. Nel pannello premi **New** → **Blueprint**
3. Scegli il progetto `Burraco-Battle` dall'elenco
4. Render legge il file `render.yaml` che c'è già nel progetto e prepara
   tutto da solo: nome, piano gratuito, regione Francoforte, controllo
   di salute
5. Premi **Apply**

Il primo rilascio ci mette qualche minuto. Quando finisce, in alto trovi
l'indirizzo, qualcosa come:

```
https://burraco-legends.onrender.com
```

**Quello è l'indirizzo definitivo.** Non cambia più: puoi mandarlo al
tuo amico una volta sola.

---

## 3. Un'ultima impostazione

Serve solo perché le mail di recupero password contengano l'indirizzo
giusto.

1. Nel pannello di Render apri il servizio
2. `Environment` → `Add Environment Variable`
3. Nome: `INDIRIZZO_SITO`
4. Valore: l'indirizzo che ti ha dato Render, per intero, con `https://`
5. Salva — il server si riavvia da solo

---

## Da qui in poi

Ogni volta che cambi qualcosa: in GitHub Desktop scrivi due parole in
basso a sinistra, premi **Commit to main**, poi **Push origin**. Render
se ne accorge e ricostruisce il server da solo in un paio di minuti.

Prima di caricare, però, doppio clic su **`CONTROLLA-TUTTO.bat`**: se
qualcosa si è rotto è molto meglio scoprirlo sul tuo computer che dopo,
con il tuo amico che aspetta.

---

## Se qualcosa va storto

**Il sito non risponde e ci mette tantissimo.** È il risveglio: aspetta
un minuto buono e ricarica. Succede solo dopo un lungo silenzio.

**"Questo tavolo non c'è più" a metà partita.** Il server si è riavviato
— per un aggiornamento o dopo un sonno. Le partite vivono nella memoria,
quindi si sono perse. Riaprite un tavolo nuovo.

**Sharkini e album azzerati.** È il limite del disco, non un difetto.
Vedi sopra.

**Il rilascio fallisce.** Nel pannello di Render, `Logs`: gli errori
sono scritti lì. Il server stampa all'avvio anche il percorso del
magazzino e un avviso in chiaro quando quel magazzino non sopravvive ai
riavvii, così non ci sono sorprese silenziose.

---

## Il giorno che vorrai pagare

Il problema non era Fly: le carte **prepagate** vengono spesso rifiutate
dai controlli antifrode, e la Postepay Evolution è prepagata anche se ha
l'IBAN. La strada che di solito funziona è una normale carta di debito
bancaria, oppure PayPal dove è accettato. Conviene provare con l'importo
minimo prima di contarci.

Con un piano a pagamento spariscono tutti e due i limiti: il server non
dorme più e il disco sopravvive.
