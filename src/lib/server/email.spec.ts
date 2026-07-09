import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMail = vi.fn().mockResolvedValue({});
const mockCreateTransport = vi.fn().mockReturnValue({ sendMail: mockSendMail });

const mockEnv: Record<string, string | undefined> = {};
const mockLog = vi.hoisted(() => ({
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn()
}));

vi.mock('nodemailer', () => ({
	default: { createTransport: mockCreateTransport }
}));
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => mockLog
}));

const { sendEmail, isEmailConfigured } = await import('./email');

describe('email', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset env
		for (const key of Object.keys(mockEnv)) {
			delete mockEnv[key];
		}
	});

	it('should not send when SMTP is not configured', async () => {
		expect(isEmailConfigured()).toBe(false);
		await sendEmail({ to: 'a@b.com', subject: 'Test', text: 'Body' });
		expect(mockSendMail).not.toHaveBeenCalled();
	});

	it('should send email when SMTP is configured', async () => {
		Object.assign(mockEnv, {
			SMTP_HOST: 'smtp.example.com',
			SMTP_PORT: '587',
			SMTP_USER: 'user@example.com',
			SMTP_PASS: 'password',
			SMTP_FROM: 'noreply@example.com'
		});

		expect(isEmailConfigured()).toBe(true);
		await sendEmail({ to: 'a@b.com', subject: 'Test', text: 'Body' });
		expect(mockSendMail).toHaveBeenCalledWith({
			from: 'noreply@example.com',
			to: 'a@b.com',
			subject: 'Test',
			text: 'Body',
			html: undefined
		});
		expect(mockCreateTransport).toHaveBeenCalledWith(
			expect.objectContaining({ port: 587, secure: false })
		);
	});

	it('should use secure transport for SMTP port 465', async () => {
		Object.assign(mockEnv, {
			SMTP_HOST: 'smtp.example.com',
			SMTP_PORT: '465',
			SMTP_USER: 'user@example.com',
			SMTP_PASS: 'password'
		});

		await sendEmail({ to: 'a@b.com', subject: 'Test', text: 'Body' });

		expect(mockCreateTransport).toHaveBeenCalledWith(
			expect.objectContaining({ port: 465, secure: true })
		);
	});

	it.each(['abc', '-1', '0', '1.5', 'Infinity', '65536', '9007199254740992'])(
		'should disable email for invalid SMTP_PORT=%s',
		async (port) => {
			Object.assign(mockEnv, {
				SMTP_HOST: 'smtp.example.com',
				SMTP_PORT: port,
				SMTP_USER: 'user@example.com',
				SMTP_PASS: 'password'
			});

			await sendEmail({ to: 'a@b.com', subject: 'Test', text: 'Body' });

			expect(mockCreateTransport).not.toHaveBeenCalled();
			expect(mockSendMail).not.toHaveBeenCalled();
		}
	);

	it('should use default SMTP port when SMTP_PORT is blank', async () => {
		Object.assign(mockEnv, {
			SMTP_HOST: 'smtp.example.com',
			SMTP_PORT: ' ',
			SMTP_USER: 'user@example.com',
			SMTP_PASS: 'password'
		});

		await sendEmail({ to: 'a@b.com', subject: 'Test', text: 'Body' });

		expect(mockCreateTransport).toHaveBeenCalledWith(
			expect.objectContaining({ port: 587, secure: false })
		);
	});

	it('should not throw on sendMail error', async () => {
		Object.assign(mockEnv, {
			SMTP_HOST: 'smtp.example.com',
			SMTP_PORT: '587',
			SMTP_USER: 'user@example.com',
			SMTP_PASS: 'password'
		});
		mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

		await expect(
			sendEmail({ to: 'a@b.com', subject: 'Test', text: 'Body' })
		).resolves.toBeUndefined();
	});

	it('should redact secrets from sendMail error logs', async () => {
		const token = 'smtp-token-12345';
		Object.assign(mockEnv, {
			SMTP_HOST: 'smtp.example.com',
			SMTP_PORT: '587',
			SMTP_USER: 'user@example.com',
			SMTP_PASS: 'password'
		});
		mockSendMail.mockRejectedValueOnce(new Error(`SMTP rejected Authorization: Bearer ${token}`));

		await sendEmail({
			to: `alerts+token=${token}@example.com`,
			subject: `Build failed secret=${token}`,
			text: 'Body'
		});

		const [logMeta] = mockLog.error.mock.calls[0];

		expect(logMeta.err.message).not.toContain(token);
		expect(logMeta.to).not.toContain(token);
		expect(logMeta.subject).not.toContain(token);
		expect(logMeta.err).not.toHaveProperty('stack');
	});
});
