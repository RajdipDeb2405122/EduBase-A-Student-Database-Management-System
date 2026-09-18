// Zero-dependency protection layer.
//
// 1. securityHeaders  - the standard hardening headers (what helmet sets),
//                       written out explicitly so there is no extra package.
// 2. loginRateLimit   - blocks password guessing on every /login endpoint.
//
// Both are plain Express middleware and need no configuration.

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

function securityHeaders(req, res, next) {
  // Never let a browser guess a different content type than the one we send.
  res.set('X-Content-Type-Options', 'nosniff');

  // This API is never meant to be framed by another site.
  res.set('X-Frame-Options', 'DENY');

  // Do not leak API URLs (which contain record ids) to third-party sites.
  res.set('Referrer-Policy', 'no-referrer');

  // The API returns JSON only, so no scripts, styles or frames are ever needed.
  res.set(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'"
  );

  // Turn off browser features this API has no use for.
  res.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );

  // Hide the framework fingerprint.
  res.removeHeader('X-Powered-By');

  next();
}

// ---------------------------------------------------------------------------
// Login rate limiting
// ---------------------------------------------------------------------------

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 8;           // per IP + email pair, per window

const attempts = new Map();

// Drop expired buckets so the map cannot grow forever.
function sweep(now) {
  for (const [key, bucket] of attempts) {
    if (now > bucket.resetAt) attempts.delete(key);
  }
}

function clientIp(req) {
  const forwarded = req.get('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function bucketKey(req) {
  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';
  return `${clientIp(req)}|${email}`;
}

function loginRateLimit(req, res, next) {
  const now = Date.now();

  if (attempts.size > 500) sweep(now);

  const key = bucketKey(req);
  let bucket = attempts.get(key);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);

    return res
      .status(429)
      .set('Retry-After', String(retryAfter))
      .json({
        error:
          'Too many login attempts. Please wait a few minutes and try again.'
      });
  }

  // A successful login clears the counter, so ordinary users are never
  // punished for one mistyped password.
  res.on('finish', () => {
    if (res.statusCode < 400) attempts.delete(key);
  });

  next();
}

// Only guard the login endpoints; everything else passes straight through.
function guardLogins(req, res, next) {
  if (req.method === 'POST' && /\/login\/?$/.test(req.path)) {
    return loginRateLimit(req, res, next);
  }
  next();
}

module.exports = {
  securityHeaders,
  loginRateLimit,
  guardLogins
};
