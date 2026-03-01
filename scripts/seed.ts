import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/auth.schema';

const DATABASE_URL = process.env.DATABASE_URL!;
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET!;
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg', schema }),
	emailAndPassword: { enabled: true },
	plugins: [admin()]
});

async function seed() {
	console.log('Creating test accounts...');

	try {
		const adminUser = await auth.api.signUpEmail({
			body: {
				name: 'Admin',
				email: 'admin@test.com',
				password: 'admin1234'
			}
		});
		console.log('Admin account created:', adminUser.user.email);
	} catch (e: any) {
		console.log('Admin account:', e.message ?? 'already exists or error');
	}

	try {
		const user = await auth.api.signUpEmail({
			body: {
				name: 'Test User',
				email: 'user@test.com',
				password: 'user1234'
			}
		});
		console.log('User account created:', user.user.email);
	} catch (e: any) {
		console.log('User account:', e.message ?? 'already exists or error');
	}

	console.log('Done!');
	await client.end();
	process.exit(0);
}

seed();
