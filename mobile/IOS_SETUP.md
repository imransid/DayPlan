# iOS native configuration

After running `npx @react-native-community/cli init dayplan`, edit these files:

## 1. `ios/dayplan/Info.plist`

Add inside the top-level `<dict>`:

```xml
<!-- Deep link scheme for Discord OAuth callback -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.dayplan.app</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>dayplan</string>
        </array>
    </dict>
</array>

<!-- Allow HTTP for localhost in dev -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
```

## 2. Install pods

After every change to native dependencies:

```bash
cd ios && pod install && cd ..
```

If pod install fails on Apple Silicon Macs, try:
```bash
cd ios && arch -x86_64 pod install && cd ..
```

## 3. Run

```bash
npm run ios
```

Or open `ios/dayplan.xcworkspace` (NOT `.xcodeproj`) in Xcode and run from there.

## 4. Notification capability

In Xcode:
1. Open `dayplan.xcworkspace`
2. Click the project root → "dayplan" target → Signing & Capabilities
3. Click "+ Capability" → Push Notifications (only needed if you add remote push later; local notifications work without it)
4. Click "+ Capability" → Background Modes → check "Background fetch" and "Remote notifications" (optional)

## 5. Icon assets

Drop your app icons into `ios/dayplan/Images.xcassets/AppIcon.appiconset/` — Xcode complains if any size is missing.
You can generate the full icon set at https://www.appicon.co/

## 6. Bundle identifier

In Xcode → project root → "dayplan" target → General → Identity:
- Display Name: DayPlan
- Bundle Identifier: com.dayplan.app

Make sure this matches the `CFBundleURLName` from step 1.
