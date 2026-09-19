import { createAuthClient } from 'better-auth/vue';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { passkeyClient } from '@better-auth/passkey/client';
import {
  emailOTPClient,
  organizationClient,
  adminClient,
  inferAdditionalFields,
} from 'better-auth/client/plugins';
import { ac, owner, admins, member } from '~~/server/utils/permissions';

/**
 * ブラウザーと Nuxt のルートミドルウェアから使う Better Auth クライアント。
 *
 * コンポーネントではこのインスタンスを使えば、`/api/auth/*` の URL を
 * 自分で組み立てる必要はない。
 *
 * セッションをリアクティブに読む例:
 *
 * @example
 * ```ts
 * const session = authClient.useSession()
 * const userName = computed(() => session.value.data?.user.name)
 * ```
 *
 * 管理操作を行う例:
 *
 * @example
 * ```ts
 * const { error } = await authClient.admin.setRole({
 *   userId,
 *   role: 'admins',
 * })
 *
 * if (error) {
 *   toast.add({ title: 'ロールを変更できませんでした。', color: 'error' })
 * }
 * ```
 *
 * サーバーだけで使う処理では、このクライアントではなく `auth.api` を使う。
 * プラグインを増やしたときは、サーバー側だけでなく必要な client plugin も
 * この配列へ追加する。
 */

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    // auth.ts の user.additionalFields と揃える。
    // ここにないフィールドはクライアント側の user 型へ反映されない。
    inferAdditionalFields({
      user: {
        twitterUrl: {
          type: 'string',
        },
        bio: {
          type: 'string',
        },
      },
    }),
    oauthProviderClient(),
    emailOTPClient(),

    // サーバーの passkey() と対になるクライアントプラグイン。
    // ログイン画面では signIn.passkey、設定画面では passkey.addPasskey などを使う。
    passkeyClient(),

    // permissions.ts と同じ ac/roles を渡し、画面側でも型付きで権限を確認できるようにする。
    adminClient({
      ac,
      roles: {
        owner,
        admins,
        member,
      },
    }),
    organizationClient({
      ac,
      roles: {
        owner,
        admins,
        member,
      },
    }),
  ],
});
