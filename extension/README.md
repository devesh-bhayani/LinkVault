# Save to LinkVault — Chrome extension

A lightweight Manifest V3 extension that saves links to your LinkVault library
via the `POST /api/quick-save` endpoint. Right-click a link or page, or use the
toolbar popup to save the current tab.

## Install (unpacked)

1. Open `chrome://extensions` and toggle **Developer mode** on (top right).
2. Click **Load unpacked** and select this `extension/` folder.
3. Click the LinkVault toolbar icon and set:
   - **App URL** — your deployed app (e.g. `https://linkvault.vercel.app`) or
     `http://localhost:3000` during development.
   - **API key** — must match `QUICK_SAVE_API_KEY` on the server. Leave blank
     if you didn't set one.
4. Click **Save settings**.

## Use

- **Right-click a link → "Save link to LinkVault"** — saves that link's URL.
- **Right-click the page → "Save this page to LinkVault"** — saves the current page.
- **Toolbar popup → "Save current tab now"** — saves the active tab.

The toolbar badge flashes `✓` on success or `!` on failure. The server fetches
the title/description and (if Ollama is reachable) the category automatically,
so you only ever need to send the URL.

## Notes

- No icon assets are bundled, so Chrome shows a default icon — drop PNGs in and
  add an `icons` block to `manifest.json` if you want custom branding.
- The extension stores its config in `chrome.storage.sync`, so it follows you
  across signed-in Chrome profiles.
