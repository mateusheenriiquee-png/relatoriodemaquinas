# Migration Guide - Import Updates

## Files that need import path updates

The following files have imports that reference the old folder structure and need to be updated:

### 1. **src/api/server.js**
```javascript
// OLD:
const sheetsRoutes = require("./routes/sheets");
const adminRoutes = require("./routes/admin");

// NEW: (same - relative paths work within src/api/)
const adminRoutes = require("./routes/admin");
```
✓ No changes needed - uses relative paths within same folder

### 2. **src/backend/index.mjs**
```javascript
// OLD:
import { processWebhookPost } from "./webhook.mjs";
import { getDocument, updateDocument } from "./firestore-rest.mjs";

// NEW: (same - relative paths work)
```
✓ No changes needed - uses relative paths within same folder

### 3. **src/frontend/public/js/app.js**
```javascript
// OLD:
import { db } from "./config/firebase.js";
import { authManager } from "./auth.js";

// NEW: (same - relative paths work)
```
✓ No changes needed - uses relative paths within same folder

### 4. **scripts/cf-pages-deploy.js**
If this file contains hardcoded paths, update from:
```javascript
// OLD:
const publicDir = './public';

// NEW:
const publicDir = './src/frontend/public';
```

### 5. **scripts/backfill-tecnicoKey.mjs**
If this file imports from api/src:
```javascript
// OLD:
import admin from 'firebase-admin';

// NEW: (same - firebase-admin is npm package)
```
✓ No changes needed - uses npm packages

### 6. **Imports from src/shared/**

If any files import shared utilities:
```javascript
// OLD:
const { normalizeText } = require("../normalize");

// NEW:
const { normalizeText } = require("../../../shared/normalize");
// OR (from API level)
const { normalizeText } = require("../shared/normalize");
```

## Frontend HTML files

All HTML files in `src/frontend/` already use relative paths and don't need changes.

## Configuration Files Updated

✓ `config/firebase.json` - hosting.public updated to `src/frontend/public`
✓ `config/wrangler.toml` - main updated to `src/backend/index.mjs`, assets.directory to `src/frontend/public`
✓ `package.json` - main and scripts updated to new paths

## Test the migration

1. Start API locally:
   ```bash
   npm run dev
   # Should start without errors
   ```

2. Test frontend:
   ```bash
   npm run pages:dev
   # Should serve frontend without issues
   ```

3. Check imports in key files:
   ```bash
   grep -r "require.*api/src" src/
   grep -r "from.*public" src/frontend/
   # Should return no results (all paths updated)
   ```
