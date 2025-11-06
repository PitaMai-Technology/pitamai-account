<script setup lang="ts">
import { authClient } from '~/composable/auth-client';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  banned?: boolean;
  banReason?: string;
  banExpires?: string;
  createdAt: string;
  emailVerified?: boolean;
}

interface ListUsersResponse {
  users: User[];
  total: number;
  limit?: number;
  offset?: number;
}

interface Session {
  token: string;
  userAgent?: string;
  createdAt: string;
}

const toast = useToast();
const isLoading = ref(false);
const users = ref<User[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const searchQuery = ref('');
const searchField = ref<'email' | 'name'>('email');
const selectedUser = ref<User | null>(null);
const isCreateUserModalOpen = ref(false);
const isEditUserModalOpen = ref(false);
const isSetPasswordModalOpen = ref(false);
const isSessionsModalOpen = ref(false);

// フォームデータ
const newUser = ref({
  name: '',
  email: '',
  password: '',
  role: 'user' as 'user' | 'admin',
});

const editUserData = ref({
  name: '',
  email: '',
  role: '' as string,
});

const passwordData = ref({
  newPassword: '',
});

const userSessions = ref<Session[]>([]);

// ユーザー一覧を取得
async function fetchUsers() {
  isLoading.value = true;
  try {
    const { data, error } = await authClient.admin.listUsers({
      query: {
        searchValue: searchQuery.value || undefined,
        searchField: searchField.value,
        searchOperator: 'contains',
        limit: pageSize.value,
        offset: (currentPage.value - 1) * pageSize.value,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      },
    });

    if (error) {
      throw error;
    }

    if (data) {
      const response = data as ListUsersResponse;
      users.value = response.users;
      total.value = response.total;
    }
  } catch (err) {
    console.error('Failed to fetch users:', err);
    toast.add({
      title: 'エラー',
      description: 'ユーザーの取得に失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

// ユーザー作成
async function createUser() {
  isLoading.value = true;
  try {
    const { error } = await authClient.admin.createUser({
      email: newUser.value.email,
      password: newUser.value.password,
      name: newUser.value.name,
      role: newUser.value.role as 'user' | 'admin',
    });

    if (error) {
      throw error;
    }

    toast.add({
      title: '成功',
      description: 'ユーザーを作成しました',
      color: 'success',
    });

    isCreateUserModalOpen.value = false;
    newUser.value = { name: '', email: '', password: '', role: 'user' };
    await fetchUsers();
  } catch (err) {
    console.error('Failed to create user:', err);
    toast.add({
      title: 'エラー',
      description: 'ユーザーの作成に失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

// ユーザー編集
async function updateUser() {
  if (!selectedUser.value) return;

  isLoading.value = true;
  try {
    const { error } = await authClient.admin.updateUser({
      userId: selectedUser.value.id,
      data: {
        name: editUserData.value.name,
        email: editUserData.value.email,
      },
    });

    if (error) {
      throw error;
    }

    // ロールの変更
    if (editUserData.value.role !== selectedUser.value.role) {
      await authClient.admin.setRole({
        userId: selectedUser.value.id,
        role: editUserData.value.role as 'user' | 'admin',
      });
    }

    toast.add({
      title: '成功',
      description: 'ユーザー情報を更新しました',
      color: 'success',
    });

    isEditUserModalOpen.value = false;
    selectedUser.value = null;
    await fetchUsers();
  } catch (err) {
    console.error('Failed to update user:', err);
    toast.add({
      title: 'エラー',
      description: 'ユーザーの更新に失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

// パスワード設定
async function setUserPassword() {
  if (!selectedUser.value) return;

  isLoading.value = true;
  try {
    const { error } = await authClient.admin.setUserPassword({
      userId: selectedUser.value.id,
      newPassword: passwordData.value.newPassword,
    });

    if (error) {
      throw error;
    }

    toast.add({
      title: '成功',
      description: 'パスワードを設定しました',
      color: 'success',
    });

    isSetPasswordModalOpen.value = false;
    selectedUser.value = null;
    passwordData.value = { newPassword: '' };
  } catch (err) {
    console.error('Failed to set password:', err);
    toast.add({
      title: 'エラー',
      description: 'パスワードの設定に失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

// ユーザーをBAN
async function banUser(user: User) {
  if (!confirm(`${user.name} (${user.email}) をBANしますか?`)) return;

  isLoading.value = true;
  try {
    const { error } = await authClient.admin.banUser({
      userId: user.id,
      banReason: '管理者によるBANです',
    });

    if (error) {
      throw error;
    }

    toast.add({
      title: '成功',
      description: 'ユーザーをBANしました',
      color: 'success',
    });

    await fetchUsers();
  } catch (err) {
    console.error('Failed to ban user:', err);
    toast.add({
      title: 'エラー',
      description: 'ユーザーのBANに失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

// ユーザーのBAN解除
async function unbanUser(user: User) {
  if (!confirm(`${user.name} (${user.email}) のBANを解除しますか?`)) return;

  isLoading.value = true;
  try {
    const { error } = await authClient.admin.unbanUser({
      userId: user.id,
    });

    if (error) {
      throw error;
    }

    toast.add({
      title: '成功',
      description: 'BANを解除しました',
      color: 'success',
    });

    await fetchUsers();
  } catch (err) {
    console.error('Failed to unban user:', err);
    toast.add({
      title: 'エラー',
      description: 'BANの解除に失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

// ユーザー削除
async function removeUser(user: User) {
  if (
    !confirm(
      `${user.name} (${user.email}) を完全に削除しますか?この操作は元に戻せません。`
    )
  )
    return;

  isLoading.value = true;
  try {
    const { error } = await authClient.admin.removeUser({
      userId: user.id,
    });

    if (error) {
      throw error;
    }

    toast.add({
      title: '成功',
      description: 'ユーザーを削除しました',
      color: 'success',
    });

    await fetchUsers();
  } catch (err) {
    console.error('Failed to remove user:', err);
    toast.add({
      title: 'エラー',
      description: 'ユーザーの削除に失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

// セッション一覧取得
async function fetchUserSessions(user: User) {
  selectedUser.value = user;
  isLoading.value = true;
  try {
    const { data, error } = await authClient.admin.listUserSessions({
      userId: user.id,
    });

    if (error) {
      throw error;
    }

    const sessions = (data as any)?.sessions || [];
    userSessions.value = Array.isArray(sessions) ? sessions : [];
    isSessionsModalOpen.value = true;
  } catch (err) {
    console.error('Failed to fetch sessions:', err);
    toast.add({
      title: 'エラー',
      description: 'セッションの取得に失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

// セッション取り消し
async function revokeSession(sessionToken: string) {
  isLoading.value = true;
  try {
    const { error } = await authClient.admin.revokeUserSession({
      sessionToken,
    });

    if (error) {
      throw error;
    }

    toast.add({
      title: '成功',
      description: 'セッションを取り消しました',
      color: 'success',
    });

    if (selectedUser.value) {
      await fetchUserSessions(selectedUser.value);
    }
  } catch (err) {
    console.error('Failed to revoke session:', err);
    toast.add({
      title: 'エラー',
      description: 'セッションの取り消しに失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

// 全セッション取り消し
async function revokeAllSessions(user: User) {
  if (!confirm(`${user.name} の全てのセッションを取り消しますか?`)) return;

  isLoading.value = true;
  try {
    const { error } = await authClient.admin.revokeUserSessions({
      userId: user.id,
    });

    if (error) {
      throw error;
    }

    toast.add({
      title: '成功',
      description: '全てのセッションを取り消しました',
      color: 'success',
    });

    if (selectedUser.value?.id === user.id) {
      await fetchUserSessions(user);
    }
  } catch (err) {
    console.error('Failed to revoke all sessions:', err);
    toast.add({
      title: 'エラー',
      description: '全セッションの取り消しに失敗しました',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

// 編集モーダルを開く
function openEditModal(user: User) {
  selectedUser.value = user;
  editUserData.value = {
    name: user.name,
    email: user.email,
    role: user.role,
  };
  isEditUserModalOpen.value = true;
}

// パスワード設定モーダルを開く
function openPasswordModal(user: User) {
  selectedUser.value = user;
  passwordData.value = { newPassword: '' };
  isSetPasswordModalOpen.value = true;
}

// 検索実行
function handleSearch() {
  currentPage.value = 1;
  fetchUsers();
}

// ページ変更
function handlePageChange(page: number) {
  currentPage.value = page;
  fetchUsers();
}

// 初期化
onMounted(() => {
  fetchUsers();
});

const totalPages = computed(() => Math.ceil(total.value / pageSize.value));
</script>

<template>
  <div>
    <h1>ユーザー管理画面</h1>
    <p>システムのユーザーを管理します</p>

    <div>
      <div>
        <select v-model="searchField">
          <option value="email">メールアドレス</option>
          <option value="name">名前</option>
        </select>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="検索..."
          @keyup.enter="handleSearch"
        />
        <button :disabled="isLoading" @click="handleSearch">検索</button>
      </div>
      <button @click="isCreateUserModalOpen = true">新規ユーザー作成</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>ユーザー</th>
          <th>ロール</th>
          <th>ステータス</th>
          <th>登録日</th>
          <th>アクション</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="isLoading">
          <td colspan="5">読み込み中...</td>
        </tr>
        <tr v-else-if="users.length === 0">
          <td colspan="5">ユーザーが見つかりません</td>
        </tr>
        <tr v-for="user in users" v-else :key="user.id">
          <td>
            <div>{{ user.name }}</div>
            <div>{{ user.email }}</div>
          </td>
          <td>{{ user.role }}</td>
          <td>
            <span v-if="user.banned">BAN</span>
            <span v-else-if="user.emailVerified">認証済み</span>
            <span v-else>未認証</span>
          </td>
          <td>{{ new Date(user.createdAt).toLocaleDateString('ja-JP') }}</td>
          <td>
            <button @click="openEditModal(user)">編集</button>
            <button @click="openPasswordModal(user)">パスワード設定</button>
            <button @click="fetchUserSessions(user)">セッション管理</button>
            <button @click="revokeAllSessions(user)"
              >全セッション取り消し</button
            >
            <button v-if="user.banned" @click="unbanUser(user)">BAN解除</button>
            <button v-else @click="banUser(user)">BAN</button>
            <button @click="removeUser(user)">削除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="totalPages > 1">
      <div>
        全 {{ total }} 件中 {{ (currentPage - 1) * pageSize + 1 }} -
        {{ Math.min(currentPage * pageSize, total) }} 件を表示
      </div>
      <div>
        <button
          v-for="page in totalPages"
          :key="page"
          :disabled="currentPage === page"
          @click="handlePageChange(page)"
        >
          {{ page }}
        </button>
      </div>
    </div>

    <!-- 新規ユーザー作成モーダル -->
    <div>
      <div>
        <div>
          <h2>新規ユーザー作成</h2>
          <button @click="isCreateUserModalOpen = false">×</button>
        </div>
        <div>
          <label>名前</label>
          <input v-model="newUser.name" type="text" placeholder="山田太郎" />

          <label>メールアドレス</label>
          <input
            v-model="newUser.email"
            type="email"
            placeholder="user@example.com"
          />

          <label>パスワード</label>
          <input
            v-model="newUser.password"
            type="password"
            placeholder="••••••••"
          />

          <label>ロール</label>
          <select v-model="newUser.role">
            <option value="user">ユーザー</option>
            <option value="admin">管理者</option>
          </select>
        </div>
        <div>
          <button @click="isCreateUserModalOpen = false">キャンセル</button>
          <button :disabled="isLoading" @click="createUser">作成</button>
        </div>
      </div>
    </div>

    <!-- ユーザー編集モーダル -->
    <div>
      <div>
        <div>
          <h2>ユーザー編集</h2>
          <button @click="isEditUserModalOpen = false">×</button>
        </div>
        <div>
          <label>名前</label>
          <input v-model="editUserData.name" type="text" />

          <label>メールアドレス</label>
          <input v-model="editUserData.email" type="email" />

          <label>ロール</label>
          <select v-model="editUserData.role">
            <option value="user">ユーザー</option>
            <option value="admin">管理者</option>
          </select>
        </div>
        <div>
          <button @click="isEditUserModalOpen = false">キャンセル</button>
          <button :disabled="isLoading" @click="handleUpdateUser">
            更新
          </button>
        </div>
      </div>
    </div>

    <!-- パスワード設定モーダル -->
    <div>
      <div>
        <div>
          <h2>パスワード設定</h2>
          <button @click="isSetPasswordModalOpen = false">×</button>
        </div>
        <div>
          <label>新しいパスワード</label>
          <input
            v-model="passwordData.newPassword"
            type="password"
            placeholder="••••••••"
          />
        </div>
        <div>
          <button @click="isSetPasswordModalOpen = false">キャンセル</button>
          <button :disabled="isLoading" @click="handleSetUserPassword">
            設定
          </button>
        </div>
      </div>
    </div>

    <!-- セッション管理モーダル -->
    <div>
      <div>
        <div>
          <h2>セッション管理</h2>
          <button @click="isSessionsModalOpen = false">×</button>
        </div>
        <div>
          <div v-if="userSessions.length === 0">
            アクティブなセッションがありません
          </div>
          <div v-for="session in userSessions" v-else :key="session.token">
            <div>
              <div>{{ session.userAgent || '不明なデバイス' }}</div>
              <div>
                作成日:
                {{ new Date(session.createdAt).toLocaleString('ja-JP') }}
              </div>
            </div>
            <button
              :disabled="isLoading"
              @click="handleRevokeSession(session.token)"
            >
              取り消し
            </button>
          </div>
        </div>
        <button @click="isSessionsModalOpen = false">閉じる</button>
      </div>
    </div>
  </div>
</template>
