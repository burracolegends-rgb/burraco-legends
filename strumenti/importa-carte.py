# ============================================================
# IMPORTA LE CARTE DAL FOGLIO
#
# Il foglio (burraco-carte-tradotte.xlsx) e' la fonte di verita' per
# NUMERI e TESTI: nome, seme, rarita', ATT, VITA, punti magia e le quattro
# traduzioni dell'abilita'. Quelli si leggono, non si ricopiano a mano.
#
# Quello che il foglio NON puo' dire e' come si ESEGUE un'abilita': "fa il
# 25% di danno e l'avversario colpito per 2 turni ha difesa ridotta del
# 20%" e' una frase, e nessun programma la traduce da solo in effetti
# senza sbagliare. Quella traduzione sta qui sotto, nella tabella EFFETTI,
# scritta a mano e riga per riga — l'unico posto del progetto dove una
# persona ha deciso cosa vuol dire ogni carta.
#
# COME SI AGGIUNGE L'USCITA DEL MESE PROSSIMO
#   1. le carte nuove vanno nel foglio, con un ID nuovo;
#   2. qui sotto si aggiunge la riga con i loro effetti;
#   3. si lancia questo script, poi `npm test`.
# Il controllo in engine/carte-lint.test.js boccia qualunque carta che
# nomini un effetto che il motore non sa eseguire, quindi una carta muta
# non puo' arrivare in produzione di nascosto.
#
# NUMERAZIONE
# Le carte 001-008 (personaggio_001..008) sono i SEGNAPOSTO storici: sono
# la dotazione di benvenuto e restano fuori commercio. Il roster vero
# comincia da 101, cosi' l'ID del foglio si legge nelle ultime due cifre
# (foglio 001 -> personaggio_101) e ogni uscita futura puo' prendersi un
# centinaio tutto suo (201.., 301..) senza scavalcare niente.
# ============================================================
import io, json, os, sys

QUI = os.path.dirname(os.path.abspath(__file__))
PROG = os.path.dirname(QUI)
DATI = os.path.join(PROG, 'cards', 'data')
I18N = os.path.join(PROG, 'cards', 'i18n')

FOGLIO_PREDEFINITO = os.path.join(
    os.path.expanduser('~'), 'Downloads', 'burraco-carte-tradotte.xlsx')

SEMI = {'Cuori': '♥', 'Quadri': '♦', 'Fiori': '♣', 'Picche': '♠'}

# Quanti turni dura un buff quando la carta NON lo dice.
# Tre carte (012, 015, 016) descrivono un effetto a tempo senza scrivere
# per quanto. Zero turni vorrebbe dire "per sempre", che non e' quello
# che intendono; due turni e' la durata piu' usata dalle carte che invece
# lo dichiarano. E' una scelta nostra, non del foglio: sta qui sola e
# visibile per poterla cambiare in un punto solo dopo il playtest.
DURATA_PREDEFINITA = 2

# ------------------------------------------------------------
# LA TABELLA: da ogni ID del foglio agli effetti che il motore esegue.
# L'ORDINE CONTA: gli effetti si risolvono nell'ordine scritto qui, ed e'
# l'ordine in cui la carta li racconta. Per le carte che colpiscono e poi
# infieriscono sullo stesso bersaglio (013, 021) il secondo effetto usa
# "bersaglio_colpito", che riusa chi ha appena incassato invece di
# estrarre un nemico nuovo.
#
# BERSAGLIO A SCELTA, non casuale: Papa Figo (001), Boto Felipe (009),
# Onca-Pintada (013), Mapinguari (017), Caipora (019) e Boitata (021)
# colpiscono con "personaggio_specifico" invece che "avversario" — è
# il giocatore a scegliere chi colpire, non l'estrazione casuale. Sono
# le uniche sei: per tutte le altre la scelta resta "chi capita capita",
# altrimenti la strategia del bersaglio non serve a niente.
# ------------------------------------------------------------
EFFETTI = {
    # --- Papa Figo: distrugge le trappole, poi colpisce ---
    '001': [
        {'effect': 'distruggi_trappole'},
        {'effect': 'danno_da_attacco', 'parametro': '30', 'target': 'personaggio_specifico'},
    ],
    # --- i tre pappagalli: stessa beccata, semi diversi ---
    # "Questa carta subisce 10 punti vita di danno": il contraccolpo va
    # sull'eroe che ha usato l'abilita', non su un alleato a caso.
    '002': [
        {'effect': 'riduci_punti_magia', 'parametro': '1', 'target': 'avversario'},
        {'effect': 'danno_diretto', 'parametro': '10', 'target': 'se_stesso'},
    ],
    '003': [
        {'effect': 'riduci_punti_magia', 'parametro': '1', 'target': 'avversario'},
        {'effect': 'danno_diretto', 'parametro': '10', 'target': 'se_stesso'},
    ],
    '004': [
        {'effect': 'riduci_punti_magia', 'parametro': '1', 'target': 'avversario'},
        {'effect': 'danno_diretto', 'parametro': '10', 'target': 'se_stesso'},
    ],
    '005': [{'effect': 'cura_diretta', 'parametro': '30', 'target': 'tutti_alleati'}],
    '006': [{'effect': 'danno_da_attacco', 'parametro': '30', 'target': 'avversario'}],
    '007': [{'effect': 'danno_da_attacco', 'parametro': '15', 'target': 'tutti_avversari'}],
    '008': [{'effect': 'boost_difesa', 'parametro': '25', 'target': 'tutti_alleati', 'durata_turni': 3}],
    '009': [
        {'effect': 'danno_da_attacco', 'parametro': '20', 'target': 'personaggio_specifico'},
        {'effect': 'riduci_difesa', 'parametro': '20', 'target': 'tutti_avversari', 'durata_turni': 2},
    ],
    '010': [{'effect': 'cura_diretta', 'parametro': '50', 'target': 'tutti_alleati'}],
    # "due cariche da 20% ognuna": due colpi distinti, quindi due
    # estrazioni distinte del bersaglio. Se il committente le vuole
    # entrambe sullo stesso nemico, il secondo diventa "bersaglio_colpito".
    '011': [
        {'effect': 'danno_da_attacco', 'parametro': '20', 'target': 'avversario'},
        {'effect': 'danno_da_attacco', 'parametro': '20', 'target': 'avversario'},
    ],
    '012': [{'effect': 'boost_danno', 'parametro': '25', 'target': 'se_stesso',
             'durata_turni': DURATA_PREDEFINITA}],
    '013': [
        {'effect': 'danno_da_attacco', 'parametro': '25', 'target': 'personaggio_specifico'},
        {'effect': 'riduci_difesa', 'parametro': '20', 'target': 'bersaglio_colpito', 'durata_turni': 2},
    ],
    '014': [
        {'effect': 'danno_da_attacco', 'parametro': '15', 'target': 'tutti_avversari'},
        {'effect': 'riduci_punti_magia', 'parametro': '2', 'target': 'avversario'},
    ],
    '015': [{'effect': 'riduci_difesa', 'parametro': '25', 'target': 'tutti_avversari',
             'durata_turni': DURATA_PREDEFINITA}],
    '016': [{'effect': 'boost_difesa', 'parametro': '25', 'target': 'tutti_alleati',
             'durata_turni': DURATA_PREDEFINITA}],
    '017': [{'effect': 'danno_da_attacco', 'parametro': '40', 'target': 'personaggio_specifico'}],
    '018': [
        {'effect': 'danno_da_attacco', 'parametro': '20', 'target': 'tutti_avversari'},
        {'effect': 'boost_difesa', 'parametro': '20', 'target': 'tutti_alleati',
         'durata_turni': DURATA_PREDEFINITA},
    ],
    '019': [
        {'effect': 'danno_da_attacco', 'parametro': '40', 'target': 'personaggio_specifico'},
        {'effect': 'riduci_punti_magia', 'parametro': '1', 'target': 'avversario'},
    ],
    '020': [
        {'effect': 'cura_percentuale', 'parametro': '20', 'target': 'tutti_alleati'},
        {'effect': 'pulisci_malus_difesa', 'target': 'tutti_alleati'},
    ],
    # Il morso del Boitata': la cicatrice resta a chi ha incassato il colpo.
    '021': [
        {'effect': 'danno_da_attacco', 'parametro': '20', 'target': 'personaggio_specifico'},
        {'effect': 'costo_abilita_extra', 'parametro': '1', 'target': 'bersaglio_colpito'},
    ],
    # Saci: tre doni, tre alleati estratti a caso uno per uno (la carta
    # dice "un alleato casuale" tre volte, non "lo stesso alleato").
    '022': [
        {'effect': 'boost_att_percentuale', 'parametro': '30', 'target': 'alleato_casuale', 'durata_turni': 2},
        {'effect': 'cura_percentuale', 'parametro': '30', 'target': 'alleato_casuale'},
        {'effect': 'boost_difesa', 'parametro': '30', 'target': 'alleato_casuale', 'durata_turni': 2},
    ],
    '023': [{'effect': 'boost_att_percentuale', 'parametro': '100', 'target': 'se_stesso', 'durata_turni': 2}],
    # "riduce la difesa avversaria": non dice se uno o tutti. Preso come
    # "tutti", coerente con le altre carte della stessa rarita' (015) che
    # lo dicono esplicitamente.
    '024': [
        {'effect': 'riduci_punti_magia', 'parametro': '3', 'target': 'avversario'},
        {'effect': 'riduci_difesa', 'parametro': '30', 'target': 'tutti_avversari',
         'durata_turni': DURATA_PREDEFINITA},
    ],
}

# Note che finiscono dentro il JSON della carta, dove qualcuno ha dovuto
# interpretare una frase invece di leggerla.
NOTE = {
    '011': 'Il foglio dice "due cariche da 20% ognuna" senza dire se sullo stesso nemico: '
           'qui sono due colpi indipendenti, quindi possono finire su due nemici diversi.',
    '012': 'Il foglio non dice per quanti turni: presa la durata predefinita di %d turni.' % DURATA_PREDEFINITA,
    '015': 'Il foglio non dice per quanti turni: presa la durata predefinita di %d turni.' % DURATA_PREDEFINITA,
    '016': 'Il foglio non dice per quanti turni: presa la durata predefinita di %d turni.' % DURATA_PREDEFINITA,
    '018': 'Il foglio non dice per quanti turni duri il bonus di difesa: presa la durata predefinita.',
    '024': 'Il foglio dice "la difesa avversaria" senza dire se uno o tutti: preso "tutti gli avversari".',
}

# ------------------------------------------------------------
# LE CARTE MAGICHE
# Non hanno seme ne' statistiche: hanno un tipo (sorpresa o trappola) e,
# se sono trappole, l'evento che le sveglia.
#
# LA RARITA' E' PROVVISORIA. Il committente ha deciso che le Carte
# Magiche non avranno rarita' e staranno in pacchetti tutti loro. Finche'
# quei pacchetti non esistono, il motore di apertura pesca PER RARITA':
# una carta senza rarita' non uscirebbe mai da nessun pacchetto, cioe'
# sarebbe irraggiungibile. Il valore qui sotto serve solo a tenerle
# ottenibili nel frattempo, e va tolto quando arriveranno i due tipi di
# pacchetto.
#
# I VALORI STANNO FRA 3 E 5, come quelli dei personaggi, e non e' un
# dettaglio: il roster vero non ha nessuna carta a 1 o 2 stelle, e una
# rarita' abitata da una carta sola se la prenderebbe tutta la fetta di
# probabilita' di quel livello — quell'unica carta uscirebbe in un
# pacchetto su quattro. Tenendo la stessa scala dei personaggi la curva
# resta quella pensata: comuni tante, leggendarie poche.
# ------------------------------------------------------------
MAGICHE = {
    'S01': {'id': 'sorpresa_101', 'tipo': 'sorpresa', 'rarita': 3, 'trigger': 'on_activate',
            'effetti': [{'effect': 'danno_diretto', 'parametro': '50', 'target': 'avversario'}]},
    'S02': {'id': 'sorpresa_102', 'tipo': 'sorpresa', 'rarita': 3, 'trigger': 'on_activate',
            'effetti': [{'effect': 'aumenta_punti_magia', 'parametro': '2', 'target': 'se_stesso'}]},
    # Specchio riflesso: aspetta che l'altro usi un'abilita' e gli
    # rimanda indietro TUTTO il danno ("il danno viene restituito al
    # mittente", non una parte).
    'S03': {'id': 'trappola_101', 'tipo': 'trappola', 'rarita': 5, 'trigger': 'avversario_usa_abilita',
            'effetti': [{'effect': 'riflette_danno', 'parametro': '100', 'target': 'se_stesso'}]},
    'S04': {'id': 'sorpresa_103', 'tipo': 'sorpresa', 'rarita': 4, 'trigger': 'on_activate',
            'effetti': [{'effect': 'pesca_extra', 'parametro': '2', 'target': 'se_stesso', 'durata_turni': 1}]},
    'S05': {'id': 'trappola_102', 'tipo': 'trappola', 'rarita': 4, 'trigger': 'avversario_tocca_difesa',
            'effetti': [{'effect': 'converti_difesa', 'target': 'se_stesso'}]},
}

NOTE_MAGICHE = {
    'S01': 'La rarita\' e\' provvisoria: serve solo perche\' oggi i pacchetti pescano per rarita\'.',
    'S02': 'La rarita\' e\' provvisoria: serve solo perche\' oggi i pacchetti pescano per rarita\'.',
    'S03': 'Rimanda il 100% del danno: la carta dice "il danno viene restituito", non una parte. '
           'Rarita\' provvisoria.',
    'S04': 'La rarita\' e\' provvisoria: serve solo perche\' oggi i pacchetti pescano per rarita\'.',
    'S05': 'La rarita\' e\' provvisoria: serve solo perche\' oggi i pacchetti pescano per rarita\'.',
}

LINGUE = ['it', 'en', 'es', 'pt']
# in che colonna del foglio sta il testo di ogni lingua
COLONNA_TESTO = {'it': 8, 'en': 9, 'es': 10, 'pt': 11}


def id_motore(id_foglio):
    """001 -> personaggio_101 (le ultime due cifre restano leggibili)."""
    return 'personaggio_%d' % (100 + int(id_foglio))


def leggi_foglio(percorso):
    import openpyxl
    wb = openpyxl.load_workbook(percorso, data_only=True)
    righe = list(wb['Carte'].iter_rows(values_only=True))
    dentro = {}
    for r in righe[1:]:
        if not r or not r[0]:
            continue
        chiave = str(r[0]).strip()
        if chiave in EFFETTI or chiave in MAGICHE:
            dentro[chiave] = r
    return dentro


def pulisci(testo):
    """Il foglio ha spazi di troppo e iniziali minuscole qua e la'."""
    t = (testo or '').strip()
    return t[:1].upper() + t[1:] if t else t


def costruisci():
    percorso = sys.argv[1] if len(sys.argv) > 1 else FOGLIO_PREDEFINITO
    if not os.path.exists(percorso):
        print('Non trovo il foglio: %s' % percorso)
        print('Passa il percorso come argomento: python strumenti/importa-carte.py <file.xlsx>')
        return 1

    righe = leggi_foglio(percorso)
    mancanti = [k for k in list(EFFETTI) + list(MAGICHE) if k not in righe]
    if mancanti:
        print('Queste carte sono nella tabella ma non nel foglio: %s' % ', '.join(mancanti))
        return 1

    testi = {lingua: {} for lingua in LINGUE}
    scritte = []

    # --- personaggi ---
    for id_foglio in sorted(EFFETTI):
        r = righe[id_foglio]
        seme = SEMI.get(str(r[3]).strip().capitalize())
        if not seme:
            print('Seme non riconosciuto per %s: %r' % (id_foglio, r[3]))
            return 1
        carta = {
            'id': id_motore(id_foglio),
            'seme': seme,
            'rarita': int(r[4]),
            # Tutte le carte del roster nascono con difesa 1, la base
            # neutra: chi la alza o l'abbassa sono le abilita', non la
            # scheda del personaggio (decisione del committente).
            'vita': int(r[6]),
            'att': int(r[5]),
            'difesa': 1,
            # I segnaposto sono in vendita, questi anche: e' il contrario
            # (vedi fuoriCommercio nei personaggio_001..008).
            'abilita': {
                'trigger': 'attivazione_manuale',
                'costo': int(r[7]),
                'effetti': EFFETTI[id_foglio],
            },
        }
        if id_foglio in NOTE:
            carta['abilita']['_nota'] = NOTE[id_foglio]

        scrivi_json(os.path.join(DATI, carta['id'] + '.json'), carta)
        scritte.append(carta['id'])
        for lingua in LINGUE:
            testi[lingua][carta['id']] = {
                'nome': pulisci(r[1]),
                'descrizione': pulisci(r[COLONNA_TESTO[lingua]]),
            }

    # --- carte magiche ---
    for id_foglio in sorted(MAGICHE):
        r = righe[id_foglio]
        modello = MAGICHE[id_foglio]
        carta = {
            'id': modello['id'],
            'tipo': modello['tipo'],
            'rarita': modello['rarita'],
            'trigger': modello['trigger'],
            'effetti': modello['effetti'],
            'durata_turni': 0,
            '_nota': NOTE_MAGICHE.get(id_foglio, ''),
        }
        scrivi_json(os.path.join(DATI, carta['id'] + '.json'), carta)
        scritte.append(carta['id'])
        for lingua in LINGUE:
            testi[lingua][carta['id']] = {
                'nome': pulisci(r[1]),
                'descrizione': pulisci(r[COLONNA_TESTO[lingua]]),
            }

    # --- le traduzioni si AGGIUNGONO, non sostituiscono ---
    # Nei file lingua ci sono anche le carte segnaposto: riscrivere il
    # file da zero le cancellerebbe, e il controllo delle carte
    # pretende che ogni carta esistente sia tradotta in tutte e quattro.
    for lingua in LINGUE:
        percorso_l = os.path.join(I18N, lingua + '.json')
        esistenti = json.load(io.open(percorso_l, encoding='utf-8')) if os.path.exists(percorso_l) else {}
        esistenti.update(testi[lingua])
        scrivi_json(percorso_l, esistenti)

    print('Scritte %d carte in cards/data e le loro traduzioni in %d lingue.'
          % (len(scritte), len(LINGUE)))
    print('Adesso: npm test')
    return 0


def scrivi_json(percorso, dati):
    os.makedirs(os.path.dirname(percorso), exist_ok=True)
    # newline='\n' come gli altri generatori: su Windows Python
    # tradurrebbe ogni a-capo in CR+LF e i file uscirebbero diversi da
    # quelli generati altrove.
    with io.open(percorso, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(dati, ensure_ascii=False, indent=2))
        f.write('\n')


if __name__ == '__main__':
    raise SystemExit(costruisci())
