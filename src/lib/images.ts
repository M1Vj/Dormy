import sharp from "sharp";

/** Maximum dimension for resized images */
const MAX_DIMENSION = 1920;
/** WebP quality (0-100) */
const WEBP_QUALITY = 80;

/**
 * Optimizes an uploaded image file:
 * 1. Resizes to at most MAX_DIMENSION on the longest side
 * 2. Converts to WebP format
 * 3. Returns an optimized Buffer and metadata
 */
export async function optimizeImage(file: File): Promise<{
  buffer: Buffer;
  contentType: string;
  extension: string;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // Only resize if larger than MAX_DIMENSION
  const needsResize = width > MAX_DIMENSION || height > MAX_DIMENSION;

  let pipeline = image;

  if (needsResize) {
    pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Convert to WebP
  const buffer = await pipeline
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  return {
    buffer,
    contentType: "image/webp",
    extension: "webp",
  };
}
