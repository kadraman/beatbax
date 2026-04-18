import { EffectHandler, EffectRegistry } from './types.js';
export declare const register: (name: string, handler: EffectHandler) => void;
export declare const get: (name: string) => EffectHandler | undefined;
export declare const clearEffectState: () => void;
export declare const registryAPI: EffectRegistry;
export default registryAPI;
//# sourceMappingURL=index.d.ts.map