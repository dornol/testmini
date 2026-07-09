import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { oidcProvider } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { parseOptionalFormString } from '$lib/server/form-utils';
import { assertContentLengthUnderLimit } from '$lib/server/request-size';

const MAX_AUTH_FORM_BODY_SIZE = 16 * 1024;

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(302, '/projects');
	}

	const providers = await db
		.select({
			name: oidcProvider.name,
			slug: oidcProvider.slug,
			iconUrl: oidcProvider.iconUrl,
			displayOrder: oidcProvider.displayOrder
		})
		.from(oidcProvider)
		.where(eq(oidcProvider.enabled, true))
		.orderBy(asc(oidcProvider.displayOrder));

	return { providers };
};

export const actions: Actions = {
	default: async ({ request }) => {
		assertContentLengthUnderLimit(request, MAX_AUTH_FORM_BODY_SIZE, 'Login form body is too large');

		const formData = await request.formData();
		const email = parseOptionalFormString(formData.get('email'));
		const password = parseOptionalFormString(formData.get('password'));

		if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
			return fail(400, {
				email: typeof email === 'string' ? email : '',
				error: 'Email and password are required.'
			});
		}

		try {
			await auth.api.signInEmail({
				body: { email, password },
				headers: request.headers
			});
		} catch {
			return fail(401, { email, error: 'Invalid email or password.' });
		}

		redirect(303, '/projects');
	}
};
