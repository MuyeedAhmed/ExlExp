/**
 * Cross-Platform Image Capture Utility
 * =====================================
 * Supports:
 * - Web: Camera capture and file selection via HTML5 File API
 * - Mobile: expo-image-picker (camera & media library)
 */

import { Platform } from 'react-native';

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

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Base64 without data prefix
        const base64Data = result.includes(',') ? result.split(',')[1] : result;
        resolve({
          base64: base64Data,
          uri: result,
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };

    input.click();
  });
}

/**
 * Native mobile image picker using expo-image-picker
 */
async function pickImageNative(mode: 'camera' | 'gallery'): Promise<CapturedImage | null> {
  try {
    // Dynamic import to support environments without native build pre-installed
    // @ts-ignore
    const ImagePicker = await import('expo-image-picker');

    let result;
    if (mode === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        alert('Camera permission is required to photograph receipts.');
        return null;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert('Photo library permission is required to select receipts.');
        return null;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });
    }

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      return {
        base64: asset.base64 || '',
        uri: asset.uri,
        fileName: asset.fileName || 'receipt.jpg',
        mimeType: asset.mimeType || 'image/jpeg',
      };
    }
  } catch (err) {
    console.warn('Native image picker not available or failed:', err);
  }

  return null;
}
