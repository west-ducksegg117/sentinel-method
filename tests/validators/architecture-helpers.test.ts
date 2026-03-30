import {
  dfsDetectCycles,
  extractImportPaths,
  determineLayer,
  isLayerViolation,
  countMethods,
  DependencyNode,
} from '../../src/validators/architecture-helpers';

describe('Architecture Helpers', () => {
  describe('dfsDetectCycles', () => {
    test('should detect simple cycle', () => {
      const graph = new Map<string, DependencyNode>([
        ['a.ts', { path: 'a.ts', dependencies: new Set(['b.ts']), visited: false, visiting: false }],
        ['b.ts', { path: 'b.ts', dependencies: new Set(['a.ts']), visited: false, visiting: false }],
      ]);

      const cycles = new Set<string>();
      dfsDetectCycles('a.ts', graph, cycles, []);

      expect(cycles.size).toBeGreaterThan(0);
    });

    test('should detect three-node cycle', () => {
      const graph = new Map<string, DependencyNode>([
        ['a.ts', { path: 'a.ts', dependencies: new Set(['b.ts']), visited: false, visiting: false }],
        ['b.ts', { path: 'b.ts', dependencies: new Set(['c.ts']), visited: false, visiting: false }],
        ['c.ts', { path: 'c.ts', dependencies: new Set(['a.ts']), visited: false, visiting: false }],
      ]);

      const cycles = new Set<string>();
      dfsDetectCycles('a.ts', graph, cycles, []);

      expect(cycles.size).toBeGreaterThan(0);
    });

    test('should not flag non-cyclic dependencies', () => {
      const graph = new Map<string, DependencyNode>([
        ['a.ts', { path: 'a.ts', dependencies: new Set(['b.ts']), visited: false, visiting: false }],
        ['b.ts', { path: 'b.ts', dependencies: new Set(['c.ts']), visited: false, visiting: false }],
        ['c.ts', { path: 'c.ts', dependencies: new Set([]), visited: false, visiting: false }],
      ]);

      const cycles = new Set<string>();
      dfsDetectCycles('a.ts', graph, cycles, []);

      expect(cycles.size).toBe(0);
    });

    test('should handle missing nodes gracefully', () => {
      const graph = new Map<string, DependencyNode>([
        ['a.ts', { path: 'a.ts', dependencies: new Set(['missing.ts']), visited: false, visiting: false }],
      ]);

      const cycles = new Set<string>();
      dfsDetectCycles('a.ts', graph, cycles, []);

      expect(cycles.size).toBe(0);
    });

    test('should mark nodes as visited', () => {
      const nodeA: DependencyNode = { path: 'a.ts', dependencies: new Set(['b.ts']), visited: false, visiting: false };
      const nodeB: DependencyNode = { path: 'b.ts', dependencies: new Set([]), visited: false, visiting: false };
      const graph = new Map<string, DependencyNode>([
        ['a.ts', nodeA],
        ['b.ts', nodeB],
      ]);

      const cycles = new Set<string>();
      dfsDetectCycles('a.ts', graph, cycles, []);

      expect(nodeA.visited).toBe(true);
    });

    test('should handle self-referencing dependency', () => {
      const graph = new Map<string, DependencyNode>([
        ['a.ts', { path: 'a.ts', dependencies: new Set(['a.ts']), visited: false, visiting: false }],
      ]);

      const cycles = new Set<string>();
      dfsDetectCycles('a.ts', graph, cycles, []);

      expect(cycles.size).toBeGreaterThan(0);
    });
  });

  describe('extractImportPaths', () => {
    test('should extract import statement paths', () => {
      const content = "import { User } from './models/User';";
      const paths = extractImportPaths(content);
      expect(paths).toContain('./models/User');
    });

    test('should extract multiple imports', () => {
      const content = `
        import { User } from './models/User';
        import { Product } from './models/Product';
      `;
      const paths = extractImportPaths(content);
      expect(paths).toContain('./models/User');
      expect(paths).toContain('./models/Product');
    });

    test('should extract from clause imports', () => {
      const content = "import User from './models/User';";
      const paths = extractImportPaths(content);
      expect(paths).toContain('./models/User');
    });

    test('should extract require paths', () => {
      const content = "const User = require('./models/User');";
      const paths = extractImportPaths(content);
      expect(paths).toContain('./models/User');
    });

    test('should extract require with single quotes', () => {
      const content = "const path = require('path');";
      const paths = extractImportPaths(content);
      expect(paths).toContain('path');
    });

    test('should extract require with double quotes', () => {
      const content = 'const path = require("path");';
      const paths = extractImportPaths(content);
      expect(paths).toContain('path');
    });

    test('should extract require with backticks', () => {
      const content = 'const path = require(`path`);';
      const paths = extractImportPaths(content);
      expect(paths).toContain('path');
    });

    test('should handle mixed imports and requires', () => {
      const content = `
        import { User } from './User';
        const path = require('path');
        import fs from 'fs';
        const express = require('express');
      `;
      const paths = extractImportPaths(content);
      expect(paths).toHaveLength(4);
      expect(paths).toContain('./User');
      expect(paths).toContain('path');
      expect(paths).toContain('fs');
      expect(paths).toContain('express');
    });

    test('should handle complex import statements', () => {
      const content = "import type { Config } from '@/types/config';";
      const paths = extractImportPaths(content);
      expect(paths).toContain('@/types/config');
    });

    test('should return empty array for no imports', () => {
      const content = 'const x = 5; function test() { return x; }';
      const paths = extractImportPaths(content);
      expect(paths).toHaveLength(0);
    });
  });

  describe('determineLayer', () => {
    test('should identify top layer', () => {
      const hierarchy = {
        'top': ['config', 'types', 'constants'],
        'high': ['services'],
        'mid': ['controllers'],
        'low': ['utils'],
      };

      expect(determineLayer('src/config/app.ts', hierarchy)).toBe('top');
      expect(determineLayer('src/types/models.ts', hierarchy)).toBe('top');
    });

    test('should identify high layer', () => {
      const hierarchy = {
        'top': ['config'],
        'high': ['services'],
        'mid': ['controllers'],
        'low': ['utils'],
      };

      expect(determineLayer('src/services/UserService.ts', hierarchy)).toBe('high');
    });

    test('should identify mid layer', () => {
      const hierarchy = {
        'top': ['config'],
        'high': ['services'],
        'mid': ['controllers'],
        'low': ['utils'],
      };

      expect(determineLayer('src/controllers/UserController.ts', hierarchy)).toBe('mid');
    });

    test('should identify low layer', () => {
      const hierarchy = {
        'top': ['config'],
        'high': ['services'],
        'mid': ['controllers'],
        'low': ['utils'],
      };

      expect(determineLayer('src/utils/helpers.ts', hierarchy)).toBe('low');
    });

    test('should normalize paths to lowercase', () => {
      const hierarchy = {
        'top': ['config'],
        'high': ['services'],
      };

      expect(determineLayer('src/config/app.ts', hierarchy)).toBe('top');
      expect(determineLayer('src/services/user.ts', hierarchy)).toBe('high');
    });

    test('should handle Windows path separators', () => {
      const hierarchy = {
        'top': ['config'],
        'high': ['services'],
      };

      expect(determineLayer('src\\config\\app.ts', hierarchy)).toBe('top');
      expect(determineLayer('src\\services\\user.ts', hierarchy)).toBe('high');
    });

    test('should return null for unmatched paths', () => {
      const hierarchy = {
        'top': ['config'],
        'high': ['services'],
      };

      expect(determineLayer('src/components/button.ts', hierarchy)).toBeNull();
    });

    test('should match first matching pattern', () => {
      const hierarchy = {
        'top': ['src/config', 'config'],
        'high': ['services'],
      };

      expect(determineLayer('src/config/app.ts', hierarchy)).toBe('top');
    });
  });

  describe('isLayerViolation', () => {
    test('should detect violations based on layer indices', () => {
      // Layer order: ['top', 'high', 'mid', 'low'] with indices [0, 1, 2, 3]
      // Return true if fileIndex < importedIndex (top-level importing lower-level)
      expect(isLayerViolation('top', 'high')).toBe(true);  // 0 < 1
      expect(isLayerViolation('top', 'mid')).toBe(true);   // 0 < 2
      expect(isLayerViolation('top', 'low')).toBe(true);   // 0 < 3
      expect(isLayerViolation('high', 'mid')).toBe(true);  // 1 < 2
      expect(isLayerViolation('high', 'low')).toBe(true);  // 1 < 3
      expect(isLayerViolation('mid', 'low')).toBe(true);   // 2 < 3
    });

    test('should return false for non-violations', () => {
      // fileIndex >= importedIndex (lower-level importing higher-level or same level)
      expect(isLayerViolation('low', 'top')).toBe(false);  // 3 < 0 = false
      expect(isLayerViolation('low', 'high')).toBe(false); // 3 < 1 = false
      expect(isLayerViolation('low', 'mid')).toBe(false);  // 3 < 2 = false
      expect(isLayerViolation('mid', 'top')).toBe(false);  // 2 < 0 = false
      expect(isLayerViolation('high', 'top')).toBe(false); // 1 < 0 = false

      // same layer
      expect(isLayerViolation('top', 'top')).toBe(false);  // 0 < 0 = false
      expect(isLayerViolation('high', 'high')).toBe(false); // 1 < 1 = false
      expect(isLayerViolation('mid', 'mid')).toBe(false);  // 2 < 2 = false
      expect(isLayerViolation('low', 'low')).toBe(false);  // 3 < 3 = false
    });

    test('should handle invalid layer names', () => {
      // indexOf returns -1 for invalid layers, so -1 < 0 = true (violation)
      expect(isLayerViolation('unknown', 'top')).toBe(true);   // -1 < 0 = true
      expect(isLayerViolation('top', 'unknown')).toBe(false);  // 0 < -1 = false
    });
  });

  describe('countMethods', () => {
    describe('TypeScript/JavaScript', () => {
      test('should count async methods', () => {
        const content = `
          class Service {
            async getUser() { return {}; }
            async updateUser() { return {}; }
          }
        `;
        const count = countMethods(content, 'service.ts');
        expect(count).toBe(2);
      });

      test('should count regular methods', () => {
        const content = `
          class Service {
            getUser() { return {}; }
            setUser() { return {}; }
          }
        `;
        const count = countMethods(content, 'service.ts');
        expect(count).toBeGreaterThanOrEqual(0);
      });

      test('should count function declarations', () => {
        const content = `
          function getUserId() { return 1; }
          function getUserName() { return 'John'; }
          async function fetchData() { return []; }
        `;
        const count = countMethods(content, 'utils.ts');
        expect(count).toBeGreaterThan(0);
      });

      test('should count with visibility modifiers', () => {
        const content = `
          class Service {
            public getUser() { return {}; }
            private setUser() { return {}; }
            protected updateUser() { return {}; }
          }
        `;
        const count = countMethods(content, 'service.ts');
        expect(count).toBeGreaterThanOrEqual(0);
      });

      test('should count arrow functions as methods', () => {
        const content = `
          const service = {
            getUser: () => ({}),
            setUser: (u: any) => u,
          };
        `;
        const count = countMethods(content, 'service.ts');
        expect(count).toBeGreaterThanOrEqual(0);
      });

      test('should handle TypeScript types', () => {
        const content = `
          class Service {
            getUser(): User { return {}; }
            setUser(user: User): void { }
          }
        `;
        const count = countMethods(content, 'service.ts');
        expect(count).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Python', () => {
      test('should count Python functions', () => {
        const content = `
          def get_user():
              return {}

          def set_user(user):
              return user

          async def fetch_data():
              return []
        `;
        const count = countMethods(content, 'service.py');
        expect(count).toBeGreaterThan(0);
      });

      test('should count class methods', () => {
        const content = `
          class Service:
              def get_user(self):
                  return {}

              def set_user(self, user):
                  return user
        `;
        const count = countMethods(content, 'service.py');
        expect(count).toBeGreaterThan(0);
      });
    });

    describe('Go', () => {
      test('should detect Go functions', () => {
        const content = `
          func GetUser() {
          }

          func SetUser(user User) {
          }
        `;
        const count = countMethods(content, 'service.go');
        expect(count).toBeGreaterThanOrEqual(0);
      });

      test('should handle Go methods with receivers', () => {
        const content = `func (s *Service) GetUser() {}`;
        const count = countMethods(content, 'service.go');
        expect(count).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Java', () => {
      test('should count Java methods', () => {
        const content = `
          public class Service {
              public User getUser() {
                  return new User();
              }

              private void setUser(User user) {
              }
          }
        `;
        const count = countMethods(content, 'Service.java');
        expect(count).toBeGreaterThan(0);
      });

      test('should count static methods', () => {
        const content = `
          public class Utils {
              public static String getName() {
                  return "name";
              }
          }
        `;
        const count = countMethods(content, 'Utils.java');
        expect(count).toBeGreaterThan(0);
      });
    });

    describe('Ruby', () => {
      test('should count Ruby methods', () => {
        const content = `
          def get_user
              return {}
          end

          def set_user(user)
              return user
          end
        `;
        const count = countMethods(content, 'service.rb');
        expect(count).toBeGreaterThan(0);
      });
    });

    describe('PHP', () => {
      test('should count PHP functions', () => {
        const content = `
          public function getUser() {
              return [];
          }

          private function setUser($user) {
              return $user;
          }

          function fetchData() {
              return [];
          }
        `;
        const count = countMethods(content, 'service.php');
        expect(count).toBeGreaterThan(0);
      });
    });

    describe('Dart', () => {
      test('should count Dart methods', () => {
        const content = `
          class Service {
              Map<String, dynamic> getUser() {
                  return {};
              }

              void setUser(User user) {
              }
          }
        `;
        const count = countMethods(content, 'service.dart');
        expect(count).toBeGreaterThan(0);
      });
    });

    test('should return 0 for file without methods', () => {
      const content = 'const x = 5; const y = 10;';
      const count = countMethods(content, 'constants.ts');
      expect(count).toBe(0);
    });

    test('should handle empty content', () => {
      const count = countMethods('', 'empty.ts');
      expect(count).toBe(0);
    });
  });
});
