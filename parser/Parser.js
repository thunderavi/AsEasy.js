const Tokenizer = require('./Tokenizer');
const ASTBuilder = require('./ASTBuilder');

class Parser {
  constructor() {
    this.tokenizer = new Tokenizer();
    this.astBuilder = new ASTBuilder();
  }

  parse(content) {
    const tokens = this.tokenizer.tokenize(content);
    const ast = this.astBuilder.build(tokens);
    return ast;
  }
}

module.exports = Parser;
