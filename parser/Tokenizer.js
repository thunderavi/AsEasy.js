class Tokenizer {
  constructor() {
    this.keywords = new Set([
      'START', 'SERVER', 'USE', 'MODEL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH',
      'FROM', 'AUTH', 'BY', 'PROTECT', 'VALIDATE', 'MIDDLEWARE', 'MONGODB', 'MYSQL'
    ]);
  }

  tokenize(content) {
    const tokens = [];
    // Remove comments
    const cleanContent = content.split('\n').map(line => {
      const idx = line.indexOf('//');
      return idx >= 0 ? line.substring(0, idx) : line;
    }).join('\n');

    const regex = /\{([^}]*)\}|"([^"]*)"|'([^']*)'|(\n)|(\S+)/g;
    let match;

    while ((match = regex.exec(cleanContent)) !== null) {
      const [, blockContent, dqString, sqString, newline, word] = match;

      if (blockContent !== undefined) {
        tokens.push({ type: 'BLOCK', value: blockContent });
      } else if (dqString !== undefined || sqString !== undefined) {
        tokens.push({ type: 'STRING', value: dqString || sqString });
      } else if (newline) {
        tokens.push({ type: 'NEWLINE', value: '\n' });
      } else if (word) {
        if (this.keywords.has(word)) {
          tokens.push({ type: word, value: word });
        } else if (word.match(/^[0-9]+$/)) {
          tokens.push({ type: 'NUMBER', value: parseInt(word) });
        } else if (word.match(/^\/.*/) || word.match(/^:[a-zA-Z_]/)) {
          tokens.push({ type: 'PATH', value: word });
        } else if (word.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
          tokens.push({ type: 'IDENTIFIER', value: word });
        } else {
          tokens.push({ type: 'SYMBOL', value: word });
        }
      }
    }

    // Filter out consecutive newlines
    const finalTokens = [];
    let lastWasNewline = true;
    for (const t of tokens) {
      if (t.type === 'NEWLINE') {
         if (!lastWasNewline) finalTokens.push(t);
         lastWasNewline = true;
      } else {
         finalTokens.push(t);
         lastWasNewline = false;
      }
    }
    return finalTokens;
  }
}

module.exports = Tokenizer;
