// Vercel Routing Middleware: HTTP Basic Auth on every path (SPEC section 11).
// Any username is accepted; the password must equal the SITE_PASSWORD env var.
import { createHash, timingSafeEqual } from 'node:crypto';

export const config = {
  runtime: 'nodejs',
};

const REALM = 'Security+ mock exam';

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

// Hashing both sides first gives equal-length buffers, so timingSafeEqual
// never leaks the password length and never throws.
function safeEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

function passwordFrom(header) {
  if (!header) return null;
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header);
  if (!match) return null;
  let decoded;
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  return colon === -1 ? null : decoded.slice(colon + 1);
}

const noStore = { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' };

export default function middleware(request) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    return new Response('Set SITE_PASSWORD in Vercel to unlock this site.', {
      status: 503,
      headers: noStore,
    });
  }

  const supplied = passwordFrom(request.headers.get('authorization'));
  if (supplied === null || !safeEqual(supplied, expected)) {
    return new Response('Authentication required.', {
      status: 401,
      headers: { ...noStore, 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
    });
  }

  // Returning nothing lets the request continue to the static files.
  return undefined;
}
