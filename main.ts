import { parseArgs } from "jsr:@std/cli/parse-args";
import { v4 as uuidv4 } from "npm:uuid";
import path from "node:path";
import { load as loadDotenv } from "jsr:@std/dotenv";
import extractMarkdown from "./lib/extractMarkdown.ts";
import extractImages from "./lib/extractImages.ts";
import getMarkdownPagesWithLocalImages from "./lib/getMarkdownPagesWithLocalImages.ts";
import convertMarkdownToHtml from "./lib/convertMarkdownToHtml.ts";
import generateEpub from "./lib/generateEpub.ts";

await loadEnvironmentVariables();
const args = processArgs();
const tempFolder = await prepare(args.pdfUrl);
const pdfPath = path.join(tempFolder, "input.pdf");
const extractedImages = await extractImages({ pdfPath, tempFolder });
const extractedText = await extractMarkdown({
  pdfUrl: args.pdfUrl,
  mistralApiKey: args.mistralApiKey,
  tempFolder,
});
const markdownPages = getMarkdownPagesWithLocalImages({
  mistralOutput: extractedText,
  extractedImages,
});
const html = await convertMarkdownToHtml({ markdownPages, tempFolder });
await generateEpub({
  html,
  images: extractedImages,
  outputFile: args.epubPath,
  title: args.title,
  author: args.author,
  cover: args.cover,
  publisher: args.publisher,
});

if (args.cleanup) {
  await cleanup(tempFolder);
}

function processArgs() {
  const args = parseArgs(Deno.args, {
    string: [
      "pdfUrl",
      "title",
      "author",
      "cover",
      "epubPath",
      "mistralApiKey",
      "publisher",
    ],
    boolean: ["help", "cleanup"],
    default: {
      title: "Untitled",
      author: "Unknown Author",
      epubPath: "output.epub",
      cleanup: false,
    },
  });

  if (!args.pdfUrl) {
    console.error("Error: --pdfUrl is required.");
    help();
    Deno.exit(1);
  }

  if (args.help) {
    help();
    Deno.exit(0);
  }
  return {
    pdfUrl: args.pdfUrl,
    title: args.title,
    author: args.author,
    cover: args.cover,
    epubPath: args.epubPath,
    mistralApiKey: args.mistralApiKey,
    cleanup: args.cleanup,
    publisher: args.publisher,
  };
}

function help() {
  console.log(
    "Usage: pdf2epub --pdfUrl <pdfUrl> [--title <title>] [--author <author>] [--cover <cover>] [--publisher <publisher>] [--epubPath <epubPath>] [--cleanup] ",
  );
}

async function loadEnvironmentVariables() {
  const env = await loadDotenv();

  for (const [key, value] of Object.entries(env)) {
    Deno.env.set(key, value);
  }
}

async function prepare(pdfUrl: string) {
  const tempFolder = `temp_${uuidv4()}`;
  console.log("Creating temp folder", tempFolder);
  const pdfPath = path.join(tempFolder, "input.pdf");
  await Deno.mkdir(tempFolder, { recursive: true });

  console.log("Downloading PDF", pdfUrl);
  const pdf = await fetch(pdfUrl);
  const pdfArrayBuffer = await pdf.arrayBuffer();
  await Deno.writeFile(pdfPath, new Uint8Array(pdfArrayBuffer));
  return tempFolder;
}

async function cleanup(tempFolder: string) {
  console.log("Cleaning up temp folder", tempFolder);
  await Deno.remove(tempFolder, { recursive: true });
}
