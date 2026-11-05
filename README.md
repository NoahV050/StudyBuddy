# Studiemaatje (StudyBuddy)

Studiemaatje is een Nederlandstalige studieapp die leerlingen helpt om overzicht te houden, geconcentreerd te leren en vragen te begrijpen met hulp van een AI-tutor. De app combineert een focustimer, taken, notities en een speels voortgangssysteem in één overzichtelijke interface.

## Functies

- **Dashboard** – bekijk je dagelijkse studiedoel, voortgang, XP, niveau, reeks, afgeronde taken en aankomende taken.
- **Focustimer** – kies uit Pomodoro (25 minuten), korte focus (10 minuten) of diepe focus (50 minuten). Houd je studiesessies bij.
- **AI-tutor** – stel vragen over een schoolvak. De tutor is gericht op uitleg in stappen, voorbeelden en controlevragen. Er zijn snelle prompts om iets stap voor stap uit te leggen, een voorbeeld te geven of je te overhoren.
- **Takenlijst** – voeg taken toe en filter op alle taken, taken die nog moeten gebeuren of afgeronde taken.
- **Notities** – maak notities en bewerk ze later.
- **XP, levels en badges** – verdien XP door te studeren en acties uit te voeren, bouw een reeks op en ontgrendel badges.
- **Profiel en thema's** – stel je naam, leeftijd en opleidingsniveau in en kies tussen een licht of donker thema.
- **Account en synchronisatie** – met Supabase kunnen gebruikers inloggen en hun voortgang tussen apparaten synchroniseren.
- **PWA-ondersteuning** – de app bevat een web-appmanifest en service worker, zodat installatie als webapp mogelijk is.

## Gebruikte technologieën

- HTML5
- CSS3
- JavaScript (zonder frontend-framework)
- [Supabase](https://supabase.com/) voor authenticatie en opslag van gebruikersvoortgang
- [Google Gemini API](https://ai.google.dev/) voor de AI-tutor
- [Vercel](https://vercel.com/) voor het hosten van de serverless AI-endpoint

## Projectstructuur

```text
StudyBuddy/
├── api/
│   └── chat.js          # Serverless endpoint voor Gemini
├── css/
│   └── styles.css       # Vormgeving en thema's
├── icons/               # App-iconen
├── js/
│   ├── config.js        # Supabase-projectconfiguratie
│   └── script.js        # App-logica
├── index.html           # App-interface
├── manifest.json        # PWA-instellingen
└── sw.js                # Service worker en caching
```

## Lokaal starten

1. Clone de repository:

   ```bash
   git clone https://github.com/NoahV050/StudyBuddy.git
   cd StudyBuddy
   ```

2. Start de app met een lokale webserver. Bijvoorbeeld met de VS Code-extensie **Live Server** of:

   ```bash
   npx serve .
   ```

3. Open het lokale adres dat de webserver toont.

> **Let op:** de AI-tutor gebruikt het endpoint `/api/chat`. Dat endpoint is bedoeld voor een omgeving die de map `api/` als serverless functies uitvoert, zoals Vercel. Alleen een statische lokale webserver start deze functie niet automatisch.

## Configuratie

### 1. Google Gemini API

De AI-tutor heeft een Gemini API-sleutel nodig.

1. Maak een API-sleutel aan via [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Voeg in je hostingomgeving een environment variable toe:
   - Naam: `GEMINI_API_KEY`
   - Waarde: je eigen Gemini API-sleutel
3. Deploy de applicatie opnieuw.

De sleutel wordt door `api/chat.js` aan de serverkant gelezen. Zet deze sleutel **niet** in frontendbestanden of in je repository.

### 2. Supabase (accounts en cloudopslag)

De Supabase-configuratie staat in `js/config.js`. Vul daar de URL van je eigen Supabase-project en de publiceerbare anon/publishable key in. Gebruik nooit een Supabase service-role key in de frontend.

De applicatie verwacht een tabel `profiles` met minimaal deze kolommen:

| Kolom | Type | Doel |
| --- | --- | --- |
| `user_id` | `uuid` | ID van de ingelogde gebruiker |
| `email` | `text` | E-mailadres |
| `state` | `jsonb` | Opgeslagen studievoortgang |
| `updated_at` | `timestamptz` | Laatste wijziging |

Voorbeeld-SQL om de tabel aan te maken:

```sql
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

Voer dit uit in de SQL Editor van je Supabase-project. Controleer ook de instellingen voor e-mailbevestiging en authenticatie in Supabase.

Zonder geldige Supabase-configuratie zijn accounts en synchronisatie niet beschikbaar. De app kan voortgang dan lokaal in de browser opslaan.

## Deployen

De repository bevat een `api/chat.js`-functie en een `vercel.json`, en kan daardoor op Vercel worden gedeployed:

1. Importeer de GitHub-repository in [Vercel](https://vercel.com/).
2. Voeg `GEMINI_API_KEY` toe bij de project Environment Variables.
3. Controleer of `js/config.js` naar je eigen Supabase-project verwijst als je accounts en synchronisatie wilt gebruiken.
4. Deploy het project.

## Privacy en beveiliging

- Bewaar geheime API-sleutels als environment variables op de server.
- Gebruik alleen de Supabase publiceerbare key in de frontend en schakel Row Level Security in.
- Stel policies zo in dat gebruikers alleen hun eigen profielgegevens kunnen lezen en wijzigen.
- Deel geen wachtwoorden, tokens of persoonlijke gegevens in commits of screenshots.

## Bijdragen

Ideeën, bugmeldingen en verbeteringen zijn welkom. Open een issue of maak een pull request via GitHub.

## Licentie

Er is momenteel geen licentie in deze repository opgenomen. Alle rechten blijven daarom voorbehouden totdat er een licentie wordt toegevoegd.
