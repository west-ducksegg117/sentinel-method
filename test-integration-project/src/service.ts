
/** Serviço principal da aplicação */
export class AppService {
  /** Soma dois valores */
  add(first: number, second: number): number {
    return first + second;
  }
}

/** Utilitário de formatação */
export function formatName(name: string): string {
  return name.trim().toLowerCase();
}
