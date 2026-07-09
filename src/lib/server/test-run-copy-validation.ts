import { badRequest } from './errors';
import { parseJsonBody } from './auth-utils';
import { validateRequestBody } from './id-list-validation';

const MAX_TEST_RUN_NAME_LENGTH = 200;

export async function validateTestRunCopyName(
	request: Request,
	defaultName: string
): Promise<string | Response> {
	if (request.body === null) {
		return defaultName;
	}

	const bodyOrError = validateRequestBody(await parseJsonBody(request));
	if (bodyOrError instanceof Response) return bodyOrError;

	const rawName = bodyOrError.name;
	if (rawName == null) return defaultName;
	if (typeof rawName !== 'string') {
		return badRequest('name must be a string');
	}

	const name = rawName.trim();
	if (!name) return defaultName;
	if (name.length > MAX_TEST_RUN_NAME_LENGTH) {
		return badRequest(`name must be ${MAX_TEST_RUN_NAME_LENGTH} characters or less`);
	}
	return name;
}
