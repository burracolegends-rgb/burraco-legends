# Il pezzo di codice che ogni pagina usa per parlare del borsellino,
# dell'album e dei pacchetti. Sta qui una volta sola e viene incorporato
# in ogni pagina generata, perché le pagine devono aprirsi anche col
# doppio clic e non possono caricare file da fuori.

PONTE = r'''
// ============================================================
// IL PONTE
//
// Sharkini, album e pacchetti adesso stanno sul server. Il browser
// chiede e mostra: non decide più niente, e soprattutto non può più
// mentire — prima bastava aprire gli strumenti di sviluppo per darsi
// un milione di sharkini e tutte le carte rare.
//
// MA LE PAGINE DEVONO APRIRSI ANCHE COL DOPPIO CLIC.
// Serve per provarle in fretta, senza avviare niente. Allora ci sono
// due ponti con le stesse identiche funzioni: uno parla col server,
// l'altro si arrangia col browser. Chi li usa non sa quale dei due ha
// davanti — e questo tiene il resto del codice pulito da "se c'è il
// server allora... altrimenti...".
//
// La regola per scegliere è semplice e non mente: se la pagina è
// arrivata da un server, si parla col server. Se è stata aperta da un
// file, non c'è nessun server con cui parlare.
// ============================================================
const CI_SONO_ARRIVATO_DAL_SERVER = location.protocol === 'http:' || location.protocol === 'https:';

function creaPonteServer() {
  const CHIAVE_GETTONE = 'bb_gettone';
  let gettone = null;
  try { gettone = localStorage.getItem(CHIAVE_GETTONE); } catch (e) {}

  async function chiedi(via, corpo) {
    const risposta = await fetch(via, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...corpo, gettone })
    });
    return risposta.json();
  }

  return {
    dove: 'server',
    async io(nome) {
      const r = await chiedi('/api/io', { nome });
      if (r.gettone) {
        gettone = r.gettone;
        // Il gettone è l'unica cosa che il browser deve custodire: è
        // la chiave di casa. Perderlo vuol dire ripartire da zero,
        // finché non ci saranno gli account veri.
        try { localStorage.setItem(CHIAVE_GETTONE, gettone); } catch (e) {}
      }
      return r;
    },
    ritiraPremio: () => chiedi('/api/premio', {}),
    compra: (carte, tipo) => chiedi('/api/compra', { carte, tipo }),
    ricarica: (offerta) => chiedi('/api/ricarica', { offerta })
  };
}

// ------------------------------------------------------------
// IL PONTE DI RIPIEGO
// Quando la pagina è aperta col doppio clic non c'è nessun server: si
// fa tutto qui, come prima. È chiaramente falsificabile, e va bene —
// serve solo a guardare le pagine, non a giocare sul serio. Perché
// resti chiaro, ogni risposta porta `diProva: true` e le pagine lo
// dicono a chi guarda.
// ------------------------------------------------------------
function creaPonteBrowser() {
  const leggi = (c, d) => { try { const v = localStorage.getItem(c); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const scrivi = (c, v) => { try { localStorage.setItem(c, JSON.stringify(v)); } catch (e) {} };

  function statoAttuale() {
    const serie = Object.assign({}, SERIE_NUOVA, leggi('bb_sharkini', {}));
    const collezione = leggi('bb_collezione', {});
    const contatorePity = leggi('bb_pity', 0);
    const s = statoSerie(serie, Date.now());
    return {
      ok: true, diProva: true, serie, collezione, contatorePity,
      saldo: serie.saldo,
      carteDiverse: Object.keys(collezione).length,
      carteInTutto: Object.values(collezione).reduce((a, b) => a + b, 0),
      alleCarteAllaGaranzia: Math.max(0, SOGLIA_PITY - contatorePity),
      premio: {
        puoRitirare: s.puoRitirare, giorno: s.giorno, quanto: s.premio,
        serieRotta: s.serieRotta, giaRitiratoOggi: s.giaRitiratoOggi
      }
    };
  }

  return {
    dove: 'browser',
    async io() { return statoAttuale(); },
    async ritiraPremio() {
      const st = statoAttuale();
      const esito = ritiraPremio(st.serie, Date.now());
      if (esito.guadagno === 0) return { ok: false, diProva: true, motivo: 'Già ritirato oggi.', ...statoAttuale() };
      scrivi('bb_sharkini', esito.serie);
      return { ok: true, diProva: true, guadagno: esito.guadagno,
               serieRotta: esito.stato.serieRotta, ...statoAttuale() };
    },
    async compra(carte, tipo) {
      const st = statoAttuale();
      const offerta = offertaPerCarte(Number(carte));
      if (!offerta) return { ok: false, diProva: true, motivo: 'Quel pacchetto non esiste.' };
      if (st.serie.saldo < offerta.costo) {
        return { ok: false, diProva: true, motivo: 'Sharkini insufficienti.',
                 manca: offerta.costo - st.serie.saldo, costo: offerta.costo, saldo: st.serie.saldo };
      }
      // Anche qui, come sul server: dai pacchetti esce solo quello che
      // è davvero in vendita, i segnaposto della dotazione di benvenuto
      // restano fuori (vedi carteInVendita in engine/pacchetti.js).
      let bacino;
      try { bacino = carteDiTipo(carteInVendita(CATALOGO), tipo); }
      catch (e) { return { ok: false, diProva: true, motivo: e.message }; }
      if (!bacino.length) return { ok: false, diProva: true, motivo: 'Nessuna carta di quel tipo è ancora in vendita.' };
      const r = apriPacchetto(bacino, st.collezione, st.contatorePity, Math.random, offerta.carte);
      const collezione = { ...st.collezione };
      for (const c of r.carte) collezione[c.carta.id] = (collezione[c.carta.id] || 0) + 1;
      scrivi('bb_sharkini', { ...st.serie, saldo: st.serie.saldo - offerta.costo });
      scrivi('bb_collezione', collezione);
      scrivi('bb_pity', r.contatore);
      return { ok: true, diProva: true, costo: offerta.costo, carte: r.carte,
               pityScattato: r.pityScattato, ...statoAttuale() };
    },
    async ricarica(idOfferta) {
      const st = statoAttuale();
      const r = RICARICHE.find((x) => x.id === idOfferta);
      if (!r) return { ok: false, diProva: true, motivo: 'Quella ricarica non esiste.' };
      scrivi('bb_sharkini', { ...st.serie, saldo: st.serie.saldo + r.sharkini });
      return { ok: true, diProva: true, accreditati: r.sharkini, ...statoAttuale() };
    }
  };
}

const SCORTA = CI_SONO_ARRIVATO_DAL_SERVER ? creaPonteServer() : creaPonteBrowser();

// Un avviso onesto, in fondo alla pagina, quando i conti sono finti.
function avvisaSeDiProva() {
  if (SCORTA.dove !== 'browser') return;
  if (document.getElementById('avviso-di-prova')) return;
  const d = document.createElement('div');
  d.id = 'avviso-di-prova';
  d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:60;padding:7px 12px;' +
    'font:600 0.7rem/1.4 system-ui,sans-serif;letter-spacing:0.4px;text-align:center;' +
    'background:rgba(90,60,20,0.94);color:#ffe9ae;border-top:1px solid #9a6f21';
  d.textContent = 'Pagina aperta senza server: sharkini e carte sono solo di prova, ' +
                  'restano in questo browser e non valgono niente.';
  document.body.appendChild(d);
}
'''
