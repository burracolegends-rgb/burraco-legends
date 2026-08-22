// ============================================================
// I TRENTA SECONDI SI DEVONO VEDERE, DA TUTTE E DUE LE PARTI
//
// La regola funzionava — provando a giocare il server rispondeva "si
// comincia fra N secondi" — ma il numerone al centro dello schermo non
// compariva. Una regola che si fa sentire solo quando ti blocca, senza
// mai mostrarti quanto manca, sembra un difetto anche quando e' giusta.
//
// Questo file gira col server VERO e i trenta secondi accesi: gli altri
// controlli li spengono per non stare fermi ad aspettare, ed e' proprio
// per questo che nessuno di loro poteva accorgersene.
// ============================================================

import { tmpdir } from 'node:os';
import { join } from 'node:path';

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch (e) {
  console.log('\n--- I TRENTA SECONDI SI VEDONO? ---\n');
  console.log('SALTATO: manca jsdom. Installalo con:  npm install\n');
  process.exit(0);
}

process.env.MAGAZZINO = join(tmpdir(), 'burraco-legends-studio.json');
process.env.NON_AVVIARE = '1';
delete process.env.STUDIO_SECONDI;          // QUI i trenta secondi ci sono davvero
const { server } = await import('../server/server.js');
const { SECONDI_DI_STUDIO } = await import('../engine/partita.js');

let ko = 0;
const check = (nome, ok, dettaglio) => {
  console.log((ok ? 'OK   ' : 'FAIL ') + nome + (ok || !dettaglio ? '' : '  <- ' + dettaglio));
  if (!ok) ko++;
};
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n--- I TRENTA SECONDI SI VEDONO? ---\n');

await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = 'http://127.0.0.1:' + server.address().port;
const posta = async (via, corpo) => (await (await fetch(BASE + via, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
})).json());

async function apriTavolo(codice, segreto, posto) {
  const guasti = [];
  const html = await (await fetch(BASE + '/tavolo.html')).text();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: BASE + '/tavolo.html#codice=' + codice + '&segreto=' + encodeURIComponent(segreto) + '&giocatore=' + posto,
    beforeParse(w) {
      w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
      w.fetch = (via, opz) => fetch(String(via).startsWith('http') ? via : BASE + via, opz);
      w.onerror = (m, s, r, c, e) => guasti.push(String((e && e.stack) || m));
    }
  });
  await attendi(800);
  return { w: dom.window, dom, guasti };
}

const casa = await posta('/api/apri', { nome: 'Pietro' });
const ospite = await posta('/api/entra', { codice: casa.codice, nome: 'Amico' });

const A = await apriTavolo(casa.codice, casa.segreto, 0);
const B = await apriTavolo(casa.codice, ospite.segreto, 1);

check('nessuno dei due tavoli va in errore', A.guasti.length + B.guasti.length === 0,
  A.guasti[0] || B.guasti[0]);

// ---------- il numerone c'e', ed e' lo stesso per tutti e due ----------
const conto = (p) => {
  const box = p.w.document.getElementById('studio');
  const numero = p.w.document.getElementById('studioNumero');
  return {
    visibile: !!(box && box.classList.contains('mostra')),
    numero: numero ? Number(numero.textContent.trim()) : null,
    corpoInStudio: p.w.document.body.classList.contains('in-studio')
  };
};

for (const [chi, p] of [['chi ha aperto il tavolo', A], ['chi e\' entrato col codice', B]]) {
  const c = conto(p);
  check(chi + ' vede il conto alla rovescia', c.visibile, 'il riquadro non e\' a schermo');
  check(chi + ' vede un numero sensato',
    c.numero !== null && c.numero > 0 && c.numero <= SECONDI_DI_STUDIO, 'numero: ' + c.numero);
  check(chi + ' vede i personaggi messi in evidenza', c.corpoInStudio);
}

const a1 = conto(A), b1 = conto(B);
check('i due schermi mostrano lo stesso numero', Math.abs((a1.numero || 0) - (b1.numero || 0)) <= 1,
  a1.numero + ' contro ' + b1.numero);

// ---------- e scorre ----------
await attendi(2200);
const a2 = conto(A), b2 = conto(B);
check('il conto scende sul primo schermo', a2.numero < a1.numero, a1.numero + ' → ' + a2.numero);
check('e anche sul secondo', b2.numero < b1.numero, b1.numero + ' → ' + b2.numero);

// ---------- e nel frattempo non si gioca ----------
{
  const r = await posta('/api/mossa', { codice: casa.codice, segreto: casa.segreto, azione: { tipo: 'pesca' } });
  check('durante lo studio il server non fa giocare', r.ok === false);
  check('e dice quanto manca', /si comincia fra \d+ second/i.test(r.motivo || ''), r.motivo);
}

A.dom.window.close(); B.dom.window.close();
server.close();

console.log('\n' + (ko === 0 ? 'Tutti i controlli passati.' : ko + ' controlli falliti.') + '\n');
process.exit(ko === 0 ? 0 : 1);
