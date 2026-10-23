# Sparkling on every platform

Sparkling is one web app (`src/app.html`, served by the Cloudflare Worker). Every platform runs that same app:

| Platform | How | Build |
|---|---|---|
| Web / PWA (Android Chrome, iOS Safari, macOS Safari & Chrome, desktop) | `src/pwa.js` serves the manifest, service worker (offline shell), icons, iOS splash screens, `/pf.css` and `/pf.js` | `python3 platforms/web/build.py` (sources in `platforms/web/`) |
| iPhone / iPad | Install the PWA: Safari > Share > Add to Home Screen. Runs standalone with the Liquid Glass theme | none |
| Android | Capacitor shell in `platforms/android`, loads the hosted app | GitHub Actions `Android (debug APK)` |
| iOS (Simulator) | Capacitor shell in `platforms/ios` | GitHub Actions `iOS (unsigned Simulator app)` |
| macOS | Electron window in `platforms/mac` (hidden inset title bar) | GitHub Actions `macOS (unsigned .app / .dmg)` |

## Platform layer (`platforms/web`)

- `pf.css`: desktop layout (centered app column + left rail from 1024px), offline badge, and the **Liquid Glass** theme. Glass turns on for iOS, iPadOS and macOS (detected from the user agent and platform before first paint) and can be forced with `?glass=1` / `?glass=0`. It keeps the warm oat/sage palette and direction B type and only changes materials: frosted nav bar, floating glass tab capsule with a refracting rim and specular highlight, a lens-like pill, glass sheets and buttons. `prefers-reduced-transparency` falls back to solid surfaces; `prefers-reduced-motion` drops the springs.
- `pf.js`: desktop rail, install button (`beforeinstallprompt`), offline state, service worker registration, a Chromium-only displacement lens for the tab pill.
- `sw.js`: network-first app shell with an offline fallback, cache-first platform assets, stale-while-revalidate fonts. `/api/` is never cached.
- `render.py` / `native_assets.py`: draw icons, splash screens and native launcher icons from the Sparkling mark.
- `shots.py`: screenshots at 390x844 (iOS), 1440x900 (macOS), 412x915 (Android), 1280/1440 desktop.

## Installing on a real device

- **Android**: download the APK artifact, allow installs from your browser/files app, open it. Debug-signed; not for the Play Store.
- **iPhone / iPad**: use the PWA (Add to Home Screen). Installing the native iOS build on a real device needs code signing: either an Apple Developer Program membership or a Mac with Xcode and a free Apple ID (7-day provisioning). The CI build is an unsigned Simulator app only.
- **macOS**: the `.dmg` is unsigned and not notarized. First launch: right-click Sparkling.app > Open (or System Settings > Privacy & Security > Open Anyway).

All shells load `https://sparkling-dev.q1f0730.workers.dev`; change `server.url` in `capacitor.config.json` and `URL_HOME` in `mac/main.js` for another deployment.
