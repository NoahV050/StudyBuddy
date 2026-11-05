# Studiemaatje (StudyBuddy)

Studiemaatje is een mobile-first Nederlandstalige studie-PWA die leerlingen helpt overzicht te houden, geconcentreerd te leren en vragen beter te begrijpen met hulp van een AI-tutor. De app is gebouwd met vanilla HTML, CSS en JavaScript-modules; Supabase verzorgt authenticatie en synchronisatie, Gemini de tutor en Vercel de serverless API-routes.

## Functies

- **Dashboard en voortgang** — dagdoel, studieduur, XP, niveaus, reeksen en badges.
- **Focus** — Pomodoro-, korte en diepe focussessies plus een instelbare timer, sessielog en meldingen.
- **AI-tutor** — Nederlandstalige uitleg, overhoren, samenvatten, huiswerkhints en examenmodus met streaming.
- **Taken en notities** — takenfilters, deadlines, veilige tekstweergave en notities.
- **Leren** — vakken, toetsplanning, dagplanning en flashcards met spaced repetition.
- **Gezonde motivatie** — optionele uitdagingen, expliciet te claimen beloningen en reeks-vriezer.
- **Profiel en toegankelijkheid** — licht/donker/systeemthema, onboarding en toetsenbordvriendelijke bediening.
- **PWA en privacy** — offline app-shell, updateprompt, JSON-data-export en accountverwijdering.

## Technologie en projectstructuur

- HTML5, CSS3 en JavaScript ES-modules zonder frontendframework of buildstap.
- Supabase voor aanmelden en gebruikersvoortgang.
- Google Gemini API achter Vercel Functions.
- Node.js, ESLint en GitHub Actions voor tests en CI.

```text
api/                 Serverless routes voor de tutor en accountverwijdering
css/                 App-stijlen
docs/                Supabase- en privacyrichtlijnen
icons/               PWA-iconen
js/modules/          State-, opslag-, timer-, leer-, auth- en UI-modules
tests/               Node.js-tests voor kernlogica en API-routes
.github/workflows/   CI-workflow
index.html           App-interface
manifest.json        PWA-configuratie
sw.js                Service worker
vercel.json          Vercel-headers en CSP
```

## Lokaal ontwikkelen en testen

Gebruik Node.js 22 of nieuwer. `npm ci` installeert alleen ontwikkeltools; de frontend heeft geen runtime-npm-afhankelijkheden.

1. Configureer `js/config.js` met je Supabase-project-URL en publieke anon/publishable key. Zet daar nooit een service-role- of secret key in.
2. Gebruik `vercel dev` voor de volledige app en API-routes. Een gewone statische server kan de interface tonen, maar voert de API-routes in `api/` niet uit.
3. Installeer en controleer:

   ```sh
   npm ci
   npm run lint
   npm test
   ```

De tutor heeft `GEMINI_API_KEY` nodig. Accountverwijdering vereist daarnaast `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY`. Stel deze uitsluitend als server-side omgevingsvariabelen in Vercel of de lokale Vercel CLI in. De service-role key mag nooit naar frontendbestanden, browseropslag of git.

## Supabase

De app gebruikt een tabel `public.profiles` met minimaal een `user_id` (UUID), `state` (JSONB) en `updated_at` (timestamptz). De accountverwijderingsroute verwijdert de Auth-gebruiker en diens profiel.

Controleer de schema- en RLS-configuratie vóór gebruik. De aanbevolen eigen-rij-policies, vereiste servervariabelen en aandachtspunten voor accountverwijdering staan in [docs/supabase-security.md](./docs/supabase-security.md). De daadwerkelijke productiepolicies zijn niet vanuit deze repository te controleren.

## Deployment

Importeer de repository in Vercel en configureer de benodigde server-side omgevingsvariabelen voordat je productie inzet. De browserkey in `js/config.js` is publiek; Gemini- en Supabase-service-rolegeheimen blijven server-side.

## Privacy

Studievoortgang wordt lokaal opgeslagen en na aanmelden naar de eigen profielrij gesynchroniseerd. Tutorvragen en relevante gesprekscontext worden naar Gemini gestuurd. Gebruikers kunnen vanuit hun profiel de actuele app-state als JSON downloaden of hun account verwijderen.

Controleer vóór gebruik met echte leerlingen de privacyverklaring, bewaartermijnen, ouderlijke toestemming waar van toepassing en de voorwaarden van de AI-aanbieder. Deze repository is geen juridische beoordeling. Supabase/Auth en de database bieden geen gezamenlijke transactie voor accountverwijdering; bij een netwerkstoring kan handmatige controle nodig zijn.

## Bijdragen

Voeg regressietests toe voor wijzigingen in kernlogica, state-migraties en API-validatie. De CI-workflow voert lint en tests uit bij pushes en pull requests.

## Licentie

Er is nog geen licentie toegevoegd. MIT is een eenvoudige optie als de rechthebbenden hergebruik door anderen willen toestaan; bevestig eerst dat je de rechten hebt om alle projectonderdelen zo te licentiëren. Zonder licentie moet je niet aannemen dat hergebruik is toegestaan.
