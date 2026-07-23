# Plugsy

Plugsy is an online platform designed to connect users to affordable services and creative portfolios, specializing in providing premium CapCut access to users through a shared account infrastructure.

## Tech Stack
- **Frontend**: React (Vite, Tailwind CSS, React Router, Framer Motion)
- **Backend**: Express.js (TypeScript server with tsx and esbuild bundle workflow)
- **Authentication**: Clerk Auth (with @clerk/clerk-react & @clerk/clerk-sdk-node)
- **Database**: Supabase (PostgreSQL with supabase-js client)
- **Payments**: Paystack

## Getting Started

### Prerequisites
Make sure you have Node.js (v18+) and npm installed.

### Setup Instructions
1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Create a `.env` file in the root directory by copying `.env.example` and filling in the required credentials:
   - `VITE_CLERK_PUBLISHABLE_KEY`: Clerk Auth frontend key.
   - `CLERK_SECRET_KEY`: Clerk Auth backend secret key.
   - `VITE_SUPABASE_URL`: Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY`: Supabase anonymous key for public access.
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key for bypassing RLS in admin functions/webhooks.
   - `PAYSTACK_SECRET_KEY`: Paystack secret key to verify payments.
   - `TELEGRAM_BOT_TOKEN`: Token for your Telegram bot to receive notifications.
   - `TELEGRAM_CHAT_ID`: Chat ID where the bot should send notifications.
   - `ONESIGNAL_APP_ID`: OneSignal Application Identifier.
   - `ONESIGNAL_REST_KEY`: OneSignal REST API Secret Key.

3. **Running the Application**:
   To start the development server:
   ```bash
   npm run dev
   ```

## Available Scripts
- `npm run dev`: Runs the development server on port 3000 using `tsx` to execute `src/server/server.ts`.
- `npm run build`: Compiles the React client application via Vite, and bundles the server script into a single CommonJS file (`dist/server.cjs`) using `esbuild`.
- `npm run start`: Launches the compiled, standalone production server (`dist/server.cjs`).
- `npm run lint`: Validates the TypeScript codebase for syntax and type correctness.
- `npm run clean`: Cleans up the `dist` build artifact folder.

## Folder Structure Overview
- `src/components/`: Reusable React components.
  - `ui/`: Standard reusable UI primitives (buttons, modals, input elements, etc.).
  - `effects/`: Interactive visual background styles and layout effects.
  - `layout/`: Navbar, Footer, and structural components.
  - `chat/`: Chat widget, Status Hub, and voice note utilities.
- `src/contexts/`: React Context Providers managing global state (Cart, Online Presence, etc.).
- `src/pages/`: Page views mapping to client-side routing.
- `src/lib/`: Library integrations (Supabase client, auth helpers, notifications, and context providers).
- `src/utils/`: Helper scripts, category configuration, and media upload utility functions.
- `src/types/`: Central TypeScript interfaces and custom definitions.
- `src/server/`: The backend Express.js server codebase.
- `scripts/`: SQL database schemas, migration triggers, and maintenance tools.
