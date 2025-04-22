import { marked } from "npm:marked@13.0.2";
import fs from "node:fs";
import path from "node:path";

type ConvertMarkdownToHtmlArgs = {
  markdownPages: string[];
  tempFolder: string;
};

export default async function convertMarkdownToHtml({
  markdownPages,
  tempFolder,
}: ConvertMarkdownToHtmlArgs) {
  const markdown = markdownPages.join("\n\n");
  const renderer = new marked.Renderer();
  const html = await marked.parse(markdown, { renderer });
  await fs.promises.writeFile(
    path.join(tempFolder, "html.html"),
    html,
  );
  return html;
}
