# ============================================================
# LE CARTE VERE DENTRO LA PAGINA DEL MAZZO
#
# client/selezione.html e' scritta a mano, ma le carte che elenca NON
# devono esserlo: c'erano dentro otto personaggi e quattro Carte Magiche
# copiati a mano molto tempo fa — i segnaposto — e da allora il roster e'
# cresciuto a ventinove carte vere senza che quella pagina lo sapesse.
# Risultato: uno comprava un pacchetto, la carta finiva in collezione, e
# poi nel mazzo non la trovava. Sembrava che i pacchetti non funzionassero.
#
# Lo stesso commento dentro la pagina lo diceva gia': "questo e' uno
# snapshot di quei file, non una fonte alternativa". Uno snapshot che
# nessuno aggiornava.
#
# Qui il blocco viene riscritto leggendo cards/data e cards/i18n, come
# fanno tutte le altre pagine. Da adesso "aggiungere una carta" vuol dire
# aggiungere un JSON, e basta: la pagina del mazzo se ne accorge da sola.
#
# USO:  python strumenti/aggiorna-selezione.py
# ============================================================
import io, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carta_illustrata import dati_illustrazioni

PROG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(PROG, 'client', 'selezione.html')

APRI = '/* ==== CARTE — generato da strumenti/aggiorna-selezione.py, non modificare a mano ==== */'
CHIUDI = '/* ==== FINE CARTE ==== */'

LINGUE = ['it', 'en', 'es', 'pt']


def leggi_carte():
    cartella = os.path.join(PROG, 'cards', 'data')
    personaggi, magiche = [], []
    for nome in sorted(os.listdir(cartella)):
        if not nome.endswith('.json'):
            continue
        c = json.load(io.open(os.path.join(cartella, nome), encoding='utf-8'))
        if c.get('seme'):
            personaggi.append({
                'id': c['id'], 'seme': c['seme'], 'rarita': c.get('rarita', 1),
                'vita': c.get('vita', 0), 'att': c.get('att', 0),
                'difesa': c.get('difesa', 1),
            })
        else:
            magiche.append({
                'id': c['id'], 'tipo': c.get('tipo', 'sorpresa'),
                'rarita': c.get('rarita', 1),
            })
    return personaggi, magiche


def leggi_testi():
    fuori = {}
    for lingua in LINGUE:
        percorso = os.path.join(PROG, 'cards', 'i18n', lingua + '.json')
        if os.path.exists(percorso):
            fuori[lingua] = json.load(io.open(percorso, encoding='utf-8'))
    return fuori


def costruisci():
    personaggi, magiche = leggi_carte()
    testi = leggi_testi()

    blocco = [APRI]
    blocco.append('const PERSONAGGI = ' + json.dumps(personaggi, ensure_ascii=False, indent=2) + ';')
    blocco.append('const MAGICHE = ' + json.dumps(magiche, ensure_ascii=False, indent=2) + ';')
    blocco.append('const CARTE_TESTI = ' + json.dumps(testi, ensure_ascii=False, indent=2) + ';')
    blocco.append(dati_illustrazioni(PROG).strip())
    blocco.append(CHIUDI)
    nuovo = '\n'.join(blocco)

    pagina = io.open(DST, encoding='utf-8').read()
    if APRI in pagina and CHIUDI in pagina:
        prima = pagina.split(APRI)[0]
        dopo = pagina.split(CHIUDI, 1)[1]
        pagina = prima + nuovo + dopo
    else:
        print('Segnalibri non trovati in selezione.html: mettili attorno al blocco delle carte.')
        return 1

    io.open(DST, 'w', encoding='utf-8', newline='\n').write(pagina)
    print('selezione.html aggiornata: %d personaggi, %d Carte Magiche, %d lingue.'
          % (len(personaggi), len(magiche), len(testi)))
    return 0


if __name__ == '__main__':
    raise SystemExit(costruisci())
