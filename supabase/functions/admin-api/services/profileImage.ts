import { createApiError } from "../value.ts";

type MagickImage = {
  readonly format: string;
  readonly height: number;
  quality: number;
  readonly width: number;
  autoOrient(): void;
  resize(width: number, height: number): void;
  strip(): void;
  write<T>(format: string, callback: (data: Uint8Array) => T): T;
};

type MagickModule = {
  ImageMagick: {
    readCollection<T>(data: Uint8Array, callback: (images: MagickImage[]) => T): T;
  };
  initializeImageMagick(data: Uint8Array): Promise<void>;
  MagickFormat: { Jpeg: string; Png: string; WebP: string };
  ResourceLimits: {
    area: bigint; disk: bigint; height: bigint; listLength: bigint;
    maxMemoryRequest: bigint; maxProfileSize: bigint; memory: bigint; width: bigint;
  };
};

const MAX_INPUT_BYTES = 500_000;
const MAX_OUTPUT_BYTES = 500_000;
const MAX_DIMENSION = 4_096;
const MAX_PIXELS = 16_000_000;
const MAX_OUTPUT_DIMENSION = 512;
const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,((?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?)$/i;
const FORMAT_BY_MEDIA_TYPE: Record<string, string> = {
  jpeg: "JPEG", png: "PNG", webp: "WEBP",
};
const hasSignature = (format: string, bytes: Uint8Array) => {
  if (format === "JPEG") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (format === "PNG") {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10]
      .every((value, index) => bytes[index] === value);
  }
  return bytes.length >= 12 && [82, 73, 70, 70]
    .every((value, index) => bytes[index] === value) &&
    [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value);
};

let initialization: Promise<MagickModule> | undefined;

const initialize = () => {
  if (!initialization) {
    initialization = (async () => {
      // A variable specifier keeps Node-based router tests from resolving Deno's npm: URL.
      const packageSpecifier = "npm:@imagemagick/magick-wasm@0.0.43";
      const magick = await import(packageSpecifier) as MagickModule;
      const wasmSpecifier = `${packageSpecifier}/magick.wasm`;
      const wasm = await Deno.readFile(new URL(import.meta.resolve(wasmSpecifier)));
      await magick.initializeImageMagick(wasm);
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
  return initialization;
};

const invalidImage = () => createApiError(
  "INVALID_PROFILE_IMAGE",
  "Choose a valid JPG, PNG, or WEBP image no larger than 4096×4096 pixels.",
);

const decodeDataUrl = (dataUrl: string) => {
  if (dataUrl.length > 670_000) throw invalidImage();
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw invalidImage();
  const binary = atob(match[2]);
  if (!binary.length || binary.length > MAX_INPUT_BYTES) throw invalidImage();
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const expectedFormat = FORMAT_BY_MEDIA_TYPE[match[1].toLowerCase()];
  if (!hasSignature(expectedFormat, bytes)) throw invalidImage();
  return {
    bytes, expectedFormat,
  };
};

const validDimensions = (width: number, height: number) =>
  Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
  width <= MAX_DIMENSION && height <= MAX_DIMENSION && width * height <= MAX_PIXELS;

export const processProfileImage = async (dataUrl: string) => {
  const { bytes, expectedFormat } = decodeDataUrl(dataUrl);
  const magick = await initialize();
  try {
    const output = magick.ImageMagick.readCollection(bytes, (images) => {
      if (images.length !== 1) throw invalidImage();
      const image = images[0];
      if (image.format !== expectedFormat || !validDimensions(image.width, image.height)) {
        throw invalidImage();
      }
      image.autoOrient();
      if (!validDimensions(image.width, image.height)) throw invalidImage();
      const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(image.width, image.height));
      if (scale < 1) {
        image.resize(
          Math.max(1, Math.round(image.width * scale)),
          Math.max(1, Math.round(image.height * scale)),
        );
      }
      image.strip();
      image.quality = 82;
      return image.write(magick.MagickFormat.WebP, (encoded) => Uint8Array.from(encoded));
    });
    if (!output.length || output.length > MAX_OUTPUT_BYTES) throw invalidImage();
    return output;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error &&
        error.code === "INVALID_PROFILE_IMAGE") throw error;
    throw invalidImage();
  }
};
