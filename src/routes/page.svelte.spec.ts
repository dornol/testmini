import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('should render redirect fallback text', async () => {
		render(Page);

		const text = page.getByText('Redirecting...');
		await expect.element(text).toBeInTheDocument();
	});
});
