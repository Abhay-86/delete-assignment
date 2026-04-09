# Setup Guide

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
- pnpm 9+ (`npm install -g pnpm` if not installed)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start both services (backend + dashboard)
pnpm dev
```

This starts:
- **Data Engine** (backend) at `http://localhost:3001` — API server for data processing
- **Dashboard** (frontend) at `http://localhost:5173` — React dashboard UI

## Verify Setup

1. Backend health check: `curl http://localhost:3001/api/health`
   - Should return `{ "status": "ok", ... }`

2. Dashboard: Open `http://localhost:5173` in your browser
   - Should show the dashboard shell with navigation

## Project Structure

```
operation-clean-room/
├── packages/
│   ├── data-engine/     # Backend: Express + TypeScript
│   │   ├── src/
│   │   │   ├── ingestion/       # Data loaders (boilerplate provided)
│   │   │   ├── reconciliation/  # YOUR WORK: matching & reconciliation
│   │   │   ├── metrics/         # YOUR WORK: metric calculations
│   │   │   ├── health/          # YOUR WORK: health scoring
│   │   │   ├── scenarios/       # YOUR WORK: scenario modeling
│   │   │   └── routes/          # YOUR WORK: API endpoints
│   │   └── __tests__/           # Failing tests to fix
│   └── dashboard/       # Frontend: React + Vite + Tailwind
│       └── src/
│           └── components/
│               └── features/    # YOUR WORK: dashboard views
├── data/                # Source data files (DO NOT MODIFY)
└── docs/                # Templates for your documentation
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode (data-engine only)
cd packages/data-engine && pnpm test:watch
```

## Data Files

All source data is in the `data/` directory. These files simulate exports from real production systems — treat them as read-only source data.

## Environment Variables

Copy `.env.example` to `.env` if you need to customize paths or ports. Defaults should work out of the box.

## Troubleshooting

- If ports are in use, check for other processes on 3001/5173
- If pnpm install fails, ensure you're on Node 20+ (`node -v`)
- The dashboard expects the backend to be running for API calls
