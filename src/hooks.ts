import * as fs from 'fs';
import * as path from 'path';

/**
 * Gerenciador de Git hooks para o Sentinel.
 *
 * Instala/remove hooks no diretório .git/hooks do projeto.
 * Suporta pre-commit e pre-push hooks que executam o Sentinel
 * automaticamente antes de commits e pushes.
 */
export class HookManager {
  private readonly hooksDir: string;
  private readonly gitDir: string;

  constructor(projectDir: string) {
    this.gitDir = path.join(projectDir, '.git');
    this.hooksDir = path.join(this.gitDir, 'hooks');
  }

  /** Verifica se o diretório é um repositório git */
  isGitRepo(): boolean {
    return fs.existsSync(this.gitDir);
  }

  /** Instala o hook de pre-commit */
  installPreCommit(options?: HookOptions): InstallResult {
    return this.installHook('pre-commit', this.generatePreCommitScript(options));
  }

  /** Instala o hook de pre-push */
  installPrePush(options?: HookOptions): InstallResult {
    return this.installHook('pre-push', this.generatePrePushScript(options));
  }

  /** Instala ambos os hooks */
  installAll(options?: HookOptions): { preCommit: InstallResult; prePush: InstallResult } {
    return {
      preCommit: this.installPreCommit(options),
      prePush: this.installPrePush(options),
    };
  }

  /** Remove um hook instalado pelo Sentinel */
  remove(hookName: string): boolean {
    const hookPath = path.join(this.hooksDir, hookName);

    if (!fs.existsSync(hookPath)) return false;

    const content = fs.readFileSync(hookPath, 'utf-8');
    if (!content.includes('sentinel')) return false;

    fs.unlinkSync(hookPath);
    return true;
  }

  /** Remove todos os hooks do Sentinel */
  removeAll(): { preCommit: boolean; prePush: boolean } {
    return {
      preCommit: this.remove('pre-commit'),
      prePush: this.remove('pre-push'),
    };
  }

  /** Verifica se um hook específico está instalado */
  isInstalled(hookName: string): boolean {
    const hookPath = path.join(this.hooksDir, hookName);
    if (!fs.existsSync(hookPath)) return false;

    const content = fs.readFileSync(hookPath, 'utf-8');
    return content.includes('sentinel');
  }

  /** Lista hooks instalados pelo Sentinel */
  listInstalled(): string[] {
    const hooks = ['pre-commit', 'pre-push'];
    return hooks.filter(h => this.isInstalled(h));
  }

  /** Instala um hook genérico */
  private installHook(hookName: string, script: string): InstallResult {
    if (!this.isGitRepo()) {
      return { success: false, message: 'Diretório não é um repositório git' };
    }

    // Criar diretório hooks se não existir
    if (!fs.existsSync(this.hooksDir)) {
      fs.mkdirSync(this.hooksDir, { recursive: true });
    }

    const hookPath = path.join(this.hooksDir, hookName);

    // Verificar se já existe hook não-sentinel
    if (fs.existsSync(hookPath)) {
      const existing = fs.readFileSync(hookPath, 'utf-8');
      if (!existing.includes('sentinel')) {
        return {
          success: false,
          message: `Hook ${hookName} já existe e não foi criado pelo Sentinel. Use --force para sobrescrever.`,
        };
      }
    }

    fs.writeFileSync(hookPath, script, { mode: 0o755 });
    return { success: true, message: `Hook ${hookName} instalado com sucesso` };
  }

  /** Gera script do pre-commit hook */
  private generatePreCommitScript(options?: HookOptions): string {
    const threshold = options?.testingThreshold ?? 80;
    const severity = options?.minSeverity ?? 'warning';
    const security = options?.securityLevel ?? 'strict';

    return `#!/bin/sh
# Sentinel Method — pre-commit hook
# Instalado automaticamente. Remova com: sentinel hooks --remove

echo "🛡️  Sentinel: validando antes do commit..."

npx sentinel validate . -t ${threshold} -s ${security} --min-severity ${severity} --json > /dev/null 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "❌ Sentinel: quality gate FALHOU. Corrija os problemas antes de commitar."
  echo "   Execute 'npx sentinel validate' para ver detalhes."
  exit 1
fi

echo "✅ Sentinel: quality gate OK"
exit 0
`;
  }

  /** Gera script do pre-push hook */
  private generatePrePushScript(options?: HookOptions): string {
    const threshold = options?.testingThreshold ?? 80;
    const security = options?.securityLevel ?? 'strict';

    return `#!/bin/sh
# Sentinel Method — pre-push hook
# Instalado automaticamente. Remova com: sentinel hooks --remove

echo "🛡️  Sentinel: validação completa antes do push..."

npx sentinel validate . -t ${threshold} -s ${security}
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ Sentinel: quality gate FALHOU. Push bloqueado."
  exit 1
fi

echo "✅ Sentinel: quality gate OK — push liberado"
exit 0
`;
  }
}

export interface HookOptions {
  testingThreshold?: number;
  securityLevel?: string;
  minSeverity?: string;
}

export interface InstallResult {
  success: boolean;
  message: string;
}
