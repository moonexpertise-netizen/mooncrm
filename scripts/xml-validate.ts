/**
 * Mini-validateur XML strict (basé sur une pile de tags).
 * Vérifie que toutes les balises d'ouverture ont leur fermeture, dans le bon ordre.
 *
 * Usage : npx tsx scripts/xml-validate.ts path/to/file.xml
 */

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: xml-validate.ts <path>");
  process.exit(2);
}

let xml = readFileSync(path, "utf-8");

// Strip prologue, comments, CDATA, processing instructions
xml = xml.replace(/<\?[^?]*\?>/g, "");
xml = xml.replace(/<!--[\s\S]*?-->/g, "");
xml = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

const stack: { tag: string; pos: number }[] = [];
const tagRe = /<(\/)?([A-Za-z_][\w:.-]*)([^>]*)>/g;
let m: RegExpExecArray | null;
let errors = 0;

while ((m = tagRe.exec(xml))) {
  const [full, slash, tagName, attrs] = m;
  const pos = m.index;
  const selfClose = attrs.trimEnd().endsWith("/");
  if (slash) {
    // Closing tag
    const top = stack.pop();
    if (!top) {
      console.log(`✗ unexpected </${tagName}> at ${pos} (no opening)`);
      console.log("  context:", xml.slice(Math.max(0, pos - 80), pos + 80));
      errors++;
    } else if (top.tag !== tagName) {
      console.log(`✗ mismatch : </${tagName}> at ${pos} but expected </${top.tag}> opened at ${top.pos}`);
      console.log("  context:", xml.slice(Math.max(0, pos - 80), pos + 80));
      errors++;
    }
  } else if (!selfClose) {
    stack.push({ tag: tagName, pos });
  }
  if (errors >= 5) {
    console.log("(stopping after 5 errors)");
    break;
  }
}

if (stack.length && errors < 5) {
  console.log("✗ Unclosed tags at EOF:");
  for (const s of stack.slice(-5)) {
    console.log(`  <${s.tag}> opened at ${s.pos}`);
  }
  errors += stack.length;
}

if (errors === 0) {
  console.log("✓ XML balanced");
} else {
  console.log(`✗ ${errors} error(s)`);
  process.exit(1);
}
