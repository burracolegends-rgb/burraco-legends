# ============================================================
# I FILE .BAT SONO SCRITTI COME PIACE A WINDOWS?
#
# Due errori, tutti e due invisibili finche' non esplodono in faccia
# a chi fa doppio clic.
#
# 1. I FINE-RIGA. Windows legge i file batch contando i byte e
#    aspettandosi la coppia CR+LF. Se ci sono solo LF (come li scrive
#    Linux, e come li scrive chiunque lavori da un altro sistema), cmd
#    si sposta di un carattere a ogni riga e si mangia la prima
#    lettera: "cd" diventa "d", "echo" diventa "cho". E' gia' successo.
#
# 2. GLI ACCENTI. cmd legge i .bat con la tabella caratteri del
#    sistema, che in Italia non e' UTF-8. Una "e'" accentata esce come
#    scarabocchio, e nei casi peggiori rompe la riga.
#
# 3. LE VIRGOLETTE DENTRO UNA VARIABILE. Se si scrive
#       set CF="C:\percorso\cosa.exe"
#    le virgolette finiscono DENTRO la variabile, e la riga successiva
#       if "%CF%"==""
#    diventa  if ""C:\percorso\cosa.exe""==""  che cmd non sa leggere:
#    interrompe tutto e chiude la finestra di colpo, senza un messaggio.
#    Il modo giusto e'  set "CF=C:\percorso\cosa.exe"  e poi usare
#    "%CF%" con le virgolette messe al momento dell'uso. E' gia'
#    successo, ed e' cattivissimo da capire perche' il file sparisce
#    prima ancora di scrivere qualcosa.
#
# Questo controllo non aggiusta niente: guarda e riferisce.
# ============================================================
import io, os, re, sys

QUI = os.path.dirname(os.path.abspath(__file__))
PROG = os.path.dirname(QUI)


def controlla():
    guai = []
    for nome in sorted(os.listdir(PROG)):
        if not nome.lower().endswith('.bat'):
            continue
        b = io.open(os.path.join(PROG, nome), 'rb').read()
        solo_lf = b.count(b'\n') - b.count(b'\r\n')
        if solo_lf:
            guai.append((nome, '%d righe finiscono con LF invece di CR+LF: '
                               'cmd si mangera\' la prima lettera di ognuna' % solo_lf))
        fuori = sorted({x for x in b if x > 127})
        if fuori:
            guai.append((nome, 'contiene %d byte fuori dall\'ASCII (%s): '
                               'accenti e simboli usciranno storti' %
                               (len(fuori), ', '.join('0x%02x' % x for x in fuori[:6]))))
        if b.startswith(b'\xef\xbb\xbf'):
            guai.append((nome, 'comincia con un BOM: la prima riga non verra\' eseguita'))

        testo = b.decode('ascii', 'replace')
        for numero, riga in enumerate(testo.replace('\r\n', '\n').split('\n'), 1):
            m = re.match(r'\s*(?:if\s+.*?\)?\s+)?set\s+([A-Za-z_][A-Za-z_0-9]*)\s*=\s*"',
                         riga, re.IGNORECASE)
            if m:
                guai.append((nome, 'riga %d: set %s="..." mette le virgolette DENTRO '
                                   'la variabile. Scrivi set "%s=..." e usa "%%%s%%" '
                                   'con le virgolette al momento dell\'uso.'
                                   % (numero, m.group(1), m.group(1), m.group(1))))
    return guai


if __name__ == '__main__':
    print('\nControllo che i file .bat siano scritti come li vuole Windows.\n')
    guai = controlla()
    if not guai:
        quanti = len([n for n in os.listdir(PROG) if n.lower().endswith('.bat')])
        print('OK   tutti i %d file .bat hanno CR+LF e solo caratteri ASCII.' % quanti)
        raise SystemExit(0)
    print('DA SISTEMARE: %d problemi.\n' % len(guai))
    for nome, perche in guai:
        print('  . %-28s %s' % (nome, perche))
    print('\nSono file che l\'utente lancia col doppio clic: se sono scritti')
    print('male non se ne accorge nessuno finche\' non si rompe da lui.\n')
    raise SystemExit(1)
