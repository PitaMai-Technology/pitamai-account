import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import * as z from 'zod';

const sendOtpSchema = z.object({
    email: z.email('(サーバー)有効なメールアドレスを入力してください'),
    type: z.enum(['sign-in', 'email-verification', 'forget-password'], '(サーバー)OTPタイプが不正です'),
});

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const result = sendOtpSchema.safeParse(body);

        if (!result.success) {
            throw createError({
                statusCode: 422,
                message: 'Validation Error',
            });
        }

        const validated = result.data;
        const { headers } = event;

        // OTP送信API呼び出し
        const data = await auth.api.sendVerificationOTP({
            body: validated,
            headers,
        });

        return data;
    } catch (e: unknown) {
        if (e instanceof Error) {
            console.error('OTP送信エラー:', e);
            throw createError({ statusCode: 400, message: 'OTP送信に失敗しました' });
        }
        throw createError({ statusCode: 500, message: 'Internal Server Error' });
    }
});