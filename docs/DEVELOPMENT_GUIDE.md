# Mew Development Guide

This is the development guide for the Mew project, a highly extensible personal digital hub centered around an Instant Messaging (IM) platform.

## Prerequisites

- [pnpm](https://pnpm.io/)
- [Node.js](https://nodejs.org/) (version specified in `package.json` engines)
- [MongoDB](https://www.mongodb.com/)
- [MinIO](https://min.io/) (for file storage, optional for initial setup)

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd mew
    ```

2.  **Install dependencies:**
    Run this command from the root directory. It will install dependencies for all workspaces (`frontend`, `backend`, `bots`).
    ```bash
    pnpm install
    ```

3.  **Setup Environment Variables:**
    Navigate to the `backend` directory, copy the example environment file, and fill in the required values (e.g., database connection string).
    ```bash
    cd backend
    cp .env.example .env
    # Open .env and edit the variables
    ```

## Running the Development Servers

To start both the frontend and backend development servers simultaneously, run the following command from the **root directory**:

```bash
pnpm dev
```

This command uses `concurrently` to execute:
- `pnpm --filter frontend dev` (starts the Vite dev server)
- `pnpm --filter backend dev` (starts the Nodemon + ts-node dev server)

Once started, you should be able to access:
- **Frontend:** `http://localhost:5173` (or another port specified by Vite)
- **Backend:** `http://localhost:3000`

### Running Services Individually

If you need to run only one part of the application, you can use pnpm's `--filter` flag:

- **To start only the backend:**
  ```bash
  pnpm --filter backend dev
  ```

- **To start only the frontend:**
  ```bash
  pnpm --filter frontend dev
  ```
