# Checklist di verifica manuale (account Prime reale)

Il filtro è stato verificato solo su pagine finte: il markup reale di Prime Video non è stato visto. Questa checklist serve a scoprire in fretta dove le euristiche sbagliano.

## Preparazione (5 minuti)

- [ ] `chrome://extensions` → Modalità sviluppatore → **Carica estensione non pacchettizzata** → questa cartella. Nessun errore rosso sulla scheda dell'estensione.
- [ ] Apri Prime Video (`www.primevideo.com` o `amazon.it/gp/video/`) e DevTools (F12) → tab **Console**: nessun errore che citi `classify.js` o `content.js`.
- [ ] **Prima passata in modalità DEBUG**: nella console esegui
  ```js
  document.documentElement.toggleAttribute('data-pvf-debug')
  ```
  Le card che verrebbero nascoste diventano rosse, le righe tratteggiate in rosso. È il modo più rapido per vedere in un colpo solo cosa il filtro "pensa". Riesegui il comando per tornare al filtro normale.
- [ ] Riepilogo di cosa è stato classificato (incollalo in console):
  ```js
  console.table([...document.querySelectorAll('[data-pvf]')].map(e => ({ verdetto: e.dataset.pvf, id: e.dataset.pvfKey, testo: e.innerText.replace(/\s+/g, ' ').slice(0, 80) })))
  ```
  Se la tabella è vuota il filtro non sta trovando le card (vedi "Come segnalare").

## Pagine da controllare

Per ogni pagina: prima in DEBUG (cosa sarebbe nascosto), poi normale (cosa resta).

| # | Pagina | Cosa osservare | OK? |
|---|---|---|---|
| 1 | **Home** | Nessuna card con "Noleggia/Acquista/Rent/Buy", prezzo o logo di canale a pagamento resta visibile. Le card con badge prime restano. Le righe interamente a pagamento (es. "Film a noleggio", "Canali…") spariscono **con il titolo**. Nessuna riga resta col titolo ma vuota. Nessuna riga "mista" sparisce per intero. | [ ] |
| 2 | **Film** (Store/Film) | Come sopra. Le righe di soli film a noleggio scompaiono. | [ ] |
| 3 | **Serie TV** | Come sopra; attenzione a stagioni "Acquista la stagione" vs serie incluse. | [ ] |
| 4 | **Ricerca** (es. cerca "batman") | Nella griglia dei risultati spariscono solo le singole card a pagamento; il titolo "Risultati per…" e le card incluse restano. Nessun "buco" che nasconde tutta la pagina. | [ ] |
| 5 | **Categoria/genere** (es. Commedia, Azione) | Card a pagamento nascoste, nessuna pagina vuota. | [ ] |
| 6 | **Scroll infinito** | Scorri in fondo alla home finché si caricano nuove righe: anche le nuove card/righe vengono filtrate entro ~mezzo secondo. Scorri un carosello a destra con le frecce: le card nuove vengono filtrate; il carosello non "salta" in modo strano. | [ ] |
| 7 | **Navigazione SPA** | Home → Film → Serie → Ricerca → di nuovo Home **senza ricaricare**: il filtro continua a funzionare su ogni pagina. | [ ] |
| 8 | **"Continua a guardare"** | Restano i titoli Prime e quelli che hai già noleggiato/acquistato. Spariscono solo eventuali card che chiedono di acquistare/noleggiare. | [ ] |
| 9 | **Canali a pagamento** (pagina Canali, righe "Apple TV+", "Paramount+"…) | Le card con "Abbonati", "Prova gratis", "Free trial", logo canale spariscono. Il menu del sito (link "Canali" in alto) resta. | [ ] |
| 10 | **Pagina di dettaglio** di un film a noleggio | L'intestazione del film (titolo, pulsanti Noleggia/Acquista) **non** deve sparire. Nelle righe "Altri titoli simili" sotto, le card a pagamento sì. | [ ] |
| 11 | **Hover sulle card** | Passando il mouse sulle card visibili non spariscono card incluse (l'anteprima espansa può contenere testo nuovo). | [ ] |
| 12 | **Interfaccia in inglese** (impostazioni lingua di Prime Video o `amazon.it/-/en/gp/video/`) | Stesso comportamento dei punti 1–4. | [ ] |
| 13 | **Prestazioni** | La pagina non rallenta; in DevTools → Performance nessun task lungo ricorrente legato a `content.js`. | [ ] |

## Cosa può andare storto e cosa significa

- **Card a pagamento ancora visibili** (falso negativo, comportamento "sicuro"): l'etichetta reale non è nel dizionario, o la card non viene trovata. Serve l'outerHTML della card.
- **Card incluse nascoste** (falso positivo, da correggere subito): un'etichetta in `paid` è troppo generica, oppure il contenitore scelto è troppo grande. Serve l'outerHTML della card e del suo genitore.
- **Righe vuote con titolo ancora visibile**: la sezione della riga non ha un titolo `h2/h3/h4/[role=heading]` riconosciuto, o ne contiene più di uno. Serve l'outerHTML della riga.
- **Intera riga/pagina sparita**: guardia anti-sovra-nascondimento non sufficiente. Serve l'outerHTML dell'elemento con `data-pvf` o `data-pvf-row` sparito (cercalo in Elements con Ctrl+F `data-pvf`).

## Come segnalare / raccogliere un selettore che non funziona

1. Attiva DEBUG (comando sopra) così anche le card nascoste restano visibili.
2. Tasto destro sulla card sbagliata → **Ispeziona**.
3. Nel pannello Elements risali con la freccia ← / clic sui genitori finché è evidenziata **tutta** la card (poster + etichette), di solito un `<li>`, `<article>` o `<div>` che contiene un link `/detail/…`.
4. Tasto destro sul nodo → **Copy → Copy outerHTML**. In alternativa, con il nodo selezionato, in console:
   ```js
   copy($0.outerHTML)                                // la card selezionata
   copy($0.closest('[data-pvf]')?.outerHTML)         // la card come l'ha vista il filtro
   copy($0.closest('section, [data-pvf-row]')?.outerHTML) // la riga intera (per problemi di righe)
   ```
5. Incolla in un file (es. `segnalazioni/home-card-1.html`) e annota:
   - URL della pagina;
   - cosa ti aspettavi (visibile/nascosta) e cosa è successo;
   - il valore di `data-pvf` sulla card (se presente);
   - lingua dell'interfaccia.
6. Con questi file si aggiunge un caso a `test/classify.test.js` / `mock/index.html` e si corregge il dizionario in `src/classify.js`.

Nota: l'outerHTML può contenere il tuo nome profilo o ID di sessione negli URL (`ref=…`); controlla prima di condividerlo.
