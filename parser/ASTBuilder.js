class ASTBuilder {
  constructor() {
    this.ast = {
      server: null,
      databases: [],
      models: [],
      routes: [],
      auth: null,
      protections: [],
      validations: [],
      middleware: []
    };
  }

  build(tokens) {
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      if (token.type === 'START' && tokens[i + 1]?.type === 'SERVER') {
        this.ast.server = this.parseServer(tokens, i);
        i = this.findNextStatement(tokens, i);
      } else if (token.type === 'USE') {
        const result = this.parseUse(tokens, i);
        if (result.type === 'database') {
          this.ast.databases.push(result.value);
        } else if (result.type === 'middleware') {
          this.ast.middleware.push(result.value);
        }
        i = this.findNextStatement(tokens, i);
      } else if (token.type === 'MODEL') {
        this.ast.models.push(this.parseModel(tokens, i));
        i = this.findNextStatement(tokens, i);
      } else if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(token.type)) {
        this.ast.routes.push(this.parseRoute(tokens, i));
        i = this.findNextStatement(tokens, i);
      } else if (token.type === 'AUTH') {
        this.ast.auth = this.parseAuth(tokens, i);
        i = this.findNextStatement(tokens, i);
      } else if (token.type === 'PROTECT') {
        this.ast.protections.push(this.parseProtect(tokens, i));
        i = this.findNextStatement(tokens, i);
      } else if (token.type === 'VALIDATE') {
        this.ast.validations.push(this.parseValidate(tokens, i));
        i = this.findNextStatement(tokens, i);
      } else {
        i++;
      }
    }

    return this.ast;
  }

  parseServer(tokens, start) {
    const portToken = tokens[start + 2];
    if (!portToken || portToken.type !== 'NUMBER') {
      throw new Error('SERVER requires a valid port number');
    }
    return {
      port: portToken.value,
      host: '0.0.0.0'
    };
  }

  parseUse(tokens, start) {
    const nextToken = tokens[start + 1];

    if (nextToken?.type === 'MONGODB') {
      const connToken = tokens[start + 2];
      return {
        type: 'database',
        value: {
          type: 'mongodb',
          connection: connToken?.value || 'mongodb://localhost:27017/db'
        }
      };
    } else if (nextToken?.type === 'MYSQL') {
      const connToken = tokens[start + 2];
      return {
        type: 'database',
        value: {
          type: 'mysql',
          connection: connToken?.value || 'mysql://root:root@localhost:3306/db'
        }
      };
    } else if (nextToken?.type === 'IDENTIFIER') {
      return {
        type: 'middleware',
        value: nextToken.value
      };
    }

    return { type: 'unknown', value: null };
  }

  parseModel(tokens, start) {
    const nameToken = tokens[start + 1];
    if (!nameToken || nameToken.type !== 'IDENTIFIER') {
      throw new Error('MODEL requires a valid name');
    }

    const blockToken = tokens[start + 2];
    if (!blockToken || blockToken.type !== 'BLOCK') {
      throw new Error('MODEL requires a schema block');
    }

    const schema = this.parseSchema(blockToken.value);

    return {
      name: nameToken.value,
      schema: schema
    };
  }

  parseSchema(blockContent) {
    const schema = {};
    const lines = blockContent.split('\n');

    for (const line of lines) {
      const [key, type] = line.trim().split(':').map(s => s.trim());
      if (key && type) {
        schema[key] = type;
      }
    }

    return schema;
  }

  parseRoute(tokens, start) {
    const method = tokens[start].type;
    const pathToken = tokens[start + 1];
    if (!pathToken || pathToken.type !== 'PATH') {
      throw new Error(`${method} requires a valid path`);
    }

    const fromIndex = tokens.findIndex((t, i) => i > start && t.type === 'FROM');
    if (fromIndex === -1) {
      throw new Error(`${method} route requires FROM clause`);
    }

    const modelToken = tokens[fromIndex + 1];
    if (!modelToken || modelToken.type !== 'IDENTIFIER') {
      throw new Error(`FROM requires a valid model name`);
    }

    return {
      method,
      path: pathToken.value,
      model: modelToken.value
    };
  }

  parseAuth(tokens, start) {
    const modelIndex = start + 1;
    const byIndex = tokens.findIndex((t, i) => i > start && t.type === 'BY');

    if (byIndex === -1) {
      throw new Error('AUTH requires BY clause');
    }

    const modelToken = tokens[modelIndex];
    const typeToken = tokens[byIndex + 1];

    return {
      model: modelToken?.value || 'users',
      type: typeToken?.value || 'jwt'
    };
  }

  parseProtect(tokens, start) {
    const pathToken = tokens[start + 1];
    if (!pathToken || pathToken.type !== 'PATH') {
      throw new Error('PROTECT requires a valid path');
    }

    return {
      path: pathToken.value
    };
  }

  parseValidate(tokens, start) {
    const modelToken = tokens[start + 1];
    const blockToken = tokens[start + 2];

    if (!modelToken || !blockToken) {
      throw new Error('VALIDATE requires model and rules block');
    }

    const rules = this.parseValidationRules(blockToken.value);

    return {
      model: modelToken.value,
      rules: rules
    };
  }

  parseValidationRules(blockContent) {
    const rules = {};
    const lines = blockContent.split('\n');

    for (const line of lines) {
      const [field, ...ruleParts] = line.trim().split(':').map(s => s.trim());
      if (field && ruleParts.length > 0) {
        rules[field] = ruleParts.join(':');
      }
    }

    return rules;
  }

  findNextStatement(tokens, current) {
    for (let i = current + 1; i < tokens.length; i++) {
      if (tokens[i].type === 'NEWLINE' && tokens[i + 1]?.type !== 'NEWLINE') {
        return i + 1;
      }
    }
    return tokens.length;
  }
}

module.exports = ASTBuilder;
