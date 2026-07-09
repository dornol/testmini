import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { appConfig } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { saveFile, deleteFile } from '$lib/server/storage';
import { cacheDelete } from '$lib/server/cache';
import { randomUUID } from 'node:crypto';
import { assertMultipartContentLength } from '$lib/server/multipart-limits';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_BRANDING_UPLOAD_SIZE = MAX_IMAGE_SIZE * 2;
const ALLOWED_IMAGE_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/x-icon',
	'image/vnd.microsoft.icon'
];
const IMAGE_TYPE_EXTENSIONS: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico'
};
const MAX_APP_NAME_LENGTH = 100;

function parseAppName(value: FormDataEntryValue | null): string | null {
	if (typeof value !== 'string') return null;
	const appName = value.trim();
	if (!appName || appName.length > MAX_APP_NAME_LENGTH || /[\x00-\x1F\x7F]/.test(appName)) {
		return null;
	}
	return appName;
}

function extensionForImageType(type: string): string | null {
	return IMAGE_TYPE_EXTENSIONS[type] ?? null;
}

function brandingKeyFromUrl(url: string | null): string | null {
	return url?.replace('/api/branding/', '') ?? null;
}

async function cleanupBrandingFiles(keys: string[]) {
	for (const key of keys) {
		try {
			await deleteFile(key);
		} catch {
			// Preserve the primary result; file cleanup can be retried from storage tooling.
		}
	}
}

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

		assertMultipartContentLength(request, MAX_BRANDING_UPLOAD_SIZE, {
			message: 'Branding upload must not exceed 5MB'
		});

		const formData = await request.formData();
		const appName = parseAppName(formData.get('appName'));
		const logoFile = formData.get('logo') as File | null;
		const faviconFile = formData.get('favicon') as File | null;
		const removeLogo = formData.get('removeLogo') === 'true';
		const removeFavicon = formData.get('removeFavicon') === 'true';

		if (!appName) {
			return fail(400, { error: 'App name is required (1-100 characters)' });
		}

		let existing = null;
		try {
			existing = await db.query.appConfig.findFirst();
		} catch {
			// table may not exist yet
		}

		let logoUrl = existing?.logoUrl ?? null;
		let faviconUrl = existing?.faviconUrl ?? null;
		const savedKeys: string[] = [];
		const staleKeys: string[] = [];

		// Handle logo upload
		if (removeLogo) {
			const key = brandingKeyFromUrl(logoUrl);
			if (key) staleKeys.push(key);
			logoUrl = null;
		} else if (logoFile && logoFile.size > 0) {
			if (logoFile.size > MAX_IMAGE_SIZE) {
				return fail(400, { error: 'Logo file too large (max 2MB)' });
			}
			if (!ALLOWED_IMAGE_TYPES.includes(logoFile.type)) {
				return fail(400, { error: 'Invalid logo file type' });
			}
			const ext = extensionForImageType(logoFile.type);
			if (!ext) {
				return fail(400, { error: 'Invalid logo file type' });
			}
			const oldKey = brandingKeyFromUrl(logoUrl);
			if (oldKey) staleKeys.push(oldKey);
			const objectKey = `branding/${randomUUID()}.${ext}`;
			const buffer = Buffer.from(await logoFile.arrayBuffer());
			await saveFile(objectKey, buffer);
			savedKeys.push(objectKey);
			logoUrl = `/api/branding/${objectKey}`;
		}

		// Handle favicon upload
		if (removeFavicon) {
			const key = brandingKeyFromUrl(faviconUrl);
			if (key) staleKeys.push(key);
			faviconUrl = null;
		} else if (faviconFile && faviconFile.size > 0) {
			if (faviconFile.size > MAX_IMAGE_SIZE) {
				return fail(400, { error: 'Favicon file too large (max 2MB)' });
			}
			if (!ALLOWED_IMAGE_TYPES.includes(faviconFile.type)) {
				return fail(400, { error: 'Invalid favicon file type' });
			}
			const ext = extensionForImageType(faviconFile.type);
			if (!ext) {
				return fail(400, { error: 'Invalid favicon file type' });
			}
			const oldKey = brandingKeyFromUrl(faviconUrl);
			if (oldKey) staleKeys.push(oldKey);
			const objectKey = `branding/${randomUUID()}.${ext}`;
			const buffer = Buffer.from(await faviconFile.arrayBuffer());
			await saveFile(objectKey, buffer);
			savedKeys.push(objectKey);
			faviconUrl = `/api/branding/${objectKey}`;
		}

		try {
			if (existing) {
				await db
					.update(appConfig)
					.set({ appName, logoUrl, faviconUrl })
					.where(eq(appConfig.id, existing.id));
			} else {
				await db.insert(appConfig).values({ appName, logoUrl, faviconUrl });
			}
		} catch (dbError) {
			await cleanupBrandingFiles(savedKeys);
			throw dbError;
		}

		await cleanupBrandingFiles(staleKeys);
		cacheDelete('global:branding');

		return { success: true };
	}
};
