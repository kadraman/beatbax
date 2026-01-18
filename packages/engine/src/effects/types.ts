export type EffectParams = Array<string | number>;

export type EffectHandler = (ctx: any, nodes: any[], params: EffectParams, start: number, dur: number, chId?: number, tickSeconds?: number) => void;

export interface EffectRegistry {
  register: (name: string, handler: EffectHandler) => void;
  get: (name: string) => EffectHandler | undefined;
  clearEffectState: () => void;
}
