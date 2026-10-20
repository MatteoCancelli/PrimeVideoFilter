# NOTES – decisioni, assunzioni, limiti

Log del lavoro svolto in autonomia (notte 19–20/10/2026).

## Decisioni prese in autonomia

1. **Struttura**: 3 file runtime (`src/classify.js`, `src/content.js`, `src/content.css`). `classify.js` contiene dizionari + `findCard` + `classifyCard` (pure, senza effetti collaterali) ed esporta via `module.exports` solo se esiste `module` (Node); nel browser le costanti top-level sono condivise tra i content script dello stesso mondo isolato, come più `<script>` in una pagina. Nessun bundler.
2. **Commit in inglese**, documentazione in italiano.
3. **`run_at: document_idle`**: le card vengono renderizzate da JS dopo il caricamento; partire prima non dà vantaggi e l'observer copre il resto. Possibile breve "flash" di card a pagamento prima del filtro (vedi limiti).
4. **Domini**: `*.primevideo.com` + `amazon.{it,com,co.uk,de,fr,es,ca,com.au}` sul percorso `*gp/video/*` (il `*` iniziale copre il prefisso lingua `/-/en/`). Altri amazon.* non aggiunti: lingua diversa da IT/EN → nessuna etichetta riconosciuta, quindi inutili. Lo script, se la SPA esce da `/gp/video/` su amazon.*, non fa nulla.
5. **Il verdetto "incluso" vince sempre** (anche su un'etichetta a pagamento nella stessa card), come da specifica; "incluso" comprende anche "già noleggiato/acquistato" ("Noleggiato", "Purchased", "Il noleggio scade…") perché in "Continua a guardare" un titolo già pagato è guardabile e va lasciato.
6. **Etichette a pagamento esatte `store`/`negozio`**: ipotizzo che l'icona "carrello/store" delle card abbia questo testo come `<title>`/aria-label. Solo come etichetta esatta, per non colpire frasi.
7. **Attributi `data-*entitle*`**: se Amazon espone qualcosa come `data-card-entitlement="Entitled|Unentitled"` (lo ricordo da userscript della comunità, non verificato), `Entitled/true` → incluso, `Unentitled/false` → a pagamento.
8. **Link `?benefitId=…`** (pagine di offerta di un canale) sono trattati come card e come evidenza "a pagamento", tranne se il valore inizia con `prime`.
9. **Freevee / "Gratis con pubblicità" / "Free with ads"** non sono a pagamento: restano visibili (`unknown`).
10. **Anti-falsi-positivi** (aggiunti dopo i test): parole intere con confini Unicode; alt delle immagini *dentro un link* (poster) e testo delle intestazioni ignorati come etichette a pagamento (film "Rent"); etichette > 80 caratteri ignorate per il pagamento (sinossi nell'anteprima espansa che contengono "rent"/"buy").
11. **Anti-sovra-nascondimento** per le card: si sale dal link solo finché il contenitore contiene link a quel solo titolo; stop a `li/article/[role=listitem]/[data-testid*=card]`, a `html/body/main/header/nav/footer`, a blocchi con `h1`, oltre 10 livelli o 600 nodi. Link in `header`/`nav` ignorati (bug trovato dalla mock page: il link "Canali" del menu sarebbe stato nascosto). Sulla pagina di dettaglio, i link al titolo corrente non sono card.
12. **Righe**: si nasconde la sezione più vicina che contiene **esattamente un** titolo di riga (`h2/h3/h4/[role=heading]` fuori dalle card) e nessun `h1`. Con 0 o ≥2 titoli non si nasconde nulla (opzione sicura). La riga viene ri-valutata a ogni scansione, quindi ricompare se arriva una card visibile.
13. **Rielaborazione**: le card decise (`paid`/`included`) con lo stesso `data-pvf-key` (id del titolo) non vengono rielaborate. Le `unknown` sì, a ogni scansione: le etichette possono arrivare in ritardo. Se un nodo riciclato mostra un altro titolo, viene riclassificato.
14. **Observer**: `childList + subtree` sull'intero documento, debounce 150 ms con `setTimeout` (non osservo attributi/testi: costoso e fonte di loop). La navigazione SPA cambia sempre il DOM, quindi non serve intercettare `pushState`.
15. **DEBUG**: oltre alla costante richiesta, il CSS reagisce all'attributo `html[data-pvf-debug]`, quindi DEBUG si può attivare anche dalla console senza ricaricare l'estensione. Nessun'altra opzione aggiunta.
16. **Icone**: generate da `scripts/make-icons.js` (encoder PNG con `zlib` di Node, niente dipendenze).
17. **Licenza**: il repo aveva già `LICENSE` GPL-3.0; `package.json` la dichiara.

## Aggiornamento 20/10/2026 (dopo la prova sul sito reale)

- Confermato dal markup reale: la card è `<article data-testid="card" data-card-entitlement="Unentitled|...">`, con dentro `<section data-testid="card-section">`. Le etichette testuali ("Iscriviti", "Noleggia") compaiono **solo in hover**; a riposo il segnale affidabile è `data-card-entitlement`, più l'icona `<svg><title>Store Filled</title>`.
- Bug: `CARD_HINT` accettava qualunque `data-testid*="card"` e si fermava al `section` interno, perdendo l'attributo dell'article → card `unknown` finché non si passava il mouse, e spazio vuoto. Ora vale solo `data-testid="card"`; inoltre vengono presi i wrapper con un solo figlio, così sparisce anche lo slot del carosello.
- Aggiunte etichette "Iscriviti", "Disponibile per la prenotazione"/"Preordina"/"Pre-order", "Store Filled".

- Seconda prova reale: il filtro funziona (13 card `Unentitled`, 17 nascoste), ma le card apparivano e poi sparivano durante lo scorrimento. Ora: (a) regola CSS diretta su `article[data-testid="card"][data-card-entitlement="Unentitled"]` + slot via `:has(> …:only-child)`; (b) scansione con `requestAnimationFrame` + `setTimeout(100)` di riserva (rAF da solo non gira in headless/schede in background: trovato con Edge headless); (c) card il cui contenuto cambia vengono riclassificate (l'observer annota la card toccata).
- Richiesta dell'utente: nascondere anche "Primo episodio gratuito, gli episodi successivi richiedono abbonamento". Nuova categoria `teaser` che vince su tutto, anche su `Entitled`. **Cambiata la priorità**: l'attributo `data-card-entitlement` ora vince sulle etichette "incluse" (prima era il contrario); è il segnale più affidabile visto finora.
- Terza prova reale: "Primo episodio gratuito" compare solo nell'anteprima in hover, che è un elemento **fuori** dalla card: veniva nascosta l'anteprima ma non la thumbnail (marcata `Entitled`). Ora un titolo visto come `paid` in qualunque elemento finisce in `paidKeys` e tutte le card con lo stesso id `/detail/…` vengono nascoste. Limite: queste card spariscono solo dopo il primo hover (a riposo non c'è ancora un segnale noto).

## Verifiche fatte

- `npm test`: 50 test (node:test + jsdom) su classificazione, ricerca della card, nascondimento, CSS, righe vuote, card dinamiche, riga che ricompare, card `unknown` che diventano `paid`, nodi riciclati, pagina di dettaglio, amazon.it non-video, e l'intera mock page (ogni elemento `data-expect` controllato).
- Prestazioni (jsdom, che è molto più lento di Chrome): pagina sintetica con 60 righe × 30 card = 1800 card → prima scansione ~460 ms, scansioni successive ~60 ms (le card già decise vengono saltate; il lookup delle righe è memorizzato per scansione).
- **Chrome non è installato su questa macchina**; c'è Microsoft Edge 155 (Chromium). Con Edge headless:
  - `mock/index.html` aperto da file: self-check "OK (42 casi)" con layout e CSS reali (screenshot controllato).
  - **Estensione reale caricata** (`--load-extension`) e mock servita da un server HTTPS locale con `--host-resolver-rules="MAP www.primevideo.com 127.0.0.1:8443, MAP * ~NOTFOUND"` (nessuna richiesta verso Amazon: tutti gli altri host sono bloccati). Il manifest viene accettato, il content script e il CSS vengono iniettati, self-check OK su `https://www.primevideo.com/storefront/home`, `https://www.amazon.it/gp/video/storefront` e `https://www.amazon.it/-/en/gp/video/storefront`; su `https://www.amazon.it/dp/B000` (non video) correttamente non fa nulla. Nessun errore di manifest nel log.
  - Comandi usati (per ripeterli): certificato con `openssl req -x509 -newkey rsa:2048 -nodes -subj /CN=www.primevideo.com`, server Node `https` che serve `mock/index.html` senza i tag `<script src>`/`<link>`, poi `msedge --headless=new --ignore-certificate-errors --host-resolver-rules=… --load-extension=<cartella> --virtual-time-budget=8000 --dump-dom <url>`. Script lasciati fuori dal repo (servono openssl e un certificato temporaneo).

## Cosa NON ho potuto verificare (niente accesso al tuo account / al sito reale)

- **Il markup reale di Prime Video.** Tutte le etichette e la struttura sono ipotesi basate sulla conoscenza generale del sito, non su HTML osservato oggi. In particolare non verificato:
  - il testo/aria-label reale del badge Prime e dell'icona store/canale sulle card (potrebbe essere solo un'immagine/SVG senza testo → card `unknown`, quindi visibili);
  - se le etichette "Noleggia/Acquista/Abbonati" sono presenti nella card **senza hover** o solo nell'anteprima espansa (se compaiono solo in hover, la card viene nascosta solo dopo il primo hover — o mai);
  - l'esistenza di `data-card-entitlement` o attributi simili;
  - la struttura delle righe (titolo `h2` nella stessa sezione del carosello?);
  - il comportamento dei caroselli virtualizzati quando alcune card hanno `display:none` (possibili spazi o frecce che saltano);
  - le pagine Canali/abbonamenti e la pagina di ricerca.
- Il caricamento in **Google Chrome** vero (verificato su Edge, stesso motore e stesso formato MV3).

## Limiti noti

- Lingue diverse da IT/EN non riconosciute (nessun nascondimento).
- Possibile breve comparsa delle card a pagamento prima del filtro (`document_idle` + debounce 150 ms).
- Le card la cui unica indicazione è un logo (immagine senza alt utile) restano visibili.
- Le etichette spezzate su più nodi ("Prova" + "gratis") non vengono riconosciute come a pagamento (lo sono come incluse: il testo completo della card viene controllato solo per le frasi "incluse", per prudenza).
- Una card classificata `paid` o `included` non viene riclassificata se cambiano solo le sue etichette (non lo stesso titolo); solo `unknown` viene ricontrollata.
- Se Amazon mette più titoli di riga nello stesso contenitore, le righe vuote non vengono nascoste (solo le card).
