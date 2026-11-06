# Supabase: RLS en accountverwijdering

## Wat vanuit deze repository bekend is

De client leest en schrijft uitsluitend de `profiles`-rij met `user_id`, `state` (JSONB) en `updated_at`. De browser gebruikt een publieke anon/publishable key. De productie-RLS-instellingen en daadwerkelijke databaseschema zijn niet beschikbaar in deze repository en zijn dus niet gecontroleerd.

## RLS-controle voor `public.profiles`

Voor een nieuw project kun je de gecontroleerde basisconfiguratie toepassen via **Supabase Dashboard → SQL Editor → New query**. Open [`supabase/migrations/20261106110000_create_profiles.sql`](../supabase/migrations/20261106110000_create_profiles.sql), kopieer de inhoud naar de query-editor en voer deze uit. Deze migratie maakt de tabel en eigen-rij-policies aan die de huidige app gebruikt. Controleer in **Table Editor** of `public.profiles` daarna bestaat.

Controleer eerst in de Supabase SQL Editor dat `user_id` een UUID is, uniek is en verwijst naar `auth.users.id`. Controleer ook bestaande policies: Supabase permissive policies worden samengevoegd met OR, dus een nieuwe eigen-rij-policy neutraliseert geen bestaande brede policy. Verwijder of beperk onveilige bestaande policies voordat je onderstaande policies toepast:

```sql
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;
```

Voer dit niet blind uit op een onbekend schema. Zoek vóór het toevoegen van een unieke index eerst naar dubbele `user_id`-waarden en controleer bestaande grants. De browser heeft geen directe delete-policy nodig: accountverwijdering loopt via de serverfunctie.

## Account verwijderen instellen

Configureer deze Vercel server-side environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (de publieke project key voor tokenverificatie)
- `SUPABASE_SERVICE_ROLE_KEY` (alleen in de serverfunctie; nooit naar de frontend)

`api/delete-account.js` controleert de access token bij Supabase Auth, verwijdert alleen de geverifieerde gebruiker, wist diens `profiles`-rij en probeert die rij te herstellen als het verwijderen van Auth faalt. De route vereist HTTPS in productie en retourneert geen Supabase-internals aan de browser. Test de route eerst op een apart Supabase-project met een testaccount en bevestig dat ook eventuele toekomstige tabellen met persoonsgegevens worden verwijderd of een passende `ON DELETE CASCADE` hebben.

Supabase Auth en PostgREST bieden hier geen gezamenlijke transactie. Bij een netwerkonderbreking tijdens de Auth-verwijdering kan de uitkomst onzeker zijn; controleer dan de gebruiker en profielrij in Supabase voordat je een nieuwe verwijderpoging doet.

De client verwijdert vervolgens de lokale account-state en sluit de sessie af. Als lokale opslag door browserbeleid niet kan worden gewist, krijgt de gebruiker daar een expliciete melding van.

## Privacy-aandachtspunten

- Exporteer bevat studie-state en tutorhistorie; behandel het JSON-bestand als persoonlijk gegeven.
- De tutor stuurt vragen en beperkte gesprekscontext naar Gemini. Communiceer dit aan gebruikers en controleer de toepasselijke voorwaarden en bewaartermijnen.
- De Vercel CSP staat inline styles toe omdat bestaande schermen style-attributen gebruiken; inline scripts zijn niet toegestaan.
- De rate limiter voor de AI-route is proceslokaal en is geen globale limiet over alle serverless instances. Gebruik voor productie eventueel een gedeelde limiter.
- RLS-, accountverwijderings- en exportflows moeten na deployment opnieuw tegen de echte Supabase-configuratie worden getest.
