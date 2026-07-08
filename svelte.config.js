import adapter from '@sveltejs/adapter-node';

const dev = process.env.NODE_ENV !== 'production';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		csp: {
			directives: {
				'default-src': ['self'],
				'script-src': dev ? ['self', 'unsafe-inline'] : ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'font-src': ['self'],
				'connect-src': dev
					? ['self', 'ws://localhost:5173', 'ws://127.0.0.1:5173', 'ws://home-macmini:5173']
					: ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
