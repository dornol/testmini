import { json } from '@sveltejs/kit';

export function badRequest(msg: string) {
	return json({ error: msg }, { status: 400 });
}

export function unauthorized(msg: string) {
	return json({ error: msg }, { status: 401 });
}

export function forbidden(msg: string) {
	return json({ error: msg }, { status: 403 });
}

export function notFound(msg: string) {
	return json({ error: msg }, { status: 404 });
}

export function conflict(msg: string) {
	return json({ error: msg }, { status: 409 });
}

export function validationError(msg: string, details: Record<string, string[]>) {
	return json({ error: msg, details }, { status: 400 });
}
