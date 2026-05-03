# Android native configuration

After running `npx @react-native-community/cli init dayplan`, edit these files:

## 1. `android/app/src/main/AndroidManifest.xml`

Inside `<manifest>`, add notification permission:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />
```

Inside `<application>`, find your `<activity>` for `.MainActivity` and add the deep link intent filter:

```xml
<activity
    android:name=".MainActivity"
    android:launchMode="singleTask"   <!-- IMPORTANT for deep links -->
    android:exported="true"
    ...>
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>

    <!-- Deep link for Discord OAuth callback -->
    <intent-filter android:autoVerify="false">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="dayplan" />
    </intent-filter>
</activity>
```

## 2. `android/app/build.gradle`

Inside `defaultConfig`, set the application ID and ensure minSdk is 21+:

```gradle
defaultConfig {
    applicationId "com.dayplan.app"
    minSdkVersion 21
    targetSdkVersion 34
    ...
}
```

## 3. Notification icon

Place a small white icon at `android/app/src/main/res/drawable/ic_notification.png` (24×24 dp).
You can generate one at https://romannurik.github.io/AndroidAssetStudio/icons-notification.html

## 4. Allow HTTP for development (debug only)

Create `android/app/src/debug/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
    </domain-config>
</network-security-config>
```

Then in `android/app/src/debug/AndroidManifest.xml` (create if missing):

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:networkSecurityConfig="@xml/network_security_config"
        tools:replace="android:networkSecurityConfig"
        xmlns:tools="http://schemas.android.com/tools" />
</manifest>
```

## 5. After all changes

```bash
cd android && ./gradlew clean && cd ..
npm run android
```

The first build is slow (5-10 min). Subsequent builds are fast.
