import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from './types';

export class ConfigLoader {
  private readonly defaultConfig: SentinelConfig = {
    testingThreshold: 80,
    securityLevel: 'strict',
    performanceTarget: 'optimal',
    maintainabilityScore: 75,
    excludePatterns: ['node_modules', 'dist', 'coverage'],
    reporters: ['console', 'json'],
    failOnWarnings: false,
  };

  load(configPath?: string): SentinelConfig {
    if (configPath && fs.existsSync(configPath)) {
      return this.loadFromFile(configPath);
    }

    return this.loadFromDefaults();
  }

  private loadFromFile(filePath: string): SentinelConfig {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content) as SentinelConfig;
      return { ...this.defaultConfig, ...config };
    } catch (error) {
      console.warn(`Failed to load config from ${filePath}, using defaults`);
      return this.defaultConfig;
    }
  }

  private loadFromDefaults(): SentinelConfig {
    const cwd = process.cwd();
    const rcPath = path.join(cwd, '.sentinelrc.json');

    if (fs.existsSync(rcPath)) {
      return this.loadFromFile(rcPath);
    }

    return this.defaultConfig;
  }

  validate(config: SentinelConfig): boolean {
    if (!Number.isInteger(config.testingThreshold) || config.testingThreshold < 0 || config.testingThreshold > 100) {
      throw new Error('testingThreshold must be between 0 and 100');
    }

    if (!['strict', 'moderate', 'permissive'].includes(config.securityLevel)) {
      throw new Error('securityLevel must be strict, moderate, or permissive');
    }

    if (!['optimal', 'good', 'acceptable'].includes(config.performanceTarget)) {
      throw new Error('performanceTarget must be optimal, good, or acceptable');
    }

    if (!Number.isInteger(config.maintainabilityScore) || config.maintainabilityScore < 0 || config.maintainabilityScore > 100) {
      throw new Error('maintainabilityScore must be between 0 and 100');
    }

    return true;
  }
}
