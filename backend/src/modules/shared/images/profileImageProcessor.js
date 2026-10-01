const fs = require('node:fs/promises');

const MAX_INPUT_BYTES = 500_000;
const MAX_OUTPUT_BYTES = 500_000;
const MAX_DIMENSION = 4_096;
const MAX_PIXELS = 16_000_000;
const MAX_OUTPUT_DIMENSION = 512;
const WEBP_QUALITY = 82;
const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,((?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?)$/i;
const FORMAT_BY_MEDIA_TYPE = { jpeg: 'JPEG', png: 'PNG', webp: 'WEBP' };
const SIGNATURES = {
  JPEG: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  PNG: (bytes) => bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  WEBP: (bytes) => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP',
};

class ProfileImageError extends Error {
  constructor(message) {
    super(message);
    this.code = 'INVALID_PROFILE_IMAGE';
    this.status = 400;
    this.statusCode = 400;
  }
}

let magickPromise;

const loadImageMagick = () => {
  if (!magickPromise) {
    magickPromise = (async () => {
      const magick = await import('@imagemagick/magick-wasm');
      const wasmPath = require.resolve('@imagemagick/magick-wasm/magick.wasm');
      await magick.initializeImageMagick(await fs.readFile(wasmPath));
      magick.ResourceLimits.width = BigInt(MAX_DIMENSION);
      magick.ResourceLimits.height = BigInt(MAX_DIMENSION);
      magick.ResourceLimits.area = BigInt(MAX_PIXELS);
      // ImageMagick needs one internal list slot in addition to the decoded frame.
      magick.ResourceLimits.listLength = 2n;
      magick.ResourceLimits.memory = 128n * 1024n * 1024n;
      magick.ResourceLimits.maxMemoryRequest = 64n * 1024n * 1024n;
      magick.ResourceLimits.maxProfileSize = 1n * 1024n * 1024n;
      magick.ResourceLimits.disk = 0n;
      return magick;
    })();
  }
  return magickPromise;
};

const invalidImage = () => new ProfileImageError(
  'Choose a valid JPG, PNG, or WEBP image no larger than 4096×4096 pixels.',
);

const decodeDataUrl = (dataUrl) => {
  if (typeof dataUrl !== 'string' || dataUrl.length > 670_000) throw invalidImage();
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw invalidImage();
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_INPUT_BYTES) throw invalidImage();
  const expectedFormat = FORMAT_BY_MEDIA_TYPE[match[1].toLowerCase()];
  if (!SIGNATURES[expectedFormat](bytes)) throw invalidImage();
  return { bytes, expectedFormat };
};

const validateDimensions = (image) => {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) ||
      image.width < 1 || image.height < 1 ||
      image.width > MAX_DIMENSION || image.height > MAX_DIMENSION ||
      image.width * image.height > MAX_PIXELS) throw invalidImage();
};

const processProfileImage = async (dataUrl) => {
  const { bytes, expectedFormat } = decodeDataUrl(dataUrl);
  const magick = await loadImageMagick();
  try {
    const output = magick.ImageMagick.readCollection(bytes, (images) => {
      if (images.length !== 1) throw invalidImage();
      const image = images[0];
      if (image.format !== expectedFormat) throw invalidImage();
      validateDimensions(image);
      image.autoOrient();
      validateDimensions(image);
      const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(image.width, image.height));
      if (scale < 1) {
        image.resize(
          Math.max(1, Math.round(image.width * scale)),
          Math.max(1, Math.round(image.height * scale)),
        );
      }
      image.strip();
      image.quality = WEBP_QUALITY;
      return image.write(magick.MagickFormat.WebP, (encoded) => Buffer.from(encoded));
    });
    if (!output.length || output.length > MAX_OUTPUT_BYTES) throw invalidImage();
    return output;
  } catch (error) {
    if (error instanceof ProfileImageError) throw error;
    throw invalidImage();
  }
};

module.exports = { processProfileImage, ProfileImageError };
