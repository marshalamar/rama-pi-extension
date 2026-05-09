const APPLE_EPOCH_MS = 978307200000;

function decodeXmlText(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

class PlistXmlParser {
  private index = 0;

  constructor(private readonly xml: string) {}

  parse() {
    this.skipWhitespace();

    if (this.xml.startsWith("<?xml", this.index)) {
      this.index = this.xml.indexOf("?>", this.index) + 2;
    }

    this.skipWhitespace();

    if (this.xml.startsWith("<!DOCTYPE", this.index)) {
      this.index = this.xml.indexOf(">", this.index) + 1;
    }

    this.skipWhitespace();
    this.expect('<plist version="1.0">');
    const value = this.parseValue();
    this.skipWhitespace();
    this.expect("</plist>");

    return value;
  }

  private parseValue(): unknown {
    this.skipWhitespace();

    if (this.xml.startsWith("<dict>", this.index)) return this.parseDict();
    if (this.xml.startsWith("<array>", this.index)) return this.parseArray();
    if (this.xml.startsWith("<string>", this.index)) return this.parseTextTag("string");
    if (this.xml.startsWith("<key>", this.index)) return this.parseTextTag("key");
    if (this.xml.startsWith("<integer>", this.index)) return Number(this.parseTextTag("integer"));
    if (this.xml.startsWith("<real>", this.index)) return Number(this.parseTextTag("real"));

    if (this.xml.startsWith("<true/>", this.index)) {
      this.index += "<true/>".length;
      return true;
    }

    if (this.xml.startsWith("<false/>", this.index)) {
      this.index += "<false/>".length;
      return false;
    }

    throw new Error(`Unsupported plist tag near index ${this.index}`);
  }

  private parseArray() {
    this.expect("<array>");
    const items: unknown[] = [];

    while (true) {
      this.skipWhitespace();
      if (this.xml.startsWith("</array>", this.index)) {
        this.index += "</array>".length;
        return items;
      }
      items.push(this.parseValue());
    }
  }

  private parseDict() {
    this.expect("<dict>");
    const object: Record<string, unknown> = {};

    while (true) {
      this.skipWhitespace();
      if (this.xml.startsWith("</dict>", this.index)) {
        this.index += "</dict>".length;
        return object;
      }

      const key = this.parseTextTag("key");
      object[key] = this.parseValue();
    }
  }

  private parseTextTag(tagName: string) {
    this.expect(`<${tagName}>`);
    const closingTag = `</${tagName}>`;
    const endIndex = this.xml.indexOf(closingTag, this.index);

    if (endIndex === -1) throw new Error(`Missing closing tag ${closingTag}`);

    const rawText = this.xml.slice(this.index, endIndex);
    this.index = endIndex + closingTag.length;
    return decodeXmlText(rawText);
  }

  private expect(text: string) {
    this.skipWhitespace();
    if (!this.xml.startsWith(text, this.index)) {
      throw new Error(`Expected ${text} near index ${this.index}`);
    }
    this.index += text.length;
  }

  private skipWhitespace() {
    while (this.index < this.xml.length && /\s/.test(this.xml[this.index])) {
      this.index += 1;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUidReference(value: unknown): value is { "CF$UID": number } {
  return isRecord(value) && Object.keys(value).length === 1 && typeof value["CF$UID"] === "number";
}

function resolveArchiveValue(value: unknown, objects: unknown[]): unknown {
  if (isUidReference(value)) return resolveArchiveValue(objects[value["CF$UID"]], objects);
  if (Array.isArray(value)) return value.map((item) => resolveArchiveValue(item, objects));
  if (!isRecord(value)) return value;

  if (Object.prototype.hasOwnProperty.call(value, "NS.keys") && Object.prototype.hasOwnProperty.call(value, "NS.objects")) {
    const keys = resolveArchiveValue(value["NS.keys"], objects);
    const values = resolveArchiveValue(value["NS.objects"], objects);
    if (!Array.isArray(keys) || !Array.isArray(values)) return {};

    const output: Record<string, unknown> = {};
    keys.forEach((key, index) => {
      if (typeof key === "string") output[key] = values[index];
    });
    return output;
  }

  if (Object.prototype.hasOwnProperty.call(value, "properties")) {
    return resolveArchiveValue(value.properties, objects);
  }

  if (typeof value["NS.time"] === "number") {
    return new Date(APPLE_EPOCH_MS + value["NS.time"] * 1000).toISOString();
  }

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key !== "$class") output[key] = resolveArchiveValue(nestedValue, objects);
  }
  return output;
}

export function parsePlistXml(xml: string) {
  return new PlistXmlParser(xml).parse();
}

export function resolveKeyedArchive(plist: unknown) {
  if (!isRecord(plist)) throw new Error("Invalid plist");

  const objects = plist.$objects;
  const top = plist.$top;
  if (!Array.isArray(objects) || !isRecord(top) || !top.root) {
    throw new Error("Invalid NSKeyedArchiver plist structure");
  }

  return resolveArchiveValue(top.root, objects);
}
