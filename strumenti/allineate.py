# ============================================================
# LE PAGINE SONO ALLINEATE AL MOTORE?
#
# La domanda a cui questo file risponde è una sola, e vale più di
# tutte le altre verifiche messe insieme:
#
#     quello che c'è dentro client/*.html corrisponde a quello che
#     c'è dentro engine/*.js in questo momento?
#
# Perché il pericolo non è che una pagina si rompa — quello si vede.
# È che una pagina continui a funzionare benissimo usando regole
# vecchie di tre giorni, e nessuno se ne accorga.
#
# COME FA A SAPERLO
# Non confronta date né dimensioni: rigenera davvero le pagine in una
# cartella a parte e confronta byte per byte. Se qualcosa è diverso,
# vuol dire che le pagine sul disco non sono quelle che i generatori
# produrrebbero adesso — cioè che qualcuno ha cambiato il motore (o
# una carta, o un generatore) senza ricostruire.
#
# Non tocca niente: guarda e riferisce.
# ============================================================
import io, os, shutil, subprocess, sys, tempfile

QUI = os.path.dirname(os.path.abspath(__file__))
PROG = os.path.dirname(QUI)

from costruisci import GENERATORI


def differenza(a, b):
    """Dove comincia a differire, in parole umane."""
    if a is None:
        return 'la pagina non esiste proprio'
    if b is None:
        return 'il generatore non ha prodotto niente'
    n = min(len(a), len(b))
    i = 0
    while i < n and a[i] == b[i]:
        i += 1
    riga = a[:i].count(b'\n') + 1
    return 'diverse dal byte %d (riga %d circa); %d byte contro %d' % (i, riga, len(a), len(b))


def controlla():
    disallineate = []
    magazzino = tempfile.mkdtemp(prefix='bb-allineate-')
    try:
        # I generatori scrivono in client/. Metto da parte le pagine
        # vere, li lascio lavorare, confronto, e rimetto tutto com'era.
        # Se questo controllo lasciasse il progetto anche solo un po'
        # diverso da come l'ha trovato, sarebbe peggio del problema
        # che vuole risolvere.
        for _, uscita in GENERATORI:
            vera = os.path.join(PROG, uscita)
            if os.path.exists(vera):
                shutil.copy2(vera, os.path.join(magazzino, os.path.basename(uscita)))

        for script, uscita in GENERATORI:
            vera = os.path.join(PROG, uscita)
            copia = os.path.join(magazzino, os.path.basename(uscita))
            prima = io.open(copia, 'rb').read() if os.path.exists(copia) else None

            r = subprocess.run([sys.executable, os.path.join(QUI, script)],
                               capture_output=True, text=True, cwd=PROG)
            if r.returncode != 0:
                disallineate.append((uscita, 'il generatore si rompe: ' +
                                     (r.stderr or r.stdout).strip().split('\n')[-1]))
                continue

            dopo = io.open(vera, 'rb').read() if os.path.exists(vera) else None
            if prima != dopo:
                disallineate.append((uscita, differenza(prima, dopo)))

        # rimetto le pagine come le ho trovate
        for _, uscita in GENERATORI:
            copia = os.path.join(magazzino, os.path.basename(uscita))
            if os.path.exists(copia):
                shutil.copy2(copia, os.path.join(PROG, uscita))
    finally:
        shutil.rmtree(magazzino, ignore_errors=True)
    return disallineate


if __name__ == '__main__':
    print('\nControllo che le pagine di client/ siano quelle che i generatori')
    print('produrrebbero adesso, col motore e le carte di oggi.\n')
    fuori = controlla()
    if not fuori:
        print('OK   tutte le %d pagine sono allineate al motore.' % len(GENERATORI))
        raise SystemExit(0)

    print('FERMI TUTTI: %d pagine non sono aggiornate.\n' % len(fuori))
    for uscita, perche in fuori:
        print('  · %-22s %s' % (uscita, perche))
    print('\nVuol dire che è cambiato qualcosa in engine/, cards/ o nei')
    print('generatori, e quelle pagine sono rimaste indietro. Rimettile in')
    print('pari con:\n')
    print('    python strumenti/costruisci.py\n')
    print('Poi riprova. Finché sono disallineate, le pagine girano con')
    print('regole vecchie e i test non provano quello che credi.\n')
    raise SystemExit(1)
