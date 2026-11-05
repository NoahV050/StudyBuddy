function reply(res, status, body) {
  res.setHeader?.('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function serviceHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };
}

async function restoreProfiles(profilesUrl, profiles, serviceKey, timeout) {
  if (!profiles.length) return true;
  try {
    const response = await fetch(profilesUrl, {
      method: 'POST',
      headers: { ...serviceHeaders(serviceKey), Prefer: 'return=minimal' },
      body: JSON.stringify(profiles),
      signal: timeout()
    });
    if (response.ok) return true;
    console.error('Accountverwijdering is afgebroken en het cloudprofiel kon niet worden hersteld.', {
      status: response.status
    });
  } catch (error) {
    console.error('Accountverwijdering is afgebroken en het cloudprofiel kon niet worden hersteld.', error);
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return reply(res, 405, { error: 'Deze methode wordt niet ondersteund.' });
  }

  const authorization = req.headers?.authorization || '';
  const tokenMatch = /^Bearer ([^\s]{1,8192})$/i.exec(authorization);
  if (!tokenMatch) return reply(res, 401, { error: 'Log opnieuw in om je account te verwijderen.' });

  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return reply(res, 503, { error: 'Account verwijderen is nog niet ingesteld.' });
  }

  let baseUrl;
  try {
    baseUrl = new URL(SUPABASE_URL);
    if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost') throw new Error('HTTPS is vereist.');
  } catch {
    return reply(res, 503, { error: 'Account verwijderen is nog niet ingesteld.' });
  }

  const timeout = () => AbortSignal.timeout(10_000);
  let deletedProfiles = [];
  let profileUrl;
  try {
    const userUrl = new URL('/auth/v1/user', baseUrl);
    const userResponse = await fetch(userUrl, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${tokenMatch[1]}` },
      signal: timeout()
    });
    if (userResponse.status === 401 || userResponse.status === 403) {
      return reply(res, 401, { error: 'Je sessie is verlopen. Log opnieuw in.' });
    }
    if (!userResponse.ok) return reply(res, 502, { error: 'Je identiteit kon niet worden gecontroleerd. Probeer het later opnieuw.' });
    const authenticatedUser = await userResponse.json();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authenticatedUser?.id || '')) {
      return reply(res, 401, { error: 'Je sessie is ongeldig. Log opnieuw in.' });
    }

    const profilesUrl = new URL('/rest/v1/profiles', baseUrl);
    profileUrl = new URL(profilesUrl);
    profileUrl.searchParams.set('user_id', `eq.${authenticatedUser.id}`);
    profileUrl.searchParams.set('select', '*');
    const profileResponse = await fetch(profileUrl, {
      method: 'DELETE',
      headers: { ...serviceHeaders(SUPABASE_SERVICE_ROLE_KEY), Prefer: 'return=representation' },
      signal: timeout()
    });
    if (!profileResponse.ok) {
      return reply(res, 502, { error: 'Je cloudprofiel kon niet veilig worden verwijderd. Je account is niet verwijderd.' });
    }
    deletedProfiles = await profileResponse.json();
    if (!Array.isArray(deletedProfiles)) throw new Error('Ongeldig profielantwoord.');

    const deleteUserUrl = new URL(`/auth/v1/admin/users/${authenticatedUser.id}`, baseUrl);
    let deleteUserResponse;
    try {
      deleteUserResponse = await fetch(deleteUserUrl, {
        method: 'DELETE',
        headers: serviceHeaders(SUPABASE_SERVICE_ROLE_KEY),
        signal: timeout()
      });
    } catch (error) {
      console.error('De Auth-accountverwijdering kon niet worden bevestigd.', error);
      if (!await restoreProfiles(profilesUrl, deletedProfiles, SUPABASE_SERVICE_ROLE_KEY, timeout)) {
        return reply(res, 500, { error: 'Verwijderen is niet afgerond. Neem contact op met de beheerder voordat je het opnieuw probeert.' });
      }
      return reply(res, 502, { error: 'Je account is niet verwijderd. Je gegevens zijn bewaard; probeer het later opnieuw.' });
    }
    if (!deleteUserResponse.ok) {
      if (!await restoreProfiles(profilesUrl, deletedProfiles, SUPABASE_SERVICE_ROLE_KEY, timeout)) {
        return reply(res, 500, { error: 'Verwijderen is niet afgerond. Neem contact op met de beheerder voordat je het opnieuw probeert.' });
      }
      return reply(res, 502, { error: 'Je account is niet verwijderd. Je gegevens zijn bewaard; probeer het later opnieuw.' });
    }

    return reply(res, 200, { ok: true });
  } catch (error) {
    console.error('De accountservice kon een verwijderverzoek niet afronden.', error);
    return reply(res, 503, { error: 'Account verwijderen is tijdelijk niet beschikbaar. Je kunt het later opnieuw proberen.' });
  }
}
