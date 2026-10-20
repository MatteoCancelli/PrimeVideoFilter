# Prime Video Filter

Estensione Chrome (Manifest V3) che nasconde dalle pagine di Prime Video i contenuti **non inclusi nell'abbonamento Prime**: titoli da noleggiare o acquistare e titoli offerti tramite canali/abbonamenti aggiuntivi (Apple TV+, Paramount+, Discovery+, …).
Resta visibile ciò che è incluso in Prime e tutto ciò che non si può classificare con certezza come a pagamento.

Nessun popup, nessuna opzione, nessuna richiesta di rete, nessun dato raccolto. Nessun permesso API: solo content script.

## Installazione

1. Apri `chrome://extensions` in Chrome.
2. Attiva **Modalità sviluppatore** (in alto a destra).
3. Clicca **Carica estensione non pacchettizzata** e seleziona questa cartella (quella che contiene `manifest.json`).
4. Apri (o ricarica) Prime Video.

Dopo ogni modifica al codice: clicca l'icona ↻ dell'estensione in `chrome://extensions` e ricarica la scheda di Prime Video.

Funziona su:
- `https://*.primevideo.com/*`
- `https://www.amazon.{it,com,co.uk,de,fr,es,ca,com.au}/…gp/video/…` (anche con il prefisso lingua, es. `amazon.it/-/en/gp/video/…`).

Le etichette riconosciute sono in italiano e inglese; su un'interfaccia in altre lingue il filtro semplicemente non trova evidenze e non nasconde nulla.

## Come funziona

File:

| File | Ruolo |
|---|---|
| `manifest.json` | Dichiara il content script sui domini sopra (`document_idle`). |
| `src/classify.js` | Dizionari di etichette IT/EN, individuazione della card (`findCard`) e classificazione pura (`classifyCard` → `"paid"` / `"included"` / `"unknown"`). |
| `src/content.js` | Scansione della pagina, marcatura delle card, righe vuote, `MutationObserver`. Contiene la costante `DEBUG`. |
| `src/content.css` | Nasconde (o in DEBUG evidenzia) ciò che è marcato. |

1. **Trovare le card.** Le classi CSS di Amazon sono offuscate e cambiano, quindi non vengono usate. Si parte da ogni link a un titolo (`/detail/…`, `/dp/…`, o un'offerta canale `?benefitId=…`) e si risale il DOM fino al contenitore più grande che contiene link a *quel solo* titolo, fermandosi al primo `li` / `article` / `[role=listitem]` / `[data-testid*=card]`. Guardie anti-sovra-nascondimento: non si sale mai oltre `body`/`main`/`header`/`nav`/`footer`, né in un blocco con un `h1` (l'intestazione di una pagina di dettaglio), né oltre 10 livelli o 600 nodi. I link nel menu del sito (`header`, `nav`) vengono ignorati, e su una pagina di dettaglio i link al titolo stesso non contano come card.
2. **Classificare.** Per ogni card si raccolgono i testi visibili, `aria-label`, `title`, `alt` (inclusi i `<title>` degli SVG) e gli eventuali attributi `data-*entitle*`. In ordine di priorità:
   - un'etichetta **teaser** ("Primo episodio gratuito", "gli episodi successivi richiedono abbonamento", "First episode free") → `paid`, sempre;
   - l'attributo reale `data-card-entitlement` dell'`<article>`: `Unentitled` → `paid`, `Entitled` → `included`;
   - il logo di un canale incorporato nell'URL della thumbnail (`…/benefit-id/…/<canale>/logos/…`) → `paid`;
   - un'etichetta **inclusa** ("prime", "Incluso con Prime", "Watch with Prime", oppure "Noleggiato"/"Purchased"/"Il noleggio scade…" per ciò che hai già comprato) → `included`, e prevale sulle etichette a pagamento;
   - altrimenti un'etichetta **a pagamento** ("Noleggia", "Acquista", "Rent", "Buy", "Abbonati", "Subscribe", "Prova gratis", "Free trial", "Canali Prime Video", un prezzo come "3,99 €", un link `benefitId=` a un canale) → `paid`;
   - altrimenti `unknown`.
   Per evitare falsi positivi: le parole vanno trovate intere ("rent" non scatta in "current"), il titolo del film (alt del poster, intestazioni) non conta come etichetta (un film chiamato "Rent" resta visibile), e i testi oltre 80 caratteri (sinossi) non contano come etichette a pagamento.
3. **Nascondere.** Solo `paid` viene nascosto: la card riceve `data-pvf="paid"` e il CSS applica `display: none`. Le card `article[data-testid="card"][data-card-entitlement="Unentitled"]` (e il loro slot, con `:has()`) sono nascoste direttamente dal CSS, prima ancora che giri lo script: niente lampo durante lo scorrimento. Le card `unknown` restano visibili (meglio un falso negativo che una pagina vuota se Amazon cambia il markup).
4. **Righe vuote.** Per ogni card si cerca la sezione che la contiene con **un solo** titolo di riga (`h2`/`h3`/`h4`/`[role=heading]`). Se tutte le card della sezione sono `paid`, la sezione riceve `data-pvf-row="empty"` e sparisce insieme al titolo. Se arriva poi una card visibile, la riga ricompare.
5. **Contenuti dinamici e SPA.** Un `MutationObserver` su tutto il documento rilancia la scansione al frame successivo (`requestAnimationFrame`, prima del disegno; con un `setTimeout` di 100 ms come riserva per le schede in background). Una card il cui contenuto cambia (es. l'anteprima in hover) viene riclassificata. L'estensione modifica solo attributi, quindi non riattiva l'observer (nessun loop). Le card già decise (`data-pvf` + `data-pvf-key` con l'id del titolo) non vengono rielaborate; le `unknown` sì (le etichette possono arrivare dopo), così come i nodi riciclati da Amazon che ora mostrano un altro titolo. Lo scroll infinito e la navigazione senza ricaricamento producono inserimenti nel DOM e sono gestiti allo stesso modo.

## Estendere i dizionari

Apri `src/classify.js`, oggetto `LABELS`:

```js
const LABELS = {
  teaser: {
    phrases: ['primo episodio gratuito', 'first episode free', /* … */],
    exact: [],
  },
  included: {
    phrases: ['incluso con prime', 'included with prime', /* … */],
    exact: ['prime', 'incluso', 'included'],
  },
  paid: {
    phrases: ['noleggia', 'rent', 'abbonati', 'subscribe', /* … */],
    exact: ['store', 'negozio'],
  },
};
```

- `phrases`: la frase (minuscola) viene cercata come parole intere dentro ogni etichetta. Es. aggiungere `'disponibile per il noleggio'`.
- `exact`: l'etichetta deve essere esattamente quella (utile per parole brevi e ambigue, come il badge "prime").
- Apostrofi tipografici, maiuscole e spazi multipli sono normalizzati automaticamente.
- Ricorda l'ordine: `teaser` > attributo `data-card-entitlement` > `included` > `paid`. Una parola troppo generica in `included` può far ricomparire card a pagamento; una troppo generica in `paid` può nascondere card incluse.

Dopo la modifica aggiungi un caso in `test/classify.test.js` e lancia i test (vedi sotto).

## DEBUG

In `src/content.js`:

```js
const DEBUG = false;
```

Con `true` (e dopo aver ricaricato l'estensione) le card che verrebbero nascoste restano visibili con sfondo e bordo **rossi**, e le righe che verrebbero nascoste hanno un bordo rosso tratteggiato.

Scorciatoia senza modificare il codice: nella console di DevTools della pagina di Prime Video esegui

```js
document.documentElement.toggleAttribute('data-pvf-debug')
```

Ogni card esaminata porta l'attributo `data-pvf` (`paid` / `included` / `unknown`), visibile nel pannello Elements.

## Sviluppo e test

```sh
npm install        # installa solo jsdom (devDependency)
npm test           # node --test: classificazione, nascondimento, casi dinamici, mock page
npm run icons      # rigenera icons/*.png
```

`mock/index.html` è una pagina offline con card finte (IT/EN, markup variegato, classi offuscate, righe solo a pagamento, card aggiunte dinamicamente dopo 1–2,5 s). Aprila direttamente nel browser (doppio clic): carica gli script di `src/` e dopo ~3,5 s la barra in alto mostra **Self-check OK** se ogni elemento è visibile/nascosto come previsto. Il pulsante *Toggle DEBUG* mostra in rosso cosa viene nascosto.
