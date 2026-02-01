# Developer Guide

## Recommended IDE Setup

### VS Code (Recommended)

The best IDE for TypeScript/React development with excellent Spicetify support.

**Essential Extensions:**

- **ESLint** (`dbaeumer.vscode-eslint`) — Linting
- **Prettier** (`esbenp.prettier-vscode`) — Code formatting
- **TypeScript Importer** (`pmneo.tsimporter`) — Auto-import management
- **Auto Rename Tag** (`formulahendry.auto-rename-tag`) — JSX tag renaming
- **Error Lens** (`usernamehw.errorlens`) — Inline error display

**Nice to have:**

- **GitLens** (`eamodio.gitlens`) — Git blame/history
- **TODO Highlight** (`wayou.vscode-todo-highlight`) — Highlight TODOs
- **Path Intellisense** (`christian-kohler.path-intellisense`) — Path autocomplete

**Recommended settings** (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.codeActionsOnSave": {
    "source.organizeImports": "explicit"
  }
}
```

### WebStorm/IntelliJ

Also excellent — TypeScript support is built-in. Enable:

- File Watchers for auto-compilation
- Prettier plugin for formatting

### Neovim

Use with `typescript-language-server` and `nvim-lspconfig`.

## Project Architecture

```
listening-stats/
├── src/
│   ├── app.tsx              # Extension entry point (background tracker)
│   ├── types.ts             # TypeScript interfaces
│   ├── global.d.ts          # Spicetify type declarations
│   ├── app/                  # CustomApp UI (React)
│   │   ├── index.tsx        # Main stats page component
│   │   ├── styles.ts        # CSS injection helper
│   │   ├── styles.css       # All styles
│   │   ├── icons.ts         # SVG icon definitions
│   │   └── utils.ts         # UI utility functions
│   └── services/            # Core business logic
│       ├── storage.ts       # IndexedDB wrapper (idb library)
│       ├── tracker.ts       # Play event tracking
│       ├── stats.ts         # Statistics calculation
│       ├── spotify-api.ts   # Spotify Web API integration
│       └── updater.ts       # GitHub release checker
├── dist/                    # Build output
├── manifest.json            # Spicetify CustomApp manifest
├── package.json
└── tsconfig.json
```

### How It Works

**Two-Part Architecture:**

1. **Extension (`listening-stats.js`)** — Runs in background
   - Listens to `Spicetify.Player` events (`songchange`, `onplaypause`)
   - Tracks play duration accurately (handles pause/resume)
   - Saves play events to IndexedDB
   - Runs background enrichment (audio features, genres)

2. **CustomApp (`index.js`)** — The dashboard UI
   - React-based single-page app
   - Calculates stats from IndexedDB on-demand
   - Communicates with extension via `localStorage` events
   - Shows top tracks/artists/albums, activity chart, etc.

**Data Flow:**

```
Spotify Player Events
        ↓
   tracker.ts (captures play sessions)
        ↓
   storage.ts (IndexedDB)
        ↓
   stats.ts (aggregates data)
        ↓
   index.tsx (renders UI)
```

### Key Files Explained

| File | Purpose |
|------|---------||
| `src/app.tsx` | Extension bootstrap — waits for Spicetify APIs, starts tracker |
| `src/services/tracker.ts` | Core tracking logic — handles song changes, pause/resume, session recovery |
| `src/services/storage.ts` | IndexedDB operations using `idb` library |
| `src/services/stats.ts` | Aggregates play events into statistics (top tracks, hourly distribution, etc.) |
| `src/services/spotify-api.ts` | Fetches audio features & genres with rate limit handling |
| `src/app/index.tsx` | Main React component — state management, renders all UI sections |
| `src/types.ts` | TypeScript interfaces for `PlayEvent`, `ListeningStats`, `AudioFeatures` |
| `src/global.d.ts` | Type declarations for Spicetify globals |

### Spicetify APIs Used

```typescript
// Player events
Spicetify.Player.addEventListener('songchange', callback);
Spicetify.Player.addEventListener('onplaypause', callback);
Spicetify.Player.data       // Current track info
Spicetify.Player.isPlaying() // Play state

// Navigation
Spicetify.Platform.History.push('/track/xxx');

// Web API calls (uses user's auth token)
Spicetify.CosmosAsync.get('https://api.spotify.com/v1/...');

// Library
Spicetify.Platform.LibraryAPI.add({ uris: [...] });
Spicetify.Platform.LibraryAPI.contains(...uris);

// Notifications
Spicetify.showNotification('Message');

// Internal audio analysis (no rate limits!)
Spicetify.getAudioData(trackUri);
```

## Development Commands

```bash
# Install dependencies
npm install

# Build once (extension + app)
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Build and deploy to Spicetify
npm run deploy

# Undeploy (remove from Spicetify)
npm run undeploy

# Type checking
npm run typecheck

# Just apply changes (after manual copy)
spicetify apply
```

### Build System

Uses **esbuild** for fast bundling:

- `build:ext` — Bundles `src/app.tsx` → `dist/listening-stats.js` (extension)
- `build:app` — Bundles `src/app/index.tsx` → `dist/index.js` (CustomApp)
- `prebuild` — Auto-increments patch version in `package.json`

**esbuild config highlights:**

- `--format=iife` — Immediately-invoked function (no module system)
- `--external:react --external:react-dom` — Uses Spicetify's React
- `--loader:.css=text` — Inlines CSS as string for runtime injection
- `--target=es2020` — Modern JS features

### Development Workflow

1. **Make changes** in `src/`
2. **Run** `npm run build` or keep `npm run watch` running
3. **Apply** with `spicetify apply` (or use `npm run deploy`)
4. **Test** in Spotify — open the Listening Stats page
5. **Debug** — Open DevTools: `Ctrl+Shift+I` in Spotify

**Hot Tips:**

- Use `console.log('[ListeningStats] ...')` for debugging
- Check DevTools Console for errors
- IndexedDB data visible in DevTools → Application → IndexedDB → `listening-stats`
- `localStorage.getItem('listening-stats:lastUpdate')` shows last tracker event

## Adding New Features

### Adding a new stat:

1. Add field to `ListeningStats` interface in `types.ts`
2. Calculate it in `stats.ts` → `calculateStats()`
3. Display it in `app/index.tsx`

### Adding a new UI section:

1. Add styles to `app/styles.css`
2. Add icons to `app/icons.ts` if needed
3. Add component/section to `app/index.tsx`

### Adding new Spotify API calls:

1. Add function to `services/spotify-api.ts`
2. Handle rate limits (use `waitForApiSlot()`, `handleRateLimit()`)
3. Cache results to avoid repeated calls

## Testing

Currently manual testing. To test:

1. Deploy to Spicetify
2. Play some music
3. Check stats page updates
4. Test different time periods
5. Test edge cases: pause/resume, skip tracks, close/reopen Spotify

**Check IndexedDB:**

```javascript
// In Spotify DevTools console
const db = await indexedDB.open("listening-stats");
```

## Release Preparation

### Version Bump

Version auto-increments on each `npm run build`. For major/minor bumps, edit `package.json` manually.

Also update `src/services/updater.ts`:

```typescript
export function getCurrentVersion(): string {
  return "X.Y.Z"; // Match package.json
}
```

### Create Release

1. Ensure clean build:

   ```bash
   rm -rf dist/
   npm run build
   ```

2. Verify `dist/` contents:
   - `listening-stats.js` (extension)
   - `index.js` (CustomApp)
   - `manifest.json`

3. Create zip for release:

   ```bash
   cd dist && zip -r ../listening-stats-vX.Y.Z.zip . && cd ..
   ```

4. Create GitHub release:
   - Tag: `vX.Y.Z`
   - Title: `Listening Stats vX.Y.Z`
   - Attach: `listening-stats-vX.Y.Z.zip`
   - Write changelog

### GitHub Actions (Optional)

Automate releases with `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ["v*"]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - run: cd dist && zip -r ../dist.zip .
      - uses: softprops/action-gh-release@v1
        with:
          files: dist.zip
```
