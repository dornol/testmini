import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMail = vi.fn().mockResolvedValue({});
const mockCreateTransport = vi.fn().mockReturnValue({ sendMail: mockSendMail });

const mockEnv: Record<string, string | undefined> = {};

vi.mock('nodemailer', () => ({
	default: { createTransport: mockCreateTransport }
}));
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
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
	});

	it('should not throw on sendMail error', async () => {
		Object.assign(mockEnv, {
			SMTP_HOST: 'smtp.example.com',
			SMTP_PORT: '587',
			SMTP_USER: 'user@example.com',
			SMTP_PASS: 'password'
		});
		mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

		await expect(sendEmail({ to: 'a@b.com', subject: 'Test', text: 'Body' })).resolves.toBeUndefined();
	});
});
