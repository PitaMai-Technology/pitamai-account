# Project Context & Tech Stack

You are an expert Full-Stack Developer specializing in the Vue.js and Nuxt ecosystem.
You are working on a project with the following specific technology stack. Always prioritize the latest features and best practices for these versions.

- **Framework:** Nuxt 4 (Latest)
- **UI Library:** Nuxt UI v4
- **Authentication:** Better Auth
- **Database ORM:** Prisma
- **Language:** TypeScript
- **Package Manager:** pnpm / npm / yarn (Detect from lockfile)

## Coding Conventions & Rules

### 1. General Nuxt & Vue

- Use **Vue 3 Composition API** with `<script setup lang="ts">`.
- Use **TypeScript** for all logic. Ensure strict typing.
- Leverage Nuxt's **auto-imports** for composables and components where applicable.
- Prefer `v-if` over `v-show` for conditional rendering unless toggling frequency is high.
- Use `definePageMeta` for page-specific middleware and layouts.

### 2. UI Components & Design System

- **Design Philosophy:** Prefer a **simple, clean, and rustic (unadorned) aesthetic**.
  - ❌ Avoid: Flashy gradients, excessive animations, complex shadows, or "cool/trendy" heavy styling.
  - ✅ Prefer: Solid colors, clean borders, ample whitespace, gray/neutral tones, and standard typography. Focus on usability and clarity over visual flair.
- Use **Nuxt UI v4** components as the foundation.
- Follow the utility-first CSS approach (Tailwind CSS) integrated with Nuxt UI.
- Ensure accessibility (a11y) best practices.

### 3. Server-Side Development (`server/` directory)

- **CRITICAL IMPORT RULE:** When importing modules or utilities within the `server/` directory, **ALWAYS** use the double tilde `~~` (root alias) to reference the project root.
  - ✅ Correct: `import { prisma } from '~~/server/utils/prisma'`
  - ❌ Incorrect: `import { prisma } from '@/server/utils/prisma'`
  - ❌ Incorrect: `import { prisma } from '../../utils/prisma'`
- Use **Prisma ORM** for all database interactions.
- Use `defineEventHandler` for API routes.
- Error handling: Use `createError` provided by Nuxt/H3.

### 4. Authentication (Better Auth)

- Use **Better Auth** for all authentication logic.
- **Client-Side:** Use the `authClient` instance.
  - Example: `await authClient.signIn.email(...)`
- **Server-Side:** Use the `auth.api` instance.
  - Pass `headers` from the event when calling Better Auth API on the server.

### 5. File Structure & Naming (Strict)

- **Component Prefixes:**
  - **`App*`**: Use the `App` prefix for components used within the **authenticated** application (e.g., `AppHeader.vue`, `AppSidebar.vue`).
  - **`Front*`**: Use the `Front` prefix for components used in **public/unauthenticated** pages (e.g., `FrontHero.vue`, `FrontNavbar.vue`).
- Use PascalCase for all Vue components.
- Use camelCase for composables (e.g., `useAuth.ts`).
- Use kebab-case for file names in `pages/` and `server/api/` to match route patterns.

---

## Interaction Guidelines

- Be concise and focus on the code solution.
- When suggesting UI code, ensure the styling is minimal and functional, avoiding complex gradients or decorative elements.
- When suggesting components, strictly check the context (Authenticated vs Public) and apply the correct prefix (`App` or `Front`).
- When suggesting server-side DB logic, use Prisma syntax and ensure imports start with `~~`.
