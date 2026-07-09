import { db } from '$lib/server/db';
import { auditLog } from '$lib/server/db/schema';
import { childLogger } from './logger';
import { redactSecrets } from './secret-redaction';

const log = childLogger('audit');

export interface LogAuditParams {
	userId?: string;
	action: string;
	entityType?: string;
	entityId?: string;
	projectId?: number;
	metadata?: Record<string, unknown>;
	ipAddress?: string;
}

/**
 * Fire-and-forget audit log helper.
 * Call without awaiting from request handlers — errors are silently caught.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
	try {
		await db.insert(auditLog).values({
			userId: params.userId ?? null,
			action: params.action,
			entityType: params.entityType ?? null,
			entityId: params.entityId ?? null,
			projectId: params.projectId ?? null,
			metadata: params.metadata ?? null,
			ipAddress: params.ipAddress ?? null
		});
	} catch (err) {
		// Silently ignore audit logging failures — they must not break the main flow
		log.error({ err: sanitizeAuditError(err) }, 'Failed to write audit log');
	}
}

function sanitizeAuditError(err: unknown): { message: string; name?: string } | string {
	if (err instanceof Error) {
		return {
			name: err.name,
			message: redactSecrets(err.message)
		};
	}

	return redactSecrets(String(err));
}
