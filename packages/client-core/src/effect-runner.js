/**
 * 中文：Reducer effect 执行器（平台通过 handlers 注入副作用实现）。
 * EN: Reducer effect runner (platform injects side-effect handlers).
 */

export function runReducerEffects(effects, handlers) {
  for (const effect of effects || []) {
    const fn = handlers?.[effect.type];
    if (typeof fn === 'function') {
      fn(effect);
    }
  }
}
