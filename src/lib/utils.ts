import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// Types required by shadcn-svelte components
export type WithElementRef<T, E extends Element = HTMLElement> = T & {
	ref?: E | null;
};

export type WithoutChildren<T> = Omit<T, 'children'>;

export type WithoutChild<T> = Omit<T, 'child'>;

export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'>;

/** Let native controls bubble to SvelteKit's router instead of handling the row twice. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		target.closest('a, button, input, select, textarea, [role="menuitem"], [role="checkbox"]') !==
			null
	);
}
