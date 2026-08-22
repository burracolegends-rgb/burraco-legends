# Burraco Legends

Progetto **separato al 100%** da "Circolo Burraco" (Burraco Pulito): nessun
backend condiviso, nessun account/database in comune, nessun deploy condiviso.
Da questo progetto non si tocca mai il progetto Supabase `dnzofevqadohyljgjohl`
("Burraco puro") né i file dentro la cartella `burraco/`.

Quello che **è stato riusato** da Burraco Pulito è solo codice: le funzioni
pure del motore di regole (mazzo, validazione calate, punteggio carte), copiate
e adattate — non un collegamento live, non lo stesso file.

## Struttura

```
/spec                  ← specifiche di design (fonte di verità per le regole)
/engine
  core-rules.js          ← motore di regole portato da Burraco Pulito (mazzo,
                            calate, punti carta, classificazione lunghezza)
  core-rules.test.js     ← verifica rapida del port
  partita.js        ← motore di partita: turno pesca/attacco/scarto,
                            orologio per giocatore, danno, KO, chiusura
  partita.test.js   ← 20 controlli sul motore di partita
  magic-cards.js         ← Carte Magiche: catalogo effect, Sorpresa/Trappola
  magic-cards.test.js    ← 24 controlli sul motore Carte Magiche
  character-abilities.js ← Abilità Personaggio (spec §7): cicliche (pulso/buff) ed eventi
  character-abilities.test.js ← 17 controlli standalone + agganciate in partita.test.js
  bot.js                 ← avversario artificiale di capacità media
  bot.test.js            ← controlli + 60 partite bot contro bot + misure di bilanciamento
/cards
  /data                  ← personaggio_NNN.json, trappola_NNN.json, sorpresa_NNN.json
                            (8 personaggi d'esempio, 2 sorpresa, 2 trappola)
  /i18n                  ← it.json / en.json / es.json / pt.json (nome+descrizione di ogni carta, 4 lingue)
  /images                ← personaggio_NNN.png / trappola_NNN.png / sorpresa_NNN.png
/client
  selezione.html         ← schermata pre-partita (spec §12): 4 personaggi (uno a seme)
                            + 3 Carte Magiche, cambio lingua dal vivo. Apribile col doppio clic.
  home.html               ← home ispirata all'immagine di riferimento del committente:
                            valuta/livello in alto, 3 modalità, barra di navigazione. Apribile col doppio clic.
  tavolo.html             ← il tavolo di gioco vero, col motore reale incorporato.
                            GENERATO da strumenti/genera-tavolo.py: non modificarlo a mano.
                            Si apre col doppio clic.
/strumenti
  genera-tavolo.py        ← rigenera client/tavolo.html (motore + carte + stile)
  game.html               ← copia del tavolo di Burraco Pulito: da qui si prende SOLO il CSS
```

`npm run test:engine` esegue entrambe le suite di test.

## Assunzioni prese in `partita.js` (la spec non le fissa — da confermare)

- ATT usato nella formula danno = ATT del personaggio dell'attaccante **dello stesso seme** della calata.
- Ridistribuzione su bersaglio singolo già a 0 PV: danno diviso in parti uguali sui superstiti.
- AoE (7+): il danno pieno colpisce ciascuno dei 4 personaggi avversari (non diviso per 4).
- Orologio **per giocatore** (non condiviso), come il monte a squadra di Burraco Pulito: 1 minuto a turno, 15 minuti totali a testa.
- **Confermato**: se scadono i 15 minuti senza chiusura né KO, vince chi ha più PV totali rimasti sui propri 4 personaggi (stessa regola estesa anche al mazzo esaurito, caso analogo non coperto dalla spec originale). Pareggio se i PV totali sono uguali — questo caso limite non è stato ancora confermato esplicitamente.
- Personaggi ancora placeholder di default (PV 100 / ATT 100), ma `createMatch({ characters, abilities })` accetta già dati veri — vedi sotto.

## Danno dei GRUPPI (tris) — confermato dal committente

I gruppi (tris di stesso valore, semi diversi per costruzione in un mazzo doppio) infliggono danno anche loro, in modo diverso dalle sequenze: **ogni singola carta colpisce il personaggio del proprio seme**, per il proprio punteggio × (ATT del personaggio attaccante dello stesso seme / 100). Esempio dalla spec: un tris di 3 (cuori, picche, fiori) da 5 punti ciascuna toglie 5 PV a ciascuno dei 3 semi coinvolti.

Se il gruppo cresce oltre 3-4 carte, un bonus di lunghezza dedicato si applica (diverso dalla tabella delle sequenze, spec §4): **5 carte +10%, 6 carte +20%, 7+ carte +35%**.

Assunzione aggiuntiva mia, non ancora confermata: se il danno verso un seme è "sprecato" (personaggio già a 0 PV), si ridistribuisce sui personaggi avversari **non già colpiti direttamente da questo stesso tris** — per non concentrare due volte il danno sugli stessi bersagli. Un jolly nel gruppo non ha seme e non infligge danno.

## Abilità Personaggio (`engine/character-abilities.js`, spec §7)

Riusa il catalogo `effect` e l'esecutore di `magic-cards.js` (stesso principio guida della spec: non inventare meccaniche nuove). Tre famiglie, tutte testate e agganciate dentro `partita.js`:

- **`ciclico_pulso`**: ogni N turni PROPRI del personaggio, un effetto istantaneo scatta una volta (l'esempio letterale della spec — "-50 PV a un avversario a caso ogni 4 turni" — è sul personaggio 006, lo Spirito della Foresta Antica ★5).
- **`ciclico_buff`**: attivo A turni (buff applicato), poi pausa B turni (buff rimosso), a ripetizione — applicato subito all'inizio partita.
- **Trigger a evento**, agganciati al game loop esistente: `on_pozzetto`, `on_chiusura`, `on_infliggo_danno`, `on_subisco_danno`. Non elencati esplicitamente dalla spec (che dice solo "da agganciare a trigger del game loop già esistenti"), stesso approccio già usato per i trigger delle Carte Trappola.

`createMatch({ characters, abilities })` accetta ora sia VITA/ATT reali sia le abilità: gli 8 personaggi d'esempio in `/cards/data` hanno tutti un'abilità vera (mix delle 3 famiglie, valori 10-20% come da spec per boost/difesa).

## Tavolo di gioco (`client/tavolo.html`)

**Si apre col doppio clic**, senza server e senza rete: motore e dati carta sono incorporati nella pagina.

> **`client/tavolo.html` è un file GENERATO — non modificarlo a mano.**
> Dopo ogni modifica al motore (`engine/`) o alle carte (`cards/`), rigeneralo:
> ```
> python strumenti/genera-tavolo.py
> ```
> Senza questo passaggio il tavolo continuerebbe a usare la versione precedente del motore.
>
> **Se aggiungi un file nuovo in `engine/`**, va messo anche nell'elenco `ORDINE` dentro il generatore, prima dei moduli che lo importano. Il generatore ora se ne accorge da solo e si ferma con un messaggio esplicito invece di produrre un tavolo che muore all'avvio con "Il tavolo non è partito" — è successo aggiungendo `vocabolario.js`.

**È il motore vero**, non un mockup: il generatore incorpora `engine/core-rules.js`, `magic-cards.js`, `character-abilities.js` e `partita.js` — lo stesso codice coperto dagli 81 controlli automatici — impacchettandoli come moduli isolati (serve davvero: `SUITS` è dichiarato sia in `core-rules.js` sia in `magic-cards.js`, e incollandoli uno dietro l'altro il browser si fermerebbe con *"Identifier 'SUITS' has already been declared"*).

**È il tavolo di Burraco Pulito, non un tavolo nuovo.** Il foglio di stile di `game.html` è stato copiato **verbatim** (71 KB) e la struttura del corpo pagina è la stessa: fascia superiore con l'avversario, colonne dei giochi calati al centro, riga di pozzetti/mazzo/scarti, mano a ventaglio in basso, ordinamento per seme/valore. Feltro, carte, misure e proporzioni sono quelli di prima.

**Le due sole aggiunte** sono le strisce da **7 carte Battle** (4 personaggi, uno per seme, + 3 Carte Magiche del deck):

- le **mie** stanno nella riga di mazzo e scarti, **a destra**. Il monte scarti ha `flex: 1 1 auto` e le 7 carte `flex: 0 0 auto`: gli scarti si stringono da soli man mano che aumentano e non arrivano mai a invadere quella zona;
- quelle dell'**avversario** stanno in alto, **fra il tasto impostazioni e la sua mano**.

Le carte hanno un aspetto fantasy (cornice dorata, alone del seme, stelle di rarità) e passandoci sopra col cursore si apre **un pannello di dettaglio a fianco** con nome, rarità, VITA/ATT e descrizione. Prima la carta veniva semplicemente ingrandita e il testo usciva dai bordi: ora il testo ha un riquadro di larghezza propria e non può sbordare. Ogni personaggio ha due barre: **VITA** e **carica**. Le mie Carte Magiche sono cliccabili (Sorpresa: **grande animazione a schermo**, spec §6; Trappola: si arma e resta coperta, mostrando solo che è attiva). Le Carte Magiche dell'avversario sono **sempre coperte**; i suoi personaggi invece si vedono, perché servono a sapere dove colpire.

Le carte da gioco sono **disegnate con CSS** (stile "striscia" già presente nel foglio di stile originale), quindi non servono i 375 KB di immagini di `carte-v1.js`: la pagina è autosufficiente.

**Si gioca contro un bot** (`engine/bot.js`), di capacità media: riconosce tris e scale, cala partendo dalle combinazioni più lunghe, non spreca jolly e pinelle quando non serve, sceglie lo scarto meno utile. Non conta le carte uscite, non pianifica le mosse future e non sceglie quale seme avversario colpire — è un avversario credibile con cui provare il gioco, non un campione. Usa solo le azioni pubbliche del motore, quindi non può barare. Le sue mosse vengono mostrate una alla volta, con una pausa, per poter seguire cosa fa.

**Assunzione da segnalare — la barra "carica"**: hai detto "si caricheranno a seconda dei punteggi, ma questo lo vedremo più avanti". Ho quindi messo la barra pronta con un incremento dimostrativo provvisorio (+15 quando quel personaggio infligge danno con una calata, tetto 100) solo per mostrare l'elemento grafico — il meccanismo vero resta da definire.

**Cosa non è ancora collegato**: la selezione reale fatta in `selezione.html` (oggi `tavolo.html` parte con una squadra d'esempio fissa per ciascun giocatore, non con quella scelta dal giocatore) — passaggio naturale da fare quando ci sarà un vero abbinamento partite.

**Verifica**: 19 controlli funzionali eseguiti facendo girare per davvero la pagina in un DOM simulato **nelle stesse condizioni del doppio clic** (indirizzo `file://`, `fetch` deliberatamente disattivato: se il codice provasse a usare la rete, il test fallirebbe). Coprono: carte distribuite, 7 carte per lato al posto giusto, magiche avversarie coperte, mano avversaria illeggibile, pesca/selezione/scarto attraverso l'interfaccia. Non è stato possibile provarla in un browser vero (qui non si può installare un browser headless), quindi l'aspetto finale va comunque guardato a video.

## Carte Magiche — stato attuale

`magic-cards.js` implementa il catalogo `effect` completo (spec §6) e le regole di selezione/attivazione (3 carte, mix libero; Sorpresa 1 sola per partita anche se ne hai selezionate di più; Trappola fino a 3, scade dopo un numero fisso di turni se il trigger non scatta mai — default 3, la spec lascia aperto se 3 o 5).

**Effetti completi e testati subito** (danno_diretto, danno_percentuale, cura_diretta, scarto_forzato, scambio_carte, brucia_carta, boost_att, boost_difesa, ricarica_sorpresa): applicano davvero le carte, i personaggi, il mazzo.

**Tutti gli effetti sono ora collegati al gioco** (era il buco più grosso: fino a ieri le Trappole si armavano ma non scattavano mai, e nove effetti su venti erano registrati senza che nessuno li leggesse).

- Le **Trappole scattano da sole**: ogni azione chiama `scattaTrappole()` con l'evento appena successo (`avversario_pesca`, `subisco_danno`, `avversario_cala_7piu`) e le trappole in ascolto partono, una volta sola.
- Gli **effetti sul flusso** (`raddoppia_danno`, `riflette_danno`, `annulla_danno`, `restrict_draw_source`, `pesca_ridotta`, `pesca_extra`, `blocca_monte_scarti`, `skip_fase_attacco`, `skip_turno_intero`, `turno_extra`) vengono depositati su `player.effettiSubiti` e letti dal motore nella fase giusta: pesca, calcolo del danno, passaggio di turno.
- Lo stato delle Carte Magiche vive **dentro lo stato di partita** (`player.magic`), non più solo nel client: è ciò che permette al motore di farle funzionare.

Coperto da `engine/magie-in-partita.test.js` (30 controlli).

**Assunzione aggiuntiva**: la spec definisce il campo `trigger` come "quasi sempre `on_activate`", adatto alle Sorprese (uso immediato). Per le Trappole, che restano coperte in attesa di un evento, ho introdotto nomi di evento specifici non elencati nella spec (es. `avversario_pesca`, `subisco_danno`, `avversario_cala_7piu`) — il vocabolario esatto dei trigger di Trappola è un punto da definire insieme prima di scrivere le carte vere.

## Schermata di selezione (`client/selezione.html`)

Implementa la spec §12 (selezione obbligatoria 4 personaggi, uno a seme, + 3 Carte Magiche prima di entrare in lista partite) e il cambio lingua a runtime della §12bis (rileva `navigator.language`, fallback inglese, pulsanti IT/EN/ES/PT sempre disponibili). Dati carta incorporati nel file stesso — funziona aprendola col doppio clic, senza server — presi come istantanea di `/cards/data` e `/cards/i18n`: quando questi cresceranno con carte vere, andrà collegata a un caricamento reale (`fetch`) invece dei dati incorporati.

Non è ancora collegata a un matchmaking vero: il pulsante "Entra in lista partite" mostra solo un riepilogo della selezione (non esiste ancora un server/lobby per Battle).

**Ordinamento per quando ci saranno tante carte**: sia i personaggi (dentro ogni seme) sia le Carte Magiche si ordinano di default per **punteggio (rarità) decrescente** — le carte a più stelle si vedono per prime — con un menù "Ordina per: Punteggio / Nome" per cambiarlo. Ho usato la `rarita` (1-5 stelle) come "punteggio", perché è l'unico valore di classificazione già definito in spec (lo stesso concetto del "valore" nel pity system, §10); finora esisteva solo sui personaggi, l'ho aggiunta anche alle 4 Carte Magiche d'esempio. Se il "punteggio" che avevi in mente è un altro criterio, va aggiornato qui.

## Cosa è già portato dal motore esistente

| Da Burraco Pulito | In questo progetto | Note |
|---|---|---|
| `createFullDeck`, `shuffle` | `engine/core-rules.js` | invariato, JS puro |
| `isValidGroup`, `isValidSequence`, `tryBuildSequence` | `engine/core-rules.js` | invariato: regole tris/scale/wildcard |
| `cardPointValue` | `engine/core-rules.js` | stessi valori: 3-7=5, 8-K=10, Asso=15, pinella=20, jolly=30 — risolve il punto aperto "valori punti esatti" della spec |
| classificazione lunghezza calata (da `classifyBurraco`) | `engine/core-rules.js` → `meldLengthTier` | riadattata per le fasce 5 / 6 / 7+ della formula danno, non per pulito/sporco |
| struttura turno pesca→attacco→scarto, timer server-authoritative | da riportare quando si scrive il server della partita | pattern da riusare, non ancora portato in questo scheletro |

## Cosa NON esiste ancora (da scrivere da zero per Battle)

Personaggi (VITA/ATT/abilità), formula danno, condizione KO, Carte Magiche
(Sorpresa/Trappola) e catalogo `effect`, schermata selezione pre-partita,
valuta/gacha/pity, i18n a runtime. Vedi `/spec` per il dettaglio.
