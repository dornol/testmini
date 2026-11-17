/** Map Superforms paths to actual controls, including nested step fields. */
export function testCaseFieldTarget(path: string): string | undefined {
	const step = /^steps\[(\d+)\]\.(action|expected)$/.exec(path);
	if (step) return `step-${step[2]}-${step[1]}`;
	if (/^(title|priority|precondition|expectedResult|automationKey)$/.test(path)) return path;
	return undefined;
}
