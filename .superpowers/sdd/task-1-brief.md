### Task 1: Add Rust Dependencies

**Files:**
- Modify: `app/src-tauri/Cargo.toml`

**Interfaces:**
- Produces: `reqwest` (HTTP client), `scraper` (HTML parsing) available to all subsequent Rust tasks

- [ ] **Step 1: Add `reqwest` and `scraper` to Cargo.toml**

```toml
reqwest = { version = "0.12", features = ["rustls-tls"], default-features = false }
scraper = "0.21"
```

Add after `uuid` dependency line in `Cargo.toml`.

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path app/src-tauri/Cargo.toml`
Expected: `Finished dev profile ...` (no errors)

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock
git commit -m "chore: add reqwest and scraper dependencies"
```
