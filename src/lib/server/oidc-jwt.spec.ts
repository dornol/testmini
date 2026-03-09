import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { generateKeyPairSync, createSign } from 'crypto';

// Mock the logger
vi.mock('./logger', () => ({
	childLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	})
}));

// ---------------------------------------------------------------------------
// Test RSA key pair & JWT helper
// ---------------------------------------------------------------------------

const { publicKey, privateKey } = generateKeyPairSync('rsa' as never, {
	modulusLength: 2048,
	publicKeyEncoding: { type: 'spki', format: 'jwk' },
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// publicKey is a JWK object when format is 'jwk'
const rsaJwk = publicKey as unknown as { n: string; e: string; kty: string };

const TEST_KID = 'test-key-1';
const TEST_ISSUER = 'https://idp.example.com';
const TEST_AUDIENCE = 'my-client-id';
const TEST_JWKS_URI = 'https://idp.example.com/.well-known/jwks.json';

function base64url(data: string | Buffer): string {
	const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface JwtOptions {
	alg?: string;
	kid?: string;
	iss?: string;
	aud?: string | string[];
	sub?: string;
	exp?: number;
	iat?: number;
	extraClaims?: Record<string, unknown>;
	extraHeader?: Record<string, unknown>;
	/** If true, sign with an unrelated key to produce an invalid signature */
	badSignature?: boolean;
}

function createTestJwt(opts: JwtOptions = {}): string {
	const now = Math.floor(Date.now() / 1000);
	const header = {
		alg: opts.alg ?? 'RS256',
		typ: 'JWT',
		kid: opts.kid ?? TEST_KID,
		...opts.extraHeader
	};
	const payload = {
		iss: opts.iss ?? TEST_ISSUER,
		aud: opts.aud ?? TEST_AUDIENCE,
		sub: opts.sub ?? 'user-123',
		exp: opts.exp ?? now + 3600,
		iat: opts.iat ?? now,
		email: 'user@example.com',
		...opts.extraClaims
	};

	const headerB64 = base64url(JSON.stringify(header));
	const payloadB64 = base64url(JSON.stringify(payload));
	const signingInput = `${headerB64}.${payloadB64}`;

	const hashMap: Record<string, string> = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512' };
	const hashName = hashMap[opts.alg ?? 'RS256'] ?? 'sha256';

	let sigKey = privateKey as unknown as string;
	if (opts.badSignature) {
		const { privateKey: other } = generateKeyPairSync('rsa', {
			modulusLength: 2048,
			publicKeyEncoding: { type: 'spki', format: 'pem' },
			privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
		});
		sigKey = other as unknown as string;
	}

	const signer = createSign(hashName);
	signer.update(signingInput);
	const signature = signer.sign(sigKey);

	return `${signingInput}.${base64url(signature)}`;
}

function makeJwksResponse(kid: string = TEST_KID) {
	return {
		keys: [
			{
				kty: 'RSA',
				kid,
				n: rsaJwk.n,
				e: rsaJwk.e,
				use: 'sig',
				alg: 'RS256'
			}
		]
	};
}

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

let verifyIdToken: typeof import('./oidc-jwt').verifyIdToken;
let parseIdTokenPayload: typeof import('./oidc-jwt').parseIdTokenPayload;

beforeAll(async () => {
	const mod = await import('./oidc-jwt');
	verifyIdToken = mod.verifyIdToken;
	parseIdTokenPayload = mod.parseIdTokenPayload;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('oidc-jwt', () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		// Reset fetch mock before each test
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// JWT Parsing / Structure
	// -----------------------------------------------------------------------

	describe('JWT Parsing/Structure', () => {
		it('rejects malformed tokens (not 3 parts)', async () => {
			const result = await verifyIdToken({
				idToken: 'only.two',
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});
			expect(result.verified).toBe(false);
			expect(result.claims).toBeNull();
			expect(result.warning).toContain('Failed to parse JWT structure');
		});

		it('rejects single segment token', async () => {
			const result = await verifyIdToken({
				idToken: 'notavalidtoken',
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});
			expect(result.verified).toBe(false);
			expect(result.claims).toBeNull();
		});

		it('rejects tokens with invalid base64 header', async () => {
			const result = await verifyIdToken({
				idToken: '!!!invalid-base64!!!.eyJ0ZXN0IjoxfQ.sig',
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});
			expect(result.verified).toBe(false);
			expect(result.claims).toBeNull();
			expect(result.warning).toContain('Failed to parse JWT structure');
		});

		it('rejects tokens with invalid base64 payload', async () => {
			// Valid header, but payload is not valid JSON after base64 decode
			const validHeader = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
			const result = await verifyIdToken({
				idToken: `${validHeader}.!!!not-json!!!.sig`,
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});
			expect(result.verified).toBe(false);
			expect(result.claims).toBeNull();
		});

		it('parses valid JWT structure correctly via parseIdTokenPayload', () => {
			const token = createTestJwt({ sub: 'parse-test', extraClaims: { name: 'Test User' } });
			const claims = parseIdTokenPayload(token);
			expect(claims).not.toBeNull();
			expect(claims!.sub).toBe('parse-test');
			expect(claims!.name).toBe('Test User');
			expect(claims!.iss).toBe(TEST_ISSUER);
		});

		it('parseIdTokenPayload returns null for malformed token', () => {
			expect(parseIdTokenPayload('not.a.valid-json-base64')).toBeNull();
			expect(parseIdTokenPayload('single')).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// Claims Validation
	// -----------------------------------------------------------------------

	describe('Claims Validation', () => {
		function mockFetchJwks() {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				new Response(JSON.stringify(makeJwksResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);
		}

		it('rejects expired tokens (exp in the past)', async () => {
			mockFetchJwks();
			const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
			const token = createTestJwt({ exp: pastExp, iat: pastExp - 3600 });

			const result = await verifyIdToken({
				idToken: token,
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(false);
			expect(result.warning).toContain('Token expired');
		});

		it('rejects tokens issued in the future (iat in the future)', async () => {
			mockFetchJwks();
			const futureIat = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
			const token = createTestJwt({ iat: futureIat, exp: futureIat + 3600 });

			const result = await verifyIdToken({
				idToken: token,
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(false);
			expect(result.warning).toContain('Token issued in the future');
		});

		it('validates issuer matches expected', async () => {
			mockFetchJwks();
			const token = createTestJwt({ iss: 'https://wrong-issuer.com' });

			const result = await verifyIdToken({
				idToken: token,
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(false);
			expect(result.warning).toContain('iss mismatch');
		});

		it('validates audience matches expected', async () => {
			mockFetchJwks();
			const token = createTestJwt({ aud: 'wrong-audience' });

			const result = await verifyIdToken({
				idToken: token,
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(false);
			expect(result.warning).toContain('aud mismatch');
		});

		it('accepts token with audience as array containing expected value', async () => {
			mockFetchJwks();
			const token = createTestJwt({ aud: [TEST_AUDIENCE, 'other-client'] });

			const result = await verifyIdToken({
				idToken: token,
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(true);
			expect(result.claims).not.toBeNull();
		});

		it('accepts valid token within time window', async () => {
			mockFetchJwks();
			const token = createTestJwt();

			const result = await verifyIdToken({
				idToken: token,
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(true);
			expect(result.claims).not.toBeNull();
			expect(result.claims!.sub).toBe('user-123');
			expect(result.claims!.email).toBe('user@example.com');
		});

		it('accepts token within clock skew tolerance', async () => {
			mockFetchJwks();
			// Token expired 30 seconds ago, but with default 60s skew, it should pass
			const now = Math.floor(Date.now() / 1000);
			const token = createTestJwt({ exp: now - 30, iat: now - 3630 });

			const result = await verifyIdToken({
				idToken: token,
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(true);
		});

		it('rejects token outside custom clock skew', async () => {
			mockFetchJwks();
			// Token expired 30 seconds ago, with only 10s skew -> rejected
			const now = Math.floor(Date.now() / 1000);
			const token = createTestJwt({ exp: now - 30, iat: now - 3630 });

			const result = await verifyIdToken({
				idToken: token,
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE,
				clockSkewSeconds: 10
			});

			expect(result.verified).toBe(false);
			expect(result.warning).toContain('Token expired');
		});
	});

	// -----------------------------------------------------------------------
	// JWKS Caching
	// -----------------------------------------------------------------------

	describe('JWKS Caching', () => {
		it('fetches JWKS from provider URL', async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				new Response(JSON.stringify(makeJwksResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const token = createTestJwt();
			await verifyIdToken({
				idToken: token,
				jwksUri: 'https://unique-fetch-test.example.com/jwks',
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(globalThis.fetch).toHaveBeenCalledWith(
				'https://unique-fetch-test.example.com/jwks',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			);
		});

		it('caches JWKS and reuses on subsequent calls', async () => {
			const uniqueUri = 'https://cache-test.example.com/jwks';
			vi.mocked(globalThis.fetch).mockResolvedValue(
				new Response(JSON.stringify(makeJwksResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const token1 = createTestJwt();
			const token2 = createTestJwt({ sub: 'user-456' });

			await verifyIdToken({
				idToken: token1,
				jwksUri: uniqueUri,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			await verifyIdToken({
				idToken: token2,
				jwksUri: uniqueUri,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			// fetch should only be called once because of caching
			const fetchCalls = vi.mocked(globalThis.fetch).mock.calls.filter(
				(call) => call[0] === uniqueUri
			);
			expect(fetchCalls.length).toBe(1);
		});

		it('refetches after cache TTL expires', async () => {
			vi.useFakeTimers();
			const uniqueUri = 'https://ttl-test.example.com/jwks';

			vi.mocked(globalThis.fetch).mockResolvedValue(
				new Response(JSON.stringify(makeJwksResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const token = createTestJwt();

			// First call — fetches from network
			await verifyIdToken({
				idToken: token,
				jwksUri: uniqueUri,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			// Advance time past the 1-hour TTL
			vi.advanceTimersByTime(60 * 60 * 1000 + 1000);

			// Create new token with updated timestamps
			const token2 = createTestJwt();
			await verifyIdToken({
				idToken: token2,
				jwksUri: uniqueUri,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			// fetch should have been called twice for the same URI
			const fetchCalls = vi.mocked(globalThis.fetch).mock.calls.filter(
				(call) => call[0] === uniqueUri
			);
			expect(fetchCalls.length).toBe(2);
		});
	});

	// -----------------------------------------------------------------------
	// Error Handling
	// -----------------------------------------------------------------------

	describe('Error Handling', () => {
		it('returns error for network failures during JWKS fetch', async () => {
			vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

			const token = createTestJwt();
			const result = await verifyIdToken({
				idToken: token,
				jwksUri: 'https://network-fail.example.com/jwks',
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(false);
			expect(result.warning).toContain('JWKS unavailable');
			expect(result.warning).toContain('Network error');
			// Should still return parsed claims even on JWKS failure
			expect(result.claims).not.toBeNull();
			expect(result.claims!.sub).toBe('user-123');
		});

		it('returns error for non-OK HTTP responses', async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				new Response('Internal Server Error', { status: 500 })
			);

			const token = createTestJwt();
			const result = await verifyIdToken({
				idToken: token,
				jwksUri: 'https://http-fail.example.com/jwks',
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(false);
			expect(result.warning).toContain('JWKS unavailable');
			expect(result.warning).toContain('500');
		});

		it('returns error when kid not found in JWKS (empty JWKS)', async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				new Response(JSON.stringify({ keys: [] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const token = createTestJwt({ kid: 'nonexistent-kid' });
			const result = await verifyIdToken({
				idToken: token,
				jwksUri: 'https://empty-jwks.example.com/jwks',
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(false);
			expect(result.warning).toContain('No RSA keys found in JWKS');
		});

		it('returns error when kid does not match any key', async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				new Response(JSON.stringify(makeJwksResponse('different-kid')), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const token = createTestJwt({ kid: 'nonexistent-kid', badSignature: true });
			const result = await verifyIdToken({
				idToken: token,
				jwksUri: 'https://wrong-kid.example.com/jwks',
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(false);
			// Falls through to trying all keys, none match
			expect(result.warning).toContain('No JWKS key produced a valid signature');
		});

		it('returns error for unsupported algorithm', async () => {
			// Manually build a token with unsupported algorithm
			const header = base64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: TEST_KID }));
			const payload = base64url(JSON.stringify({
				iss: TEST_ISSUER,
				aud: TEST_AUDIENCE,
				sub: 'user-123',
				exp: Math.floor(Date.now() / 1000) + 3600,
				iat: Math.floor(Date.now() / 1000)
			}));
			const fakeToken = `${header}.${payload}.${base64url('fake-sig')}`;

			const result = await verifyIdToken({
				idToken: fakeToken,
				jwksUri: TEST_JWKS_URI,
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(false);
			expect(result.warning).toContain('Unsupported JWT algorithm');
			expect(result.warning).toContain('ES256');
			// Should still return parsed claims
			expect(result.claims).not.toBeNull();
		});

		it('returns error when signature does not match', async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				new Response(JSON.stringify(makeJwksResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const token = createTestJwt({ badSignature: true });
			const result = await verifyIdToken({
				idToken: token,
				jwksUri: 'https://bad-sig.example.com/jwks',
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});

			expect(result.verified).toBe(false);
			expect(result.warning).toContain('No JWKS key produced a valid signature');
		});
	});

	// -----------------------------------------------------------------------
	// Algorithm support
	// -----------------------------------------------------------------------

	describe('Algorithm support', () => {
		function mockFetchJwks() {
			vi.mocked(globalThis.fetch).mockResolvedValue(
				new Response(JSON.stringify(makeJwksResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);
		}

		it('verifies RS256 tokens', async () => {
			mockFetchJwks();
			const token = createTestJwt({ alg: 'RS256' });
			const result = await verifyIdToken({
				idToken: token,
				jwksUri: 'https://rs256.example.com/jwks',
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});
			expect(result.verified).toBe(true);
		});

		it('verifies RS384 tokens', async () => {
			mockFetchJwks();
			const token = createTestJwt({ alg: 'RS384' });
			const result = await verifyIdToken({
				idToken: token,
				jwksUri: 'https://rs384.example.com/jwks',
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});
			expect(result.verified).toBe(true);
		});

		it('verifies RS512 tokens', async () => {
			mockFetchJwks();
			const token = createTestJwt({ alg: 'RS512' });
			const result = await verifyIdToken({
				idToken: token,
				jwksUri: 'https://rs512.example.com/jwks',
				issuer: TEST_ISSUER,
				audience: TEST_AUDIENCE
			});
			expect(result.verified).toBe(true);
		});
	});
});
