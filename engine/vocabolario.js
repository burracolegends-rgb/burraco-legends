// ============================================================
// BURRACO LEGENDS — VOCABOLARIO DELLE CARTE
//
// Questo file è IL CONTRATTO fra chi scrive le carte e il motore che le
// esegue. Una carta è un pezzo di dati (un .json in /cards/data): il
// motore non sa niente di quella carta in particolare, sa solo leggere le
// parole elencate qui.
//
// PERCHÉ ESISTE
// Il vocabolario stava sparso in tre posti diversi (il catalogo degli
// effetti, l'elenco degli effetti differiti, i nomi dei trigger scritti a
// mano dentro le azioni). Conseguenza: una carta nuova poteva nominare un
// effetto o un trigger che nessuno ascoltava, e il gioco non protestava —
// la carta si attivava e non succedeva niente. È lo stesso guasto che
// avevano le Trappole. Con una sola fonte, e un controllo che la verifica
// (engine/carte-lint.test.js), quel guasto non può più passare inosservato.
//
// COME SI AGGIUNGE UNA PAROLA NUOVA
// 1. la si descrive qui sotto;
// 2. la si fa eseguire davvero: gli effetti immediati in `applyEffect`
//    (magic-cards.js), quelli differiti nella fase giusta di
//    partita.js, i trigger chiamando `scattaTrappole` dove l'evento
//    accade;
// 3. `momento: 'differito'` va aggiunto anche a EFFETTI_DI_FLUSSO, che il
//    motore ricava da qui in automatico.
// Il controllo delle carte fallisce se una carta usa una parola non
// elencata, e i test del motore falliscono se una parola elencata non
// viene eseguita da nessuno.
// ============================================================

// Tipi di parametro che una carta può portarsi dietro.
export const TIPI_PARAMETRO = {
  nessuno: 'la carta non ha parametri',
  numero: 'un numero (punti, percentuale, quante carte)',
  elenco: 'una parola fra quelle ammesse dall\'effetto'
};

// ------------------------------------------------------------
// EFFETTI
//   momento: 'immediato'  → si risolve nell'istante in cui la carta parte
//            'differito'  → resta addosso a un giocatore e agisce dopo,
//                           nella fase indicata da `agisce`
// ------------------------------------------------------------
export const EFFETTI = {
  // --- danno e cura (immediati) ---
  danno_diretto:        { categoria: 'danno_cura', momento: 'immediato', parametro: 'numero', descrizione: 'Toglie un numero fisso di PV' },
  danno_percentuale:    { categoria: 'danno_cura', momento: 'immediato', parametro: 'numero', descrizione: 'Toglie una % dei PV massimi del bersaglio' },
  danno_da_attacco:     { categoria: 'danno_cura', momento: 'immediato', parametro: 'numero', descrizione: 'Toglie una % dell\'ATT di chi attacca (usato dalle abilità speciali)' },
  cura_diretta:         { categoria: 'danno_cura', momento: 'immediato', parametro: 'numero', descrizione: 'Restituisce PV, senza superare il massimo' },

  // --- danno e cura (differiti: aspettano il colpo) ---
  raddoppia_danno:      { categoria: 'danno_cura', momento: 'differito', agisce: 'calcolo_danno', parametro: 'nessuno', descrizione: 'La prossima calata di chi lo possiede vale il doppio' },
  riflette_danno:       { categoria: 'danno_cura', momento: 'differito', agisce: 'calcolo_danno', parametro: 'numero', descrizione: 'Una % del prossimo danno subito torna a chi ha colpito' },
  annulla_danno:        { categoria: 'danno_cura', momento: 'differito', agisce: 'calcolo_danno', parametro: 'nessuno', descrizione: 'Azzera il prossimo danno subito' },

  // --- fase di pesca (differiti) ---
  restrict_draw_source: { categoria: 'pesca', momento: 'differito', agisce: 'pesca', parametro: 'elenco',
                          valori: ['nessuna_pesca', 'solo_ultima_carta_scarti'],
                          descrizione: 'Limita da dove si può pescare' },
  pesca_ridotta:        { categoria: 'pesca', momento: 'differito', agisce: 'pesca', parametro: 'numero', descrizione: 'Fa pescare tante carte in meno quante ne dice il parametro' },
  pesca_extra:          { categoria: 'pesca', momento: 'differito', agisce: 'pesca', parametro: 'numero', descrizione: 'Fa pescare carte in più' },
  blocca_monte_scarti:  { categoria: 'pesca', momento: 'differito', agisce: 'pesca', parametro: 'nessuno', descrizione: 'Impedisce di raccogliere il monte scarti' },

  // --- turno (differiti) ---
  skip_fase_attacco:    { categoria: 'turno', momento: 'differito', agisce: 'attacco', parametro: 'nessuno', descrizione: 'Impedisce di calare e agganciare per un turno' },
  skip_turno_intero:    { categoria: 'turno', momento: 'differito', agisce: 'cambio_turno', parametro: 'nessuno', descrizione: 'Fa saltare del tutto il turno' },
  turno_extra:          { categoria: 'turno', momento: 'differito', agisce: 'cambio_turno', parametro: 'nessuno', descrizione: 'Fa rigiocare subito invece di passare la mano' },

  // --- carte in mano (immediati) ---
  scarto_forzato:       { categoria: 'mano', momento: 'immediato', parametro: 'numero', descrizione: 'Costringe a scartare N carte a caso' },
  scambio_carte:        { categoria: 'mano', momento: 'immediato', parametro: 'nessuno', descrizione: 'Scambia una carta a caso fra le due mani' },
  brucia_carta:         { categoria: 'mano', momento: 'immediato', parametro: 'elenco',
                          valori: ['ultima_scartata'],
                          descrizione: 'Toglie dal gioco una carta indicata' },

  // --- personaggi (immediati, con durata) ---
  boost_att:            { categoria: 'personaggi', momento: 'immediato', parametro: 'numero', conDurata: true, descrizione: 'Aumenta l\'ATT di un personaggio per qualche turno' },
  boost_difesa:         { categoria: 'personaggi', momento: 'immediato', parametro: 'numero', conDurata: true, descrizione: 'Riduce il danno subito per qualche turno' },
  ricarica_sorpresa:    { categoria: 'personaggi', momento: 'immediato', parametro: 'nessuno', descrizione: 'Rende di nuovo giocabile una Carta Magica già spesa in questa partita' },

  // --- punti magia (immediati) ---
  // I punti magia sono la benzina delle abilità: toglierli è un modo di
  // colpire che non passa dai PV. Sette carte del roster lo fanno.
  riduci_punti_magia:   { categoria: 'punti_magia', momento: 'immediato', parametro: 'numero', descrizione: 'Toglie punti magia (mai sotto zero)' },
  aumenta_punti_magia:  { categoria: 'punti_magia', momento: 'immediato', parametro: 'numero', descrizione: 'Restituisce punti magia, senza superare il tetto' },

  // --- cura e potenziamenti in PERCENTUALE ---
  // Le carte vere parlano quasi sempre in percentuale ("cura del 20%",
  // "aumenta l'attacco del 30%"), mentre gli effetti che c'erano
  // lavoravano solo a numeri fissi. Sono effetti distinti e non una
  // variante degli altri, perché quando scadono vanno tolti in modo
  // diverso: di un aumento percentuale bisogna ricordare QUANTO era
  // stato aggiunto, o togliendolo si sbaglierebbe il conto.
  cura_percentuale:     { categoria: 'danno_cura', momento: 'immediato', parametro: 'numero', descrizione: 'Restituisce una % dei PV massimi' },
  boost_att_percentuale:{ categoria: 'personaggi', momento: 'immediato', parametro: 'numero', conDurata: true, descrizione: 'Aumenta l\'ATT di una % per qualche turno' },
  riduci_difesa:        { categoria: 'personaggi', momento: 'immediato', parametro: 'numero', conDurata: true, descrizione: 'Abbassa la difesa per qualche turno: si incassa più danno' },
  pulisci_malus_difesa: { categoria: 'personaggi', momento: 'immediato', parametro: 'nessuno', descrizione: 'Toglie i malus di difesa da chi lo subisce' },

  // Un bonus al danno che dura nel tempo, non un raddoppio secco da usare
  // una volta: vale su tutti i colpi (calate e abilità) finché non scade.
  boost_danno:          { categoria: 'danno_cura', momento: 'differito', agisce: 'calcolo_danno', parametro: 'numero', conDurata: true, descrizione: 'Aumenta di una % il danno inflitto, per qualche turno' },

  // Il colpo del Boitata': il nemico colpito si porta dietro per SEMPRE
  // un sovrapprezzo sulla propria abilita'. Non e' un malus a tempo, e'
  // una cicatrice: resta fino a fine partita.
  costo_abilita_extra:  { categoria: 'personaggi', momento: 'immediato', parametro: 'numero', descrizione: 'Rende per sempre piu cara l abilita del personaggio colpito' },

  // LA CONVERSIONE: ribalta l'ultimo intervento sulle difese.
  // Un bonus che l'avversario si era dato passa a me; un malus che aveva
  // messo a me torna a lui. Va insieme al trigger
  // `avversario_tocca_difesa`, che e' l'unico a portarsi dietro i
  // dettagli di cosa e' appena successo.
  converti_difesa:      { categoria: 'personaggi', momento: 'immediato', parametro: 'nessuno', descrizione: 'Ruba il bonus di difesa avversario, o rispedisce al mittente il malus' },

  // --- trappole (immediato) ---
  // Prima carta a chiederlo (Papa Figo, "Attacco notturno"): distrugge le
  // Trappole armate dell'avversario, sempre — non serve un "target" a
  // scelta, come ricarica_sorpresa non lo serve per la Sorpresa di chi
  // la gioca. Sempre l'avversario, mai le proprie.
  distruggi_trappole:   { categoria: 'trappole', momento: 'immediato', parametro: 'nessuno', descrizione: 'Distrugge tutte le Trappole armate dell\'avversario' }
};

// Ricavato da EFFETTI: il motore non tiene un secondo elenco a mano, così
// non possono andare fuori sincrono.
export const EFFETTI_DIFFERITI = Object.keys(EFFETTI).filter((k) => EFFETTI[k].momento === 'differito');

// ------------------------------------------------------------
// TRIGGER — quando la carta parte
// ------------------------------------------------------------
export const TRIGGER_SORPRESA = {
  on_activate: 'parte nel momento in cui il giocatore la gioca'
};

// Le Trappole restano coperte e aspettano che succeda una di queste cose.
// Ogni nome qui elencato DEVE essere chiamato da qualche parte nel motore
// (vedi `scattaTrappole` in partita.js): il controllo delle carte
// verifica che una trappola non aspetti un evento che non arriva mai.
export const TRIGGER_TRAPPOLA = {
  avversario_pesca:      'l\'avversario pesca dal mazzo o raccoglie il monte',
  subisco_danno:         'un mio personaggio incassa danno da una calata',
  avversario_cala_7piu:  'l\'avversario cala un gioco da 7 carte o più',
  avversario_usa_abilita:'l\'avversario attiva l\'abilità speciale di un suo eroe',
  // La Conversione aspetta proprio questo: che l'altro metta mano alle
  // difese, in bene o in male. E' l'unico trigger che porta con se' anche
  // i dettagli di quello che e' successo, perche' la risposta e' fatta di
  // quei numeri (vedi `converti_difesa`).
  avversario_tocca_difesa: "l'avversario applica un bonus o un malus di difesa"
};

// Le abilità dei personaggi (spec §7).
export const TRIGGER_ABILITA = {
  attivazione_manuale: 'la si usa quando si vuole, pagando i punti magia',
  ciclico_pulso:       'storico: scattava da sola ogni N turni',
  ciclico_buff:        'attiva per A turni, poi in pausa per B, a ripetizione',
  on_pozzetto:         'quando il proprietario prende il pozzetto',
  on_chiusura:         'quando il proprietario chiude',
  on_subisco_danno:    'quando quel personaggio incassa danno',
  on_infliggo_danno:   'quando quel personaggio infligge danno'
};

// ------------------------------------------------------------
// BERSAGLI
// Regola decisa dal committente: SOLO le abilità speciali dei personaggi
// fanno scegliere il bersaglio al giocatore. Una Carta Magica colpisce
// secondo la regola scritta sulla carta, mai a scelta — altrimenti ogni
// carta diventerebbe un'altra decisione da prendere e il turno si
// allungherebbe. `personaggio_specifico` è quindi riservato alle abilità.
// ------------------------------------------------------------
// Un bersaglio dice due cose insieme: da CHE PARTE del tavolo (i miei o
// i suoi) e QUANTI. La vecchia parola "tutti" ne diceva solo una, e
// l'altra la indovinava l'effetto: "tutti" voleva dire "tutti i nemici"
// su un danno e "tutti i miei" su una cura. Nessuna carta l'ha mai usata
// — per fortuna, perché rendeva inesprimibile "riduci la difesa di tutti
// gli avversari". Al suo posto ci sono due parole che non si possono
// fraintendere. I personaggi a zero PV non contano mai: né da colpire
// (danno sprecato) né da curare (sarebbe una resurrezione).
export const BERSAGLI = {
  avversario:            'un personaggio avversario, a caso fra quelli vivi',
  tutti_avversari:       'tutti i personaggi avversari ancora vivi',
  se_stesso:             'il personaggio che agisce (o tutti i propri, se nessuno agisce)',
  alleato_casuale:       'un proprio personaggio, a caso fra quelli vivi',
  tutti_alleati:         'tutti i propri personaggi ancora vivi',
  personaggio_specifico: 'un personaggio scelto dal giocatore — SOLO nelle abilità speciali'
};
export const BERSAGLI_CARTE_MAGICHE = ['avversario', 'tutti_avversari', 'se_stesso', 'alleato_casuale', 'tutti_alleati'];

// ------------------------------------------------------------
// CONDIZIONI
// Una carta può richiedere che il tavolo si trovi in una certa
// situazione. Se la condizione non è vera la carta non si può giocare, e
// i punti magia NON vengono spesi.
//   chi: 'io' | 'avversario'  (a chi si riferisce la condizione)
// ------------------------------------------------------------
export const CONDIZIONI = {
  pozzetto_preso:           { parametro: 'nessuno', descrizione: 'ha già preso il pozzetto' },
  pozzetto_non_preso:       { parametro: 'nessuno', descrizione: 'non ha ancora preso il pozzetto' },
  carte_in_mano_almeno:     { parametro: 'numero',  descrizione: 'ha almeno N carte in mano' },
  carte_in_mano_al_massimo: { parametro: 'numero',  descrizione: 'ha al massimo N carte in mano' },
  eroi_caduti_almeno:       { parametro: 'numero',  descrizione: 'ha almeno N personaggi a zero PV' },
  pv_totali_sotto:          { parametro: 'numero',  descrizione: 'ha meno del N% dei PV totali di partenza' },
  punti_magia_almeno:       { parametro: 'numero',  descrizione: 'ha almeno N punti magia' },
  giochi_calati_almeno:     { parametro: 'numero',  descrizione: 'ha almeno N giochi in tavola' },
  mazzo_sotto:              { parametro: 'numero',  descrizione: 'nel mazzo restano meno di N carte', senzaChi: true }
};

// ------------------------------------------------------------
// EFFETTI MULTIPLI
// Una carta può fare più cose. Si scrivono in `effetti: [...]`, e ogni
// voce ha gli stessi campi di prima. La forma vecchia con un solo
// `effect` in cima resta valida: viene letta come una lista da uno.
// Il motore lavora SEMPRE sulla lista, così non ci sono due strade.
// ------------------------------------------------------------
export function elencoEffetti(carta) {
  if (!carta) return [];
  if (Array.isArray(carta.effetti) && carta.effetti.length) return carta.effetti;
  if (carta.effect) {
    return [{
      effect: carta.effect,
      parametro: carta.parametro,
      target: carta.target,
      durata_turni: carta.durata_turni
    }];
  }
  return [];
}

// ------------------------------------------------------------
// LIMITI DELLE CARTE
// ------------------------------------------------------------
export const LIMITI = {
  costoMin: 0,
  costoMax: 15,      // quanto sta al massimo nella riserva di punti magia
  rarita: [1, 2, 3, 4, 5],
  lingue: ['it', 'en', 'es', 'pt'],
  tipiCarta: ['sorpresa', 'trappola'],
  semi: ['♥', '♦', '♣', '♠'],
  difesaMin: 0,
  difesaMax: 60      // oltre non si va: sommata al bonus temporaneo di boost_difesa
                      // il tetto assoluto è DIFESA_RIDUZIONE_MASSIMA (core-rules.js, 80%)
};

// ------------------------------------------------------------
// CONTROLLO DI UNA CARTA
// Ritorna { ok, errori: [...] }. Gli errori sono frasi leggibili: chi
// scrive le carte non deve dover leggere il codice per capirli.
// ------------------------------------------------------------
export function controllaCartaMagica(carta) {
  const errori = [];
  const nome = (carta && carta.id) || '(senza id)';

  if (!carta || typeof carta !== 'object') return { ok: false, errori: ['la carta non è un oggetto'] };
  if (!carta.id) errori.push('manca il campo "id"');
  if (!LIMITI.tipiCarta.includes(carta.tipo)) errori.push('"tipo" deve essere ' + LIMITI.tipiCarta.join(' o ') + ', trovato: ' + carta.tipo);

  // EFFETTI — una carta può farne più di uno
  const effetti = elencoEffetti(carta);
  if (effetti.length === 0) {
    errori.push('la carta non fa niente: manca "effect" (o la lista "effetti")');
  }
  effetti.forEach((e, i) => {
    const dove = effetti.length > 1 ? ' (effetto ' + (i + 1) + ' di ' + effetti.length + ')' : '';
    const def = EFFETTI[e.effect];
    if (!def) {
      errori.push('effetto sconosciuto: "' + e.effect + '"' + dove + ' — il motore non sa eseguirlo, non farebbe nulla');
      return;
    }
    errori.push(...controllaParametro(def, e).map((m) => m + dove));
    if (e.target && !BERSAGLI[e.target]) {
      errori.push('bersaglio sconosciuto: "' + e.target + '"' + dove + '. Ammessi: ' + Object.keys(BERSAGLI).join(', '));
    }
    // il bersaglio a scelta è riservato alle abilità speciali
    if (e.target === 'personaggio_specifico') {
      errori.push('"personaggio_specifico"' + dove + ' non si può usare su una Carta Magica: il bersaglio a scelta è riservato alle abilità speciali degli eroi. Usa ' + BERSAGLI_CARTE_MAGICHE.join(', ') + '.');
    }
    if (e.durata_turni !== undefined && (typeof e.durata_turni !== 'number' || e.durata_turni < 0)) {
      errori.push('"durata_turni" deve essere un numero maggiore o uguale a zero' + dove);
    }
  });

  // CONDIZIONE — facoltativa
  errori.push(...controllaCondizione(carta.condizione));

  // trigger, secondo il tipo di carta
  if (carta.tipo === 'sorpresa') {
    if (carta.trigger && !TRIGGER_SORPRESA[carta.trigger]) {
      errori.push('una Sorpresa può avere solo trigger "on_activate", trovato: "' + carta.trigger + '"');
    }
  } else if (carta.tipo === 'trappola') {
    if (!carta.trigger) errori.push('una Trappola deve dire QUANDO scatta (campo "trigger")');
    else if (!TRIGGER_TRAPPOLA[carta.trigger]) {
      errori.push('trigger sconosciuto: "' + carta.trigger + '" — nessuno lo fa scattare, la trappola resterebbe lì per sempre. Ammessi: ' + Object.keys(TRIGGER_TRAPPOLA).join(', '));
    }
  }

  // LE CARTE MAGICHE NON COSTANO PUNTI MAGIA.
  // Li costavano (spec §7bis), non più: il prezzo di una Carta Magica è
  // la carta stessa, che si spende per sempre dalla collezione. Il campo
  // viene RIFIUTATO, non ignorato: un campo che il motore non legge, su
  // una carta, è una promessa che il gioco non mantiene — chi scrive le
  // carte crederebbe di aver messo un prezzo e non sarebbe vero.
  if (carta.costo !== undefined) {
    errori.push('"costo" non va più messo sulle Carte Magiche: non costano punti magia, si consumano e basta. I punti magia restano solo per le abilità degli eroi.');
  }
  if (carta.rarita !== undefined && !LIMITI.rarita.includes(Number(carta.rarita))) {
    errori.push('"rarita" deve essere da 1 a 5, trovato: ' + carta.rarita);
  }

  return { ok: errori.length === 0, errori, nome };
}

export function controllaCartaPersonaggio(carta) {
  const errori = [];
  if (!carta || typeof carta !== 'object') return { ok: false, errori: ['la carta non è un oggetto'] };
  if (!carta.id) errori.push('manca il campo "id"');
  if (!LIMITI.semi.includes(carta.seme)) errori.push('"seme" deve essere uno fra ' + LIMITI.semi.join(' ') + ', trovato: ' + carta.seme);
  if (!(carta.vita > 0)) errori.push('"vita" deve essere un numero maggiore di zero');
  if (!(carta.att > 0)) errori.push('"att" deve essere un numero maggiore di zero');
  if (carta.rarita !== undefined && !LIMITI.rarita.includes(Number(carta.rarita))) {
    errori.push('"rarita" deve essere da 1 a 5, trovato: ' + carta.rarita);
  }
  if (carta.difesa !== undefined) {
    const d = Number(carta.difesa);
    if (!Number.isFinite(d) || d < LIMITI.difesaMin || d > LIMITI.difesaMax) {
      errori.push('"difesa" deve stare fra ' + LIMITI.difesaMin + ' e ' + LIMITI.difesaMax + ' (% di riduzione danno), trovato: ' + carta.difesa);
    }
  }

  const a = carta.abilita;
  if (a) {
    if (!TRIGGER_ABILITA[a.trigger]) {
      errori.push('trigger di abilità sconosciuto: "' + a.trigger + '". Ammessi: ' + Object.keys(TRIGGER_ABILITA).join(', '));
    }
    // anche un'abilità può fare più cose
    const effetti = elencoEffetti(a);
    if (effetti.length === 0) errori.push('l\'abilità non fa niente: manca "effect"');
    effetti.forEach((e, i) => {
      const dove = effetti.length > 1 ? ' (effetto ' + (i + 1) + ')' : '';
      const def = EFFETTI[e.effect];
      if (!def) errori.push('effetto di abilità sconosciuto: "' + e.effect + '"' + dove);
      else errori.push(...controllaParametro(def, e).map((m) => m + dove));
      if (e.target && !BERSAGLI[e.target]) errori.push('bersaglio di abilità sconosciuto: "' + e.target + '"' + dove);
    });
    errori.push(...controllaCondizione(a.condizione));

    if (a.trigger === 'ciclico_buff' && !(a.attivo_turni > 0 && a.pausa_turni > 0)) {
      errori.push('"ciclico_buff" richiede "attivo_turni" e "pausa_turni" maggiori di zero');
    }
    if (a.costo !== undefined) {
      const c = Number(a.costo);
      if (!Number.isFinite(c) || c < LIMITI.costoMin || c > LIMITI.costoMax) {
        errori.push('il "costo" dell\'abilità deve stare fra ' + LIMITI.costoMin + ' e ' + LIMITI.costoMax);
      }
    }
  }

  return { ok: errori.length === 0, errori, nome: carta.id || '(senza id)' };
}

export function controllaCondizione(cond) {
  if (cond === undefined || cond === null) return [];
  const errori = [];
  const def = CONDIZIONI[cond.tipo];
  if (!def) {
    errori.push('condizione sconosciuta: "' + cond.tipo + '". Ammesse: ' + Object.keys(CONDIZIONI).join(', '));
    return errori;
  }
  if (def.parametro === 'numero' && !Number.isFinite(Number(cond.parametro))) {
    errori.push('la condizione "' + cond.tipo + '" vuole un "parametro" numerico, trovato: ' + JSON.stringify(cond.parametro));
  }
  if (!def.senzaChi && cond.chi !== undefined && !['io', 'avversario'].includes(cond.chi)) {
    errori.push('"chi" nella condizione deve essere "io" o "avversario", trovato: ' + JSON.stringify(cond.chi));
  }
  return errori;
}

function controllaParametro(def, carta) {
  const errori = [];
  const p = carta.parametro;
  if (def.parametro === 'numero') {
    if (p === undefined || p === null || p === '' || !Number.isFinite(Number(p))) {
      errori.push('l\'effetto "' + carta.effect + '" vuole un "parametro" numerico, trovato: ' + JSON.stringify(p));
    }
  } else if (def.parametro === 'elenco') {
    if (!def.valori.includes(p)) {
      errori.push('l\'effetto "' + carta.effect + '" ammette come "parametro" solo: ' + def.valori.join(', ') + ' — trovato: ' + JSON.stringify(p));
    }
  }
  return errori;
}
