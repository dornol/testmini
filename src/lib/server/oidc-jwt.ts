/**
 * OIDC ID Token verification using RS256/RS384/RS512 via Node.js crypto.
 *
 * Fetches JWKS from the provider's jwks_uri, caches keys for 1 hour,
 * verifies the JWT signature and standard claims (iss, aud, exp, iat).
 */

import { createVerify } from 'crypto';
import { childLogger } from './logger';

const log = childLogger('oidc-jwt');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JwkRsa {
	kty: 'RSA';
	use?: string;
	alg?: string;
	kid?: string;
	n: string; // base64url-encoded modulus
	e: string; // base64url-encoded exponent
}

interface JwksResponse {
	keys: JwkRsa[];
}

export interface IdTokenClaims {
	iss: string;
	sub: string;
	aud: string | string[];
	exp: number;
	iat: number;
	email?: string;
	name?: string;
	[key: string]: unknown;
}

export interface VerifyResult {
	verified: boolean;
	claims: IdTokenClaims | null;
	/** Set when verification was skipped or failed but we still parsed the payload. */
	warning?: string;
}

// ---------------------------------------------------------------------------
// JWKS cache
// ---------------------------------------------------------------------------

interface JwksCacheEntry {
	keys: JwkRsa[];
	expiresAt: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms
const JWKS_FETCH_TIMEOUT = 10_000; // 10 seconds

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/** Decode a base64url string to a Buffer. */
function base64urlToBuffer(b64url: string): Buffer {
	// Pad to a multiple of 4, then convert base64url → base64
	const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
	const pad = (4 - (padded.length % 4)) % 4;
	return Buffer.from(padded + '='.repeat(pad), 'base64');
}

/** Parse the three dot-separated parts of a JWT without verifying. */
function parseJwtParts(token: string): { header: Record<string, unknown>; payload: IdTokenClaims; rawSigningInput: string; signature: Buffer } | null {
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	try {
		const header = JSON.parse(base64urlToBuffer(parts[0]).toString('utf8'));
		const payload = JSON.parse(base64urlToBuffer(parts[1]).toString('utf8')) as IdTokenClaims;
		const rawSigningInput = `${parts[0]}.${parts[1]}`;
		const signature = base64urlToBuffer(parts[2]);
		return { header, payload, rawSigningInput, signature };
	} catch {
		return null;
	}
}

/**
 * Convert a JWK RSA public key to a PEM-encoded SubjectPublicKeyInfo string
 * that Node.js crypto can consume directly.
 *
 * We build the DER manually: SubjectPublicKeyInfo wraps RSAPublicKey.
 *   RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
 *   SubjectPublicKeyInfo ::= SEQUENCE { algorithm AlgorithmIdentifier, subjectPublicKey BIT STRING }
 */
function jwkToPem(jwk: JwkRsa): string {
	const modulus = base64urlToBuffer(jwk.n);
	const exponent = base64urlToBuffer(jwk.e);

	// Encode a non-negative ASN.1 INTEGER: prepend 0x00 if high bit is set.
	function encodeInteger(buf: Buffer): Buffer {
		const needsPad = buf[0] & 0x80;
		const value = needsPad ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
		return Buffer.concat([
			Buffer.from([0x02]),
			encodeLengthBytes(value.length),
			value
		]);
	}

	function encodeLengthBytes(len: number): Buffer {
		if (len < 128) return Buffer.from([len]);
		if (len < 256) return Buffer.from([0x81, len]);
		return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
	}

	function encodeSequence(content: Buffer): Buffer {
		return Buffer.concat([
			Buffer.from([0x30]),
			encodeLengthBytes(content.length),
			content
		]);
	}

	// RSAPublicKey SEQUENCE { modulus, exponent }
	const rsaPublicKey = encodeSequence(
		Buffer.concat([encodeInteger(modulus), encodeInteger(exponent)])
	);

	// OID for rsaEncryption: 1.2.840.113549.1.1.1
	const rsaOid = Buffer.from([
		0x30, 0x0d,                                          // SEQUENCE (13 bytes)
		0x06, 0x09,                                          // OID (9 bytes)
		0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // 1.2.840.113549.1.1.1
		0x05, 0x00                                           // NULL
	]);

	// BIT STRING wrapping RSAPublicKey (prepend 0x00 for "no unused bits")
	const bitStringContent = Buffer.concat([Buffer.from([0x00]), rsaPublicKey]);
	const bitString = Buffer.concat([
		Buffer.from([0x03]),
		encodeLengthBytes(bitStringContent.length),
		bitStringContent
	]);

	// SubjectPublicKeyInfo SEQUENCE { OID, BIT STRING }
	const spki = encodeSequence(Buffer.concat([rsaOid, bitString]));

	const b64 = spki.toString('base64').match(/.{1,64}/g)!.join('\n');
	return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----\n`;
}

/** Map a JWT alg header to a Node.js crypto hash algorithm name. */
function algToHashName(alg: string): string | null {
	switch (alg) {
		case 'RS256': return 'sha256';
		case 'RS384': return 'sha384';
		case 'RS512': return 'sha512';
		default: return null;
	}
}

// ---------------------------------------------------------------------------
// JWKS fetching with cache
// ---------------------------------------------------------------------------

async function fetchJwks(jwksUri: string): Promise<JwkRsa[]> {
	const cached = jwksCache.get(jwksUri);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.keys;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT);
	try {
		const res = await fetch(jwksUri, { signal: controller.signal });
		if (!res.ok) {
			throw new Error(`JWKS fetch failed with status ${res.status}`);
		}
		const body = (await res.json()) as JwksResponse;
		const keys = (body.keys ?? []).filter((k): k is JwkRsa => k.kty === 'RSA');
		jwksCache.set(jwksUri, { keys, expiresAt: Date.now() + JWKS_CACHE_TTL });
		return keys;
	} finally {
		clearTimeout(timeout);
	}
}

// ---------------------------------------------------------------------------
// Claim validation
// ---------------------------------------------------------------------------

interface ClaimValidationOptions {
	/** Expected issuer (`iss`). */
	issuer: string;
	/** Expected audience (`aud`) — typically the client_id. */
	audience: string;
	/** Maximum allowed clock skew in seconds (default: 60). */
	clockSkewSeconds?: number;
}

function validateClaims(claims: IdTokenClaims, opts: ClaimValidationOptions): string | null {
	const skew = (opts.clockSkewSeconds ?? 60) * 1000;
	const now = Date.now();

	if (claims.iss !== opts.issuer) {
		return `iss mismatch: expected "${opts.issuer}", got "${claims.iss}"`;
	}

	const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
	if (!audiences.includes(opts.audience)) {
		return `aud mismatch: "${opts.audience}" not in ${JSON.stringify(audiences)}`;
	}

	if (typeof claims.exp !== 'number' || now > claims.exp * 1000 + skew) {
		return `Token expired (exp=${claims.exp}, now=${Math.floor(now / 1000)})`;
	}

	if (typeof claims.iat !== 'number' || claims.iat * 1000 > now + skew) {
		return `Token issued in the future (iat=${claims.iat})`;
	}

	return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VerifyIdTokenOptions {
	/** The raw JWT string from the token endpoint. */
	idToken: string;
	/** JWKS URI from the provider's discovery document. */
	jwksUri: string;
	/** Expected `iss` claim — the provider's issuer URL. */
	issuer: string;
	/** Expected `aud` claim — the application's client_id. */
	audience: string;
	/** Maximum clock skew in seconds (default: 60). */
	clockSkewSeconds?: number;
}

/**
 * Verify an OIDC ID token's signature and standard claims.
 *
 * On success, returns `{ verified: true, claims }`.
 * On failure, returns `{ verified: false, claims: null, warning }` so callers
 * can decide whether to fall back to the userinfo endpoint.
 */
export async function verifyIdToken(opts: VerifyIdTokenOptions): Promise<VerifyResult> {
	const parsed = parseJwtParts(opts.idToken);
	if (!parsed) {
		return { verified: false, claims: null, warning: 'Failed to parse JWT structure' };
	}

	const { header, payload, rawSigningInput, signature } = parsed;
	const alg = (header.alg as string) ?? '';
	const hashName = algToHashName(alg);

	if (!hashName) {
		// Only RS* algorithms are supported; return the unverified payload with a warning.
		return {
			verified: false,
			claims: payload,
			warning: `Unsupported JWT algorithm "${alg}" — signature not verified`
		};
	}

	// Attempt JWKS fetch
	let keys: JwkRsa[];
	try {
		keys = await fetchJwks(opts.jwksUri);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		log.warn({ err: { message: msg }, jwksUri: opts.jwksUri }, 'JWKS fetch error');
		return {
			verified: false,
			claims: payload,
			warning: `JWKS unavailable: ${msg}`
		};
	}

	// Select key by kid if present
	const kid = header.kid as string | undefined;
	const candidates = kid ? keys.filter((k) => k.kid === kid) : keys;

	if (candidates.length === 0) {
		// kid not found — try all RSA keys (some providers omit kid)
		if (keys.length === 0) {
			return {
				verified: false,
				claims: payload,
				warning: `No RSA keys found in JWKS${kid ? ` for kid="${kid}"` : ''}`
			};
		}
		candidates.push(...keys);
	}

	// Try each candidate key
	for (const jwk of candidates) {
		let pem: string;
		try {
			pem = jwkToPem(jwk);
		} catch (e) {
			log.warn({ err: e instanceof Error ? { message: e.message } : e, kid: jwk.kid }, 'JWK to PEM conversion failed');
			continue;
		}

		try {
			const verifier = createVerify(hashName);
			verifier.update(rawSigningInput);
			const valid = verifier.verify(pem, signature);
			if (!valid) continue;
		} catch (e) {
			log.warn({ err: e instanceof Error ? { message: e.message } : e, kid: jwk.kid }, 'Signature verification error');
			continue;
		}

		// Signature valid — now validate claims
		const claimError = validateClaims(payload, {
			issuer: opts.issuer,
			audience: opts.audience,
			clockSkewSeconds: opts.clockSkewSeconds
		});

		if (claimError) {
			return { verified: false, claims: null, warning: `Claim validation failed: ${claimError}` };
		}

		return { verified: true, claims: payload };
	}

	return {
		verified: false,
		claims: payload,
		warning: 'No JWKS key produced a valid signature'
	};
}

/**
 * Parse an ID token payload WITHOUT verifying the signature.
 * Useful only as a last-resort fallback when JWKS is unavailable.
 */
export function parseIdTokenPayload(idToken: string): IdTokenClaims | null {
	const parsed = parseJwtParts(idToken);
	return parsed?.payload ?? null;
}
