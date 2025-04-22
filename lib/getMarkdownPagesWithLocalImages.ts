// @ts-types="npm:@types/lodash"
import lodash from "npm:lodash";
import type extractMarkdown from "./extractMarkdown.ts";
import type { PdfImage } from "./extractImages.ts";
import path from "node:path";

type GetMarkdownPagesWithLocalImagesArgs = {
  mistralOutput: Awaited<ReturnType<typeof extractMarkdown>>;
  extractedImages: PdfImage[];
};

export default function getMarkdownPagesWithLocalImages({
  mistralOutput,
  extractedImages,
}: GetMarkdownPagesWithLocalImagesArgs) {
  return mistralOutput.pages.map((page) => {
    let markdown = page.markdown;
    const extractedImagesInPage = extractedImages.filter((image) =>
      image.page === page.index + 1
    );
    const mappedImages = page.images.map((mistralImage, _imageIdx) => {
      if (page.images.length === 1 && extractedImagesInPage.length === 1) {
        return {
          original: mistralImage.id,
          mapped: `file://${
            path.join(Deno.cwd(), extractedImagesInPage[0].file)
          }`,
        };
      }
      if (
        mistralImage.topLeftX === null || mistralImage.topLeftY === null ||
        mistralImage.bottomRightX === null || mistralImage.bottomRightY === null
      ) {
        return null;
      }
      const exactCoordinates = extractedImagesInPage.find((extractedImage) => {
        return extractedImage.x === mistralImage.topLeftX &&
          extractedImage.y >= mistralImage.topLeftY! &&
          extractedImage.x + extractedImage.width <=
            mistralImage.bottomRightX! &&
          extractedImage.y + extractedImage.height <=
            mistralImage.bottomRightY!;
      });
      if (exactCoordinates) {
        return {
          original: mistralImage.id,
          mapped: `file://${path.join(Deno.cwd(), exactCoordinates.file)}`,
        };
      }

      const mistralWidth = mistralImage.bottomRightX - mistralImage.topLeftX;
      const mistralHeight = mistralImage.bottomRightY - mistralImage.topLeftY;
      const mistralRatio = mistralWidth / mistralHeight;

      const closestRatio = lodash.minBy(
        extractedImagesInPage,
        (extractedImage) => {
          const extractedRatio = extractedImage.width / extractedImage.height;
          return Math.abs(extractedRatio - mistralRatio);
        },
      );
      if (closestRatio) {
        return {
          original: mistralImage.id,
          mapped: `file://${path.join(Deno.cwd(), closestRatio.file)}`,
        };
      }
      return null;
    });

    mappedImages.forEach((mappedImage) => {
      if (!mappedImage) {
        return;
      }
      markdown = markdown.replaceAll(
        `![${mappedImage.original}](${mappedImage.original})`,
        `![${mappedImage.mapped}](${mappedImage.mapped})`,
      );
    });
    return markdown;
  });
}
