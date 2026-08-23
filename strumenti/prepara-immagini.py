# ============================================================
# PREPARA LE IMMAGINI PER IL GIOCO
#
# Le illustrazioni escono da Gemini a 1024x1024 PNG: bellissime e
# INSERIBILI COSI' COM'E' SOLO IN UN MUSEO. Ventinove di quelle pesano
# 28 MB, piu' 3 MB di cornici: chi apre l'album da telefono si
# scaricherebbe trentun megabyte per guardare delle figurine. Qui si
# rimpiccioliscono e si convertono in WebP, che e' il formato che il
# gioco gia' usa per le carte da burraco.
#
# QUANTO GRANDI: la misura non e' a occhio. Il punto piu' grande in cui
# un'illustrazione si vede e' la carta ingrandita dell'album (330px di
# larghezza) e quella dell'apertura pacchetti: dentro la finestra della
# cornice fanno si e no 230px. Il doppio, per gli schermi a densita'
# doppia, fa 460 — da cui i 512 qui sotto. Piu' grandi non si
# vedrebbero meglio, peserebbero e basta.
#
# LE CORNICI nascono col centro MAGENTA (e' il colore che il committente
# usa per dire "qui va ritagliato"). Il ritaglio si fa qui, ogni volta,
# invece di tenere in giro un file gia' bucato: cosi' se un domani si
# ridisegna una cornice basta rimetterla in cards/frames e rilanciare.
#
# USO:  python strumenti/prepara-immagini.py [cartella-illustrazioni]
# ============================================================
import io, importlib.util, os, sys

import numpy as np
from PIL import Image

QUI = os.path.dirname(os.path.abspath(__file__))
PROG = os.path.dirname(QUI)

# Le immagini le serve il server, e il server serve SOLO da client/.
# Fuori di li' sarebbero irraggiungibili dal browser.
DESTINAZIONE = os.path.join(PROG, 'client', 'immagini')
CORNICI = os.path.join(PROG, 'cards', 'frames')

SORGENTE_PREDEFINITA = os.path.join(
    os.path.expanduser('~'), 'Downloads',
    'carte pulite-20260822T121320Z-1-001', 'carte pulite')

LARGHEZZA_ARTE = 512      # vedi il ragionamento in cima
LARGHEZZA_CORNICE = 640   # la cornice si vede al massimo a 330px, x2 = 660
QUALITA = 80              # sopra questa soglia si guadagnano KB, non dettaglio


def carica_mappatura():
    """Da che file del foglio nasce ogni carta del gioco.

    NON si riscrive qui: e' la stessa tabella di importa-carte.py, che e'
    l'unico posto dove quella corrispondenza e' decisa. Riscriverla
    vorrebbe dire tenerne due allineate a mano, e prima o poi non lo
    sarebbero piu' — con l'effetto che una carta mostrerebbe
    l'illustrazione di un'altra."""
    percorso = os.path.join(QUI, 'importa-carte.py')
    spec = importlib.util.spec_from_file_location('importa_carte', percorso)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)

    mappa = {}
    for id_foglio in modulo.EFFETTI:
        mappa[id_foglio] = modulo.id_motore(id_foglio)
    for id_foglio, dati in modulo.MAGICHE.items():
        mappa[id_foglio] = dati['id']
    return mappa


def scrivi_webp(immagine, percorso, qualita=QUALITA):
    os.makedirs(os.path.dirname(percorso), exist_ok=True)
    immagine.save(percorso, 'WEBP', quality=qualita, method=6)
    return os.path.getsize(percorso)


def ridimensiona(immagine, larghezza):
    if immagine.width <= larghezza:
        return immagine
    altezza = round(immagine.height * larghezza / immagine.width)
    return immagine.resize((larghezza, altezza), Image.LANCZOS)


def buca_il_magenta(cornice):
    """Il centro magenta della cornice diventa trasparente.

    Il colore non si scrive a mano: si LEGGE dal centro dell'immagine,
    che e' il posto dove il magenta c'e' di sicuro. Le due cornici
    disegnate finora hanno due magenta leggermente diversi — scriverne
    uno fisso avrebbe funzionato con una e lasciato un alone sull'altra.

    La trasparenza sfuma su una banda larga perche' il bordo della
    cornice e' frastagliato e antialiasato: un taglio netto lascerebbe
    una frangia rosa tutt'intorno. Sui pixel a meta' strada il colore
    viene anche "ripulito" dal magenta che li sporca, altrimenti resta
    un alone anche dopo averli resi semitrasparenti."""
    arr = np.array(cornice.convert('RGB')).astype(float)
    h, w, _ = arr.shape
    bersaglio = arr[h // 2, w // 2].copy()

    distanza = np.sqrt(((arr - bersaglio) ** 2).sum(axis=2))
    dentro, fuori = 15.0, 160.0
    opacita = np.clip((distanza - dentro) / (fuori - dentro), 0, 1)

    sicura = np.where(opacita < 1e-3, 1, opacita)[..., None]
    ripulito = np.clip((arr - (1 - sicura) * bersaglio) / sicura, 0, 255)
    colore = np.where(opacita[..., None] < 1e-3, arr, ripulito).astype('uint8')

    return Image.fromarray(np.dstack([colore, (opacita * 255).astype('uint8')]), 'RGBA')


def finestra_magenta(cornice):
    """Dove sta il buco, in percentuale sui lati della cornice.

    Le percentuali servono al CSS: la carta a schermo puo' essere larga
    130px o 330px, ma la finestra sta sempre nello stesso punto in
    proporzione. In pixel andrebbe rifatta a ogni misura."""
    arr = np.array(cornice.convert('RGB')).astype(float)
    h, w, _ = arr.shape
    bersaglio = arr[h // 2, w // 2]
    maschera = np.sqrt(((arr - bersaglio) ** 2).sum(axis=2)) < 60
    righe, colonne = np.where(maschera)
    x0, x1 = colonne.min(), colonne.max()
    y0, y1 = righe.min(), righe.max()
    return {
        'sinistra': round(x0 / w * 100, 2),
        'alto': round(y0 / h * 100, 2),
        'larghezza': round((x1 - x0 + 1) / w * 100, 2),
        'altezza': round((y1 - y0 + 1) / h * 100, 2),
    }


def prepara():
    sorgente = sys.argv[1] if len(sys.argv) > 1 else SORGENTE_PREDEFINITA
    if not os.path.isdir(sorgente):
        print('Non trovo le illustrazioni in: %s' % sorgente)
        print('Passa la cartella come argomento.')
        return 1

    mappa = carica_mappatura()
    os.makedirs(DESTINAZIONE, exist_ok=True)

    # --- le illustrazioni ---
    totale, fatte, mancanti = 0, 0, []
    for id_foglio, id_gioco in sorted(mappa.items()):
        origine = os.path.join(sorgente, id_foglio + '.png')
        if not os.path.exists(origine):
            mancanti.append(id_foglio)
            continue
        arte = Image.open(origine).convert('RGBA')
        peso = scrivi_webp(ridimensiona(arte, LARGHEZZA_ARTE),
                           os.path.join(DESTINAZIONE, id_gioco + '.webp'))
        totale += peso
        fatte += 1

    # --- le cornici, con il buco al posto del magenta ---
    finestre = {}
    for nome_file, nome_uscita in [('cornice_personaggio.png', 'cornice-personaggio'),
                                   ('cornice_magiche.png', 'cornice-magica')]:
        origine = os.path.join(CORNICI, nome_file)
        if not os.path.exists(origine):
            print('  manca la cornice %s' % nome_file)
            continue
        grezza = Image.open(origine)
        finestre[nome_uscita] = finestra_magenta(grezza)
        bucata = buca_il_magenta(grezza)
        peso = scrivi_webp(ridimensiona(bucata, LARGHEZZA_CORNICE),
                           os.path.join(DESTINAZIONE, nome_uscita + '.webp'))
        totale += peso

    if mancanti:
        print('Illustrazioni non trovate: %s' % ', '.join(mancanti))
    print('Preparate %d illustrazioni + %d cornici — %.1f MB in tutto (erano ~31 MB).'
          % (fatte, len(finestre), totale / 1024 / 1024))
    print('')
    print('La finestra di ogni cornice, in percentuale (serve al CSS):')
    for nome, f in finestre.items():
        print('  %-20s sinistra %5.2f%%  alto %5.2f%%  larga %5.2f%%  alta %5.2f%%'
              % (nome, f['sinistra'], f['alto'], f['larghezza'], f['altezza']))
    return 0


if __name__ == '__main__':
    raise SystemExit(prepara())
