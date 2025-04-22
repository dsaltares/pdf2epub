import * as pdfjs from "https://esm.sh/pdfjs-dist@4.4.168/legacy/build/pdf.mjs";
import path from "node:path";
import fs from "node:fs";
import { createCanvas } from "https://deno.land/x/canvas@v1.4.2/mod.ts";

export type PdfImage = {
  file: string;
  page: number;
  width: number;
  height: number;
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
};

// Set the workerSrc explicitly for Deno compatibility
// @ts-ignore pdfjs workerSrc type issue
pdfjs.GlobalWorkerOptions.workerSrc =
  "https://esm.sh/pdfjs-dist@4.4.168/legacy/build/pdf.worker.mjs";

type ImportedImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

type ExtractImagesArgs = {
  pdfPath: string;
  tempFolder: string;
};

export default async function extractImages({
  pdfPath,
  tempFolder,
}: ExtractImagesArgs) {
  console.log(`Loading PDF: ${pdfPath}`);
  const loadingTask = pdfjs.getDocument({ url: pdfPath });
  const pdf = await loadingTask.promise;
  console.log(`PDF loaded with ${pdf.numPages} pages.`);

  const images: PdfImage[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    console.log(`Extracting images from ${pageNum}/${pdf.numPages}...`);
    const page = await pdf.getPage(pageNum);
    const operatorList = await page.getOperatorList();
    const viewport = page.getViewport({ scale: 1.0 });

    const stack: Transform[] = [];
    let ctm: Transform = [1, 0, 0, 1, 0, 0];

    for (
      let operatorIdx = 0;
      operatorIdx < operatorList.fnArray.length;
      operatorIdx++
    ) {
      const fn = operatorList.fnArray[operatorIdx];
      const args = operatorList.argsArray[operatorIdx];
      if (fn === pdfjs.OPS.save) {
        stack.push([...ctm]);
      } else if (fn === pdfjs.OPS.restore) {
        ctm = (stack.pop() || [1, 0, 0, 1, 0, 0]) as Transform;
      } else if (fn === pdfjs.OPS.transform) {
        ctm = multiplyTransform(ctm, args);
      } else if (
        fn === pdfjs.OPS.paintImageXObject ||
        fn === pdfjs.OPS.paintInlineImageXObject
      ) {
        const pngImage = await extractImageAsPng({
          name: args[0],
          pageNum,
          objs: page.objs,
          viewport,
          ctm,
        });
        if (!pngImage) {
          continue;
        }

        const jpgPath = path.join(
          tempFolder,
          path.format({
            ...path.parse(pngImage.file),
            base: undefined,
            ext: ".jpg",
          }),
        );
        const pngPath = path.join(tempFolder, pngImage.file);
        await fs.promises.writeFile(
          pngPath,
          pngImage.buffer,
        );
        await convertImage(pngPath, jpgPath);
        images.push({
          file: jpgPath,
          page: pngImage.page,
          width: pngImage.width,
          height: pngImage.height,
          x: pngImage.x,
          y: pngImage.y,
          viewportWidth: pngImage.viewportWidth,
          viewportHeight: pngImage.viewportHeight,
        });
      }
    }
  }

  await fs.promises.writeFile(
    path.join(tempFolder, "extracted-images.json"),
    JSON.stringify(images, null, 2),
  );

  return images;
}

type ExtractImageAsPngArgs = {
  name: string;
  pageNum: number;
  objs: pdfjs.PDFPageProxy["objs"];
  viewport: pdfjs.PageViewport;
  ctm: Transform;
};

async function extractImageAsPng(
  { name, pageNum, objs, viewport, ctm }: ExtractImageAsPngArgs,
) {
  const image = await new Promise<ImportedImage | null>(
    (resolve) => {
      const timeoutId = setTimeout(
        () => resolve(null),
        10_000,
      );
      objs.get(name, (data: ImportedImage) => {
        clearTimeout(timeoutId);
        resolve(data);
      });
    },
  );

  if (!image) {
    return null;
  }

  if (!image.data || !image.width || !image.height) {
    console.warn(
      `Page ${pageNum}, image ${name} has no data, width, or height.`,
    );
    return null;
  }

  const { width, height, data } = image;
  let rgbaData: Uint8ClampedArray | null = null;

  // RGB
  if (data.length === width * height * 3) {
    rgbaData = new Uint8ClampedArray(width * height * 4);
    for (let j = 0, k = 0; j < data.length; j += 3, k += 4) {
      rgbaData[k] = data[j];
      rgbaData[k + 1] = data[j + 1];
      rgbaData[k + 2] = data[j + 2];
      rgbaData[k + 3] = 255;
    }
  } // RGBA
  else if (data.length === width * height * 4) {
    rgbaData = new Uint8ClampedArray(data);
  } // Grayscale (assuming 1 byte per pixel)
  else if (data.length === width * height) {
    rgbaData = new Uint8ClampedArray(width * height * 4);
    for (let j = 0, k = 0; j < data.length; j++, k += 4) {
      rgbaData[k] = data[j];
      rgbaData[k + 1] = data[j];
      rgbaData[k + 2] = data[j];
      rgbaData[k + 3] = 255;
    }
  } else {
    console.error(
      `Page ${pageNum},  Unexpected data length for image ${name}. ` +
        `Expected ${width * height * 3} (RGB), ${
          width * height * 4
        } (RGBA), or ${width * height} (Grayscale), ` +
        `got ${data.length}. Skipping image.`,
    );
    return null;
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(rgbaData);
  ctx.putImageData(imageData, 0, 0);
  const buffer = await canvas.toBuffer("image/png");
  const [a, _b, _c, d, e, f] = ctm;
  const [x, y] = applyTransform(viewport.transform as Transform, [
    e,
    f,
  ]);
  const [x0, y0] = applyTransform(
    viewport.transform as Transform,
    [e, f],
  );
  const [x1, y1] = applyTransform(
    viewport.transform as Transform,
    [e + a, f + d],
  );

  const imageWidth = Math.abs(x1 - x0);
  const imageHeight = Math.abs(y1 - y0);

  return {
    file: `page_${pageNum}_${name}.png`,
    page: pageNum,
    x: Math.max(0, x),
    y: Math.max(0, y - imageHeight),
    width: Math.min(imageWidth, viewport.width - x),
    height: Math.min(
      imageHeight,
      viewport.height - y + imageHeight,
    ),
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    buffer: buffer,
  };
}

type Transform = [number, number, number, number, number, number];
type Point = [number, number];

function multiplyTransform(m1: Transform, m2: Transform): Transform {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyTransform([a, b, c, d, e, f]: Transform, [x, y]: Point): Point {
  return [
    a * x + c * y + e,
    b * x + d * y + f,
  ];
}

async function convertImage(fromPath: string, toPath: string) {
  console.log(`Converting ${fromPath} to ${toPath}...`);
  const command = new Deno.Command("convert", {
    args: [fromPath, toPath],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await command.output();

  if (code === 0) {
    console.log(
      `Successfully converted ${fromPath} to ${path.basename(toPath)}`,
    );
    await fs.promises.unlink(fromPath);
  } else {
    const errorOutput = new TextDecoder().decode(stderr);
    throw new Error(
      `Failed to convert ${fromPath}. Exit code: ${code}. Error: ${errorOutput}`,
    );
  }
}
