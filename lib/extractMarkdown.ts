import { Mistral } from "npm:@mistralai/mistralai";
import fs from "node:fs";
import path from "node:path";

type ExtractMarkdownArgs = {
  pdfUrl: string;
  mistralApiKey?: string;
  tempFolder: string;
};

export default async function extractMarkdown(
  { pdfUrl, mistralApiKey, tempFolder }: ExtractMarkdownArgs,
) {
  const apiKey = mistralApiKey || Deno.env.get("MISTRAL_API_KEY");
  const client = new Mistral({ apiKey });
  const response = await client.ocr.process({
    model: "mistral-ocr-latest",
    document: {
      type: "document_url",
      documentUrl: pdfUrl,
    },
  });
  await fs.promises.writeFile(
    path.join(tempFolder, "extracted-text.json"),
    JSON.stringify(response, null, 2),
  );
  return response;
}
