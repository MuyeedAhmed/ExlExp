/**
 * Cross-Platform Image Capture Utility
 * =====================================
 * Supports:
 * - Web: Camera capture and file selection via HTML5 File API
 * - Mobile: expo-image-picker (camera & media library)
 */

import { Platform, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

export interface CapturedImage {
  base64: string;
  uri: string;
  fileName?: string;
  mimeType: string;
}

/**
 * Pick an image from the device's photo gallery / file manager
 */
export async function pickImageFromGallery(): Promise<CapturedImage | null> {
  if (Platform.OS === 'web') {
    return pickImageWeb(false);
  } else {
    return pickImageNative('gallery');
  }
}

/**
 * Capture an image directly using the device camera
 */
export async function captureImageWithCamera(): Promise<CapturedImage | null> {
  if (Platform.OS === 'web') {
    return pickImageWeb(true);
  } else {
    return pickImageNative('camera');
  }
}

/**
 * Downscale large images on Web via offscreen canvas
 * Keeps dimensions <= 1600px and file size under 400KB for rapid, accurate OCR
 */
function downscaleImageWeb(file: File): Promise<{ base64: string; uri: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (typeof Image === 'undefined') {
        const b64 = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
        resolve({ base64: b64, uri: rawDataUrl });
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const b64 = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
            resolve({ base64: b64, uri: rawDataUrl });
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
          const b64 = compressedDataUrl.split(',')[1];
          resolve({ base64: b64, uri: compressedDataUrl });
        } catch {
          const b64 = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
          resolve({ base64: b64, uri: rawDataUrl });
        }
      };
      img.onerror = () => {
        const b64 = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
        resolve({ base64: b64, uri: rawDataUrl });
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => resolve({ base64: '', uri: '' });
    reader.readAsDataURL(file);
  });
}

/**
 * Web file input implementation with camera support
 */
function pickImageWeb(useCamera: boolean): Promise<CapturedImage | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (useCamera) {
      input.capture = 'environment';
    }

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const { base64, uri } = await downscaleImageWeb(file);
        resolve({
          base64,
          uri,
          fileName: file.name,
          mimeType: 'image/jpeg',
        });
      } catch {
        resolve(null);
      }
    };

    input.click();
  });
}

/**
 * Native mobile image picker using expo-image-picker
 */
async function pickImageNative(mode: 'camera' | 'gallery'): Promise<CapturedImage | null> {
  try {
    let result: ImagePicker.ImagePickerResult;

    if (mode === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access in your device settings to take receipt photos.'
        );
        return null;
      }

      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.35,
        base64: true,
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Photo Library Permission Required',
          'Please allow photo library access in your device settings to select receipt images.'
        );
        return null;
      }

      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.35,
        base64: true,
      });
    }

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    let base64 = asset.base64 || '';

    // If base64 is missing, convert asset.uri using expo-file-system
    if (!base64 && asset.uri) {
      try {
        base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (fsErr) {
        console.warn('Failed to read image as base64 via FileSystem:', fsErr);
      }
    }

    return {
      base64,
      uri: asset.uri,
      fileName: asset.fileName || (mode === 'camera' ? 'camera_receipt.jpg' : 'gallery_receipt.jpg'),
      mimeType: asset.mimeType || 'image/jpeg',
    };
  } catch (err: any) {
    console.error('Native image picker error:', err);
    const msg = String(err?.message || err);
    if (msg.includes('ExpoImagePicker') || msg.includes('native module')) {
      Alert.alert(
        'App Update Required',
        'Camera access requires rebuilding the app binary. Please rebuild your APK (npx expo run:android) or run the web version in your mobile browser.'
      );
    } else {
      Alert.alert(
        'Image Error',
        'Could not access ' + (mode === 'camera' ? 'camera' : 'photos') + ': ' + msg
      );
    }
    return null;
  }
}
