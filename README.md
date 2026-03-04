# Muslim Hub — مسلم هاب

A full-featured Islamic Progressive Web App (PWA).

## Features
- 🕌 Prayer Times — auto-calculated by GPS, 5 calculation methods
- 🔔 Adhan — 8 reciters, offline caching, background playback
- 📖 Quran — full text, translations, audio, bookmarks
- 🧭 Qibla — live compass with fallback manual guide
- 📿 Dhikr & Tasbih — counter, morning/evening adhkar, du'a
- 📚 Hadith — Bukhari, Muslim, Nawawi 40
- 🌤️ Weather — 7-day forecast integrated into home
- 🕋 99 Names of Allah
- 📅 Hijri Calendar
- 💧 Wudu Guide (step-by-step)
- ⚙️ Settings — theme, notifications, adhan voice

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `muslim-hub`)
2. Upload all files in this folder to the repository root
3. Go to **Settings → Pages**
4. Set Source to **Deploy from branch**, select `main`, folder `/root`
5. Click **Save** — your app will be live at:
   `https://YOUR-USERNAME.github.io/muslim-hub/`

## Files
```
index.html      ← Main app (single file PWA)
sw.js           ← Service Worker (offline support + background adhan)
manifest.json   ← PWA manifest (install to home screen)
icons/
  icon-192.png  ← App icon 192×192
  icon-512.png  ← App icon 512×512
README.md       ← This file
```

## Install on Phone
Once deployed, open the URL in Chrome/Safari and tap **"Add to Home Screen"**.
The app works fully offline after first load.

## Notes
- Adhan plays in background via Service Worker — no need to keep app open
- For iOS: open in Safari and use Share → Add to Home Screen
- Location permission required for prayer times and Qibla
