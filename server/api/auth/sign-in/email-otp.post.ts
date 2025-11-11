import { auth } from '~~/server/utils/auth';
import { readBody, createError } from 'h3';
import * as z from 'zod';

const signInOtpSchema = z.object({
    email: z.email('(サーバー)有効なメールアドレスを入力してください'),
    otp: z.string('(サーバー)OTPコードを入力してください').min(6, 'OTPは6文字以上です'),
});

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const result = signInOtpSchema.safeParse(body);

        if (!result.success) {
            throw createError({
                statusCode: 422,
                message: 'Validation Error',
            });
        }

        const validated = result.data;
        const { headers } = event;

        // サインイン(Email OTP) API 呼び出し
        const data = await auth.api.signInEmailOTP({
            body: validated,
            headers,
        });

        return data;
    } catch (e: unknown) {
        if (e instanceof Error) {
            console.error('OTPサインインエラー:', e);
            throw createError({ statusCode: 400, message: 'OTPによるサインインに失敗しました' });
        }
        throw createError({ statusCode: 500, message: 'Internal Server Error' });
    }
});