/* eslint-disable no-undef */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import swaggerJsdoc from 'swagger-jsdoc';

// Get file path in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define Swagger options - same as in server.js
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MCPify Demo API',
      version: '1.0.0',
      description: 'A simple Express API to test MCPify proxy',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Users',
        description: 'API endpoints for user management',
      },
      {
        name: 'Products',
        description: 'API endpoints for product catalog',
      },
      {
        name: 'Orders',
        description: 'API endpoints for order processing',
      },
    ],
  },
  apis: [path.resolve(__dirname, 'server.js')], // Absolute path to server.js
};

// Generate the OpenAPI specification
const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Output path
const outputPath = path.resolve(__dirname, '../swagger-spec.json');

// Write the specification to a file
fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));

console.log(`Swagger specification generated at: ${outputPath}`);
