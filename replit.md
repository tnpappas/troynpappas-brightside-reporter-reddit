# BrightSideReporter

## Overview

Reddit engagement scanner and reply generator for BrightSideReporter. Scans 15 target subreddits, analyzes posts with Claude, and drafts authentic responses.

## Stack

- **Runtime**: Node.js
- **Framework**: Express 5
- **HTTP Client**: node-fetch@2
- **AI**: Anthropic Claude API (claude-opus-4-5)
- **Package manager**: pnpm

## Structure

- `artifacts/api-server/index.js` — Main application file (all server code)
- `artifacts/api-server/public/` — Static files directory
- `artifacts/api-server/package.json` — Dependencies (express, node-fetch)

## API Endpoints

- `GET /api/subreddits` — List all monitored subreddits
- `GET /api/scan` — Scan all subreddits and get AI-analyzed recommendations
- `POST /api/reply` — Generate a Reddit reply for a given post

## Environment Variables

- `PORT` — Server port (default: 3000, set to 8080 in production)
- `ANTHROPIC_API_KEY` — Required for Claude AI features (scan analysis and reply generation)

## Key Commands

- `node artifacts/api-server/index.js` — Run the server
- `pnpm install --filter @workspace/api-server` — Install dependencies
