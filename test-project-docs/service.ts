
/** Serviço principal da aplicação */
export class AppService {
  /** Retorna saudação */
  greet(): string { return 'hi'; }
}

/** Soma dois valores */
export function add(a: number, b: number): number {
  return a + b;
}
    