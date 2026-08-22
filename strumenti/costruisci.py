# ============================================================
# COSTRUISCI TUTTO
#
# Le pagine in client/ non si scrivono a mano: si generano, e portano
# dentro una copia del motore perché devono aprirsi anche col doppio
# clic. Il guaio è che quella copia può restare indietro — cambi una
# regola in engine/ e la pagina continua a usare quella vecchia, in
# silenzio. È già successo, e non se ne accorge nessuno finché non si
# rompe qualcosa in partita.
#
# Questo file rigenera tutto, in un colpo solo e nell'ordine giusto.
# Da qui in poi la regola è una: dopo aver toccato engine/ o cards/,
# si lancia questo. E se ci si dimentica, ci pensa `allineate.py` a
# fermare i test.
# ============================================================
import io, os, subprocess, sys, time

QUI = os.path.dirname(os.path.abspath(__file__))
PROG = os.path.dirname(QUI)

# L'ordine conta poco fra loro, ma tenerlo scritto rende evidente
# quante pagine dipendono dal motore.
GENERATORI = [
    ('genera-tavolo.py',        'client/tavolo.html'),
    ('genera-negozio.py',       'client/negozio.html'),
    ('genera-spacchetta.py',    'client/spacchetta.html'),
    ('genera-album.py',         'client/album.html'),
    ('aggiorna-motore-home.py', 'client/home.html'),
]


def costruisci(silenzioso=False):
    fatti, falliti = [], []
    for script, uscita in GENERATORI:
        percorso = os.path.join(PROG, uscita)
        prima = None
        if os.path.exists(percorso):
            prima = io.open(percorso, 'rb').read()

        inizio = time.time()
        r = subprocess.run([sys.executable, os.path.join(QUI, script)],
                           capture_output=True, text=True, cwd=PROG)
        durata = time.time() - inizio

        if r.returncode != 0:
            falliti.append((script, (r.stderr or r.stdout).strip().split('\n')[-1]))
            if not silenzioso:
                print('  ROTTO   %-24s %s' % (script, falliti[-1][1]))
            continue

        dopo = io.open(percorso, 'rb').read() if os.path.exists(percorso) else None
        cambiata = prima != dopo
        fatti.append((uscita, len(dopo or b''), cambiata))
        if not silenzioso:
            print('  %s %-24s %7d byte  %.1fs' % (
                'CAMBIATA' if cambiata else 'uguale  ', uscita, len(dopo or b''), durata))
    return fatti, falliti


if __name__ == '__main__':
    print('\nCostruisco le pagine di client/ dal motore e dalle carte.\n')
    fatti, falliti = costruisci()
    print('')
    if falliti:
        print('%d generatori si sono rotti. Le pagine NON sono aggiornate.' % len(falliti))
        for s, m in falliti:
            print('  · %s → %s' % (s, m))
        raise SystemExit(1)
    cambiate = sum(1 for _, _, c in fatti if c)
    print('%d pagine costruite, %d cambiate.' % (len(fatti), cambiate))
    if cambiate:
        print('Ricordati di riprovarle: npm test')
