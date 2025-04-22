import Epub from "npm:epub-gen";
import path from "node:path";
import type { PdfImage } from "./extractImages.ts";

type GenerateEpubArgs = {
  html: string;
  images: PdfImage[];
  outputFile: string;
  title: string;
  author: string;
  cover?: string;
};

export default function generateEpub({
  html,
  images,
  outputFile,
  title,
  author,
  cover,
}: GenerateEpubArgs) {
  const options = {
    title,
    author,
    cover,
    output: outputFile,
    content: [
      {
        title,
        data: html,
      },
    ],
    resources: images.map((image) => ({
      path: image.file,
      url: `file://${path.join(Deno.cwd(), image.file)}`,
    })),
  };
  return new Epub(options).promise;
}
