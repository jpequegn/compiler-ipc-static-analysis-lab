import { greet } from 'legacy-api';

export const broken: number = 'intentional type error';

export async function demo() {
  console.log(greet());
  eval('1 + 1');
  await fetch('/synthetic');
  try {
    await fetch('/protected');
  } catch {
    return 'offline';
  }
}
