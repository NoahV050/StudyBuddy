module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server mist GOOGLE_GEMINI_API_KEY' }));
    return;
  }

  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];
  const prompt = req.body && req.body.prompt;

  if (!prompt || typeof prompt !== 'string') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Prompt ontbreekt' }));
    return;
  }

  let lastError = 'Onbekende Gemini-fout';

  for (const model of models) {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 700
          }
        })
      }
    );

    const data = await response.json();

    if (response.ok) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        model: model,
        candidates: data.candidates || []
      }));
      return;
    }

    lastError = data && data.error && data.error.message ? data.error.message : lastError;
    if (response.status !== 404) break;
  }

  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: lastError }));
};
