import { auth } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
    try {
        // リクエストヘッダーを取得
        const { headers } = event;

        // セッション情報を取得
        const session = await auth.api.getSession({ headers });

        if (!session || !session.session) {
            // セッションがない場合はnullを返す
            return null;
        }

        // 必要に応じてsession.userなども返す
        return {
            session: session.session,
            user: session.user,
        };
    } catch (e: unknown) {
        console.error('get-session error:', e);
        // エラー時はnullを返す
        return null;
    }
});