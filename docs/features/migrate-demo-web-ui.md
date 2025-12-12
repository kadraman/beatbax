---
title: Migrate Demo to apps/web-ui (React + Bootstrap + Dark Retro Theme)
status: proposed
authors: ["kadraman"]
created: 2025-12-12
issue: "https://github.com/kadraman/beatbax/issues/8"
---

## Summary

Migrate the existing `demo/` web application into the monorepo `apps/web-ui/` package and modernize it as a React application built with Vite, using Bootstrap for UI primitives and a custom dark retro theme. The app should support developer hot-reload during local development and be deployable to a Linux server via GitHub Actions.

## Motivation

- Align the demo with the monorepo layout under `apps/web-ui/`.
- Provide a modern, maintainable React codebase with fast builds (Vite).
- Use Bootstrap to speed UI development while keeping styling flexible.
- Ship a dark retro theme that matches BeatBax aesthetics for a better developer and demo experience.
- Enable continuous deployment to a Linux host using GitHub Actions for simple demos and staging.

## Goals

- Move demo sources into `apps/web-ui`.
- Replace the current demo scaffolding with a Vite + React setup.
- Use Bootstrap 5 as the UI foundation and create a small theme layer (CSS variables + utilities) implementing a dark retro look.
- Provide a small CI workflow that builds the app and deploys static assets to a Linux server using SSH/rsync.
- Document required secrets and a minimal Nginx config for hosting the app.

## Proposed Directory Structure

```
apps/web-ui/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   │   ├── bootstrap-custom.scss
│   │   └── retro-dark.scss
│   ├── components/
│   └── songs/
└── README.md
```

Keep `apps/web-ui` as `private: true` in `package.json` (not published to npm).

## Tech Choices

- Build: Vite (fast HMR, modern ESM dev server)
- Framework: React + TypeScript
- UI primitives: Bootstrap 5 (Sass-based customization)
- Styling: Bootstrap variables + small custom SCSS for retro dark theme
- Static host: any Linux server serving static files (Nginx recommended)
- CI/CD: GitHub Actions building the production bundle and deploying via SSH/rsync

## Migration Steps

1. Create `apps/web-ui/` and initialize a Vite React TypeScript project.
   - `npm create vite@latest apps/web-ui -- --template react-ts`
2. Move or reimplement the demo pages to React components under `src/components` and `src/songs`.
3. Add `@beatbax/engine` as a workspace dependency in `apps/web-ui/package.json`:

```json
"dependencies": {
  "@beatbax/engine": "workspace:^",
  "react": "^18",
  "react-dom": "^18",
  "bootstrap": "^5.3"
}
```

4. Add Bootstrap and custom SCSS pipeline:
   - Import Bootstrap's SCSS in `bootstrap-custom.scss` and override variables for colors, fonts, and spacing.
   - Add `retro-dark.scss` to define CSS variables and utilities for the retro look (scanlines, glow, monospace font, etc.).
   - Configure Vite to handle SCSS imports.

5. Implement a small theme module exposing variables and helper classes (e.g., `.bbx-retro`, `.bbx-panel`).

6. Rewire demo logic to import parsing, playback, and export helpers from `@beatbax/engine` (workspace reference).

7. Add `scripts` to `apps/web-ui/package.json`:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
}
```

## Dark Retro Theme Notes

- Base colors: near-black background, neon accent colors (cyan, magenta, lime)
- Typography: monospace for editor areas, UI-friendly sans for controls
- Effects: subtle scanline background, neon glow for active elements, rounded pixel-like borders
- Accessibility: ensure contrast ratios and keyboard focus styles remain usable

Example minimal SCSS (concept):

```scss
$body-bg: #0b0b0d;
$accent: #29f0d3;
@import 'bootstrap/scss/bootstrap';

body.bbx-retro {
  background: linear-gradient(#070707, #0b0b0d);
  color: #cfeee9;
}

.bbx-panel {
  background: rgba(12,12,14,0.6);
  border: 1px solid rgba(255,255,255,0.04);
  box-shadow: 0 4px 18px rgba(0,0,0,0.6);
}
```

## GitHub Actions: Build + Deploy (example)

This example builds the Vite production bundle and deploys `dist/` to a Linux server using SSH and `rsync`. Store the following secrets in the repository: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `SSH_PRIVATE_KEY`.

Create `.github/workflows/deploy-web-ui.yml` with the following contents:

```yaml
name: Build and Deploy Web UI

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build web-ui
        working-directory: apps/web-ui
        run: npm run build

      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.8.1
        with:
          ssh-private-key: ${{ secrets.SSH_PRIVATE_KEY }}

      - name: Deploy to server
        env:
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_PATH: ${{ secrets.DEPLOY_PATH }}
        run: |
          rsync -avz --delete apps/web-ui/dist/ ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}

```

Notes:
- `SSH_PRIVATE_KEY` must be an RSA/ED25519 private key added to the target server's `authorized_keys` for `DEPLOY_USER`.
- For atomic deploys, rsync to a `releases/` folder and symlink `current` to the latest release.

## Minimal Nginx Config Example

Place a server block that serves the `DEPLOY_PATH` and routes unknown paths to `index.html` (client-side routing):

```nginx
server {
  listen 80;
  server_name example.com;
  root /var/www/beatbax/current; # DEPLOY_PATH/current

  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location ~* \.(?:css|js|png|jpg|jpeg|gif|svg|ico|woff2?)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
```

## Testing & Local Development

- Run `npm ci` at repository root to install workspace dependencies.
- From the monorepo root, start the app for development with: `npm run dev -w beatbax-web-ui` (see root scripts convention in monorepo plan).
- Build locally and preview: `npm run build -w beatbax-web-ui` then `npm run preview -w beatbax-web-ui`.

## Checklist

- [ ] Create `apps/web-ui` Vite React project
- [ ] Move demo code and convert to React components
- [ ] Integrate `@beatbax/engine` workspace dependency
- [ ] Implement Bootstrap + dark retro theme SCSS
- [ ] Add example GitHub Actions workflow and document required secrets
- [ ] Add `apps/web-ui/README.md` with run/build/deploy instructions
- [ ] Verify deployment to a staging Linux server

## Risks & Mitigations

- Risk: Theme drift from engine UI expectations — Mitigation: keep UI components small, avoid tightly coupling engine to UI.
- Risk: Broken imports after moving files — Mitigation: prefer workspace import `@beatbax/engine` and update TypeScript `paths`/references.
- Risk: Secrets misuse — Mitigation: document required secrets and restrict deploy key to deploy-only user.

## Success Criteria

- Demo app exists at `apps/web-ui` and runs via `npm run dev -w beatbax-web-ui`.
- The app imports and uses `@beatbax/engine` from the monorepo workspace without relative path hacks.
- Dark retro theme is implemented and available as an opt-in CSS class.
- Production builds deploy successfully via GitHub Actions to a Linux host.

---

If you'd like, I can scaffold the `apps/web-ui` Vite project, add the initial SCSS theme files, and create the GitHub Actions workflow file next.
