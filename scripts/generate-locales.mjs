import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const sourceUrl = new URL('../src/i18n/index.ts', import.meta.url);
const sourceText = await readFile(sourceUrl, 'utf8');
const source = ts.createSourceFile(sourceUrl.pathname, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const english = readStringObject('FALLBACK_MESSAGES');
const chinese = readStringObject('ZH_MESSAGES');

for (const key of Object.keys(english)) {
  if (!(key in chinese)) throw new Error(`Missing zh_CN translation for ${key}`);
}
for (const key of Object.keys(chinese)) {
  if (!(key in english)) throw new Error(`Unknown zh_CN translation key ${key}`);
}

await writeLocale('en', english);
await writeLocale('zh_CN', chinese);
console.log(`Generated ${Object.keys(english).length} messages for en and zh_CN.`);

function readStringObject(variableName) {
  let object;
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== variableName) continue;
      const initializer = ts.isAsExpression(declaration.initializer)
        ? declaration.initializer.expression
        : declaration.initializer;
      if (initializer && ts.isObjectLiteralExpression(initializer)) object = initializer;
    }
  });
  if (!object) throw new Error(`Could not find ${variableName} in src/i18n/index.ts`);

  const messages = {};
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
      ? property.name.text
      : null;
    const value = property.initializer;
    if (!key || (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value))) {
      throw new Error(`${variableName} must contain only literal string properties.`);
    }
    messages[key] = value.text;
  }
  return messages;
}

async function writeLocale(locale, messages) {
  const chromeMessages = Object.fromEntries(
    Object.entries(messages).map(([key, message]) => [key, toChromeMessage(key, message)]),
  );
  const output = new URL(`../public/_locales/${locale}/messages.json`, import.meta.url);
  await writeFile(output, `${JSON.stringify(chromeMessages, null, 2)}\n`);
}

function toChromeMessage(key, message) {
  const indexes = Array.from(new Set(
    Array.from(message.matchAll(/\$(\d+)/g), (match) => Number(match[1])),
  )).sort((left, right) => left - right);
  const localized = indexes.reduce(
    (value, index) => value.replaceAll(`$${index}`, `$ARG_${index}$`),
    message,
  );
  const result = { message: localized };
  if (indexes.length > 0) {
    result.placeholders = Object.fromEntries(
      indexes.map((index) => [`arg_${index}`, { content: `$${index}` }]),
    );
  }
  if (key === 'appName') result.description = 'Extension name shown in Chrome and the Chrome Web Store.';
  if (key === 'appShortName') result.description = 'Short extension name.';
  if (key === 'appDescription') result.description = 'Extension description shown in Chrome and the Chrome Web Store.';
  return result;
}
