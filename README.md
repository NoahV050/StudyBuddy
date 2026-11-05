# Studiemaatje

Studiemaatje is een mobile-first Nederlandstalige studie-PWA. De frontend gebruikt vanilla HTML, CSS en JavaScript-modules; Supabase verzorgt aanmelden en voortgangssynchronisatie. De AI-tutor loopt via Vercel Functions en Gemini.

## Functies

- Focus- en aangepaste timers, taken, notities en voortgang met XP.
- Vakken, toetsplanning, flashcards met spaced repetition en studieoverzichten.
- Nederlandstalige AI-tutor met verschillende leerstanden en streaming.
- Lokale opslag, synchronisatie per account en een offline app-shell.
- JSON-export en een accountverwijderingsroute voor ingelogde gebruikers.

## Lokaal ontwikkelen

Gebruik Node.js 22 of nieuwer. De frontend heeft geen runtime-npm-afhankelijkheden of buildstap. `npm ci` installeert alleen de ontwikkeltooling voor linten en tests.

1. Configureer in `js/config.js` de Supabase-project-URL en publieke anon/publishable key. Deze key mag in de browser staan; zet hier nooit een service-role- of secret key.
2. Gebruik `vercel dev` voor de volledige app, inclusief de API-routes. Een eenvoudige statische server toont de interface, maar voert de Vercel API-routes niet uit.
3. Installeer de ontwikkeltooling en controleer de code:

   ```sh
   npm ci
   npm run lint
   npm test
   ```

De tutor heeft `GEMINI_API_KEY` nodig. Accountverwijdering vereist daarnaast `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY`. Stel deze uitsluitend in als server-side omgevingsvariabelen in Vercel of je lokale Vercel CLI-omgeving. De service-role key mag nooit naar `js/`, HTML, browseropslag of git.

## Deployment

Het project is ingericht voor Vercel met `index.html` als statische entrypoint en bestanden in `api/` als serverless routes. Configureer alle benodigde server-side omgevingsvariabelen voordat je een productieomgeving aanbiedt. De publieke frontend-key in `js/config.js` is geen vervanging voor een backendgeheim.

## Privacy en accountgegevens

Voortgang wordt lokaal in de browser bewaard en na aanmelden naar de eigen `profiles.state`-rij gesynchroniseerd. De tutorvraag en relevante chatcontext worden naar de Gemini API gestuurd. Gebruikers kunnen vanuit hun profiel de actuele app-state als JSON downloaden. Accountverwijdering verwijdert de Supabase Auth-gebruiker en diens profiel via `api/delete-account.js`; zie [docs/supabase-security.md](./docs/supabase-security.md) voor de vereiste serverconfiguratie en RLS-controle.

Controleer vóór gebruik met echte leerlingen de privacyverklaring, bewaartermijnen, ouderlijke toestemming waar van toepassing en de voorwaarden van de AI-aanbieder. Deze repository bevat geen juridische beoordeling en de live Supabase-configuratie/RLS is niet vanuit de code te verifiëren.

## Licentie

Er is nog geen licentie toegevoegd. MIT is een eenvoudige optie als de rechthebbenden hergebruik door anderen willen toestaan; bevestig eerst dat je de rechten hebt om alle projectonderdelen zo te licentiëren. Zonder licentie moet je niet aannemen dat hergebruik is toegestaan.
