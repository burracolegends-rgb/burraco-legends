# BURRACO LEGENDS — Specifiche di Design (v2)

## 1. Struttura base
- Modalità: 1 contro 1
- Ogni giocatore schiera 4 Carte Personaggio (una per seme: ♥ ♠ ♣ ♦), ognuna con VITA, ATT, abilità
- Ogni giocatore seleziona 3 Carte Magiche (mix libero di Sorpresa/Trappola) prima di entrare in partita
- Mazzo classico da Burraco, pesca dal mazzo centrale o dal monte scarti
- Pozzetti: mantenuti, in aggiunta alle Carte Magiche (non in sostituzione)
- Una sola smazzata per partita (niente mani multiple)

## 2. Turno
Timer: **1 minuto per turno** a giocatore, **6 minuti totali a testa** per l'intera partita (erano 15: troppi, una partita non ci arrivava mai e l'orologio non contava niente). Esaurito il monte tempo la partita finisce e vince chi ha più PV totali.

1. **Pesca**: 2 carte dal mazzo, oppure prendi il monte scarti
2. **Attacco**: cali combinazioni per infliggere danno
3. **Scarto**: 1 carta, termina il turno

## 3. Condizioni di vittoria (doppia)
La partita finisce quando si verifica UNA delle due condizioni:

- **A) Chiusura**: un giocatore finisce le carte in mano (carte iniziali + eventuale pozzetto), calando almeno un Burraco da 5 carte (non basta accumulare tanti tris piccoli)
- **B) KO**: un giocatore azzera i PV di tutti e 4 i personaggi avversari

Il vincitore riceve una Carta Sorpresa/Trappola bonus (da definire in quale pool: sblocco permanente o bonus per la prossima partita).

## 4. Danno delle calate

### Sequenze (scale)
Formula: **Danno = (Somma punti carte, valori Burraco standard) × (ATT/100) × Moltiplicatore lunghezza**

| Carte | Moltiplicatore | Bersaglio | Ondata d'urto |
|---|---|---|---|
| 3-4 | ×1 | Singolo (personaggio dello stesso seme) — *aggiunta, vedi sotto* | — |
| 5 | ×1 | Singolo (personaggio dello stesso seme) | 10% |
| 6 | ×1,3 | Singolo | 20% |
| 7+ (Burraco) | ×1,6 | Tutti e 4 i personaggi avversari (AoE) | 35% |

**Ondata d'urto (aggiunta dopo il primo playtest)**: *in aggiunta* al danno delle carte, una scala lunga colpisce **tutti e 4** i personaggi avversari per una percentuale dell'**ATT del proprio eroe dello stesso seme** della calata (non dei punti delle carte, non dei PV). Anche questo colpo passa per la varianza 0,95-1,05.

**Agganci ai giochi già in tavola (aggiunta dopo il primo playtest)**: regola base del Burraco che mancava. Il minimo di tre carte vale solo per *aprire* un gioco nuovo; a un gioco già calato si possono aggiungere carte **anche una alla volta**. Il danno lo fanno le carte aggiunte, ma moltiplicatore e ondata si calcolano sulla lunghezza **raggiunta dal gioco intero**. L'ondata scatta **una volta sola per fascia**: altrimenti basterebbe agganciare una carta per volta per ripeterla all'infinito.

**Il Jolly nei gruppi (aggiunta dopo il primo playtest)**: il jolly non ha seme, quindi prima veniva saltato e non infliggeva nulla. Ora conta per i suoi **30 punti**, moltiplicati per l'**ATT del proprio eroe più forte** (la spada più alta fra i quattro), e colpisce **un personaggio avversario a caso** fra quelli ancora vivi. (Nelle *scale* il jolly sostituisce una carta di quel seme, quindi rientrava già nel conteggio normale.)

**Varianza del danno (aggiunta dopo il primo playtest)**: il risultato della formula viene moltiplicato per un fattore casuale fra **0,95 e 1,05**, così il danno non è mai un numero fisso e prevedibile.

**Riga 3-4 carte aggiunta dopo il primo playtest**: la tabella originale partiva da 5 carte, quindi una scala da 3-4 carte non infliggeva alcun danno. Era incoerente con i gruppi, dove un tris da 3 carte danneggia (regola confermata dal committente), e in partita risultava incomprensibile. Moltiplicatore ×1, lo stesso delle 5 carte: una scala più lunga fa comunque più male perché somma più punti. **Da confermare in playtest.**

### Gruppi (tris) — confermato
Ogni singola carta del gruppo colpisce il personaggio del **proprio seme**, per il proprio punteggio × (ATT del personaggio attaccante dello stesso seme / 100). Esempio: tris di 3 (cuori, picche, fiori) da 5 punti ciascuna → 5 PV tolti a ciascuno dei 3 semi coinvolti.

Se il gruppo cresce oltre 3-4 carte, bonus di lunghezza dedicato (scala diversa da quella delle sequenze):

| Carte nel gruppo | Bonus |
|---|---|
| 3-4 | nessuno |
| 5 | +10% |
| 6 | +20% |
| 7+ | +35% |

- Non serve più il "Burraco puro" (senza jolly) per attivare l'effetto 7+: qualunque scala/combinazione da 7+ carte dello stesso seme conta
- Se il personaggio avversario di quel seme ha già 0 PV, il danno si ridistribuisce sugli altri personaggi avversari rimasti (mai danno "sprecato")
- Punti carta: valori standard Burraco (3-7 = 5pt, 8-K = 10pt, Asso = 15-20pt, 2 jolly = 20pt, Jolly/Matta = 30pt) — da confermare in playtest
  *(già implementati e testati in Burraco Pulito: 3-7=5, 8-K=10, Asso=15, pinella=20, jolly=30 — vedi `engine/core-rules.js`)*

## 5. Pozzetto
- Condizione per prenderlo: finire le carte in mano, **in due modi** (corretto dopo il primo playtest): "al volo", svuotando la mano calando tris/scale (anche con pinelle/jolly), **oppure scartando l'ultima carta**. Il secondo modo era vietato per errore e lasciava il giocatore bloccato; ora scartando l'ultima carta si prende il pozzetto e il turno finisce lì.
- **Scadenza del minuto**: allo zero si pesca e si scarta d'ufficio una carta **a caso** e il turno passa all'avversario. Se nessuno scarto fosse lecito (una carta sola, pozzetto già preso, nessun gioco da 5+), il turno passa comunque: il tavolo non deve mai restare fermo.
- Si prende subito appena la mano si svuota
- Chiusura al volo (svuoti senza dover scartare): bonus ulteriore rispetto alla chiusura normale (da definire il bonus esatto)
- Le carte pescate dal pozzetto valgono 150% del loro punteggio quando calate
- ~~Penalità -100 per chi non prende il pozzetto~~ — ELIMINATA, decisione superata

## 6. Carte Magiche — Sorpresa e Trappola
Selezione: 3 carte totali scelte prima della partita, mix libero tra i due tipi

**Una sola Carta Magica per turno** (aggiunta dopo il primo playtest): valgono ancora i limiti di partita (1 Sorpresa, fino a 3 Trappole), ma in un singolo turno se ne può giocare **una sola**.

**Le Trappole armate si vedono sul tavolo** (aggiunta dopo il primo playtest): restano coperte — l'avversario non sa *quale* sia — ma vengono posate nella **prima colonna dell'area delle calate**, che resta sempre riservata a questo. Senza, l'avversario non avrebbe alcun modo di accorgersi che una trappola è attiva. Solo le Trappole finiscono lì: le Sorprese si risolvono subito e non restano sul tavolo.

**Carta Sorpresa**
- Usabile quando si vuole dal giocatore
- 1 sola utilizzabile per partita (anche se ne hai selezionate di più)
- Si gioca sulla colonna delle carte scese
- All'attivazione: animazione grande a schermo, poi bordo/luce gialla "fuoco" attorno al pulsante finché resta attiva

**Carta Trappola**
- Si attiva e resta coperta (l'avversario vede che è attiva, non cosa fa)
- Fino a 3 utilizzabili per partita
- Bordo/luce blu "elettrico" attorno al pulsante finché attiva
- Se il trigger non si verifica mai: scade dopo un numero fisso di turni, da definire tra 3 o 5

### Catalogo `effect` (vocabolario fisso per il motore)

**Danno e cura**

| effect | Funzione | Esempio parametro |
|---|---|---|
| danno_diretto | Danno fisso a un personaggio | "30" |
| danno_percentuale | Danno in % dei PV massimi | "15" |
| cura_diretta | Restituisce PV fissi | "20" |
| raddoppia_danno | Prossima calata vale doppio | — |
| riflette_danno | Rimanda % danno subito all'attaccante | "50" |
| annulla_danno | Blocca il prossimo danno | — |

**Fase di pesca**

| effect | Funzione | Esempio parametro |
|---|---|---|
| restrict_draw_source | Limita cosa può pescare l'avversario | "solo_ultima_carta_scarti" / "nessuna_pesca" |
| pesca_ridotta | Pesca meno carte del normale | "1" |
| pesca_extra | Pesca carte in più | "2" |
| blocca_monte_scarti | Non può prendere il mazzetto scarti | — |

**Fase di attacco / turno**

| effect | Funzione | Esempio parametro |
|---|---|---|
| skip_fase_attacco | Salta la fase d'attacco | — |
| skip_turno_intero | Salta l'intero turno | — |
| turno_extra | Turno aggiuntivo | — |

**Carte in mano**

| effect | Funzione | Esempio parametro |
|---|---|---|
| scarto_forzato | Scarta una carta a caso | "1" |
| scambio_carte | Scambia una carta a caso tra le mani | — |
| brucia_carta | Rimuove una carta da scarti/mazzo | "ultima_scartata" |

**Personaggi**

| effect | Funzione | Esempio parametro |
|---|---|---|
| boost_att | Aumenta ATT di un personaggio (temporaneo) | "15" |
| boost_difesa | Riduce danno subito (temporaneo) | "20" |
| ricarica_sorpresa | Ricarica la Carta Sorpresa | — |

**Campi comuni**: `trigger` (quasi sempre `on_activate`), `target` (`avversario` / `se_stesso` / `tutti`), `durata_turni` (0 = istantaneo, altrimenti numero di turni), `costo` (punti magia)

---

## 6bis. Il contratto delle carte (come il motore le legge)

La fonte di verità è `engine/vocabolario.js`; `engine/carte-lint.test.js` controlla tutte le carte e fallisce se qualcosa non torna. **Va eseguito ogni volta che si aggiunge una carta**: senza, una carta scritta male non darebbe errore — semplicemente non farebbe niente.

### Una carta può fare più cose
Si scrivono in una lista `effetti`, e ogni voce ha gli stessi campi di prima. La forma con un solo `effect` in cima resta valida.

```json
{
  "id": "sorpresa_003", "tipo": "sorpresa", "costo": 5, "trigger": "on_activate",
  "effetti": [
    { "effect": "danno_diretto", "parametro": "25", "target": "avversario", "durata_turni": 0 },
    { "effect": "cura_diretta",  "parametro": "15", "target": "se_stesso",  "durata_turni": 0 },
    { "effect": "pesca_extra",   "parametro": "1",  "target": "se_stesso",  "durata_turni": 1 }
  ]
}
```

### Le condizioni
Una carta può richiedere che il tavolo si trovi in una certa situazione. **Se la condizione non è vera la carta non parte e i punti magia non si spendono.**

```json
"condizione": { "tipo": "pv_totali_sotto", "parametro": 50, "chi": "io" }
```

Condizioni disponibili: `pozzetto_preso`, `pozzetto_non_preso`, `carte_in_mano_almeno`, `carte_in_mano_al_massimo`, `eroi_caduti_almeno`, `pv_totali_sotto` (in %), `punti_magia_almeno`, `giochi_calati_almeno`, `mazzo_sotto`. Il campo `chi` vale `io` o `avversario`.

### Il bersaglio a scelta è solo delle abilità
`personaggio_specifico` — cioè "lo sceglie il giocatore" — si può usare **solo nelle abilità speciali degli eroi**. Una Carta Magica colpisce secondo la regola scritta sulla carta (`avversario`, `se_stesso`, `tutti`), mai a scelta: altrimenti ogni carta diventerebbe un'altra decisione e il turno si allungherebbe. Il controllo boccia le carte che sbagliano.

### Le Trappole
Si **pagano quando le schieri** sul campo, non quando scattano. Scattano su uno di questi eventi: `avversario_pesca`, `subisco_danno`, `avversario_cala_7piu`, `avversario_usa_abilita` (quest'ultimo aggiunto dal committente: usare l'abilità di un eroe fa scattare le trappole avversarie).

## 7bis. Punti magia e abilità speciale

**Gli eroi non si caricano più uno per uno.** La vecchia barra azzurra sulla singola carta è stata tolta. Al suo posto c'è **una sola riserva di punti magia per giocatore**, mostrata sotto le sue sette carte:

- cresce di **+2 a ogni proprio turno**
- si ferma a un massimo di **15**
- si **consuma** del costo ogni volta che si gioca una Carta Magica o un'abilità speciale
- se i punti non bastano, **non si può attivare nulla**

**Costo, uniforme per il playtest: 4 punti** per ogni Carta Magica e per ogni abilità speciale. Da differenziare carta per carta nel roster vero (campo `costo`).

**Abilità speciale**: la carta si accende quando puoi permettertela; la tocchi, scegli quale **personaggio avversario** colpire e il colpo parte. Infligge il **30% dell'ATT dell'eroe che la attiva**, con la solita varianza 0,95-1,05.

**Quante volte si può colpire in un turno**: le abilità dei quattro eroi **non hanno limite di turno** — l'unico freno è l'energia. Con 12 punti e un costo di 4 si colpisce tre volte nello stesso turno, anche riusando **lo stesso eroe** più volte. Le **Carte Magiche** restano invece **una sola per turno** (oltre ai limiti di partita: 1 Sorpresa, fino a 3 Trappole).

## 7ter. Bonus e penalità permanenti

- **Pozzetto preso → 150% di danno**: da quando prende il pozzetto, quel giocatore infligge una volta e mezza il danno per tutto il resto della partita, su qualunque colpo (calate, agganci, abilità).
- **Eroe caduto → 80% di danno su quel seme**: se il *proprio* personaggio di un seme è a 0 PV, i colpi che partono da quel seme valgono l'80%. Perdere un eroe indebolisce quel seme senza azzerarlo.

## 7quater. Disposizione della mano (correzioni dopo il playtest)

- Le carte **appena pescate o raccolte restano in fondo** alla mano, non vengono infilate al loro posto: si vede a colpo d'occhio cosa è appena arrivato. Rientrano fra le altre quando si ripreme un pulsante di ordinamento.
- L'**asso si ordina dopo il K** del proprio seme, non prima del 2. Vale solo per la disposizione a schermo: nelle scale l'asso può ancora fare sia l'1 sia il 14.

## 7. Abilità personaggio
- Agiscono in percentuale (danno o difesa), valore piccolo tra 10% e 20%, definito sulla singola carta
- Possono anche essere cicliche a turni fissi (es. -50 PV a un avversario a caso ogni 4 turni; buff attivo 2 turni poi pausa 3 turni)
- Da agganciare a trigger del game loop già esistenti (pescata pozzetto, chiusura, subito danno, ecc.) invece di essere isolate

## 8. Power creep e bilanciamento
- Piano: prima playtest per trovare l'equilibrio base, poi introdurre un moltiplicatore di stagione (ogni 3 mesi) sui punti delle combinazioni, calibrato sulla VITA più alta introdotta quel trimestre
- Le VITA/ATT dei personaggi già creati non si toccano mai — il moltiplicatore è un unico numero globale che aggiorna tutto il bilanciamento

## 9. Struttura file per ogni carta

```
/cards
  /data
    personaggio_NNN.json  ← dati fissi (seme, rarità, ATT, VITA), uno per carta
    trappola_NNN.json     ← trigger/target/effect/parametro/durata, uno per carta
    sorpresa_NNN.json
  /i18n
    it.json / en.json / es.json / pt.json  ← nome+descrizione, UN file che cresce con ogni carta
  /images
    personaggio_NNN.png / trappola_NNN.png / sorpresa_NNN.png  ← uno per carta, generato con Gemini
```

Convenzione ID: minuscolo, 3 cifre (`001`, `002`...), identico in tutti e 3 i file della stessa carta.

## 10. Economia e monetizzazione
- Valuta: Sharkini
- Niente rivendita/scambio carte tra utenti
- Pity system: ogni tot pacchetti garantita 1 carta valore 5 + 2 carte valore 4 (soglia esatta da definire)
- Roster iniziale: 24-32 personaggi + 8-12 Carte Sorpresa/Trappola, poi ~4-5 carte nuove al mese
- Generazione immagini: manuale con Gemini, prompt template fisso + blocco "tema di stagione" condiviso per coerenza visiva

## 11. Tecnico
- HTML/JS + Capacitor + Firebase (Cloud Functions server-authoritative), no Unity
- Multilingua nativo: italiano, inglese, spagnolo, portoghese
- Multipiattaforma (iOS/Android/web da unica codebase)
- Progetto separato al 100% da Burraco Pulito, nessun backend condiviso

## 12bis. Gestione multilingua a runtime
- Tra i due giocatori circolano solo ID e dati meccanici (mai testo in una lingua specifica) — il motore di gioco è cieco alla lingua
- Ogni telefono, ricevuto un ID carta, pesca nome/descrizione dal proprio file lingua (it.json / en.json / es.json / pt.json) in base all'impostazione locale — indipendente da giocatore a giocatore, anche nella stessa partita
- Al primo avvio: l'app rileva automaticamente la lingua di sistema del telefono; se non è tra le 4 supportate, fallback su inglese
- Mostrare comunque una schermata di conferma/scelta lingua al primo avvio (non fidarsi solo del rilevamento automatico), con possibilità di cambiarla in qualsiasi momento dalle impostazioni

## 12. UI
- Impostazione da tavolo Burraco mantenuta (mano, pesca, scarti), estetica fantasy variabile invece del tavolo reale
- Personaggi mostrati come icone compatte con barra VITA + indicatore carica, non illustrazione intera durante il match
- Schermata pre-partita: selezione obbligatoria 4 personaggi (uno a seme) + 3 carte magiche prima di entrare in lista partite

## 13. Idee per aumentare l'engagement (da valutare)
- Pass stagionale (gratuito + a pagamento) con obiettivi settimanali
- Achievements/trofei per stili di gioco diversi (non solo vittorie)
- Skin cosmetiche per tavolo/dorso carte (zero impatto sul bilanciamento)
- Emote/reazioni rapide durante la partita
- Replay/clip automatica delle giocate spettacolari, esportabile per social
- Classifica settimanale a reset frequente
- Modalità "Torneo Wild" con regole variate ogni tanto (stesso motore)

## PUNTI ANCORA APERTI — da chiudere in playtest o prima di scrivere le carte definitive
- [ ] Valori punti esatti per carta (confermare standard Burraco o adattarli) — *proposta: riusare quelli già in Burraco Pulito, vedi sopra*
- [ ] Soglia pity system esatta (ogni quanti pacchetti)
- [ ] Bonus esatto per "chiusura al volo"
- [ ] Cosa riceve esattamente il vincitore come "carta bonus" (sblocco permanente o solo per la prossima partita)
- [ ] Durata Carta Trappola inattivata: 3 o 5 turni
- [ ] Fasce di potere ATT/VITA per rarità (★-★★★★★)
- [ ] Prezzo pacchetti in Sharkini
- [ ] Funzionamento dettagliato dei clan
- [ ] Naming definitivo del gioco

## PRINCIPIO GUIDA GENERALE
Dove possibile, riusare meccaniche già validate delle vere regole del Burraco (punti, bonus, condizioni), convertendole tramite le formule/il catalogo `effect` già definiti — invece di inventare meccaniche nuove da zero.

---

## Note di riflessione aperte (dalla discussione di design)

Punti da tenere a mente prima del playtest, emersi confrontando la spec:

- **RISOLTO**: Cosa succede se nessuno chiude né fa KO entro i 15 minuti o a mazzo esaurito? Vince chi ha più PV totali rimasti sui propri 4 personaggi (implementato in `engine/partita.js`). Il caso di parità esatta (pareggio) resta da confermare esplicitamente.
- **Chiusura a 5 carte vs Burraco vero (7+)**: nel Burraco reale la chiusura richiede un burraco vero; qui basta una combinazione da 5. Rende la chiusura molto più probabile del KO — verificare in playtest che il combattimento resti rilevante.
- **AoE del 7+**: colpisce tutti e 4 i personaggi avversari con ×1,6 e ridistribuzione del danno "mai sprecato" — rischio di partite molto swingy, da playtestare con attenzione.
- **Sorpresa: 1 sola utilizzabile per partita anche selezionandone 3** — chiarire se è opzionalità (scegli quale usare) o se disincentiva selezionarne più di una.
- **Monetizzazione con carte di potere reale** (non solo skin): valutare per tempo i requisiti di disclosure probabilità richiesti da Apple/Google.
