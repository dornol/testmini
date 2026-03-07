import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin } from 'better-auth/plugins';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';

if (!env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not set');
if (!env.ORIGIN) throw new Error('ORIGIN is not set');

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true, signUp: { enabled: false } },
	plugins: [
		admin(),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
