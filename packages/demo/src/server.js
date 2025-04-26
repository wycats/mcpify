import path from 'path';

import cors from 'cors';
import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const __dirname = import.meta.dirname;

// Initialize Express app
const app = express();
// Allow port configuration via environment variable, default to 3000
const port = process.env.PORT || 3001; // Change default to 3001 since 3000 is in use

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  req.time = new Date(Date.now()).toString();
  console.group(req.method, req.hostname, req.path, req.time);
  console.log('body', req.body);
  console.groupEnd();
  next();
});

// Sample data storage
const users = [
  { id: 1, name: 'Alice Smith', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob Johnson', email: 'bob@example.com', role: 'user' },
  { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', role: 'user' },
];

const products = [
  { id: 1, name: 'Laptop', price: 999.99, category: 'Electronics', inStock: true },
  { id: 2, name: 'Smartphone', price: 699.99, category: 'Electronics', inStock: true },
  { id: 3, name: 'Headphones', price: 149.99, category: 'Accessories', inStock: false },
];

const orders = [];

// Swagger definition
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
  apis: [path.resolve(__dirname, 'server.js')], // Using absolute path to this file
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDocs);
});

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - email
 *       properties:
 *         id:
 *           type: integer
 *           description: The user ID
 *         name:
 *           type: string
 *           description: The user's name
 *         email:
 *           type: string
 *           description: The user's email
 *         role:
 *           type: string
 *           enum: [admin, user]
 *           description: The user's role
 *     Product:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - price
 *       properties:
 *         id:
 *           type: integer
 *           description: The product ID
 *         name:
 *           type: string
 *           description: The product name
 *         price:
 *           type: number
 *           description: The product price
 *         category:
 *           type: string
 *           description: The product category
 *         inStock:
 *           type: boolean
 *           description: Whether the product is in stock
 *     Order:
 *       type: object
 *       required:
 *         - id
 *         - userId
 *         - productId
 *         - quantity
 *       properties:
 *         id:
 *           type: integer
 *           description: The order ID
 *         userId:
 *           type: integer
 *           description: The user ID placing the order
 *         productId:
 *           type: integer
 *           description: The product being ordered
 *         quantity:
 *           type: integer
 *           description: The quantity ordered
 *         status:
 *           type: string
 *           enum: [pending, completed, cancelled]
 *           description: The order status
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Retrieve a list of users
 *     description: Returns a list of all users
 *     operationId: listUsers
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: A list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 */
app.get('/users', (req, res) => {
  res.json(users);
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get a user by ID
 *     description: Returns a single user by ID
 *     operationId: getUserById
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the user to retrieve
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
app.get('/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const user = users.find((user) => user.id === id);

  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete a user
 *     description: Deletes a user by ID
 *     operationId: deleteUser
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the user to delete
 *     responses:
 *       200:
 *         description: User successfully deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: User not found
 */
app.delete('/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = users.findIndex((user) => user.id === id);
  
  if (index === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Remove the user from the array
  const deletedUser = users.splice(index, 1)[0];
  
  res.json({ 
    message: `User ${deletedUser.name} (ID: ${deletedUser.id}) successfully deleted`,
    deletedUser
  });
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     description: Adds a new user to the system
 *     operationId: createUser
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *                 description: User's full name
 *               email:
 *                 type: string
 *                 description: User's email address
 *               role:
 *                 type: string
 *                 enum: [admin, user]
 *                 default: user
 *                 description: User's role in the system
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid request data
 */
app.post('/users', (req, res) => {
  const { name, email, role = 'user' } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  const newId = users.length > 0 ? Math.max(...users.map((u) => u.id)) + 1 : 1;
  const newUser = {
    id: newId,
    name,
    email,
    role,
  };

  users.push(newUser);
  res.status(201).json(newUser);
});

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Retrieve a list of products
 *     description: Returns a list of all products
 *     operationId: listProducts
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: A list of products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 */
app.get('/products', (req, res) => {
  res.json(products);
});

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get a product by ID
 *     description: Returns a single product by ID
 *     operationId: getProductById
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the product to retrieve
 *     responses:
 *       200:
 *         description: Product found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       404:
 *         description: Product not found
 */
app.get('/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const product = products.find((product) => product.id === id);

  if (product) {
    res.json(product);
  } else {
    res.status(404).json({ message: 'Product not found' });
  }
});

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a new product
 *     description: Adds a new product to the system
 *     operationId: createProduct
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *                 description: Product name
 *               price:
 *                 type: number
 *                 description: Product price
 *               category:
 *                 type: string
 *                 description: Product category
 *               inStock:
 *                 type: boolean
 *                 description: Whether the product is in stock
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       400:
 *         description: Invalid request data
 */
app.post('/products', (req, res) => {
  const { name, price, category, inStock } = req.body;

  if (!name || !price) {
    return res.status(400).json({ message: 'Name and price are required' });
  }

  const newProduct = {
    id: products.length > 0 ? Math.max(...products.map((p) => p.id)) + 1 : 1,
    name,
    price: parseFloat(price),
    category: category || 'Uncategorized',
    inStock: inStock !== undefined ? Boolean(inStock) : true,
  };

  products.push(newProduct);
  res.status(201).json(newProduct);
});

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Create a new order
 *     description: Places a new order for a product
 *     operationId: createOrder
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - productId
 *               - quantity
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: ID of the user placing the order
 *               productId:
 *                 type: integer
 *                 description: ID of the product being ordered
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Quantity of the product being ordered
 *     responses:
 *       201:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         description: Invalid input or product not in stock
 *       404:
 *         description: User or product not found
 */

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Retrieve a list of orders
 *     description: Returns a list of all orders
 *     operationId: listOrders
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: A list of orders
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 */
app.get('/orders', (req, res) => {
  res.json(orders);
});

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Get an order by ID
 *     description: Returns a single order by ID
 *     operationId: getOrderById
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the order to retrieve
 *     responses:
 *       200:
 *         description: Order found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 */
app.get('/orders/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const order = orders.find((order) => order.id === id);

  if (order) {
    res.json(order);
  } else {
    res.status(404).json({ message: 'Order not found' });
  }
});

app.post('/orders', (req, res) => {
  const { userId, productId, quantity } = req.body;

  if (!userId || !productId || !quantity || quantity < 1) {
    return res
      .status(400)
      .json({ message: 'UserId, productId and a positive quantity are required' });
  }

  const user = users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const product = products.find((p) => p.id === productId);
  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  if (!product.inStock) {
    return res.status(400).json({ message: 'Product is not in stock' });
  }

  const newId = orders.length > 0 ? Math.max(...orders.map((o) => o.id)) + 1 : 1;
  const newOrder = {
    id: newId,
    userId,
    productId,
    quantity,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  orders.push(newOrder);
  res.status(201).json(newOrder);
});

/**
 * @swagger
 * /orders/{id}/status:
 *   put:
 *     summary: Update an order's status
 *     description: Updates the status of an existing order
 *     operationId: updateOrderStatus
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the order to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, completed, cancelled]
 *                 description: New status for the order
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         description: Invalid status value
 *       404:
 *         description: Order not found
 */
app.put('/orders/:id/status', (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;

  if (!status || !['pending', 'completed', 'cancelled'].includes(status)) {
    return res
      .status(400)
      .json({ message: 'Valid status (pending, completed, or cancelled) is required' });
  }

  const orderIndex = orders.findIndex((order) => order.id === id);

  if (orderIndex === -1) {
    return res.status(404).json({ message: 'Order not found' });
  }

  orders[orderIndex].status = status;
  res.json(orders[orderIndex]);
});

// Start the server
app.listen(port, () => {
  console.log(`Demo API server running at http://localhost:${port}`);
  console.log(`Swagger documentation available at http://localhost:${port}/api-docs`);
});
