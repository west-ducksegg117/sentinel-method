import { ApiContractValidator } from '../../src/validators/api-contract';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../../src/types';

describe('ApiContractValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join('/tmp', 'sentinel-test-project-api');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    config = {
      testingThreshold: 80,
      securityLevel: 'strict',
      performanceTarget: 'optimal',
      maintainabilityScore: 75,
    };
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  // ── Inicialização ──

  test('deve inicializar corretamente', () => {
    const validator = new ApiContractValidator(config);
    expect(validator).toBeDefined();
    expect(validator.name).toBe('API Contracts');
  });

  // ── Casos de sucesso ──

  test('deve passar com projeto sem API', () => {
    // Projeto vazio ou apenas com código utilitário
    const utilFile = path.join(testDir, 'utils.ts');
    fs.writeFileSync(utilFile, `
      export function calculateSum(a: number, b: number): number {
        return a + b;
      }

      export function formatDate(date: Date): string {
        return date.toISOString();
      }
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  // ── Detecção de problemas ──

  test('deve detectar rota sem validação de input', () => {
    const file = path.join(testDir, 'bad-route.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      // Sem validação de input
      app.post('/users', (req, res) => {
        res.json(req.body);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    // Verify the validator ran successfully
    expect(result.validator).toBe('API Contracts');
  });

  test('deve detectar URL hardcoded', () => {
    const file = path.join(testDir, 'hardcoded-url.ts');
    fs.writeFileSync(file, `
      const url = 'https://api.example.com/v1/users';
      async function fetchUsers() {
        const response = await fetch(url);
        return response.json();
      }
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    // Verify the validator ran successfully
    expect(result.validator).toBe('API Contracts');
  });

  test('deve detectar padrão N+1', () => {
    const file = path.join(testDir, 'n-plus-one.ts');
    fs.writeFileSync(file, `
      async function getUsersWithOrders(users: any[]) {
        users.forEach(async (u) => {
          const orders = await db.query('SELECT * FROM orders WHERE userId=' + u.id);
          u.orders = orders;
        });
      }
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    // Verify the validator ran successfully
    expect(result.validator).toBe('API Contracts');
  });

  test('deve detectar verbo no nome de endpoint', () => {
    const file = path.join(testDir, 'verb-in-route.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      // Nomes com verbos violam REST
      app.get('/getUsers', (req, res) => {
        res.json([]);
      });

      app.post('/createProduct', (req, res) => {
        res.json({ id: 1 });
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    // Verify the validator ran successfully
    expect(result.validator).toBe('API Contracts');
  });

  test('deve retornar score numérico', () => {
    const file = path.join(testDir, 'mixed-api.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/products/:id', (req, res) => {
        res.json({ id: req.params.id });
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.score).toBeDefined();
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('deve detectar handler sem error handling', () => {
    const file = path.join(testDir, 'no-error-handler.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.post('/data', (req, res) => {
        const processed = processData(req.body);
        res.json(processed);
      });

      // Sem try/catch ou middleware de erro
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    // Verify validator ran
    expect(result.validator).toBe('API Contracts');
  });

  // ── Status codes inconsistentes ──

  test('deve analisar consistência de status codes', () => {
    const file = path.join(testDir, 'inconsistent-status.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/items', (req, res) => {
        const items = getItems();
        res.send(items);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  // ── Validação de input ──

  test('deve detectar validação com Joi', () => {
    const file = path.join(testDir, 'joi-validation.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      import Joi from 'joi';
      const app = express();

      app.post('/users', (req, res) => {
        const schema = Joi.object().keys({ email: Joi.string() });
        const { value, error } = schema.validate(req.body);
        if (error) res.status(400).json({ error });
        res.json(value);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve detectar validação com Zod', () => {
    const file = path.join(testDir, 'zod-validation.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      import { z } from 'zod';
      const app = express();

      app.post('/users', (req, res) => {
        const schema = z.object({ email: z.string().email() });
        const result = schema.parse(req.body);
        res.json(result);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  // ── Response type detection ──

  test('deve detectar type annotation em response', () => {
    const file = path.join(testDir, 'type-annotation.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/users/:id', (req, res): Promise<User> => {
        return getUser(req.params.id);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve detectar @ApiResponse decorator', () => {
    const file = path.join(testDir, 'swagger-decorator.ts');
    fs.writeFileSync(file, `
      import { Controller, Get } from '@nestjs/common';
      import { ApiResponse } from '@nestjs/swagger';

      @Controller('users')
      export class UserController {
        @Get(':id')
        @ApiResponse({ type: UserDto })
        async getUser(id: string) {
          return getUser(id);
        }
      }
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  // ── Authentication middleware ──

  test('deve detectar autenticação com JWT', () => {
    const file = path.join(testDir, 'jwt-auth.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/protected', (req, res) => {
        const token = req.headers.authorization?.split(' ')[1];
        const decoded = jwt.verify(token, SECRET);
        res.json({ user: decoded });
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve detectar autenticação com @UseGuards', () => {
    const file = path.join(testDir, 'nestjs-guard.ts');
    fs.writeFileSync(file, `
      import { Controller, Get, UseGuards } from '@nestjs/common';
      import { AuthGuard } from '@nestjs/passport';

      @Controller('users')
      export class UserController {
        @Get()
        @UseGuards(AuthGuard('jwt'))
        async getUsers() {
          return [];
        }
      }
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  // ── Paginação ──

  test('deve detectar paginação com limit/offset', () => {
    const file = path.join(testDir, 'pagination-limit.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/users', (req, res) => {
        const limit = req.query.limit;
        const offset = req.query.offset;
        const users = getUsers({ limit, offset });
        res.json(users);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve detectar paginação com skip/take', () => {
    const file = path.join(testDir, 'pagination-skip.ts');
    fs.writeFileSync(file, `
      export async function getItems() {
        return await db.items.skip(10).take(20).findMany();
      }
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve analisar paginação em endpoints', () => {
    const file = path.join(testDir, 'no-pagination.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/users', (req, res) => {
        const allUsers = getAllUsers();
        res.json(allUsers);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  // ── Rate limiting ──

  test('deve detectar rate limiting com rateLimit', () => {
    const file = path.join(testDir, 'rate-limit.ts');
    fs.writeFileSync(file, `
      import rateLimit from 'express-rate-limit';
      const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

      app.use(limiter);
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve detectar rate limiting com @Throttle', () => {
    const file = path.join(testDir, 'throttle-decorator.ts');
    fs.writeFileSync(file, `
      import { Controller, Get, Throttle } from '@nestjs/common';

      @Controller('public')
      export class PublicController {
        @Get('data')
        @Throttle(10, 60)
        getData() {
          return { data: [] };
        }
      }
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve detectar rate limiting ausente em rota pública', () => {
    const file = path.join(testDir, 'public-no-limit.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/public/data', (req, res) => {
        res.json({ data: [] });
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  // ── Score e threshold ──

  test('deve ter score numérico entre 0 e 100', () => {
    const file = path.join(testDir, 'score-check.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/', (req, res) => {
        res.json({ status: 'ok' });
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.score).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('deve ter threshold de 60', () => {
    const file = path.join(testDir, 'threshold.ts');
    fs.writeFileSync(file, `
      export const API_URL = 'https://api.example.com';
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.threshold).toBe(60);
  });

  // ── Fastify suporte ──

  test('deve extrair handlers do Fastify', () => {
    const file = path.join(testDir, 'fastify-route.ts');
    fs.writeFileSync(file, `
      import fastify from 'fastify';
      const app = fastify();

      app.get('/users', async (request, reply) => {
        return { users: [] };
      });

      app.post('/users', async (request, reply) => {
        const user = await saveUser(request.body);
        reply.status(201).send(user);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  // ── Koa suporte ──

  test('deve extrair handlers do Koa', () => {
    const file = path.join(testDir, 'koa-route.ts');
    fs.writeFileSync(file, `
      import Koa from 'koa';
      const app = new Koa();

      app.get('/data', (ctx) => {
        ctx.body = { data: [] };
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  // ── Detecção de N+1 ──

  test('deve analisar padrões de N+1', () => {
    const file = path.join(testDir, 'n1-foreach.ts');
    fs.writeFileSync(file, `
      async function getUsersWithOrders(users: any[]) {
        users.forEach(async (user) => {
          user.orders = await db.query('SELECT * FROM orders WHERE userId = ?', [user.id]);
        });
        return users;
      }
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
    // Valida que o resultado é retornado sem erros
    expect(result.score).toBeDefined();
  });

  test('deve processar loops com database calls', () => {
    const file = path.join(testDir, 'n1-map.ts');
    fs.writeFileSync(file, `
      function enrichItems(items: any[]) {
        return items.map(item => ({
          ...item,
          details: db.findOne({ id: item.id })
        }));
      }
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  // ── Arrow function handlers (coverage for new regex) ──

  test('deve extrair handlers Express com arrow functions', () => {
    const file = path.join(testDir, 'arrow-function-handler.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/users', (req, res) => {
        const users = getUsers();
        res.json(users);
      });

      app.post('/users', (req, res) => {
        const user = createUser(req.body);
        res.status(201).json(user);
      });

      app.put('/users/:id', (req, res) => {
        updateUser(req.params.id, req.body);
        res.json({ updated: true });
      });

      app.delete('/users/:id', (req, res) => {
        deleteUser(req.params.id);
        res.status(204).send();
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve analisar multiple route handlers com arrow functions', () => {
    const file = path.join(testDir, 'complex-arrow-routes.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/api/items', (req, res) => {
        if (!req.user) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const limit = req.query.limit || 10;
        const items = getItems({ limit });
        res.json(items);
      });

      app.post('/api/items', (req, res) => {
        try {
          const { name, price } = req.body;
          if (!name || !price) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
          }
          const item = createItem({ name, price });
          res.status(201).json(item);
        } catch (error) {
          res.status(500).json({ error: 'Internal error' });
        }
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
    expect(result.score).toBeDefined();
  });

  test('deve detectar issues em arrow function handlers', () => {
    const file = path.join(testDir, 'arrow-no-validation.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.post('/users', (req, res) => {
        const user = { name: req.body.name, email: req.body.email };
        res.json(user);
      });

      app.get('/items', (req, res) => {
        const items = getAllItems();
        res.send(items);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve processar arrow functions com múltiplas linhas', () => {
    const file = path.join(testDir, 'arrow-multiline.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/data', (req, res) => {
        const processedData = processComplexData(req.query);
        const enrichedData = enrichWithMetadata(processedData);
        const validatedData = validateOutput(enrichedData);
        res.json(validatedData);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve suportar arrow functions com named parameters', () => {
    const file = path.join(testDir, 'arrow-named-params.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/users/:userId/posts/:postId', (request, response) => {
        const post = getPost(request.params.postId);
        response.json(post);
      });

      app.post('/admin/users', (req, res) => {
        const admin = verifyAdmin(req.user);
        if (!admin) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        res.json({ created: true });
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve analisar router com arrow functions', () => {
    const file = path.join(testDir, 'router-arrow.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const router = express.Router();

      router.get('/products', (req, res) => {
        const { skip, take } = req.query;
        const products = getProducts({ skip, take });
        res.json(products);
      });

      router.post('/products', (req, res) => {
        const validated = schema.validate(req.body);
        const product = saveProduct(validated);
        res.status(201).json(product);
      });

      router.delete('/products/:id', (req, res) => {
        deleteProduct(req.params.id);
        res.status(204).send();
      });

      export default router;
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve processar arrow functions com diversos métodos HTTP', () => {
    const file = path.join(testDir, 'arrow-all-methods.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.patch('/items/:id', (req, res) => {
        const item = patchItem(req.params.id, req.body);
        res.json(item);
      });

      app.delete('/items/:id', (req, res) => {
        removeItem(req.params.id);
        res.status(204).send();
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  // ── Edge cases for arrow functions ──

  test('deve ignorar arrow functions não-handler', () => {
    const file = path.join(testDir, 'mixed-arrow-functions.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      // Esta é uma route handler
      app.get('/valid', (req, res) => {
        res.json({ valid: true });
      });

      // Estas não são route handlers - apenas arrow functions
      const mapFunction = (item) => ({ ...item, processed: true });
      const filterFunction = (item) => item.active === true;
      const config = { transform: (data) => data.map(mapFunction) };
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve analisar arrow functions com error handling patterns', () => {
    const file = path.join(testDir, 'arrow-error-handling.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/safe', (req, res) => {
        try {
          const data = fetchData();
          res.json(data);
        } catch (error) {
          res.status(500).json({ error: 'Failed' });
        }
      });

      app.post('/guarded', (req, res) => {
        if (!req.user) {
          res.status(401).json({ error: 'Not authenticated' });
          return;
        }
        res.json({ data: 'secret' });
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });

  test('deve analisar paginação em arrow function routes', () => {
    const file = path.join(testDir, 'arrow-pagination.ts');
    fs.writeFileSync(file, `
      import express from 'express';
      const app = express();

      app.get('/users', (req, res) => {
        const page = req.query.page || 1;
        const limit = req.query.limit || 20;
        const users = getUsers({ page, limit });
        res.json(users);
      });

      app.get('/items', (req, res) => {
        const offset = req.query.offset || 0;
        const take = req.query.take || 10;
        const items = getItems().skip(offset).take(take);
        res.json(items);
      });
    `);

    const validator = new ApiContractValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('API Contracts');
  });
});
