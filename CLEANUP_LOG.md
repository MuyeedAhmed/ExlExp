# Installation & Cleanup Log

This file tracks all dependencies and directories created for this project so you can easily clean them up later to free up disk space.

## Project Directory & Dependencies
- **Project Root**: `/Users/muyeedahmed/Desktop/Gitcode/ExlExp`
- **Primary Cache/Dependency Folder**: `node_modules/` in the project root (typically occupies 300MB - 600MB).
- **Lockfile**: `package-lock.json`
- **Storage Library**: `@react-native-async-storage/async-storage` (Installed locally under `node_modules/`).

## Packages Installed
1. **Expo SDK Starter**: Initialized by `create-expo-app` (dependencies: `expo`, `react`, `react-native`, `expo-status-bar`, devDependencies: `@types/react`, `typescript`).
2. **Storage**: `@react-native-async-storage/async-storage` (to be installed next).

---

## How to Clean Up and Free Up Disk Space

If you want to remove the project or temporarily clear caches, use the following commands:

### 1. Remove Node Modules (Free up ~400MB)
To delete the installed packages from the project (which you can reinstall anytime using `npm install`):
```bash
rm -rf node_modules
```

### 2. Clear Global Expo/NPM Caches (Free up ~1GB+)
NPM and Expo keep global cache folders that can accumulate space over time:
```bash
# Clear npm global cache
npm cache clean --force

# Clear Expo CLI / Metro packager caches
rm -rf ~/.expo
rm -rf ~/.metro
```

### 3. Fully Delete Project
To completely delete the project and all its files:
```bash
rm -rf /Users/muyeedahmed/Desktop/Gitcode/ExlExp
```
