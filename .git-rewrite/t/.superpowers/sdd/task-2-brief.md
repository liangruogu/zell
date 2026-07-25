### Task 2: Relax CSP for AI provider API calls

**Files:**
- Modify: `app/src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: none
- Produces: `connect-src` CSP directive allows fetch to external AI provider URLs

- [ ] **Step 1: Update CSP in tauri.conf.json**

Change the `security.csp` line from:
```
"csp": "default-src 'self'; img-src * data: blob:; style-src 'self' 'unsafe-inline'"
```
To:
```
"csp": "default-src 'self'; img-src * data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' http://* https://*"
```

- [ ] **Step 2: Verify syntax**

```bash
cd app && node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'))" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/tauri.conf.json
git commit -m "fix: relax CSP connect-src for AI provider API calls"
```

---


