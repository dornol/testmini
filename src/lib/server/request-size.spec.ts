import { describe, expect, it } from 'vitest';
import { assertContentLengthUnderLimit, parseContentLengthHeader } from './request-size';

function requestWithContentLength(value?: string): Request {
	return new Request('http://localhost/api/test', {
		method: 'POST',
		headers: value === undefined ? {} : { 'content-length': value },
		body: 'ok'
	});
}

describe('request-size', () => {
	describe('parseContentLengthHeader', () => {
		it('should return null when the header is absent', () => {
			expect(parseContentLengthHeader(requestWithContentLength())).toBeNull();
		});

		it('should parse valid content length values', () => {
			expect(parseContentLengthHeader(requestWithContentLength('42'))).toBe(42);
		});

		it.each(['', ' ', 'abc', '-1', '1.5', 'Infinity', '9007199254740992'])(
			'should reject invalid content length value %s',
			(value) => {
				expect(() => parseContentLengthHeader(requestWithContentLength(value))).toThrow();
			}
		);
	});

	describe('assertContentLengthUnderLimit', () => {
		it('should reject content lengths above the limit', () => {
			expect(() => assertContentLengthUnderLimit(requestWithContentLength('11'), 10)).toThrow();
		});

		it('should allow content lengths at the limit', () => {
			expect(() => assertContentLengthUnderLimit(requestWithContentLength('10'), 10)).not.toThrow();
		});
	});
});
