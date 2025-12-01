# CLAUDE.md

你现在扮演 [一个严格的角色]。请使用 [客观] 的语气，用 [中文] 分析以下 [内容]。在你的回答中，请避免任何主观赞美的词语。

My terminal environment is powershell in windows.
Remember: Our development should follow the spirit of Linus.
Use `npx kill-port` to clean up the port before running the project.

# Project Mew

Mew is a highly extensible, personal digital hub centered around an Instant Messaging (IM) platform. It follows a "Private Discord" metaphor, separating the core IM platform (Frontend/Backend) from business logic (Bots).

## Build & Development Commands

**Root Workspace**
- `pnpm install` - Install dependencies for all packages.
- `pnpm dev` - Start both Frontend and Backend concurrently (via `concurrently`).
- `pnpm test` - Run tests for all packages.

**Backend (`/backend`)**
- `pnpm dev` - Start development server (ts-node w/ nodemon logic).
- `pnpm test` - Run Vitest test suite.
- `pnpm build` - Compile TypeScript to `/dist`.

**Frontend (`/frontend`)**
- `pnpm dev` - Start Vite development server.
- `pnpm build` - Build for production.
- `pnpm lint` - Run ESLint.
- `pnpm test` - Run Vitest with React Testing Library.

## Architecture & Structure

**Monorepo (`pnpm`)**
- `backend/`: Express + Socket.io + MongoDB.
- `frontend/`: React + Vite + Tailwind.
- `bots/`: (Planned) Independent microservices for business logic.

**Backend Pattern**
- **Modular Feature Structure**: `src/api/{feature}/` contains Controller, Service, Model, Routes, and Validation.
- **Data Flow**: Route -> Middleware (Auth/Validation) -> Controller -> Service -> Mongoose Model.
- **Error Handling**: Custom Error classes (`NotFoundError`, `ForbiddenError`) in `utils/errors.ts` caught by global `errorHandler`.
- **Async**: Use `asyncHandler` wrapper to avoid try-catch blocks in controllers.
- **Validation**: Zod schemas in `*.validation.ts` processed by `middleware/validate.ts`.
- **Real-time**: `socket.io` events are broadcast via `gateway/events.ts` from services.

**Frontend Pattern**
- **State Management**:
  - `Zustand` (`authStore`) for client-only global state (User/Token).
  - `TanStack Query` for server state (caching, optimistic updates).
- **Styling**: Tailwind CSS.
- **Routing**: React Router v7 with data loaders (implied structure).
- **Socket**: `SocketProvider` context wraps the app; components use `useSocket` hook.
- **Custom Rendering**: Message rendering is polymorphic based on `type` (e.g., `app/x-rss-card` uses specialized components).

## Coding Standards

**General**
- **Language**: TypeScript (Strict mode).
- **Package Manager**: `pnpm`.

**Backend Guidelines**
- **Imports**: Use relative imports (e.g., `../../utils/db`).
- **Controllers**: Functional style. Do not put business logic here; delegate to Service.
- **Services**: Handle DB operations, permissions checks, and event broadcasting.
- **Models**: Mongoose schemas with strong TypeScript interfaces (`IUser extends Document`).
- **Events**: When mutating data (Create/Update/Delete), broadcast socket events (`CHANNEL_UPDATE`, etc.) from the Service layer.
- **Nested Routes**: Use `mergeParams: true` for nested routers (e.g., `servers/:serverId/channels`).

**Frontend Guidelines**
- **Imports**: Use path aliases (`@/components/...`) defined in `tsconfig.app.json`.
- **Components**: Functional components (`React.FC` or inferred types).
- **UI Components**: Place reusable, atomic components in `src/components/ui/` (Shadcn-like structure).
- **Optimistic Updates**: Use React Query `onMutate` to update UI immediately before API confirmation.
- **Mocking**: Use MSW (Mock Service Worker) for network-level mocking in tests.

## Testing Strategy

- **Runner**: Vitest (used in both frontend and backend).
- **Backend Tests**:
  - Integration tests using `supertest`.
  - Use `mongodb-memory-server` for ephemeral test databases.
  - Setup/Teardown logic in `src/test/setup.ts`.
- **Frontend Tests**:
  - Component tests using `@testing-library/react`.
  - Mock API calls using `msw` handlers (`src/mocks/handlers.ts`).
  - Mock Socket.io connections to prevent connection errors during tests.

## Key Design Decisions (Vision)

1.  **"The Hub"**: The core platform only handles message transport and storage. It does not know *what* the message is (RSS, AI thought, etc.).
2.  **Bot Ecosystem**: Business logic lives in Bots. Bots connect via Webhook (push-only) or WebSocket (interactive).
3.  **Message Schema**:
    ```json
    {
      "type": "app/x-rss-card",
      "content": "Fallback text",
      "payload": { ...JSON data for UI component... }
    }
    ```