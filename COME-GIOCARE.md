# Come provare Burraco Legends in due

## In breve

1. Doppio clic su **`AVVIA-SERVER.bat`**
2. Si apre il browser sulla pagina di accesso: premi **Entra e gioca**
3. Dalla home scegli **Gioca con un amico** e apri un tavolo
4. Mandi al tuo amico il codice di sei lettere, lui lo digita, si gioca

Non serve registrarsi. Google e Facebook si possono collegare dopo, quando
vorrai ritrovare le tue carte anche da un altro telefono — come farlo sta in
`COLLEGARE-GOOGLE-FACEBOOK.md`.

La finestra nera che compare **è il server: va lasciata aperta.** Chiuderla
spegne il tavolo. Per fermarlo, `Ctrl+C` in quella finestra.

---

## Serve Node.js

Il server gira su Node. Se non ce l'hai, `AVVIA-SERVER.bat` te lo dice e ti
manda su [nodejs.org](https://nodejs.org): prendi la versione **LTS**,
installala lasciando tutto com'è, e ridai due clic sul file.

Non serve installare nient'altro. Nessuna libreria, nessun `npm install`:
il server usa solo quello che Node ha già dentro.

---

## Dove ti trova il tuo amico

Dipende da dove sta. All'avvio il server stampa gli indirizzi giusti,
ma vale la pena capire quale serve.

### È a casa tua, sulla stessa rete wi-fi

Il caso più semplice. Il server stampa una riga tipo:

```
Chi è sulla tua stessa rete (wi-fi di casa) apre:
                    http://192.168.1.34:8080
```

Lui apre quell'indirizzo dal suo telefono o dal suo computer e siete a posto.
Funziona anche fra il tuo computer e il tuo telefono, se vuoi provare da solo
come si vede da entrambe le parti.

Se non funziona, quasi sempre è il **firewall di Windows**: la prima volta
compare una finestra che chiede se autorizzare Node — bisogna dire di sì,
almeno per le "reti private".

### È a casa sua

Doppio clic su **`AVVIA-CON-TUNNEL.bat`**. Accende il server, apre una porta
verso l'esterno e ti scrive a schermo un indirizzo tipo
`https://qualcosa-a-caso.trycloudflare.com`: **quello mandi al tuo amico.**

Tieni aperte tutte e due le finestre — se le chiudi, il tavolo si spegne.

**La prima volta serve un file, una volta sola.** Il `.bat` te lo dice e ti
manda a prenderlo: si chiama `cloudflared`, è di Cloudflare, è gratuito e non
chiede nessuna registrazione.

1. Vai su [github.com/cloudflare/cloudflared/releases/latest](https://github.com/cloudflare/cloudflared/releases/latest)
2. Scarica **`cloudflared-windows-amd64.exe`**
3. Rinominalo in **`cloudflared.exe`**
4. Mettilo in questa cartella, accanto agli altri `.bat`

Poi ridai due clic e parte tutto da solo. Il file **non lo scarica il `.bat`**,
e non è pigrizia: un programma che si scarica da solo altri programmi e li
esegue è esattamente la cosa che non si deve fare, nemmeno quando la fonte
è buona.

**L'indirizzo cambia a ogni avvio.** Va bene per una serata; se vi dà fastidio
rimandarlo ogni volta, allora è il momento di mettere il server online per
davvero (vedi `METTERE-ONLINE.md`).

---

## Cosa aspettarsi in questa versione

Quello che **funziona**: la partita vera in due, con le regole complete —
calate, agganci, pozzetto, abilità degli eroi, carte magiche, il minuto per
turno, i sei minuti a testa.

**Se cade la linea, il tavolo si riapre da solo.** Chiudere la pagina o
perdere la connessione a meta' partita non fa perdere la partita: alla
riapertura ti ritrovi al tuo posto, con le tue carte. Il tavolo resta in
piedi due ore.

**Sharkini, album e pacchetti stanno sul server**, non nel browser. Chi
apre gli strumenti di sviluppo e si scrive un milione di sharkini non
ottiene niente: il conto lo tiene il server e le carte le estrae il server.
I dati restano nel file `dati/giocatori.json` e sopravvivono ai riavvii.

Ogni browser riceve alla prima visita un **gettone** che si tiene: è la tua
identità, senza registrazione e senza password. Il limite, detto chiaro: chi
cancella i dati del browser o cambia dispositivo riparte da zero. È il prezzo
di non avere ancora account veri.

Quello che **non c'è ancora**:

- **La scelta della squadra.** Le due squadre sono fisse, quattro eroi
  ciascuno, uguali a ogni partita. Serve a giocare, non a provare i mazzi.
- **Le ricariche non sono pagamenti veri.** Toccare una ricarica accredita
  sharkini senza che nessuno paghi niente: serve a provare il negozio.
  Quando arriveranno App Store e Play Store, il controllo della ricevuta si
  aggiunge in quel punto.
- **Le partite in corso vivono in memoria**: un riavvio del server le azzera.
  Sharkini e album invece no, quelli restano.

---

## Se qualcosa va storto

**La porta 8080 è occupata.** Il server te lo dice e si ferma. Usane un'altra:

```
set PORTA=8090 && node server\server.js
```

**Il tavolo dice "Questo tavolo non c'è più".** Il server è stato riavviato:
le partite vivono nella memoria del server, spegnerlo le cancella. Riaprite
un tavolo nuovo.

**Qualcosa si comporta in modo strano durante la partita.** Prima di
riavviare, salva il registro: apri nel browser

```
http://localhost:8080/api/registro?codice=IL-VOSTRO-CODICE
```

e salva quello che esce. Con quel file la partita si rigioca identica,
mossa per mossa, e si vede esattamente dove si è rotta — invece di doverci
ricordare cos'era successo.

---

## Per chi vuole guardarci dentro

```
npm test           controlla tutto: pagine allineate, motore, server
npm run costruisci ricostruisce le pagine di client/ dal motore
npm run allineate  dice solo SE sono rimaste indietro, senza toccarle
npm run server     avvia il server senza il .bat
```

Oppure doppio clic su **`CONTROLLA-TUTTO.bat`**, che fa tutto e lo scrive in
italiano.

**Perché `npm run allineate` esiste.** Le pagine in `client/` non si scrivono a
mano: si generano, e portano dentro una copia del motore perché devono aprirsi
anche col doppio clic. Se cambi una regola in `engine/` e ti dimentichi di
ricostruire, quella pagina continua a funzionare benissimo — con le regole
vecchie, e senza dirtelo. È già successo. Ora il controllo rigenera davvero le
pagine in una cartella a parte e le confronta byte per byte: se sono rimaste
indietro, i test si fermano e ti dicono quale comando lanciare.

Le pagine in `client/` si aprono anche col doppio clic, senza server: in quel
caso il tavolo gioca contro il bot e negozio, album e pacchetti funzionano in
locale. Il server serve solo per giocare in due.
