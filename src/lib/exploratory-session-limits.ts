export const MAX_TITLE_LENGTH = 500;
export const MAX_TEXT_LENGTH = 10_000;
export const MAX_ENVIRONMENT_LENGTH = 255;
export const MAX_TAGS = 50;
export const MAX_TAG_LENGTH = 100;

export const MAX_NOTE_CONTENT_LENGTH = 10_000;
export const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;
export const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const SCREENSHOT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

export function isSupportedScreenshot(file: Pick<File, 'name' | 'type'>): boolean {
	const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
	return SCREENSHOT_TYPES.includes(file.type) && SCREENSHOT_EXTENSIONS.includes(extension);
}
