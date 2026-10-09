// Only provider capacity responses count as quota. Never expose provider bodies
// (which can contain credentials) to clients or logs.
export function classifyGeminiFailure(error: unknown) {
  const message = String((error as Error)?.message || '');
  const status = Number(message.match(/Gemini API error (\d{3})/)?.[1] || 0);
  if (/key (?:vault|storage)|API_KEY is not set/.test(message)) return { code: 'GEMINI_CONFIGURATION', status: 503, retryable: false, retryAfter: 0,
    message: 'ڕێکخستنی کلیلی Gemini یان هەڵگرتنی کلیلەکان بەردەست نییە؛ ئەمە پڕبوونی سنور نییە.' };
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(message)) {
    const seconds = Number(message.match(/"retryDelay"\s*:\s*"([\d.]+)s"/)?.[1] || 60);
    return { code: 'GEMINI_RATE_LIMIT', status: 429, retryable: false,
      retryAfter: Math.min(86400, Math.max(1, Math.ceil(seconds))),
      message: 'Gemini سنوری داواکاریی ئەم پڕۆژەیەی ڕاگرتووە؛ وردەکاریی سنورەکە لە Google AI Studio بپشکنە.' };
  }
  if ([400, 401, 403].includes(status)) return { code: 'GEMINI_KEY_REJECTED', status: 422, retryable: false, retryAfter: 0,
    message: 'Gemini کلیل یان ڕێکخستنی داواکارییەکەی ڕەتکردەوە؛ کلیل، دەسەڵات و چالاکبوونی API بپشکنە. ئەمە پڕبوونی سنور نییە.' };
  if (status === 404) return { code: 'GEMINI_MODEL_UNAVAILABLE', status: 422, retryable: false, retryAfter: 0,
    message: 'مۆدێلی وەرگێڕانی Gemini بۆ ئەم پڕۆژەیە بەردەست نییە.' };
  return { code: 'GEMINI_TRANSLATION_FAILED', status: 424, retryable: true, retryAfter: 0,
    message: /^(Gemini returned|Gemini changed|Gemini API timed out)/.test(message)
      ? message : 'وەرگێڕانی Gemini سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدە.' };
}
