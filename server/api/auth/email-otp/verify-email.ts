import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import * as z from 'zod';

const checkOtpSchema = z.object({
    email: z.string('(サーバー)メールアドレスを入力してください').email('(サーバー)有効なメールアドレスを入力してください'),
    // type: z.enum(['sign-in', 'email-verification', 'forget-password'], '(サーバー)OTPタイプが不正です'),
    otp: z.string('(サーバー)OTPコードを入力してください').min(6, 'OTPは6文字以上です'),
});

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const result = checkOtpSchema.safeParse(body);

        if (!result.success) {
            throw createError({
                statusCode: 422,
                message: 'Validation Error',
            });
        }

        const validated = result.data;
        const { headers } = event;

        // OTP確認API呼び出し
        const data = await auth.api.verifyEmailOTP({
            body: validated,
            headers,
        });

        return data;
    } catch (e: unknown) {
        if (e instanceof Error) {
            console.error('OTP確認エラー:', e);
            throw createError({ statusCode: 400, message: 'OTP確認に失敗しました' });
        }
        throw createError({ statusCode: 500, message: 'Internal Server Error' });
    }
});