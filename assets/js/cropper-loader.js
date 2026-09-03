/**
 * Lazy loader untuk Cropper.js library
 * Memuat CSS dan JS hanya saat dibutuhkan untuk pertama kali
 */

let cropperLoadPromise = null;
let CropperClass = null;

/**
 * Load Cropper.js library secara lazy
 * @returns {Promise<Cropper>} Cropper class constructor
 */
export async function loadCropper() {
    // Return cached promise if already loading
    if (cropperLoadPromise) {
        return cropperLoadPromise;
    }

    // Return cached class if already loaded
    if (CropperClass) {
        return CropperClass;
    }

    cropperLoadPromise = new Promise((resolve, reject) => {
        console.log('[cropper] ⏳ Loading Cropper.js library...');

        // 1. Load CSS
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.1/dist/cropper.min.css';
        document.head.appendChild(cssLink);

        // 2. Load JS
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.1/dist/cropper.min.js';
        script.async = true;

        script.onload = () => {
            // Cropper is now available on window object
            if (window.Cropper) {
                CropperClass = window.Cropper;
                console.log('[cropper] ✓ Cropper.js loaded successfully');
                resolve(CropperClass);
            } else {
                console.error('[cropper] ✗ Cropper.js loaded but Cropper class not found on window');
                reject(new Error('Cropper class not found on window'));
            }
        };

        script.onerror = (err) => {
            console.error('[cropper] ✗ Failed to load Cropper.js:', err);
            reject(new Error('Failed to load Cropper.js library'));
        };

        document.head.appendChild(script);
    });

    return cropperLoadPromise;
}
