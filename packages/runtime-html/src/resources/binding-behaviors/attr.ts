import { LifecycleFlags, PropertyBinding, bindingBehavior } from '@aurelia/runtime';
import { DataAttributeAccessor } from '../../observation/data-attribute-accessor.js';

import type { Scope } from '@aurelia/runtime';

@bindingBehavior('attr')
export class AttrBindingBehavior {
  public bind(flags: LifecycleFlags, _scope: Scope, _hostScope: Scope | null, binding: PropertyBinding): void {
    binding.targetObserver = new DataAttributeAccessor(
      flags,
      binding.target as HTMLElement,
      binding.targetProperty,
    );
  }

  public unbind(flags: LifecycleFlags, _scope: Scope, _hostScope: Scope | null, binding: PropertyBinding): void {
    return;
  }
}
