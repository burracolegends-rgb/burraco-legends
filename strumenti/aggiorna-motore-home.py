# client/home.html è scritta a mano, ma porta dentro una copia del
# motore (engine/*.js) perché la pagina si deve aprire col doppio clic,
# senza server. Quella copia va tenuta allineata all'originale: se resta
# indietro, la home usa regole vecchie e nessuno se ne accorge finché non
# si rompe qualcosa.
#
# Questo script rimette la copia in pari. Il pezzo incorporato sta fra
# due segnalibri; se mancano, li mette la prima volta e poi li riusa.
import re, io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import PONTE

# Il percorso del progetto si ricava da dove sta questo file, non si
# scrive a mano: così la cartella si può rinominare o spostare senza
# che nessuno se ne accorga.
PROG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(PROG, 'client', 'home.html')
MODULI = ['sharkini.js', 'pacchetti.js']

APRI  = '/* ==== MOTORE INCORPORATO — generato da strumenti/aggiorna-motore-home.py, non modificare a mano ==== */'
CHIUDI = '/* ==== FINE MOTORE INCORPORATO ==== */'


def impacchetta(nome):
    """Ogni modulo dentro il suo guscio: due moduli possono avere una
    costante con lo stesso nome, e concatenandoli si pesterebbero i piedi."""
    testo = io.open(os.path.join(PROG, 'engine', nome), encoding='utf-8').read()
    esportati = re.findall(r'^export\s+(?:function|const|let|class)\s+([A-Za-z0-9_$]+)', testo, flags=re.M)
    testo = re.sub(r'^import\s*\{[^}]*\}\s*from\s*[\'"]([^\'"]+)[\'"];?\s*$', '', testo, flags=re.M)
    testo = re.sub(r'^export\s+', '', testo, flags=re.M)
    guscio = '__' + nome[:3].upper()
    return ('\nconst %s = (function(){\n%s\nreturn {%s};\n})();\n' % (guscio, testo, ', '.join(esportati)) +
            'const {%s} = %s;\n' % (', '.join(esportati), guscio))


# insieme al motore viaggia anche il ponte: la home deve chiedere al
# server quanti sharkini ho e se il premio di oggi l'ho già preso
motore = APRI + '\n' + ''.join(impacchetta(m) for m in MODULI) + '\n' + PONTE + '\n' + CHIUDI

pagina = io.open(DST, encoding='utf-8').read()

if APRI in pagina:
    inizio = pagina.index(APRI)
    fine = pagina.index(CHIUDI) + len(CHIUDI)
    pagina = pagina[:inizio] + motore + pagina[fine:]
else:
    # prima volta: al posto della vecchia copia senza segnalibri
    m = re.search(r'\nconst __SCI = \(function\(\)\{', pagina)
    if not m:
        raise SystemExit('non trovo il motore incorporato: controlla client/home.html')
    fine = pagina.index('} = __PAC;\n', m.start()) + len('} = __PAC;\n')
    pagina = pagina[:m.start()] + '\n' + motore + pagina[fine:]

# newline='\n' NON e' un dettaglio: senza, su Windows Python traduce
# ogni a-capo in CR+LF e la pagina esce diversa da quella generata su
# Linux o Mac, byte per byte. Il controllo di allineamento confronta
# proprio i byte, quindi segnalava tutte le pagine come 'rimaste
# indietro' su un computer e non sull'altro — e non era vero.
# Le pagine sono le stesse ovunque, e devono esserlo davvero.
io.open(DST, 'w', encoding='utf-8', newline='\n').write(pagina)

# controllo che tutto quello che la pagina usa sia stato davvero portato dentro
esportati = set()
for mod in MODULI:
    testo = io.open(os.path.join(PROG, 'engine', mod), encoding='utf-8').read()
    esportati |= set(re.findall(r'^export\s+(?:function|const|let|class)\s+([A-Za-z0-9_$]+)', testo, flags=re.M))

dopo = pagina[pagina.index(CHIUDI):]
usati = set(re.findall(r'\b(premioDelGiorno|statoSerie|conNome|formattaSharkini|'
                       r'PREMI_SETTIMANA|PREMIO_MASSIMO|SERIE_NUOVA|giorniPrimaDiPerdereLaSerie|'
                       r'offertaPerCarte|costoPerCarta|OFFERTE|CARTE_PER_PACCHETTO)\b', dopo))
mancanti = usati - esportati
if mancanti:
    raise SystemExit('la home usa cose che il motore non esporta: ' + ', '.join(sorted(mancanti)))

print('motore aggiornato in', DST, '·', len(motore), 'byte ·', len(usati), 'nomi usati, tutti presenti')
