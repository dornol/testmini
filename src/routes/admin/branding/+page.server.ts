import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { appConfig } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { saveFile, deleteFile } from '$lib/server/storage';
import { randomUUID } from 'node:crypto';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];

export const load: PageServerLoad = async () => {
	let config = null;
	try {
		config = await db.query.appConfig.findFirst();
	} catch {
		// table may not exist yet
	}
	return { config };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const appName = (formData.get('appName') as string)?.trim();
		const logoFile = formData.get('logo') as File | null;
		const faviconFile = formData.get('favicon') as File | null;
		const removeLogo = formData.get('removeLogo') === 'true';
		const removeFavicon = formData.get('removeFavicon') === 'true';

		if (!appName) {
			return fail(400, { error: 'App name is required' });
		}

		let existing = null;
		try {
			existing = await db.query.appConfig.findFirst();
		} catch {
			// table may not exist yet
		}

		let logoUrl = existing?.logoUrl ?? null;
		let faviconUrl = existing?.faviconUrl ?? null;

		// Handle logo upload
		if (removeLogo) {
			if (logoUrl) {
				const key = logoUrl.replace('/api/branding/', '');
				await deleteFile(key);
			}
			logoUrl = null;
		} else if (logoFile && logoFile.size > 0) {
			if (logoFile.size > MAX_IMAGE_SIZE) {
				return fail(400, { error: 'Logo file too large (max 2MB)' });
			}
			if (!ALLOWED_IMAGE_TYPES.includes(logoFile.type)) {
				return fail(400, { error: 'Invalid logo file type' });
			}
			// Delete old logo
			if (logoUrl) {
				const key = logoUrl.replace('/api/branding/', '');
				await deleteFile(key);
			}
			const ext = logoFile.name.split('.').pop() || 'png';
			const objectKey = `branding/${randomUUID()}.${ext}`;
			const buffer = Buffer.from(await logoFile.arrayBuffer());
			await saveFile(objectKey, buffer);
			logoUrl = `/api/branding/${objectKey}`;
		}

		// Handle favicon upload
		if (removeFavicon) {
			if (faviconUrl) {
				const key = faviconUrl.replace('/api/branding/', '');
				await deleteFile(key);
			}
			faviconUrl = null;
		} else if (faviconFile && faviconFile.size > 0) {
			if (faviconFile.size > MAX_IMAGE_SIZE) {
				return fail(400, { error: 'Favicon file too large (max 2MB)' });
			}
			if (!ALLOWED_IMAGE_TYPES.includes(faviconFile.type)) {
				return fail(400, { error: 'Invalid favicon file type' });
			}
			// Delete old favicon
			if (faviconUrl) {
				const key = faviconUrl.replace('/api/branding/', '');
				await deleteFile(key);
			}
			const ext = faviconFile.name.split('.').pop() || 'png';
			const objectKey = `branding/${randomUUID()}.${ext}`;
			const buffer = Buffer.from(await faviconFile.arrayBuffer());
			await saveFile(objectKey, buffer);
			faviconUrl = `/api/branding/${objectKey}`;
		}

		if (existing) {
			await db.update(appConfig).set({ appName, logoUrl, faviconUrl }).where(eq(appConfig.id, existing.id));
		} else {
			await db.insert(appConfig).values({ appName, logoUrl, faviconUrl });
		}

		return { success: true };
	}
};
