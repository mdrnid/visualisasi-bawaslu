import { PDFDocument, PDFName, PDFArray, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';
import zlib from 'zlib';

/**
 * Utility untuk kompresi berkas bukti penghargaan (PDF & Gambar)
 */

function hasFilter(filterObj, filterName) {
    if (!filterObj) return false;
    if (filterObj === PDFName.of(filterName)) return true;
    if (filterObj instanceof PDFArray) {
        return filterObj.asArray().some(f => f === PDFName.of(filterName));
    }
    return filterObj.toString().includes(filterName);
}

/**
 * Kompres buffer PDF dengan me-resample & me-reencode stream gambar di dalamnya
 * @param {Buffer} inputBuffer 
 * @param {Object} options 
 * @returns {Promise<Buffer>}
 */
export async function compressPdfBuffer(inputBuffer, options = {}) {
    const maxDim = options.maxDimension || 1600;
    const quality = options.quality || 70;

    try {
        const pdfDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });
        const context = pdfDoc.context;

        for (const [ref, object] of context.enumerateIndirectObjects()) {
            if (object instanceof PDFRawStream) {
                const { dict } = object;
                const subtype = dict.get(PDFName.of('Subtype'));
                if (subtype === PDFName.of('Image')) {
                    const filter = dict.get(PDFName.of('Filter'));
                    const width = dict.get(PDFName.of('Width'))?.numberValue;
                    const height = dict.get(PDFName.of('Height'))?.numberValue;

                    // Lewati gambar berukuran sangat kecil (seperti logo/ikon < 250px)
                    if (width && height && width < 250 && height < 250) continue;

                    try {
                        const rawBytes = object.getContents();
                        let compressedBuffer = null;

                        if (hasFilter(filter, 'DCTDecode')) {
                            // Gambar JPEG
                            compressedBuffer = await sharp(rawBytes)
                                .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
                                .jpeg({ quality, progressive: true, mozjpeg: true })
                                .toBuffer();
                        } else if (hasFilter(filter, 'FlateDecode') && width && height) {
                            // Stream piksel terkompresi zlib (Flate)
                            try {
                                const decompressed = zlib.unzipSync(Buffer.from(rawBytes));
                                // Coba parsing 3 kanal (RGB) atau 4 kanal (RGBA)
                                const channels = decompressed.length >= width * height * 4 ? 4 : 3;
                                compressedBuffer = await sharp(decompressed, { raw: { width, height, channels } })
                                    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
                                    .jpeg({ quality, progressive: true, mozjpeg: true })
                                    .toBuffer();
                            } catch (zErr) {
                                // Jika gagal inflate/raw, coba langsung lewat sharp
                                compressedBuffer = await sharp(rawBytes)
                                    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
                                    .jpeg({ quality, progressive: true, mozjpeg: true })
                                    .toBuffer();
                            }
                        }

                        if (compressedBuffer && compressedBuffer.length < rawBytes.length) {
                            object.contents = compressedBuffer;
                            dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
                            dict.set(PDFName.of('Length'), context.obj(compressedBuffer.length));
                        }
                    } catch (imgErr) {
                        // Abort silently jika satu stream gambar gagal di-encode
                    }
                }
            }
        }

        const finalBytes = await pdfDoc.save({ useObjectStreams: true });
        return Buffer.from(finalBytes);
    } catch (err) {
        // Fallback jika terjadi kesalahan parsing PDF
        return inputBuffer;
    }
}

/**
 * Kompres buffer gambar (JPG, PNG, WebP)
 * @param {Buffer} inputBuffer 
 * @param {Object} options 
 * @returns {Promise<Buffer>}
 */
export async function compressImageBuffer(inputBuffer, options = {}) {
    const maxDim = options.maxDimension || 1600;
    const quality = options.quality || 75;

    try {
        const metadata = await sharp(inputBuffer).metadata();
        const format = metadata.format;

        let pipeline = sharp(inputBuffer)
            .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });

        if (format === 'png') {
            pipeline = pipeline.png({ quality: quality, compressionLevel: 8 });
        } else if (format === 'webp') {
            pipeline = pipeline.webp({ quality });
        } else {
            pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
        }

        const outBuffer = await pipeline.toBuffer();
        return outBuffer.length < inputBuffer.length ? outBuffer : inputBuffer;
    } catch (err) {
        return inputBuffer;
    }
}

/**
 * Kompres berkas bukti umum (otomatis deteksi PDF vs Gambar)
 * @param {Buffer} buffer 
 * @param {string} filenameOrMime 
 * @param {Object} options 
 * @returns {Promise<Buffer>}
 */
export async function compressProofBuffer(buffer, filenameOrMime = '', options = {}) {
    if (!buffer || buffer.length === 0) return buffer;

    const identifier = filenameOrMime.toLowerCase();
    const isPdf = identifier.endsWith('.pdf') || identifier.includes('application/pdf') || buffer.slice(0, 4).toString() === '%PDF';

    if (isPdf) {
        return await compressPdfBuffer(buffer, options);
    } else {
        return await compressImageBuffer(buffer, options);
    }
}
