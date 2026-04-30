#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Parser = require('./parser/Parser');
const Compiler = require('./compiler/Compiler');
const RuntimeEngine = require('./runtime/RuntimeEngine');
const Logger = require('./core/logger');

class EasyJS {
  constructor() {
    this.parser = new Parser();
    this.compiler = new Compiler();
    this.runtime = new RuntimeEngine();
  }

  async run(filePath) {
    try {
      const cwd = process.cwd();
      const fullPath = path.resolve(cwd, filePath);

      if (!fs.existsSync(fullPath)) {
        Logger.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      Logger.info('Parsing easy.js DSL...');
      
      const ast = this.parser.parse(content);
      Logger.success('✓ DSL parsed successfully');

      Logger.info('Compiling to Node.js/Express...');
      const config = this.compiler.compile(ast);
      Logger.success('✓ Compilation completed');

      Logger.info('Starting runtime engine...');
      await this.runtime.initialize(config);
      Logger.success('✓ Server running');
    } catch (error) {
      Logger.error(error.message);
      process.exit(1);
    }
  }
}

// Usage
const filePath = process.argv[2] || './app.easy';
const easyjs = new EasyJS();
easyjs.run(filePath);

module.exports = EasyJS;
