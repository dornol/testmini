import { test as base } from '@playwright/test';

export const test = base.extend({
	storageState: './e2e/.auth-storage.json'
});

export { expect } from '@playwright/test';
