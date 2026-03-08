import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseParameter, testCaseDataSet } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';

function parseCsvLine(line: string): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"' && line[i + 1] === '"') {
				current += '"';
				i++;
			} else if (ch === '"') {
				inQuotes = false;
			} else {
				current += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ',') {
				result.push(current.trim());
				current = '';
			} else {
				current += ch;
			}
		}
	}
	result.push(current.trim());
	return result;
}

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) return notFound('Test case not found');

	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file) return badRequest('CSV file is required');

	const text = await file.text();
	const lines = text.split(/\r?\n/).filter((l) => l.trim());

	if (lines.length < 2) return badRequest('CSV must have a header row and at least one data row');

	const headers = parseCsvLine(lines[0]);

	// Ensure parameters exist (create if not)
	const existingParams = await db
		.select()
		.from(testCaseParameter)
		.where(eq(testCaseParameter.testCaseId, testCaseId))
		.orderBy(asc(testCaseParameter.orderIndex));

	const existingParamNames = new Set(existingParams.map((p) => p.name));
	let maxOrder = existingParams.length > 0 ? existingParams[existingParams.length - 1].orderIndex + 1 : 0;

	for (const header of headers) {
		if (!existingParamNames.has(header)) {
			await db.insert(testCaseParameter).values({
				testCaseId,
				name: header,
				orderIndex: maxOrder++
			});
			existingParamNames.add(header);
		}
	}

	// Get max data set order
	const existingDs = await db
		.select({ orderIndex: testCaseDataSet.orderIndex })
		.from(testCaseDataSet)
		.where(eq(testCaseDataSet.testCaseId, testCaseId))
		.orderBy(asc(testCaseDataSet.orderIndex));
	let dsOrder = existingDs.length > 0 ? existingDs[existingDs.length - 1].orderIndex + 1 : 0;

	// Parse data rows
	const dataSets: { testCaseId: number; name: string | null; values: Record<string, string>; orderIndex: number }[] = [];
	for (let i = 1; i < lines.length; i++) {
		const cells = parseCsvLine(lines[i]);
		const values: Record<string, string> = {};
		for (let j = 0; j < headers.length; j++) {
			values[headers[j]] = cells[j] ?? '';
		}
		dataSets.push({
			testCaseId,
			name: null,
			values,
			orderIndex: dsOrder++
		});
	}

	if (dataSets.length > 0) {
		await db.insert(testCaseDataSet).values(dataSets);
	}

	return json({ imported: dataSets.length });
});
