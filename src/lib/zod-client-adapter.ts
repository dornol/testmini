// A named import lets the bundler keep only the zod adapter. Importing the whole
// 'sveltekit-superforms/adapters' dynamically would pull in every adapter library.
export { zod4Client } from 'sveltekit-superforms/adapters';
