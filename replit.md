# BrightSideReporter

## Overview

Reddit engagement scanner and reply generator for BrightSideReporter. Scans 15 target subreddits, analyzes posts with Claude, and drafts authentic responses in Troy's voice.

## Stack

- **Runtime**: Node.js (plain CommonJS, no TypeScript)
- **Framework**: Express 5
- **HTTP Client**: node-fetch@2
- **AI**: Anthropic Claude API (claude-opus-4-5)
- **Package manager**: pnpm

## Structure

- `artifacts/brightsidereporter/index.js` — Main application file (Express server + all API routes)
- `artifacts/brightsidereporter/public/index.html` — Frontend UI (single-page, vanilla HTML/CSS/JS)
- `artifacts/brightsidereporter/package.json` — Dependencies (express, node-fetch)
- `artifacts/api-server/` — Legacy copy (original API artifact, now superseded by brightsidereporter)

## API Endpoints

- `GET /api/subreddits` — List all monitored subreddits
- `GET /api/scan` — Scan all subreddits and get AI-analyzed recommendations
- `POST /api/reply` — Generate a Reddit reply for a given post

## Environment Variables

- `PORT` — Server port (set to 25348 for the web artifact)
- `ANTHROPIC_API_KEY` — Required for Claude AI features (scan analysis and reply generation)
