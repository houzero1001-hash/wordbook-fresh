import { writeFile, mkdir } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
const dir = new URL("../tests/fixtures/", import.meta.url);
await mkdir(dir, { recursive: true });
const paragraph = "study book run right mean";
await writeFile(
  new URL("words.txt", dir),
  paragraph + "\nhttps://example.org/do-not-import",
);
await writeFile(
  new URL("words.md", dir),
  "# Vocabulary\n**study** book `run` right mean\n[Reference](https://example.org/ignored)",
);
const rtf = String.raw`{\rtf1\ansi\ansicpg1252{\fonttbl{\f0 Arial;}}\f0 study book\par run right mean {\*\generator ignoredmetadata;}{\pict\pngblip 0123ABCD}}`;
await writeFile(new URL("words.rtf", dir), rtf);
await writeFile(new URL("rtf-word.doc", dir), rtf);
await writeFile(
  new URL("binary.doc", dir),
  new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]),
);
await writeFile(
  new URL("words.docx", dir),
  zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>stu</w:t></w:r><w:r><w:t>dy book</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>run right mean</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
    ),
  }),
);
