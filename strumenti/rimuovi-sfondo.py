#!/usr/bin/env python3
"""
Toglie lo sfondo dalle illustrazioni delle carte e le salva in PNG con
la trasparenza vera, pronte per essere infilate nella cornice.

COME SI USA, IN BREVE
---------------------
1. Metti le immagini in  illustrazioni/grezze/
2. Doppio clic su       PULISCI-ILLUSTRAZIONI.bat
3. Le trovi pulite in   illustrazioni/pulite/

Oppure a mano, dalla cartella del progetto:
    python strumenti/rimuovi-sfondo.py illustrazioni/grezze illustrazioni/pulite

LA COSA CHE CONTA DAVVERO
-------------------------
Il risultato dipende quasi tutto da COME sono state generate le
immagini, non da questo programma. Chiedi uno sfondo A TINTA UNITA e
ben staccato dal soggetto: verde brillante o magenta vanno benissimo,
il bianco molto meno, perche' armature, ali e capelli chiari ci si
confondono dentro. Uno sfondo scenico (un castello, un bosco) non si
puo' togliere: il programma non sa dove finisce il personaggio.

INSTALLAZIONE, UNA VOLTA SOLA
-----------------------------
Su Windows:
    pip install rembg onnxruntime pillow

Su Linux o Mac, se pip si lamenta che l'ambiente e' "gestito
esternamente", aggiungi in fondo:  --break-system-packages
(quel pezzo serve solo li': su Windows da' errore.)

La prima volta che gira scarica da solo il modello che riconosce i
contorni: circa 170 MB, e serve internet. Dopo funziona anche
scollegati.
"""

import sys
from pathlib import Path

try:
    from rembg import remove
    from PIL import Image
except ImportError:
    print("Mancano le librerie che fanno il lavoro. Installale con:")
    print()
    print("    pip install rembg onnxruntime pillow")
    print()
    print("Se pip risponde che l'ambiente e' gestito esternamente (succede")
    print("su Linux e Mac, non su Windows), aggiungi in fondo:")
    print("    --break-system-packages")
    sys.exit(1)

ESTENSIONI_VALIDE = {".png", ".jpg", ".jpeg", ".webp"}


def elabora_cartella(cartella_input: Path, cartella_output: Path):
    cartella_output.mkdir(parents=True, exist_ok=True)

    file_da_elaborare = [
        f for f in sorted(cartella_input.iterdir())
        if f.suffix.lower() in ESTENSIONI_VALIDE
    ]

    if not file_da_elaborare:
        print("Non ho trovato nessuna immagine in " + str(cartella_input))
        print("Mettici dentro i file (png, jpg, jpeg, webp) e rilancia.")
        return

    print("Trovate %d immagini.\n" % len(file_da_elaborare))
    fatte, saltate, rotte = 0, 0, []

    for i, file_in in enumerate(file_da_elaborare, 1):
        nome_output = file_in.stem + ".png"
        file_out = cartella_output / nome_output

        # Gia' pulita e piu' recente dell'originale: non la rifaccio.
        # Ogni immagine costa qualche secondo, e rifarne cinquanta per
        # averne cambiata una sola e' tempo buttato.
        if file_out.exists() and file_out.stat().st_mtime >= file_in.stat().st_mtime:
            print("[%d/%d] %s - gia' fatta, salto" % (i, len(file_da_elaborare), file_in.name))
            saltate += 1
            continue

        print("[%d/%d] %s -> %s" % (i, len(file_da_elaborare), file_in.name, nome_output))
        try:
            img = Image.open(file_in)
            img_senza_sfondo = remove(img)
            img_senza_sfondo.save(file_out)
            fatte += 1
        except Exception as e:
            print("    ERRORE su %s: %s" % (file_in.name, e))
            rotte.append(file_in.name)
            continue

    print()
    print("Fatte %d, gia' pronte %d%s" % (fatte, saltate,
          (", non riuscite %d" % len(rotte)) if rotte else ""))
    if rotte:
        print("Non ci sono riuscito con: " + ", ".join(rotte))
    print("Le immagini pulite sono in: " + str(cartella_output))
    print()
    print("GUARDALE PRIMA DI USARLE. Il ritaglio automatico sbaglia")
    print("soprattutto su capelli, ali, fumo e bordi sfumati: se una carta")
    print("ha il bordo mangiato, quasi sempre la colpa e' dello sfondo")
    print("troppo simile al soggetto, non del programma.")


if __name__ == "__main__":
    qui = Path(__file__).resolve().parent.parent

    # Senza argomenti usa le cartelle del progetto: e' il caso normale,
    # e chi fa doppio clic sul .bat non deve sapere niente di percorsi.
    if len(sys.argv) == 1:
        cartella_input = qui / "illustrazioni" / "grezze"
        cartella_output = qui / "illustrazioni" / "pulite"
    elif len(sys.argv) == 3:
        cartella_input = Path(sys.argv[1])
        cartella_output = Path(sys.argv[2])
    else:
        print("Uso:")
        print("  python strumenti/rimuovi-sfondo.py")
        print("      (prende da illustrazioni/grezze e mette in illustrazioni/pulite)")
        print("  python strumenti/rimuovi-sfondo.py <cartella_entrata> <cartella_uscita>")
        sys.exit(1)

    if not cartella_input.is_dir():
        print("Non trovo la cartella: " + str(cartella_input))
        print("Creala e mettici dentro le immagini da pulire.")
        sys.exit(1)

    elabora_cartella(cartella_input, cartella_output)
