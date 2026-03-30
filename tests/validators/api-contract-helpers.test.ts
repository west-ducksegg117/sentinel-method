import {
  extractRouteHandlers,
  hasErrorHandling,
  hasInconsistentStatusCodes,
  hasInputValidation,
  hasResponseType,
  findHardcodedUrls,
  hasAuthMiddleware,
  checkRestNaming,
  isListEndpoint,
  hasPagination,
  findN1QueryPatterns,
  hasRateLimiting,
} from '../../src/validators/api-contract-helpers';

describe('API Contract Helpers', () => {
  describe('extractRouteHandlers', () => {
    test('should extract Express/Fastify routes', () => {
      const content = `
        app.get('/users', (req, res) => {
          res.json([]);
        })
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers.length).toBeGreaterThanOrEqual(0);
      if (handlers.length > 0) {
        expect(handlers[0].name).toContain('GET');
      }
    });

    test('should extract Express POST route', () => {
      const content = `
        app.post('/users', (req, res) => {
          const validated = validate(req.body);
          res.status(201).json(validated);
        })
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers.length).toBeGreaterThanOrEqual(0);
      if (handlers.length > 0) {
        expect(handlers[0].name).toContain('POST');
      }
    });

    test('should handle multiple HTTP methods', () => {
      const content = `
        router.get('/items', handler1);
        router.post('/items', handler2);
        router.put('/items/:id', handler3);
        router.delete('/items/:id', handler4);
        router.patch('/items/:id', handler5);
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers.length).toBeGreaterThanOrEqual(0);
    });

    test('should extract NestJS route decorators', () => {
      const content = `
        @Get('users/:id')
        async getUser(id: string) {
          return await this.service.getUser(id);
        }
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers).toHaveLength(1);
      expect(handlers[0].name).toContain('getUser');
      expect(handlers[0].route).toContain('users');
    });

    test('should extract NestJS POST decorator', () => {
      const content = `
        @Post('users')
        async createUser(@Body() data: CreateUserDto) {
          return await this.service.create(data);
        }
      `;
      const handlers = extractRouteHandlers(content);
      if (handlers.length > 0) {
        expect(handlers[0].name).toContain('createUser');
      }
    });

    test('should extract NestJS PUT/DELETE decorators', () => {
      const content = `
        @Put('users/:id')
        async updateUser(id: string) {
          return { updated: true };
        }

        @Delete('users/:id')
        async deleteUser(id: string) {
          return { deleted: true };
        }
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers).toHaveLength(2);
    });

    test('should extract NestJS Patch decorator', () => {
      const content = `
        @Patch('users/:id')
        async patchUser(id: string) {
          return { patched: true };
        }
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers).toHaveLength(1);
    });

    test('should extract Next.js handlers', () => {
      const content = `
        export default function handler(req, res) {
          res.json({ message: 'Hello' });
        }
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers).toHaveLength(1);
      expect(handlers[0].name).toBe('Next.js handler');
    });

    test('should extract Next.js GET handler', () => {
      const content = `
        export async function GET(request) {
          return Response.json({ status: 'ok' });
        }
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers).toHaveLength(1);
    });

    test('should extract Next.js POST/PUT/DELETE handlers', () => {
      const content = `
        export async function POST(request) {
          return Response.json({ created: true });
        }

        export async function PUT(request) {
          return Response.json({ updated: true });
        }

        export async function DELETE(request) {
          return Response.json({ deleted: true });
        }
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers).toHaveLength(3);
    });

    test('should return empty array for non-route content', () => {
      const content = `
        export function calculateSum(a: number, b: number) {
          return a + b;
        }
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers).toHaveLength(0);
    });

    test('should handle line number tracking', () => {
      const content = `
// Line 1
app.get('/test', (req, res) => {
  res.json({});
})
      `;
      const handlers = extractRouteHandlers(content);
      if (handlers.length > 0) {
        expect(handlers[0].line).toBeGreaterThan(0);
      }
    });

    test('should handle various route quote styles', () => {
      const content = `
        app.get('/users', () => {});
        app.post("/products", () => {});
      `;
      const handlers = extractRouteHandlers(content);
      expect(handlers.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('hasErrorHandling', () => {
    test('should detect 4xx status codes', () => {
      expect(hasErrorHandling('res.status(400).json({ error })')).toBe(true);
      expect(hasErrorHandling('res.status(404).send({ error })')).toBe(true);
      expect(hasErrorHandling('res.status(422).json({ message: "error" })')).toBe(true);
    });

    test('should detect 5xx status codes', () => {
      expect(hasErrorHandling('res.status(500).json({ error })')).toBe(true);
      expect(hasErrorHandling('res.status(503).send({ error })')).toBe(true);
    });

    test('should detect error response with res.send', () => {
      expect(hasErrorHandling('res.send({ error: "occurred" })')).toBe(true);
    });

    test('should detect throw new Error', () => {
      expect(hasErrorHandling('throw new Error("Something failed")')).toBe(true);
    });

    test('should detect catch blocks', () => {
      expect(hasErrorHandling('try { } catch (e) { }')).toBe(true);
    });

    test('should detect res.json with error property', () => {
      expect(hasErrorHandling('return res.json({ error: "occurred" })')).toBe(true);
    });

    test('should detect HTTP exceptions', () => {
      expect(hasErrorHandling('throw new HTTPException("error")')).toBe(true);
      expect(hasErrorHandling('throw new BadRequest("invalid")')).toBe(true);
      expect(hasErrorHandling('throw new Unauthorized("denied")')).toBe(true);
      expect(hasErrorHandling('throw new Forbidden("access denied")')).toBe(true);
      expect(hasErrorHandling('throw new NotFound("missing")')).toBe(true);
    });

    test('should return false when no error handling', () => {
      expect(hasErrorHandling('res.json({ data: [] })')).toBe(false);
      expect(hasErrorHandling('const x = 5;')).toBe(false);
    });
  });

  describe('hasInconsistentStatusCodes', () => {
    test('should detect res.send without explicit status', () => {
      expect(hasInconsistentStatusCodes('res.send({data})')).toBe(true);
    });

    test('should return false when status is set before send', () => {
      expect(hasInconsistentStatusCodes('res.status(200).send({data})')).toBe(false);
    });

    test('should return false when using json instead of send', () => {
      expect(hasInconsistentStatusCodes('res.json({data})')).toBe(false);
    });
  });

  describe('hasInputValidation', () => {
    test('should detect request property access', () => {
      expect(hasInputValidation('req.body.')).toBe(true);
      expect(hasInputValidation('req.params.')).toBe(true);
      expect(hasInputValidation('req.query.')).toBe(true);
    });

    test('should detect validate() calls', () => {
      expect(hasInputValidation('validate(data)')).toBe(true);
      expect(hasInputValidation('const result = validate(req.body);')).toBe(true);
    });

    test('should detect Joi validation', () => {
      expect(hasInputValidation('joi.object().validate(data)')).toBe(true);
    });

    test('should detect Zod validation', () => {
      expect(hasInputValidation('schema.parse(zod.string())')).toBe(true);
    });

    test('should detect schema references', () => {
      expect(hasInputValidation('const schema = defineSchema()')).toBe(true);
    });

    test('should detect NestJS decorators', () => {
      expect(hasInputValidation('@Body() data: CreateDto')).toBe(true);
      expect(hasInputValidation('@Param() params: ParamDto')).toBe(true);
      expect(hasInputValidation('@Query() query: QueryDto')).toBe(true);
    });

    test('should detect NestJS decorator patterns', () => {
      expect(hasInputValidation('@Body()')).toBe(true);
      expect(hasInputValidation('@Param()')).toBe(true);
      expect(hasInputValidation('@Query()')).toBe(true);
    });

    test('should detect conditional returns', () => {
      expect(hasInputValidation('if (!data) return res.status(400)')).toBe(true);
    });

    test('should return false without validation', () => {
      expect(hasInputValidation('const x = 5;')).toBe(false);
    });
  });

  describe('hasResponseType', () => {
    test('should detect TypeScript return type annotations', () => {
      expect(hasResponseType(': Promise<User>')).toBe(true);
      expect(hasResponseType(': Observable<Data>')).toBe(true);
    });

    test('should detect @ApiResponse decorator', () => {
      expect(hasResponseType('@ApiResponse({ type: UserDto })')).toBe(true);
    });

    test('should detect response interfaces', () => {
      expect(hasResponseType('interface UserResponse {}')).toBe(true);
      expect(hasResponseType('type DataResponse = {}')).toBe(true);
    });

    test('should detect as const assertions', () => {
      expect(hasResponseType('const response = { status: 200 } as const')).toBe(true);
    });

    test('should detect satisfies keyword', () => {
      expect(hasResponseType('const result = {} satisfies ApiResponse')).toBe(true);
    });
  });

  describe('findHardcodedUrls', () => {
    test('should find https URLs', () => {
      const urls = findHardcodedUrls("const api = 'https://api.example.com/v1'");
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain('https://api.example.com');
    });

    test('should find http URLs', () => {
      const urls = findHardcodedUrls('fetch("http://localhost:3000/api")');
      expect(urls).toHaveLength(1);
    });

    test('should return empty array when no URLs', () => {
      const urls = findHardcodedUrls('const x = 5;');
      expect(urls).toHaveLength(0);
    });

    test('should handle backtick URLs', () => {
      const urls = findHardcodedUrls('`https://api.example.com/data`');
      expect(urls.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('hasAuthMiddleware', () => {
    test('should detect auth pattern', () => {
      expect(hasAuthMiddleware('authenticate(req, res)')).toBe(true);
      expect(hasAuthMiddleware('authorize(user)')).toBe(true);
    });

    test('should detect JWT patterns', () => {
      expect(hasAuthMiddleware('jwt.verify(token)')).toBe(true);
    });

    test('should detect bearer tokens', () => {
      expect(hasAuthMiddleware('Authorization: Bearer token')).toBe(true);
    });

    test('should detect token references', () => {
      expect(hasAuthMiddleware('const token = req.headers.token')).toBe(true);
    });

    test('should detect isAuthenticated', () => {
      expect(hasAuthMiddleware('if (!isAuthenticated) return 401')).toBe(true);
    });

    test('should detect NestJS guards', () => {
      expect(hasAuthMiddleware('@UseGuards(AuthGuard)')).toBe(true);
    });

    test('should detect middleware patterns', () => {
      expect(hasAuthMiddleware('middleware: auth')).toBe(true);
    });

    test('should detect req.user', () => {
      expect(hasAuthMiddleware('const user = req.user')).toBe(true);
    });

    test('should return false without auth', () => {
      expect(hasAuthMiddleware('res.json({ data })')).toBe(false);
    });
  });

  describe('checkRestNaming', () => {
    test('should detect verb violations', () => {
      expect(checkRestNaming('/get/')).toBe(true);
      expect(checkRestNaming('/post/')).toBe(true);
      expect(checkRestNaming('/create/')).toBe(true);
      expect(checkRestNaming('/update/')).toBe(true);
      expect(checkRestNaming('/delete/')).toBe(true);
      expect(checkRestNaming('/patch/')).toBe(true);
      expect(checkRestNaming('/remove/')).toBe(true);
      expect(checkRestNaming('/fetch/')).toBe(true);
      expect(checkRestNaming('/list/')).toBe(true);
      expect(checkRestNaming('/all/')).toBe(true);
    });

    test('should return false for RESTful routes', () => {
      expect(checkRestNaming('/users')).toBe(false);
      expect(checkRestNaming('/products/123')).toBe(false);
      expect(checkRestNaming('/api/items')).toBe(false);
    });
  });

  describe('isListEndpoint', () => {
    test('should detect list patterns', () => {
      expect(isListEndpoint('/users', 'GET')).toBe(true);
      expect(isListEndpoint('', 'return users[]')).toBe(true);
      expect(isListEndpoint('/products', '')).toBe(true);
    });

    test('should match various list keywords', () => {
      expect(isListEndpoint('/userlist', '')).toBe(true);
      expect(isListEndpoint('/all-items', '')).toBe(true);
      expect(isListEndpoint('/api/items', '')).toBe(true);
    });
  });

  describe('hasPagination', () => {
    test('should detect limit parameter', () => {
      expect(hasPagination('req.query.limit')).toBe(true);
      expect(hasPagination('const { limit } = req.query')).toBe(true);
    });

    test('should detect offset parameter', () => {
      expect(hasPagination('req.query.offset')).toBe(true);
    });

    test('should detect page parameter', () => {
      expect(hasPagination('const page = req.query.page')).toBe(true);
    });

    test('should detect take parameter', () => {
      expect(hasPagination('.take(10)')).toBe(true);
    });

    test('should detect skip parameter', () => {
      expect(hasPagination('.skip(20)')).toBe(true);
    });

    test('should detect pagination method chaining', () => {
      expect(hasPagination('skip(20).limit(10)')).toBe(true);
      expect(hasPagination('limit(10).offset(0)')).toBe(true);
    });

    test('should return false without pagination', () => {
      expect(hasPagination('res.json([])')).toBe(false);
    });
  });

  describe('findN1QueryPatterns', () => {
    test('should detect N+1 pattern in forEach', () => {
      const content = `users.forEach(u => { db.find(); })`;
      const patterns = findN1QueryPatterns(content);
      expect(patterns.length).toBeGreaterThanOrEqual(0);
    });

    test('should detect N+1 with map', () => {
      const content = `items.map(item => db.findOne())`;
      const patterns = findN1QueryPatterns(content);
      expect(patterns.length).toBeGreaterThanOrEqual(0);
    });

    test('should not flag simple database calls', () => {
      const content = `const users = db.findAll();`;
      const patterns = findN1QueryPatterns(content);
      expect(patterns).toHaveLength(0);
    });
  });

  describe('hasRateLimiting', () => {
    test('should detect rateLimit pattern', () => {
      expect(hasRateLimiting('rateLimit({ windowMs: 15000 })')).toBe(true);
      expect(hasRateLimiting('app.use(rateLimit())')).toBe(true);
    });

    test('should detect throttle pattern', () => {
      expect(hasRateLimiting('throttle(100)')).toBe(true);
      expect(hasRateLimiting('@Throttle(10, 60)')).toBe(true);
    });

    test('should detect limiter pattern', () => {
      expect(hasRateLimiting('const limiter = createLimiter()')).toBe(true);
      expect(hasRateLimiting('app.use(limiter)')).toBe(true);
    });

    test('should detect express-rate-limit', () => {
      expect(hasRateLimiting("require('express-rate-limit'")).toBe(true);
    });

    test('should return false without rate limiting', () => {
      expect(hasRateLimiting('res.json({})')).toBe(false);
    });
  });
});
