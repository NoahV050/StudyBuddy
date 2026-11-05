# Projectconventies

- Houd de frontend frameworkloos: vanilla HTML, CSS en browser-ES-modules; voeg geen buildstap of dependency toe zonder duidelijke noodzaak.
- Houd modules klein en verantwoordelijk voor één domein. Plaats browser-/weergavelogica niet in pure state- of gamificationlogica.
- Bewaar zichtbare tekst in vriendelijk Nederlands en gebruik de bestaande semantische HTML, labels, focusstijlen en mobile-first CSS-patronen.
- Behandel alle gebruikers- en AI-invoer als onbetrouwbaar. Gebruik `textContent`/DOM-nodes en de bestaande veilige Markdown-rendering; render geen ongesanitized HTML.
- Houd geheimen server-side. De Supabase publieke anon/publishable key mag in de browser; service-role keys en Gemini-sleutels nooit.
- Verhoog het state-versienummer en voeg een migratie toe wanneer de opgeslagen state-structuur verandert. Behoud bestaande gebruikersdata.
- Bewaar offline wijzigingen lokaal en laat de bestaande merge-/synclaag gegevens samenvoegen; introduceer geen stille overschrijvingen.
- Verhoog bij app-updates zowel de serviceworker-cacheversie als de versiequery van `js/script.js`; precache de nieuwe modules voordat een update kan activeren.
- Voeg regressietests toe voor domeinlogica, API-validatie en state-migraties.

## Valideren

```sh
npm ci
npm run lint
npm test
```

Controleer voor PWA-wijzigingen ook de serviceworkerinstallatie, de updatebanner, online-herstel en offline laden in een browser. Supabase- en Gemini-integraties vereisen een geconfigureerde testomgeving; meld duidelijk wanneer die niet beschikbaar is.
