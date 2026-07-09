import { db } from '$lib/server/db';
import { oidcAccount } from '$lib/server/db/schema';
import { account } from '$lib/server/db/auth.schema';
import { and, count, eq } from 'drizzle-orm';

export type UnlinkOidcAccountResult =
	| { ok: true }
	| { ok: false; status: 400 | 404; error: string };

export async function unlinkOidcAccount(
	userId: string,
	accountId: number
): Promise<UnlinkOidcAccountResult> {
	return db.transaction(async (tx) => {
		const [oidcAcc] = await tx
			.select({ id: oidcAccount.id })
			.from(oidcAccount)
			.where(and(eq(oidcAccount.id, accountId), eq(oidcAccount.userId, userId)));

		if (!oidcAcc) {
			return { ok: false, status: 404, error: 'Account not found' };
		}

		const [oidcCount] = await tx
			.select({ count: count() })
			.from(oidcAccount)
			.where(eq(oidcAccount.userId, userId));

		const [passwordAccount] = await tx
			.select({ id: account.id })
			.from(account)
			.where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));

		if ((oidcCount?.count ?? 0) <= 1 && !passwordAccount) {
			return { ok: false, status: 400, error: 'Cannot unlink the last authentication method' };
		}

		await tx
			.delete(oidcAccount)
			.where(and(eq(oidcAccount.id, accountId), eq(oidcAccount.userId, userId)));

		return { ok: true };
	});
}
