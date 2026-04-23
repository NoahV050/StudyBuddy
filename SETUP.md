# Study Buddy cloud sync setup

1. Create a Supabase project.
2. In Supabase, open the SQL editor and run `supabase.sql`.
3. In Supabase, open `Project Settings -> API`.
4. Copy your project URL and anon key.
5. Open `config.js` and fill in:

```js
window.STUDY_BUDDY_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_KEY'
};
```

6. In Supabase Auth, enable Email authentication.
7. If you want users to sign in immediately after signup, disable mandatory email confirmation.

Notes:
- Google AI Studio API keys stay local on each device and are not synced to the database.
- Study progress, tasks, notes, streaks, and chat history are synced per account.
- Logging out on one device lets another user sign in on the same device without mixing data.
