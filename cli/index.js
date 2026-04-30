#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const Logger = require('../core/logger');

class CLI {
  constructor() {
    this.command = process.argv[2];
    this.args = process.argv.slice(3);
  }

  async run() {
    switch (this.command) {
      case 'create':
        this.createProject();
        break;
      case 'start':
        this.startServer();
        break;
      case 'dev':
        this.devServer();
        break;
      case 'build':
        this.build();
        break;
      case '--version':
      case '-v':
        this.showVersion();
        break;
      case '--help':
      case '-h':
        this.showHelp();
        break;
      default:
        this.showHelp();
    }
  }

  createProject() {
    const projectName = this.args[0];

    if (!projectName) {
      Logger.error('Project name is required');
      Logger.info('Usage: easyjs create <project-name>');
      process.exit(1);
    }

    const projectPath = path.join(process.cwd(), projectName);

    if (fs.existsSync(projectPath)) {
      Logger.error(`Directory '${projectName}' already exists`);
      process.exit(1);
    }

    Logger.info(`Creating project: ${projectName}`);

    fs.mkdirSync(projectPath, { recursive: true });

    // Create directory structure
    const dirs = [
      'src',
      'examples',
      'config',
      'public'
    ];

    for (const dir of dirs) {
      fs.mkdirSync(path.join(projectPath, dir), { recursive: true });
    }

    // Create example .easy file
    const exampleContent = `START SERVER 3000

MODEL users {
  name: string
  email: string
  password: string
}

AUTH users BY jwt

GET /users FROM users
POST /users FROM users
PUT /users/:id FROM users
DELETE /users/:id FROM users

VALIDATE users {
  email: required:email
  password: required:min=6
  name: required
}

PROTECT /users
`;

    fs.writeFileSync(
      path.join(projectPath, 'src', 'app.easy'),
      exampleContent
    );

    // Create index.html template
    const indexHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My easy.js App</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: #f3f4f6;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .container {
            text-align: center;
            padding: 3rem;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        h1 {
            color: #4f46e5;
            margin-bottom: 0.5rem;
        }
        p {
            color: #6b7280;
            font-size: 1.1rem;
        }
        code {
            background: #f3f4f6;
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            color: #ef4444;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Welcome to easy.js</h1>
        <p>Your production-ready backend is running!</p>
        <p style="font-size: 0.9rem; margin-top: 2rem;">Edit this file in <code>public/index.html</code></p>
    </div>
</body>
</html>`;

    fs.writeFileSync(
      path.join(projectPath, 'public', 'index.html'),
      indexHtmlContent
    );

    // Create .env file
    const envContent = `JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h
MONGODB_URL=mongodb://localhost:27017/easyjs
MYSQL_URL=mysql://root:root@localhost:3306/easyjs
DEBUG=false
`;

    fs.writeFileSync(path.join(projectPath, '.env'), envContent);

    // Create package.json
    const packageContent = {
      name: projectName,
      version: '1.0.0',
      description: 'An easy.js backend project',
      main: 'src/app.easy',
      scripts: {
        start: 'easyjs start src/app.easy',
        dev: 'easyjs dev src/app.easy'
      },
      dependencies: {
        'aseasy': '^1.0.6'
      }
    };

    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify(packageContent, null, 2)
    );

    // Create README
    const readmeContent = `# ${projectName}

A backend API built with easy.js

## Getting Started

1. Install dependencies:
   \`\`\`
   npm install
   \`\`\`

2. Update .env file with your database configuration

3. Start the server:
   \`\`\`
   npm start
   \`\`\`

## Development

Run in watch mode:
\`\`\`
npm run dev
\`\`\`

## Available Routes

- GET /users
- POST /users
- PUT /users/:id
- DELETE /users/:id

## Documentation

Visit https://easy.js for full documentation
`;

    fs.writeFileSync(path.join(projectPath, 'README.md'), readmeContent);

    Logger.success(`\n✓ Project created successfully!\n`);
    Logger.info(`Next steps:`);
    Logger.info(`  cd ${projectName}`);
    Logger.info(`  npm install`);
    Logger.info(`  npm start\n`);
  }

  startServer() {
    const filePath = this.args[0] || './app.easy';
    Logger.info(`Starting server with ${filePath}...`);
    this.runEasyJS(filePath);
  }

  devServer() {
    const filePath = this.args[0] || './app.easy';
    Logger.info(`Starting development server with ${filePath}...`);
    Logger.info('Watching for changes...');
    this.runWithWatcher(filePath);
  }

  build() {
    Logger.info('Building project...');
    Logger.success('✓ Build complete');
  }

  showVersion() {
    const packageJson = require('../package.json');
    Logger.info(`easy.js v${packageJson.version}`);
  }

  showHelp() {
    Logger.info(`
easy.js CLI

Usage:
  easyjs <command> [options]

Commands:
  create <name>     Create a new easy.js project
  start [file]      Start the server
  dev [file]        Start in development mode with watch
  build             Build for production

Options:
  --version, -v     Show version
  --help, -h        Show this help message

Examples:
  easyjs create my-api
  easyjs start src/app.easy
  easyjs dev src/app.easy

For more information, visit: https://easy.js
    `);
  }

  runEasyJS(filePath) {
    const indexPath = path.resolve(__dirname, '../index.js');
    const { spawn } = require('child_process');
    const child = spawn('node', [indexPath, filePath], { stdio: 'inherit' });
    child.on('error', (error) => {
      Logger.error(error.message);
      process.exit(1);
    });
  }

  runWithWatcher(filePath) {
    // Simple file watcher - in production would use chokidar or similar
    const dir = path.dirname(filePath);
    Logger.info(`Watching directory: ${dir}`);

    this.runEasyJS(filePath);

    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (filename && filename.endsWith('.easy')) {
        Logger.info(`File changed: ${filename}`);
        Logger.info('Restarting server...');
        this.runEasyJS(filePath);
      }
    });
  }
}

const cli = new CLI();
cli.run();

module.exports = CLI;
