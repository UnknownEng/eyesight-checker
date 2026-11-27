# Eyesight Checker

A calibrated vision screening app. It runs as a local web app and as an Android APK.

- **Distance test (each eye):** Tumbling E or the 10 Sloan letters (C D H K N O R S V Z), drawn at true angular size
  for the measured viewing distance. Uses the logMAR chart design and ETDRS letter-by-letter scoring. Results are given as
  6/x, 20/x, decimal and logMAR. It also includes a red-green (duochrome) check and an astigmatism clock dial.
- **Reading test (near, 40 cm):** real words sized by x-height in M-units. You pick the matching word from 4 choices, and
  the result is given as an N-point size (N5, N8, ...).
- Screen calibration uses a standard ID-1 card (85.60 × 53.98 mm) or a ruler.
- Everything stays on the device. Nothing is sent anywhere.

It is a screening test. It does **not** produce a glasses prescription (lens power).

**Android app:** download the APK from [UnknownEng/eyesight-checker-apk](https://github.com/UnknownEng/eyesight-checker-apk)
([direct download](https://github.com/UnknownEng/eyesight-checker-apk/releases/latest/download/EyesightChecker.apk)).

## Run locally

```
node server.js
```

Open http://localhost:5173. The server also prints a LAN address so you can open the app on a phone on the same Wi-Fi.

## Check the scoring

```
node tools/simulate.js
```

This runs thousands of simulated patients with known true acuity through the test engine and prints bias, spread and
how often the result lands within ±1 chart line.

## Build the APK

Requirements: Node, JDK 21, and the Android SDK (platform 36, build-tools 36) in `%LOCALAPPDATA%\Android\Sdk`.

```
npm install
npx cap sync android
cd android
gradlew.bat assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

After changing anything in `www/`, run `npx cap sync android` before building again.
To redraw the launcher icons and splash screen, run `powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1`.

## Install on a phone

1. Copy `app-debug.apk` to the phone (USB, Google Drive, WhatsApp to yourself, etc.).
2. Open it and allow "Install unknown apps" for the app you opened it from.
3. Alternatively, with USB debugging on: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb install -r app-debug.apk`

The debug APK is signed with a local debug key. To publish on Google Play you need a release build signed with your own
upload key (`gradlew.bat bundleRelease` plus a signing config).
